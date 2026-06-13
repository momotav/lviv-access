import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { buildMarkerHtml } from '../lib/categories.jsx';

const LVIV_CENTER = [49.8419, 24.0315];
const DEFAULT_ZOOM = 15;

// Per-mode polyline colours for transit
const TRANSIT_COLOR = '#0F4C5C';   // matches primary
const WALK_COLOR    = '#6B7280';   // muted grey for walking legs

// Ukrainian labels used in stop tooltips
const MODE_LABELS = {
  TRAM:       'Трамвай',
  BUS:        'Автобус',
  TROLLEYBUS: 'Тролейбус',
};

const ROLE_LABELS = {
  board:  'Посадка',
  pass:   'Зупинка',
  alight: 'Висадка',
};

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

// Small circle marker for transit stops along a route.
// "board" / "alight" — slightly bigger, white border
// "pass" — small dot, no border
function buildStopIcon(role) {
  const isEndpoint = role === 'board' || role === 'alight';
  const size = isEndpoint ? 14 : 9;
  const html = `<div class="transit-stop-dot" data-role="${role}"></div>`;
  return L.divIcon({
    className: 'transit-stop-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

// =====================================================================
// CLUSTERING
// =====================================================================
//
// Below zoom level 15 individual markers become hard to distinguish, so
// we group nearby points into cluster bubbles. The clustering is grid-based:
//
//   1. Snap each point to a cell (cell size grows as you zoom out)
//   2. Points in the same cell form one cluster
//   3. Cells with only 1 point render as a normal individual marker
//
// On click of a cluster the map zooms in by 2 levels (Leaflet caps at maxZoom).
// At zoom ≥ 15 clustering is disabled — every marker is shown individually.

const CLUSTER_THRESHOLD_ZOOM = 15;  // zoom level at which we stop clustering

// Cell size in degrees latitude per grid cell, indexed by zoom.
// Smaller cells when zoomed in (more detail), larger when zoomed out.
function cellSizeForZoom(zoom) {
  // Approx 60-100 px on screen — tuned visually.
  if (zoom <= 10) return 0.05;
  if (zoom <= 11) return 0.025;
  if (zoom <= 12) return 0.012;
  if (zoom <= 13) return 0.006;
  return 0.003; // zoom 14
}

function clusterPoints(points, zoom) {
  if (zoom >= CLUSTER_THRESHOLD_ZOOM) {
    // No clustering — every point is its own "cluster" of 1
    return points.map((p) => ({ type: 'single', point: p }));
  }

  const cellSize = cellSizeForZoom(zoom);
  const cells = new Map();

  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)}|${Math.floor(p.lng / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }

  const result = [];
  for (const [, group] of cells) {
    if (group.length === 1) {
      result.push({ type: 'single', point: group[0] });
    } else {
      // Cluster centroid = average of contained points
      let sumLat = 0, sumLng = 0;
      for (const p of group) { sumLat += p.lat; sumLng += p.lng; }
      result.push({
        type: 'cluster',
        lat: sumLat / group.length,
        lng: sumLng / group.length,
        count: group.length,
        points: group,
      });
    }
  }
  return result;
}

function buildClusterIcon(count) {
  // Size scales with point count
  const size = count >= 30 ? 56 : count >= 10 ? 46 : 38;
  const html = `<div class="cluster-bubble" style="width:${size}px;height:${size}px">${count}</div>`;
  return L.divIcon({
    className: 'cluster-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Tracks current zoom so that clustering updates as the user zooms in/out
function ZoomTracker({ onZoomChange }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
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

  // Current map zoom — drives clustering decisions
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [mapRef, setMapRef] = useState(null);

  // Recompute clusters whenever points or zoom change
  const clusters = useMemo(() => clusterPoints(points, zoom), [points, zoom]);

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
      <MapContainer
        center={LVIV_CENTER}
        zoom={DEFAULT_ZOOM}
        className="map"
        scrollWheelZoom
        ref={setMapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <ClickHandler addMode={addMode} routingMode={routingMode} onMapClick={onMapClick} />
        <ZoomTracker onZoomChange={setZoom} />

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

        {/* Transit stops along the route (only for transit mode) */}
        {hasLegs && routeData.legs.flatMap((leg, legIdx) => {
          if (leg.mode === 'WALK' || !leg.stops) return [];

          const modeLabel = MODE_LABELS[leg.mode] || leg.mode;
          const routeLabel = leg.route ? `${modeLabel} ${leg.route}` : modeLabel;

          return leg.stops.map((stop, stopIdx) => {
            const roleLabel = ROLE_LABELS[stop.role] || '';
            return (
              <Marker
                key={`stop-${legIdx}-${stopIdx}`}
                position={[stop.lat, stop.lng]}
                icon={buildStopIcon(stop.role)}
                zIndexOffset={-100}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -8]}
                  opacity={1}
                  className="stop-tooltip"
                >
                  <div className="stop-tooltip-eyebrow">{roleLabel} · {routeLabel}</div>
                  <div className="stop-tooltip-name">{stop.name}</div>
                </Tooltip>
              </Marker>
            );
          });
        })}

        {clusters.map((c, i) => {
          if (c.type === 'single') {
            const p = c.point;
            return (
              <Marker
                key={`pt-${p.id}`}
                position={[p.lat, p.lng]}
                icon={buildIcon(p.category)}
                eventHandlers={{ click: () => onPointClick(p) }}
              />
            );
          }
          // Cluster bubble
          return (
            <Marker
              key={`cluster-${i}`}
              position={[c.lat, c.lng]}
              icon={buildClusterIcon(c.count)}
              eventHandlers={{
                click: () => {
                  if (!mapRef) return;
                  const newZoom = Math.min(mapRef.getMaxZoom(), zoom + 2);
                  mapRef.setView([c.lat, c.lng], newZoom, { animate: true });
                },
              }}
            />
          );
        })}

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
