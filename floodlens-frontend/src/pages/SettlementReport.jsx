import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { settlementAPI } from '../services/api'
import useFloodStore from '../services/store'
import { MOCK_SETTLEMENTS, getTotalArea, getFloodedArea } from '../services/settlementData'
import SeverityBadge from '../components/ui/SeverityBadge'
import Spinner from '../components/ui/Spinner'
import {
  Printer,
  ArrowLeft,
  Calendar,
  Satellite,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Users,
  Home,
  Wheat,
  MapPin,
  Clock,
  Layers,
  FileText,
  Info,
} from 'lucide-react'

export default function SettlementReport() {
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [isDemoData, setIsDemoData]   = useState(false)
  const [generatedAt, setGeneratedAt] = useState('')

  // Read analysis configuration from global store if available
  const dateRange = useFloodStore(state => state.dateRange)
  const activeJob = useFloodStore(state => state.activeJob)
  const aoi       = useFloodStore(state => state.aoi)

  // Fetch settlements
  useEffect(() => {
    setGeneratedAt(
      new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: true,
      })
    )

    let isMounted = true

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const response = await settlementAPI.list()
        const list = response?.settlements ?? (Array.isArray(response) ? response : null)
        if (list && list.length > 0) {
          if (isMounted) {
            setSettlements(list)
            setIsDemoData(false)
          }
        } else {
          // Graceful fallback to shared benchmark dataset
          if (isMounted) {
            setSettlements(MOCK_SETTLEMENTS)
            setIsDemoData(true)
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Unable to fetch settlement impact dataset.')
          setSettlements(MOCK_SETTLEMENTS)
          setIsDemoData(true)
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [])

  // Derived statistics (reusing exact calculations from Settlement Impact Table)
  const metrics = useMemo(() => {
    if (!settlements.length) return null

    let affectedCount = 0
    let safeCount = 0
    let severeCount = 0
    let highCount = 0
    let mediumCount = 0
    let lowCount = 0

    let totalAreaKm2 = 0
    let totalFloodedKm2 = 0
    let atRiskPop = 0
    let affectedHomes = 0
    let affectedFarmsHa = 0

    settlements.forEach(s => {
      const isSafe = (s.severity && s.severity.toLowerCase() === 'safe') || (s.flooded_pct === 0)
      if (isSafe) {
        safeCount++
      } else {
        affectedCount++
      }

      const sev = s.severity ? s.severity.toLowerCase() : (s.flooded_pct > 0 ? 'medium' : 'safe')
      if (sev === 'severe') severeCount++
      else if (sev === 'high') highCount++
      else if (sev === 'medium') mediumCount++
      else if (sev === 'low') lowCount++

      const area = getTotalArea(s) || 0
      const flooded = getFloodedArea(s) || 0
      totalAreaKm2 += area
      totalFloodedKm2 += flooded

      const fPct = (s.flooded_pct || 0) / 100
      atRiskPop += Math.round((s.population || 0) * fPct)
      affectedHomes += Math.round((s.homes || 0) * fPct)
      affectedFarmsHa += Math.round((s.farms_ha || 0) * fPct)
    })

    const totalSettlements = settlements.length
    const affectedPct = totalSettlements > 0 ? Math.round((affectedCount / totalSettlements) * 100) : 0
    const safePct = totalSettlements > 0 ? Math.round((safeCount / totalSettlements) * 100) : 0
    const avgFloodedPct = totalAreaKm2 > 0 ? Math.round((totalFloodedKm2 / totalAreaKm2) * 100) : 0

    return {
      totalSettlements,
      affectedCount,
      affectedPct,
      safeCount,
      safePct,
      severeCount,
      highCount,
      mediumCount,
      lowCount,
      totalAreaKm2: Number(totalAreaKm2.toFixed(1)),
      totalFloodedKm2: Number(totalFloodedKm2.toFixed(1)),
      avgFloodedPct,
      atRiskPop,
      affectedHomes,
      affectedFarmsHa,
    }
  }, [settlements])

  // Native print trigger
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 print:p-0 print:max-w-none print:space-y-4">
      {/* ── Screen-Only Action Bar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#0b1326] border border-[#4cd7f6]/20 no-print shadow-lg">
        <Link
          to="/dashboard/settlements"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#131b2e] border border-[#4cd7f6]/25 text-[#4cd7f6] hover:bg-[#4cd7f6]/10 active:bg-[#4cd7f6]/15 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settlements
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#4cd7f6] text-[#0b1326] hover:bg-[#4cd7f6]/90 active:bg-[#4cd7f6]/80 transition-all shadow-md"
            aria-label="Print or save this settlement summary report"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* ── Printable Report Sheet ───────────────────────────────────────── */}
      <div className="bg-[#0b1326] border border-[#4cd7f6]/20 rounded-2xl p-8 shadow-2xl print:bg-white print:text-black print:border-none print:shadow-none print:p-0 print:rounded-none">

        {/* ── 1. Report Header ────────────────────────────────────────────── */}
        <div className="border-b border-[#4cd7f6]/20 pb-6 print:border-gray-300">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 print:border-gray-400 print:text-gray-800 print:bg-gray-100">
                  FloodLens Executive Assessment
                </span>
                <span className="text-xs text-[#dae2fd]/40 font-mono print:text-gray-500">
                  REF: FL-RPT-{new Date().getFullYear()}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display print:text-gray-900">
                Settlement Flood Impact Summary Report
              </h1>
              <p className="text-[#dae2fd]/70 text-sm mt-1 print:text-gray-600">
                Automated spatial intersection of satellite flood extents with OpenStreetMap settlement footprints.
              </p>
            </div>

            {/* Timestamp & System Stamp */}
            <div className="text-left sm:text-right shrink-0 bg-[#131b2e]/60 p-3 rounded-xl border border-[#4cd7f6]/15 print:bg-gray-50 print:border-gray-200">
              <p className="text-[11px] uppercase tracking-wider text-[#dae2fd]/50 font-semibold print:text-gray-500">
                Generated Date / Time
              </p>
              <p className="text-xs font-mono font-bold text-[#4cd7f6] mt-0.5 print:text-gray-900">
                {generatedAt || '—'}
              </p>
              <p className="text-[10px] text-[#dae2fd]/40 mt-1 print:text-gray-500">
                Target: Nepal Terai Region
              </p>
            </div>
          </div>

          {/* Analysis Metadata Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#4cd7f6]/10 print:border-gray-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 print:border print:border-gray-300">
                <Satellite className="w-4 h-4 text-[#4cd7f6] print:text-gray-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-[#dae2fd]/40 print:text-gray-500">Satellite Source</p>
                <p className="text-xs font-medium text-white print:text-gray-900">
                  {activeJob?.satelliteSource || 'Sentinel-1 SAR / Sentinel-2'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 print:border print:border-gray-300">
                <Calendar className="w-4 h-4 text-[#4cd7f6] print:text-gray-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-[#dae2fd]/40 print:text-gray-500">Analysis Date Range</p>
                <p className="text-xs font-medium text-white print:text-gray-900">
                  {dateRange?.start && dateRange?.end
                    ? `${dateRange.start} → ${dateRange.end}`
                    : '11 Oct 2026 → 19 Oct 2026'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 print:border print:border-gray-300">
                <MapPin className="w-4 h-4 text-[#4cd7f6] print:text-gray-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-[#dae2fd]/40 print:text-gray-500">AOI Coordinates</p>
                <p className="text-xs font-medium text-white print:text-gray-900">
                  {aoi?.lat ?? 26.3}°N, {aoi?.lon ?? 85.8}°E ({aoi?.radius ?? 150} km)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#4cd7f6]/10 flex items-center justify-center shrink-0 print:border print:border-gray-300">
                <Layers className="w-4 h-4 text-[#4cd7f6] print:text-gray-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-[#dae2fd]/40 print:text-gray-500">Water Index / Mask</p>
                <p className="text-xs font-medium text-white print:text-gray-900">
                  NDWI / SAR (JRC Permanent Baseline)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Demo / Reference Dataset Disclaimer ──────────────────────────── */}
        {isDemoData && (
          <div className="my-5 p-3.5 rounded-xl bg-[#ffb95f]/10 border border-[#ffb95f]/30 flex items-start gap-3 print:bg-gray-100 print:border-gray-300">
            <Info className="w-4 h-4 text-[#ffb95f] print:text-gray-700 shrink-0 mt-0.5" />
            <div className="text-xs text-[#dae2fd]/80 print:text-gray-700">
              <span className="font-bold text-[#ffb95f] print:text-gray-900">Demonstration Dataset Notice: </span>
              The live backend did not return completed settlement records. This report utilizes calibrated reference
              demonstration data for UI inspection and development testing. Figures do not represent measured post-disaster statistics.
            </div>
          </div>
        )}

        {/* ── Loading and Error States ────────────────────────────────────── */}
        {loading && (
          <div className="py-16 text-center">
            <Spinner size="lg" className="mx-auto text-[#4cd7f6] mb-3" />
            <p className="text-sm text-[#dae2fd]/70 font-medium">Aggregating settlement impact figures…</p>
          </div>
        )}

        {!loading && settlements.length === 0 && (
          <div className="py-16 text-center border border-dashed border-[#4cd7f6]/20 rounded-xl my-6 print:border-gray-300">
            <AlertTriangle className="w-10 h-10 text-[#ffb95f] mx-auto mb-2" />
            <h3 className="text-base font-bold text-white print:text-gray-900">Data Unavailable</h3>
            <p className="text-xs text-[#dae2fd]/50 mt-1 max-w-md mx-auto print:text-gray-600">
              No settlement impact data could be found or calculated. Please run a flood analysis detection job to populate results.
            </p>
          </div>
        )}

        {/* ── 2. Executive Impact Summary Cards ────────────────────────────── */}
        {!loading && metrics && (
          <div className="space-y-6 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
              <div className="p-4 rounded-xl bg-[#131b2e] border border-[#4cd7f6]/15 print:bg-gray-50 print:border-gray-300">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#dae2fd]/50 print:text-gray-500">
                  Total Settlements
                </p>
                <p className="text-2xl font-bold font-mono text-white mt-1 print:text-gray-900">
                  {metrics.totalSettlements}
                </p>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5 print:text-gray-500">
                  Surveyed area: {metrics.totalAreaKm2} km²
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#131b2e] border border-[#ffb95f]/30 print:bg-gray-50 print:border-gray-300">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#ffb95f] print:text-gray-700">
                  Affected Settlements
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold font-mono text-[#ffb95f] print:text-gray-900">
                    {metrics.affectedCount}
                  </p>
                  <span className="text-xs font-semibold text-[#ffb95f]/80 print:text-gray-600">
                    ({metrics.affectedPct}%)
                  </span>
                </div>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5 print:text-gray-500">
                  Inundated: {metrics.totalFloodedKm2} km² ({metrics.avgFloodedPct}%)
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#131b2e] border border-[#4cd7f6]/25 print:bg-gray-50 print:border-gray-300">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4cd7f6] print:text-gray-700">
                  Safe Settlements
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold font-mono text-[#4cd7f6] print:text-gray-900">
                    {metrics.safeCount}
                  </p>
                  <span className="text-xs font-semibold text-[#4cd7f6]/80 print:text-gray-600">
                    ({metrics.safePct}%)
                  </span>
                </div>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5 print:text-gray-500">
                  Zero flood encroachment
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#131b2e] border border-red-500/30 print:bg-gray-50 print:border-gray-300">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400 print:text-gray-700">
                  At-Risk Population
                </p>
                <p className="text-2xl font-bold font-mono text-red-300 mt-1 print:text-gray-900">
                  {metrics.atRiskPop.toLocaleString()}
                </p>
                <p className="text-[11px] text-[#dae2fd]/40 mt-0.5 print:text-gray-500">
                  Est. {metrics.affectedHomes.toLocaleString()} homes impacted
                </p>
              </div>
            </div>

            {/* ── 3. Affected vs Safe Distribution & Severity Tiers ────────── */}
            <div className="p-5 rounded-xl bg-[#131b2e]/60 border border-[#4cd7f6]/15 print:bg-gray-50 print:border-gray-300 avoid-break">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#4cd7f6] mb-3 print:text-gray-800">
                Impact Distribution & Severity Categorization
              </h2>

              {/* Progress Distribution Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between text-xs text-[#dae2fd]/70 print:text-gray-700">
                  <span>Affected ({metrics.affectedCount} settlements · {metrics.affectedPct}%)</span>
                  <span>Safe ({metrics.safeCount} settlements · {metrics.safePct}%)</span>
                </div>
                <div className="h-3 w-full bg-[#0b1326] rounded-full overflow-hidden flex print:border print:border-gray-300">
                  <div
                    style={{ width: `${metrics.affectedPct}%` }}
                    className="bg-[#ffb95f] h-full transition-all print:bg-gray-700"
                    title={`Affected: ${metrics.affectedPct}%`}
                  />
                  <div
                    style={{ width: `${metrics.safePct}%` }}
                    className="bg-[#4cd7f6] h-full transition-all print:bg-gray-300"
                    title={`Safe: ${metrics.safePct}%`}
                  />
                </div>
              </div>

              {/* Severity Breakdown Grid with Proportion Bars */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-[#4cd7f6]/10 print:border-gray-200">
                <div className="p-2.5 rounded-lg bg-[#0b1326]/60 border border-purple-500/20 text-center print:bg-white print:border-gray-300">
                  <span className="text-[10px] font-bold text-purple-400 print:text-gray-800">Severe (≥70%)</span>
                  <p className="text-lg font-mono font-bold text-white mt-0.5 print:text-gray-900">{metrics.severeCount}</p>
                  <div className="w-full bg-[#0b1326] h-1.5 rounded-full mt-1.5 overflow-hidden print:border print:border-gray-300">
                    <div style={{ width: `${metrics.totalSettlements ? (metrics.severeCount / metrics.totalSettlements) * 100 : 0}%` }} className="bg-purple-400 h-full print:bg-gray-800" />
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0b1326]/60 border border-red-500/20 text-center print:bg-white print:border-gray-300">
                  <span className="text-[10px] font-bold text-red-400 print:text-gray-800">High (50–69%)</span>
                  <p className="text-lg font-mono font-bold text-white mt-0.5 print:text-gray-900">{metrics.highCount}</p>
                  <div className="w-full bg-[#0b1326] h-1.5 rounded-full mt-1.5 overflow-hidden print:border print:border-gray-300">
                    <div style={{ width: `${metrics.totalSettlements ? (metrics.highCount / metrics.totalSettlements) * 100 : 0}%` }} className="bg-red-400 h-full print:bg-gray-800" />
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0b1326]/60 border border-yellow-500/20 text-center print:bg-white print:border-gray-300">
                  <span className="text-[10px] font-bold text-yellow-400 print:text-gray-800">Medium (25–49%)</span>
                  <p className="text-lg font-mono font-bold text-white mt-0.5 print:text-gray-900">{metrics.mediumCount}</p>
                  <div className="w-full bg-[#0b1326] h-1.5 rounded-full mt-1.5 overflow-hidden print:border print:border-gray-300">
                    <div style={{ width: `${metrics.totalSettlements ? (metrics.mediumCount / metrics.totalSettlements) * 100 : 0}%` }} className="bg-yellow-400 h-full print:bg-gray-800" />
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0b1326]/60 border border-green-500/20 text-center print:bg-white print:border-gray-300">
                  <span className="text-[10px] font-bold text-green-400 print:text-gray-800">Low (1–24%)</span>
                  <p className="text-lg font-mono font-bold text-white mt-0.5 print:text-gray-900">{metrics.lowCount}</p>
                  <div className="w-full bg-[#0b1326] h-1.5 rounded-full mt-1.5 overflow-hidden print:border print:border-gray-300">
                    <div style={{ width: `${metrics.totalSettlements ? (metrics.lowCount / metrics.totalSettlements) * 100 : 0}%` }} className="bg-green-400 h-full print:bg-gray-800" />
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0b1326]/60 border border-[#4cd7f6]/20 text-center print:bg-white print:border-gray-300">
                  <span className="text-[10px] font-bold text-[#4cd7f6] print:text-gray-800">Safe (0%)</span>
                  <p className="text-lg font-mono font-bold text-white mt-0.5 print:text-gray-900">{metrics.safeCount}</p>
                  <div className="w-full bg-[#0b1326] h-1.5 rounded-full mt-1.5 overflow-hidden print:border print:border-gray-300">
                    <div style={{ width: `${metrics.totalSettlements ? (metrics.safeCount / metrics.totalSettlements) * 100 : 0}%` }} className="bg-[#4cd7f6] h-full print:bg-gray-800" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── 4. Detailed Settlement Impact Table ───────────────────────── */}
            <div className="space-y-3 avoid-break">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-white print:text-gray-900">
                  Analyzed Settlement Ledger ({settlements.length} Records)
                </h2>
                <span className="text-[11px] text-[#dae2fd]/50 print:text-gray-500">
                  Ordered by flood impact percentage
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#4cd7f6]/15 print:border-gray-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#131b2e] border-b border-[#4cd7f6]/20 text-[#dae2fd]/70 font-semibold print:bg-gray-100 print:text-gray-900 print:border-gray-300">
                      <th className="py-2.5 px-3">Settlement</th>
                      <th className="py-2.5 px-3">District</th>
                      <th className="py-2.5 px-3 text-right">Total Area</th>
                      <th className="py-2.5 px-3 text-right">Flooded Area</th>
                      <th className="py-2.5 px-3 text-right">Flood Extent</th>
                      <th className="py-2.5 px-3">Impact Flag</th>
                      <th className="py-2.5 px-3 text-right">At-Risk Pop.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4cd7f6]/10 print:divide-gray-200">
                    {[...settlements]
                      .sort((a, b) => (b.flooded_pct ?? 0) - (a.flooded_pct ?? 0))
                      .map((s, idx) => {
                        const total = getTotalArea(s)
                        const flooded = getFloodedArea(s)
                        const fPct = s.flooded_pct ?? 0
                        const atRisk = Math.round((s.population || 0) * (fPct / 100))

                        return (
                          <tr
                            key={s.id || s.name || idx}
                            className="hover:bg-[#131b2e]/40 transition-colors print:hover:bg-transparent"
                          >
                            <td className="py-2.5 px-3 font-semibold text-white print:text-gray-900">
                              {s.name}
                            </td>
                            <td className="py-2.5 px-3 text-[#dae2fd]/70 print:text-gray-700">
                              {s.district || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#dae2fd]/80 print:text-gray-900">
                              {total !== null ? `${total} km²` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#dae2fd]/80 print:text-gray-900">
                              {flooded !== null ? `${flooded} km²` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white print:text-gray-900">
                              {fPct}%
                            </td>
                            <td className="py-2.5 px-3">
                              <SeverityBadge severity={s.severity || (fPct > 0 ? 'medium' : 'safe')} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#dae2fd]/80 print:text-gray-900">
                              {atRisk > 0 ? atRisk.toLocaleString() : '0'}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 5. Technical Footnotes & Signature Block ─────────────────── */}
            <div className="pt-6 border-t border-[#4cd7f6]/20 text-[11px] text-[#dae2fd]/50 space-y-3 print:border-gray-300 print:text-gray-600 avoid-break">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-semibold text-[#dae2fd]/70 uppercase tracking-wider text-[10px] print:text-gray-800">
                    Methodological Notes
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Calculated via spatial polygon intersection with 10m Sentinel/Landsat water indices (NDWI &gt; 0.3)
                    and Height Above Nearest Drainage (HAND) topographic refinement. Permanent water bodies masked via
                    JRC Global Surface Water.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#dae2fd]/70 uppercase tracking-wider text-[10px] print:text-gray-800">
                    Compliance &amp; Verification
                  </p>
                  <p className="mt-1 leading-relaxed">
                    This document is intended for disaster response operations and logistical planning in Nepal Terai.
                    Ground truthing and UAV reconnaissance are recommended prior to field deployment.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-[#4cd7f6]/10 print:border-gray-200 text-[10px]">
                <p>FloodLens Satellite Impact System · NAKSHATRA 2026</p>
                <p className="font-mono mt-1 sm:mt-0">Page 1 of 1 · End of Summary Report</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
