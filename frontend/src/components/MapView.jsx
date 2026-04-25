import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CATEGORIES, buildMarkerHtml } from '../lib/categories.jsx';

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

// Endpoint markers (A and B)
function buildEndpointIcon(label, color) {
  const html = `
    <div class="endpoint-pin" style="background:${color}">
      <span>${label}</span>
    </div>
  `;
  return L.divIcon({
    className: 'endpoint-marker',
    html,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function ClickHandler({ onMapClick, addMode, routingMode }) {
  useMapEvents({
    click(e) {
      if (addMode || routingMode) onMapClick(e.latlng);
    },
  });
  return null;
}

function PopupRating({ rating }) {
  if (!rating) return null;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(<span key={i} className={i <= rating ? '' : 'empty'}>★</span>);
  }
  return <div className="popup-rating">{stars}</div>;
}

export default function MapView({
  points,
  addMode,
  routingMode,
  onMapClick,
  onDeletePoint,
  cancelInteraction,
  routeFrom,
  routeTo,
  routeData,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && (addMode || routingMode)) cancelInteraction();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode, routingMode, cancelInteraction]);

  // Convert ORS coords [[lng,lat], ...] to Leaflet [[lat,lng], ...]
  const routePolyline = routeData
    ? routeData.coordinates.map(([lng, lat]) => [lat, lng])
    : null;

  const interactionMode = addMode
    ? 'add'
    : routingMode === 'from'
    ? 'route-from'
    : routingMode === 'to'
    ? 'route-to'
    : null;

  const overlayMessage = {
    add: 'Click anywhere on the map to mark a location',
    'route-from': 'Click on the map to set the start point (A)',
    'route-to': 'Click on the map to set the destination (B)',
  }[interactionMode];

  return (
    <div className="map-container" data-add-mode={!!interactionMode}>
      {overlayMessage && (
        <div className="map-overlay map-overlay-top">
          <span>{overlayMessage}</span>
          <button onClick={cancelInteraction}>Cancel</button>
        </div>
      )}
      <MapContainer center={LVIV_CENTER} zoom={DEFAULT_ZOOM} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <ClickHandler addMode={addMode} routingMode={routingMode} onMapClick={onMapClick} />

        {/* Route polyline — drawn first so markers sit on top */}
        {routePolyline && (
          <>
            {/* Subtle outline for legibility */}
            <Polyline
              positions={routePolyline}
              pathOptions={{ color: '#1a1410', weight: 8, opacity: 0.25 }}
            />
            {/* Main accent line */}
            <Polyline
              positions={routePolyline}
              pathOptions={{ color: '#b5371b', weight: 5, opacity: 0.95 }}
            />
          </>
        )}

        {/* All accessibility points */}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={buildIcon(p.category)}>
            <Popup>
              <div className="popup-category">
                {CATEGORIES[p.category]?.label || p.category}
              </div>
              <h3 className="popup-name">{p.name}</h3>
              {p.description && <p className="popup-description">{p.description}</p>}
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

        {/* Endpoint markers */}
        {routeFrom && (
          <Marker
            position={[routeFrom.lat, routeFrom.lng]}
            icon={buildEndpointIcon('A', '#3e5a3a')}
          />
        )}
        {routeTo && (
          <Marker
            position={[routeTo.lat, routeTo.lng]}
            icon={buildEndpointIcon('B', '#b5371b')}
          />
        )}
      </MapContainer>
    </div>
  );
}
