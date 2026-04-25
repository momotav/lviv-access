# Lviv Access — Accessibility Map

A bachelor thesis project. A web application that maps barrier-free
infrastructure across Lviv: ramps, accessible toilets, charging stations,
accessible entrances, and low-floor public transit stops. Users can
contribute new points directly from the map.

## Stack

- **Frontend** — React 18 + Vite + Leaflet + React-Leaflet
- **Backend** — Node.js + Express
- **Database** — PostgreSQL with the PostGIS extension
- **Map tiles** — OpenStreetMap (CartoDB Voyager style)

## Project structure

```
lviv-access/
├── backend/        # Express API + PostgreSQL/PostGIS
│   ├── src/
│   │   ├── index.js          # entry point
│   │   ├── routes/points.js  # CRUD endpoints
│   │   └── db/
│   │       ├── pool.js       # pg connection pool
│   │       └── migrate.js    # schema + seed data
│   ├── railway.json
│   └── nixpacks.toml
└── frontend/       # React + Vite + Leaflet
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Sidebar.jsx
    │   │   ├── MapView.jsx
    │   │   └── AddPointModal.jsx
    │   └── lib/
    │       ├── api.js
    │       └── categories.jsx
    └── vercel.json
```

## Local development

### 1. Set up PostgreSQL with PostGIS

The easiest way is Docker:

```bash
docker run --name lviv-postgres \
  -e POSTGRES_USER=lviv \
  -e POSTGRES_PASSWORD=lviv \
  -e POSTGRES_DB=lviv_access \
  -p 5432:5432 \
  -d postgis/postgis:16-3.4
```

Or install PostgreSQL locally and run `CREATE EXTENSION postgis;` in the database.

### 2. Run the backend

```bash
cd backend
cp .env.example .env
# Edit .env and set:
# DATABASE_URL=postgresql://lviv:lviv@localhost:5432/lviv_access
npm install
npm start
```

The backend will:
- Connect to PostgreSQL
- Create the `points` table and PostGIS index automatically
- Seed 15 sample points around central Lviv (only if the table is empty)
- Start on `http://localhost:3001`

Verify it's running: `curl http://localhost:3001/api/health`

### 3. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to the
backend automatically — no env config needed for local dev.

## Deployment

### Backend → Railway

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the repo. Railway will detect the `backend/` folder. If it doesn't
   pick it up automatically, set the **Root Directory** to `backend` in the
   service settings.
4. In the same Railway project: **+ New** → **Database** → **Add PostgreSQL**.
5. Once both services exist, click on the **backend service** → **Variables**
   tab → **+ Add Variable** → **Add Reference** → pick `DATABASE_URL` from
   the Postgres service. Railway will inject the connection string.
6. Add two more variables:
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = your Vercel URL once you have it (start with `*` for now)
7. Trigger a deploy. The first request creates the schema and seeds data.
8. Click **Settings** → **Networking** → **Generate Domain** to expose the API.
   You'll get a URL like `https://lviv-access-backend.up.railway.app`.

**Important — PostGIS on Railway:** Railway's default Postgres image already
ships with PostGIS. The migration script runs `CREATE EXTENSION IF NOT EXISTS
postgis;` automatically. If for any reason the extension is missing, connect
to the database from the Railway data tab and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Then redeploy the backend.

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import
   the same GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Vite** (Vercel auto-detects).
4. **Environment Variables** → add:
   - `VITE_API_URL` = your Railway backend URL (e.g. `https://lviv-access-backend.up.railway.app`)
5. Deploy. You'll get a URL like `https://lviv-access.vercel.app`.

### Final step — fix CORS

Go back to Railway → backend service → Variables → set `CORS_ORIGIN` to your
Vercel URL (e.g. `https://lviv-access.vercel.app`). Redeploy.

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/points` | List all points. Query params: `category`, `bbox=minLng,minLat,maxLng,maxLat` |
| GET | `/api/points/:id` | Get one point |
| POST | `/api/points` | Create a point. Body: `{ category, name, description?, lat, lng, accessibility_rating? }` |
| DELETE | `/api/points/:id` | Delete a point |

Categories: `ramp`, `toilet`, `charging`, `entrance`, `transport`.

## Database schema

```sql
CREATE TABLE points (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  accessibility_rating SMALLINT CHECK (accessibility_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_points_location ON points USING GIST (location);
CREATE INDEX idx_points_category ON points (category);
```

The `GEOGRAPHY` column type and the GiST index allow fast spatial queries
such as "all points within 500 meters of this route" — important for the
routing/waypoint logic that's planned next.

## Roadmap (next thesis chapters)

1. **Routing** — integrate OpenRouteService wheelchair profile for
   point-A-to-point-B routes
2. **Waypoint insertion** — "find the nearest accessible toilet on my route"
   using PostGIS proximity queries
3. **Telegram bot** — parallel interface for adding points on the go
4. **POI overlay** — display shops/restaurants from OSM Overpass API,
   color-coded by accessibility status

## License

For academic use. Map data © OpenStreetMap contributors (ODbL).
