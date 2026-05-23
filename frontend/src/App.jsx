import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MapView from './components/MapView.jsx';
import AddPointModal from './components/AddPointModal.jsx';
import { CATEGORY_LIST } from './lib/categories.jsx';
import { api } from './lib/api.js';

/**
 * Parse "lat,lng" string from URL query into { lat, lng } object.
 * Returns null if the value is missing or malformed.
 */
function parseLatLng(str) {
  if (!str) return null;
  const parts = str.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function App() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState(CATEGORY_LIST);
  const [error, setError] = useState(null);

  // Add-point state
  const [addMode, setAddMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);

  // Routing state — initialised from URL query if present
  const [routingMode, setRoutingMode] = useState(null); // null | 'from' | 'to'
  const [routeFrom, setRouteFrom] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseLatLng(new URLSearchParams(window.location.search).get('from'));
  });
  const [routeTo, setRouteTo] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseLatLng(new URLSearchParams(window.location.search).get('to'));
  });
  const [waypointType, setWaypointType] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Clean the URL query string after we've read from it, so reloads don't
  // surprise the user with the same route always pre-filled.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('from') || params.has('to')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    api.listPoints()
      .then((data) => {
        if (mounted) {
          setPoints(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (mounted) {
          setError('Could not connect to the server. Is the backend running?');
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  const toggleFilter = useCallback((cat) => {
    setActiveFilters((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  // When user enters add-mode, exit any routing mode
  const handleSetAddMode = useCallback((val) => {
    setAddMode(val);
    if (val) setRoutingMode(null);
  }, []);

  // When user enters routing-mode, exit add-mode
  const handleSetRoutingMode = useCallback((mode) => {
    setRoutingMode(mode);
    if (mode) setAddMode(false);
  }, []);

  // Map clicks: dispatch to the right handler depending on mode
  const handleMapClick = useCallback((latlng) => {
    if (addMode) {
      setPendingCoords({ lat: latlng.lat, lng: latlng.lng });
      setAddMode(false);
    } else if (routingMode === 'from') {
      setRouteFrom({ lat: latlng.lat, lng: latlng.lng });
      setRoutingMode(null);
    } else if (routingMode === 'to') {
      setRouteTo({ lat: latlng.lat, lng: latlng.lng });
      setRoutingMode(null);
    }
  }, [addMode, routingMode]);

  const handleSubmitPoint = useCallback(async (data) => {
    const newPoint = await api.createPoint(data);
    setPoints((prev) => [newPoint, ...prev]);
    setPendingCoords(null);
  }, []);

  const handleDeletePoint = useCallback(async (id) => {
    try {
      await api.deletePoint(id);
      setPoints((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }, []);

  const handleComputeRoute = useCallback(async () => {
    if (!routeFrom || !routeTo) return;
    setRouteLoading(true);
    setRouteError(null);
    setRouteData(null);
    try {
      const data = await api.computeRoute({
        from: routeFrom,
        to: routeTo,
        waypointType,
      });
      setRouteData(data);
    } catch (err) {
      setRouteError(err.message || 'Failed to compute route');
    } finally {
      setRouteLoading(false);
    }
  }, [routeFrom, routeTo, waypointType]);

  const handleClearRoute = useCallback(() => {
    setRouteFrom(null);
    setRouteTo(null);
    setRouteData(null);
    setRouteError(null);
    setRoutingMode(null);
  }, []);

  const cancelInteraction = useCallback(() => {
    setAddMode(false);
    setRoutingMode(null);
  }, []);

  const visiblePoints = points.filter((p) => activeFilters.includes(p.category));

  return (
    <div className="app">
      <Sidebar
        points={points}
        activeFilters={activeFilters}
        toggleFilter={toggleFilter}
        addMode={addMode}
        setAddMode={handleSetAddMode}
        routingMode={routingMode}
        setRoutingMode={handleSetRoutingMode}
        routeFrom={routeFrom}
        routeTo={routeTo}
        setRouteFrom={setRouteFrom}
        setRouteTo={setRouteTo}
        waypointType={waypointType}
        setWaypointType={setWaypointType}
        onComputeRoute={handleComputeRoute}
        onClearRoute={handleClearRoute}
        routeData={routeData}
        routeError={routeError}
        routeLoading={routeLoading}
      />

      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {loading && <div className="loading">Loading map data…</div>}
        {error && (
          <div className="loading" style={{ color: 'var(--accent)', textAlign: 'center', maxWidth: 400 }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <MapView
            points={visiblePoints}
            addMode={addMode}
            routingMode={routingMode}
            onMapClick={handleMapClick}
            onDeletePoint={handleDeletePoint}
            cancelInteraction={cancelInteraction}
            routeFrom={routeFrom}
            routeTo={routeTo}
            routeData={routeData}
          />
        )}
      </div>

      {pendingCoords && (
        <AddPointModal
          coords={pendingCoords}
          onClose={() => setPendingCoords(null)}
          onSubmit={handleSubmitPoint}
        />
      )}
    </div>
  );
}
