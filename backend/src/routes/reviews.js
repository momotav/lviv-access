import express from 'express';
import { query } from '../db/pool.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/points/:id/reviews
router.get('/:pointId/reviews', optionalAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
              r.user_id, u.display_name AS user_name
       FROM reviews r
       JOIN web_users u ON u.id = r.user_id
       WHERE r.point_id = $1
       ORDER BY r.updated_at DESC`,
      [req.params.pointId]
    );

    res.json({
      reviews: result.rows,
      my_review_id: req.user
        ? (result.rows.find((r) => r.user_id === req.user.id)?.id ?? null)
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/points/:id/reviews — create or update
router.post('/:pointId/reviews', requireAuth, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const pointId = parseInt(req.params.pointId, 10);

    if (Number.isNaN(pointId)) {
      return res.status(400).json({ error: 'Invalid point id' });
    }
    const r = parseInt(rating, 10);
    if (Number.isNaN(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    const cleanComment = comment ? String(comment).trim() : null;
    if (cleanComment && cleanComment.length > 2000) {
      return res.status(400).json({ error: 'Comment too long (max 2000 chars)' });
    }

    // Check the point exists
    const pointCheck = await query('SELECT id FROM points WHERE id = $1', [pointId]);
    if (pointCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    // Upsert
    const result = await query(
      `INSERT INTO reviews (point_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (point_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating,
             comment = EXCLUDED.comment,
             updated_at = NOW()
       RETURNING id, rating, comment, created_at, updated_at`,
      [pointId, req.user.id, r, cleanComment]
    );

    res.status(201).json({
      ...result.rows[0],
      user_id: req.user.id,
      user_name: req.user.name,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/points/:pointId/reviews/:reviewId — delete own review
router.delete('/:pointId/reviews/:reviewId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT user_id FROM reviews WHERE id = $1',
      [req.params.reviewId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    if (result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own reviews' });
    }
    await query('DELETE FROM reviews WHERE id = $1', [req.params.reviewId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
