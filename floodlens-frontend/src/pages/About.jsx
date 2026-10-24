import { Link } from 'react-router-dom'
import {
  Satellite, Globe2, Users, Code2, Database,
  Map, ArrowRight, Layers, ShieldCheck, Cpu, LayoutDashboard,
} from 'lucide-react'

// ─── Tech stack cards ─────────────────────────────────────────────────────────
const techStack = [
  {
    Icon: Satellite,
    name: 'Sentinel-1 SAR',
    detail: 'ESA Copernicus C-band radar · 10 m resolution · all-weather imaging',
  },
  {
    Icon: Database,
    name: 'Google Earth Engine',
    detail: 'Cloud-based geospatial platform for satellite image processing at scale',
  },
  {
    Icon: Map,
    name: 'OpenStreetMap',
    detail: 'Open settlement and infrastructure data for impact intersection analysis',
  },
  {
    Icon: Layers,
    name: 'NDWI Change Detection',
    detail: 'Normalised Difference Water Index for pre/post-flood boundary delineation',
  },
  {
    Icon: Code2,
    name: 'React + FastAPI',
    detail: 'Interactive frontend with a Python REST backend for analysis job management',
  },
  {
    Icon: Cpu,
    name: 'Geospatial Processing',
    detail: 'Rasterio, GeoPandas, and Shapely for vector/raster flood analytics',
  },
]

// ─── Approach steps ───────────────────────────────────────────────────────────
const approach = [
  {
    step: '01',
    title: 'SAR Imagery Acquisition',
    body: 'Sentinel-1 SAR scenes are fetched from the Copernicus Open Access Hub via Google Earth Engine for a user-defined area and date range. SAR penetrates clouds, making it reliable during active monsoon flooding.',
  },
  {
    step: '02',
    title: 'Water Extent Detection',
    body: 'Pre-flood and post-flood imagery are compared using NDWI-based thresholding. Pixels that transition from non-water to water between the two periods are classified as flooded.',
  },
  {
    step: '03',
    title: 'Settlement Impact Analysis',
    body: 'Derived flood polygons are spatially intersected with OpenStreetMap settlement footprints and road networks to identify affected communities and infrastructure.',
  },
  {
    step: '04',
    title: 'Reporting',
    body: 'Results are presented as quantitative metrics (flood area in km², affected settlement count, estimated population) alongside an interactive map and downloadable GeoJSON.',
  },
]

