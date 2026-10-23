import { useState, useCallback } from 'react'
import FloodMapViewer from '../components/map/FloodMapViewer'
import AnalysisProgress from '../components/ui/AnalysisProgress'
import Spinner from '../components/ui/Spinner'
import { useFloodAnalysis } from '../hooks/useFloodAnalysis'
import {
  Play, RotateCcw, MapPin, Calendar, Satellite,
  AlertCircle, BarChart3, ChevronDown, Info, Layers,
  Sliders,
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
    <label htmlFor={htmlFor} className="block text-xs font-medium text-[#dae2fd]/60 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function inputCls(hasError) {
  return [
    'w-full bg-[#0b1326] border rounded-lg text-sm text-[#dae2fd] px-3 py-2.5',
    'focus:outline-none focus:ring-1 transition-colors duration-150',
    'placeholder:text-[#dae2fd]/25',
    hasError
      ? 'border-red-500/60 focus:ring-red-500/40'
      : 'border-[#4cd7f6]/15 focus:border-[#4cd7f6]/40 focus:ring-[#4cd7f6]/20',
  ].join(' ')
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-[#4cd7f6]" />
        </div>
        <h2 className="text-white font-semibold text-sm font-display">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// Results panel — local to Configure; populated by real backend responses
function ResultsPanel({ status }) {
  const hasResults = status === 'completed'

  const metrics = [
    { label: 'Flooded Area',         unit: 'km²',         value: hasResults ? '—' : null },
    { label: 'Affected Settlements', unit: 'settlements', value: hasResults ? '—' : null },
    { label: 'Population at Risk',   unit: 'est. people', value: hasResults ? '—' : null },
    { label: 'Flood Coverage',       unit: '% of region', value: hasResults ? '—' : null },
  ]

  return (
    <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
          <BarChart3 className="w-3.5 h-3.5 text-[#4cd7f6]" />
        </div>
        <h2 className="text-white font-semibold text-sm font-display">Analysis Results</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, unit, value }) => (
          <div key={label} className="bg-[#0b1326] border border-[#4cd7f6]/8 rounded-xl p-3">
            <p className="text-[10px] font-medium text-[#dae2fd]/40 uppercase tracking-wide mb-1.5">{label}</p>
            {value !== null ? (
              <>
                <p className="text-xl font-bold text-white font-display">{value}</p>
                <p className="text-[10px] text-[#dae2fd]/30 mt-0.5">{unit}</p>
              </>
            ) : (
              <div className="mt-1">
                <div className="h-6 w-14 bg-[#dae2fd]/5 rounded animate-pulse mb-1 motion-reduce:animate-none motion-reduce:opacity-50" />
                <p className="text-[10px] text-[#dae2fd]/20">{unit} · awaiting run</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {!hasResults && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-[#dae2fd]/3 border border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#dae2fd]/35 leading-relaxed">
            Results will populate here after a successful analysis run. No synthetic values are shown.
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
    <div className="absolute bottom-4 left-4 z-[1000] bg-[#0b1326]/92 backdrop-blur-sm border border-[#4cd7f6]/20 rounded-xl px-3.5 py-3 shadow-xl">
      <p className="text-[10px] font-semibold text-[#dae2fd]/55 uppercase tracking-widest mb-2.5">Legend</p>
      {items.map(({ color, opacity, label }) => (
        <div key={label} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
          <span
            className="w-3 h-3 rounded-sm shrink-0 border"
            style={{ backgroundColor: color, opacity, borderColor: color }}
          />
          <span className="text-xs text-[#dae2fd]/65">{label}</span>
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
    detail: 'Normalized Difference Water Index · optical imagery · (Green − NIR) / (Green + NIR)',
  },
  {
    value:  'mndwi',
    label:  'MNDWI',
    detail: 'Modified NDWI · reduces built-up area interference · (Green − SWIR) / (Green + SWIR)',
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
        <p className="text-xs font-semibold text-[#dae2fd]/55 uppercase tracking-wider mb-1.5">
          Detection Index <span className="text-red-400">*</span>
        </p>
        <p className="text-[10px] text-[#dae2fd]/28 mb-3 leading-relaxed">
          Defaults are illustrative starting points — not scientifically validated for this region.
        </p>
        <div className="space-y-2">
          {INDICES.map((idx) => (
            <label
              key={idx.value}
              className={[
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
                form.indices.includes(idx.value)
                  ? 'border-[#4cd7f6]/40 bg-[#4cd7f6]/8'
                  : 'border-[#4cd7f6]/10 hover:border-[#4cd7f6]/22 hover:bg-[#4cd7f6]/4',
              ].join(' ')}
            >
              <input
                type="checkbox"
                value={idx.value}
                checked={form.indices.includes(idx.value)}
                onChange={() => toggleIndex(idx.value)}
                aria-label={idx.label}
                className="mt-0.5 accent-[#4cd7f6] shrink-0"
              />
              <div>
                <p className={`text-sm font-semibold ${form.indices.includes(idx.value) ? 'text-[#4cd7f6]' : 'text-[#dae2fd]/80'}`}>
                  {idx.label}
                </p>
                <p className="text-xs text-[#dae2fd]/40 mt-0.5 leading-relaxed">{idx.detail}</p>
              </div>
            </label>
          ))}
        </div>
        <FieldError msg={fieldError('indices')} />
      </div>

      {/* Threshold slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="threshold" className="text-xs font-medium text-[#dae2fd]/60">
            Flood Threshold
          </label>
          <span className="font-mono text-xs font-bold text-[#4cd7f6] bg-[#4cd7f6]/8 border border-[#4cd7f6]/20 px-2 py-0.5 rounded">
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
          className="w-full accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#dae2fd]/28">0.00 · more water</span>
          <span className="text-[10px] text-[#dae2fd]/28">1.00 · less water</span>
        </div>
        <p className="text-[10px] text-[#dae2fd]/25 mt-2 flex items-center gap-1 leading-relaxed">
          <Info className="w-3 h-3 shrink-0" />
          {/* PENDING: confirm valid range and field name with backend team */}
          Default (0.30) is an illustrative starting point — adjust based on imagery conditions.
        </p>
      </div>
    </SectionCard>
  )
}

// ─── Pre/post imagery panel ───────────────────────────────────────────────────

function ImageryPanel({ results }) {
  // PENDING: confirm thumbnail URL field names with backend team
  const preUrl  = results?.pre_image_url  ?? results?.preImageUrl  ?? null
  const postUrl = results?.post_image_url ?? results?.postImageUrl ?? null

  return (
    <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
          <Satellite className="w-3.5 h-3.5 text-[#4cd7f6]" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm font-display">Satellite Imagery</h2>
          <p className="text-[#dae2fd]/30 text-xs">Pre-flood · Post-flood</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Pre-Flood',  url: preUrl  },
          { label: 'Post-Flood', url: postUrl },
        ].map(({ label, url }) => (
          <div key={label} className="rounded-xl overflow-hidden border border-[#4cd7f6]/10">
            {url ? (
              <img
                src={url}
                alt={`${label} satellite thumbnail`}
                className="w-full h-28 object-cover"
              />
            ) : (
              <div className="w-full h-28 bg-[#0b1326] flex flex-col items-center justify-center gap-1.5">
                <Satellite className="w-5 h-5 text-[#dae2fd]/12" aria-hidden="true" />
                <p className="text-[9px] text-[#dae2fd]/22 text-center leading-tight px-2">
                  {label}<br />imagery unavailable
                </p>
              </div>
            )}
            <p className="text-[10px] text-center py-1.5 text-[#dae2fd]/40 font-medium border-t border-[#4cd7f6]/8">
              {label}
            </p>
          </div>
        ))}
      </div>

      {!preUrl && !postUrl && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-[#dae2fd]/3 border border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#dae2fd]/35 leading-relaxed">
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
      <p className="text-[10px] text-[#dae2fd]/28 leading-relaxed -mt-1">
        Adjust these parameters to refine the flood mask after initial detection.
        All defaults are illustrative — not scientifically validated.
        {/* PENDING: confirm accepted values with backend team */}
      </p>

      {/* HAND toggle */}
      <label className={[
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
        form.useHand
          ? 'border-[#4cd7f6]/40 bg-[#4cd7f6]/8'
          : 'border-[#4cd7f6]/10 hover:border-[#4cd7f6]/22 hover:bg-[#4cd7f6]/4',
      ].join(' ')}>
        <input
          type="checkbox"
          checked={form.useHand}
          onChange={e => setField('useHand', e.target.checked)}
          aria-label="Enable HAND masking"
          className="mt-0.5 accent-[#4cd7f6] shrink-0"
        />
        <div>
          <p className={`text-sm font-semibold ${form.useHand ? 'text-[#4cd7f6]' : 'text-[#dae2fd]/80'}`}>
            HAND Masking
          </p>
          <p className="text-xs text-[#dae2fd]/40 mt-0.5 leading-relaxed">
            Height Above Nearest Drainage — removes upland false positives from the flood mask.
            {/* PENDING: confirm use_hand field name with backend team */}
          </p>
        </div>
      </label>

      {/* Slope threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="slopeThreshold" className="text-xs font-medium text-[#dae2fd]/60">
            Slope Threshold
          </label>
          <span className="font-mono text-xs font-bold text-[#4cd7f6] bg-[#4cd7f6]/8 border border-[#4cd7f6]/20 px-2 py-0.5 rounded">
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
          className="w-full accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#dae2fd]/28">1° · flat terrain</span>
          <span className="text-[10px] text-[#dae2fd]/28">45° · steep slopes excluded</span>
        </div>
        <p className="text-[10px] text-[#dae2fd]/25 mt-1.5 flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          {/* PENDING: confirm slope_threshold field name and unit with backend team */}
          Pixels above this slope are excluded from the flood mask.
        </p>
      </div>

      {/* Speckle filter toggle */}
      <label className={[
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150',
        form.speckleFilter
          ? 'border-[#4cd7f6]/40 bg-[#4cd7f6]/8'
          : 'border-[#4cd7f6]/10 hover:border-[#4cd7f6]/22 hover:bg-[#4cd7f6]/4',
      ].join(' ')}>
        <input
          type="checkbox"
          checked={form.speckleFilter}
          onChange={e => setField('speckleFilter', e.target.checked)}
          aria-label="Enable SAR speckle filter"
          className="mt-0.5 accent-[#4cd7f6] shrink-0"
        />
        <div>
          <p className={`text-sm font-semibold ${form.speckleFilter ? 'text-[#4cd7f6]' : 'text-[#dae2fd]/80'}`}>
            SAR Speckle Filter
          </p>
          <p className="text-xs text-[#dae2fd]/40 mt-0.5 leading-relaxed">
            Applies a spatial filter to reduce SAR speckle noise before change detection.
            Enables SAR gap-fill layer on the map when active.
            {/* PENDING: confirm speckle_filter field name with backend team */}
          </p>
        </div>
      </label>

      {/* Accuracy threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="accuracyThreshold" className="text-xs font-medium text-[#dae2fd]/60">
            Accuracy Threshold
          </label>
          <span className="font-mono text-xs font-bold text-[#4cd7f6] bg-[#4cd7f6]/8 border border-[#4cd7f6]/20 px-2 py-0.5 rounded">
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
          className="w-full accent-[#4cd7f6]"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#dae2fd]/28">0.00 · include all</span>
          <span className="text-[10px] text-[#dae2fd]/28">1.00 · highest confidence only</span>
        </div>
        <p className="text-[10px] text-[#dae2fd]/35 mt-1.5 flex items-center gap-1">
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
  const unrefinedUrl = results?.unrefined_mask_url ?? results?.unrefinedMaskUrl ?? null
  const refinedUrl   = results?.refined_mask_url   ?? results?.refinedMaskUrl   ?? null

  return (
    <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
          <Layers className="w-3.5 h-3.5 text-[#4cd7f6]" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm font-display">Flood Mask Comparison</h2>
          <p className="text-[#dae2fd]/30 text-xs">Before refinement · After refinement</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Before Refinement', url: unrefinedUrl },
          { label: 'After Refinement',  url: refinedUrl   },
        ].map(({ label, url }) => (
          <div key={label} className="rounded-xl overflow-hidden border border-[#4cd7f6]/10">
            {url ? (
              <img
                src={url}
                alt={`${label} flood mask`}
                className="w-full h-28 object-cover"
              />
            ) : (
              <div className="w-full h-28 bg-[#0b1326] flex flex-col items-center justify-center gap-1.5">
                <Layers className="w-5 h-5 text-[#dae2fd]/12" aria-hidden="true" />
                <p className="text-[9px] text-[#dae2fd]/22 text-center leading-tight px-2">
                  {label}<br />unavailable
                </p>
              </div>
            )}
            <p className="text-[10px] text-center py-1.5 text-[#dae2fd]/40 font-medium border-t border-[#4cd7f6]/8">
              {label}
            </p>
          </div>
        ))}
      </div>

      {!unrefinedUrl && !refinedUrl && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-[#dae2fd]/3 border border-[#dae2fd]/8">
          <Info className="w-3.5 h-3.5 text-[#dae2fd]/30 shrink-0 mt-0.5" />
          <p className="text-xs text-[#dae2fd]/35 leading-relaxed">
            Mask thumbnails will appear here when the backend returns refined flood mask URLs.
            {/* PENDING: confirm unrefined_mask_url / refined_mask_url field names with backend team */}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Configure() {
  const [form, setForm]       = useState(DEFAULT_FORM)
  const [errors, setErrors]   = useState({})
  const [touched, setTouched] = useState({})

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

  // Build the full params object from current form state (shared by run + retune)
  const buildParams = () => ({
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
      <div>
        <h1 className="text-2xl font-bold text-white font-display">Flood Analysis</h1>
        <p className="text-[#dae2fd]/45 text-sm mt-1">
          Configure region, date ranges, and satellite source — then run the flood detection pipeline.
        </p>
      </div>

      {/* ── Backend-pending notice ────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-[#ffb95f]/25 bg-[#ffb95f]/5">
        <Info className="w-4 h-4 text-[#ffb95f]/80 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-[#ffb95f]/90 mb-0.5">
            Live detection unavailable — backend not yet deployed
          </p>
          <p className="text-xs text-[#dae2fd]/45 leading-relaxed">
            The FloodLens API has not been set up yet. You can configure inputs and test validation,
            but no satellite data will be fetched or processed until the backend is available and
            <code className="mx-1 px-1 py-0.5 rounded bg-[#dae2fd]/8 font-mono text-[10px] text-[#dae2fd]/60">VITE_API_BASE_URL</code>
            is configured.
          </p>
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
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#dae2fd]/35" />
              </div>
              <FieldError msg={fieldError('region')} />
            </div>

            {/* 2. District selector — only shown when districts exist */}
            {districts.length > 0 && (
              <div>
                <Label htmlFor="district">District <span className="text-[#dae2fd]/30 font-normal">(optional)</span></Label>
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
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#dae2fd]/35" />
                </div>
              </div>
            )}

            {form.region === 'nepal-terai' && (
              <p className="flex items-center gap-1.5 text-xs text-[#dae2fd]/35">
                <Info className="w-3 h-3 shrink-0" />
                District filtering is available when a province is selected.
              </p>
            )}
          </SectionCard>

          {/* 3 & 4. Date ranges */}
          <SectionCard icon={Calendar} title="Date Ranges">
            {/* Pre-flood */}
            <div>
              <p className="text-xs font-semibold text-[#dae2fd]/55 uppercase tracking-wider mb-2.5">
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

            <div className="border-t border-[#4cd7f6]/8 pt-4">
              <p className="text-xs font-semibold text-[#dae2fd]/55 uppercase tracking-wider mb-2.5">
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
                      ? 'border-[#4cd7f6]/40 bg-[#4cd7f6]/8'
                      : 'border-[#4cd7f6]/10 hover:border-[#4cd7f6]/22 hover:bg-[#4cd7f6]/4',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="satellite"
                    value={sat.value}
                    checked={form.satellite === sat.value}
                    onChange={() => setField('satellite', sat.value)}
                    className="mt-0.5 accent-[#4cd7f6] shrink-0"
                  />
                  <div>
                    <p className={`text-sm font-semibold ${form.satellite === sat.value ? 'text-[#4cd7f6]' : 'text-[#dae2fd]/80'}`}>
                      {sat.label}
                    </p>
                    <p className="text-xs text-[#dae2fd]/40 mt-0.5 leading-relaxed">{sat.detail}</p>
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
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-150',
                isRunning
                  ? 'bg-[#4cd7f6]/40 text-[#0b1326]/60 cursor-not-allowed'
                  : 'bg-[#4cd7f6] text-[#0b1326] hover:bg-[#4cd7f6]/90 active:bg-[#4cd7f6]/80',
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
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border border-[#4cd7f6]/18 text-[#dae2fd]/60 hover:text-[#dae2fd] hover:border-[#4cd7f6]/35 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
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
            <AnalysisProgress status={status} errorMessage={error} onRetry={handleReset} />
            <ResultsPanel status={status} />
          </div>
        </div>

        {/* ── RIGHT COLUMN — map + status + results ────────────────── */}
        <div className="space-y-4">

          {/* Map area */}
          <div className="bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl overflow-hidden">
            {/* Map header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#4cd7f6]/8">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5 text-[#4cd7f6]" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm font-display">Analysis Area</p>
                  <p className="text-[#dae2fd]/35 text-xs">
                    {REGIONS.find(r => r.value === form.region)?.label ?? 'Nepal Terai'}
                    {form.district ? ` · ${form.district}` : ''}
                    {' · '}
                    {SATELLITES.find(s => s.value === form.satellite)?.label ?? 'Sentinel-1 SAR'}
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffb95f]/10 border border-[#ffb95f]/20 text-[#ffb95f] text-[10px] font-medium">
                <Info className="w-3 h-3" />
                Reference map — not live data
              </span>
            </div>

            {/* Map + legend */}
            <div className="relative">
              <FloodMapViewer
                height="460px"
                showControls={true}
                showGapFill={form.speckleFilter}
                gapFillGeoJSON={results?.gap_fill_geojson ?? results?.gapFillGeoJSON ?? null}
              />
              <MapLegend />
            </div>

            {/* Map footer */}
            <div className="px-4 py-2.5 border-t border-[#4cd7f6]/8 flex flex-wrap gap-x-5 gap-y-1">
              {[
                { label: 'Base Map', value: 'OpenStreetMap' },
                { label: 'CRS',      value: 'EPSG:4326'     },
                { label: 'Overlay',  value: 'Reference only — no live SAR processing shown' },
              ].map(({ label, value }) => (
                <span key={label} className="text-[10px] text-[#dae2fd]/30">
                  <span className="text-[#dae2fd]/50 font-medium">{label}:</span> {value}
                </span>
              ))}
            </div>
          </div>

          {/* Status + Results — desktop (right column, side by side) */}
          <ImageryPanel results={results} />
          <MaskComparisonPanel results={results} />
          <div className="hidden xl:grid grid-cols-2 gap-4">
            {/* AnalysisProgress — errorMessage from useFloodAnalysis hook */}
            <AnalysisProgress status={status} errorMessage={error} onRetry={handleReset} />
            <ResultsPanel status={status} />
          </div>
        </div>
      </div>
    </div>
  )
}
