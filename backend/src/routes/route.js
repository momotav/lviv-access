import express from 'express';
import { getRoute } from '../services/ors.js';
import { getTransitRoute } from '../services/otp.js';
import { selectWaypoint } from '../services/waypoint.js';

const router = express.Router();

const VALID_WAYPOINT_TYPES = ['toilet', 'charging'];
const VALID_TRAVEL_MODES = ['walk', 'transit'];

/**
 * POST /api/route
 *
 * Body: {
 *   from: { lat, lng },
 *   to:   { lat, lng },
 *   travelMode?: "walk" | "transit"        // default: "walk"
 *   waypointType?: "toilet" | "charging"   // only used in walk mode
 * }
 *
 * Returns:
 *   For walk:    { coordinates, distance_m, duration_s, waypoint, requestedWaypointType }
 *   For transit: { coordinates, distance_m, duration_s, legs, transfers,
 *                  waypoint: null, requestedWaypointType: null }
 */
router.post('/', async (req, res) => {
  try {
    const { from, to, waypointType, travelMode } = req.body;

    // Common validation
    if (!from || typeof from.lat !== 'number' || typeof from.lng !== 'number') {
      return res.status(400).json({ error: 'Invalid "from" coordinates' });
    }
    if (!to || typeof to.lat !== 'number' || typeof to.lng !== 'number') {
      return res.status(400).json({ error: 'Invalid "to" coordinates' });
    }
    const mode = travelMode || 'walk';
    if (!VALID_TRAVEL_MODES.includes(mode)) {
      return res.status(400).json({
        error: `travelMode must be one of: ${VALID_TRAVEL_MODES.join(', ')}`,
      });
    }

    // ===== TRANSIT branch =====
    if (mode === 'transit') {
      const transit = await getTransitRoute([
        [from.lng, from.lat],
        [to.lng, to.lat],
      ]);
      return res.json({
        coordinates: transit.coordinates,
        distance_m: transit.distance_m,
        duration_s: transit.duration_s,
        legs: transit.legs,
        transfers: transit.transfers,
        waypoint: null,
        requestedWaypointType: null,
        travelMode: 'transit',
      });
    }

    // ===== WALK branch (unchanged) =====
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
    }

    const route = await getRoute(coordinates);

    res.json({
      coordinates: route.coordinates,
      distance_m: Math.round(route.distance_m),
      duration_s: Math.round(route.duration_s),
      waypoint: chosenWaypoint,
      requestedWaypointType: waypointType || null,
      travelMode: 'walk',
    });
  } catch (err) {
    console.error('Route error:', err);
    res.status(500).json({ error: err.message || 'Routing failed' });
  }
});

export default router;
