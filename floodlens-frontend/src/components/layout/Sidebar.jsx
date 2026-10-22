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
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
          <Satellite className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-none">FloodLens</p>
          <p className="text-gray-500 text-xs mt-0.5">NAKSHATRA 2026</p>
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
      <div className="px-4 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-400">GEE Pipeline Active</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">Sentinel-2 · Last sync 4m ago</p>
      </div>
    </aside>
  )
}
