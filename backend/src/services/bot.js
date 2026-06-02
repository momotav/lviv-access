/**
 * Telegram-бот — Lviv Access
 *
 * Команди:
 *   /start    Привітання + коротка інструкція
 *   /help     Список команд
 *   /find     Знайти найближчі точки доступності + кнопки маршруту
 *   /add      Покрокове додавання: локація → категорія → назва →
 *             опис → фото → оцінка
 *   /cancel   Скасувати поточне /add
 *
 * При показі точок у /find:
 *   - 0 фото → одне текстове повідомлення з кнопкою маршруту
 *   - 1 фото → sendPhoto з підписом і кнопкою
 *   - 2+ фото → sendMediaGroup (галерея), потім окреме повідомлення
 *     з кнопкою маршруту
 */

import { Telegraf, Markup } from 'telegraf';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { haversineMeters } from './geo.js';

const CATEGORY_LABELS = {
  ramp:      '♿ Пандус',
  toilet:    '🚻 Доступний туалет',
  charging:  '🔌 Зарядна станція',
  entrance:  '🚪 Доступний вхід',
  transport: '🚊 Низькопідлоговий транспорт',
};

const addState = new Map();

const WEB_URL = process.env.WEB_URL || 'https://lviv-access.vercel.app';

function buildRouteUrl({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.set('from', `${from.lat},${from.lng}`);
  if (to) params.set('to', `${to.lat},${to.lng}`);
  const qs = params.toString();
  return qs ? `${WEB_URL}/?${qs}` : WEB_URL;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

function ratingStars(rating) {
  if (!rating) return '';
  const r = Math.round(Number(rating));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

/**
 * Завантажує фото з Telegram CDN у Cloudinary.
 * Повертає secure_url або null.
 */
async function uploadToCloudinary(telegramFileUrl) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('Cloudinary не налаштовано — пропускаю завантаження фото');
    return null;
  }

  try {
    const res = await fetch(telegramFileUrl);
    if (!res.ok) throw new Error(`Telegram file fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const folder = 'lviv-access';
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    const form = new FormData();
    form.append('file', new Blob([buffer]), 'photo.jpg');
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: form }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Cloudinary upload ${uploadRes.status}: ${text.substring(0, 200)}`);
    }
    const data = await uploadRes.json();
    return data.secure_url || null;
  } catch (err) {
    console.error('Помилка завантаження фото:', err.message);
    return null;
  }
}

