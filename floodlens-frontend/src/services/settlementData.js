/**
 * settlementData.js
 *
 * Shared benchmark data and calculation helpers for settlement impact assessment.
 * Reused by both the interactive Settlement Impact Table/Charts (Settlements.jsx)
 * and the Printable Summary Report (SettlementReport.jsx).
 */

// ─── Reference / Mock Benchmark Dataset ──────────────────────────────────────
// Used for UI demonstration when the live backend is unseeded or offline.
// Includes valid geographic coordinates for GeoJSON feature generation.
export const MOCK_SETTLEMENTS = [
  { id: 1, name: 'Hayaghat',     district: 'Darbhanga',   coordinates: [85.9525, 26.0215], total_area_km2: 45.2, flooded_area_km2: 35.3, flooded_pct: 78, severity: 'severe', population: 42300,  homes: 8200, farms_ha: 1240 },
  { id: 2, name: 'Benipur',      district: 'Darbhanga',   coordinates: [86.1342, 26.0821], total_area_km2: 38.0, flooded_area_km2: 20.9, flooded_pct: 55, severity: 'high',   population: 31500,  homes: 6100, farms_ha: 890  },
  { id: 3, name: 'Sheohar',      district: 'Sitamarhi',   coordinates: [85.2917, 26.5211], total_area_km2: 29.5, flooded_area_km2: 18.6, flooded_pct: 63, severity: 'high',   population: 28900,  homes: 5400, farms_ha: 760  },
  { id: 4, name: 'Runnisaidpur', district: 'Sitamarhi',   coordinates: [85.4831, 26.3842], total_area_km2: 32.1, flooded_area_km2: 13.2, flooded_pct: 41, severity: 'medium', population: 18700,  homes: 3900, farms_ha: 510  },
  { id: 5, name: 'Sitamarhi',    district: 'Sitamarhi',   coordinates: [85.4952, 26.6014], total_area_km2: 64.0, flooded_area_km2: 20.5, flooded_pct: 32, severity: 'medium', population: 94200,  homes: 17300, farms_ha: 2100 },
  { id: 6, name: 'Muzaffarpur', district: 'Muzaffarpur',  coordinates: [85.3912, 26.1209], total_area_km2: 110.5, flooded_area_km2: 12.2, flooded_pct: 11, severity: 'low',    population: 354000, homes: 64000, farms_ha: 3200 },
  { id: 7, name: 'Sakra',        district: 'Muzaffarpur', coordinates: [85.5214, 25.9928], total_area_km2: 26.8, flooded_area_km2: 5.1,  flooded_pct: 19, severity: 'low',    population: 22100,  homes: 4100, farms_ha: 620  },
  { id: 8, name: 'Pusa',         district: 'Darbhanga',   coordinates: [85.6721, 25.9812], total_area_km2: 18.4, flooded_area_km2: 16.2, flooded_pct: 88, severity: 'severe', population: 14800,  homes: 2700, farms_ha: 430  },
  { id: 9, name: 'Kanti',        district: 'Muzaffarpur', coordinates: [85.2911, 26.1925], total_area_km2: 31.4, flooded_area_km2: 0.0,  flooded_pct: 0,  severity: 'safe',   population: 29400,  homes: 5100, farms_ha: 0    },
  { id: 10, name: 'Belsand',     district: 'Sitamarhi',   coordinates: [85.4012, 26.4521], total_area_km2: 24.2, flooded_area_km2: 0.0,  flooded_pct: 0,  severity: 'safe',   population: 19800,  homes: 3600, farms_ha: 0    },
]

// ─── Shared Calculations ──────────────────────────────────────────────────────

export function getTotalArea(s) {
  if (s.total_area_km2 !== undefined && s.total_area_km2 !== null) return s.total_area_km2
  if (s.farms_ha) return Number(((s.farms_ha / 100) * 1.5).toFixed(1))
  return null
}

export function getFloodedArea(s) {
  if (s.flooded_area_km2 !== undefined && s.flooded_area_km2 !== null) return s.flooded_area_km2
  const total = getTotalArea(s)
  if (total !== null && s.flooded_pct !== undefined) {
    return Number(((total * s.flooded_pct) / 100).toFixed(1))
  }
  return null
}
