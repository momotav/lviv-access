import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

const VALID_CATEGORIES = ['ramp', 'toilet', 'charging', 'entrance', 'transport'];

// GET /api/points - list all points (optionally filter by category, bbox)
router.get('/', async (req, res, next) => {
  try {
    const { category, bbox } = req.query;
    const conditions = [];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (bbox) {
      // bbox format: minLng,minLat,maxLng,maxLat
      const parts = bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        params.push(parts[0], parts[1], parts[2], parts[3]);
        const i = params.length;
        conditions.push(
          `ST_Intersects(location::geometry, ST_MakeEnvelope($${i - 3}, $${i - 2}, $${i - 1}, $${i}, 4326))`
        );
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        id,
        category,
        name,
        description,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        accessibility_rating,
        created_at
      FROM points
      ${where}
      ORDER BY created_at DESC
    `;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/points/:id - get a single point
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT
        id, category, name, description,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        accessibility_rating, created_at
       FROM points WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/points - create a new point
router.post('/', async (req, res, next) => {
  try {
    const { category, name, description, lat, lng, accessibility_rating } = req.body;

    // Validation
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
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
      `INSERT INTO points (category, name, description, location, accessibility_rating)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6)
       RETURNING
         id, category, name, description,
         ST_Y(location::geometry) AS lat,
         ST_X(location::geometry) AS lng,
         accessibility_rating, created_at`,
      [category, name.trim(), description?.trim() || null, lng, lat, rating]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/points/:id - delete a point
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM points WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
