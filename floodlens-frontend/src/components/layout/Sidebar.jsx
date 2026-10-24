import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  Building2,
  FileText,
  Settings,
  Satellite,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/dashboard/map',          icon: Map,             label: 'Flood Map'   },
  { to: '/dashboard/settlements',  icon: Building2,       label: 'Settlements' },
  { to: '/dashboard/reports',      icon: FileText,        label: 'Reports'     },
  { to: '/dashboard/configure',    icon: Settings,        label: 'Configure'   },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-[#DCE5DD] dark:bg-[#111C2E] dark:border-[#29374B] flex flex-col h-full shrink-0 transition-colors duration-150">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#DCE5DD] dark:border-[#29374B]">
        <div className="w-9 h-9 rounded-lg bg-[#166534] flex items-center justify-center shadow-sm">
          <Satellite className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[#26332C] dark:text-white font-bold text-lg leading-none font-display">FloodLens</p>
          <p className="text-[#647067] dark:text-slate-400 text-[10px] font-medium tracking-wider uppercase mt-1">NAKSHATRA 2026</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-200 dark:border-[#29374B] bg-slate-50/50 dark:bg-slate-900/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">GEE Pipeline Active</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Sentinel-2 · Last sync 4m ago</p>
      </div>
    </aside>
  )
}
