import { Link } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import FloodMapViewer from '../components/map/FloodMapViewer'
import AnalysisProgress from '../components/ui/AnalysisProgress'
import Spinner from '../components/ui/Spinner'
import { useFloodAnalysis } from '../hooks/useFloodAnalysis'
import {
  Play, RotateCcw, MapPin, Calendar, Satellite,
  AlertCircle, BarChart3, ChevronDown, Info, Layers,
  Sliders, BookOpen, X, HelpCircle, CheckCircle2, LayoutDashboard,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: 'nepal-terai', label: 'Nepal Terai (Full Region)' },
  { value: 'koshi',       label: 'Koshi Province'            },
  { value: 'madhesh',     label: 'Madhesh Province'          },
  { value: 'lumbini',     label: 'Lumbini Province'          },
]

const DISTRICTS_BY_REGION = {
  'nepal-terai': [],
  'koshi':       ['Sunsari', 'Morang', 'Saptari', 'Siraha', 'Udayapur'],
  'madhesh':     ['Sarlahi', 'Mahottari', 'Dhanusha', 'Rautahat', 'Bara', 'Parsa'],
  'lumbini':     ['Rupandehi', 'Kapilvastu', 'Nawalparasi', 'Banke', 'Bardiya'],
}

const SATELLITES = [
  {
    value: 'sentinel-2',
    label: 'Sentinel-2',
    detail: 'Optical · 10 m · NDWI/MNDWI · Cloud-dependent',
  },
  {
    value: 'sentinel-1-sar',
    label: 'Sentinel-1 SAR',
    detail: 'SAR · 10 m · All-weather · Backscatter change',
  },
  {
    value: 'landsat',
    label: 'Landsat 8 / 9',
    detail: 'Optical · 30 m · NDWI · Long archive coverage',
  },
]
// Active pipeline stages (used to derive isRunning)
const RUNNING_STAGES = ['fetching', 'processing', 'detecting', 'calculating', 'retuning']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
  mode:              'demo',
  region:            'nepal-terai',
  district:          '',
  preFloodStart:     '',
  preFloodEnd:       '',
  postFloodStart:    '',
  postFloodEnd:      '',
  satellite:         'sentinel-1-sar',
  indices:           ['ndwi'],   // illustrative default — not scientifically validated
  threshold:         0.3,        // illustrative default — not scientifically validated
  // Refinement controls (Day 3) — PENDING: confirm all field names with backend team
  useHand:           false,      // Height Above Nearest Drainage masking
  slopeThreshold:    10,         // degrees — illustrative default
  speckleFilter:     false,      // SAR speckle filter
  accuracyThreshold: 0.7,        // confidence cut-off — illustrative default
}

function validate(form) {
  const errors = {}
  if (!form.region)          errors.region        = 'Region is required.'
  if (!form.preFloodStart)   errors.preFloodStart  = 'Pre-flood start date is required.'
  if (!form.preFloodEnd)     errors.preFloodEnd    = 'Pre-flood end date is required.'
  if (!form.postFloodStart)  errors.postFloodStart = 'Post-flood start date is required.'
  if (!form.postFloodEnd)    errors.postFloodEnd   = 'Post-flood end date is required.'
  if (!form.indices || form.indices.length === 0)
    errors.indices = 'Select at least one detection index.'

  if (form.preFloodStart && form.preFloodEnd && form.preFloodEnd < form.preFloodStart)
    errors.preFloodEnd = 'End date must be after start date.'

  if (form.postFloodStart && form.postFloodEnd && form.postFloodEnd < form.postFloodStart)
    errors.postFloodEnd = 'End date must be after start date.'

  if (form.preFloodEnd && form.postFloodStart && form.postFloodStart <= form.preFloodEnd)
    errors.postFloodStart = 'Post-flood period must start after the pre-flood period ends.'

  return errors
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="flex items-center gap-1 mt-1.5 text-xs text-red-400">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {msg}
    </p>
  )
}

