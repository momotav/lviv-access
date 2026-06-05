/**
 * Photo upload flow (Cloudinary signed direct upload):
 *
 *   1. Frontend calls POST /api/photos/sign  (authenticated)
 *      Backend returns: { cloud_name, api_key, signature, timestamp, folder }
 *
 *   2. Frontend POSTs the file directly to:
 *        https://api.cloudinary.com/v1_1/<cloud_name>/image/upload
 *      with the signature. Cloudinary returns: { secure_url, public_id, ... }
 *
 *   3. Frontend stores secure_url and either:
 *      (a) passes it in `photo_urls` when creating a point (POST /api/points)
 *      (b) attaches to an existing point via POST /api/points/:id/photos
 *
 * Why signed direct upload (instead of proxying through backend):
 *   - Files never touch our server → no bandwidth cost, no memory pressure
 *   - Backend only signs the request, doesn't see image bytes
 *   - Cloudinary handles all CDN, resizing, optimization
 */

import express from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/photos/sign — produce a Cloudinary upload signature
router.post('/sign', requireAuth, async (req, res, next) => {
  try {
    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Photo upload not configured' });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Per Cloudinary docs: only timestamp is signed (simplest valid signed upload).
    // All optional upload parameters (folder, transformations, etc.) must be added
    // to the signed string in alphabetical order if used. We keep this minimal.
    const params = `timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(params + apiSecret)
      .digest('hex');

    res.json({
      cloud_name: cloudName,
      api_key: apiKey,
      signature,
      timestamp,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/points/:id/photos — attach a photo URL to an existing point
router.post('/points/:id/photos', requireAuth, async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || url.length > 500) {
      return res.status(400).json({ error: 'Valid url required' });
    }
    // Optional but nice: reject anything that's not a Cloudinary URL
    if (!url.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ error: 'Only Cloudinary URLs accepted' });
    }

    const pointCheck = await query('SELECT id FROM points WHERE id = $1', [req.params.id]);
    if (pointCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    // Cap each point at 5 photos
    const count = await query(
      'SELECT COUNT(*)::int AS c FROM photos WHERE point_id = $1',
      [req.params.id]
    );
    if (count.rows[0].c >= 5) {
      return res.status(400).json({ error: 'Maximum 5 photos per point' });
    }

    const result = await query(
      `INSERT INTO photos (point_id, url, uploaded_by_web)
       VALUES ($1, $2, $3)
       RETURNING id, url, created_at`,
      [req.params.id, url, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
