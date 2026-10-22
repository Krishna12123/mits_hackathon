/**
 * ApiResultStates.jsx
 *
 * Reusable components for the four API result states in FloodLens:
 *   <LoadingState />    — spinner + message while awaiting response
 *   <SuccessState />    — renders confirmed API result fields
 *   <EmptyState />      — no flood pixels detected
 *   <ErrorState />      — error message + retry button
 *
 * Result field names are marked PENDING and must be aligned with the
 * actual backend response schema before going live.
 *
 * Design system: dark navy #0b1326, cyan #4cd7f6, slate surfaces, Space
 * Grotesk headings, Inter body (matches existing FloodLens design).
 */

import Spinner from './Spinner'

// ─────────────────────────────────────────────────────────────────────────────
// LoadingState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact inline loading indicator — suitable for embedding inside panels.
 *
 * @param {{ message?: string }} props
 */
export function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-4 text-[#dae2fd]/70">
      <Spinner size="sm" color="cyan" />
      <span className="font-sans text-sm">{message}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SuccessState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders confirmed analysis results from the backend.
 *
 * All field names are PENDING confirmation from the backend team.
 * Displays "—" for any field not yet present in the response.
 *
 * @param {{ results: Object }} props
 */
export function SuccessState({ results }) {
  // PENDING: replace field names with actual backend response keys
  const floodedArea     = results?.flooded_area_km2   ?? results?.floodedAreaKm2   ?? null
  const settlements     = results?.affected_settlements ?? results?.affectedSettlements ?? null
  const pctImpact       = results?.percentage_impact   ?? results?.percentageImpact   ?? null
  const infrastructures = results?.affected_infrastructure ?? results?.affectedInfrastructure ?? null

  const fmt = (v) => (v !== null && v !== undefined ? String(v) : '—')

  return (
    <div className="rounded-lg border border-[#4cd7f6]/20 bg-[#131b2e] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#4cd7f6] animate-pulse" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-[#4cd7f6] uppercase tracking-wider">
          Analysis Results
        </h3>
      </div>

      {/* Metrics grid */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultMetric
          label="Flooded Area"
          value={fmt(floodedArea)}
          unit={floodedArea !== null ? 'km²' : ''}
          // PENDING: confirm field name — flooded_area_km2 or floodedAreaKm2
        />
        <ResultMetric
          label="Affected Settlements"
          value={fmt(settlements)}
          // PENDING: confirm field name — affected_settlements or affectedSettlements
        />
        <ResultMetric
          label="Impact"
          value={fmt(pctImpact)}
          unit={pctImpact !== null ? '%' : ''}
          // PENDING: confirm field name — percentage_impact or percentageImpact
        />
        <ResultMetric
          label="Infrastructure"
          value={fmt(infrastructures)}
          // PENDING: confirm field name — affected_infrastructure
        />
      </dl>

      {/* Dev notice — only shown in development builds */}
      {import.meta.env.DEV && (
        <p className="font-sans text-[10px] text-[#ffb95f]/60 border-t border-[#ffb95f]/10 pt-2">
          DEV: Field names above are placeholders — PENDING backend schema confirmation.
        </p>
      )}
    </div>
  )
}

/**
 * Individual metric tile inside SuccessState.
 */
function ResultMetric({ label, value, unit = '' }) {
  return (
    <div className="rounded-md bg-[#171f33] px-3 py-3">
      <dt className="font-sans text-[10px] text-[#dae2fd]/50 uppercase tracking-wider mb-1">
        {label}
      </dt>
      <dd className="font-display text-xl font-bold text-[#dae2fd]">
        {value}
        {unit && (
          <span className="font-sans text-xs font-normal text-[#dae2fd]/50 ml-1">
            {unit}
          </span>
        )}
      </dd>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No flood pixels detected in the selected region / date range.
 *
 * @param {{ onReset?: () => void }} props
 */
export function EmptyState({ onReset }) {
  return (
    <div className="rounded-lg border border-[#dae2fd]/10 bg-[#131b2e] px-6 py-8 text-center space-y-3">
      {/* Icon */}
      <div
        className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#171f33]"
        aria-hidden="true"
      >
        <svg
          className="h-5 w-5 text-[#dae2fd]/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <p className="font-display text-sm font-semibold text-[#dae2fd]">
        No Flood Extent Detected
      </p>
      <p className="font-sans text-xs text-[#dae2fd]/50 max-w-xs mx-auto">
        No significant flood pixels were found for the selected region and date range.
        Try adjusting the post-flood dates or selecting a different satellite source.
      </p>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#dae2fd]/20 px-4 py-2 font-sans text-xs text-[#dae2fd]/70 hover:border-[#4cd7f6]/40 hover:text-[#4cd7f6] transition-colors"
        >
          Adjust Inputs
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Displays a contextual error message with a retry button.
 * Error messages are sourced from floodAnalysis.js::errorMessage().
 *
 * @param {{
 *   error: string | null,
 *   onRetry?: () => void,
 * }} props
 */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-900/10 px-5 py-5 space-y-3">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span
          className="mt-0.5 flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20"
          aria-hidden="true"
        >
          <svg
            className="h-3 w-3 text-red-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </span>

        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-red-300">
            Analysis Failed
          </p>
          <p className="font-sans text-xs text-red-300/70">
            {error ?? 'An unexpected error occurred. Please try again.'}
          </p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md bg-red-500/20 border border-red-500/30 px-4 py-2 font-sans text-xs font-medium text-red-300 hover:bg-red-500/30 hover:text-red-200 transition-colors"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          Retry Analysis
        </button>
      )}
    </div>
  )
}
