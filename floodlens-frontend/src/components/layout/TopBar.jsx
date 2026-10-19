import { Bell, RefreshCw, AlertTriangle } from 'lucide-react'

export default function TopBar() {
  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
        <span className="text-sm text-yellow-300 font-medium">
          Active Flood Event · Bihar Region · Oct 19, 2026
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-secondary py-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </button>
        <button className="relative p-2 rounded-lg hover:bg-gray-800 transition-colors">
          <Bell className="w-4 h-4 text-gray-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">
          KS
        </div>
      </div>
    </header>
  )
}