// ─── About Page ───────────────────────────────────────────────────────────────
export default function About() {
  return (
    <div className="font-sans">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/3 w-[480px] h-[380px] bg-[#4cd7f6]/5 rounded-full blur-[110px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8F5E9] border border-[#D1D5DB] text-[#166534] dark:bg-[#4cd7f6]/8 dark:border-[#4cd7f6]/20 dark:text-[#4cd7f6] text-xs font-medium mb-7">
            <Satellite className="w-3.5 h-3.5" />
            NAKSHATRA 2026 Hackathon Project
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-[#263238] dark:text-white leading-tight mb-6">
            About FloodLens
          </h1>
          <p className="text-[#6B7280] dark:text-[#dae2fd]/65 text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            FloodLens is a satellite-based flood detection and settlement impact assessment
            platform built to support rapid humanitarian response in Nepal's Terai region.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-[#F5F7F6] text-[#166534] border border-[#166534] font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Go to Dashboard</span>
            </Link>
            <Link
              to="/analysis"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#166534] hover:bg-[#14532D] text-white font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              <span>Start Flood Analysis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── The Problem ───────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#F5F7F6] dark:bg-[#0d1629] border-y border-[#D1D5DB] dark:border-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-[#166534] dark:text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-3">
                The Problem
              </p>
              <h2 className="font-display text-3xl font-bold text-[#263238] dark:text-white mb-5">
                Nepal's Terai floods rapidly — response must keep up.
              </h2>
              <div className="space-y-4 text-[#6B7280] dark:text-[#dae2fd]/60 text-sm leading-relaxed">
                <p>
                  The Terai lowlands of Nepal are among the most flood-prone regions in South
                  Asia. Every monsoon season, rivers fed by Himalayan snowmelt and heavy
                  rainfall overtop their banks, inundating agricultural land, roads, and
                  densely populated settlements.
                </p>
                <p>
                  Traditional ground-based damage assessments are slow, dangerous during active
                  floods, and often incomplete. Relief agencies and local governments need
                  timely, spatially precise information to prioritise evacuation, direct
                  resources, and coordinate response.
                </p>
                <p>
                  FloodLens addresses this gap by automating the process of detecting flood
                  extent from satellite imagery and estimating settlement impact — in a tool
                  accessible to non-specialist users.
                </p>
              </div>
            </div>

            {/* Stat highlights — descriptive, not fabricated */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: 'Terai', sub: 'Focus region', note: "Nepal's southern lowland belt" },
                { value: 'SAR', sub: 'Sensor type', note: 'All-weather, cloud-penetrating radar' },
                { value: '10 m', sub: 'Resolution', note: 'Sentinel-1 spatial resolution' },
                { value: 'GEE', sub: 'Processing', note: 'Google Earth Engine cloud pipeline' },
              ].map(({ value, sub, note }) => (
                <div
                  key={sub}
                  className="bg-white border border-[#D1D5DB] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 rounded-2xl p-5"
                >
                  <p className="font-display text-3xl font-bold text-[#166534] dark:text-[#4cd7f6] mb-1">{value}</p>
                  <p className="text-[#263238] dark:text-white text-sm font-semibold">{sub}</p>
                  <p className="text-[#6B7280] dark:text-[#dae2fd]/40 text-xs mt-1 leading-snug">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Our Approach ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#166534] dark:text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-3">
              Technical Approach
            </p>
            <h2 className="font-display text-3xl font-bold text-white">How We Detect Floods</h2>
            <p className="text-[#dae2fd]/55 text-sm mt-4 max-w-lg mx-auto leading-relaxed">
              A reproducible, open-data pipeline from raw satellite scenes to settlement-level
              impact estimates.
            </p>
          </div>

          <div className="space-y-4">
            {approach.map(({ step, title, body }) => (
              <div
                key={step}
                className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-6 flex gap-6 hover:border-[#4cd7f6]/22 transition-colors duration-200"
              >
                <span className="font-display text-4xl font-bold text-[#4cd7f6]/12 shrink-0 leading-none mt-1 select-none">
                  {step}
                </span>
                <div>
                  <h3 className="font-display text-white font-semibold mb-2">{title}</h3>
                  <p className="text-[#dae2fd]/55 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Technology Stack ──────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#F5F7F6] dark:bg-[#0d1629] border-y border-[#D1D5DB] dark:border-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#166534] dark:text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-3">
              Stack
            </p>
            <h2 className="font-display text-3xl font-bold text-white">Technology</h2>
            <p className="text-[#dae2fd]/55 text-sm mt-4 max-w-lg mx-auto leading-relaxed">
              Built entirely on open data, open-source tools, and cloud-native geospatial APIs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {techStack.map(({ Icon, name, detail }) => (
              <div
                key={name}
                className="bg-[#171f33] border border-[#4cd7f6]/10 rounded-2xl p-5 hover:border-[#4cd7f6]/24 transition-colors duration-200 group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0b1326] border border-[#4cd7f6]/18 flex items-center justify-center mb-4 group-hover:border-[#4cd7f6]/35 transition-colors duration-200">
                  <Icon className="w-5 h-5 text-[#4cd7f6]" />
                </div>
                <p className="font-display text-white font-semibold text-sm mb-1.5">{name}</p>
                <p className="text-[#dae2fd]/48 text-xs leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NAKSHATRA context ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#131b2e] border border-[#4cd7f6]/15 rounded-2xl p-8 sm:p-10">
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#4cd7f6]" />
              </div>
              <div>
                <p className="text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-2">
                  NAKSHATRA 2026
                </p>
                <h2 className="font-display text-2xl font-bold text-white mb-4">
                  Built for the Hackathon — Designed for Real Impact
                </h2>
                <div className="space-y-3 text-[#dae2fd]/60 text-sm leading-relaxed">
                  <p>
                    FloodLens was developed as a NAKSHATRA 2026 hackathon project, with the goal of
                    demonstrating how freely available satellite data and geospatial tooling can be
                    assembled into a practical humanitarian tool.
                  </p>
                  <p>
                    The platform is scoped specifically to Nepal's Terai region — a geographically
                    distinct and historically flood-vulnerable area — rather than attempting generic
                    global coverage. This focus allows the methodology to be validated and the
                    results to be contextualised against known flood events.
                  </p>
                  <p>
                    All data sources used (Sentinel-1 via Copernicus, OpenStreetMap, Google Earth
                    Engine) are publicly accessible. The flood detection methodology is based on
                    published remote sensing techniques and does not claim original research.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#F5F7F6] dark:bg-[#0d1629] border-y border-[#D1D5DB] dark:border-transparent">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl font-bold text-white mb-4">
            Try the Flood Analysis Tool
          </h2>
          <p className="text-[#dae2fd]/55 text-sm leading-relaxed mb-8">
            Select a region and date range to run a satellite-based flood detection analysis
            over Nepal's Terai.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-white hover:bg-[#F5F7F6] text-[#166534] border border-[#166534] font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Go to Dashboard</span>
            </Link>
            <Link
              to="/analysis"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-[#166534] hover:bg-[#14532D] text-white font-bold text-sm rounded-xl transition-all duration-150 shadow-sm"
            >
              <span>Start Flood Analysis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="pt-12 pb-8 px-4 sm:px-6 lg:px-8 bg-white dark:bg-transparent border-t border-[#D1D5DB] dark:border-[#4cd7f6]/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 border border-[#4cd7f6]/25 flex items-center justify-center">
              <Satellite className="w-3.5 h-3.5 text-[#4cd7f6]" />
            </div>
            <span className="text-[#263238] dark:text-white font-bold font-display text-sm">FloodLens</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/"         className="text-[#6B7280] hover:text-[#166534] dark:text-[#dae2fd]/40 dark:hover:text-[#4cd7f6] text-xs transition-colors">Home</Link>
            <Link to="/dashboard" className="text-[#6B7280] hover:text-[#166534] dark:text-[#dae2fd]/40 dark:hover:text-[#4cd7f6] text-xs transition-colors">Dashboard</Link>
            <Link to="/analysis" className="text-[#6B7280] hover:text-[#166534] dark:text-[#dae2fd]/40 dark:hover:text-[#4cd7f6] text-xs transition-colors">Analysis</Link>
            <Link to="/about"    className="text-[#6B7280] hover:text-[#166534] dark:text-[#dae2fd]/40 dark:hover:text-[#4cd7f6] text-xs transition-colors">About</Link>
          </div>
          <p className="text-[#dae2fd]/25 text-xs flex items-center gap-1.5">
            <Globe2 className="w-3 h-3" />
            NAKSHATRA 2026 · Nepal Terai
          </p>
        </div>
      </footer>
    </div>
  )
}
