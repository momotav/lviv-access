import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CATEGORIES, buildMarkerHtml } from '../lib/categories.jsx';

// Lviv center: Rynok Square
const LVIV_CENTER = [49.8419, 24.0315];
const DEFAULT_ZOOM = 15;

function buildIcon(category) {
  return L.divIcon({
    className: 'access-marker',
    html: buildMarkerHtml(category),
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -36],
  });
}

function ClickHandler({ onMapClick, addMode }) {
  useMapEvents({
    click(e) {
      if (addMode) onMapClick(e.latlng);
    },
  });
  return null;
}

function PopupRating({ rating }) {
  if (!rating) return null;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span key={i} className={i <= rating ? '' : 'empty'}>
        ★
      </span>
    );
  }
  return <div className="popup-rating">{stars}</div>;
}

export default function MapView({
  points,
  addMode,
  onMapClick,
  onDeletePoint,
  cancelAddMode,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && addMode) cancelAddMode();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode, cancelAddMode]);

  return (
    <div className="map-container" data-add-mode={addMode}>
      {addMode && (
        <div className="map-overlay map-overlay-top">
          <span>Click anywhere on the map to mark a location</span>
          <button onClick={cancelAddMode}>Cancel</button>
        </div>
      )}
      <MapContainer
        center={LVIV_CENTER}
        zoom={DEFAULT_ZOOM}
        className="map"
        scrollWheelZoom
      >
        {/* CartoDB Positron — clean, neutral basemap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <ClickHandler addMode={addMode} onMapClick={onMapClick} />

        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={buildIcon(p.category)}
          >
            <Popup>
              <div className="popup-category">
                {CATEGORIES[p.category]?.label || p.category}
              </div>
              <h3 className="popup-name">{p.name}</h3>
              {p.description && (
                <p className="popup-description">{p.description}</p>
              )}
              <PopupRating rating={p.accessibility_rating} />
              <button
                className="popup-delete"
                onClick={() => {
                  if (confirm('Remove this point?')) onDeletePoint(p.id);
                }}
              >
                Remove point
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
