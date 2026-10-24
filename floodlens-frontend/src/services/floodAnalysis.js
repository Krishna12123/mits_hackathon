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
 * @param {string} params.satelliteSource - e.g. "sentinel-1-sar" (mapped to backend enum)
 * @param {string[]} params.indices       - e.g. ["ndwi"] or ["ndwi","mndwi"] (mapped to single uppercase string)
 * @param {string} params.preFloodEnd     - ISO date string → sent as pre_date
 * @param {string} params.postFloodEnd    - ISO date string → sent as post_date
 *
 * @returns {Promise<{ jobId: string }>}
 */
export async function submitAnalysis(params) {
  // Map frontend satellite values to backend enum: "Sentinel-1", "Sentinel-2", "Landsat"
  const SATELLITE_MAP = {
    'sentinel-2':     'Sentinel-2',
    'sentinel-1-sar': 'Sentinel-1',
    'landsat':        'Landsat',
  }

  // Map indices array to single uppercase string; multiple selections → "ALL"
  const indicesArray = params.indices ?? []
  const index =
    indicesArray.length > 1
      ? 'ALL'
      : indicesArray.length === 1
        ? indicesArray[0].toUpperCase()  // e.g. "ndwi" → "NDWI"
        : 'NDWI'                         // safe fallback

  const payload = {
    mode:           params.mode ?? 'demo',
    satellite:      SATELLITE_MAP[params.satelliteSource] ?? 'Sentinel-1',
    index,
    pre_date:       params.preFloodEnd || params.preFloodStart,
    post_date:      params.postFloodEnd || params.postFloodStart,
    pre_start:      params.preFloodStart,
    pre_end:        params.preFloodEnd,
    post_start:     params.postFloodStart,
    post_end:       params.postFloodEnd,
    threshold:      params.threshold ?? 0.3,
    aoi_lat:        26.3,
    aoi_lon:        85.8,
    aoi_radius_km:  150,
  }
  return floodAPI.detect(payload)
}

/**
 * Poll the status of a running analysis job.
 *
 * @param {string} jobId - Job identifier returned by submitAnalysis
 * @returns {Promise<{
 *   job_id: string,
 *   status: 'running' | 'completed' | 'failed',
 *   error_message?: string
 * }>}
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
