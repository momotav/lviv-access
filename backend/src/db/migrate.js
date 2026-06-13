import { pool } from './pool.js';

const SCHEMA = `
-- ====================================================================
-- POINTS — existing table, with new columns
-- ====================================================================
CREATE TABLE IF NOT EXISTS points (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accessibility_rating SMALLINT CHECK (accessibility_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_category ON points (category);
CREATE INDEX IF NOT EXISTS idx_points_lat_lng ON points (lat, lng);

-- Add created_by column to existing points table (idempotent)
ALTER TABLE points ADD COLUMN IF NOT EXISTS created_by_web_user INTEGER;
ALTER TABLE points ADD COLUMN IF NOT EXISTS created_by_telegram BIGINT;

-- ====================================================================
-- WEB USERS — email + password registration
-- ====================================================================
CREATE TABLE IF NOT EXISTS web_users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(255)        NOT NULL,
  display_name  VARCHAR(100)        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_users_email ON web_users (email);

-- ====================================================================
-- REVIEWS — one per (user, point), edits replace
-- ====================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  point_id     INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (point_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_point ON reviews (point_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user  ON reviews (user_id);

-- ====================================================================
-- PHOTOS — multiple per point
-- ====================================================================
CREATE TABLE IF NOT EXISTS photos (
  id              SERIAL PRIMARY KEY,
  point_id        INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  url             VARCHAR(500) NOT NULL,
  uploaded_by_web INTEGER REFERENCES web_users(id) ON DELETE SET NULL,
  uploaded_by_tg  BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_point ON photos (point_id);
`;