function Label({ htmlFor, required, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-[#263238] dark:text-[#dae2fd]/70 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function inputCls(hasError) {
  return [
    'w-full bg-white dark:bg-[#0b1326] border rounded-lg text-sm text-[#263238] dark:text-[#dae2fd] px-3 py-2.5',
    'focus:outline-none focus:ring-1 transition-colors duration-150',
    'placeholder:text-[#6B7280] dark:placeholder:text-[#dae2fd]/25',
    hasError
      ? 'border-red-500 focus:ring-red-500/40'
      : 'border-[#D1D5DB] dark:border-[#4cd7f6]/15 focus:border-[#166534] dark:focus:border-[#4cd7f6]/40 focus:ring-[#166534]/20 dark:focus:ring-[#4cd7f6]/20',
  ].join(' ')
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-[#D1D5DB] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 rounded-2xl p-5 space-y-4 transition-colors duration-150">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
          <Icon className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
        </div>
        <h2 className="text-[#263238] dark:text-white font-semibold text-sm font-display">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// Results panel — local to Configure; populated by real backend responses
function ResultsPanel({ status, results }) {
  const hasResults = status === 'completed'

  // Extract real metrics from API response with multiple schema fallbacks
  const rawFloodedArea =
    results?.flood_extent_km2 ??
    results?.properties?.flood_extent_km2 ??
    results?.floodedAreaKm2 ??
    null

  const rawAffectedSettlements =
    results?.affected_settlements ??
    results?.affectedSettlements ??
    (results?.settlement_summary?.severely_affected !== undefined
      ? results.settlement_summary.severely_affected + (results.settlement_summary.partially_affected || 0)
      : null)

  const rawPopulation =
    results?.at_risk_population ??
    results?.atRiskPopulation ??
    results?.populationAtRisk ??
    results?.properties?.at_risk_population ??
    null

  const rawCoverage =
    results?.flood_coverage_pct ??
    results?.percentageImpact ??
    results?.flood_coverage ??
    results?.properties?.flood_coverage_pct ??
    null

  const metrics = [
    {
      label: 'Flooded Area',
      unit: 'km²',
      value: hasResults
        ? rawFloodedArea !== null
          ? typeof rawFloodedArea === 'number'
            ? rawFloodedArea.toLocaleString(undefined, { maximumFractionDigits: 1 })
            : String(rawFloodedArea)
          : '—'
        : null,
    },
    {
      label: 'Affected Settlements',
      unit: 'settlements',
      value: hasResults
        ? rawAffectedSettlements !== null
          ? String(rawAffectedSettlements)
          : '—'
        : null,
    },
    {
      label: 'Population at Risk',
      unit: 'est. people',
      value: hasResults
        ? rawPopulation !== null
          ? typeof rawPopulation === 'number'
            ? rawPopulation.toLocaleString()
            : String(rawPopulation)
          : '—'
        : null,
    },
    {
      label: 'Flood Coverage',
      unit: '% of region',
      value: hasResults
        ? rawCoverage !== null
          ? `${rawCoverage}%`
          : '—'
        : null,
    },
  ]

  const hasAnyMetric = [rawFloodedArea, rawAffectedSettlements, rawPopulation, rawCoverage].some(v => v !== null)

  return (
    <div className="bg-white border border-[#D1D5DB] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
          <BarChart3 className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
        </div>
        <h2 className="text-[#263238] dark:text-white font-semibold text-sm font-display">Analysis Results</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, unit, value }) => (
          <div key={label} className="bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#0b1326] dark:border-[#4cd7f6]/8 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-[#6B7280] dark:text-[#dae2fd]/40 uppercase tracking-wide mb-1.5">{label}</p>
            {value !== null ? (
              <>
                <p className="text-xl font-bold text-[#263238] dark:text-white font-display">{value}</p>
                <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/30 mt-0.5">
                  {value === '—' ? `${unit} · Data unavailable` : unit}
                </p>
              </>
            ) : (
              <div className="mt-1">
                <div className="h-6 w-14 bg-slate-200 dark:bg-[#dae2fd]/5 rounded animate-pulse mb-1 motion-reduce:animate-none motion-reduce:opacity-50" />
                <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/20">{unit} · awaiting run</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {!hasResults ? (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#dae2fd]/3 dark:border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#166534] dark:text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/35 leading-relaxed">
            Results will populate here after a successful analysis run. No synthetic values are shown.
          </p>
        </div>
      ) : hasAnyMetric ? (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
          <Info className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
          <p className="text-xs text-green-300/80 leading-relaxed">
            Live detection metrics received from backend analysis pipeline.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-[#ffb95f]/10 border border-[#ffb95f]/20">
          <Info className="w-3.5 h-3.5 text-[#ffb95f] shrink-0 mt-0.5" />
          <p className="text-xs text-[#ffb95f]/90 leading-relaxed">
            Analysis completed. Numerical metrics unavailable for this run; inspect the flood mask on the map.
          </p>
        </div>
      )}
    </div>
  )
}

// Map legend
function MapLegend() {
  const items = [
    { color: '#4cd7f6', opacity: 0.55, label: 'Potential Flood Extent' },
    { color: '#1e4a9c', opacity: 0.80, label: 'Permanent Water Body'   },
    { color: '#ffb95f', opacity: 0.90, label: 'Settlements'             },
    { color: '#94a3b8', opacity: 0.70, label: 'Infrastructure'          },
  ]
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm border border-[#D1D5DB] shadow-md dark:bg-[#0b1326]/92 dark:border-[#4cd7f6]/20 rounded-xl px-3.5 py-3">
      <p className="text-[10px] font-semibold text-[#263238] dark:text-[#dae2fd]/55 uppercase tracking-widest mb-2.5">Legend</p>
      {items.map(({ color, opacity, label }) => (
        <div key={label} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
          <span
            className="w-3 h-3 rounded-sm shrink-0 border"
            style={{ backgroundColor: color, opacity, borderColor: color }}
          />
          <span className="text-xs text-[#374151] dark:text-[#dae2fd]/65 font-medium">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Detection index options ──────────────────────────────────────────────────

const INDICES = [
  {
    value:  'ndwi',
    label:  'NDWI',
    detail: 'Normalized Difference Water Index · (Green − NIR) / (Green + NIR)',
    tooltip: 'Uses green and near-infrared reflectance to highlight open surface water bodies. Performance depends on cloud cover, sediment load, and landscape context.',
  },
  {
    value:  'mndwi',
    label:  'MNDWI',
    detail: 'Modified NDWI · (Green − SWIR) / (Green + SWIR)',
    tooltip: 'Replaces NIR with shortwave-infrared to suppress noise and improve water separation in built-up or urban areas. Relative accuracy varies with terrain and soil moisture.',
  },
  {
    value:  'awei',
    label:  'AWEI',
    detail: 'Automated Water Extraction Index · multi-band coefficients',
    tooltip: 'Uses weighted band equations designed to distinguish water from dark surfaces and shadows. Effectiveness depends on regional terrain, illumination, and seasonal conditions.',
  },
]

// ─── Detection Settings sub-component ────────────────────────────────────────

function DetectionSettingsCard({ form, setField, fieldError }) {
  const toggleIndex = (value) => {
    const updated = form.indices.includes(value)
      ? form.indices.filter((i) => i !== value)
      : [...form.indices, value]
    setField('indices', updated)
  }

  return (
    <SectionCard icon={Sliders} title="Detection Settings">

      {/* Index checkboxes */}
      <div>
        <p className="text-xs font-semibold text-[#263238] dark:text-[#dae2fd]/55 uppercase tracking-wider mb-1.5">
          Detection Index <span className="text-red-500">*</span>
        </p>
        <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28 mb-3 leading-relaxed">
          Defaults are illustrative starting points — not scientifically validated for this region.
        </p>
        <div className="space-y-2">
          {INDICES.map((idx) => (
            <label
              key={idx.value}
              className={[
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
                form.indices.includes(idx.value)
                  ? 'border-[#166534] bg-[#E8F5E9] dark:border-[#4cd7f6]/40 dark:bg-[#4cd7f6]/8'
                  : 'border-[#D1D5DB] bg-white text-[#263238] hover:bg-[#F5F7F6] dark:border-[#4cd7f6]/10 dark:bg-transparent dark:text-[#dae2fd]/70 dark:hover:border-[#4cd7f6]/22 dark:hover:bg-[#4cd7f6]/4',
              ].join(' ')}
            >
              <input
                type="checkbox"
                value={idx.value}
                checked={form.indices.includes(idx.value)}
                onChange={() => toggleIndex(idx.value)}
                aria-label={idx.label}
                className="mt-0.5 accent-[#166534] dark:accent-[#4cd7f6] shrink-0"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${form.indices.includes(idx.value) ? 'text-[#166534] dark:text-[#4cd7f6]' : 'text-[#263238] dark:text-[#dae2fd]/80'}`}>
                    {idx.label}
                  </p>
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#E8F5E9] text-[#166534] border border-[#166534]/30 dark:bg-[#4cd7f6]/10 dark:text-[#4cd7f6] text-[9px] font-bold cursor-help dark:border-[#4cd7f6]/20"
                    title={idx.tooltip}
                    aria-label={`${idx.label} explanation`}
                  >
                    ?
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/40 mt-0.5 leading-relaxed">{idx.detail}</p>
                {idx.tooltip && (
                  <p className="text-[11px] text-[#166534] dark:text-[#4cd7f6]/80 mt-1 leading-snug">
                    {idx.tooltip}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
        <FieldError msg={fieldError('indices')} />
      </div>

      {/* Threshold slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="threshold" className="text-xs font-semibold text-[#263238] dark:text-[#dae2fd]/60">
              Flood Threshold (Otsu)
            </label>
            <span
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#E8F5E9] text-[#166534] border border-[#166534]/30 dark:bg-[#4cd7f6]/10 dark:text-[#4cd7f6] text-[9px] font-bold cursor-help dark:border-[#4cd7f6]/20"
              title="Otsu automated thresholding estimates an optimal cut-off from the image pixel histogram to partition water from non-water. Results can be fine-tuned manually."
              aria-label="Otsu threshold explanation"
            >
              ?
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-[#166534] bg-[#E8F5E9] border border-[#166534]/30 dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/8 dark:border-[#4cd7f6]/20 px-2 py-0.5 rounded">
            {form.threshold.toFixed(2)}
          </span>
        </div>
        <input
          id="threshold"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={form.threshold}
          onChange={(e) => setField('threshold', parseFloat(e.target.value))}
          aria-label={`Flood threshold: ${form.threshold.toFixed(2)}`}
          className="w-full accent-[#166534] dark:accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">0.00 · more water</span>
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">1.00 · less water</span>
        </div>
        <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/50 mt-2 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#166534] dark:text-[#4cd7f6]" />
          <span>
            <strong>Otsu Automated Thresholding:</strong> Automatically estimates an optimal split from pixel intensity distributions. Pixels exceeding this value are classified as flood extent; manual adjustments help accommodate turbidity or partial clouds.
          </span>
        </p>
      </div>
    </SectionCard>
  )
}

// ─── Pre/post imagery panel ───────────────────────────────────────────────────

function ImageryPanel({ results }) {
  // PENDING: confirm thumbnail URL field names with backend team
  const preUrl  = results?.pre_image_url  ?? results?.preImageUrl  ?? '/api/flood/thumbnails/pre_flood'
  const postUrl = results?.post_image_url ?? results?.postImageUrl ?? '/api/flood/thumbnails/post_flood'

  return (
    <div className="bg-white border border-[#D1D5DB] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
          <Satellite className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
        </div>
        <div>
          <h2 className="text-[#263238] dark:text-white font-semibold text-sm font-display">Satellite Imagery</h2>
          <p className="text-[#6B7280] dark:text-[#dae2fd]/30 text-xs">Pre-flood · Post-flood</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Pre-Flood',  url: preUrl  },
          { label: 'Post-Flood', url: postUrl },
        ].map(({ label, url }) => (
          <div key={label} className="rounded-xl overflow-hidden border border-[#D1D5DB] dark:border-[#4cd7f6]/10">
            {url ? (
              <img
                src={url}
                alt={`${label} satellite thumbnail`}
                className="w-full h-28 object-cover"
              />
            ) : (
              <div className="w-full h-28 bg-[#F5F7F6] dark:bg-[#0b1326] flex flex-col items-center justify-center gap-1.5">
                <Satellite className="w-5 h-5 text-slate-300 dark:text-[#dae2fd]/12" aria-hidden="true" />
                <p className="text-[9px] text-[#6B7280] dark:text-[#dae2fd]/22 text-center leading-tight px-2">
                  {label}<br />imagery unavailable
                </p>
              </div>
            )}
            <p className="text-[10px] text-center py-1.5 text-[#263238] dark:text-[#dae2fd]/40 font-medium border-t border-[#D1D5DB] dark:border-[#4cd7f6]/8">
              {label}
            </p>
          </div>
        ))}
      </div>

      {!preUrl && !postUrl && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#dae2fd]/3 dark:border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#166534] dark:text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/35 leading-relaxed">
            Thumbnails will appear here when the backend returns image URLs after a successful run.
            {/* PENDING: confirm pre_image_url / post_image_url field names with backend team */}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Refinement Settings sub-component ───────────────────────────────────────

function RefinementSettingsCard({ form, setField }) {
  return (
    <SectionCard icon={Sliders} title="Refinement Controls">
      <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28 leading-relaxed -mt-1">
        Adjust these parameters to refine the flood mask after initial detection.
        All defaults are illustrative — not scientifically validated.
      </p>

      {/* HAND toggle */}
      <label className={[
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
        form.useHand
          ? 'border-[#166534] bg-[#E8F5E9] dark:border-[#4cd7f6]/40 dark:bg-[#4cd7f6]/8'
          : 'border-[#D1D5DB] bg-white text-[#263238] hover:bg-[#F5F7F6] dark:border-[#4cd7f6]/10 dark:bg-transparent dark:text-[#dae2fd]/70 dark:hover:border-[#4cd7f6]/22 dark:hover:bg-[#4cd7f6]/4',
      ].join(' ')}>
        <input
          type="checkbox"
          checked={form.useHand}
          onChange={e => setField('useHand', e.target.checked)}
          aria-label="Enable HAND masking"
          className="mt-0.5 accent-[#166534] dark:accent-[#4cd7f6] shrink-0"
        />
        <div>
          <p className={`text-sm font-semibold ${form.useHand ? 'text-[#166534] dark:text-[#4cd7f6]' : 'text-[#263238] dark:text-[#dae2fd]/80'}`}>
            HAND Masking
          </p>
          <p className="text-xs text-[#374151] dark:text-[#dae2fd]/55 mt-0.5 leading-relaxed">
            <strong>Height Above Nearest Drainage (HAND):</strong> Computes normalized terrain elevation relative to the local drainage network to eliminate hydrologically impossible upland water false positives.
          </p>
        </div>
      </label>

      {/* Slope threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="slopeThreshold" className="text-xs font-semibold text-[#263238] dark:text-[#dae2fd]/60">
            Slope Threshold
          </label>
          <span className="font-mono text-xs font-bold text-[#166534] bg-[#E8F5E9] border border-[#166534]/30 dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/8 dark:border-[#4cd7f6]/20 px-2 py-0.5 rounded">
            {form.slopeThreshold}°
          </span>
        </div>
        <input
          id="slopeThreshold"
          type="range"
          min="1"
          max="45"
          step="1"
          value={form.slopeThreshold}
          onChange={e => setField('slopeThreshold', parseInt(e.target.value, 10))}
          aria-label={`Slope threshold: ${form.slopeThreshold} degrees`}
          className="w-full accent-[#166534] dark:accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">1° · flat terrain</span>
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">45° · steep slopes excluded</span>
        </div>
        <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/50 mt-1.5 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#166534] dark:text-[#4cd7f6]" />
          <span>
            <strong>Slope Filter:</strong> Discards steep terrain where water cannot accumulate; effectiveness depends on local topography and Digital Elevation Model (DEM) resolution.
          </span>
        </p>
      </div>

      {/* Speckle filter toggle */}
      <label className={[
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
        form.speckleFilter
          ? 'border-[#166534] bg-[#E8F5E9] dark:border-[#4cd7f6]/40 dark:bg-[#4cd7f6]/8'
          : 'border-[#D1D5DB] bg-white text-[#263238] hover:bg-[#F5F7F6] dark:border-[#4cd7f6]/10 dark:bg-transparent dark:text-[#dae2fd]/70 dark:hover:border-[#4cd7f6]/22 dark:hover:bg-[#4cd7f6]/4',
      ].join(' ')}>
        <input
          type="checkbox"
          checked={form.speckleFilter}
          onChange={e => setField('speckleFilter', e.target.checked)}
          aria-label="Enable SAR speckle filter"
          className="mt-0.5 accent-[#166534] dark:accent-[#4cd7f6] shrink-0"
        />
        <div>
          <p className={`text-sm font-semibold ${form.speckleFilter ? 'text-[#166534] dark:text-[#4cd7f6]' : 'text-[#263238] dark:text-[#dae2fd]/80'}`}>
            SAR Speckle Filter
          </p>
          <p className="text-xs text-[#374151] dark:text-[#dae2fd]/55 mt-0.5 leading-relaxed">
            <strong>SAR Speckle Filter:</strong> Synthetic Aperture Radar contains granular speckle noise. Spatial filtering (Lee/Frost) reduces speckle artifacts while preserving flood inundation boundaries, enabling radar gap-filling during heavy cloud cover.
          </p>
        </div>
      </label>

      {/* Accuracy threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="accuracyThreshold" className="text-xs font-semibold text-[#263238] dark:text-[#dae2fd]/60">
            Accuracy Threshold
          </label>
          <span className="font-mono text-xs font-bold text-[#166534] bg-[#E8F5E9] border border-[#166534]/30 dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/8 dark:border-[#4cd7f6]/20 px-2 py-0.5 rounded">
            {form.accuracyThreshold.toFixed(2)}
          </span>
        </div>
        <input
          id="accuracyThreshold"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={form.accuracyThreshold}
          onChange={e => setField('accuracyThreshold', parseFloat(e.target.value))}
          aria-label={`Accuracy threshold: ${form.accuracyThreshold.toFixed(2)}`}
          className="w-full accent-[#166534] dark:accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">0.00 · include all</span>
          <span className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/28">1.00 · highest confidence only</span>
        </div>
        <p className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/35 mt-1.5 flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          Configurable target/evaluation threshold for the accuracy gate, not a measured model accuracy score.
        </p>
      </div>
    </SectionCard>
  )
}

// ─── Before / after refinement mask comparison panel ─────────────────────────

function MaskComparisonPanel({ results }) {
  // PENDING: confirm field names for refined / unrefined mask URLs with backend team
  const unrefinedUrl = results?.unrefined_mask_url ?? results?.unrefinedMaskUrl ?? '/api/flood/thumbnails/unrefined_mask'
  const refinedUrl   = results?.refined_mask_url   ?? results?.refinedMaskUrl   ?? '/api/flood/thumbnails/refined_mask'

  return (
    <div className="bg-white border border-[#D1D5DB] shadow-sm dark:bg-[#131b2e] dark:border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
          <Layers className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
        </div>
        <div>
          <h2 className="text-[#263238] dark:text-white font-semibold text-sm font-display">Flood Mask Comparison</h2>
          <p className="text-[#6B7280] dark:text-[#dae2fd]/30 text-xs">Before refinement · After refinement</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Before Refinement', url: unrefinedUrl },
          { label: 'After Refinement',  url: refinedUrl   },
        ].map(({ label, url }) => (
          <div key={label} className="rounded-xl overflow-hidden border border-[#D1D5DB] dark:border-[#4cd7f6]/10">
            {url ? (
              <img
                src={url}
                alt={`${label} flood mask`}
                className="w-full h-28 object-cover"
              />
            ) : (
              <div className="w-full h-28 bg-[#F5F7F6] dark:bg-[#0b1326] flex flex-col items-center justify-center gap-1.5">
                <Layers className="w-5 h-5 text-slate-300 dark:text-[#dae2fd]/12" aria-hidden="true" />
                <p className="text-[9px] text-[#6B7280] dark:text-[#dae2fd]/22 text-center leading-tight px-2">
                  {label}<br />unavailable
                </p>
              </div>
            )}
            <p className="text-[10px] text-center py-1.5 text-[#263238] dark:text-[#dae2fd]/40 font-medium border-t border-[#D1D5DB] dark:border-[#4cd7f6]/8">
              {label}
            </p>
          </div>
        ))}
      </div>

      {!unrefinedUrl && !refinedUrl && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#dae2fd]/3 dark:border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#166534] dark:text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/35 leading-relaxed">
            Mask thumbnails will appear here when the backend returns refined flood mask URLs.
            {/* PENDING: confirm unrefined_mask_url / refined_mask_url field names with backend team */}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────


// ─── Judge Onboarding Guide Modal ─────────────────────────────────────────────

function JudgeOnboardingModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl cursor-default bg-white border border-[#D1D5DB] shadow-2xl rounded-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto space-y-5 dark:bg-[#0f1923] dark:border-[#4cd7f6]/30 text-[#263238] dark:text-white">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#D1D5DB] dark:border-[#4cd7f6]/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#E8F5E9] border border-[#166534]/30 text-[#166534] dark:bg-[#4cd7f6]/10 dark:border-[#4cd7f6]/25 dark:text-[#4cd7f6]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 id="guide-title" className="text-lg font-bold text-[#263238] dark:text-white font-display">
                How to Use FloodLens — Judge Onboarding Guide
              </h2>
              <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/60 mt-0.5">
                4-step flood intelligence workflow for evaluation and assessment.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#263238] hover:bg-[#F5F7F6] dark:text-[#dae2fd]/40 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
            aria-label="Close guide modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Steps */}
        <div className="grid gap-3.5">
          <div className="flex gap-3.5 p-3.5 rounded-xl bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#4cd7f6]/5 dark:border-[#4cd7f6]/15">
            <div className="w-7 h-7 rounded-lg bg-[#166534] text-white font-bold text-xs flex items-center justify-center shrink-0 dark:bg-[#4cd7f6] dark:text-[#0f1923]">
              1
            </div>
            <div className="text-xs">
              <h3 className="font-semibold text-[#263238] dark:text-white mb-0.5">Step 1: Configure AOI &amp; Temporal Windows</h3>
              <p className="text-[#374151] dark:text-[#dae2fd]/65 leading-relaxed">
                Select your target region (e.g., Koshi or Madhesh Province), optional district filters, and pre/post-flood observation date ranges. Choose between optical sensors (Sentinel-2, Landsat) or all-weather Sentinel-1 SAR.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 p-3.5 rounded-xl bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#4cd7f6]/5 dark:border-[#4cd7f6]/15">
            <div className="w-7 h-7 rounded-lg bg-[#166534] text-white font-bold text-xs flex items-center justify-center shrink-0 dark:bg-[#4cd7f6] dark:text-[#0f1923]">
              2
            </div>
            <div className="text-xs">
              <h3 className="font-semibold text-[#263238] dark:text-white mb-0.5">Step 2: Run Detection &amp; Scientific Refinement</h3>
              <p className="text-[#374151] dark:text-[#dae2fd]/65 leading-relaxed">
                Trigger the automated Otsu thresholding detection pipeline. Apply HAND (Height Above Nearest Drainage) to filter false positives on elevated terrain, set slope cut-offs, and activate SAR speckle filtering for all-weather penetration.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 p-3.5 rounded-xl bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#4cd7f6]/5 dark:border-[#4cd7f6]/15">
            <div className="w-7 h-7 rounded-lg bg-[#166534] text-white font-bold text-xs flex items-center justify-center shrink-0 dark:bg-[#4cd7f6] dark:text-[#0f1923]">
              3
            </div>
            <div className="text-xs">
              <h3 className="font-semibold text-[#263238] dark:text-white mb-0.5">Step 3: Inspect Settlement Impact &amp; Exposure</h3>
              <p className="text-[#374151] dark:text-[#dae2fd]/65 leading-relaxed">
                Switch to the <strong>Settlements</strong> tab to explore intersecting affected wards, displaced population estimates, critical infrastructure exposure, and priority severity rankings.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 p-3.5 rounded-xl bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#4cd7f6]/5 dark:border-[#4cd7f6]/15">
            <div className="w-7 h-7 rounded-lg bg-[#166534] text-white font-bold text-xs flex items-center justify-center shrink-0 dark:bg-[#4cd7f6] dark:text-[#0f1923]">
              4
            </div>
            <div className="text-xs">
              <h3 className="font-semibold text-[#263238] dark:text-white mb-0.5">Step 4: Export Reports &amp; Downstream Telemetry</h3>
              <p className="text-[#374151] dark:text-[#dae2fd]/65 leading-relaxed">
                Visit the <strong>Reports</strong> page to generate printable situation dossiers, download tabular impact summaries in CSV or GeoJSON formats, and retrieve processed GeoTIFF raster layers for GIS workflows.
              </p>
            </div>
          </div>
        </div>

        {/* Satellite Credential Notice */}
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-[#ffb95f]/25 dark:bg-[#ffb95f]/5 text-xs">
          <p className="font-semibold text-amber-900 dark:text-[#ffb95f]/90 mb-1 flex items-center gap-1.5">
            <Info className="w-4 h-4 shrink-0 text-amber-700 dark:text-[#ffb95f]" />
            Hackathon Verification &amp; Satellite Data Note
          </p>
          <p className="text-amber-800 dark:text-[#dae2fd]/60 leading-relaxed">
            Live satellite queries require authenticated Google Earth Engine service account tokens. When unauthenticated or during local evaluation, FloodLens seamlessly falls back to pre-computed validation layers and synthetic test scenarios so you can evaluate the complete end-to-end analytical workflow safely.
          </p>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-xl transition-colors shadow dark:bg-[#4cd7f6] dark:hover:bg-[#38bfe0] dark:text-[#0f1923]"
            aria-label="Acknowledge and dismiss guide"
          >
            Got it, let's explore
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Configure() {
  const [form, setForm]       = useState(DEFAULT_FORM)
  const [errors, setErrors]   = useState({})
  const [touched, setTouched] = useState({})
  const [showGuide, setShowGuide] = useState(false)

  // Hook drives all pipeline state — replaces the previous local setTimeout simulation
  const { status, results, error, run, retune, reset } = useFloodAnalysis()

  const districts = DISTRICTS_BY_REGION[form.region] || []

  const setField = useCallback((key, value) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }, [])

  const touch = useCallback((key) => {
    setTouched(t => ({ ...t, [key]: true }))
  }, [])

  const fieldError = (key) => touched[key] ? errors[key] : undefined

  // Validate and submit — calls useFloodAnalysis.run() with real API
  const handleRun = () => {
    const allTouched = Object.fromEntries(Object.keys(DEFAULT_FORM).map(k => [k, true]))
    setTouched(allTouched)

    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    // Field mapping is handled inside submitAnalysis() in floodAnalysis.js
    run({
      mode:            form.mode || 'demo',
      region:          form.region,
      district:        form.district || null,
      preFloodStart:   form.preFloodStart,
      preFloodEnd:     form.preFloodEnd,
      postFloodStart:  form.postFloodStart,
      postFloodEnd:    form.postFloodEnd,
      satelliteSource: form.satellite,
      indices:         form.indices,
      threshold:       form.threshold,
    })
  }

  const handleReset = () => {
    setForm(DEFAULT_FORM)
    setErrors({})
    setTouched({})
    reset()   // stops any in-flight polling and returns status to 'idle'
  }

  const handleSwitchToDemo = useCallback(() => {
    setField('mode', 'demo')
    reset()
  }, [setField, reset])

  // Build the full params object from current form state (shared by run + retune)
  const buildParams = () => ({
    mode:              form.mode || 'demo',
    region:            form.region,
    district:          form.district || null,
    preFloodStart:     form.preFloodStart,
    preFloodEnd:       form.preFloodEnd,
    postFloodStart:    form.postFloodStart,
    postFloodEnd:      form.postFloodEnd,
    satelliteSource:   form.satellite,
    indices:           form.indices,
    threshold:         form.threshold,
    // Refinement — PENDING: confirm field names with backend team
    useHand:           form.useHand,
    slopeThreshold:    form.slopeThreshold,
    speckleFilter:     form.speckleFilter,
    accuracyThreshold: form.accuracyThreshold,
  })

  // Retune — re-submits with current refinement settings; shows feedback-loop animation
  const handleRetune = () => {
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    retune(buildParams())
  }

  const isRunning = RUNNING_STAGES.includes(status)

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#26332C] dark:text-white font-display">Flood Analysis</h1>
          <p className="text-[#647067] dark:text-[#dae2fd]/45 text-sm mt-1">
            Configure region, date ranges, and satellite source — then run the flood detection pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#166534] bg-white hover:bg-[#F1F5F1] border border-[#166534] rounded-xl transition-all shadow-sm"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Go to Dashboard</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#166534] bg-[#E5F2E8] hover:bg-[#E5F2E8]/80 border border-[#DCE5DD] dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/10 dark:border-[#4cd7f6]/30 rounded-xl transition-all shadow-sm"
            aria-label="Open Judge Onboarding Guide"
          >
            <BookOpen className="w-4 h-4 text-[#166534] dark:text-[#4cd7f6]" />
            <span>How to Use Guide</span>
          </button>
        </div>
      </div>

      {/* ── Judge Onboarding Modal ────────────────────────────────────── */}
      <JudgeOnboardingModal isOpen={showGuide} onClose={() => setShowGuide(false)} />

      {/* ── Execution Mode & GEE Selector ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#D1D5DB] bg-white shadow-sm dark:border-[#4cd7f6]/20 dark:bg-[#131b2e]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 border border-[#D1D5DB] dark:border-transparent">
            <Satellite className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
          </div>
          <div>
            <span className="text-xs font-semibold text-[#263238] dark:text-white">Execution Engine:</span>{' '}
            <span className="text-xs text-[#6B7280] dark:text-[#dae2fd]/70">
              {form.mode === 'live' ? 'Google Earth Engine (Live Sentinel-2 SR)' : 'Demo Simulation (Simulated Bihar Basin)'}
            </span>
          </div>
        </div>
        <div className="inline-flex rounded-lg p-0.5 bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-[#0b132b] dark:border-[#4cd7f6]/15 text-xs font-medium">
          <button
            type="button"
            onClick={() => setField('mode', 'demo')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              form.mode === 'demo'
                ? 'bg-amber-700 text-white font-semibold shadow-sm dark:bg-[#ffb95f]/20 dark:text-[#ffb95f] dark:border dark:border-[#ffb95f]/30'
                : 'text-[#6B7280] hover:text-[#263238] dark:text-[#dae2fd]/50 dark:hover:text-white'
            }`}
          >
            Demo Mode
          </button>
          <button
            type="button"
            onClick={() => setField('mode', 'live')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              form.mode === 'live'
                ? 'bg-[#166534] text-white font-semibold shadow-sm dark:bg-[#4cd7f6]/20 dark:text-[#4cd7f6] dark:border dark:border-[#4cd7f6]/30'
                : 'text-[#6B7280] hover:text-[#263238] dark:text-[#dae2fd]/50 dark:hover:text-white'
            }`}
          >
            Live GEE Satellite
          </button>
        </div>
      </div>

      {/* ── Two-column desktop layout ────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-5 items-start">

        {/* ── LEFT COLUMN — input panel ────────────────────────────── */}
        <div className="space-y-4">

          {/* 1. Region selector */}
          <SectionCard icon={MapPin} title="Region">
            <div>
              <Label htmlFor="region" required>Region</Label>
              <div className="relative">
                <select
                  id="region"
                  value={form.region}
                  onChange={e => { setField('region', e.target.value); setField('district', '') }}
                  onBlur={() => touch('region')}
                  className={inputCls(!!fieldError('region')) + ' appearance-none pr-8'}
                >
                  {REGIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280] dark:text-[#dae2fd]/35" />
              </div>
              <FieldError msg={fieldError('region')} />
            </div>

            {/* 2. District selector — only shown when districts exist */}
            {districts.length > 0 && (
              <div>
                <Label htmlFor="district">District <span className="text-[#6B7280] dark:text-[#dae2fd]/30 font-normal">(optional)</span></Label>
                <div className="relative">
                  <select
                    id="district"
                    value={form.district}
                    onChange={e => setField('district', e.target.value)}
                    className={inputCls(false) + ' appearance-none pr-8'}
                  >
                    <option value="">All districts</option>
                    {districts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280] dark:text-[#dae2fd]/35" />
                </div>
              </div>
            )}

            {form.region === 'nepal-terai' && (
              <p className="flex items-center gap-1.5 text-xs text-[#6B7280] dark:text-[#dae2fd]/35">
                <Info className="w-3 h-3 shrink-0" />
                District filtering is available when a province is selected.
              </p>
            )}
          </SectionCard>

          {/* 3 & 4. Date ranges */}
          <SectionCard icon={Calendar} title="Date Ranges">
            {/* Pre-flood */}
            <div>
              <p className="text-xs font-semibold text-[#26332C] dark:text-[#dae2fd]/55 uppercase tracking-wider mb-2.5">
                Pre-flood Period <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="preStart" required={false}>Start</Label>
                  <input
                    id="preStart"
                    type="date"
                    value={form.preFloodStart}
                    onChange={e => setField('preFloodStart', e.target.value)}
                    onBlur={() => touch('preFloodStart')}
                    className={inputCls(!!fieldError('preFloodStart'))}
                  />
                  <FieldError msg={fieldError('preFloodStart')} />
                </div>
                <div>
                  <Label htmlFor="preEnd" required={false}>End</Label>
                  <input
                    id="preEnd"
                    type="date"
                    value={form.preFloodEnd}
                    onChange={e => setField('preFloodEnd', e.target.value)}
                    onBlur={() => touch('preFloodEnd')}
                    className={inputCls(!!fieldError('preFloodEnd'))}
                  />
                  <FieldError msg={fieldError('preFloodEnd')} />
                </div>
              </div>
            </div>

            <div className="border-t border-[#D1D5DB] dark:border-[#4cd7f6]/8 pt-4">
              <p className="text-xs font-semibold text-[#26332C] dark:text-[#dae2fd]/55 uppercase tracking-wider mb-2.5">
                Post-flood Period <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="postStart" required={false}>Start</Label>
                  <input
                    id="postStart"
                    type="date"
                    value={form.postFloodStart}
                    onChange={e => setField('postFloodStart', e.target.value)}
                    onBlur={() => touch('postFloodStart')}
                    className={inputCls(!!fieldError('postFloodStart'))}
                  />
                  <FieldError msg={fieldError('postFloodStart')} />
                </div>
                <div>
                  <Label htmlFor="postEnd" required={false}>End</Label>
                  <input
                    id="postEnd"
                    type="date"
                    value={form.postFloodEnd}
                    onChange={e => setField('postFloodEnd', e.target.value)}
                    onBlur={() => touch('postFloodEnd')}
                    className={inputCls(!!fieldError('postFloodEnd'))}
                  />
                  <FieldError msg={fieldError('postFloodEnd')} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 5. Satellite source */}
          <SectionCard icon={Satellite} title="Satellite Source">
            <div className="space-y-2">
              {SATELLITES.map(sat => (
                <label
                  key={sat.value}
                  className={[
                    'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
                    form.satellite === sat.value
                      ? 'border-[#166534] bg-[#E8F5E9] dark:border-[#4cd7f6]/40 dark:bg-[#4cd7f6]/8'
                      : 'border-[#D1D5DB] bg-white text-[#263238] hover:bg-[#F5F7F6] dark:border-[#4cd7f6]/10 dark:bg-transparent dark:text-[#dae2fd]/70 dark:hover:border-[#4cd7f6]/22 dark:hover:bg-[#4cd7f6]/4',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="satellite"
                    value={sat.value}
                    checked={form.satellite === sat.value}
                    onChange={() => setField('satellite', sat.value)}
                    className="mt-0.5 accent-[#166534] dark:accent-[#4cd7f6] shrink-0"
                  />
                  <div>
                    <p className={`text-sm font-semibold ${form.satellite === sat.value ? 'text-[#166534] dark:text-[#4cd7f6]' : 'text-[#263238] dark:text-[#dae2fd]/80'}`}>
                      {sat.label}
                    </p>
                    <p className="text-xs text-[#6B7280] dark:text-[#dae2fd]/40 mt-0.5 leading-relaxed">{sat.detail}</p>
                  </div>
                </label>
              ))}
            </div>
          </SectionCard>

          {/* 5. Detection Settings — indices + threshold */}
          <DetectionSettingsCard
            form={form}
            setField={setField}
            fieldError={fieldError}
          />

          {/* 6. Refinement Controls — HAND, slope, speckle, accuracy */}
          <RefinementSettingsCard form={form} setField={setField} />

          {/* 7 & 8. Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={[
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-150 shadow-md',
                isRunning
                  ? 'bg-[#166534]/40 text-white/70 cursor-not-allowed'
                  : 'bg-[#166534] hover:bg-[#14532D] text-white active:bg-[#14532D]',
              ].join(' ')}
            >
              {isRunning ? (
                <>
                  {/* Compact Spinner — button loading state */}
                  <Spinner size="sm" label="Analysis running" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Run Detection
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-[#166534] text-[#166534] hover:bg-[#E8F5E9] shadow-sm dark:border-[#4cd7f6]/18 dark:text-[#dae2fd]/60 dark:hover:text-[#dae2fd] dark:hover:border-[#4cd7f6]/35 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reset
            </button>
          </div>

          {/* Retune Detection — only shown after a completed or failed run */}
          {(status === 'completed' || status === 'failed') && (
            <button
              onClick={handleRetune}
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-[#ffb95f]/30 text-[#ffb95f]/80 hover:border-[#ffb95f]/55 hover:text-[#ffb95f] hover:bg-[#ffb95f]/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === 'retuning' ? (
                <>
                  <Spinner size="sm" label="Retuning…" />
                  Retuning…
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Retune Detection
                </>
              )}
            </button>
          )}

          {/* Validation summary */}
          {Object.keys(errors).length > 0 && Object.keys(touched).length > 0 && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/8 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-400 mb-1">Please fix the following:</p>
                <ul className="space-y-0.5">
                  {Object.values(errors).filter(Boolean).map((msg, i) => (
                    <li key={i} className="text-xs text-red-400/80">{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Status + Results — mobile/tablet (below form, single column) */}
          <div className="xl:hidden space-y-4">
            <AnalysisProgress status={status} dataSource={results?.data_source} errorMessage={error} onRetry={handleReset} onSwitchToDemo={form.mode === 'live' ? handleSwitchToDemo : null} />
            <ResultsPanel status={status} results={results} />
          </div>
        </div>

        {/* ── RIGHT COLUMN — map + status + results ────────────────── */}
        <div className="space-y-4">

          {/* Map area */}
          <div className="bg-white border border-[#D1D5DB] shadow-sm rounded-2xl overflow-hidden dark:bg-[#131b2e] dark:border-[#4cd7f6]/10">
            {/* Map header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D1D5DB] dark:border-[#4cd7f6]/8">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] border border-[#D1D5DB] dark:border-transparent dark:bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5 text-[#166534] dark:text-[#4cd7f6]" />
                </div>
                <div>
                  <p className="text-[#263238] dark:text-white font-semibold text-sm font-display">Analysis Area</p>
                  <p className="text-[#6B7280] dark:text-[#dae2fd]/35 text-xs">
                    {REGIONS.find(r => r.value === form.region)?.label ?? 'Nepal Terai'}
                    {form.district ? ` · ${form.district}` : ''}
                    {' · '}
                    {SATELLITES.find(s => s.value === form.satellite)?.label ?? 'Sentinel-1 SAR'}
                  </p>
                </div>
              </div>
              {results?.data_source === 'gee_live' ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#4cd7f6]/10 border border-[#4cd7f6]/20 text-[#4cd7f6] text-[10px] font-medium">
                  <Info className="w-3 h-3" />
                  Live Copernicus S2 Flood Mask
                </span>
              ) : results?.data_source === 'synthetic_demo' ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffb95f]/10 border border-[#ffb95f]/20 text-[#ffb95f] text-[10px] font-medium">
                  <Info className="w-3 h-3" />
                  Simulated Demo Flood Mask
                </span>
              ) : results?.geojson || results?.type === 'FeatureCollection' ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-medium">
                  <Info className="w-3 h-3" />
                  Detection flood mask
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F5F7F6] border border-[#D1D5DB] text-[#6B7280] dark:bg-[#dae2fd]/10 dark:border-[#dae2fd]/20 dark:text-[#dae2fd]/60 text-[10px] font-semibold">
                  <Info className="w-3 h-3" />
                  Reference map — ready to run
                </span>
              )}
            </div>

            {/* Map + legend */}
            <div className="relative">
              <FloodMapViewer
                height="460px"
                showControls={true}
                showGapFill={form.speckleFilter}
                floodGeoJSON={results?.geojson ?? (results?.type === 'FeatureCollection' ? results : null)}
                gapFillGeoJSON={results?.gap_fill_geojson ?? results?.gapFillGeoJSON ?? null}
              />
              <MapLegend />
            </div>

            {/* Map footer */}
            <div className="px-4 py-2.5 border-t border-[#D1D5DB] dark:border-[#4cd7f6]/8 flex flex-wrap gap-x-5 gap-y-1">
              {[
                { label: 'Base Map', value: 'OpenStreetMap' },
                { label: 'CRS',      value: 'EPSG:4326'     },
                { label: 'Overlay',  value: 'Reference only — no live SAR processing shown' },
              ].map(({ label, value }) => (
                <span key={label} className="text-[10px] text-[#6B7280] dark:text-[#dae2fd]/30">
                  <span className="text-[#263238] dark:text-[#dae2fd]/50 font-semibold">{label}:</span> {value}
                </span>
              ))}
            </div>
          </div>

          {/* Status + Results — desktop (right column, side by side) */}
          <ImageryPanel results={results} />
          <MaskComparisonPanel results={results} />
          <div className="hidden xl:grid grid-cols-2 gap-4">
            {/* AnalysisProgress — errorMessage from useFloodAnalysis hook */}
            <AnalysisProgress status={status} dataSource={results?.data_source} errorMessage={error} onRetry={handleReset} onSwitchToDemo={form.mode === 'live' ? handleSwitchToDemo : null} />
            <ResultsPanel status={status} results={results} />
          </div>
        </div>
      </div>
    </div>
  )
}
