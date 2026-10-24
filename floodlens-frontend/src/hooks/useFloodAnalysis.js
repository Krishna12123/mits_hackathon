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
  resolveErrorMessage,
} from '../services/floodAnalysis'
import { accuracyAPI } from '../services/api'

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
      return 'fetching'
    case 'running':           // backend sets status="running" while job executes
      return 'processing'
    case 'processing':
      return 'processing'
    case 'detecting':
      return 'detecting'
    case 'calculating':
      return 'calculating'
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

  /** Stores the last successful detection job ID — used by retune() */
  const lastJobIdRef = useRef(null)

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
      // job_id is the confirmed field name in DetectResponse (schemas.py)
      jobId = submitResponse?.job_id ?? submitResponse?.jobId ?? submitResponse?.id
      if (!jobId) {
        throw new Error('Backend did not return a job ID.')
      }
      // Persist for retune() to use
      lastJobIdRef.current = jobId
    } catch (err) {
      setError(resolveErrorMessage(err))
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
            try {
              localStorage.setItem('fl_latest_result', JSON.stringify(resultData))
              localStorage.setItem('fl_latest_job_id', jobId)
            } catch (_) {}
          } catch (resultErr) {
            setError(resolveErrorMessage(resultErr))
            setStatus('failed')
          }
        } else if (uiStage === 'failed') {
          stopPolling()
          // error_message is the confirmed field name in JobStatusResponse (schemas.py)
          const backendError = statusResponse?.error_message ?? null
          setError(
            backendError
              ? `Analysis failed: ${backendError}`
              : 'The analysis job failed on the server. Please try again.'
          )
        }
      } catch (pollErr) {
        stopPolling()
        setError(resolveErrorMessage(pollErr))
        setStatus('failed')
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  /**
   * Retune — calls POST /api/accuracy/evaluate with the last detection job ID.
   * The accuracy endpoint is synchronous (no polling needed).
   * Shows the feedback-loop 'retuning' animation while the request is in-flight.
   *
   * @param {Object} params - Form params; accuracyThreshold maps to target_iou
   */
  const retune = useCallback(async (params) => {
    const jobId = lastJobIdRef.current
    if (!jobId) {
      setError('No completed detection job found. Run detection first before retuning.')
      return
    }

    stopPolling()
    setResults(null)
    setError(null)
    setStatus('retuning') // triggers feedback-loop animation in AnalysisProgress

    try {
      // POST /accuracy/evaluate — confirmed endpoint (routers/accuracy.py)
      const response = await accuracyAPI.evaluate({
        job_id:         jobId,
        target_iou:     params.accuracyThreshold ?? 0.7,
        aoi_lat:        26.3,
        aoi_lon:        85.8,
        aoi_radius_km:  150,
        max_iterations: 5,
      })
      // AccuracyResponse: { job_id, passed_gate, current_iou, current_f1, iterations_count, history[] }
      setResults(response)
      setStatus('completed')
    } catch (err) {
      setError(resolveErrorMessage(err))
      setStatus('failed')
    }
  }, [stopPolling])

  return { status, results, error, run, retune, reset }

}