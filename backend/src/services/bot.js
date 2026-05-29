/**
 * Telegram bot — Lviv Access
 *
 * Commands:
 *   /start    Welcome + brief tutorial
 *   /help     List commands
 *   /find     Find points near user's location, with "Build route" buttons
 *   /add      Multi-step: location → category → name → description → photo → rating
 *   /cancel   Cancel current /add flow
 *
 * The /add flow now includes an optional photo step. Telegram users are
 * tracked by chat_id; points they add carry `created_by_telegram = chat_id`.
 *
 * Photos are stored on Cloudinary. The bot downloads the photo from
 * Telegram's CDN, uploads to Cloudinary via the unsigned upload preset
 * (with API key), and stores the resulting URL in the `photos` table.
 */

import { Telegraf, Markup } from 'telegraf';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { haversineMeters } from './geo.js';

const CATEGORY_LABELS = {
  ramp: '♿ Ramp',
  toilet: '🚻 Accessible WC',
  charging: '🔌 Charging point',
  entrance: '🚪 Accessible entrance',
  transport: '🚊 Low-floor transit',
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

/**
 * Upload a Telegram-hosted photo to Cloudinary.
 * Returns the secure_url on success, or null on failure.
 */
async function uploadToCloudinary(telegramFileUrl) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('Cloudinary not configured — skipping photo upload');
    return null;
  }

  try {
    // Fetch the photo bytes from Telegram
    const res = await fetch(telegramFileUrl);
    if (!res.ok) throw new Error(`Telegram file fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Build signed Cloudinary upload request
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
    console.error('Photo upload failed:', err.message);
    return null;
  }
}

export function createBot(token) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    await ctx.reply(
      `👋 Welcome to *Lviv Access*\n\n` +
      `I help map accessibility features around Lviv — ramps, accessible toilets, charging points, low-floor transit stops.\n\n` +
      `*Commands:*\n` +
      `/find — find accessibility points near you\n` +
      `/add — add a new point to the map (with optional photo)\n` +
      `/help — show this menu again\n\n` +
      `Full map: ${WEB_URL}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      `*Available commands:*\n\n` +
      `/find — share your location, I'll list nearby accessibility points\n` +
      `/add — start adding a new point (I'll ask you step by step)\n` +
      `/cancel — abort the current /add\n\n` +
      `Map: ${WEB_URL}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('cancel', async (ctx) => {
    if (addState.has(ctx.chat.id)) {
      addState.delete(ctx.chat.id);
      await ctx.reply('❌ Cancelled. Send /add to start again.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  });

  bot.command('find', async (ctx) => {
    addState.delete(ctx.chat.id);
    await ctx.reply(
      '📍 Send me your location and I\'ll find the nearest accessibility points.\n\n' +
      'On Telegram mobile: tap the 📎 attachment icon → Location → Send My Current Location.',
      Markup.keyboard([Markup.button.locationRequest('📍 Send my location')])
        .oneTime()
        .resize()
    );
    addState.set(ctx.chat.id, { step: 'find-location' });
  });

  bot.command('add', async (ctx) => {
    addState.set(ctx.chat.id, {
      step: 'location',
      data: { photo_urls: [] },
    });
    await ctx.reply(
      '✏️ *Adding a new accessibility point.*\n\n' +
      'Step 1/6 — send me the *location* of the point.\n\n' +
      'On mobile: 📎 → Location → Send. Or send /cancel to abort.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([Markup.button.locationRequest('📍 Send location')])
          .oneTime()
          .resize(),
      }
    );
  });

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
        '✅ Location received.\n\n*Step 2/6 — pick a category:*',
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
      'Received a location, but I wasn\'t expecting one. Send /find or /add first.'
    );
  });

  bot.action(/^cat:(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'category') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    const category = ctx.match[1];
    state.data.category = category;
    state.step = 'name';

    await ctx.answerCbQuery(`✅ ${CATEGORY_LABELS[category]}`);
    await ctx.editMessageText(
      `✅ Category: *${CATEGORY_LABELS[category]}*`,
      { parse_mode: 'Markdown' }
    );
    await ctx.reply(
      '*Step 3/6 — what\'s the name of this point?*\n\n' +
      'e.g., "Ramp at Lviv Opera House" or "Toilet at Forum Lviv"',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action(/^rate:([1-5]|skip)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'rating') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    const choice = ctx.match[1];
    state.data.rating = choice === 'skip' ? null : parseInt(choice, 10);

    await ctx.answerCbQuery(
      choice === 'skip' ? 'Skipped' : `${'★'.repeat(parseInt(choice, 10))}`
    );
    await ctx.editMessageText(
      choice === 'skip'
        ? '✅ Rating: skipped'
        : `✅ Rating: ${'★'.repeat(parseInt(choice, 10))}${'☆'.repeat(5 - parseInt(choice, 10))}`
    );
    await savePoint(ctx, state.data);
    addState.delete(chatId);
  });

  bot.action('desc:skip', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'description') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    state.data.description = null;
    state.step = 'photo';
    await ctx.answerCbQuery('Skipped');
    await ctx.editMessageText('✅ Description: skipped');
    await askForPhoto(ctx);
  });

  // ============================================================
  // NEW: Photo step
  // ============================================================
  bot.action('photo:skip', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    state.step = 'rating';
    await ctx.answerCbQuery('Skipped');
    await ctx.editMessageText('✅ Photo: skipped');
    await askForRating(ctx);
  });

  bot.action('photo:done', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    state.step = 'rating';
    await ctx.answerCbQuery('OK');
    await ctx.editMessageText(`✅ Photos uploaded: ${state.data.photo_urls.length}`);
    await askForRating(ctx);
  });

  // Handle incoming photo
  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'photo') {
      await ctx.reply('I\'m not expecting a photo right now. Send /add to start.');
      return;
    }
    if (state.data.photo_urls.length >= 3) {
      await ctx.reply('Maximum 3 photos. Tap "Done" or "Skip" when ready.');
      return;
    }

    await ctx.reply('📤 Uploading photo…');

    // Pick the highest-resolution version
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];

    try {
      const fileLink = await ctx.telegram.getFileLink(best.file_id);
      const url = await uploadToCloudinary(fileLink.toString());

      if (url) {
        state.data.photo_urls.push(url);
        await ctx.reply(
          `✅ Photo ${state.data.photo_urls.length}/3 uploaded.` +
          (state.data.photo_urls.length < 3
            ? ' Send another, or tap "Done" / "Skip":'
            : ' Maximum reached — tap "Done":'),
          Markup.inlineKeyboard([
            [Markup.button.callback('Done — add point', 'photo:done')],
            [Markup.button.callback('Skip the rest', 'photo:skip')],
          ])
        );
      } else {
        await ctx.reply(
          '⚠️ Photo upload failed. You can try sending it again, or skip:',
          Markup.inlineKeyboard([
            [Markup.button.callback('Skip photos', 'photo:skip')],
          ])
        );
      }
    } catch (err) {
      console.error('Photo handling error:', err);
      await ctx.reply(
        '⚠️ Sorry, something went wrong with the photo. Skip and continue?',
        Markup.inlineKeyboard([
          [Markup.button.callback('Skip photos', 'photo:skip')],
        ])
      );
    }
  });

  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const state = addState.get(chatId);

    if (!state) {
      await ctx.reply(
        '🤔 I\'m not sure what to do with that. Try /find or /add. Send /help for the full list.'
      );
      return;
    }

    const text = ctx.message.text.trim();

    if (state.step === 'name') {
      if (text.length < 2 || text.length > 200) {
        await ctx.reply('Name should be 2-200 characters. Try again, or /cancel.');
        return;
      }
      state.data.name = text;
      state.step = 'description';
      await ctx.reply(
        '*Step 4/6 — optional description.*\n\n' +
        'Send a short description (e.g., "Wooden ramp at side entrance, fits a standard wheelchair").\n' +
        'Or skip:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            Markup.button.callback('Skip description', 'desc:skip'),
          ]),
        }
      );
      return;
    }

    if (state.step === 'description') {
      if (text.length > 1000) {
        await ctx.reply('Description is too long (max 1000 chars). Try again, or skip.');
        return;
      }
      state.data.description = text;
      state.step = 'photo';
      await askForPhoto(ctx);
      return;
    }

    await ctx.reply(
      'I\'m waiting for a different kind of input. Send /cancel to start over.'
    );
  });

  bot.catch((err, ctx) => {
    console.error('Bot error for update', ctx.update.update_id, err);
    ctx.reply('Something went wrong. Please try /cancel and try again.').catch(() => {});
  });

  return bot;
}

// ====================================================================
// HELPERS
// ====================================================================

async function askForPhoto(ctx) {
  const cloudinaryReady = !!process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudinaryReady) {
    // Skip photo step entirely if Cloudinary isn't configured
    const state = addState.get(ctx.chat.id);
    if (state) state.step = 'rating';
    await askForRating(ctx);
    return;
  }

  await ctx.reply(
    '*Step 5/6 — optional photos.*\n\n' +
    'Send up to 3 photos of this point (one at a time). Or skip:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Skip photos', 'photo:skip')],
      ]),
    }
  );
}

async function askForRating(ctx) {
  await ctx.reply(
    '*Step 6/6 — accessibility rating (optional).*\n\n' +
    'How accessible is this point, on a scale of 1-5?',
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
        [Markup.button.callback('Skip rating', 'rate:skip')],
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

    // Attach photos uploaded earlier
    for (const url of (data.photo_urls || [])) {
      await query(
        `INSERT INTO photos (point_id, url, uploaded_by_tg)
         VALUES ($1, $2, $3)`,
        [pointId, url, telegramId]
      );
    }

    const ratingStr = data.rating
      ? `${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}`
      : 'not rated';

    const photoNote = (data.photo_urls || []).length > 0
      ? `📸 Photos: ${data.photo_urls.length}\n`
      : '';

    const routeUrl = buildRouteUrl({ to: { lat: data.lat, lng: data.lng } });

    await ctx.reply(
      `🎉 *Saved!*\n\n` +
      `*${data.name}*\n` +
      `${CATEGORY_LABELS[data.category]}\n` +
      `📍 ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}\n` +
      `Rating: ${ratingStr}\n` +
      photoNote,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🗺️ Build route here', routeUrl)],
          [Markup.button.url('Open map', WEB_URL)],
        ]),
      }
    );
  } catch (err) {
    console.error('Failed to save point:', err);
    await ctx.reply('❌ Failed to save the point. Please try again later.');
  }
}

async function handleFindNearby(ctx, lat, lng) {
  try {
    const result = await query(
      `SELECT id, category, name, description, lat, lng, accessibility_rating
       FROM points`
    );

    if (result.rows.length === 0) {
      await ctx.reply('No accessibility points in the database yet.');
      return;
    }

    const scored = result.rows
      .map((p) => ({ ...p, distance: haversineMeters(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    await ctx.reply(
      `*Nearest accessibility points* (from your location):`,
      { parse_mode: 'Markdown' }
    );

    for (let i = 0; i < scored.length; i++) {
      const p = scored[i];
      const distStr = p.distance < 1000
        ? `${Math.round(p.distance)} m`
        : `${(p.distance / 1000).toFixed(1)} km`;
      const ratingStr = p.accessibility_rating
        ? '\n' + '★'.repeat(p.accessibility_rating) +
          '☆'.repeat(5 - p.accessibility_rating)
        : '';
      const descStr = p.description
        ? `\n_${p.description.length > 120
            ? p.description.substring(0, 117) + '…'
            : p.description}_`
        : '';

      const routeUrl = buildRouteUrl({
        from: { lat, lng },
        to: { lat: p.lat, lng: p.lng },
      });

      await ctx.reply(
        `${i + 1}. ${CATEGORY_LABELS[p.category] || p.category}\n` +
        `*${p.name}* — ${distStr}` +
        ratingStr +
        descStr,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('🗺️ Build route here', routeUrl)],
          ]),
        }
      );
    }
  } catch (err) {
    console.error('Find nearby failed:', err);
    await ctx.reply('Failed to look up points. Please try again later.');
  }
}
