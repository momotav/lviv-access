import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MapView from './components/MapView.jsx';
import AddPointModal from './components/AddPointModal.jsx';
import { CATEGORY_LIST } from './lib/categories.jsx';
import { api } from './lib/api.js';

export default function App() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState(CATEGORY_LIST);
  const [addMode, setAddMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [error, setError] = useState(null);

  // Load all points on mount
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

  const handleMapClick = useCallback((latlng) => {
    setPendingCoords({ lat: latlng.lat, lng: latlng.lng });
    setAddMode(false);
  }, []);

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

  const visiblePoints = points.filter((p) => activeFilters.includes(p.category));

  return (
    <div className="app">
      <Sidebar
        points={points}
        activeFilters={activeFilters}
        toggleFilter={toggleFilter}
        addMode={addMode}
        setAddMode={setAddMode}
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
            onMapClick={handleMapClick}
            onDeletePoint={handleDeletePoint}
            cancelAddMode={() => setAddMode(false)}
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
