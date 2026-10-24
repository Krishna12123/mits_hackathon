import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import { useState, useEffect } from 'react'
import L from 'leaflet'
import { Layers } from 'lucide-react'

// Mock GeoJSON flood extent for demonstration when real results are pending
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

const severityConfig = {
  severe: { fill: '#7c3aed', stroke: '#5b21b6', label: 'Severe Inundation' },
  high:   { fill: '#ef4444', stroke: '#b91c1c', label: 'High Inundation'   },
  medium: { fill: '#f59e0b', stroke: '#b45309', label: 'Medium Inundation' },
  low:    { fill: '#22c55e', stroke: '#15803d', label: 'Low Inundation'    },
}

function floodStyle(feature) {
  const sev = feature?.properties?.severity?.toLowerCase()
  const conf = severityConfig[sev] || { fill: '#166534', stroke: '#14532D' }
  return {
    fillColor: conf.fill,
    fillOpacity: 0.38,
    color: conf.stroke,
    weight: 2.5,
    opacity: 0.95,
  }
}

function gapFillStyle() {
  return {
    fillColor: '#166534',
    fillOpacity: 0.22,
    color: '#166534',
    weight: 2,
    opacity: 0.65,
    dashArray: '5 5',
  }
}

function onEachFeature(feature, layer) {
  if (feature && feature.properties) {
    const p = feature.properties
    const district = p.district || (p.cluster_id ? `Inundation Zone #${p.cluster_id}` : 'Flood Extent Area')
    const severity = p.severity || 'medium'
    const area = p.area_km2 ?? p.area_sqkm ?? '—'
    const conf = p.mean_confidence ? ` · Confidence: ${Math.round(p.mean_confidence * 100)}%` : ''
    const sevColor = p.severity === 'severe' ? '#7c3aed' : p.severity === 'high' ? '#b91c1c' : p.severity === 'low' ? '#15803d' : '#b45309'
    layer.bindPopup(`
      <div style="font-family:Inter,system-ui,sans-serif;min-width:180px;padding:2px">
        <h4 style="font-weight:700;margin:0 0 4px;color:#263238;font-size:13px">${district}</h4>
        <div style="font-size:12px;color:#374151;line-height:1.5">
          <p style="margin:2px 0"><strong>Severity:</strong> <span style="font-weight:600;text-transform:capitalize;color:${sevColor}">${severity}</span>${conf}</p>
          <p style="margin:2px 0"><strong>Flood Area:</strong> ${area} km²</p>
          ${p.depth_est_m ? `<p style="margin:2px 0"><strong>Est. Depth:</strong> ${p.depth_est_m} m</p>` : ''}
        </div>
      </div>
    `)
  }
}

/**
 * Validates whether an incoming object is a well-formed GeoJSON FeatureCollection or Feature
 */
function isValidGeoJSON(data) {
  if (!data || typeof data !== 'object') return false
  if (data.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length > 0) {
    return true
  }
  if (data.type === 'Feature' && data.geometry) {
    return true
  }
  return false
}

/**
 * Automatically fits map viewport bounds when GeoJSON flood extent updates
 */
function FitBounds({ data }) {
  const map = useMap()
  useEffect(() => {
    if (data && data.features && data.features.length > 0) {
      try {
        const layer = L.geoJSON(data)
        const bounds = layer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [36, 36], maxZoom: 11 })
        }
      } catch (err) {
        console.warn('FitBounds error:', err)
      }
    }
  }, [data, map])
  return null
}

/**
 * FloodMapViewer
 *
 * Props:
 *   height         — CSS height string (default '500px')
 *   showControls   — show flood layer toggle button
 *   showGapFill    — whether the SAR gap-fill toggle is visible
 *   floodGeoJSON   — real GeoJSON from completed backend job; falls back to mock demo data if null
 *   gapFillGeoJSON — real GeoJSON from backend; if null, gap-fill layer is hidden
 *   fallbackToMock — when false (default), only genuine data is rendered
 */
