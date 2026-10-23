import { Routes, Route } from 'react-router-dom'

// Public layout (Navbar only — no sidebar)
import PublicLayout from './components/layout/PublicLayout'

// Public pages
import Home      from './pages/Home'
import About     from './pages/About'
import NotFound  from './pages/NotFound'

// Dashboard layout (sidebar + topbar)
import Layout    from './components/layout/Layout'

// Dashboard pages
import Dashboard        from './pages/Dashboard'
import FloodMap         from './pages/FloodMap'
import Settlements      from './pages/Settlements'
import SettlementReport from './pages/SettlementReport'
import Reports          from './pages/Reports'
import Configure        from './pages/Configure'

export default function App() {
  return (
    <Routes>

      {/* ── Public routes — shared Navbar, no sidebar ────────────────── */}
      <Route element={<PublicLayout />}>
        {/* / → Home landing page */}
        <Route index element={<Home />} />

        {/* /analysis → Flood Analysis input panel + map */}
        <Route
          path="analysis"
          element={
            <div className="pt-8 pb-16">
              <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
                <Configure />
              </div>
            </div>
          }
        />

        {/* /about → About page */}
        <Route path="about" element={<About />} />

        {/* /settlement-report → Direct printable settlement impact report */}
        <Route path="settlement-report" element={<SettlementReport />} />
      </Route>

      {/* ── Internal dashboard — sidebar + topbar layout ─────────────── */}
      <Route path="dashboard" element={<Layout />}>
        <Route index                      element={<Dashboard />}        />
        <Route path="map"                 element={<FloodMap />}          />
        <Route path="settlements"         element={<Settlements />}       />
        <Route path="settlements/report"  element={<SettlementReport />}  />
        <Route path="reports"             element={<Reports />}           />
        <Route path="configure"           element={<Configure />}         />
      </Route>

      {/* ── 404 — catch all unknown routes ───────────────────────────── */}
      <Route path="*" element={<NotFound />} />

    </Routes>
  )
}
