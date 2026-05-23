console.log('=== Boot start ===');
console.log('Node version:', process.version);
console.log('PORT env:', process.env.PORT);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('ORS_API_KEY set:', !!process.env.ORS_API_KEY);
console.log('TELEGRAM_BOT_TOKEN set:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('NODE_ENV:', process.env.NODE_ENV);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import pointsRouter from './routes/points.js';
import routeRouter from './routes/route.js';
import { createBotRouter } from './routes/bot.js';
import { initDb } from './db/migrate.js';
import { createBot } from './services/bot.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/points', pointsRouter);
app.use('/api/route', routeRouter);

// ============================================================
// Telegram bot wiring
// ============================================================
const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (botToken) {
  try {
    bot = createBot(botToken);
    app.use('/api/bot', createBotRouter(bot));
    console.log('🤖 Telegram bot wired at /api/bot/webhook');
  } catch (err) {
    console.error('Failed to initialize Telegram bot:', err.message);
  }
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start HTTP server FIRST, then DB and webhook in background
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
});

initDb().catch((err) => {
  console.error('⚠️ Database init failed:', err.message);
});

// Register webhook with Telegram once we know our public URL
if (bot && process.env.PUBLIC_URL) {
  const webhookUrl = `${process.env.PUBLIC_URL}/api/bot/webhook`;
  bot.telegram
    .setWebhook(webhookUrl)
    .then(() => console.log(`✅ Telegram webhook registered: ${webhookUrl}`))
    .catch((err) => console.error('⚠️ Failed to register webhook:', err.message));
}

// Graceful shutdown
process.once('SIGINT', () => bot?.stop('SIGINT'));
process.once('SIGTERM', () => bot?.stop('SIGTERM'));
