import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet'
import { useEffect, useState } from 'react'
import { Layers, Maximize2 } from 'lucide-react'

// Mock GeoJSON flood extent for demo
const mockFloodGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { severity: 'high', area_km2: 124.5, district: 'Darbhanga' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[85.8, 26.1], [86.1, 26.1], [86.1, 26.4], [85.8, 26.4], [85.8, 26.1]]],
      },
    },
    {
      type: 'Feature',
      properties: { severity: 'severe', area_km2: 87.2, district: 'Sitamarhi' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[85.5, 26.5], [85.8, 26.5], [85.8, 26.8], [85.5, 26.8], [85.5, 26.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { severity: 'medium', area_km2: 43.1, district: 'Muzaffarpur' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[85.3, 26.0], [85.6, 26.0], [85.6, 26.2], [85.3, 26.2], [85.3, 26.0]]],
      },
    },
  ],
}

const severityColors = {
  low:    '#22c55e',
  medium: '#f59e0b',
  high:   '#ef4444',
  severe: '#7c3aed',
}

function floodStyle(feature) {
  const color = severityColors[feature.properties.severity] || '#3b82f6'
  return {
    fillColor: color,
    fillOpacity: 0.45,
    color: color,
    weight: 2,
    opacity: 0.8,
  }
}

function onEachFeature(feature, layer) {
  if (feature.properties) {
    const { district, severity, area_km2 } = feature.properties
    layer.bindPopup(`
      <div style="font-family:Inter,sans-serif;min-width:160px">
        <p style="font-weight:700;margin:0 0 4px">${district}</p>
        <p style="margin:0;color:#94a3b8;font-size:12px">Severity: <b style="color:#f87171">${severity}</b></p>
        <p style="margin:0;color:#94a3b8;font-size:12px">Flood Area: ${area_km2} km²</p>
      </div>
    `)
  }
}

export default function FloodMapViewer({ height = '500px', showControls = true }) {
  const [showFlood, setShowFlood] = useState(true)

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-800" style={{ height }}>
      <MapContainer
        center={[26.3, 85.8]}
        zoom={9}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showFlood && (
          <GeoJSON
            key="flood-layer"
            data={mockFloodGeoJSON}
            style={floodStyle}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg p-3 z-[1000]">
        <p className="text-xs font-semibold text-gray-300 mb-2">Flood Severity</p>
        {Object.entries(severityColors).map(([level, color]) => (
          <div key={level} className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400 capitalize">{level}</span>
          </div>
        ))}
      </div>

      {/* Layer toggle */}
      {showControls && (
        <button
          onClick={() => setShowFlood(v => !v)}
          className="absolute top-4 right-4 z-[1000] bg-gray-900/90 backdrop-blur border border-gray-700 
                     rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-gray-300 hover:text-white transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          {showFlood ? 'Hide' : 'Show'} Flood Layer
        </button>
      )}
    </div>
  )
}
