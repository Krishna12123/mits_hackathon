/**
 * AnalysisProgress
 * ----------------
 * Reusable progress / status panel for the FloodLens satellite analysis pipeline.
 *
 * Props
 *   status               — current pipeline status key (see STATUS_KEYS below)
 *   errorMessage         — optional custom message shown in the failed state
 *   onRetry              — callback fired by the Retry button (failed state)
 *   supportsCancellation — render a Cancel button while the job is running
 *   onCancel             — callback fired by the Cancel button
 *   className            — extra Tailwind classes for the outer card
 *
 * Status keys
 *   'idle'        — not yet started
 *   'fetching'    — fetching satellite imagery from GEE / Copernicus
 *   'processing'  — processing pre- and post-flood imagery
 *   'detecting'   — running inundation detection (NDWI / SAR change)
 *   'calculating' — intersecting flood extent with settlement data
 *   'completed'   — pipeline finished successfully
 *   'failed'      — pipeline encountered an error
 *
 * Accessibility
 *   aria-live="polite" region announces status changes to screen readers.
 *   Spinner respects prefers-reduced-motion.
 *   Retry and Cancel buttons have descriptive aria-labels.
 *
 * Usage examples
 *   // Analysis panel (full card)
 *   <AnalysisProgress status={status} onRetry={handleReset} />
 *
 *   // With cancellation support
 *   <AnalysisProgress
 *     status={status}
 *     supportsCancellation={true}
 *     onCancel={handleCancel}
 *     onRetry={handleRetry}
 *   />
 */

import Spinner from './Spinner'
import {
  Clock, Database, Cpu, Satellite,
  BarChart3, CheckCircle2, XCircle,
  RotateCcw, X, AlertTriangle, Info,
} from 'lucide-react'

// ─── Pipeline stage definitions ───────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    key:         'fetching',
    label:       'Fetching Satellite Imagery',
    description: 'Retrieving Sentinel-1/2 scenes from Google Earth Engine for the selected region and date range.',
    Icon:        Database,
  },
  {
    key:         'processing',
    label:       'Processing Pre/Post-Flood Imagery',
    description: 'Applying cloud masking, radiometric correction, and band computation to both image stacks.',
    Icon:        Cpu,
  },
  {
    key:         'detecting',
    label:       'Detecting Potential Inundation',
    description: 'Running NDWI / SAR backscatter change detection to delineate flooded pixels.',
    Icon:        Satellite,
  },
  {
    key:         'calculating',
    label:       'Calculating Settlement Impact',
    description: 'Intersecting flood extent polygons with OpenStreetMap settlement and infrastructure layers.',
    Icon:        BarChart3,
  },
]

// Status-level metadata (badge colour, icon, copy)
const STATUS_META = {
  idle: {
    label: 'Idle',
    Icon:  Clock,
    color: 'text-[#dae2fd]/40',
    bg:    'bg-[#dae2fd]/5',
    ring:  'border-[#dae2fd]/10',
  },
  fetching: {
    label:   'Fetching Satellite Data',
    Icon:    Database,
    color:   'text-[#4cd7f6]',
    bg:      'bg-[#4cd7f6]/10',
    ring:    'border-[#4cd7f6]/25',
    running: true,
  },
  processing: {
    label:   'Processing Imagery',
    Icon:    Cpu,
    color:   'text-[#4cd7f6]',
    bg:      'bg-[#4cd7f6]/10',
    ring:    'border-[#4cd7f6]/25',
    running: true,
  },
  detecting: {
    label:   'Detecting Inundation',
    Icon:    Satellite,
    color:   'text-[#4cd7f6]',
    bg:      'bg-[#4cd7f6]/10',
    ring:    'border-[#4cd7f6]/25',
    running: true,
  },
  calculating: {
    label:   'Calculating Impact',
    Icon:    BarChart3,
    color:   'text-[#ffb95f]',
    bg:      'bg-[#ffb95f]/10',
    ring:    'border-[#ffb95f]/25',
    running: true,
  },
  completed: {
    label: 'Completed',
    Icon:  CheckCircle2,
    color: 'text-green-400',
    bg:    'bg-green-500/10',
    ring:  'border-green-500/25',
  },
  retuning: {
    label:   'Retuning Detection',
    Icon:    RotateCcw,
    color:   'text-[#ffb95f]',
    bg:      'bg-[#ffb95f]/10',
    ring:    'border-[#ffb95f]/25',
    running: true,
  },
  failed: {
    label: 'Analysis Failed',
    Icon:  XCircle,
    color: 'text-red-400',
    bg:    'bg-red-500/10',
    ring:  'border-red-500/25',
  },
}

const RUNNING_KEYS = ['fetching', 'processing', 'detecting', 'calculating', 'retuning']

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Step indicator bubble (done / active / pending)
function StepBubble({ done, active, index }) {
  if (done) {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-500/15 text-green-400 border border-green-500/30 text-[10px] font-bold">
        ✓
      </span>
    )
  }
  if (active) {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[#4cd7f6]/12 border border-[#4cd7f6]/40">
        <Spinner size="xs" label="Running" />
      </span>
    )
  }
  return (
    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[#dae2fd]/4 text-[#dae2fd]/20 border border-[#dae2fd]/10 text-[10px] font-bold">
      {index + 1}
    </span>
  )
}

