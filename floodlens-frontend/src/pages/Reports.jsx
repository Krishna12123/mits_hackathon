import { useState, useEffect, useCallback } from 'react'
import {
  Download,
  FileText,
  Map,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Info,
  Loader2,
} from 'lucide-react'
import { reportAPI } from '../services/api'
import Spinner from '../components/ui/Spinner'

// Reference demonstration reports retained strictly as fallback if backend is unreachable
const DEMO_REPORTS = [
  {
    id: 'RPT-0041',
    title: 'Bihar Flood Impact Report',
    date: '2026-10-19T10:12:00Z',
    source: 'Sentinel-2 + OSM',
    type: 'PDF',
    size: '3.8 MB',
    status: 'ready',
    description: 'Full settlement impact analysis with NDWI classification and population at risk.',
  },
  {
    id: 'RPT-0040',
    title: 'Flood Extent GeoTIFF',
    date: '2026-10-19T10:08:00Z',
    source: 'GEE Export',
    type: 'GeoTIFF',
    size: '42.1 MB',
    status: 'ready',
    description: '10m resolution classified raster — EPSG:4326, thresholded at NDWI > 0.3.',
  },
  {
    id: 'RPT-0039',
    title: 'Affected Settlements Shapefile',
    date: '2026-10-19T10:08:00Z',
    source: 'Vector conversion',
    type: 'Shapefile',
    size: '5.2 MB',
    status: 'ready',
    description: 'Vector polygon layer of all flooded settlements with attribute table.',
  },
  {
    id: 'RPT-0038',
    title: 'Pre/Post Change Detection Report',
    date: '2026-10-18T18:00:00Z',
    source: 'Landsat-9',
    type: 'PDF',
    size: '2.1 MB',
    status: 'ready',
    description: 'Comparative MNDWI analysis between Oct 11 and Oct 18 images.',
  },
  {
    id: 'RPT-0037',
    title: 'District Summary CSV',
    date: '2026-10-18T18:00:00Z',
    source: 'GIS Service',
    type: 'CSV',
    size: '0.4 MB',
    status: 'ready',
    description: 'District-level tabular summary for data sharing with disaster authorities.',
  },
  {
    id: 'RPT-0036',
    title: 'Sentinel-1 SAR Analysis',
    date: '2026-10-18T01:30:00Z',
    source: 'Sentinel-1 SAR',
    type: 'PDF',
    size: '—',
    status: 'processing',
    description: 'SAR-based flood detection for cloud-covered areas (in progress).',
  },
]

const typeIcons = {
  PDF:       { icon: FileText,        color: 'text-red-400',    bg: 'bg-red-900/30'    },
  GeoTIFF:   { icon: Map,             color: 'text-blue-400',   bg: 'bg-blue-900/30'   },
  Shapefile: { icon: Map,             color: 'text-green-400',  bg: 'bg-green-900/30'  },
  CSV:       { icon: FileSpreadsheet, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
}

// Map extensions for download filenames
const extensionMap = {
  PDF: 'pdf',
  GeoTIFF: 'tif',
  Shapefile: 'zip',
  CSV: 'csv',
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoStr
  }
}

function ProvenanceBadge({ dataSource }) {
  if (dataSource === 'gee_live') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-[#4cd7f6]/30 bg-[#4cd7f6]/10 text-[#4cd7f6]">
        Live GEE
      </span>
    )
  }
  if (dataSource === 'synthetic_demo') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-[#ffb95f]/30 bg-[#ffb95f]/10 text-[#ffb95f]">
        Demo Simulation
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-500/30 bg-slate-500/10 text-slate-400">
      Unknown Source
    </span>
  )
}

