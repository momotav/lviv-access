import express from 'express';
import { getRoute } from '../services/ors.js';
import { selectWaypoint } from '../services/waypoint.js';

const router = express.Router();

const VALID_WAYPOINT_TYPES = ['toilet', 'charging'];

/**
 * POST /api/route
 *
 * Body: {
 *   from: { lat, lng },
 *   to:   { lat, lng },
 *   waypointType?: "toilet" | "charging"   // optional
 * }
 *
 * Returns: {
 *   coordinates: [[lng, lat], ...],
 *   distance_m: number,
 *   duration_s: number,
 *   waypoint: null | { id, name, category, lat, lng, ... }
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { from, to, waypointType } = req.body;

    // Validation
    if (!from || typeof from.lat !== 'number' || typeof from.lng !== 'number') {
      return res.status(400).json({ error: 'Invalid "from" coordinates' });
    }
    if (!to || typeof to.lat !== 'number' || typeof to.lng !== 'number') {
      return res.status(400).json({ error: 'Invalid "to" coordinates' });
    }
    if (waypointType && !VALID_WAYPOINT_TYPES.includes(waypointType)) {
      return res.status(400).json({
        error: `waypointType must be one of: ${VALID_WAYPOINT_TYPES.join(', ')}`,
      });
    }

    let chosenWaypoint = null;
    let coordinates = [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];

    if (waypointType) {
      const selected = await selectWaypoint({
        category: waypointType,
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
      });

      if (selected) {
        chosenWaypoint = selected.point;
        coordinates = [
          [from.lng, from.lat],
          [chosenWaypoint.lng, chosenWaypoint.lat],
          [to.lng, to.lat],
        ];
      }
      // If no waypoint matched, fall back silently to A→B and let the frontend
      // know via waypoint=null. Frontend can show a warning.
    }

    const route = await getRoute(coordinates);

    res.json({
      coordinates: route.coordinates,
      distance_m: Math.round(route.distance_m),
      duration_s: Math.round(route.duration_s),
      waypoint: chosenWaypoint,
      requestedWaypointType: waypointType || null,
    });
  } catch (err) {
    // Surface meaningful error messages
    console.error('Route error:', err);
    res.status(500).json({ error: err.message || 'Routing failed' });
  }
});

export default router;
