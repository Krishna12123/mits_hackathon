import axios from 'axios'

const api = axios.create({
  // PENDING: confirm base URL path with backend team.
// Falls back to '/api' so the existing dev-proxy setup keeps working.
baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach JWT if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fl_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor — handle errors globally
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.detail || err.message || 'Unknown error'
    console.error('[FloodLens API]', msg)
    return Promise.reject(new Error(msg))
  }
)

// ── Flood Detection ──────────────────────────────────────────
export const floodAPI = {
  /** Trigger flood detection job */
  detect: (params) => api.post('/flood/detect', params),

  /** Poll job status */
  status: (jobId) => api.get(`/flood/status/${jobId}`),

  /** Get flood GeoJSON result */
  results: (jobId) => api.get(`/flood/results/${jobId}`),

  /** Get current flood summary */
  summary: () => api.get('/flood/summary'),
}

// ── Accuracy Gate ─────────────────────────────────────────────
export const accuracyAPI = {
  /**
   * Evaluate accuracy and optionally retune.
   * POST /accuracy/evaluate
   * Body: { job_id, target_iou, aoi_lat, aoi_lon, aoi_radius_km, max_iterations }
   * Response: AccuracyResponse { job_id, passed_gate, current_iou, current_f1, iterations_count, history[] }
   */
  evaluate: (params) => api.post('/accuracy/evaluate', params),
}

// ── Settlements ──────────────────────────────────────────────
export const settlementAPI = {
  /** Get all affected settlements */
  list: (params) => api.get('/settlements/affected', { params }),

  /** Get single settlement detail */
  get: (id) => api.get(`/settlements/${id}`),
}

// ── Reports ──────────────────────────────────────────────────
export const reportAPI = {
  /** List all reports */
  list: () => api.get('/reports'),

  /** Download report by ID */
  download: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
}

// ── Live Telemetry / Dashboard ──────────────────────────────
export const liveAPI = {
  /** Get live telemetry, stat cards, timeline, and job feed */
  get: () => api.get('/live'),
}

// ── Config / AOI ─────────────────────────────────────────────
export const configAPI = {
  /** Save AOI */
  setAOI: (aoi) => api.post('/config/aoi', aoi),

  /** Get saved config */
  get: () => api.get('/config'),
}

export default api