const SEED_DATA = [
  // === ПАНДУСИ (10) ===
  ['ramp', 'Пандус біля Львівської опери', 'Постійний пандус біля головного входу', 49.8443, 24.0265, 5],
  ['ramp', 'Пандус Палацу Потоцьких', 'Боковий вхід з пандусом', 49.8395, 24.0224, 4],
  ['ramp', 'Пандус книгарні «Є» на Галицькій', 'Невеликий портативний пандус на запит персоналу', 49.8418, 24.0313, 3],
  ['ramp', 'Пандус кав\u02bcярні «Львівська копальня кави»', 'Дерев\u02bcяний пандус біля бокового входу', 49.8424, 24.0306, 3],
  ['ramp', 'Пандус Львівської ратуші', 'Південний вхід, постійний бетонний пандус', 49.8419, 24.0315, 5],
  ['ramp', 'Пандус Львівського драмтеатру ім. Заньковецької', 'Лівий бічний вхід з вул. Лесі Українки', 49.8399, 24.0270, 4],
  ['ramp', 'Пандус Палацу мистецтв', 'Зі сторони вул. Коперника, кутом 8°', 49.8410, 24.0250, 4],
  ['ramp', 'Пандус ТРЦ «Forum Lviv»', 'Кілька входів, всі з пандусами', 49.8351, 24.0263, 5],
  ['ramp', 'Пандус Львівського національного університету', 'Центральний вхід з вул. Університетської', 49.8398, 24.0226, 4],
  ['ramp', 'Пандус БЦ «Інтерсіті»', 'Скляний бічний вхід', 49.8362, 24.0290, 5],

  // === ДОСТУПНІ ТУАЛЕТИ (10) ===
  ['toilet', 'Доступний туалет у Forum Lviv', 'Перший поверх, поряд із фуд-кортом', 49.8350, 24.0263, 5],
  ['toilet', 'Доступний туалет на Львівському залізничному вокзалі', 'Головний хол, з вказівниками', 49.8395, 23.9942, 4],
  ['toilet', 'Доступний туалет у парку «Галка»', 'Біля головного входу, безкоштовний', 49.8462, 24.0357, 3],
  ['toilet', 'Доступний туалет у кав\u02bcярні «Roshen»', 'Для клієнтів, перший поверх', 49.8403, 24.0289, 4],
  ['toilet', 'Доступний туалет у McDonald\u02bcs на пр. Свободи', 'Перший поверх, праворуч від входу', 49.8421, 24.0299, 4],
  ['toilet', 'Доступний туалет у бібліотеці ім. Стефаника', 'Перший поверх, цокольний рівень', 49.8395, 24.0233, 3],
  ['toilet', 'Доступний туалет у ТЦ «Кінг Кросс Леополіс»', 'Біля входу до гіпермаркету', 49.7741, 24.0127, 5],
  ['toilet', 'Доступний туалет в аеропорту «Львів»', 'Зона прильоту, рівень 0', 49.8125, 23.9559, 5],
  ['toilet', 'Доступний туалет у Гранд-готелі', 'Холл першого поверху', 49.8388, 24.0282, 5],
  ['toilet', 'Доступний туалет у Львівському музеї історії', 'Перший поверх, поряд із гардеробом', 49.8413, 24.0308, 4],

  // === ЗАРЯДНІ СТАНЦІЇ (8) ===
  ['charging', 'Зарядна станція - Львівська ратуша', 'У вестибюлі, безкоштовно', 49.8420, 24.0316, 5],
  ['charging', 'Зарядна станція - Forum Lviv', 'Інформаційна стійка, 1-й поверх', 49.8351, 24.0264, 4],
  ['charging', 'Зарядна станція - Палац спорту «Україна»', 'Біля головного входу, працює 24/7', 49.8331, 24.0184, 4],
  ['charging', 'Зарядна станція - центральна пошта', 'Зал обслуговування, безкоштовно', 49.8403, 24.0264, 3],
  ['charging', 'Зарядна станція - Львівський автовокзал', 'Зала очікування', 49.7965, 24.0427, 4],
  ['charging', 'Зарядна станція - ТЦ «Вікторія Гарденс»', 'Перший поверх, поряд із інфостійкою', 49.8164, 24.0512, 5],
  ['charging', 'Зарядна станція - кав\u02bcярня «Світ кави»', 'Зала для відвідувачів, безкоштовно', 49.8431, 24.0335, 4],
  ['charging', 'Зарядна станція - готель «Дністер»', 'Зона рецепції', 49.8367, 24.0263, 5],

  // === ДОСТУПНІ ВХОДИ (10) ===
  ['entrance', 'Доступний вхід - Львівська політехніка (головний)', 'Східний вхід з пандусом і автоматичними дверима', 49.8353, 24.0117, 4],
  ['entrance', 'Доступний вхід - Львівський національний університет', 'Боковий вхід з вул. Університетської', 49.8398, 24.0226, 3],
  ['entrance', 'Доступний вхід - Львівська обласна бібліотека', 'Зі сторони парку, автоматичні двері', 49.8395, 24.0233, 4],
  ['entrance', 'Доступний вхід - Львівський оперний театр', 'Лівий бічний вхід, з ліфтом', 49.8443, 24.0265, 5],
  ['entrance', 'Доступний вхід - Львівський аеропорт', 'Усі входи доступні, з автоматичними дверима', 49.8125, 23.9559, 5],
  ['entrance', 'Доступний вхід - центр культури «Дзига»', 'Внутрішній двір, пандус', 49.8438, 24.0306, 3],
  ['entrance', 'Доступний вхід - супермаркет «Сільпо» (Шевченка)', 'Автоматичні двері, рівний доступ', 49.8472, 24.0287, 5],
  ['entrance', 'Доступний вхід - аптека «Подорожник»', 'Бічний вхід з вул. Дорошенка', 49.8409, 24.0246, 4],
  ['entrance', 'Доступний вхід - Львівський академічний театр ім. Курбаса', 'З вул. Леся Курбаса, пандус', 49.8417, 24.0299, 4],
  ['entrance', 'Доступний вхід - центр зайнятості м. Львова', 'Зі сторони парку, автоматичні двері', 49.8350, 24.0238, 4],

  // === НИЗЬКОПІДЛОГОВИЙ ТРАНСПОРТ (12) ===
  ['transport', 'Зупинка низькопідлогового трамвая - Дорошенка', 'Маршрути 1, 2, 9, з тактильною плиткою', 49.8408, 24.0245, 4],
  ['transport', 'Зупинка низькопідлогового трамвая - Площа Ринок', 'Центральна зупинка, кілька ліній', 49.8419, 24.0315, 5],
  ['transport', 'Доступна зупинка - проспект Свободи', 'Кілька низькопідлогових автобусів', 49.8395, 24.0270, 4],
  ['transport', 'Зупинка автобуса А10 - Залізничний вокзал', 'Низькопідлоговий, кожні 15 хв', 49.8389, 23.9947, 5],
  ['transport', 'Зупинка автобуса А10 - ТРЦ Кінг Кросс', 'Низькопідлоговий, кінцева', 49.7745, 24.0125, 5],
  ['transport', 'Зупинка трамвая Т08 - площа Соборна', 'Низькопідлоговий, 100% доступний', 49.8424, 24.0289, 5],
  ['transport', 'Зупинка тролейбуса Тр24 - Шота Руставелі', 'Низькопідлоговий маршрут', 49.8175, 24.0382, 4],
  ['transport', 'Зупинка автобуса А51 - Галицьке перехрестя', 'Низькопідлоговий', 49.8264, 24.0455, 4],
  ['transport', 'Зупинка автобуса А41 - вул. Сихівська', 'Низькопідлоговий, регулярний', 49.8023, 24.0521, 4],
  ['transport', 'Зупинка автобуса А53 - Санта-Барбара', 'Низькопідлоговий', 49.8154, 24.0608, 4],
  ['transport', 'Зупинка трамвая - Личаківська', 'Кілька маршрутів, тактильна плитка', 49.8388, 24.0420, 3],
  ['transport', 'Зупинка автобуса - Привокзальний ринок', 'Кілька низькопідлогових маршрутів', 49.8401, 23.9968, 4],
];

export async function initDb() {
  console.log('Initializing database...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA);

    // Idempotent seed: insert any point whose name isn't already in the DB.
    // This lets us add new seed entries on redeploy without duplicating
    // user-created data or existing seed points.
    let added = 0;
    for (const [category, name, description, lat, lng, rating] of SEED_DATA) {
      const { rows } = await client.query(
        'SELECT 1 FROM points WHERE name = $1 LIMIT 1',
        [name]
      );
      if (rows.length === 0) {
        await client.query(
          `INSERT INTO points (category, name, description, lat, lng, accessibility_rating)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [category, name, description, lat, lng, rating]
        );
        added++;
      }
    }
    if (added > 0) {
      console.log(`Seeded ${added} new points (${SEED_DATA.length - added} already existed).`);
    } else {
      console.log('All seed points already in DB.');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  initDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
