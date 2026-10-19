import { useState } from 'react'
import FloodMapViewer from '../components/map/FloodMapViewer'
import { Layers, Calendar, Download, Satellite } from 'lucide-react'

const satellites = ['Sentinel-2', 'Sentinel-1', 'Landsat-8', 'Landsat-9']
const indices    = ['NDWI', 'MNDWI', 'NDVI']

export default function FloodMap() {
  const [selectedDate, setSelectedDate]       = useState('2026-10-19')
  const [comparisonDate, setComparisonDate]   = useState('2026-10-11')
  const [selectedSatellite, setSatellite]     = useState('Sentinel-2')
  const [selectedIndex, setIndex]             = useState('NDWI')
  const [showComparison, setShowComparison]   = useState(false)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Flood Map</h1>
          <p className="text-gray-400 text-sm mt-1">
            Interactive flood extent · Pre/Post change detection
          </p>
        </div>
        <button className="btn-primary">
          <Download className="w-4 h-4" />
          Export GeoTIFF
        </button>
      </div>

      {/* Controls bar */}
      <div className="card flex flex-wrap items-center gap-4">
        {/* Satellite */}
        <div className="flex items-center gap-2">
          <Satellite className="w-4 h-4 text-gray-400" />
          <label className="text-xs text-gray-400 font-medium">Satellite</label>
          <select
            value={selectedSatellite}
            onChange={e => setSatellite(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {satellites.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Index */}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-400" />
          <label className="text-xs text-gray-400 font-medium">Index</label>
          <select
            value={selectedIndex}
            onChange={e => setIndex(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {indices.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>

        {/* Post-flood date */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <label className="text-xs text-gray-400 font-medium">Post-flood</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Pre-flood date */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <label className="text-xs text-gray-400 font-medium">Pre-flood</label>
          <input
            type="date"
            value={comparisonDate}
            onChange={e => setComparisonDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer ml-auto">
          <span className="text-xs text-gray-400">Split View</span>
          <div
            onClick={() => setShowComparison(v => !v)}
            className={`w-9 h-5 rounded-full transition-colors ${showComparison ? 'bg-brand-600' : 'bg-gray-700'} relative cursor-pointer`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showComparison ? 'left-4' : 'left-0.5'}`} />
          </div>
        </label>
      </div>

      {/* Map(s) */}
      {showComparison ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Pre-flood · {comparisonDate}</p>
            <FloodMapViewer height="520px" showControls={false} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Post-flood · {selectedDate}</p>
            <FloodMapViewer height="520px" showControls={false} />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">
            {selectedSatellite} · {selectedIndex} · {selectedDate}
          </p>
          <FloodMapViewer height="600px" />
        </div>
      )}

      {/* Info strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Threshold',     value: selectedIndex + ' > 0.3' },
          { label: 'Cloud Masking', value: 'QA60 Band Applied'       },
          { label: 'Resolution',    value: '10 m (Sentinel-2)'       },
          { label: 'CRS',           value: 'EPSG:4326'               },
        ].map(({ label, value }) => (
          <div key={label} className="card py-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-sm text-white font-semibold mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
