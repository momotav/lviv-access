import React from 'react';
import { CATEGORIES, CATEGORY_LIST, CategoryIcon } from '../lib/categories.jsx';
import RoutingPanel from './RoutingPanel.jsx';

// Brand mark — abstract "accessibility" + map pin glyph
function BrandMark() {
  return (
    <div className="brand-mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="2" fill="currentColor" />
        <path d="M9 11 L9 14 L13 14 L15 20" />
        <path d="M15 12 C17 12, 18 14, 18 16" />
      </svg>
    </div>
  );
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Sidebar({
  points,
  activeFilters,
  toggleFilter,
  addMode,
  setAddMode,
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
  currentUser,
  onRequestLogin,
  onLogout,
  onAddClicked,
}) {
  const counts = CATEGORY_LIST.reduce((acc, cat) => {
    acc[cat] = points.filter((p) => p.category === cat).length;
    return acc;
  }, {});

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <header className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">Lviv Access</div>
            <div className="brand-sub">Безбар'єрна карта Львова</div>
          </div>
        </header>

        <div className="user-pill">
          {currentUser ? (
            <>
              <div className="user-pill-avatar">{initials(currentUser.display_name)}</div>
              <div className="user-pill-name">{currentUser.display_name}</div>
              <button className="user-pill-action" onClick={onLogout}>Вийти</button>
            </>
          ) : (
            <>
              <div className="user-pill-avatar user-pill-avatar-anon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div className="user-pill-anon-text">Анонімний перегляд</div>
              <button className="user-pill-action" onClick={onRequestLogin}>Увійти</button>
            </>
          )}
        </div>

        <RoutingPanel
          routingMode={routingMode}
          setRoutingMode={setRoutingMode}
          routeFrom={routeFrom}
          routeTo={routeTo}
          setRouteFrom={setRouteFrom}
          setRouteTo={setRouteTo}
          waypointType={waypointType}
          setWaypointType={setWaypointType}
          travelMode={travelMode}
          setTravelMode={setTravelMode}
          onComputeRoute={onComputeRoute}
          onClearRoute={onClearRoute}
          routeData={routeData}
          routeError={routeError}
          routeLoading={routeLoading}
        />

        <div>
          <div className="section-label">Категорії на карті</div>
          <div className="filter-list">
            {CATEGORY_LIST.map((cat) => (
              <button
                key={cat}
                className="filter-chip"
                data-active={activeFilters.includes(cat)}
                onClick={() => toggleFilter(cat)}
              >
                <span className="filter-icon">
                  <CategoryIcon category={cat} size={20} />
                </span>
                <span className="filter-label">{CATEGORIES[cat].label}</span>
                <span className="filter-count">{counts[cat]}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button
            className="add-button"
            data-active={addMode}
            onClick={onAddClicked}
          >
            {addMode ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Скасувати
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Додати об'єкт
              </>
            )}
          </button>
          <div className="add-hint">
            {addMode
              ? 'Клацніть будь-де на карті'
              : (currentUser ? '' : 'Увійдіть, щоб додати')}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        Бакалаврська робота · 2026
      </div>
    </aside>
  );
}
