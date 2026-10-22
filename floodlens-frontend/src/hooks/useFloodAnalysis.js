/**
 * useFloodAnalysis.js
 *
 * React hook that orchestrates the full flood analysis lifecycle:
 *   submit → poll status → fetch results
 *
 * Returns state that maps directly to the 6-stage pipeline used by
 * AnalysisProgress.jsx:
 *   idle → fetching → processing → detecting → calculating → completed | failed
 *
 * PENDING: The stage mapping inside `mapBackendStatus` must be aligned with
 * the actual status strings returned by the backend team.
 */

import { useState, useRef, useCallback } from 'react'
import {
  submitAnalysis,
  pollJobStatus,
  fetchResults,
  classifyError,
  errorMessage,
} from '../services/floodAnalysis'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** How often (ms) to poll the backend for job status updates */
const POLL_INTERVAL_MS = 3000

/**
 * Maps backend status strings to the UI pipeline stage IDs used by
 * AnalysisProgress.jsx.
 *
 * PENDING: confirm backend status enum values with backend team and update
 * this map accordingly.
 *
 * @param {string} backendStatus
 * @returns {string} UI pipeline stage id
 */
function mapBackendStatus(backendStatus) {
  switch (backendStatus) {
    case 'queued':
    case 'fetching':
      return 'fetching'       // PENDING: confirm 'fetching' value
    case 'processing':
      return 'processing'     // PENDING: confirm 'processing' value
    case 'detecting':
      return 'detecting'      // PENDING: confirm 'detecting' value
    case 'calculating':
      return 'calculating'    // PENDING: confirm 'calculating' value
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      return 'fetching'       // safe fallback while job starts
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   status: string,
 *   results: Object | null,
 *   error: string | null,
 *   run: (params: Object) => Promise<void>,
 *   reset: () => void,
 * }}
 */
export function useFloodAnalysis() {
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  /** Ref to the active polling interval so it can be cleared on unmount or reset */
  const pollRef = useRef(null)

  /** Ref to guard against state updates after the hook unmounts */
  const mountedRef = useRef(true)

  // Track mounted state
  // (No useEffect here intentionally — caller should call reset() on unmount
  //  or we rely on the AbortController pattern once the backend is confirmed.)

  /** Stop polling and clean up interval */
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /** Reset everything back to idle */
  const reset = useCallback(() => {
    stopPolling()
    setStatus('idle')
    setResults(null)
    setError(null)
  }, [stopPolling])

  /**
   * Run the full analysis pipeline.
   *
   * @param {Object} params - Form parameters from Configure.jsx (region, dates, source, …)
   */
  const run = useCallback(async (params) => {
    stopPolling()
    setResults(null)
    setError(null)
    setStatus('fetching')

    let jobId

    // ── 1. Submit job ───────────────────────────────────────────────────────
    try {
      const submitResponse = await submitAnalysis(params)
      // PENDING: confirm the field name for the job id in the submit response
      jobId = submitResponse?.jobId ?? submitResponse?.job_id ?? submitResponse?.id
      if (!jobId) {
        throw new Error('Backend did not return a job ID. PENDING: confirm response schema.')
      }
    } catch (err) {
      const cls = classifyError(err)
      setError(errorMessage(cls))
      setStatus('failed')
      return
    }

    // ── 2. Poll status ──────────────────────────────────────────────────────
    pollRef.current = setInterval(async () => {
      // Guard: stop if unmounted
      if (!mountedRef.current) {
        stopPolling()
        return
      }

      try {
        const statusResponse = await pollJobStatus(jobId)
        // PENDING: confirm field name for status in poll response
        const backendStatus =
          statusResponse?.status ?? statusResponse?.state ?? 'fetching'

        const uiStage = mapBackendStatus(backendStatus)
        setStatus(uiStage)

        if (uiStage === 'completed') {
          stopPolling()
          // ── 3. Fetch results ──────────────────────────────────────────────
          try {
            const resultData = await fetchResults(jobId)
            setResults(resultData)
          } catch (resultErr) {
            const cls = classifyError(resultErr)
            setError(errorMessage(cls))
            setStatus('failed')
          }
        } else if (uiStage === 'failed') {
          stopPolling()
          // PENDING: confirm error field name in status response
          const backendError =
            statusResponse?.error ?? statusResponse?.message ?? null
          setError(
            backendError
              ? `Analysis failed: ${backendError}`
              : 'The analysis job failed on the server. Please try again.'
          )
        }
      } catch (pollErr) {
        stopPolling()
        const cls = classifyError(pollErr)
        setError(errorMessage(cls))
        setStatus('failed')
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  /**
   * Retune — re-runs the full analysis with updated refinement parameters.
   * Uses the same pipeline as run(); the 'retuning' UI stage is set before
   * submitting so AnalysisProgress can show the feedback-loop animation.
   *
   * PENDING: If the backend exposes a dedicated refinement endpoint, point
   * submitAnalysis (or a new submitRefinement) at it instead of /flood/detect.
   *
   * @param {Object} params - Same shape as run(), includes refinement fields
   */
  const retune = useCallback(async (params) => {
    stopPolling()
    setResults(null)
    setError(null)
    setStatus('retuning') // triggers feedback-loop animation in AnalysisProgress

    let jobId

    try {
      // PENDING: replace with a dedicated refinement endpoint when available
      const submitResponse = await submitAnalysis(params)
      jobId = submitResponse?.jobId ?? submitResponse?.job_id ?? submitResponse?.id
      if (!jobId) throw new Error('Backend did not return a job ID.')
    } catch (err) {
      const cls = classifyError(err)
      setError(errorMessage(cls))
      setStatus('failed')
      return
    }

    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { stopPolling(); return }
      try {
        const statusResponse = await pollJobStatus(jobId)
        const backendStatus = statusResponse?.status ?? statusResponse?.state ?? 'retuning'
        const uiStage = mapBackendStatus(backendStatus)
        setStatus(uiStage === 'fetching' ? 'retuning' : uiStage) // keep retuning label during polling
        if (uiStage === 'completed') {
          stopPolling()
          try { setResults(await fetchResults(jobId)) }
          catch (e) { setError(errorMessage(classifyError(e))); setStatus('failed') }
        } else if (uiStage === 'failed') {
          stopPolling()
          setError(statusResponse?.error ?? 'Retuning failed on the server. Please try again.')
        }
      } catch (pollErr) {
        stopPolling()
        setError(errorMessage(classifyError(pollErr)))
        setStatus('failed')
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  return { status, results, error, run, retune, reset }

}