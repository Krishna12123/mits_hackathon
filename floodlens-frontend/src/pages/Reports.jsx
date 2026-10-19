import { Download, FileText, Map, FileSpreadsheet, CheckCircle, Clock } from 'lucide-react'

const reports = [
  {
    id: 'RPT-0041',
    title: 'Bihar Flood Impact Report',
    date: 'Oct 19, 2026 · 10:12 AM',
    source: 'Sentinel-2 + OSM',
    type: 'PDF',
    size: '3.8 MB',
    status: 'ready',
    description: 'Full settlement impact analysis with NDWI classification and population at risk.',
  },
  {
    id: 'RPT-0040',
    title: 'Flood Extent GeoTIFF',
    date: 'Oct 19, 2026 · 10:08 AM',
    source: 'GEE Export',
    type: 'GeoTIFF',
    size: '42.1 MB',
    status: 'ready',
    description: '10m resolution classified raster — EPSG:4326, thresholded at NDWI > 0.3.',
  },
  {
    id: 'RPT-0039',
    title: 'Affected Settlements Shapefile',
    date: 'Oct 19, 2026 · 10:08 AM',
    source: 'Vector conversion',
    type: 'Shapefile',
    size: '5.2 MB',
    status: 'ready',
    description: 'Vector polygon layer of all flooded settlements with attribute table.',
  },
  {
    id: 'RPT-0038',
    title: 'Pre/Post Change Detection Report',
    date: 'Oct 18, 2026 · 06:00 PM',
    source: 'Landsat-9',
    type: 'PDF',
    size: '2.1 MB',
    status: 'ready',
    description: 'Comparative MNDWI analysis between Oct 11 and Oct 18 images.',
  },
  {
    id: 'RPT-0037',
    title: 'District Summary CSV',
    date: 'Oct 18, 2026 · 06:00 PM',
    source: 'GIS Service',
    type: 'CSV',
    size: '0.4 MB',
    status: 'ready',
    description: 'District-level tabular summary for data sharing with disaster authorities.',
  },
  {
    id: 'RPT-0036',
    title: 'Sentinel-1 SAR Analysis',
    date: 'Oct 18, 2026 · 01:30 AM',
    source: 'Sentinel-1 SAR',
    type: 'PDF',
    size: '—',
    status: 'processing',
    description: 'SAR-based flood detection for cloud-covered areas (in progress).',
  },
]

const typeIcons = {
  PDF:      { icon: FileText,        color: 'text-red-400',    bg: 'bg-red-900/30'    },
  GeoTIFF:  { icon: Map,             color: 'text-blue-400',   bg: 'bg-blue-900/30'   },
  Shapefile:{ icon: Map,             color: 'text-green-400',  bg: 'bg-green-900/30'  },
  CSV:      { icon: FileSpreadsheet, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
}

export default function Reports() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Reports & Exports</h1>
        <p className="text-gray-400 text-sm mt-1">
          GeoTIFF · Shapefiles · PDF Impact Reports · CSV data
        </p>
      </div>

      {/* Reports list */}
      <div className="space-y-3">
        {reports.map(report => {
          const typeConfig = typeIcons[report.type] || typeIcons.PDF
          const Icon = typeConfig.icon
          return (
            <div key={report.id} className="card flex items-center gap-5 hover:border-gray-700 transition-colors">
              {/* Type icon */}
              <div className={`w-12 h-12 rounded-lg ${typeConfig.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${typeConfig.color}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold text-sm truncate">{report.title}</h3>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                    {report.type}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">{report.description}</p>
                <p className="text-gray-600 text-xs mt-1">{report.date} · {report.source}</p>
              </div>

              {/* Status + Action */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-gray-400">{report.size}</p>
                  {report.status === 'ready' ? (
                    <div className="flex items-center gap-1 text-green-400 text-xs mt-0.5">
                      <CheckCircle className="w-3 h-3" />
                      Ready
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-yellow-400 text-xs mt-0.5">
                      <Clock className="w-3 h-3 animate-spin" />
                      Processing
                    </div>
                  )}
                </div>
                <button
                  disabled={report.status !== 'ready'}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    report.status === 'ready'
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
