import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Satellite, Menu, X, LayoutDashboard, Sun, Moon } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

/**
 * Navbar — shared top navigation for all public pages (/, /analysis, /about).
 * Rendered once by PublicLayout; never duplicated per page.
 */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()

  // Shared active / inactive class builder for NavLink
  const linkCls = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'text-[#166534] bg-[#E5F2E8] font-semibold dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/8'
        : 'text-[#647067] hover:text-[#26332C] hover:bg-[#F1F5F1] dark:text-[#dae2fd]/65 dark:hover:text-[#dae2fd] dark:hover:bg-white/5'
    }`

  const mobileLinkCls = ({ isActive }) =>
    `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'text-[#166534] bg-[#E5F2E8] font-semibold dark:text-[#4cd7f6] dark:bg-[#4cd7f6]/8'
        : 'text-[#647067] hover:text-[#26332C] hover:bg-[#F1F5F1] dark:text-[#dae2fd]/65 dark:hover:text-[#dae2fd] dark:hover:bg-white/5'
    }`

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 text-[#26332C] dark:bg-[#0b1326]/95 dark:text-[#dae2fd] backdrop-blur-md border-b border-[#DCE5DD] dark:border-[#4cd7f6]/10 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo / Branding — always navigates to Home ── */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[#E5F2E8] border border-[#DCE5DD] dark:bg-[#4cd7f6]/10 dark:border-[#4cd7f6]/25 flex items-center justify-center">
              <Satellite className="w-4 h-4 text-[#166534] dark:text-[#4cd7f6]" />
            </div>
            <div>
              <p className="text-[#26332C] dark:text-white font-bold text-base leading-none font-display">FloodLens</p>
              <p className="text-[#647067] dark:text-[#4cd7f6]/50 text-[9px] tracking-[0.15em] uppercase mt-0.5">NAKSHATRA 2026</p>
            </div>
          </Link>

          {/* ── Desktop nav links ── */}
          <div className="hidden md:flex items-center gap-1">
            {/* Home — `end` prevents matching /analysis or /about */}
            <NavLink to="/" end className={linkCls}>
              Home
            </NavLink>

            <NavLink to="/dashboard" className={linkCls}>
              Dashboard
            </NavLink>

            <NavLink to="/analysis" className={linkCls}>
              Flood Analysis
            </NavLink>

            <NavLink to="/about" className={linkCls}>
              About
            </NavLink>
          </div>

          {/* ── Desktop CTA ── */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-lg border border-[#DCE5DD] bg-white hover:bg-[#F1F5F1] text-[#26332C] dark:border-[#29374B] dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors shadow-sm"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#166534] bg-white hover:bg-[#F1F5F1] border border-[#166534] rounded-lg transition-all duration-150 shadow-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Go to Dashboard
            </Link>
            <Link
              to="/analysis"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#166534] hover:bg-[#14532D] text-white text-xs font-semibold rounded-lg transition-all duration-150 shadow-sm"
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
        <div className="md:hidden bg-white dark:bg-[#131b2e] border-t border-[#DCE5DD] dark:border-[#4cd7f6]/10 px-4 py-4 space-y-1">
          <NavLink
            to="/"
            end
            onClick={() => setMobileOpen(false)}
            className={mobileLinkCls}
          >
            Home
          </NavLink>

          <NavLink
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className={mobileLinkCls}
          >
            Dashboard
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

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center gap-2 w-full text-center px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 text-xs font-medium"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
            </button>
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 w-full text-center px-4 py-2.5 bg-white text-[#166534] border border-[#166534] text-sm font-semibold rounded-lg hover:bg-[#F1F5F1] transition-all duration-150"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </Link>
            <Link
              to="/analysis"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center px-4 py-2.5 bg-[#166534] hover:bg-[#14532D] text-white text-sm font-semibold rounded-lg transition-all duration-150 shadow-sm"
            >
              Start Flood Analysis
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
