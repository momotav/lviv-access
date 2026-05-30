import React from 'react';
import { CategoryIcon } from '../lib/categories.jsx';

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} м`;
  return `${(m / 1000).toFixed(1)} км`;
}

function formatDuration(s) {
  if (s < 60) return `${Math.round(s)} с`;
  if (s < 3600) return `${Math.round(s / 60)} хв`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h} год ${m} хв`;
}

const MODE_META = {
  WALK:       { icon: '🚶', label: 'Пішки' },
  TRAM:       { icon: '🚊', label: 'Трамвай' },
  TROLLEYBUS: { icon: '🚎', label: 'Тролейбус' },
  BUS:        { icon: '🚌', label: 'Автобус' },
};

function transferLabel(n) {
  if (n === 0) return 'без пересадок';
  if (n === 1) return '1 пересадка';
  if (n >= 2 && n <= 4) return `${n} пересадки`;
  return `${n} пересадок`;
}

export default function RoutingPanel({
  routingMode,
  setRoutingMode,
  routeFrom,
  routeTo,
  setRouteFrom,
  setRouteTo,
  waypointType,
  setWaypointType,
  travelMode,
  setTravelMode,
  onComputeRoute,
  onClearRoute,
  routeData,
  routeError,
  routeLoading,
}) {
  const canCompute = routeFrom && routeTo && !routeLoading;
  const isTransit = travelMode === 'transit';

  return (
    <div>
      <div className="section-label">Прокласти маршрут</div>

      {/* Travel mode toggle */}
      <div className="mode-toggle">
        <button
          className="mode-toggle-option"
          data-active={!isTransit}
          onClick={() => setTravelMode('walk')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13" cy="4" r="2"/>
            <path d="M9 21l3-6 2 3 4 3"/>
            <path d="M16 11l-4-2-3 5-3 0"/>
          </svg>
          <span>Пішки</span>
        </button>
        <button
          className="mode-toggle-option"
          data-active={isTransit}
          onClick={() => setTravelMode('transit')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="14" rx="2"/>
            <path d="M4 10h16"/>
            <circle cx="8" cy="19" r="1.5"/>
            <circle cx="16" cy="19" r="1.5"/>
          </svg>
          <span>Транспортом</span>
        </button>
      </div>

      <div className="route-pickers" style={{ marginTop: 12 }}>
        <button
          className="route-picker"
          data-active={routingMode === 'from'}
          data-filled={!!routeFrom}
          onClick={() => setRoutingMode(routingMode === 'from' ? null : 'from')}
        >
          <span className="route-picker-dot route-picker-dot-a">A</span>
          <span className="route-picker-text">
            {routeFrom
              ? `${routeFrom.lat.toFixed(4)}, ${routeFrom.lng.toFixed(4)}`
              : routingMode === 'from'
              ? 'Клацніть на карті…'
              : 'Точка відправлення'}
          </span>
          {routeFrom && (
            <span
              className="route-picker-clear"
              onClick={(e) => { e.stopPropagation(); setRouteFrom(null); }}
            >✕</span>
          )}
        </button>

        <button
          className="route-picker"
          data-active={routingMode === 'to'}
          data-filled={!!routeTo}
          onClick={() => setRoutingMode(routingMode === 'to' ? null : 'to')}
        >
          <span className="route-picker-dot route-picker-dot-b">B</span>
          <span className="route-picker-text">
            {routeTo
              ? `${routeTo.lat.toFixed(4)}, ${routeTo.lng.toFixed(4)}`
              : routingMode === 'to'
              ? 'Клацніть на карті…'
              : 'Точка призначення'}
          </span>
          {routeTo && (
            <span
              className="route-picker-clear"
              onClick={(e) => { e.stopPropagation(); setRouteTo(null); }}
            >✕</span>
          )}
        </button>
      </div>

      {/* Waypoint section - only in walk mode */}
      {!isTransit && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>Зупинка по дорозі</div>
          <div className="waypoint-options">
            <button
              className="waypoint-option"
              data-active={waypointType === null}
              onClick={() => setWaypointType(null)}
            >
              <span className="waypoint-option-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
              <span>Без зупинки</span>
            </button>
            <button
              className="waypoint-option"
              data-active={waypointType === 'toilet'}
              onClick={() => setWaypointType('toilet')}
            >
              <span className="waypoint-option-icon">
                <CategoryIcon category="toilet" size={16} />
              </span>
              <span>Доступний туалет</span>
            </button>
            <button
              className="waypoint-option"
              data-active={waypointType === 'charging'}
              onClick={() => setWaypointType('charging')}
            >
              <span className="waypoint-option-icon">
                <CategoryIcon category="charging" size={16} />
              </span>
              <span>Зарядна станція</span>
            </button>
          </div>
        </>
      )}

      <button
        className="route-compute-btn"
        disabled={!canCompute}
        onClick={onComputeRoute}
      >
        {routeLoading ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Обчислення…
          </>
        ) : (
          <>
            Побудувати маршрут
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </>
        )}
      </button>

      {routeError && <div className="error-msg" style={{ marginTop: 12 }}>{routeError}</div>}

      {routeData && (
        <div className="route-summary">
          <div className="route-summary-row">
            <span className="route-summary-label">Відстань</span>
            <span className="route-summary-value">{formatDistance(routeData.distance_m)}</span>
          </div>
          <div className="route-summary-row">
            <span className="route-summary-label">Тривалість</span>
            <span className="route-summary-value">{formatDuration(routeData.duration_s)}</span>
          </div>

          {/* Transit leg list */}
          {routeData.legs && routeData.legs.length > 0 && (
            <>
              <div className="route-summary-waypoint">
                <div className="route-summary-eyebrow">
                  {transferLabel(routeData.transfers ?? 0)}
                </div>
                <ul className="route-legs">
                  {routeData.legs.map((leg, i) => {
                    const meta = MODE_META[leg.mode] || { icon: '·', label: leg.mode };
                    const label = leg.mode === 'WALK'
                      ? `Пішки ${formatDistance(leg.distance_m)}`
                      : `${meta.label} ${leg.route || ''} · ${formatDuration(leg.duration_s)}`;
                    return (
                      <li key={i} className="route-leg-item">
                        <span className="route-leg-icon">{meta.icon}</span>
                        <span className="route-leg-text">{label.trim()}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {/* Waypoint (walk only) */}
          {routeData.waypoint && (
            <div className="route-summary-waypoint">
              <div className="route-summary-eyebrow">Зупинка на маршруті</div>
              <div className="route-summary-waypoint-name">
                <CategoryIcon category={routeData.waypoint.category} size={16} />
                <span>{routeData.waypoint.name}</span>
              </div>
            </div>
          )}
          {routeData.requestedWaypointType && !routeData.waypoint && (
            <div className="route-summary-warning">
              Поблизу цього маршруту не знайдено відповідної зупинки. Показаний прямий маршрут.
            </div>
          )}
          <button className="route-clear-btn" onClick={onClearRoute}>
            Очистити маршрут
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
