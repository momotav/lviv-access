import React from 'react';
import { CATEGORIES, CategoryIcon } from '../lib/categories.jsx';

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s) {
  if (s < 60) return `${Math.round(s)} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}h ${m}m`;
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
  onComputeRoute,
  onClearRoute,
  routeData,
  routeError,
  routeLoading,
}) {
  const canCompute = routeFrom && routeTo && !routeLoading;

  return (
    <div>
      <div className="section-label">Plan a route</div>

      <div className="route-pickers">
        {/* FROM */}
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
              ? 'Click on the map…'
              : 'Set start point'}
          </span>
          {routeFrom && (
            <span
              className="route-picker-clear"
              onClick={(e) => {
                e.stopPropagation();
                setRouteFrom(null);
              }}
            >
              ✕
            </span>
          )}
        </button>

        {/* TO */}
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
              ? 'Click on the map…'
              : 'Set destination'}
          </span>
          {routeTo && (
            <span
              className="route-picker-clear"
              onClick={(e) => {
                e.stopPropagation();
                setRouteTo(null);
              }}
            >
              ✕
            </span>
          )}
        </button>
      </div>

      <div className="section-label" style={{ marginTop: 18 }}>Stop along the way</div>

      <div className="waypoint-options">
        <button
          className="waypoint-option"
          data-active={waypointType === null}
          onClick={() => setWaypointType(null)}
        >
          <span className="waypoint-option-icon">∅</span>
          <span>None — direct</span>
        </button>
        <button
          className="waypoint-option"
          data-active={waypointType === 'toilet'}
          onClick={() => setWaypointType('toilet')}
        >
          <span className="waypoint-option-icon">
            <CategoryIcon category="toilet" size={18} />
          </span>
          <span>Accessible WC</span>
        </button>
        <button
          className="waypoint-option"
          data-active={waypointType === 'charging'}
          onClick={() => setWaypointType('charging')}
        >
          <span className="waypoint-option-icon">
            <CategoryIcon category="charging" size={18} />
          </span>
          <span>Charging point</span>
        </button>
      </div>

      <button
        className="route-compute-btn"
        disabled={!canCompute}
        onClick={onComputeRoute}
      >
        {routeLoading ? 'Computing…' : '→  Compute route'}
      </button>

      {routeError && <div className="error-msg" style={{ marginTop: 12 }}>{routeError}</div>}

      {routeData && (
        <div className="route-summary">
          <div className="route-summary-row">
            <span className="route-summary-label">Distance</span>
            <span className="route-summary-value">{formatDistance(routeData.distance_m)}</span>
          </div>
          <div className="route-summary-row">
            <span className="route-summary-label">Duration</span>
            <span className="route-summary-value">{formatDuration(routeData.duration_s)}</span>
          </div>
          {routeData.waypoint && (
            <div className="route-summary-waypoint">
              <div className="route-summary-eyebrow">Stop inserted</div>
              <div className="route-summary-waypoint-name">
                <CategoryIcon category={routeData.waypoint.category} size={16} />
                <span>{routeData.waypoint.name}</span>
              </div>
            </div>
          )}
          {routeData.requestedWaypointType && !routeData.waypoint && (
            <div className="route-summary-warning">
              No suitable {routeData.requestedWaypointType} found near this route.
              Showing direct path.
            </div>
          )}
          <button className="route-clear-btn" onClick={onClearRoute}>
            Clear route
          </button>
        </div>
      )}
    </div>
  );
}
