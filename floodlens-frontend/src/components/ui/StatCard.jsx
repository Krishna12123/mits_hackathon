import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

export default function StatCard({ title, value, unit, change, icon: Icon, color = 'blue', description }) {
  const colorMap = {
    blue:   'bg-brand-600/20 text-brand-400',
    green:  'bg-green-900/40 text-green-400',
    yellow: 'bg-yellow-900/40 text-yellow-400',
    red:    'bg-red-900/40 text-red-400',
    purple: 'bg-purple-900/40 text-purple-400',
  }

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const trendColor = change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-gray-400'

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon className="w-3.5 h-3.5" />
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{title}</p>
        <p className="text-white text-2xl font-bold mt-1">
          {value}
          {unit && <span className="text-gray-500 text-sm font-normal ml-1">{unit}</span>}
        </p>
        {description && <p className="text-gray-500 text-xs mt-1">{description}</p>}
      </div>
    </div>
  )
}
