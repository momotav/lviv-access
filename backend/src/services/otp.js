/**
 * OpenTripPlanner (OTP) client — wheelchair-accessible public-transport routing.
 *
 * NOTE on accessibility filtering:
 *
 * OTP's built-in `wheelchair: true` filter requires both stop-level
 * (`wheelchair_boarding` in stops.txt) AND trip-level
 * (`wheelchair_accessible` in trips.txt) GTFS data to be populated.
 * The Lviv GTFS feed publishes only the latter — there is no
 * `wheelchair_boarding` column in stops.txt at all. With strict
 * OTP filtering this returns zero itineraries.
 *
 * We instead use a two-stage approach:
 *   1. Query OTP without the wheelchair flag → get all itineraries
 *   2. Post-filter: keep only itineraries where every transit leg
 *      uses one of the routes verified as 100% wheelchair-accessible
 *      in the official GTFS feed (8 of 72 routes for Lviv as of May 2026).
 *
 * This makes the system honest about data limitations while still
 * delivering working accessibility routing for the routes that ARE
 * documented as accessible.
 */

const OTP_URL = process.env.OTP_URL;

// Lviv runs trams, trolleybuses and buses. WALK for first/last-mile legs.
const TRANSPORT_MODES = [
  { mode: 'WALK' },
  { mode: 'TRAM' },
  { mode: 'TROLLEYBUS' },
  { mode: 'BUS' },
];

/**
 * Routes verified as 100% wheelchair-accessible in the Lviv GTFS feed
 * (all trips marked wheelchair_accessible=1 in trips.txt).
 *
 * Determined from the May 2026 feed (feed_version 6.43). Update this list
 * when the GTFS feed is republished with broader accessibility coverage.
 */
const ACCESSIBLE_ROUTE_SHORT_NAMES = new Set([
  'Т08',   // Tram — пл. Соборна ↔ вул. Вернадського
  'А10',   // Bus — ТРЦ Кінг Кросс ↔ Залізничний вокзал
  'А41',   // Bus — вул. Сихівська ↔ Галицьке перехрестя
  'А45',   // Bus — вул. Симоненка ↔ вул. Барвінських
  'А51',   // Bus — ТЦ Вікторія Гарденс ↔ Галицьке перехрестя
  'А53',   // Bus — Санта-Барбара ↔ Галицьке перехрестя
  'А63',   // Bus — вул. Під дубом ↔ с. Воля-Гамулецька
  'Тр24',  // Trolleybus — Шота Руставелі ↔ Червона Калина
]);

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
      numItineraries: 10
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
          intermediateStops { name lat lon }
          legGeometry { points }
        }
      }
    }
  }
`;

/**
 * Format a Date into Europe/Kyiv date and time strings.
 * Server containers often run UTC, but GTFS is local time — we must
 * convert explicitly or queries shift by hours.
 */
function kyivDateTime(when) {
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
 * Check whether an itinerary is fully wheelchair-accessible.
 * An itinerary is accessible iff every transit leg uses a route
 * in our verified-accessible list. WALK legs are always fine.
 */
function isAccessibleItinerary(itinerary) {
  for (const leg of itinerary.legs) {
    if (leg.mode === 'WALK') continue;
    const shortName = leg.route?.shortName;
    if (!shortName || !ACCESSIBLE_ROUTE_SHORT_NAMES.has(shortName)) {
      return false;
    }
  }
  return true;
}

/**
 * Default planning time for demo / thesis purposes.
 *
 * Always plans for the next Tuesday at 12:00 noon Kyiv local time. This
 * guarantees:
 *   - a weekday (full transit service, including service_id 31, 63, 159, 191, 255)
 *   - peak daytime hours (no "no transit at 3 AM" edge case)
 *   - within the GTFS calendar window (2026-05-29 → 2027-05-29)
 *
 * For a future production deployment with mobile location services, this
 * would default to "now" with an optional date/time picker in the UI.
 */
function nextTuesdayNoon() {
  // Get current date in Kyiv timezone so we compute the right weekday
  const nowKyiv = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })
  );
  const day = nowKyiv.getDay(); // 0=Sun, 1=Mon, 2=Tue, ...
  const daysUntilTue = ((2 - day + 7) % 7) || 7; // always upcoming, never today
  const target = new Date(nowKyiv);
  target.setDate(target.getDate() + daysUntilTue);
  target.setHours(12, 0, 0, 0);
  return target;
}

/**
 * Compute a wheelchair-accessible transit route between two [lng, lat] points.
 *
 * Returns: {
 *   coordinates, distance_m, duration_s, legs, transfers
 * }
 */
export async function getTransitRoute([fromLngLat, toLngLat], when = nextTuesdayNoon()) {
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
    headers: {
      'Content-Type': 'application/json',
      // Bypass ngrok-free interstitial in dev
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ query: PLAN_QUERY, variables }),
  });

  if (!res.ok) {
    throw new Error(`OTP error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`OTP GraphQL error: ${json.errors[0].message}`);
  }

  const allItineraries = json.data?.plan?.itineraries ?? [];
  if (allItineraries.length === 0) {
    throw new Error('OTP returned no itineraries for these points');
  }

  // Filter to wheelchair-accessible itineraries only
  const accessible = allItineraries.filter(isAccessibleItinerary);

  if (accessible.length === 0) {
    throw new Error(
      'Доступний транспортний маршрут не знайдено між цими точками. ' +
      'Спробуйте інші точки відправлення/призначення або скористайтесь пішим маршрутом.'
    );
  }

  // Pick fastest accessible one
  const best = accessible.sort((a, b) => a.duration - b.duration)[0];

  const legs = best.legs.map((leg) => {
    // Build full list of transit stops for this leg:
    //   [boarding, ...intermediate, alighting]
    // For WALK legs, this is just origin -> destination (no transit stops).
    const isTransit = leg.mode !== 'WALK';
    const stops = isTransit
      ? [
          { name: leg.from.name, lat: leg.from.lat, lng: leg.from.lon, role: 'board' },
          ...(leg.intermediateStops || []).map((s) => ({
            name: s.name, lat: s.lat, lng: s.lon, role: 'pass',
          })),
          { name: leg.to.name, lat: leg.to.lat, lng: leg.to.lon, role: 'alight' },
        ]
      : [];

    return {
      mode: leg.mode,
      route: leg.route?.shortName ?? null,
      routeLong: leg.route?.longName ?? null,
      from: leg.from.name,
      to: leg.to.name,
      duration_s: Math.round(leg.duration),
      distance_m: Math.round(leg.distance),
      coordinates: decodePolyline(leg.legGeometry.points),
      stops,
    };
  });

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