// Thin connector line between steps
function StepConnector({ done }) {
  return (
    <div className="ml-[9px] w-px h-3 shrink-0"
         style={{ background: done ? 'rgba(74,222,128,0.3)' : 'rgba(218,226,253,0.08)' }} />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalysisProgress({
  status               = 'idle',
  errorMessage         = null,
  onRetry              = null,
  supportsCancellation = false,
  onCancel             = null,
  className            = '',
}) {
  const meta       = STATUS_META[status] ?? STATUS_META.idle
  const isRunning  = RUNNING_KEYS.includes(status)
  const isIdle     = status === 'idle'
  const isComplete = status === 'completed'
  const isFailed   = status === 'failed'

  // Which pipeline step is currently active?
  const activeStageIdx = PIPELINE_STAGES.findIndex(s => s.key === status)

  const defaultError =
    'The analysis pipeline encountered an error. Check your inputs and try again. If the issue persists, the satellite data source may be temporarily unavailable.'

  return (
    <div
      className={[
        'bg-[#131b2e] border border-[#4cd7f6]/10 rounded-2xl p-5',
        className,
      ].join(' ')}
    >
      {/* ── Card header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0">
          <Cpu className="w-3.5 h-3.5 text-[#4cd7f6]" />
        </div>
        <h2 className="text-white font-semibold text-sm font-display">Analysis Status</h2>
      </div>

      {/* ── Status badge — live region for screen readers ─────────── */}
      <div aria-live="polite" aria-atomic="true">
        <div
          className={[
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border mb-4',
            meta.bg, meta.ring,
          ].join(' ')}
        >
          {meta.running ? (
            <Spinner size="xs" label={meta.label} className={meta.color.replace('text-', 'border-t-').replace('/40','') } />
          ) : (
            <meta.Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} aria-hidden="true" />
          )}
          <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
      </div>

      {/* ── Indeterminate progress rail (running states only) ────── */}
      {isRunning && (
        <div
          aria-hidden="true"
          className="relative h-0.5 w-full rounded-full overflow-hidden bg-[#4cd7f6]/10 mb-4 motion-reduce:hidden"
        >
          <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#4cd7f6]/70 to-transparent animate-shimmer" />
        </div>
      )}

      {/* ── Pipeline steps (idle hidden; failed hidden) ──────────── */}
      {!isIdle && !isFailed && (
        <div className="space-y-0">
          {PIPELINE_STAGES.map((stage, i) => {
            const done    = isComplete || i < activeStageIdx
            const active  = !isComplete && i === activeStageIdx
            const pending = !isComplete && !done && !active

            return (
              <div key={stage.key}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <StepBubble done={done} active={active} index={i} />
                    {i < PIPELINE_STAGES.length - 1 && (
                      <StepConnector done={done} />
                    )}
                  </div>

                  <div className="pb-3 min-w-0">
                    <p className={[
                      'text-xs font-medium leading-tight',
                      done    ? 'text-green-400'    :
                      active  ? 'text-[#dae2fd]/90' :
                                'text-[#dae2fd]/28',
                    ].join(' ')}>
                      {stage.label}
                    </p>
                    {active && (
                      <p className="text-[10px] text-[#dae2fd]/40 leading-relaxed mt-0.5">
                        {stage.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Completed note ───────────────────────────────────────── */}
      {isComplete && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/6 border border-green-500/15 mt-1">
          <Info className="w-3.5 h-3.5 text-green-400/70 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-green-400/80 leading-relaxed">
            Pipeline completed. Results are ready — no backend data is shown in this demo state.
          </p>
        </div>
      )}

      {/* ── Failed state ─────────────────────────────────────────── */}
      {isFailed && (
        <div className="space-y-3 mt-1">
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/8 border border-red-500/18">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-red-400/85 leading-relaxed">
              {errorMessage ?? defaultError}
            </p>
          </div>

          {onRetry && (
            <button
              onClick={onRetry}
              aria-label="Retry the flood analysis"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/18 hover:border-red-500/40 active:bg-red-500/25 transition-all duration-150"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry Analysis
            </button>
          )}
        </div>
      )}

      {/* ── Idle hint ────────────────────────────────────────────── */}
      {isIdle && (
        <p className="text-xs text-[#dae2fd]/30 leading-relaxed mt-1">
          Configure region, date ranges, and satellite source — then click{' '}
          <span className="text-[#4cd7f6]/70 font-medium">Run Flood Analysis</span>{' '}
          to begin the pipeline.
        </p>
      )}

      {/* ── Cancel button (running + backend supports it) ────────── */}
      {isRunning && supportsCancellation && onCancel && (
        <div className="mt-4 pt-4 border-t border-[#4cd7f6]/8">
          <button
            onClick={onCancel}
            aria-label="Cancel the running analysis"
            className="flex items-center gap-1.5 text-xs text-[#dae2fd]/40 hover:text-[#dae2fd]/70 transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Cancel analysis
          </button>
        </div>
      )}
    </div>
  )
}
