/**
 * Bot webhook endpoint.
 *
 * Telegram POSTs every incoming message to this URL. The bot instance
 * (Telegraf) processes the update and responds via the Telegram Bot API.
 *
 * The webhook URL must be registered with Telegram once on boot.
 */

import express from 'express';

export function createBotRouter(bot) {
  const router = express.Router();

  // Telegraf provides a ready-to-mount middleware for webhooks.
  router.use(bot.webhookCallback('/webhook'));

  return router;
}
