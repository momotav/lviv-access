// Geographic utility functions

/**
 * Haversine distance between two points in meters.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
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
 * Distance from a point P to a line segment AB, in meters.
 * Used in waypoint selection.
 */
export function distanceToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  const meanLat = (aLat + bLat) / 2;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);

  const ax = aLng * cosLat, ay = aLat;
  const bx = bLng * cosLat, by = bLat;
  const px = pLng * cosLat, py = pLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { distance: haversineMeters(pLat, pLng, aLat, aLng), t: 0 };
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const projLng = projX / cosLat;
  const projLat = projY;

  return {
    distance: haversineMeters(pLat, pLng, projLat, projLng),
    t,
  };
}
