/**
 * OpenTripPlanner (OTP) client — public-transport routing.
 *
 * Mirrors services/ors.js: takes [lng, lat] endpoints, returns the same
 * shape ({ coordinates, distance_m, duration_s }) PLUS a `legs` array so
 * the frontend can colour walk vs tram/bus segments.
 *
 * Requires a running OTP 2.x server with the Lviv GTFS + Lviv OSM graph.
 * Set OTP_URL in env, e.g.
 *   OTP_URL=http://localhost:8080/otp/gtfs/v1
 */

const OTP_URL = process.env.OTP_URL;

// Lviv runs trams, trolleybuses and buses. WALK for first/last-mile legs.
const TRANSPORT_MODES = [
  { mode: 'WALK' },
  { mode: 'TRAM' },
  { mode: 'TROLLEYBUS' },
  { mode: 'BUS' },
];

const PLAN_QUERY = `
  query Plan(
    $fromLat: Float!, $fromLon: Float!,
    $toLat: Float!,   $toLon: Float!,
    $date: String!,   $time: String!,
    $modes: [TransportMode!]
  ) {
    plan(
      from: { lat: $fromLat, lon: $fromLon }
      to:   { lat: $toLat,   lon: $toLon }
      date: $date
      time: $time
      transportModes: $modes
      wheelchair: true
      numItineraries: 3
    ) {
      itineraries {
        duration
        walkDistance
        legs {
          mode
          duration
          distance
          route { shortName longName }
          from { name lat lon }
          to   { name lat lon }
          legGeometry { points }
        }
      }
    }
  }
`;

/**
 * Format a Date into Europe/Kyiv date and time strings.
 * Container clocks often run UTC, but the GTFS feed is local time, so we
 * must convert explicitly or OTP queries shift 2-3 hours.
 */
function kyivDateTime(when) {
  // 'sv-SE' locale gives ISO-like "YYYY-MM-DD HH:MM:SS"
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(when);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/**
 * Compute a wheelchair-accessible transit route between two [lng, lat] points.
 *
 * Returns: {
 *   coordinates: [[lng,lat], ...],   // full path, flattened (for the existing Polyline)
 *   distance_m, duration_s,
 *   legs: [{ mode, route, from, to, duration_s, coordinates }],
 *   transfers: number
 * }
 */
export async function getTransitRoute([fromLngLat, toLngLat], when = new Date()) {
  if (!OTP_URL) {
    throw new Error('OTP_URL environment variable is not set');
  }
  const [fromLng, fromLat] = fromLngLat;
  const [toLng, toLat] = toLngLat;

  const { date, time } = kyivDateTime(when);

  const variables = {
    fromLat, fromLon: fromLng,
    toLat, toLon: toLng,
    date,
    time,
    modes: TRANSPORT_MODES,
  };

  const res = await fetch(OTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PLAN_QUERY, variables }),
  });

  if (!res.ok) {
    throw new Error(`OTP error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`OTP GraphQL error: ${json.errors[0].message}`);
  }

  const itineraries = json.data?.plan?.itineraries ?? [];
  if (itineraries.length === 0) {
    throw new Error('No accessible transit route found between these points');
  }

  // Pick fastest
  const best = itineraries.sort((a, b) => a.duration - b.duration)[0];

  const legs = best.legs.map((leg) => ({
    mode: leg.mode,
    route: leg.route?.shortName ?? null,
    routeLong: leg.route?.longName ?? null,
    from: leg.from.name,
    to: leg.to.name,
    duration_s: Math.round(leg.duration),
    distance_m: Math.round(leg.distance),
    coordinates: decodePolyline(leg.legGeometry.points),
  }));

  const transitLegs = legs.filter((l) => l.mode !== 'WALK').length;

  return {
    coordinates: legs.flatMap((l) => l.coordinates),
    distance_m: Math.round(best.legs.reduce((s, l) => s + l.distance, 0)),
    duration_s: Math.round(best.duration),
    legs,
    transfers: Math.max(0, transitLegs - 1),
  };
}

/**
 * Decode OTP/Google encoded polyline (precision 5) to [[lng, lat], ...].
 */
function decodePolyline(str, precision = 5) {
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let result = 0, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0; shift = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}
