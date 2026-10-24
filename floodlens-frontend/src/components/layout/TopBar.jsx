import { Bell, RefreshCw, AlertTriangle, Sun, Moon } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function TopBar() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="h-14 bg-white border-b border-[#D1D5DB] dark:bg-[#111C2E] dark:border-[#29374B] flex items-center justify-between px-6 shrink-0 transition-colors duration-150">
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#F5F7F6] border border-[#D1D5DB] dark:bg-amber-950/30 dark:border-amber-500/30">
        <AlertTriangle className="w-3.5 h-3.5 text-[#166534] dark:text-yellow-400 shrink-0" />
        <span className="text-xs text-[#166534] dark:text-yellow-300 font-medium">
          Active Flood Event · Bihar Region · Oct 19, 2026
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <button className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Refresh Data</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2 rounded-lg border border-[#D1D5DB] bg-white hover:bg-[#F5F7F6] text-[#263238] dark:border-[#29374B] dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors shadow-sm"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        <button
          type="button"
          aria-label="View notifications"
          className="relative p-2 rounded-lg border border-[#D1D5DB] bg-white hover:bg-[#F5F7F6] text-[#6B7280] dark:border-[#29374B] dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 transition-colors shadow-sm"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
        </button>

        <div className="w-8 h-8 rounded-full bg-[#166534] flex items-center justify-center text-xs font-bold text-white shadow-sm">
          KS
        </div>
      </div>
    </header>
  )
}
