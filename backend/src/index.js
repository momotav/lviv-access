console.log('=== Boot start ===');
console.log('Node version:', process.version);
console.log('PORT env:', process.env.PORT);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('ORS_API_KEY set:', !!process.env.ORS_API_KEY);
console.log('NODE_ENV:', process.env.NODE_ENV);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import pointsRouter from './routes/points.js';
import routeRouter from './routes/route.js';
import { initDb } from './db/migrate.js';

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

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start the HTTP server first, init DB in background.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
});

initDb().catch((err) => {
  console.error('⚠️ Database init failed:', err.message);
});
