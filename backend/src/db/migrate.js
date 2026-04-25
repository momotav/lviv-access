import { pool } from './pool.js';

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS points (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  accessibility_rating SMALLINT CHECK (accessibility_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_location ON points USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_points_category ON points (category);
`;

const SEED_DATA = [
  // Centered around Rynok Square, Lviv (49.8419, 24.0315)
  ['ramp', 'Ramp at Lviv Opera House', 'Permanent ramp at the main entrance', 49.8443, 24.0265, 5],
  ['ramp', 'Ramp at Pototsky Palace', 'Side entrance accessible ramp', 49.8395, 24.0224, 4],
  ['ramp', 'Ramp at Halytska Bookshop', 'Small portable ramp on request', 49.8418, 24.0313, 3],
  ['toilet', 'Accessible WC at Forum Lviv', 'Ground floor, near food court', 49.8350, 24.0263, 5],
  ['toilet', 'Accessible WC at Lviv Train Station', 'Main hall, signposted', 49.8395, 23.9942, 4],
  ['toilet', 'Accessible WC at Galka Park', 'Public restroom near entrance', 49.8462, 24.0357, 3],
  ['charging', 'Wheelchair charging point - City Hall', 'In the lobby, free of charge', 49.8419, 24.0315, 5],
  ['charging', 'Wheelchair charging - Forum Lviv', '1st floor info desk', 49.8351, 24.0264, 4],
  ['entrance', 'Accessible entrance - Lviv Polytechnic main building', 'East side entrance with ramp', 49.8353, 24.0117, 4],
  ['entrance', 'Accessible entrance - Lviv National University', 'Side entrance from Universytetska St', 49.8398, 24.0226, 3],
  ['transport', 'Low-floor tram stop - Doroshenka', 'Trams 1, 2, 9 stop here', 49.8408, 24.0245, 4],
  ['transport', 'Low-floor tram stop - Rynok Square', 'Central stop, multiple lines', 49.8419, 24.0315, 5],
  ['transport', 'Accessible bus stop - Svobody Avenue', 'Multiple bus routes with low floor', 49.8395, 24.0270, 4],
  ['ramp', 'Ramp at Lviv Coffee Mine', 'Wooden ramp at side entrance', 49.8424, 24.0306, 3],
  ['toilet', 'Accessible WC at Roshen Cafe', 'Customers only, ground floor', 49.8403, 24.0289, 4],
];

export async function initDb() {
  console.log('Initializing database...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA);

    // Seed only if table is empty
    const { rows } = await client.query('SELECT COUNT(*) FROM points');
    if (parseInt(rows[0].count, 10) === 0) {
      console.log('Seeding initial data...');
      for (const [category, name, description, lat, lng, rating] of SEED_DATA) {
        await client.query(
          `INSERT INTO points (category, name, description, location, accessibility_rating)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6)`,
          [category, name, description, lng, lat, rating]
        );
      }
      console.log(`Seeded ${SEED_DATA.length} points.`);
    }

    await client.query('COMMIT');
    console.log('Database ready.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Allow running directly: node src/db/migrate.js
if (import.meta.url === `file://${process.argv[1]}`) {
  initDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
