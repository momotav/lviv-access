/**
 * OpenRouteService API client.
 *
 * Uses the wheelchair routing profile to compute accessible walking routes
 * between coordinates. Returns route geometry (a polyline) plus distance
 * and duration.
 *
 * Free tier: 2000 requests/day, 40 requests/minute.
 */

const ORS_BASE = 'https://api.openrouteservice.org';

/**
 * Compute a wheelchair-accessible route through a list of [lng, lat] coords.
 * Returns: { coordinates: [[lng,lat], ...], distance_m, duration_s }
 */
export async function getRoute(coordinates) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new Error('ORS_API_KEY environment variable is not set');
  }

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('At least two coordinates required');
  }

  // ORS expects coordinates as [longitude, latitude], not [lat, lng]
  const url = `${ORS_BASE}/v2/directions/wheelchair/geojson`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
    },
    body: JSON.stringify({
      coordinates,
      // Defaults are reasonable; override here if you want stricter filtering
      // e.g.: profile_params: { restrictions: { maximum_incline: 6 } }
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.error || text;
    } catch (_) {}
    throw new Error(`ORS error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) {
    throw new Error('ORS returned no route');
  }

  return {
    coordinates: feature.geometry.coordinates, // [[lng, lat], ...]
    distance_m: feature.properties.summary.distance,
    duration_s: feature.properties.summary.duration,
  };
}
