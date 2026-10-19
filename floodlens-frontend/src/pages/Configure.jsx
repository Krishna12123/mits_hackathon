import { useState } from 'react'
import { Save, Play, MapPin, Calendar, Satellite, Layers, AlertCircle } from 'lucide-react'

export default function Configure() {
  const [aoi, setAoi]         = useState({ lat: '26.3', lon: '85.8', radius: '150' })
  const [dateRange, setDate]  = useState({ start: '2026-10-11', end: '2026-10-19' })
  const [satellite, setSat]   = useState('Sentinel-2')
  const [index, setIndex]     = useState('NDWI')
  const [threshold, setThres] = useState('0.3')
  const [cloudPct, setCloud]  = useState('20')
  const [running, setRunning] = useState(false)
  const [jobId, setJobId]     = useState(null)

  const handleRun = () => {
    setRunning(true)
    setTimeout(() => {
      setRunning(false)
      setJobId('JOB-' + Math.floor(Math.random() * 9000 + 1000))
    }, 2500)
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configure Analysis</h1>
        <p className="text-gray-400 text-sm mt-1">
          Set AOI, date range, satellite parameters, and trigger GEE processing pipeline.
        </p>
      </div>

      {jobId && (
        <div className="flex items-center gap-3 bg-green-900/30 border border-green-700 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-green-400 shrink-0" />
          <div>
            <p className="text-green-300 font-medium text-sm">Job Queued: {jobId}</p>
            <p className="text-green-600 text-xs">Processing via Celery · Check Dashboard for live status</p>
          </div>
        </div>
      )}

      {/* AOI */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-brand-400" />
          <h2 className="text-white font-semibold">Area of Interest (AOI)</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Centre Latitude',  key: 'lat',    value: aoi.lat    },
            { label: 'Centre Longitude', key: 'lon',    value: aoi.lon    },
            { label: 'Radius (km)',      key: 'radius', value: aoi.radius },
          ].map(({ label, key, value }) => (
            <div key={key}>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">{label}</label>
              <input
                type="number"
                value={value}
                onChange={e => setAoi(a => ({ ...a, [key]: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          Or draw polygon on map — go to <a href="/map" className="text-brand-400 hover:underline">Flood Map</a> → Draw AOI tool
        </p>
      </div>

      {/* Date Range */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-brand-400" />
          <h2 className="text-white font-semibold">Date Range</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Pre-flood date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDate(d => ({ ...d, start: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Post-flood date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDate(d => ({ ...d, end: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Satellite & Processing */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Satellite className="w-4 h-4 text-brand-400" />
          <h2 className="text-white font-semibold">Satellite & Processing</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Satellite Source</label>
            <select
              value={satellite}
              onChange={e => setSat(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {['Sentinel-2', 'Sentinel-1 (SAR)', 'Landsat-8', 'Landsat-9'].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Water Index</label>
            <select
              value={index}
              onChange={e => setIndex(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {['NDWI', 'MNDWI', 'NDVI (vegetation loss)'].map(i => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">
              Water Threshold <span className="text-gray-600">(Index value)</span>
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={threshold}
              onChange={e => setThres(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">
              Max Cloud Cover <span className="text-gray-600">(%)</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={cloudPct}
              onChange={e => setCloud(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={handleRun} disabled={running} className="btn-primary px-6 py-2.5">
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Queuing Job…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Detection Pipeline
            </>
          )}
        </button>
        <button className="btn-secondary px-5 py-2.5">
          <Save className="w-4 h-4" />
          Save Config
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Pipeline: GEE Image Collection → Cloud Mask → {index} → Threshold → Raster→Vector → OSM Settlement Intersection → Report
      </p>
    </div>
  )
}
