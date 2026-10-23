import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import SeverityBadge from '../components/ui/SeverityBadge'
import Spinner from '../components/ui/Spinner'
import { settlementAPI, reportAPI } from '../services/api'
import { MOCK_SETTLEMENTS, getTotalArea, getFloodedArea } from '../services/settlementData'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Search,
  Users,
  Home,
  Wheat,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  AlertTriangle,
  Info,
  MapPin,
  Filter,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
  Check,
  FileJson,
  Layers,
  Printer,
} from 'lucide-react'

const IMPACT_LEVELS = [
  { key: 'all',    label: 'All Settlements' },
  { key: 'severe', label: 'Severe'          },
  { key: 'high',   label: 'High'            },
  { key: 'medium', label: 'Medium'          },
  { key: 'low',    label: 'Low'             },
  { key: 'safe',   label: 'Safe'            },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// RFC 4180 CSV escaping for values with commas, quotes, or line breaks
function escapeCSVValue(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Custom Tooltip for Pie / Donut Chart
function PieCustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0]
    return (
      <div className="bg-[#0b1326]/95 border border-[#4cd7f6]/25 rounded-xl px-3 py-2 text-xs shadow-xl backdrop-blur-md">
        <p className="font-semibold text-white">{item.name}</p>
        <p className="text-[#dae2fd]/70 mt-0.5">
          Count: <span className="font-bold text-white font-mono">{item.value}</span>
          {item.payload?.pct !== undefined ? ` (${item.payload.pct}%)` : ''}
        </p>
      </div>
    )
  }
  return null
}

