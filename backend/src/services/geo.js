// Geographic utility functions

/**
 * Haversine distance between two points in meters.
 * Standard formula for great-circle distance on a sphere.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Distance from a point P to a straight line segment AB, in meters.
 * Used to estimate "detour cost" for a candidate waypoint relative to
 * the direct A→B path.
 *
 * Geometry: project P onto line AB, clamp to segment, then haversine
 * distance to the projection. Approximates well at city scales.
 */
export function distanceToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  // Convert to a local equirectangular projection (good enough for <50km)
  const meanLat = (aLat + bLat) / 2;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);

  // Treat lng/lat as planar after scaling — error is negligible at city scale
  const ax = aLng * cosLat, ay = aLat;
  const bx = bLng * cosLat, by = bLat;
  const px = pLng * cosLat, py = pLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // A and B are the same point — return distance from P to A
    return haversineMeters(pLat, pLng, aLat, aLng);
  }

  // t = projection parameter: 0 at A, 1 at B; clamp to segment
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const projLng = projX / cosLat;
  const projLat = projY;

  return {
    distance: haversineMeters(pLat, pLng, projLat, projLng),
    t, // position along segment 0-1
  };
}
