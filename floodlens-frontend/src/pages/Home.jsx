import { Link } from 'react-router-dom'
import {
  Satellite, MapPin, Layers, BarChart3, ChevronRight,
  Globe2, Building2, Activity, ArrowRight, CheckCircle2,
  Search, GitCompare, Network, LayoutDashboard,
} from 'lucide-react'

// ─── Satellite Flood Map SVG ─────────────────────────────────────────────────
function SatelliteMapVisual() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#4cd7f6]/20 shadow-[0_0_60px_-12px_rgba(76,215,246,0.15)]">
      <svg
        viewBox="0 0 640 420"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full block"
        aria-label="Satellite SAR flood extent map over Nepal Terai region"
      >
        <defs>
          {/* Pixel grid — simulates SAR raster */}
          <pattern id="sarGrid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#18273f" strokeWidth="0.6" />
          </pattern>

          {/* Terrain gradients */}
          <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0e1e38" />
            <stop offset="100%" stopColor="#090f1e" />
          </linearGradient>

          {/* Flood fill */}
          <linearGradient id="floodFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4cd7f6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#1a8fb5" stopOpacity="0.30" />
          </linearGradient>

          {/* Soft glow on flood patches */}
          <filter id="floodBlur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
          <filter id="softGlow" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Base background ─────────────────────────────────────── */}
        <rect width="640" height="420" fill="url(#bgGrad)" />
        <rect width="640" height="420" fill="url(#sarGrid)" />

        {/* ── Siwalik foothills (north strip, y 0-95) ──────────────── */}
        <polygon
          points="0,0 640,0 640,90 540,78 430,95 310,82 190,98 80,85 0,95"
          fill="#132030" opacity="0.95"
        />
        {/* Hill texture patches */}
        <ellipse cx="80"  cy="52" rx="65" ry="28" fill="#192c42" opacity="0.6" />
        <ellipse cx="220" cy="44" rx="80" ry="32" fill="#172a40" opacity="0.6" />
        <ellipse cx="400" cy="50" rx="90" ry="30" fill="#182b40" opacity="0.55" />
        <ellipse cx="570" cy="46" rx="68" ry="26" fill="#172a3e" opacity="0.6" />
        {/* Snow hints on ridgeline */}
        <path
          d="M 30,18 Q 80,8 140,22 Q 200,10 270,20 Q 340,8 420,18 Q 490,8 560,16 Q 600,10 640,18"
          fill="none" stroke="#dae2fd" strokeWidth="0.8" opacity="0.12"
        />

        {/* ── Terai flatland (y 95-315) ────────────────────────────── */}
        <rect x="0" y="95" width="640" height="220" fill="#0d1c30" opacity="0.9" />

        {/* Agricultural field grid */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((col) =>
          [0, 1, 2, 3, 4].map((row) => (
            <rect
              key={`${col}-${row}`}
              x={col * 80}
              y={98 + row * 43}
              width="77"
              height="40"
              fill={row % 2 === 0 ? '#0f2035' : '#102238'}
              opacity="0.6"
              rx="1"
            />
          ))
        )}

        {/* ── River system (Terai rivers flow south) ───────────────── */}
        {/* Main river channel */}
        <path
          d="M 0,162 Q 70,150 140,165 Q 210,180 280,167 Q 350,154 420,172 Q 490,188 560,175 Q 600,168 640,172"
          fill="none" stroke="#1a3f60" strokeWidth="10" opacity="0.85"
        />
        <path
          d="M 0,162 Q 70,150 140,165 Q 210,180 280,167 Q 350,154 420,172 Q 490,188 560,175 Q 600,168 640,172"
          fill="none" stroke="#26618f" strokeWidth="5" opacity="0.55"
        />
        {/* Tributaries */}
        <path d="M 160,95 Q 168,128 155,162"  fill="none" stroke="#1a3f60" strokeWidth="4" opacity="0.7" />
        <path d="M 355,95 Q 360,130 362,168" fill="none" stroke="#1a3f60" strokeWidth="4" opacity="0.7" />
        <path d="M 510,95 Q 505,132 495,174" fill="none" stroke="#1a3f60" strokeWidth="3" opacity="0.6" />

        {/* ── Flood extent — blurred glow layer (painted first) ─────── */}
        <ellipse cx="195" cy="200" rx="162" ry="98"  fill="#4cd7f6" opacity="0.10" filter="url(#floodBlur)" />
        <ellipse cx="385" cy="215" rx="135" ry="82"  fill="#4cd7f6" opacity="0.09" filter="url(#floodBlur)" />
        <ellipse cx="535" cy="205" rx="100" ry="68"  fill="#4cd7f6" opacity="0.08" filter="url(#floodBlur)" />

        {/* ── Flood extent — main fill ──────────────────────────────── */}
        <ellipse cx="195" cy="200" rx="158" ry="94"  fill="url(#floodFill)" />
        <ellipse cx="385" cy="215" rx="130" ry="78"  fill="url(#floodFill)" opacity="0.9" />
        <ellipse cx="535" cy="205" rx="96"  ry="64"  fill="url(#floodFill)" opacity="0.75" />

        {/* Flood channel along river */}
        <path
          d="M 0,150 Q 70,138 140,153 Q 210,168 280,155 Q 350,142 420,160 Q 490,176 560,163 Q 600,156 640,160
             L 640,185 Q 600,180 560,192 Q 490,205 420,188 Q 350,172 280,184 Q 210,196 140,182 Q 70,168 0,180 Z"
          fill="#4cd7f6" opacity="0.18"
        />

        {/* Flood edge dashed contour lines */}
        <path
          d="M 45,258 Q 115,246 185,261 Q 255,276 325,262 Q 370,252 395,264"
          fill="none" stroke="#4cd7f6" strokeWidth="1.2" opacity="0.30" strokeDasharray="5,4"
        />
        <path
          d="M 360,248 Q 430,235 500,248 Q 555,258 600,248"
          fill="none" stroke="#4cd7f6" strokeWidth="1.2" opacity="0.25" strokeDasharray="5,4"
        />

        {/* ── Southern plains / border strip (y 315-420) ───────────── */}
        <rect x="0" y="315" width="640" height="105" fill="#0b1827" opacity="0.95" />
        <rect x="0" y="315" width="640" height="6"   fill="#091523" opacity="0.7" />
        {/* Low ridgeline */}
        <ellipse cx="95"  cy="375" rx="85"  ry="38" fill="#102030" opacity="0.75" />
        <ellipse cx="285" cy="385" rx="105" ry="34" fill="#0f1f30" opacity="0.75" />
        <ellipse cx="475" cy="378" rx="95"  ry="36" fill="#102030" opacity="0.75" />
        <ellipse cx="615" cy="383" rx="68"  ry="30" fill="#0f1f30" opacity="0.7" />

        {/* ── Settlement markers ────────────────────────────────────── */}
        {/* At-risk (inside flood zone) — orange */}
        {[
          [162, 213], [240, 188], [308, 230], [418, 198], [494, 218],
        ].map(([cx, cy], i) => (
          <g key={`risk-${i}`} filter="url(#softGlow)">
            <circle cx={cx} cy={cy} r={10} fill="#ffb95f" opacity="0.15" />
            <circle cx={cx} cy={cy} r={5.5} fill="#ffb95f" opacity="0.90" />
            <circle cx={cx} cy={cy} r={2}   fill="#fff"    opacity="0.85" />
          </g>
        ))}
        {/* Safe settlements — cyan */}
        {[
          [75, 128], [368, 118], [558, 130], [100, 285], [545, 278],
        ].map(([cx, cy], i) => (
          <circle key={`safe-${i}`} cx={cx} cy={cy} r={4} fill="#4cd7f6" opacity="0.65" />
        ))}

        {/* ── Graticule labels ──────────────────────────────────────── */}
        <text x="6"   y="14"  fill="#4cd7f6" fontSize="8" opacity="0.50" fontFamily="monospace">27.4°N</text>
        <text x="6"   y="105" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">27.0°N</text>
        <text x="6"   y="220" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">26.7°N</text>
        <text x="6"   y="318" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">26.3°N</text>
        <text x="82"  y="412" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">83.4°E</text>
        <text x="242" y="412" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">84.2°E</text>
        <text x="402" y="412" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">85.0°E</text>
        <text x="562" y="412" fill="#4cd7f6" fontSize="8" opacity="0.38" fontFamily="monospace">85.8°E</text>

        {/* Graticule lines */}
        <line x1="0" y1="95"  x2="640" y2="95"  stroke="#4cd7f6" strokeWidth="0.4" opacity="0.12" strokeDasharray="5,9" />
        <line x1="0" y1="315" x2="640" y2="315" stroke="#4cd7f6" strokeWidth="0.4" opacity="0.12" strokeDasharray="5,9" />

        {/* ── Compass rose ─────────────────────────────────────────── */}
        <g transform="translate(610, 28)">
          <circle cx="0" cy="0" r="15" fill="#0b1326" stroke="#4cd7f6" strokeWidth="0.6" opacity="0.70" />
          <polygon points="0,-9 2,2 0,0 -2,2"   fill="#4cd7f6" opacity="0.95" />
          <polygon points="0,9  2,-2 0,0 -2,-2"  fill="#4cd7f6" opacity="0.28" />
          <polygon points="-9,0  2,2  0,0  2,-2" fill="#4cd7f6" opacity="0.28" />
          <polygon points="9,0  -2,2  0,0 -2,-2" fill="#4cd7f6" opacity="0.28" />
          <text x="0" y="-11" textAnchor="middle" fill="#4cd7f6" fontSize="7" fontFamily="monospace" opacity="0.95">N</text>
        </g>

        {/* ── Metadata badges (top-left) ────────────────────────────── */}
        <rect x="6"  y="20" width="76" height="17" rx="3" fill="#09121f" opacity="0.88" stroke="#4cd7f6" strokeWidth="0.4" strokeOpacity="0.35" />
        <text x="14" y="32" fill="#4cd7f6" fontSize="8.5" fontFamily="monospace" opacity="0.90">SAR · Sentinel-1A</text>

        <rect x="6"  y="42" width="100" height="17" rx="3" fill="#09121f" opacity="0.88" stroke="#ffb95f" strokeWidth="0.4" strokeOpacity="0.45" />
        <circle cx="15" cy="51" r="3" fill="#ffb95f" opacity="0.90" />
        <text x="23" y="54" fill="#ffb95f" fontSize="8.5" fontFamily="monospace" opacity="0.90">5 settlements at risk</text>

        {/* ── Scale bar ────────────────────────────────────────────── */}
        <g transform="translate(18, 394)">
          <line x1="0" y1="0" x2="64" y2="0" stroke="#dae2fd" strokeWidth="2"   opacity="0.45" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#dae2fd" strokeWidth="1.5" opacity="0.45" />
          <line x1="64" y1="-4" x2="64" y2="4" stroke="#dae2fd" strokeWidth="1.5" opacity="0.45" />
          <text x="32" y="-7" textAnchor="middle" fill="#dae2fd" fontSize="8" opacity="0.55" fontFamily="monospace">25 km</text>
        </g>

        {/* ── Legend ───────────────────────────────────────────────── */}
        <rect x="444" y="338" width="190" height="76" rx="6"
          fill="#09121f" opacity="0.92" stroke="#4cd7f6" strokeWidth="0.5" strokeOpacity="0.28" />

        <rect   x="455" y="350" width="14" height="10" rx="2" fill="#4cd7f6" opacity="0.48" />
        <text   x="475" y="359" fill="#dae2fd" fontSize="9" fontFamily="sans-serif" opacity="0.82">Flood Extent (SAR-derived)</text>

        <circle cx="462"  cy="374" r="5.5" fill="#ffb95f" opacity="0.88" />
        <text   x="475"  y="378" fill="#dae2fd" fontSize="9" fontFamily="sans-serif" opacity="0.82">Affected Settlement</text>

        <circle cx="462"  cy="396" r="4.5" fill="#4cd7f6" opacity="0.65" />
        <text   x="475"  y="400" fill="#dae2fd" fontSize="9" fontFamily="sans-serif" opacity="0.82">Unaffected Settlement</text>
      </svg>
    </div>
  )
}

