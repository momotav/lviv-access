import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MapView from './components/MapView.jsx';
import AddPointModal from './components/AddPointModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import PointDetails from './components/PointDetails.jsx';
import { CATEGORY_LIST } from './lib/categories.jsx';
import { api, getToken, setToken } from './lib/api.js';

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

  const [currentUser, setCurrentUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [addMode, setAddMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);

  const [selectedPointId, setSelectedPointId] = useState(null);

  const [routingMode, setRoutingMode] = useState(null);
  const [routeFrom, setRouteFrom] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseLatLng(new URLSearchParams(window.location.search).get('from'));
  });
  const [routeTo, setRouteTo] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseLatLng(new URLSearchParams(window.location.search).get('to'));
  });
  const [waypointType, setWaypointType] = useState(null);
  // NEW: walk vs transit
  const [travelMode, setTravelMode] = useState('walk');
  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('from') || params.has('to')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      api.me()
        .then((data) => setCurrentUser(data.user))
        .catch(() => {
          setToken(null);
          setCurrentUser(null);
        });
    }
  }, []);

  const loadPoints = useCallback(() => {
    setLoading(true);
    api.listPoints()
      .then((data) => {
        setPoints(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Не вдалося з\'єднатися із сервером. Перевірте підключення.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

  const toggleFilter = useCallback((cat) => {
    setActiveFilters((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  const handleAddClicked = useCallback(() => {
    if (addMode) {
      setAddMode(false);
      return;
    }
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    setAddMode(true);
    setRoutingMode(null);
    setSelectedPointId(null);
  }, [addMode, currentUser]);

  const handleSetRoutingMode = useCallback((mode) => {
    setRoutingMode(mode);
    if (mode) {
      setAddMode(false);
      setSelectedPointId(null);
    }
  }, []);

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

  const handlePointClick = useCallback((point) => {
    if (addMode || routingMode) return;
    setSelectedPointId(point.id);
  }, [addMode, routingMode]);

  const handleSubmitPoint = useCallback(async (data) => {
    const newPoint = await api.createPoint(data);
    setPoints((prev) => [newPoint, ...prev]);
    setPendingCoords(null);
  }, []);

  const handlePointDeleted = useCallback((id) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    setSelectedPointId(null);
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
        // Transit ignores the toilet/charging waypoint
        waypointType: travelMode === 'transit' ? null : waypointType,
        travelMode,
      });
      setRouteData(data);
    } catch (err) {
      setRouteError(err.message || 'Не вдалося побудувати маршрут');
    } finally {
      setRouteLoading(false);
    }
  }, [routeFrom, routeTo, waypointType, travelMode]);

  const handleClearRoute = useCallback(() => {
    setRouteFrom(null);
    setRouteTo(null);
    setRouteData(null);
    setRouteError(null);
    setRoutingMode(null);
  }, []);

  // Clear any drawn route when the user switches modes
  const handleSetTravelMode = useCallback((mode) => {
    setTravelMode(mode);
    setRouteData(null);
    setRouteError(null);
  }, []);

  const cancelInteraction = useCallback(() => {
    setAddMode(false);
    setRoutingMode(null);
  }, []);

  const handleLogout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
  }, []);

  const handleAuthenticated = useCallback((user) => {
    setCurrentUser(user);
    setAuthModalOpen(false);
    loadPoints();
  }, [loadPoints]);

  const visiblePoints = points.filter((p) => activeFilters.includes(p.category));
  const selectedPoint = selectedPointId
    ? points.find((p) => p.id === selectedPointId)
    : null;

  return (
    <div className="app">
      <Sidebar
        points={points}
        activeFilters={activeFilters}
        toggleFilter={toggleFilter}
        addMode={addMode}
        setAddMode={setAddMode}
        routingMode={routingMode}
        setRoutingMode={handleSetRoutingMode}
        routeFrom={routeFrom}
        routeTo={routeTo}
        setRouteFrom={setRouteFrom}
        setRouteTo={setRouteTo}
        waypointType={waypointType}
        setWaypointType={setWaypointType}
        travelMode={travelMode}
        setTravelMode={handleSetTravelMode}
        onComputeRoute={handleComputeRoute}
        onClearRoute={handleClearRoute}
        routeData={routeData}
        routeError={routeError}
        routeLoading={routeLoading}
        currentUser={currentUser}
        onRequestLogin={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onAddClicked={handleAddClicked}
      />

      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {loading && <div className="loading">Завантаження карти…</div>}
        {error && (
          <div className="loading" style={{ color: 'var(--danger)', textAlign: 'center', maxWidth: 400 }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <MapView
            points={visiblePoints}
            addMode={addMode}
            routingMode={routingMode}
            onMapClick={handleMapClick}
            onPointClick={handlePointClick}
            cancelInteraction={cancelInteraction}
            routeFrom={routeFrom}
            routeTo={routeTo}
            routeData={routeData}
          />
        )}

        {selectedPoint && (
          <PointDetails
            point={selectedPoint}
            currentUser={currentUser}
            onClose={() => setSelectedPointId(null)}
            onDeleted={handlePointDeleted}
            onRequestLogin={() => setAuthModalOpen(true)}
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

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}
