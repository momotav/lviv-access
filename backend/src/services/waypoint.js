import { distanceToSegmentMeters } from './geo.js';
import { query } from '../db/pool.js';

/**
 * WAYPOINT SELECTION ALGORITHM
 * ============================
 * Selects the best accessibility point of a given category to insert
 * between origin A and destination B.
 *
 * For each candidate waypoint W of the requested type, compute a score:
 *
 *     score(W) = α · detour(W) + β · position(W) + γ · quality(W)
 *
 * where:
 *   detour(W)   — distance from W to line segment AB, in meters (lower is better)
 *   position(W) — penalty for waypoints near A or B (we want middle of journey)
 *   quality(W)  — penalty for low-rated points (higher rating is better)
 *
 * α, β, γ are weights expressing how much each factor matters.
 * The candidate with the lowest score wins.
 *
 * This integrates crowdsourced accessibility data (the rating, drawn from
 * user reviews) with geometric routing constraints.
 */

// Tunable weights — chosen so that ~100m of detour is roughly equivalent
// to one rating star or one "off-center" position penalty unit.
const W_DETOUR = 1.0;     // per meter
const W_POSITION = 80.0;  // per (0..0.5) unit of distance from midpoint
const W_QUALITY = 60.0;   // per missing rating star (out of 5)

// Hard cap: if no waypoint is within this much detour, give up.
const MAX_DETOUR_METERS = 800;

export async function selectWaypoint({ category, fromLat, fromLng, toLat, toLng }) {
  // 1. Fetch all candidate points of the given category
  const result = await query(
    `SELECT id, category, name, description, lat, lng, accessibility_rating
     FROM points
     WHERE category = $1`,
    [category]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // 2. Score each candidate
  const scored = result.rows
    .map((p) => {
      const { distance, t } = distanceToSegmentMeters(
        p.lat, p.lng, fromLat, fromLng, toLat, toLng
      );

      // Position factor: prefer waypoints near t=0.5 (middle).
      // |t - 0.5| ranges 0..0.5; multiply by 2 to get 0..1.
      const positionPenalty = Math.abs(t - 0.5) * 2;

      // Quality factor: missing stars (5 - rating). Default rating = 3 if unknown.
      const rating = p.accessibility_rating ?? 3;
      const qualityPenalty = 5 - rating;

      const score =
        W_DETOUR * distance +
        W_POSITION * positionPenalty +
        W_QUALITY * qualityPenalty;

      return { point: p, distance, t, score };
    })
    .filter((s) => s.distance <= MAX_DETOUR_METERS)
    .sort((a, b) => a.score - b.score);

  if (scored.length === 0) {
    return null;
  }

  return scored[0]; // best candidate
}