// ─── How It Works steps ───────────────────────────────────────────────────────
const steps = [
  {
    number: '01',
    Icon: Search,
    title: 'Region Selection',
    description:
      "Define the area of interest over Nepal's Terai region using district boundaries or custom coordinates.",
  },
  {
    number: '02',
    Icon: Satellite,
    title: 'Imagery Acquisition',
    description:
      'Pre- and post-flood SAR scenes are fetched from Sentinel-1 via Google Earth Engine for the chosen date range.',
  },
  {
    number: '03',
    Icon: GitCompare,
    title: 'Change Detection',
    description:
      'NDWI-based algorithms compare baseline and flood imagery to delineate inundated areas at 10 m resolution.',
  },
  {
    number: '04',
    Icon: BarChart3,
    title: 'Impact Assessment',
    description:
      'Flood polygons are intersected with settlement and infrastructure layers to quantify affected communities.',
  },
]

// ─── Feature cards ────────────────────────────────────────────────────────────
const features = [
  {
    Icon: Layers,
    title: 'Flood Extent Mapping',
    description:
      'SAR-derived flood boundary delineation at 10 m resolution across the Terai floodplain using NDWI change detection.',
    tag: 'SAR · Sentinel-1',
  },
  {
    Icon: Building2,
    title: 'Settlement Impact',
    description:
      'Identifies which villages and settlements intersect the flood extent using OpenStreetMap and census data.',
    tag: 'OSM · Census',
  },
  {
    Icon: Network,
    title: 'Infrastructure Impact',
    description:
      'Assesses road, bridge, and critical facility exposure via geospatial intersection analysis over affected areas.',
    tag: 'Road · Bridge · Facility',
  },
  {
    Icon: Activity,
    title: 'Flood Statistics',
    description:
      'Quantitative metrics on affected area (km²), population counts, and temporal flood progression over time.',
    tag: 'Analytics',
  },
]