export default function FloodMapViewer({
  height         = '500px',
  showControls   = true,
  showGapFill    = false,
  floodGeoJSON   = null,
  gapFillGeoJSON = null,
  fallbackToMock = false,
}) {
  const [showFlood, setShowFlood] = useState(true)
  const [gapFillOn, setGapFillOn] = useState(true)

  const hasRealFloodData   = isValidGeoJSON(floodGeoJSON)
  const activeFloodData    = hasRealFloodData ? floodGeoJSON : (fallbackToMock ? mockFloodGeoJSON : null)
  const hasActiveFloodData = isValidGeoJSON(activeFloodData)

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#D1D5DB] shadow-sm dark:border-gray-800" style={{ height }}>
      <MapContainer
        center={[26.5, 85.8]}
        zoom={9}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Auto-fit map viewport to active flood extent */}
        {hasActiveFloodData && <FitBounds data={activeFloodData} />}

        {/* Flood extent layer (rendered only when active flood data exists) */}
        {showFlood && hasActiveFloodData && (
          <GeoJSON
            key={hasRealFloodData ? `flood-real-${activeFloodData.features?.length || 1}-${Date.now()}` : 'flood-mock'}
            data={activeFloodData}
            style={floodStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {/* SAR gap-fill layer — only renders real GeoJSON from backend.
            No fabricated gap-fill data is shown. */}
        {showGapFill && gapFillOn && gapFillGeoJSON && isValidGeoJSON(gapFillGeoJSON) && (
          <GeoJSON
            key="gap-fill-layer"
            data={gapFillGeoJSON}
            style={gapFillStyle}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur border border-[#D1D5DB] shadow-md dark:bg-gray-900/90 dark:border-gray-700 rounded-xl p-3.5 z-[1000]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-[#263238] dark:text-gray-300">Flood Legend</p>
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
              hasRealFloodData
                ? 'bg-[#E8F5E9] text-[#166534] border border-[#166534]/30'
                : hasActiveFloodData
                ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30'
                : 'bg-slate-100 text-[#6B7280] border border-[#D1D5DB] dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30'
            }`}
          >
            {hasRealFloodData ? 'Live Overlay' : hasActiveFloodData ? 'Demo Overlay' : 'Base Map Only'}
          </span>
        </div>

        {Object.entries(severityConfig).map(([level, cfg]) => (
          <div key={level} className="flex items-center gap-2 mb-1">
            <span
              className="w-3.5 h-3.5 rounded-sm border"
              style={{ backgroundColor: cfg.fill, borderColor: cfg.stroke, opacity: 0.85 }}
            />
            <span className="text-xs text-[#374151] dark:text-gray-400 capitalize font-medium">{cfg.label}</span>
          </div>
        ))}

        {/* Flood boundary outline indicator */}
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-[#D1D5DB] dark:border-gray-700">
          <span className="w-3.5 h-3.5 rounded-sm border-2 border-[#166534] bg-[#166534]/30" />
          <span className="text-xs text-[#374151] dark:text-gray-400 font-medium">Flood Extent Boundary</span>
        </div>

        {/* Gap-fill legend entry — only shown when layer is active */}
        {showGapFill && gapFillGeoJSON && (
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-[#D1D5DB] dark:border-gray-700">
            <span className="w-3.5 h-3.5 rounded-sm border border-dashed border-[#166534] dark:border-[#4cd7f6]" style={{ backgroundColor: '#166534', opacity: 0.4 }} />
            <span className="text-xs text-[#374151] dark:text-gray-400 font-medium">SAR Gap-fill</span>
          </div>
        )}
      </div>

      {/* Layer controls */}
      {showControls && (
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <button
            onClick={() => setShowFlood(v => !v)}
            className="bg-white/95 backdrop-blur border border-[#D1D5DB] shadow-md rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-semibold text-[#263238] hover:bg-[#F5F7F6] dark:bg-gray-900/90 dark:border-gray-700 dark:text-gray-300 dark:hover:text-white transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
            {showFlood ? 'Hide' : 'Show'} Flood Layer
          </button>

          {/* SAR gap-fill toggle — visible only when showGapFill prop is true */}
          {showGapFill && (
            <button
              onClick={() => setGapFillOn(v => !v)}
              className={[
                'backdrop-blur border rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-semibold shadow-md transition-colors',
                gapFillOn
                  ? 'bg-[#E8F5E9] border-[#166534] text-[#166534] dark:bg-[#4cd7f6]/15 dark:border-[#4cd7f6]/40 dark:text-[#4cd7f6]'
                  : 'bg-white/95 border-[#D1D5DB] text-[#263238] hover:bg-[#F5F7F6] dark:bg-gray-900/90 dark:border-gray-700 dark:text-gray-300 dark:hover:text-white',
              ].join(' ')}
              title={gapFillGeoJSON ? undefined : 'SAR gap-fill data unavailable until backend provides it'}
            >
              <Layers className="w-3.5 h-3.5" />
              {gapFillOn ? 'Hide' : 'Show'} Gap-fill
              {!gapFillGeoJSON && (
                <span className="text-[9px] text-[#6B7280] dark:text-gray-500 ml-1">(pending)</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