export function createBot(token) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не встановлено');

  const bot = new Telegraf(token);

  // ============================================================
  // /start
  // ============================================================
  bot.start(async (ctx) => {
    await ctx.reply(
      `👋 Вітаємо у *Lviv Access*\n\n` +
      `Безбар\u02bc\u0454рна карта Львова — пандуси, доступні туалети, зарядні станції, низькопідлоговий транспорт та інші точки доступності.\n\n` +
      `*Команди:*\n` +
      `/find — знайти точки поряд із вами\n` +
      `/add — додати нову точку (з фото)\n` +
      `/help — показати це меню\n\n` +
      `🌐 Повна карта: ${WEB_URL}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // /help
  // ============================================================
  bot.help(async (ctx) => {
    await ctx.reply(
      `*Доступні команди:*\n\n` +
      `📍 /find — поділіться локацією, я покажу найближчі точки доступності\n` +
      `✏️ /add — почати додавання нової точки (запитаю покроково)\n` +
      `❌ /cancel — скасувати поточне додавання\n\n` +
      `🌐 Карта: ${WEB_URL}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // /cancel
  // ============================================================
  bot.command('cancel', async (ctx) => {
    if (addState.has(ctx.chat.id)) {
      addState.delete(ctx.chat.id);
      await ctx.reply('❌ Скасовано. Надішліть /add, щоб почати знову.');
    } else {
      await ctx.reply('Немає чого скасовувати.');
    }
  });

  // ============================================================
  // /find
  // ============================================================
  bot.command('find', async (ctx) => {
    addState.delete(ctx.chat.id);
    await ctx.reply(
      '📍 Надішліть свою локацію, і я знайду найближчі точки доступності.\n\n' +
      '_На мобільному:_ натисніть 📎 → Локація → Надіслати поточну локацію.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([Markup.button.locationRequest('📍 Надіслати локацію')])
          .oneTime()
          .resize(),
      }
    );
    addState.set(ctx.chat.id, { step: 'find-location' });
  });

  // ============================================================
  // /add
  // ============================================================
  bot.command('add', async (ctx) => {
    addState.set(ctx.chat.id, {
      step: 'location',
      data: { photo_urls: [] },
    });
    await ctx.reply(
      '✏️ *Додавання нової точки доступності*\n\n' +
      '*Крок 1/6* — надішліть *локацію* точки.\n\n' +
      '_На мобільному:_ 📎 → Локація → Надіслати. Або /cancel для скасування.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([Markup.button.locationRequest('📍 Надіслати локацію')])
          .oneTime()
          .resize(),
      }
    );
  });

  // ============================================================
  // Обробка локацій
  // ============================================================
  bot.on('location', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    const { latitude: lat, longitude: lng } = ctx.message.location;

    if (state?.step === 'find-location') {
      addState.delete(chatId);
      await handleFindNearby(ctx, lat, lng);
      return;
    }

    if (state?.step === 'location') {
      state.data.lat = lat;
      state.data.lng = lng;
      state.step = 'category';

      await ctx.reply(
        '✅ Локацію отримано.\n\n*Крок 2/6 — оберіть категорію:*',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(CATEGORY_LABELS.ramp, 'cat:ramp')],
            [Markup.button.callback(CATEGORY_LABELS.toilet, 'cat:toilet')],
            [Markup.button.callback(CATEGORY_LABELS.charging, 'cat:charging')],
            [Markup.button.callback(CATEGORY_LABELS.entrance, 'cat:entrance')],
            [Markup.button.callback(CATEGORY_LABELS.transport, 'cat:transport')],
          ]),
        }
      );
      return;
    }

    await ctx.reply(
      'Локацію отримано, але я її не очікував. Спочатку надішліть /find або /add.'
    );
  });

  // ============================================================
  // Вибір категорії
  // ============================================================
  bot.action(/^cat:(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'category') {
      await ctx.answerCbQuery('Ця кнопка вже неактивна.');
      return;
    }
    const category = ctx.match[1];
    state.data.category = category;
    state.step = 'name';

    await ctx.answerCbQuery(`✅ ${CATEGORY_LABELS[category]}`);
    await ctx.editMessageText(
      `✅ Категорія: *${CATEGORY_LABELS[category]}*`,
      { parse_mode: 'Markdown' }
    );
    await ctx.reply(
      '*Крок 3/6 — назва точки.*\n\n' +
      '_Наприклад:_ «Пандус біля Львівської опери», «Туалет у Forum Lviv»',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // Оцінка
  // ============================================================
  bot.action(/^rate:([1-5]|skip)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'rating') {
      await ctx.answerCbQuery('Ця кнопка вже неактивна.');
      return;
    }
    const choice = ctx.match[1];
    state.data.rating = choice === 'skip' ? null : parseInt(choice, 10);

    await ctx.answerCbQuery(
      choice === 'skip' ? 'Пропущено' : ratingStars(parseInt(choice, 10))
    );
    await ctx.editMessageText(
      choice === 'skip'
        ? '✅ Оцінка: пропущено'
        : `✅ Оцінка: ${ratingStars(parseInt(choice, 10))}`
    );
    await savePoint(ctx, state.data);
    addState.delete(chatId);
  });

  // ============================================================
  // Пропуск опису
  // ============================================================
  bot.action('desc:skip', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'description') {
      await ctx.answerCbQuery('Ця кнопка вже неактивна.');
      return;
    }
    state.data.description = null;
    state.step = 'photo';
    await ctx.answerCbQuery('Пропущено');
    await ctx.editMessageText('✅ Опис: пропущено');
    await askForPhoto(ctx);
  });

  // ============================================================
  // Етап фото
  // ============================================================
  bot.action('photo:skip', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.answerCbQuery('Ця кнопка вже неактивна.');
      return;
    }
    state.step = 'rating';
    await ctx.answerCbQuery('Пропущено');
    await ctx.editMessageText('✅ Фото: пропущено');
    await askForRating(ctx);
  });

  bot.action('photo:done', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.answerCbQuery('Ця кнопка вже неактивна.');
      return;
    }
    state.step = 'rating';
    await ctx.answerCbQuery('OK');
    await ctx.editMessageText(`✅ Завантажено фото: ${state.data.photo_urls.length}`);
    await askForRating(ctx);
  });

  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.reply('Зараз я не очікую фото. Надішліть /add, щоб почати.');
      return;
    }
    if (state.data.photo_urls.length >= 3) {
      await ctx.reply('Максимум 3 фото. Натисніть «Готово» або «Пропустити».');
      return;
    }

    await ctx.reply('📤 Завантажую фото…');

    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];

    try {
      const fileLink = await ctx.telegram.getFileLink(best.file_id);
      const url = await uploadToCloudinary(fileLink.toString());

      if (url) {
        state.data.photo_urls.push(url);
        await ctx.reply(
          `✅ Фото ${state.data.photo_urls.length}/3 завантажено.` +
          (state.data.photo_urls.length < 3
            ? ' Надішліть ще або натисніть «Готово» / «Пропустити»:'
            : ' Максимум досягнуто — натисніть «Готово»:'),
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Готово — додати точку', 'photo:done')],
            [Markup.button.callback('⏭ Пропустити решту', 'photo:skip')],
          ])
        );
      } else {
        await ctx.reply(
          '⚠️ Не вдалося завантажити фото. Спробуйте надіслати ще раз або пропустіть:',
          Markup.inlineKeyboard([
            [Markup.button.callback('⏭ Пропустити фото', 'photo:skip')],
          ])
        );
      }
    } catch (err) {
      console.error('Помилка обробки фото:', err);
      await ctx.reply(
        '⚠️ На жаль, сталася помилка з фото. Пропустити та продовжити?',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭ Пропустити фото', 'photo:skip')],
        ])
      );
    }
  });

  // ============================================================
  // Текстові повідомлення
  // ============================================================
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const state = addState.get(chatId);

    if (!state) {
      await ctx.reply(
        '🤔 Я не знаю, що з цим робити. Спробуйте /find або /add. Надішліть /help для повного списку команд.'
      );
      return;
    }

    const text = ctx.message.text.trim();

    if (state.step === 'name') {
      if (text.length < 2 || text.length > 200) {
        await ctx.reply('Назва має містити 2-200 символів. Спробуйте знову або /cancel.');
        return;
      }
      state.data.name = text;
      state.step = 'description';
      await ctx.reply(
        '*Крок 4/6 — опис (необов\u02bcязково).*\n\n' +
        'Надішліть короткий опис (наприклад: «Дерев\u02bcяний пандус біля бокового входу, підходить для стандартного візка»).\n' +
        'Або пропустіть:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            Markup.button.callback('⏭ Пропустити опис', 'desc:skip'),
          ]),
        }
      );
      return;
    }

    if (state.step === 'description') {
      if (text.length > 1000) {
        await ctx.reply('Опис занадто довгий (макс. 1000 символів). Спробуйте знову або пропустіть.');
        return;
      }
      state.data.description = text;
      state.step = 'photo';
      await askForPhoto(ctx);
      return;
    }

    await ctx.reply(
      'Я очікую інший тип даних. Надішліть /cancel, щоб почати знову.'
    );
  });

  bot.catch((err, ctx) => {
    console.error('Помилка бота для оновлення', ctx.update.update_id, err);
    ctx.reply('Щось пішло не так. Спробуйте /cancel і почніть знову.').catch(() => {});
  });

  return bot;
}

