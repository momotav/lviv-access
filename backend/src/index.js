console.log('=== Boot start ===');
console.log('Node version:', process.version);
console.log('PORT env:', process.env.PORT);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

import express from 'express';
console.log('express loaded');

import cors from 'cors';
console.log('cors loaded');

import dotenv from 'dotenv';
console.log('dotenv loaded');

dotenv.config();
console.log('dotenv configured');

import pointsRouter from './routes/points.js';
console.log('points router loaded');

import { initDb } from './db/migrate.js';
console.log('migrate loaded');

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

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start the HTTP server FIRST, then try the DB.
// This way the health check works even if DB init fails.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
});

// Initialize database in background (won't block server startup)
initDb().catch((err) => {
  console.error('⚠️ Database init failed:', err.message);
  console.error('Server is running but DB-backed routes will fail.');
});
