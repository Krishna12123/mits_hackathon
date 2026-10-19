import { create } from 'zustand'

/**
 * Global app store using Zustand.
 * Holds the active job, AOI config, and alert state.
 */
const useFloodStore = create((set) => ({
  // Active detection job
  activeJob: null,
  setActiveJob: (job) => set({ activeJob: job }),
  clearJob: () => set({ activeJob: null }),

  // AOI configuration
  aoi: {
    lat:    26.3,
    lon:    85.8,
    radius: 150,
  },
  setAOI: (aoi) => set({ aoi }),

  // Date range
  dateRange: {
    start: '2026-10-11',
    end:   '2026-10-19',
  },
  setDateRange: (dateRange) => set({ dateRange }),

  // Active alerts
  alerts: [],
  addAlert:    (alert)  => set((s) => ({ alerts: [alert, ...s.alerts] })),
  removeAlert: (id)     => set((s) => ({ alerts: s.alerts.filter(a => a.id !== id) })),

  // Map layer toggles
  layers: {
    floodExtent:   true,
    settlements:   true,
    osmBase:       true,
    adminBoundary: false,
  },
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
}))

export default useFloodStore
