import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Satellite, Menu, X } from 'lucide-react'

/**
 * Navbar — shared top navigation for all public pages (/, /analysis, /about).
 * Rendered once by PublicLayout; never duplicated per page.
 */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Shared active / inactive class builder for NavLink
  const linkCls = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'text-[#4cd7f6] bg-[#4cd7f6]/8'
        : 'text-[#dae2fd]/65 hover:text-[#dae2fd] hover:bg-white/5'
    }`

  const mobileLinkCls = ({ isActive }) =>
    `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'text-[#4cd7f6] bg-[#4cd7f6]/8'
        : 'text-[#dae2fd]/65 hover:text-[#dae2fd] hover:bg-white/5'
    }`

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0b1326]/95 backdrop-blur-md border-b border-[#4cd7f6]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo / Branding — always navigates to Home ── */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[#4cd7f6]/10 border border-[#4cd7f6]/25 flex items-center justify-center">
              <Satellite className="w-4 h-4 text-[#4cd7f6]" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-none font-display">FloodLens</p>
              <p className="text-[#4cd7f6]/50 text-[9px] tracking-[0.15em] uppercase mt-0.5">NAKSHATRA 2026</p>
            </div>
          </Link>

          {/* ── Desktop nav links ── */}
          <div className="hidden md:flex items-center gap-1">
            {/* Home — `end` prevents matching /analysis or /about */}
            <NavLink to="/" end className={linkCls}>
              Home
            </NavLink>

            <NavLink to="/analysis" className={linkCls}>
              Flood Analysis
            </NavLink>

            <NavLink to="/about" className={linkCls}>
              About
            </NavLink>
          </div>

          {/* ── Desktop CTA ── */}
          <div className="hidden md:block">
            <Link
              to="/analysis"
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#4cd7f6] text-[#0b1326] text-sm font-semibold rounded-lg hover:bg-[#4cd7f6]/90 active:bg-[#4cd7f6]/80 transition-all duration-150"
            >
              Start Flood Analysis
            </Link>
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
            className="md:hidden p-2 rounded-lg text-[#dae2fd]/65 hover:text-[#dae2fd] hover:bg-white/5 transition-colors duration-150"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown ── */}
      {mobileOpen && (
        <div className="md:hidden bg-[#131b2e] border-t border-[#4cd7f6]/10 px-4 py-4 space-y-1">
          <NavLink
            to="/"
            end
            onClick={() => setMobileOpen(false)}
            className={mobileLinkCls}
          >
            Home
          </NavLink>

          <NavLink
            to="/analysis"
            onClick={() => setMobileOpen(false)}
            className={mobileLinkCls}
          >
            Flood Analysis
          </NavLink>

          <NavLink
            to="/about"
            onClick={() => setMobileOpen(false)}
            className={mobileLinkCls}
          >
            About
          </NavLink>

          <div className="pt-2">
            <Link
              to="/analysis"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center px-4 py-2.5 bg-[#4cd7f6] text-[#0b1326] text-sm font-semibold rounded-lg hover:bg-[#4cd7f6]/90 transition-all duration-150"
            >
              Start Flood Analysis
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
