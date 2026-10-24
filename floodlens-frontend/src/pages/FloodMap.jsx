import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import FloodMapViewer from '../components/map/FloodMapViewer'
import { Layers, Calendar, Download, Satellite, Sliders, Info, Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { liveAPI, floodAPI } from '../services/api'

const satellites = ['Sentinel-2', 'Sentinel-1', 'Landsat-8', 'Landsat-9']
const indices    = ['NDWI', 'MNDWI', 'NDVI']

export default function FloodMap() {
  const [selectedDate, setSelectedDate]       = useState('2026-10-19')
  const [comparisonDate, setComparisonDate]   = useState('2026-10-11')
  const [selectedSatellite, setSatellite]     = useState('Sentinel-2')
  const [selectedIndex, setIndex]             = useState('NDWI')
  const [showComparison, setShowComparison]   = useState(false)
  const [floodResult, setFloodResult]         = useState(null)
  const [loading, setLoading]                 = useState(false)

  // Fetch genuine backend detection results or use cached session result
  useEffect(() => {
    let isMounted = true

    async function loadFloodExtentData() {
      setLoading(true)
      try {
        // 1. Check local session cache first
        const cached = localStorage.getItem('fl_latest_result')
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            if (parsed && (parsed.geojson || parsed.type === 'FeatureCollection' || parsed.features)) {
              if (isMounted) {
                setFloodResult(parsed)
                setLoading(false)
                return
              }
            }
          } catch (_) {}
        }

        // 2. Fetch recent jobs from /api/live to obtain the latest completed run
        const liveData = await liveAPI.get()
        const recentJobs = liveData?.recent_jobs || []
        const latestCompleted = recentJobs.find((j) => j.status === 'completed')

        if (latestCompleted?.id) {
          const res = await floodAPI.results(latestCompleted.id)
          if (isMounted && res) {
            setFloodResult(res)
            if (latestCompleted.source && satellites.includes(latestCompleted.source)) {
              setSatellite(latestCompleted.source)
            }
          }
        }
      } catch (err) {
        console.warn('[FloodMap] Could not fetch latest detection results:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadFloodExtentData()
    return () => { isMounted = false }
  }, [])

  // Safely extract GeoJSON FeatureCollection
  const floodGeoJSON =
    floodResult?.geojson ??
    (floodResult?.type === 'FeatureCollection' ? floodResult : null)

  const floodedArea =
    floodResult?.flooded_area_km2 ??
    floodResult?.floodedAreaKm2 ??
    floodResult?.flood_extent_km2 ??
    (floodGeoJSON?.features?.reduce((acc, f) => acc + (f.properties?.area_sqkm || f.properties?.area_km2 || 0), 0)?.toFixed(1)) ??
    null

  const isLive = floodResult?.data_source === 'gee_live'
  const isDemo = floodResult?.data_source === 'synthetic_demo'
  const hasFeatures = floodGeoJSON?.features && floodGeoJSON.features.length > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#263238] dark:text-white font-display">Flood Map</h1>
          <p className="text-[#6B7280] dark:text-gray-400 text-sm mt-1">
            Interactive flood extent boundaries · Multi-temporal change detection
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/analysis"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#166534] bg-white hover:bg-[#F5F7F6] border border-[#166534] rounded-xl transition-all shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Configure Detection</span>
          </Link>
          <a
            href="/api/impact/export/geotiff"
            download
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-xl transition-all shadow-md active:bg-[#14532D]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export GeoTIFF</span>
          </a>
        </div>
      </div>

      {/* Controls bar */}
      <div className="bg-white border border-[#D1D5DB] shadow-sm rounded-2xl p-4 dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 flex flex-wrap items-center gap-4">
        {/* Satellite Selection */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
            <Satellite className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
          </div>
          <label className="text-xs text-[#263238] dark:text-gray-300 font-semibold">Satellite</label>
          <select
            value={selectedSatellite}
            onChange={(e) => setSatellite(e.target.value)}
            className="bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#263238] dark:bg-[#0b1326] dark:border-[#4cd7f6]/20 dark:text-[#dae2fd] px-3 py-1.5 focus:outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20 shadow-sm cursor-pointer hover:border-[#166534] transition-all"
          >
            {satellites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Spectral Index Selection */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
            <Layers className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
          </div>
          <label className="text-xs text-[#263238] dark:text-gray-300 font-semibold">Index</label>
          <select
            value={selectedIndex}
            onChange={(e) => setIndex(e.target.value)}
            className="bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#263238] dark:bg-[#0b1326] dark:border-[#4cd7f6]/20 dark:text-[#dae2fd] px-3 py-1.5 focus:outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20 shadow-sm cursor-pointer hover:border-[#166534] transition-all"
          >
            {indices.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        {/* Post-flood observation date */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
            <Calendar className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
          </div>
          <label className="text-xs text-[#263238] dark:text-gray-300 font-semibold">Post-flood</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#263238] dark:bg-[#0b1326] dark:border-[#4cd7f6]/20 dark:text-[#dae2fd] px-2.5 py-1.5 focus:outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20 shadow-sm transition-all"
          />
        </div>

        {/* Pre-flood comparison baseline date */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
            <Calendar className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
          </div>
          <label className="text-xs text-[#263238] dark:text-gray-300 font-semibold">Pre-flood</label>
          <input
            type="date"
            value={comparisonDate}
            onChange={(e) => setComparisonDate(e.target.value)}
            className="bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#263238] dark:bg-[#0b1326] dark:border-[#4cd7f6]/20 dark:text-[#dae2fd] px-2.5 py-1.5 focus:outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20 shadow-sm transition-all"
          />
        </div>

        {/* Split View Toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer ml-auto select-none">
          <span className="text-xs font-semibold text-[#263238] dark:text-white">Split View (Pre vs. Post)</span>
          <div
            onClick={() => setShowComparison((v) => !v)}
            className={`w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${
              showComparison ? 'bg-[#166534] dark:bg-[#4cd7f6]' : 'bg-[#D1D5DB] dark:bg-gray-700'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                showComparison ? 'left-5' : 'left-0.5'
              }`}
            />
          </div>
        </label>
      </div>

      {/* Provenance & Status Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 text-xs">
        <div className="flex items-center gap-2">
          {hasFeatures ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534] dark:text-green-400">
              <CheckCircle2 className="w-4 h-4 text-[#166534] dark:text-green-400" />
              Flood Boundaries Active ({floodGeoJSON.features.length} inundation clusters)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Base Map Active · No Flood Overlays Loaded
            </span>
          )}
          {floodedArea && (
            <span className="text-[#374151] dark:text-gray-300">
              · <strong>{floodedArea} km²</strong> inundation extent
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#166534]/30 bg-[#E8F5E9] text-[#166534] text-[11px] font-semibold dark:border-[#4cd7f6]/30 dark:bg-[#4cd7f6]/10 dark:text-[#4cd7f6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#166534] dark:bg-[#4cd7f6] animate-pulse" />
              Live Copernicus S2 SR
            </span>
          ) : isDemo ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-semibold dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
              Simulated Demo Scenario
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#D1D5DB] bg-[#F5F7F6] text-[#6B7280] text-[11px] font-semibold dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Reference Basemap
            </span>
          )}
        </div>
      </div>

      {/* Map Display (Split View or Single Map) */}
      {showComparison ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pre-flood Panel */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#263238] dark:text-gray-300 font-semibold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                Pre-flood Baseline · {comparisonDate}
              </p>
              <span className="text-[11px] text-[#6B7280] dark:text-gray-400">Unflooded baseline condition</span>
            </div>

            <div className="relative">
              <FloodMapViewer
                height="540px"
                floodGeoJSON={null}
                showControls={false}
              />
              {/* Honest pre-flood observation banner */}
              <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur border border-[#D1D5DB] shadow-md rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="font-semibold text-[#263238]">Pre-Flood Baseline</span>
                <span className="text-[#6B7280]">· Reference basemap (Satellite imagery unavailable)</span>
              </div>
            </div>
          </div>

          {/* Post-flood Panel */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#263238] dark:text-gray-300 font-semibold flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-[#166534]' : 'bg-red-500'}`} />
                Post-flood Inundation · {selectedDate}
              </p>
              <span className="text-[11px] text-[#166534] dark:text-green-400 font-semibold">
                {hasFeatures ? `${floodGeoJSON.features.length} flood polygons detected` : 'No flood layer'}
              </span>
            </div>

            <div className="relative">
              <FloodMapViewer
                height="540px"
                floodGeoJSON={floodGeoJSON}
                showControls={true}
              />
              {/* Post-flood status banner */}
              <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur border border-[#D1D5DB] shadow-md rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
                {hasFeatures ? (
                  <>
                    <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-[#166534] animate-pulse' : 'bg-amber-600'}`} />
                    <span className="font-semibold text-[#263238]">
                      {isLive ? 'Live Copernicus S2 SR Extent' : 'Simulated Demo Inundation'}
                    </span>
                    {floodedArea && (
                      <span className="text-[#166534] font-semibold">· {floodedArea} km²</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-semibold text-[#263238]">Post-Flood Extent</span>
                    <span className="text-[#6B7280]">· Run detection in Flood Analysis to view boundaries</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#263238] dark:text-gray-300 font-semibold">
              {selectedSatellite} · {selectedIndex} · {selectedDate}
            </p>
            {hasFeatures && (
              <span className="text-xs text-[#166534] dark:text-green-400 font-semibold">
                Flood Boundaries Visible ({floodGeoJSON.features.length} clusters)
              </span>
            )}
          </div>
          <div className="relative">
            <FloodMapViewer
              height="600px"
              floodGeoJSON={floodGeoJSON}
              showControls={true}
            />
            {/* Top-left notification badge */}
            <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur border border-[#D1D5DB] shadow-md rounded-xl px-3.5 py-2 flex items-center gap-2.5 text-xs">
              {hasFeatures ? (
                <>
                  <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-[#166534] animate-pulse' : 'bg-amber-600'}`} />
                  <span className="font-bold text-[#263238]">
                    {isLive ? 'Live GEE Copernicus S2 Flood Boundaries' : 'Simulated Demo Flood Boundaries'}
                  </span>
                  {floodedArea && (
                    <span className="text-[#166534] font-semibold">· {floodedArea} km² inundated</span>
                  )}
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="font-semibold text-[#263238]">Base Map Active</span>
                  <span className="text-[#6B7280]">· Run detection in Flood Analysis to display flood extent</span>
                  <Link to="/analysis" className="ml-1 text-[#166534] hover:underline font-semibold">
                    Go to Analysis &rarr;
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Informational Parameter Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Detection Threshold', value: `${selectedIndex} > 0.3 (Otsu)` },
          { label: 'Cloud Masking',      value: 'QA60 / SAR All-Weather'        },
          { label: 'Spatial Resolution',  value: `10 m (${selectedSatellite})`   },
          { label: 'Coordinate System',   value: 'EPSG:4326 (WGS 84)'            },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-[#D1D5DB] shadow-sm rounded-2xl p-4 dark:bg-[#131b2e] dark:border-[#4cd7f6]/10">
            <p className="text-xs text-[#6B7280] dark:text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
            <p className="text-sm text-[#263238] dark:text-white font-bold mt-1 font-display">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
