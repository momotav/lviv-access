import React from 'react';
import { CATEGORIES, CATEGORY_LIST, CategoryIcon } from '../lib/categories.jsx';
import RoutingPanel from './RoutingPanel.jsx';

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
          <div className="brand-eyebrow">Lviv · Accessibility Atlas</div>
          <h1 className="brand-title">
            Lviv <em>Access</em>
          </h1>
          <p className="brand-tagline">
            A community-built map of ramps, accessible toilets, and barrier-free
            transit — for those who navigate the city differently.
          </p>
        </header>

        <div className="user-pill">
          {currentUser ? (
            <>
              <div className="user-pill-name">
                <span className="user-pill-dot" />
                {currentUser.display_name}
              </div>
              <button className="user-pill-action" onClick={onLogout}>Sign out</button>
            </>
          ) : (
            <>
              <div className="user-pill-name user-pill-anon">Anonymous viewer</div>
              <button className="user-pill-action" onClick={onRequestLogin}>Sign in</button>
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
          onComputeRoute={onComputeRoute}
          onClearRoute={onClearRoute}
          routeData={routeData}
          routeError={routeError}
          routeLoading={routeLoading}
        />

        <div className="section-label" style={{ marginTop: 24 }}>Layers</div>
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

        <button
          className="add-button"
          data-active={addMode}
          onClick={onAddClicked}
        >
          {addMode ? '✕  Cancel' : '+  Mark a Point'}
        </button>
        <div className="add-hint">
          {addMode
            ? 'Click anywhere on the map'
            : (currentUser ? '' : 'Sign in to contribute')}
        </div>
      </div>

      <div className="sidebar-footer">
        Bachelor's Thesis · 2026
      </div>
    </aside>
  );
}