export default function Reports() {
  const [reports, setReports]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const [downloadingId, setDownloadingId]   = useState(null)
  const [actionNotice, setActionNotice]     = useState(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionNotice(null)

    try {
      const response = await reportAPI.list()
      const list = response?.reports ?? (Array.isArray(response) ? response : null)

      if (list && Array.isArray(list)) {
        setReports(list)
        setIsDemoFallback(false)
      } else {
        setReports(DEMO_REPORTS)
        setIsDemoFallback(true)
      }
    } catch (err) {
      setError(err?.message || 'Failed to connect to backend reports service.')
      setReports(DEMO_REPORTS)
      setIsDemoFallback(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleDownload = async (report) => {
    if (!report || report.status !== 'ready') return
    if (downloadingId) return // Guard: prevent simultaneous download triggers

    setDownloadingId(report.id)
    setActionNotice(null)

    try {
      if (isDemoFallback) {
        setActionNotice({
          type: 'warning',
          message: `Download unavailable in demo fallback mode. Real artifact "${report.title}" requires live backend connection.`,
        })
        return
      }

      const response = await reportAPI.download(report.id)
      const data = response?.data ?? response

      const mimeType =
        report.type === 'CSV'
          ? 'text/csv'
          : report.type === 'GeoTIFF'
          ? 'image/tiff'
          : report.type === 'PDF'
          ? 'application/pdf'
          : 'application/octet-stream'

      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
      const ext = extensionMap[report.type] || 'bin'
      const filename = `${report.id}.${ext}`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setActionNotice({
        type: 'success',
        message: `Downloaded ${filename} successfully.`,
      })
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: err?.response?.data?.detail || err?.message || `Failed to download artifact ${report.id}.`,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#26332C] dark:text-white font-display">Reports &amp; Exports</h1>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isDemoFallback
                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                  : 'bg-green-500/10 text-green-400 border-green-500/30'
              }`}
            >
              {isDemoFallback ? 'Demo Fallback' : 'Live Backend'}
            </span>
          </div>
          <p className="text-[#647067] dark:text-gray-400 text-sm">
            GeoTIFF • Shapefiles • PDF Impact Reports • CSV data
          </p>
        </div>

        <button
          onClick={fetchReports}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#166534] text-[#166534] hover:bg-[#F1F5F1] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/20 dark:text-[#4cd7f6] disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Artifacts
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            actionNotice.type === 'success'
              ? 'bg-green-950/40 border-green-500/30 text-green-300'
              : actionNotice.type === 'warning'
              ? 'bg-yellow-950/40 border-yellow-500/30 text-yellow-300'
              : 'bg-red-950/40 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-green-400" />
            ) : actionNotice.type === 'warning' ? (
              <Info className="w-4 h-4 shrink-0 text-yellow-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-gray-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Demo Fallback Disclaimer Banner */}
      {isDemoFallback && (
        <div className="p-3.5 rounded-xl bg-[#ffb95f]/10 border border-[#ffb95f]/30 flex items-start gap-3">
          <Info className="w-4 h-4 text-[#ffb95f] shrink-0 mt-0.5" />
          <div className="text-xs text-[#dae2fd]/80">
            <span className="font-bold text-[#ffb95f]">Demonstration Fallback Notice: </span>
            The live backend reports service is unreachable or unseeded. Displaying reference
            demonstration records. Real artifact downloads require a connected backend.
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isDemoFallback && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="text-xs text-red-300">
            <p className="font-semibold">Unable to fetch reports</p>
            <p className="text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-16 text-center card">
          <Spinner size="lg" className="mx-auto text-[#4cd7f6] mb-3" />
          <p className="text-sm text-gray-400 font-medium">Loading report catalog...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <div className="py-16 text-center card border-dashed">
          <FileText className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-[#26332C] dark:text-white">No Reports Available</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            No report artifacts have been generated yet. Execute a detection job in the Configure panel to create downloadable layers and impact summaries.
          </p>
        </div>
      )}

      {/* Reports list */}
      {!loading && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => {
            const typeConfig = typeIcons[report.type] || typeIcons.PDF
            const Icon = typeConfig.icon
            const isDownloading = downloadingId === report.id
            const isReady = report.status === 'ready'

            return (
              <div
                key={report.id}
                className="card flex items-center gap-5 hover:border-gray-700 transition-colors"
              >
                {/* Type icon */}
                <div
                  className={`w-12 h-12 rounded-lg ${typeConfig.bg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`w-6 h-6 ${typeConfig.color}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[#26332C] dark:text-white font-semibold text-sm truncate">{report.title}</h3>
                    <span className="text-xs text-[#26332C] bg-[#F1F5F1] border border-[#DCE5DD] dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700 px-2 py-0.5 rounded font-mono text-[11px]">
                      {report.type}
                    </span>
                    <ProvenanceBadge dataSource={report.data_source} />
                    <span className="text-[10px] text-gray-500 font-mono">
                      {report.id}
                    </span>
                  </div>
                  {report.description && (
                    <p className="text-[#374151] dark:text-gray-400 text-xs mt-0.5 line-clamp-1">{report.description}</p>
                  )}
                  <p className="text-[#6B7280] dark:text-gray-500 text-xs mt-1">
                    {formatDate(report.date || report.created_at)}
                    {report.source ? ` • ${report.source}` : ''}
                  </p>
                </div>

                {/* Status + Action */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-[#6B7280] dark:text-gray-400 font-mono">{report.size || '—'}</p>
                    {isReady ? (
                      <div className="flex items-center justify-end gap-1 text-green-400 text-xs mt-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Ready
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 text-yellow-400 text-xs mt-0.5">
                        <Clock className="w-3 h-3 animate-spin" />
                        Processing
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownload(report)}
                    disabled={!isReady || isDownloading || Boolean(downloadingId)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isReady && !downloadingId
                        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                        : 'bg-[#F5F7F6] text-[#6B7280] cursor-not-allowed border border-[#D1D5DB] dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700'
                    }`}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