// Custom Tooltip for Bar Chart
function BarCustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload
    return (
      <div className="bg-[#0b1326]/95 border border-[#4cd7f6]/25 rounded-xl px-3 py-2 text-xs shadow-xl backdrop-blur-md">
        <p className="font-semibold text-white">{item.name} Impact Tier</p>
        <p className="text-[#dae2fd]/70 mt-0.5">
          Settlements: <span className="font-bold text-white font-mono">{item.count}</span>
        </p>
        {item.count > 0 && item.avgFloodedPct !== undefined && (
          <p className="text-[#dae2fd]/50 text-[10px] mt-0.5">
            Avg Flood Extent: {item.avgFloodedPct}%
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function Settlements() {
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [isDemoData, setIsDemoData]   = useState(false)

  // Export action states
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [geoJsonSuccess, setGeoJsonSuccess]   = useState(false)
  const [geoTiffLoading, setGeoTiffLoading]   = useState(false)
  const [exportNotice, setExportNotice]       = useState(null)

  // Filters & Search
  const [search, setSearch]                 = useState('')
  const [filterSeverity, setFilterSeverity] = useState('all')

  // Sorting: 'desc' | 'asc'
  const [sortOrder, setSortOrder]           = useState('desc')

  // Fetch settlements from backend API
  const fetchSettlements = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await settlementAPI.list()
      const list = response?.settlements ?? (Array.isArray(response) ? response : null)
      if (list && list.length > 0) {
        setSettlements(list)
        setIsDemoData(false)
      } else {
        // Fallback to reference demonstration data if backend is unseeded
        setSettlements(MOCK_SETTLEMENTS)
        setIsDemoData(true)
      }
    } catch (err) {
      setError(err?.message || 'Unable to connect to settlements API.')
      // Graceful degradation: show clearly labeled mock data for UI testing
      setSettlements(MOCK_SETTLEMENTS)
      setIsDemoData(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettlements()
  }, [fetchSettlements])

  // Toggle sort order between descending and ascending
  const handleSortToggle = () => {
    setSortOrder(current => (current === 'desc' ? 'asc' : 'desc'))
  }

  // Filter and sort items — this single dataset drives the table, charts, AND all exports
  const processedSettlements = useMemo(() => {
    const filtered = settlements.filter(s => {
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.district.toLowerCase().includes(query)

      const matchesSeverity =
        filterSeverity === 'all' ||
        (s.severity && s.severity.toLowerCase() === filterSeverity.toLowerCase())

      return matchesSearch && matchesSeverity
    })

    return filtered.sort((a, b) => {
      const aVal = a.flooded_pct ?? 0
      const bVal = b.flooded_pct ?? 0
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [settlements, search, filterSeverity, sortOrder])

  // Check if current dataset has valid geospatial geometries for GeoJSON export
  const hasValidGeoJSON = useMemo(() => {
    return processedSettlements.some(
      s => (s.geom_geojson && s.geom_geojson.type) || (Array.isArray(s.coordinates) && s.coordinates.length === 2)
    )
  }, [processedSettlements])

  // Summary statistics calculated from the active dataset
  const summaryStats = useMemo(() => {
    const list = processedSettlements
    const atRiskPop = list.reduce(
      (sum, s) => sum + Math.round((s.population || 0) * ((s.flooded_pct || 0) / 100)),
      0
    )
    const affectedHomes = list.reduce(
      (sum, s) => sum + Math.round((s.homes || 0) * ((s.flooded_pct || 0) / 100)),
      0
    )
    const affectedFarmsHa = list.reduce(
      (sum, s) => sum + Math.round((s.farms_ha || 0) * ((s.flooded_pct || 0) / 100)),
      0
    )
    return { atRiskPop, affectedHomes, affectedFarmsHa }
  }, [processedSettlements])

  // ─── Chart Calculations (derived from same processed dataset) ───────────────

  // Chart 1: Affected vs Safe Settlements
  const safetyDistribution = useMemo(() => {
    let affectedCount = 0
    let safeCount = 0

    processedSettlements.forEach(s => {
      const isSafe = (s.severity && s.severity.toLowerCase() === 'safe') || (s.flooded_pct === 0)
      if (isSafe) {
        safeCount++
      } else {
        affectedCount++
      }
    })

    const total = affectedCount + safeCount

    return [
      {
        name: 'Affected Settlements',
        value: affectedCount,
        pct: total > 0 ? Math.round((affectedCount / total) * 100) : 0,
        color: '#ffb95f', // warm amber for affected
      },
      {
        name: 'Safe Settlements',
        value: safeCount,
        pct: total > 0 ? Math.round((safeCount / total) * 100) : 0,
        color: '#4cd7f6', // cyan for safe
      },
    ]
  }, [processedSettlements])

  // Chart 2: Severity Tier Breakdown
  const severityDistribution = useMemo(() => {
    const counts = {
      severe: { count: 0, totalPct: 0 },
      high:   { count: 0, totalPct: 0 },
      medium: { count: 0, totalPct: 0 },
      low:    { count: 0, totalPct: 0 },
      safe:   { count: 0, totalPct: 0 },
    }

    processedSettlements.forEach(s => {
      const sev = s.severity ? s.severity.toLowerCase() : (s.flooded_pct > 0 ? 'medium' : 'safe')
      if (counts[sev]) {
        counts[sev].count++
        counts[sev].totalPct += (s.flooded_pct || 0)
      } else {
        counts.low.count++
        counts.low.totalPct += (s.flooded_pct || 0)
      }
    })

    return [
      {
        key: 'severe',
        name: 'Severe',
        count: counts.severe.count,
        avgFloodedPct: counts.severe.count ? Math.round(counts.severe.totalPct / counts.severe.count) : 0,
        color: '#c084fc', // purple-400
      },
      {
        key: 'high',
        name: 'High',
        count: counts.high.count,
        avgFloodedPct: counts.high.count ? Math.round(counts.high.totalPct / counts.high.count) : 0,
        color: '#f87171', // red-400
      },
      {
        key: 'medium',
        name: 'Medium',
        count: counts.medium.count,
        avgFloodedPct: counts.medium.count ? Math.round(counts.medium.totalPct / counts.medium.count) : 0,
        color: '#facc15', // yellow-400
      },
      {
        key: 'low',
        name: 'Low',
        count: counts.low.count,
        avgFloodedPct: counts.low.count ? Math.round(counts.low.totalPct / counts.low.count) : 0,
        color: '#4ade80', // green-400
      },
      {
        key: 'safe',
        name: 'Safe',
        count: counts.safe.count,
        avgFloodedPct: 0,
        color: '#4cd7f6', // cyan
      },
    ]
  }, [processedSettlements])

  // ─── CSV Download Handler (Day 4 — Step 3) ──────────────────────────────────
  const handleDownloadCSV = useCallback(() => {
    if (!processedSettlements || processedSettlements.length === 0) return

    // Standard RFC 4180 CSV columns matching table structure
    const headers = [
      'Settlement Name',
      'District',
      'Total Area (km²)',
      'Flooded Area (km²)',
      'Flood-Affected (%)',
      'Impact Flag',
      'Population',
      'Estimated Homes Affected',
      'Flooded Farmland (ha)',
      'Dataset Status',
    ]

    // Rows mapped in the current sorted and filtered order
    const rows = processedSettlements.map(s => {
      const totalArea = getTotalArea(s)
      const floodedArea = getFloodedArea(s)
      const pct = Math.round(s.flooded_pct || 0)

      return [
        escapeCSVValue(s.name),
        escapeCSVValue(s.district),
        escapeCSVValue(totalArea !== null ? totalArea : ''),
        escapeCSVValue(floodedArea !== null ? floodedArea : ''),
        escapeCSVValue(pct),
        escapeCSVValue(s.severity ? s.severity.toUpperCase() : 'UNKNOWN'),
        escapeCSVValue(s.population || 0),
        escapeCSVValue(s.homes || 0),
        escapeCSVValue(s.farms_ha || 0),
        escapeCSVValue(isDemoData ? 'Reference Demonstration Data' : 'Live Satellite Analysis'),
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\r\n')

    // UTF-8 BOM ensures spreadsheet applications (Excel, Numbers, LibreOffice) recognize encoding
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const dateStamp = new Date().toISOString().slice(0, 10)
    const filterSuffix = filterSeverity !== 'all' ? `_${filterSeverity}` : ''
    const filename = `floodlens_settlements${filterSuffix}_${dateStamp}.csv`

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 2500)
  }, [processedSettlements, filterSeverity, isDemoData])

  // ─── GeoJSON Export Handler (Day 4 — Step 4) ───────────────────────────────
  const handleExportGeoJSON = useCallback(() => {
    if (!processedSettlements || processedSettlements.length === 0) return

    // Valid features: requires genuine geospatial point coordinates or backend geom_geojson
    const validFeatures = processedSettlements
      .filter(
        s => (s.geom_geojson && s.geom_geojson.type) || (Array.isArray(s.coordinates) && s.coordinates.length === 2)
      )
      .map(s => ({
        type: 'Feature',
        id: s.id,
        geometry: s.geom_geojson || {
          type: 'Point',
          coordinates: s.coordinates,
        },
        properties: {
          name: s.name,
          district: s.district,
          total_area_km2: getTotalArea(s),
          flooded_area_km2: getFloodedArea(s),
          flooded_pct: s.flooded_pct,
          severity: s.severity,
          population: s.population,
          homes: s.homes,
          farms_ha: s.farms_ha,
          data_mode: isDemoData ? 'Reference Demonstration Data' : 'Live Satellite Analysis',
        },
      }))

    if (validFeatures.length === 0) {
      setExportNotice({
        type: 'unavailable',
        message:
          'GeoJSON export unavailable: Selected settlement records contain no valid geospatial geometries (missing coordinates or polygon boundaries).',
      })
      return
    }

    const featureCollection = {
      type: 'FeatureCollection',
      name: 'floodlens_settlement_impact',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
      features: validFeatures,
    }

    const jsonString = JSON.stringify(featureCollection, null, 2)
    const blob = new Blob([jsonString], { type: 'application/geo+json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const dateStamp = new Date().toISOString().slice(0, 10)
    const filterSuffix = filterSeverity !== 'all' ? `_${filterSeverity}` : ''
    const filename = `floodlens_settlements${filterSuffix}_${dateStamp}.geojson`

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setGeoJsonSuccess(true)
    setTimeout(() => setGeoJsonSuccess(false), 2500)
  }, [processedSettlements, filterSeverity, isDemoData])

  // ─── GeoTIFF Export Handler (Day 4 — Step 4) ───────────────────────────────
  const handleExportGeoTIFF = useCallback(async () => {
    setGeoTiffLoading(true)
    setExportNotice(null)
    try {
      // 1. Query existing backend reports endpoint for genuine GeoTIFF artifacts
      const response = await reportAPI.list()
      const reports = response?.reports ?? (Array.isArray(response) ? response : [])
      const tiffReport = reports.find(
        r => r.type?.toLowerCase() === 'geotiff' && r.status === 'ready'
      )

      if (tiffReport && tiffReport.id) {
        // 2. Stream and preserve genuine binary .tif file via reportAPI
        const blobData = await reportAPI.download(tiffReport.id)
        const blob = new Blob([blobData], { type: 'image/tiff' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `${tiffReport.id}.tif`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        setExportNotice({
          type: 'success',
          message: `Successfully downloaded GeoTIFF raster artifact: ${tiffReport.id}.tif`,
        })
      } else {
        // Honest notification: never synthesize or fake a GeoTIFF
        setExportNotice({
          type: 'unavailable',
          message:
            'GeoTIFF raster export unavailable: The backend detection pipeline has not generated a classified .tif raster artifact yet. Run a flood analysis job with raster output enabled to generate downloadable GeoTIFFs.',
        })
      }
    } catch (err) {
      setExportNotice({
        type: 'unavailable',
        message:
          'GeoTIFF raster export unavailable: Unable to reach backend reports service. A live backend with generated .tif artifacts is required.',
      })
    } finally {
      setGeoTiffLoading(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Settlement Impact</h1>
          <p className="text-[#dae2fd]/50 text-sm mt-1">
            Spatial intersection of satellite flood extents with OpenStreetMap settlement footprints.
          </p>
        </div>

        {/* Action Buttons: Export CSV, GeoJSON, GeoTIFF, Report + Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Printable Report */}
          <Link
            to="/dashboard/settlements/report"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#131b2e] border border-[#4cd7f6]/25 text-[#4cd7f6] hover:bg-[#4cd7f6]/10 active:bg-[#4cd7f6]/15 transition-all"
            title="Open printable settlement impact summary report"
            aria-label="View Printable Settlement Impact Report"
          >
            <Printer className="w-3.5 h-3.5" />
            Printable Report
          </Link>

          {/* Download CSV */}
          <button
            onClick={handleDownloadCSV}
            disabled={loading || processedSettlements.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              downloadSuccess
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-[#4cd7f6] text-[#0b1326] hover:bg-[#4cd7f6]/90 active:bg-[#4cd7f6]/80 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title={
              processedSettlements.length === 0
                ? 'No settlements match current filters to export'
                : `Export current view (${processedSettlements.length} rows) as CSV`
            }
            aria-label="Download CSV of current settlement impact view"
          >
            {downloadSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                CSV Saved
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </>
            )}
          </button>

          {/* Export GeoJSON */}
          <button
            onClick={handleExportGeoJSON}
            disabled={loading || !hasValidGeoJSON}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              geoJsonSuccess
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-[#131b2e] border-[#4cd7f6]/25 text-[#4cd7f6] hover:bg-[#4cd7f6]/10 active:bg-[#4cd7f6]/15 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title={
              !hasValidGeoJSON
                ? 'GeoJSON export unavailable: no valid coordinates or polygon geometry in current records'
                : `Export ${processedSettlements.length} settlement features as RFC 7946 GeoJSON (.geojson)`
            }
            aria-label="Export GeoJSON of settlement impact features"
          >
            {geoJsonSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                GeoJSON Saved
              </>
            ) : (
              <>
                <FileJson className="w-3.5 h-3.5" />
                Export GeoJSON
              </>
            )}
          </button>

          {/* Export GeoTIFF */}
          <button
            onClick={handleExportGeoTIFF}
            disabled={geoTiffLoading || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#131b2e] border border-[#dae2fd]/20 text-[#dae2fd]/80 hover:text-white hover:border-[#dae2fd]/40 active:bg-[#dae2fd]/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download classified flood raster artifact (.tif) from backend processing"
            aria-label="Export GeoTIFF raster artifact"
          >
            {geoTiffLoading ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                Checking Raster…
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5 text-[#ffb95f]" />
                Export GeoTIFF
              </>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchSettlements}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#131b2e] border border-[#4cd7f6]/20 text-[#4cd7f6] hover:bg-[#4cd7f6]/10 active:bg-[#4cd7f6]/15 transition-colors disabled:opacity-50"
            aria-label="Refresh settlement data"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Export Feedback Notice ────────────────────────────────────── */}
      {exportNotice && (
        <div
          className={`flex items-start justify-between gap-3 p-4 rounded-xl border text-xs ${
            exportNotice.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-[#ffb95f]/30 bg-[#ffb95f]/10 text-[#ffb95f]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {exportNotice.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#ffb95f]" />
            )}
            <p className="leading-relaxed">{exportNotice.message}</p>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-[#dae2fd]/50 hover:text-white text-xs font-bold px-1"
            aria-label="Dismiss export notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Demo Notice / Backend Error Banner ───────────────────────── */}
      {isDemoData && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-[#ffb95f]/25 bg-[#ffb95f]/5 text-xs text-[#dae2fd]/70">
          <Info className="w-4 h-4 text-[#ffb95f] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-[#ffb95f]">
              Demonstration Mode — Illustrative Reference Data
            </p>
            <p className="text-[#dae2fd]/60 leading-relaxed">
              {error
                ? `Live settlement backend service is currently unreachable (${error}). Showing illustrative reference data for UI evaluation.`
                : 'No live records were returned by the backend. Showing baseline reference data for demonstration purposes.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Users,
            label: 'At-Risk Population',
            value: summaryStats.atRiskPop.toLocaleString(),
            unit: 'people',
          },
          {
            icon: Home,
            label: 'Estimated Affected Homes',
            value: summaryStats.affectedHomes.toLocaleString(),
            unit: 'structures',
          },
          {
            icon: Wheat,
            label: 'Flooded Farmland',
            value: summaryStats.affectedFarmsHa.toLocaleString(),
            unit: 'ha',
          },
        ].map(({ icon: Icon, label, value, unit }) => (
          <div
            key={label}
            className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-4 flex items-center gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-[#4cd7f6]" />
            </div>
            <div>
              <p className="text-xl font-bold text-white font-display">
                {value}
                <span className="text-xs font-normal text-[#dae2fd]/40 ml-1.5">{unit}</span>
              </p>
              <p className="text-xs text-[#dae2fd]/45 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Settlement Impact Charts (Day 4 — Step 2) ────────────────── */}
      <div className="space-y-3">
        {/* Chart Section Header with Active Filter Feedback */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#4cd7f6]" />
            <h2 className="text-sm font-semibold text-white font-display">
              Settlement Impact Analytics
            </h2>
          </div>
          {(filterSeverity !== 'all' || search) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#4cd7f6]/10 border border-[#4cd7f6]/20 text-[#4cd7f6] text-[11px]">
              <Info className="w-3 h-3" />
              Charts reflect active filters ({processedSettlements.length} settlements)
            </span>
          )}
        </div>

        {/* Chart Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Affected vs. Safe Settlements (Pie/Donut) */}
          <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white font-display flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-[#4cd7f6]" />
                  Affected vs. Safe Settlements
                </h3>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5">
                  Proportion of analyzed settlements impacted by floodwaters
                </p>
              </div>
            </div>

            {loading ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2">
                <Spinner size="sm" />
                <p className="text-xs text-[#dae2fd]/40">Loading chart data…</p>
              </div>
            ) : processedSettlements.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2 text-center">
                <MapPin className="w-6 h-6 text-[#dae2fd]/20" />
                <p className="text-xs text-[#dae2fd]/40">No settlement data matches current filters</p>
              </div>
            ) : (
              <div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={safetyDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={75}
                        paddingAngle={3}
                        stroke="#0b1326"
                        strokeWidth={2}
                      >
                        {safetyDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieCustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom Responsive Legend */}
                <div className="flex items-center justify-center gap-6 pt-2 border-t border-[#4cd7f6]/8 flex-wrap">
                  {safetyDistribution.map(item => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-[#dae2fd]/70">
                        {item.name}:{' '}
                        <strong className="text-white font-mono">{item.value}</strong>{' '}
                        <span className="text-[#dae2fd]/40">({item.pct}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chart 2: Impact Tier Distribution (Bar Chart) */}
          <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white font-display flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#4cd7f6]" />
                  Impact Severity Distribution
                </h3>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5">
                  Settlement count across flood severity categories
                </p>
              </div>
            </div>

            {loading ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2">
                <Spinner size="sm" />
                <p className="text-xs text-[#dae2fd]/40">Loading chart data…</p>
              </div>
            ) : processedSettlements.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2 text-center">
                <MapPin className="w-6 h-6 text-[#dae2fd]/20" />
                <p className="text-xs text-[#dae2fd]/40">No settlement data matches current filters</p>
              </div>
            ) : (
              <div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={severityDistribution}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(76, 215, 246, 0.08)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#dae2fd"
                        opacity={0.4}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(76, 215, 246, 0.15)' }}
                      />
                      <YAxis
                        stroke="#dae2fd"
                        opacity={0.4}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(76, 215, 246, 0.15)' }}
                        allowDecimals={false}
                      />
                      <Tooltip content={<BarCustomTooltip />} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {severityDistribution.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sub-legend indicator */}
                <div className="flex items-center justify-center gap-4 pt-2 border-t border-[#4cd7f6]/8 text-[11px] text-[#dae2fd]/40 flex-wrap">
                  {severityDistribution.map(item => (
                    <span key={item.key} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}: <strong className="text-[#dae2fd]/70 font-mono">{item.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls: Search & Impact Filter ─────────────────────────── */}
      <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#dae2fd]/35 pointer-events-none" />
            <input
              type="text"
              placeholder="Search settlement or district…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#4cd7f6]/15 rounded-xl text-sm text-[#dae2fd] pl-9 pr-3 py-2 focus:outline-none focus:border-[#4cd7f6]/40 focus:ring-1 focus:ring-[#4cd7f6]/20 placeholder-[#dae2fd]/25 transition-colors"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[#dae2fd]/40 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Impact:
            </span>
            {IMPACT_LEVELS.map(({ key, label }) => {
              const active = filterSeverity === key
              return (
                <button
                  key={key}
                  onClick={() => setFilterSeverity(key)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                    active
                      ? 'bg-[#4cd7f6] text-[#0b1326] font-semibold shadow-sm'
                      : 'bg-[#0b1326] text-[#dae2fd]/60 border border-[#4cd7f6]/12 hover:border-[#4cd7f6]/30 hover:text-[#dae2fd]',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Table Card ───────────────────────────────────────────────── */}
      <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner size="md" label="Loading settlement records" />
            <p className="text-xs text-[#dae2fd]/40">Loading settlement impact records…</p>
          </div>
        ) : processedSettlements.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#dae2fd]/5 flex items-center justify-center mx-auto text-[#dae2fd]/30">
              <MapPin className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-white font-display">
              No settlements match your filters
            </p>
            <p className="text-xs text-[#dae2fd]/40 max-w-sm mx-auto">
              Try adjusting your search query or selecting a different impact severity level.
            </p>
            {(search || filterSeverity !== 'all') && (
              <button
                onClick={() => {
                  setSearch('')
                  setFilterSeverity('all')
                }}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#4cd7f6]/10 border border-[#4cd7f6]/25 text-[#4cd7f6] hover:bg-[#4cd7f6]/20 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-[#4cd7f6]/10 bg-[#0b1326]/50">
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    Settlement Name
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    District
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    Total Area
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    Flooded Area
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    <button
                      onClick={handleSortToggle}
                      className="inline-flex items-center gap-1.5 text-[#dae2fd]/70 hover:text-[#4cd7f6] transition-colors group focus:outline-none"
                      title="Click to sort by flood-affected percentage"
                      aria-label={`Sort by flood affected percentage, currently ${sortOrder === 'desc' ? 'descending' : 'ascending'}`}
                    >
                      <span>Flood-Affected %</span>
                      {sortOrder === 'desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-[#4cd7f6]" />
                      ) : (
                        <ArrowUp className="w-3.5 h-3.5 text-[#4cd7f6]" />
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    Impact Flag
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-[#dae2fd]/60 uppercase tracking-wider">
                    Population
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4cd7f6]/6">
                {processedSettlements.map((s, idx) => {
                  const totalArea = getTotalArea(s)
                  const floodedArea = getFloodedArea(s)
                  const pct = Math.round(s.flooded_pct || 0)

                  return (
                    <tr
                      key={s.id || idx}
                      className="hover:bg-[#4cd7f6]/4 transition-colors duration-150"
                    >
                      {/* Settlement Name */}
                      <td className="px-5 py-3.5 font-medium text-white">
                        {s.name}
                      </td>

                      {/* District */}
                      <td className="px-5 py-3.5 text-[#dae2fd]/70 text-xs">
                        {s.district}
                      </td>

                      {/* Total Area */}
                      <td className="px-5 py-3.5 text-[#dae2fd]/70 font-mono text-xs">
                        {totalArea !== null ? `${totalArea} km²` : '—'}
                      </td>

                      {/* Flooded Area */}
                      <td className="px-5 py-3.5 text-[#dae2fd]/85 font-mono text-xs">
                        {floodedArea !== null ? `${floodedArea} km²` : '—'}
                      </td>

                      {/* Flood-affected Percentage with bar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 bg-[#0b1326] rounded-full h-1.5 overflow-hidden border border-[#4cd7f6]/10">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                s.severity === 'severe'
                                  ? 'bg-purple-400'
                                  : s.severity === 'high'
                                    ? 'bg-red-400'
                                    : s.severity === 'medium'
                                      ? 'bg-yellow-400'
                                      : s.severity === 'safe'
                                        ? 'bg-cyan-400'
                                        : 'bg-green-400'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-white">
                            {pct}%
                          </span>
                        </div>
                      </td>

                      {/* Impact Flag */}
                      <td className="px-5 py-3.5">
                        <SeverityBadge level={s.severity?.toLowerCase() || 'low'} />
                      </td>

                      {/* Population */}
                      <td className="px-5 py-3.5 text-[#dae2fd]/70 text-xs">
                        {s.population ? s.population.toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer row */}
        <div className="px-5 py-3 border-t border-[#4cd7f6]/10 bg-[#0b1326]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[#dae2fd]/40">
          <span>
            Showing {processedSettlements.length} of {settlements.length} settlements · CSV & GeoJSON export reflects active view
          </span>
          <span>
            Sorted by Flood-Affected % ({sortOrder === 'desc' ? 'High to Low' : 'Low to High'})
          </span>
        </div>
      </div>
    </div>
  )
}
