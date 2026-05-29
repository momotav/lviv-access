import express from 'express';
import { query } from '../db/pool.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const VALID_CATEGORIES = ['ramp', 'toilet', 'charging', 'entrance', 'transport'];

// Helper: shape a points row + its aggregate review rating + photos
async function enrichPoint(row) {
  // Aggregate review rating (replaces the single creation-time rating if reviews exist)
  const reviewsAgg = await query(
    `SELECT COUNT(*)::int AS review_count, AVG(rating)::float AS avg_rating
     FROM reviews WHERE point_id = $1`,
    [row.id]
  );
  const photos = await query(
    'SELECT id, url, created_at FROM photos WHERE point_id = $1 ORDER BY created_at ASC',
    [row.id]
  );

  const { review_count, avg_rating } = reviewsAgg.rows[0];

  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    created_at: row.created_at,
    created_by_web_user: row.created_by_web_user,
    created_by_telegram: row.created_by_telegram,
    // The "rating" returned to the client is either the average of reviews,
    // or the original creation-time rating if there are no reviews yet.
    accessibility_rating: review_count > 0
      ? Math.round(avg_rating * 10) / 10
      : row.accessibility_rating,
    review_count,
    photo_urls: photos.rows.map((p) => p.url),
  };
}

// GET /api/points — list all (no auth needed)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { category, bbox } = req.query;
    const conditions = [];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (bbox) {
      const parts = bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        params.push(minLng, maxLng, minLat, maxLat);
        const i = params.length;
        conditions.push(
          `lng BETWEEN $${i - 3} AND $${i - 2} AND lat BETWEEN $${i - 1} AND $${i}`
        );
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT id, category, name, description, lat, lng, accessibility_rating,
              created_by_web_user, created_by_telegram, created_at
       FROM points ${where}
       ORDER BY created_at DESC`,
      params
    );

    const enriched = await Promise.all(result.rows.map(enrichPoint));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/points/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, category, name, description, lat, lng, accessibility_rating,
              created_by_web_user, created_by_telegram, created_at
       FROM points WHERE id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }
    res.json(await enrichPoint(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/points — must be authenticated
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { category, name, description, lat, lng, accessibility_rating, photo_urls } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Valid lat and lng are required' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordinates out of valid range' });
    }
    const rating = accessibility_rating ? parseInt(accessibility_rating, 10) : null;
    if (rating !== null && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const result = await query(
      `INSERT INTO points (category, name, description, lat, lng, accessibility_rating, created_by_web_user)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, category, name, description, lat, lng, accessibility_rating,
                 created_by_web_user, created_by_telegram, created_at`,
      [category, name.trim(), description?.trim() || null, lat, lng, rating, req.user.id]
    );

    const point = result.rows[0];

    // Attach photo URLs, if any provided
    if (Array.isArray(photo_urls) && photo_urls.length > 0) {
      for (const url of photo_urls.slice(0, 5)) { // cap at 5 photos
        if (typeof url === 'string' && url.length < 500) {
          await query(
            'INSERT INTO photos (point_id, url, uploaded_by_web) VALUES ($1, $2, $3)',
            [point.id, url, req.user.id]
          );
        }
      }
    }

    res.status(201).json(await enrichPoint(point));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/points/:id — must be authenticated AND the creator
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT created_by_web_user FROM points WHERE id = $1',
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }
    if (result.rows[0].created_by_web_user !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete points you created' });
    }

    await query('DELETE FROM points WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