// ─── Home Page ────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="text-[#dae2fd] font-sans">

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#4cd7f6]/5 rounded-full blur-[120px]" />
          <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-[#4cd7f6]/4 rounded-full blur-[90px]" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 xl:gap-20 items-center">

            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8F5E9] border border-[#D1D5DB] text-[#166534] dark:bg-[#4cd7f6]/8 dark:border-[#4cd7f6]/20 dark:text-[#4cd7f6] text-xs font-medium mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6] animate-pulse" />
                Satellite-Based Flood Intelligence · Nepal Terai
              </div>

              <h1 className="font-display text-5xl sm:text-6xl lg:text-[3.75rem] xl:text-[4rem] font-bold text-[#263238] dark:text-white leading-[1.08] tracking-tight mb-6">
                See Floods<br />
                <span className="text-[#166534] dark:text-[#4cd7f6]">Before They</span><br />
                Spread.
              </h1>

              <p className="text-[#6B7280] dark:text-[#dae2fd]/65 text-lg leading-relaxed mb-9 max-w-[480px]">
                FloodLens uses Sentinel-1 SAR satellite imagery and Google Earth Engine to map
                flood extent and assess settlement impact across Nepal's Terai region — processed
                on-demand, district by district.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/analysis"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#166534] hover:bg-[#14532D] text-white font-semibold text-sm rounded-xl transition-all duration-150 shadow-sm"
                >
                  Start Flood Analysis
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-[#F5F7F6] text-[#166534] border border-[#166534] font-semibold text-sm rounded-xl transition-all duration-150 shadow-sm"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#D1D5DB] text-[#6B7280] font-medium text-sm rounded-xl hover:border-[#166534] hover:text-[#263238] transition-all duration-150"
                >
                  How It Works
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>

              {/* Spec pills */}
              <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2.5">
                {[
                  { label: 'SAR Resolution', value: '10 m' },
                  { label: 'Data Source',    value: 'Sentinel-1 / GEE' },
                  { label: 'Coverage',       value: 'Nepal Terai' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                    <span className="text-xs text-[#dae2fd]/50">{s.label}</span>
                    <span className="text-xs font-semibold text-[#dae2fd]/85">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — map visual */}
            <div className="relative">
              <SatelliteMapVisual />

              {/* Floating stat chips */}
              <div className="absolute -top-5 -left-5 hidden sm:block bg-[#131b2e] border border-[#4cd7f6]/20 rounded-xl px-4 py-3 shadow-2xl">
                <p className="text-[10px] text-[#dae2fd]/45 uppercase tracking-wider mb-0.5">Flood Extent</p>
                <p className="text-2xl font-bold text-[#4cd7f6] font-display leading-none">254.8 km²</p>
                <p className="text-[10px] text-[#dae2fd]/35 mt-0.5">Latest SAR analysis</p>
              </div>

              <div className="absolute -bottom-5 -right-5 hidden sm:block bg-[#131b2e] border border-[#ffb95f]/20 rounded-xl px-4 py-3 shadow-2xl">
                <p className="text-[10px] text-[#dae2fd]/45 uppercase tracking-wider mb-0.5">At-Risk Settlements</p>
                <p className="text-2xl font-bold text-[#ffb95f] font-display leading-none">5 detected</p>
                <p className="text-[10px] text-[#dae2fd]/35 mt-0.5">Terai region example</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#F5F7F6] dark:bg-[#0d1629] border-y border-[#D1D5DB] dark:border-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#166534] dark:text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-3">
              Methodology
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#263238] dark:text-white">How It Works</h2>
            <p className="text-[#dae2fd]/55 mt-4 max-w-lg mx-auto text-sm leading-relaxed">
              A four-step geospatial intelligence pipeline — from raw satellite imagery to
              actionable flood impact data.
            </p>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map(({ number, Icon, title, description }) => (
              <div
                key={number}
                className="group relative bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-6 hover:border-[#4cd7f6]/28 transition-colors duration-200"
              >
                {/* Number watermark */}
                <span className="absolute top-5 right-5 text-4xl font-bold font-display text-[#4cd7f6]/8 select-none">
                  {number}
                </span>

                <div className="w-10 h-10 rounded-xl bg-[#4cd7f6]/8 border border-[#4cd7f6]/18 flex items-center justify-center mb-4 group-hover:bg-[#4cd7f6]/12 transition-colors duration-200">
                  <Icon className="w-5 h-5 text-[#4cd7f6]" />
                </div>

                <p className="text-[10px] font-semibold text-[#4cd7f6]/50 tracking-widest mb-1.5">
                  STEP {number}
                </p>
                <h3 className="text-white font-semibold font-display mb-2">{title}</h3>
                <p className="text-[#dae2fd]/50 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>

          {/* Connector arrows (desktop only, decorative) */}
          <div className="hidden lg:flex justify-between px-[14%] mt-0 -translate-y-[168px] pointer-events-none">
            {[0, 1, 2].map((i) => (
              <ChevronRight key={i} className="w-4 h-4 text-[#4cd7f6]/20" />
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Cards ───────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#166534] dark:text-[#4cd7f6] text-xs font-semibold uppercase tracking-[0.18em] mb-3">
              Capabilities
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#263238] dark:text-white">
              What FloodLens Provides
            </h2>
            <p className="text-[#dae2fd]/55 mt-4 max-w-lg mx-auto text-sm leading-relaxed">
              From satellite data acquisition to settlement-level impact analysis — all in one platform.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ Icon, title, description, tag }) => (
              <div
                key={title}
                className="group bg-[#171f33] border border-[#4cd7f6]/10 rounded-2xl p-6 hover:border-[#4cd7f6]/24 transition-colors duration-200"
              >
                <div className="w-11 h-11 rounded-xl bg-[#0b1326] border border-[#4cd7f6]/18 flex items-center justify-center mb-5 group-hover:border-[#4cd7f6]/35 transition-colors duration-200">
                  <Icon className="w-5 h-5 text-[#4cd7f6]" />
                </div>
                <h3 className="text-white font-semibold font-display mb-2">{title}</h3>
                <p className="text-[#dae2fd]/50 text-sm leading-relaxed mb-5">{description}</p>
                <span className="inline-block text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#4cd7f6]/8 text-[#4cd7f6] border border-[#4cd7f6]/15">
                  {tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#F5F7F6] dark:bg-[#0d1629] border-y border-[#D1D5DB] dark:border-transparent">
        <div className="max-w-2xl mx-auto text-center">
          <MapPin className="w-8 h-8 text-[#166534] dark:text-[#4cd7f6]/40 mx-auto mb-5" />
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#263238] dark:text-white mb-4">
            Ready to analyse a flood event?
          </h2>
          <p className="text-[#6B7280] dark:text-[#dae2fd]/55 text-sm leading-relaxed mb-8">
            Open the Flood Analysis dashboard to run satellite-based detection on any district
            across Nepal's Terai region.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white hover:bg-[#F5F7F6] text-[#166534] border border-[#166534] font-semibold text-sm rounded-xl transition-all duration-150 shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4 text-[#4cd7f6]" />
              Go to Dashboard
            </Link>
            <Link
              to="/analysis"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#166534] hover:bg-[#14532D] text-white font-bold text-sm rounded-xl transition-all duration-150 shadow-sm"
            >
              Start Flood Analysis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer id="about" className="pt-14 pb-8 px-4 sm:px-6 lg:px-8 bg-white dark:bg-transparent border-t border-[#D1D5DB] dark:border-[#4cd7f6]/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">

            {/* Brand column */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#4cd7f6]/10 border border-[#4cd7f6]/25 flex items-center justify-center">
                  <Satellite className="w-4 h-4 text-[#4cd7f6]" />
                </div>
                <span className="text-[#263238] dark:text-white font-bold font-display">FloodLens</span>
              </div>
              <p className="text-[#dae2fd]/45 text-sm leading-relaxed">
                Satellite-based flood detection and settlement impact assessment platform
                focused on Nepal's Terai region.
              </p>
              <p className="text-[#dae2fd]/25 text-xs mt-5">
                Built for NAKSHATRA 2026 Hackathon
              </p>
            </div>

            {/* Navigation column */}
            <div>
              <p className="text-[#263238] dark:text-white text-sm font-semibold font-display mb-4">Navigation</p>
              <ul className="space-y-2.5">
                {[
                  { label: 'Home',           to: '/'         },
                  { label: 'Dashboard',      to: '/dashboard'},
                  { label: 'Flood Analysis', to: '/analysis' },
                  { label: 'About',          to: '/about'    },
                ].map(({ label, to }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="text-[#6B7280] hover:text-[#166534] dark:text-[#dae2fd]/45 dark:hover:text-[#4cd7f6] text-sm transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Platform column */}
            <div>
              <p className="text-[#263238] dark:text-white text-sm font-semibold font-display mb-4">Platform</p>
              <ul className="space-y-2.5">
                {[
                  'Sentinel-1 SAR Imagery',
                  'Google Earth Engine',
                  'NDWI Change Detection',
                  'OpenStreetMap Integration',
                  'Nepal Terai Coverage',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[#6B7280] dark:text-[#dae2fd]/45 text-sm">
                    <span className="w-1 h-1 rounded-full bg-[#4cd7f6]/45 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[#4cd7f6]/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[#dae2fd]/25 text-xs">
              © 2026 FloodLens · NAKSHATRA Hackathon Project
            </p>
            <p className="text-[#dae2fd]/25 text-xs flex items-center gap-1.5">
              <Globe2 className="w-3 h-3" />
              Nepal Terai Region · Geospatial Intelligence
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