// ====================================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// ====================================================================

async function askForPhoto(ctx) {
  const cloudinaryReady = !!process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudinaryReady) {
    const state = addState.get(ctx.chat.id);
    if (state) state.step = 'rating';
    await askForRating(ctx);
    return;
  }

  await ctx.reply(
    '*Крок 5/6 — фотографії (необов\u02bcязково).*\n\n' +
    'Надішліть до 3 фотографій точки (по одній). Або пропустіть:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустити фото', 'photo:skip')],
      ]),
    }
  );
}

async function askForRating(ctx) {
  await ctx.reply(
    '*Крок 6/6 — оцінка доступності (необов\u02bcязково).*\n\n' +
    'Наскільки доступна ця точка за шкалою 1-5?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('★', 'rate:1'),
          Markup.button.callback('★★', 'rate:2'),
          Markup.button.callback('★★★', 'rate:3'),
        ],
        [
          Markup.button.callback('★★★★', 'rate:4'),
          Markup.button.callback('★★★★★', 'rate:5'),
        ],
        [Markup.button.callback('⏭ Пропустити оцінку', 'rate:skip')],
      ]),
    }
  );
}

async function savePoint(ctx, data) {
  try {
    const telegramId = ctx.chat.id;

    const insertResult = await query(
      `INSERT INTO points (category, name, description, lat, lng,
                           accessibility_rating, created_by_telegram)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.category,
        data.name,
        data.description ?? null,
        data.lat,
        data.lng,
        data.rating ?? null,
        telegramId,
      ]
    );

    const pointId = insertResult.rows[0].id;

    for (const url of (data.photo_urls || [])) {
      await query(
        `INSERT INTO photos (point_id, url, uploaded_by_tg)
         VALUES ($1, $2, $3)`,
        [pointId, url, telegramId]
      );
    }

    const ratingStr = data.rating ? ratingStars(data.rating) : 'не оцінено';

    const photoNote = (data.photo_urls || []).length > 0
      ? `📸 Фото: ${data.photo_urls.length}\n`
      : '';

    const routeUrl = buildRouteUrl({ to: { lat: data.lat, lng: data.lng } });

    await ctx.reply(
      `🎉 *Збережено!*\n\n` +
      `*${data.name}*\n` +
      `${CATEGORY_LABELS[data.category]}\n` +
      `📍 ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}\n` +
      `Оцінка: ${ratingStr}\n` +
      photoNote,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🗺️ Побудувати маршрут сюди', routeUrl)],
          [Markup.button.url('🌐 Відкрити карту', WEB_URL)],
        ]),
      }
    );
  } catch (err) {
    console.error('Не вдалося зберегти точку:', err);
    await ctx.reply('❌ Не вдалося зберегти точку. Спробуйте пізніше.');
  }
}

// ====================================================================
// /find — пошук найближчих точок з фото
// ====================================================================

async function handleFindNearby(ctx, lat, lng) {
  try {
    // Тягнемо точки разом з їх фото одним запитом
    const result = await query(
      `SELECT p.id, p.category, p.name, p.description,
              p.lat, p.lng, p.accessibility_rating,
              COALESCE(
                (SELECT array_agg(url ORDER BY created_at ASC)
                 FROM photos WHERE point_id = p.id),
                '{}'::text[]
              ) AS photo_urls
       FROM points p`
    );

    if (result.rows.length === 0) {
      await ctx.reply('Поки що немає точок доступності у базі.');
      return;
    }

    const scored = result.rows
      .map((p) => ({ ...p, distance: haversineMeters(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    await ctx.reply(
      `*Найближчі точки доступності* від вашої локації:`,
      { parse_mode: 'Markdown' }
    );

    for (let i = 0; i < scored.length; i++) {
      const p = scored[i];
      await sendPointCard(ctx, p, i + 1, lat, lng);
    }
  } catch (err) {
    console.error('Помилка пошуку:', err);
    await ctx.reply('Не вдалося отримати точки. Спробуйте пізніше.');
  }
}

/**
 * Надсилає картку однієї точки в /find.
 *
 *   0 фото → одне текстове повідомлення з кнопкою маршруту
 *   1 фото → sendPhoto з підписом + кнопка
 *   2+ фото → sendMediaGroup (галерея) + окреме текстове повідомлення з кнопкою
 *
 * (Telegram не дозволяє inline-кнопки на mediaGroup, тому 2+ фото
 * розділяємо на два повідомлення.)
 */
async function sendPointCard(ctx, p, index, userLat, userLng) {
  const distStr = formatDistance(p.distance);
  const categoryLabel = CATEGORY_LABELS[p.category] || p.category;
  const ratingLine = p.accessibility_rating
    ? `\n${ratingStars(p.accessibility_rating)}`
    : '';

  // Стискаємо опис, щоб уміщалось у Telegram caption (1024 chars)
  const trimmedDesc = p.description
    ? (p.description.length > 400
        ? p.description.substring(0, 397) + '…'
        : p.description)
    : '';
  const descLine = trimmedDesc ? `\n\n_${trimmedDesc}_` : '';

  const caption =
    `*${index}. ${p.name}*\n` +
    `${categoryLabel} · ${distStr}` +
    ratingLine +
    descLine;

  const routeUrl = buildRouteUrl({
    from: { lat: userLat, lng: userLng },
    to: { lat: p.lat, lng: p.lng },
  });

  const routeButton = Markup.inlineKeyboard([
    [Markup.button.url('🗺️ Побудувати маршрут сюди', routeUrl)],
  ]);

  const photos = p.photo_urls || [];

  // === 0 фото: просте текстове повідомлення ===
  if (photos.length === 0) {
    await ctx.reply(caption, {
      parse_mode: 'Markdown',
      ...routeButton,
    });
    return;
  }

  // === 1 фото: sendPhoto з підписом і кнопкою ===
  if (photos.length === 1) {
    try {
      await ctx.replyWithPhoto(photos[0], {
        caption,
        parse_mode: 'Markdown',
        ...routeButton,
      });
    } catch (err) {
      // Якщо фото не доступне (404, expired CDN тощо) — fallback на текст
      console.error('Помилка надсилання фото:', err.message);
      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        ...routeButton,
      });
    }
    return;
  }

  // === 2+ фото: галерея + окреме повідомлення з кнопкою ===
  try {
    // Перші ДО 10 фото у галереї (Telegram limit). Підпис тільки на першому.
    const mediaGroup = photos.slice(0, 10).map((url, idx) => ({
      type: 'photo',
      media: url,
      ...(idx === 0
        ? { caption, parse_mode: 'Markdown' }
        : {}),
    }));
    await ctx.replyWithMediaGroup(mediaGroup);
    // Окреме повідомлення з кнопкою маршруту
    await ctx.reply(
      `📸 ${photos.length} фото · натисніть, щоб побудувати маршрут:`,
      routeButton
    );
  } catch (err) {
    console.error('Помилка надсилання галереї:', err.message);
    // Fallback на текст
    await ctx.reply(caption, {
      parse_mode: 'Markdown',
      ...routeButton,
    });
  }
}
