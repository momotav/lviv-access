/**
 * Telegram bot — Lviv Access
 *
 * Implements the same actions as the web app, but as conversational
 * Telegram commands. Uses the same PostgreSQL database as the REST API.
 *
 * Commands:
 *   /start    Welcome + brief tutorial
 *   /help     List commands
 *   /find     "What's near me?" — user shares location, bot returns nearby points
 *             Each result includes a "Build route here" button that opens the
 *             web app pre-filled with the user's location as origin and the
 *             point's location as destination.
 *   /add      Multi-step: location → category → name → description → rating
 *             On success, offers a "Build route here" button for the new point.
 *   /cancel   Cancel current /add flow
 *
 * Identity model: users are identified by Telegram chat ID. No accounts
 * to manage. Each chat has at most one in-progress /add conversation
 * (tracked in memory).
 */

import { Telegraf, Markup } from 'telegraf';
import { query } from '../db/pool.js';
import { haversineMeters } from './geo.js';

const CATEGORY_LABELS = {
  ramp: '♿ Ramp',
  toilet: '🚻 Accessible WC',
  charging: '🔌 Charging point',
  entrance: '🚪 Accessible entrance',
  transport: '🚊 Low-floor transit',
};

// In-memory state for /add conversations.
const addState = new Map();

const WEB_URL = process.env.WEB_URL || 'https://lviv-access.vercel.app';

/**
 * Build a web URL that pre-fills the route panel.
 * Either or both coords may be null; only set the ones we have.
 */
function buildRouteUrl({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.set('from', `${from.lat},${from.lng}`);
  if (to) params.set('to', `${to.lat},${to.lng}`);
  const qs = params.toString();
  return qs ? `${WEB_URL}/?${qs}` : WEB_URL;
}

export function createBot(token) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const bot = new Telegraf(token);

  // ============================================================
  // /start  /help
  // ============================================================
  bot.start(async (ctx) => {
    await ctx.reply(
      `👋 Welcome to *Lviv Access*\n\n` +
      `I help map accessibility features around Lviv — ramps, accessible toilets, charging points, low-floor transit stops.\n\n` +
      `*Commands:*\n` +
      `/find — find accessibility points near you\n` +
      `/add — add a new point to the map\n` +
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

  // ============================================================
  // /cancel
  // ============================================================
  bot.command('cancel', async (ctx) => {
    if (addState.has(ctx.chat.id)) {
      addState.delete(ctx.chat.id);
      await ctx.reply('❌ Cancelled. Send /add to start again.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  });

  // ============================================================
  // /find
  // ============================================================
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

  // ============================================================
  // /add — multi-step
  // ============================================================
  bot.command('add', async (ctx) => {
    addState.set(ctx.chat.id, { step: 'location', data: {} });
    await ctx.reply(
      '✏️ *Adding a new accessibility point.*\n\n' +
      'Step 1/5 — send me the *location* of the point.\n\n' +
      'On mobile: 📎 → Location → Send. Or send /cancel to abort.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([Markup.button.locationRequest('📍 Send location')])
          .oneTime()
          .resize(),
      }
    );
  });

  // ============================================================
  // Location messages
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
        '✅ Location received.\n\n*Step 2/5 — pick a category:*',
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

  // ============================================================
  // Category callback (in /add)
  // ============================================================
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
      '*Step 3/5 — what\'s the name of this point?*\n\n' +
      'e.g., "Ramp at Lviv Opera House" or "Toilet at Forum Lviv"',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // Rating callback
  // ============================================================
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

  // ============================================================
  // Skip description
  // ============================================================
  bot.action('desc:skip', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addState.get(chatId);
    if (!state || state.step !== 'description') {
      await ctx.answerCbQuery('That button is no longer active.');
      return;
    }
    state.data.description = null;
    state.step = 'rating';
    await ctx.answerCbQuery('Skipped');
    await ctx.editMessageText('✅ Description: skipped');
    await askForRating(ctx);
  });

  // ============================================================
  // Text messages — name + description in /add
  // ============================================================
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
        '*Step 4/5 — optional description.*\n\n' +
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
      state.step = 'rating';
      await askForRating(ctx);
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

async function askForRating(ctx) {
  await ctx.reply(
    '*Step 5/5 — accessibility rating (optional).*\n\n' +
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
    await query(
      `INSERT INTO points (category, name, description, lat, lng, accessibility_rating)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.category,
        data.name,
        data.description ?? null,
        data.lat,
        data.lng,
        data.rating ?? null,
      ]
    );

    const ratingStr = data.rating
      ? `${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}`
      : 'not rated';

    // Build a "route to this new point" URL. We don't know the user's
    // origin in this context, so pass only `to` — the user can pick A
    // on the map afterwards, OR open the link later from a fresh /find.
    const routeUrl = buildRouteUrl({ to: { lat: data.lat, lng: data.lng } });

    await ctx.reply(
      `🎉 *Saved!*\n\n` +
      `*${data.name}*\n` +
      `${CATEGORY_LABELS[data.category]}\n` +
      `📍 ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}\n` +
      `Rating: ${ratingStr}`,
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
      .map((p) => ({
        ...p,
        distance: haversineMeters(lat, lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    // Send a header message
    await ctx.reply(
      `*Nearest accessibility points* (from your location):`,
      { parse_mode: 'Markdown' }
    );

    // Send one message per point with its own "Build route here" button.
    // This is necessary because Telegram inline buttons are per-message —
    // we can't put 5 different URL buttons in one message and have them
    // attach to the right text.
    for (let i = 0; i < scored.length; i++) {
      const p = scored[i];
      const distStr =
        p.distance < 1000
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
