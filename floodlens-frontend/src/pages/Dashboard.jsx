import { Link } from 'react-router-dom'
import StatCard from '../components/ui/StatCard'
import FloodMapViewer from '../components/map/FloodMapViewer'
import { useTheme } from '../context/ThemeContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import {
  Droplets, AlertTriangle, Users, MapPin, Activity, Zap, Layers, Clock, ArrowRight,
} from 'lucide-react'

const stats = [
  { title: 'Flood Extent',   value: '254.8', unit: 'km²', change: 12,        icon: Droplets,      color: 'blue',   description: 'vs yesterday' },
  { title: 'Affected Areas', value: '3',     unit: 'Districts', change: 0,   icon: MapPin,        color: 'yellow', description: 'Darbhanga, Sitamarhi, Muzaffarpur' },
  { title: 'At-Risk Pop.',   value: '1.2M',  unit: 'people', change: 8,      icon: Users,         color: 'red',    description: 'settlement intersect' },
  { title: 'NDWI Score',     value: '0.74',  unit: '', change: -3,           icon: Activity,      color: 'green',  description: 'water threshold > 0.3' },
  { title: 'Satellite Pass', value: '4m',    unit: 'ago', change: undefined, icon: Zap,           color: 'purple', description: 'Sentinel-2 · 10m res.' },
  { title: 'Alerts',         value: '7',     unit: 'active', change: 2,      icon: AlertTriangle, color: 'red',    description: '2 new since last pass' },
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
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30',
  running:   'bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-500/30',
  failed:    'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-500/30',
}

export default function Dashboard() {
  const { isDark } = useTheme()

  const gridStroke    = isDark ? '#29374B' : '#f1f5f9'
  const axisStroke    = isDark ? '#64748B' : '#94a3b8'
  const areaStroke    = isDark ? '#60A5FA' : '#166534'
  const areaFillStop  = isDark ? '#60A5FA' : '#3b82f6'
  const nonFloodColor = isDark ? '#3b82f6' : '#1d4ed8'
  const legendColor   = isDark ? '#94a3b8' : '#64748b'

  const tooltipContentStyle = {
    backgroundColor: isDark ? '#111C2E' : '#ffffff',
    borderColor: isDark ? '#29374B' : '#e2e8f0',
    borderRadius: '12px',
    boxShadow: isDark ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)' : '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
    padding: '10px 14px',
  }

  const tooltipLabelStyle = {
    color: isDark ? '#F1F5F9' : '#0F172A',
    fontWeight: 600,
    fontSize: '12px',
    marginBottom: '4px',
  }

  const tooltipItemStyle = {
    color: isDark ? '#60A5FA' : '#166534',
    fontWeight: 600,
    fontSize: '12px',
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[#DCE5DD]/80 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#26332C] dark:text-white font-display tracking-tight">Dashboard</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E5F2E8] text-[#166534] border border-[#DCE5DD] dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#166534] dark:bg-blue-500 animate-pulse" />
              Live Monitoring
            </span>
          </div>
          <p className="text-[#647067] dark:text-slate-400 text-xs sm:text-sm mt-1">
            Real-time flood monitoring · Bihar Region · Sentinel-2 / Landsat-9
          </p>
        </div>
      </div>

      {/* ── Key Metrics Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 sm:gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* ── Mid Row: Map Preview + Recent Jobs ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map Preview Card */}
        <div className="xl:col-span-2 card p-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#DCE5DD] dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E5F2E8] dark:bg-blue-950/50 flex items-center justify-center shrink-0 border border-[#DCE5DD] dark:border-blue-800/40">
                <Layers className="w-3.5 h-3.5 text-[#166534] dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-[#26332C] dark:text-white font-semibold text-sm font-display">Live Flood Map</h2>
                <p className="text-[#647067] dark:text-slate-400 text-[11px] mt-0.5">GeoJSON overlay · OpenStreetMap base</p>
              </div>
            </div>
            <Link
              to="/dashboard/map"
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 shadow-sm font-medium"
            >
              <span>Full Map</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex-1 relative min-h-[320px]">
            <FloodMapViewer height="320px" />
          </div>
        </div>

        {/* Recent Jobs Card */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DCE5DD] dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#647067] dark:text-slate-400" />
              <h2 className="text-[#26332C] dark:text-white font-semibold text-sm font-display">Recent GEE Jobs</h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400 dark:text-[#647067] font-mono">Archive feed</span>
          </div>
          <div className="space-y-2.5 flex-1">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between py-2 px-2.5 rounded-lg border border-[#DCE5DD] dark:border-slate-800/70 hover:bg-[#F1F5F1] dark:hover:bg-slate-800/40 transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-[#26332C] dark:text-white font-mono">{job.id}</p>
                  <p className="text-[11px] text-[#647067] dark:text-slate-400 mt-0.5">{job.source} · {job.date}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${statusColors[job.status]}`}>
                    {job.status}
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-medium mt-1">{job.area}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Flood Extent Timeline */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-[#26332C] dark:text-white font-semibold text-sm font-display">Flood Extent Timeline</h2>
            <p className="text-[#647067] dark:text-slate-400 text-xs mt-0.5">Pre/Post change detection · Last 8 days inundation area</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={areaFillStop} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={areaFillStop} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="date" stroke={axisStroke} tick={{ fontSize: 11 }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} unit=" km²" />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Area
                type="monotone"
                dataKey="area"
                stroke={areaStroke}
                fill="url(#floodGrad)"
                strokeWidth={2}
                name="Flood Area"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* District Comparison */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-[#26332C] dark:text-white font-semibold text-sm font-display">District Flood Comparison</h2>
            <p className="text-[#647067] dark:text-slate-400 text-xs mt-0.5">Flooded vs. total land area (km²)</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={districtData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 11 }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={{ fontSize: '12px', fontWeight: 500 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: legendColor, paddingTop: '4px' }} />
              <Bar dataKey="flooded" fill="#ef4444" name="Flooded" radius={[4, 4, 0, 0]} />
              <Bar dataKey="normal"  fill={nonFloodColor} name="Non-Flooded" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
