import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { buildMarkerHtml } from '../lib/categories.jsx';

const LVIV_CENTER = [49.8419, 24.0315];
const DEFAULT_ZOOM = 15;

// Per-mode polyline colours for transit
const TRANSIT_COLOR = '#0F4C5C';   // matches primary
const WALK_COLOR    = '#6B7280';   // muted grey for walking legs

function buildIcon(category) {
  return L.divIcon({
    className: 'access-marker',
    html: buildMarkerHtml(category),
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
  });
}

function buildEndpointIcon(label, color) {
  const html = `
    <div class="endpoint-pin" style="background:${color}">
      <span>${label}</span>
    </div>
  `;
  return L.divIcon({
    className: 'endpoint-marker',
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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

// Flip [[lng,lat]] -> [[lat,lng]] for Leaflet
const flip = (coords) => coords.map(([lng, lat]) => [lat, lng]);

export default function MapView({
  points,
  addMode,
  routingMode,
  onMapClick,
  onPointClick,
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

  const interactionMode = addMode
    ? 'add'
    : routingMode === 'from'
    ? 'route-from'
    : routingMode === 'to'
    ? 'route-to'
    : null;

  const overlayMessage = {
    add: 'Клацніть на карті, щоб додати точку',
    'route-from': 'Клацніть на карті — точка А (відправлення)',
    'route-to': 'Клацніть на карті — точка B (призначення)',
  }[interactionMode];

  // Determine which polylines to render
  // - Transit routes: per-leg, WALK dashed grey, transit solid teal
  // - Walk routes: single solid polyline (fallback to routeData.coordinates)
  const hasLegs = routeData?.legs && routeData.legs.length > 0;
  const fallbackLine = routeData && !hasLegs
    ? flip(routeData.coordinates)
    : null;

  return (
    <div className="map-container" data-add-mode={!!interactionMode}>
      {overlayMessage && (
        <div className="map-overlay map-overlay-top">
          <span>{overlayMessage}</span>
          <button onClick={cancelInteraction}>Скасувати</button>
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

        {/* Walk-mode route (single polyline) */}
        {fallbackLine && (
          <>
            <Polyline positions={fallbackLine} pathOptions={{ color: TRANSIT_COLOR, weight: 8, opacity: 0.25 }} />
            <Polyline positions={fallbackLine} pathOptions={{ color: TRANSIT_COLOR, weight: 5, opacity: 0.95 }} />
          </>
        )}

        {/* Transit-mode route (per-leg) */}
        {hasLegs && routeData.legs.map((leg, i) => {
          const positions = flip(leg.coordinates);
          if (positions.length < 2) return null;
          if (leg.mode === 'WALK') {
            return (
              <Polyline
                key={i}
                positions={positions}
                pathOptions={{
                  color: WALK_COLOR,
                  weight: 4,
                  opacity: 0.8,
                  dashArray: '4 8',
                  lineCap: 'round',
                }}
              />
            );
          }
          // Transit leg (TRAM / BUS / TROLLEYBUS)
          return (
            <React.Fragment key={i}>
              <Polyline positions={positions} pathOptions={{ color: TRANSIT_COLOR, weight: 8, opacity: 0.25 }} />
              <Polyline positions={positions} pathOptions={{ color: TRANSIT_COLOR, weight: 5, opacity: 0.95 }} />
            </React.Fragment>
          );
        })}

        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={buildIcon(p.category)}
            eventHandlers={{ click: () => onPointClick(p) }}
          />
        ))}

        {routeFrom && (
          <Marker
            position={[routeFrom.lat, routeFrom.lng]}
            icon={buildEndpointIcon('A', '#0F4C5C')}
          />
        )}
        {routeTo && (
          <Marker
            position={[routeTo.lat, routeTo.lng]}
            icon={buildEndpointIcon('B', '#E27D60')}
          />
        )}
      </MapContainer>
    </div>
  );
}
