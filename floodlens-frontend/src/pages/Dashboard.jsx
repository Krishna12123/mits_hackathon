import StatCard from '../components/ui/StatCard'
import SeverityBadge from '../components/ui/SeverityBadge'
import FloodMapViewer from '../components/map/FloodMapViewer'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import {
  Droplets, AlertTriangle, Users, MapPin, Activity, Zap,
} from 'lucide-react'

const stats = [
  { title: 'Flood Extent',   value: '254.8', unit: 'km²', change: 12,  icon: Droplets,       color: 'blue',   description: 'vs yesterday' },
  { title: 'Affected Areas', value: '3',     unit: 'Districts', change: 0, icon: MapPin,       color: 'yellow', description: 'Darbhanga, Sitamarhi, Muzaffarpur' },
  { title: 'At-Risk Pop.',   value: '1.2M',  unit: 'people', change: 8, icon: Users,          color: 'red',    description: 'settlement intersect' },
  { title: 'NDWI Score',     value: '0.74',  unit: '',    change: -3,  icon: Activity,        color: 'green',  description: 'water threshold > 0.3' },
  { title: 'Satellite Pass', value: '4m',    unit: 'ago', change: undefined, icon: Zap,      color: 'purple', description: 'Sentinel-2 · 10m res.' },
  { title: 'Alerts',         value: '7',     unit: 'active', change: 2, icon: AlertTriangle,  color: 'red',    description: '2 new since last pass' },
]

const timelineData = [
  { date: 'Oct 12', area: 0 },
  { date: 'Oct 13', area: 18 },
  { date: 'Oct 14', area: 47 },
  { date: 'Oct 15', area: 112 },
  { date: 'Oct 16', area: 189 },
  { date: 'Oct 17', area: 221 },
  { date: 'Oct 18', area: 247 },
  { date: 'Oct 19', area: 255 },
]

const districtData = [
  { name: 'Darbhanga',    flooded: 124.5, normal: 310 },
  { name: 'Sitamarhi',    flooded: 87.2,  normal: 285 },
  { name: 'Muzaffarpur',  flooded: 43.1,  normal: 440 },
]

const recentJobs = [
  { id: 'JOB-2041', status: 'completed', source: 'Sentinel-2',  date: '10:04 AM', area: '254.8 km²' },
  { id: 'JOB-2040', status: 'completed', source: 'Landsat-9',   date: 'Yesterday', area: '247.1 km²' },
  { id: 'JOB-2039', status: 'failed',    source: 'Sentinel-1',  date: 'Yesterday', area: '—' },
  { id: 'JOB-2038', status: 'completed', source: 'Sentinel-2',  date: '2 days ago', area: '221.4 km²' },
]

const statusColors = {
  completed: 'bg-green-900/50 text-green-400',
  running:   'bg-brand-900/50 text-brand-400',
  failed:    'bg-red-900/50 text-red-400',
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Real-time flood monitoring · Bihar Region · Sentinel-2 / Landsat-9
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Map + Jobs */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map Preview */}
        <div className="xl:col-span-2 card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-white font-semibold">Live Flood Map</h2>
              <p className="text-gray-500 text-xs mt-0.5">GeoJSON overlay · OpenStreetMap base</p>
            </div>
            <a href="/map" className="btn-secondary py-1.5 text-xs">
              Full Map →
            </a>
          </div>
          <FloodMapViewer height="320px" />
        </div>

        {/* Recent Jobs */}
        <div className="card">
          <h2 className="text-white font-semibold mb-4">Recent GEE Jobs</h2>
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm text-white font-medium">{job.id}</p>
                  <p className="text-xs text-gray-500">{job.source} · {job.date}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[job.status]}`}>
                    {job.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">{job.area}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Flood Timeline */}
        <div className="card">
          <h2 className="text-white font-semibold mb-1">Flood Extent Timeline</h2>
          <p className="text-gray-500 text-xs mb-4">Pre/Post change detection · Last 8 days</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1285f0" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1285f0" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" stroke="#4b5563" tick={{ fontSize: 11 }} />
              <YAxis stroke="#4b5563" tick={{ fontSize: 11 }} unit=" km²" />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Area type="monotone" dataKey="area" stroke="#1285f0" fill="url(#floodGrad)" strokeWidth={2} name="Flood Area" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* District Comparison */}
        <div className="card">
          <h2 className="text-white font-semibold mb-1">District Flood Comparison</h2>
          <p className="text-gray-500 text-xs mb-4">Flooded vs. total land area (km²)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={districtData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" stroke="#4b5563" tick={{ fontSize: 11 }} />
              <YAxis stroke="#4b5563" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <Bar dataKey="flooded" fill="#ef4444" name="Flooded" radius={[4, 4, 0, 0]} />
              <Bar dataKey="normal"  fill="#1e40af" name="Non-Flooded" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
