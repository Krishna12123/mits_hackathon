/**
 * floodAnalysis.js
 *
 * Analysis-specific service layer for FloodLens.
 * Wraps the existing floodAPI from api.js with typed helpers and clear
 * "PENDING" markers for every endpoint path and schema that must be confirmed
 * with the backend team before going live.
 *
 * IMPORTANT: Do NOT treat any endpoint path, request body field, or response
 * field below as final. Every value marked "PENDING" must be verified against
 * the actual backend specification.
 */

import { floodAPI } from './api'

// ─────────────────────────────────────────────────────────────────────────────
// Request helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a flood analysis job.
 *
 * @param {Object} params
 * @param {string} params.region          - Selected region (e.g. "Nepal Terai")
 * @param {string} [params.district]      - Optional district within the region
 * @param {string} params.preFloodStart   - ISO date string — PENDING: confirm field name
 * @param {string} params.preFloodEnd     - ISO date string — PENDING: confirm field name
 * @param {string} params.postFloodStart  - ISO date string — PENDING: confirm field name
 * @param {string} params.postFloodEnd    - ISO date string — PENDING: confirm field name
 * @param {string} params.satelliteSource - e.g. "sentinel-2" — PENDING: confirm enum values
 *
 * @returns {Promise<{ jobId: string }>}
 *   PENDING: confirm actual response shape from backend team.
 */
export async function submitAnalysis(params) {
  // PENDING: confirm endpoint path and request body schema with backend team
  const payload = {
    region: params.region,
    district: params.district ?? null,
    pre_flood_start: params.preFloodStart,    // PENDING: confirm field name
    pre_flood_end: params.preFloodEnd,          // PENDING: confirm field name
    post_flood_start: params.postFloodStart,   // PENDING: confirm field name
    post_flood_end: params.postFloodEnd,        // PENDING: confirm field name
    satellite_source: params.satelliteSource,  // PENDING: confirm enum values
    indices: params.indices ?? [],             // PENDING: confirm field name and accepted values
    threshold: params.threshold ?? 0.3,        // PENDING: confirm field name and valid range
    // ── Refinement parameters (Day 3) — PENDING: confirm all field names with backend team ──
    use_hand: params.useHand ?? false,          // PENDING: confirm field name
    slope_threshold: params.slopeThreshold ?? 10, // PENDING: confirm field name and unit (degrees)
    speckle_filter: params.speckleFilter ?? false, // PENDING: confirm field name
    accuracy_threshold: params.accuracyThreshold ?? 0.7, // PENDING: confirm field name and range
  }
  // floodAPI.detect → POST /flood/detect — PENDING: confirm with backend team
  return floodAPI.detect(payload)
}

/**
 * Poll the status of a running analysis job.
 *
 * @param {string} jobId - Job identifier returned by submitAnalysis
 * @returns {Promise<{
 *   jobId: string,
 *   status: 'queued' | 'fetching' | 'processing' | 'detecting' | 'calculating' | 'completed' | 'failed',
 *   stage?: string,
 *   error?: string
 * }>}
 * PENDING: confirm status enum values and response shape with backend team.
 */
export async function pollJobStatus(jobId) {
  // floodAPI.status → GET /flood/status/{jobId} — PENDING: confirm with backend team
  return floodAPI.status(jobId)
}

/**
 * Fetch final results for a completed analysis job.
 *
 * @param {string} jobId - Job identifier returned by submitAnalysis
 * @returns {Promise<{
 *   floodedAreaKm2?: number,       // PENDING: confirm field name and unit
 *   affectedSettlements?: number,  // PENDING: confirm field name
 *   percentageImpact?: number,     // PENDING: confirm field name
 *   geojson?: Object               // PENDING: confirm GeoJSON structure
 * }>}
 * PENDING: confirm actual result schema with backend team.
 */
export async function fetchResults(jobId) {
  // floodAPI.results → GET /flood/results/{jobId} — PENDING: confirm with backend team
  return floodAPI.results(jobId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an API error so UI components can show the right message.
 *
 * @param {Error} error
 * @returns {'invalid_request' | 'imagery_unavailable' | 'server_error' | 'network_error'}
 */
export function classifyError(error) {
  const status = error?.status ?? error?.response?.status

  if (status === 400) return 'invalid_request'
  if (status === 503) return 'imagery_unavailable'
  if (status >= 500) return 'server_error'
  if (!status) return 'network_error'
  return 'server_error'
}

/**
 * Return a human-readable message for each error class.
 *
 * @param {'invalid_request' | 'imagery_unavailable' | 'server_error' | 'network_error'} errorClass
 * @returns {string}
 */
export function errorMessage(errorClass) {
  switch (errorClass) {
    case 'invalid_request':
      return 'The selected dates or region are invalid. Please review your inputs and try again.'
    case 'imagery_unavailable':
      return 'Satellite imagery is unavailable for the selected date range or region. Try a different date range or satellite source.'
    case 'server_error':
      return 'The analysis server encountered an error. Please try again in a moment.'
    case 'network_error':
      return 'Unable to reach the FloodLens API. The backend service may not be deployed yet — check that it is running and that VITE_API_BASE_URL is configured correctly.'
    default:
      return 'An unexpected error occurred. Please try again.'
  }
}
