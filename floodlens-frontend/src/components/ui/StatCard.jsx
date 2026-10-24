import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

export default function StatCard({ title, value, unit, change, icon: Icon, color = 'blue', description }) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50',
    green:  'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
    yellow: 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50',
    red:    'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50',
    purple: 'bg-purple-50 text-purple-600 border border-purple-100 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50',
  }

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const trendCls =
    change > 0
      ? 'text-rose-600 bg-rose-50 border border-rose-200/70 dark:text-rose-400 dark:bg-rose-950/30 dark:border-rose-800/40'
      : change < 0
      ? 'text-emerald-600 bg-emerald-50 border border-emerald-200/70 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800/40'
      : 'text-slate-500 bg-slate-100 border border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-700/50'

  return (
    <div className="stat-card hover:shadow-md transition-all duration-150">
      <div className="flex items-start justify-between">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm', colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {change !== undefined && (
          <div className={clsx('flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold', trendCls)}>
            <TrendIcon className="w-3 h-3" />
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wider">{title}</p>
        <p className="text-slate-900 dark:text-white text-2xl font-bold font-display mt-1 tracking-tight">
          {value}
          {unit && <span className="text-slate-500 dark:text-slate-400 text-xs font-normal ml-1">{unit}</span>}
        </p>
        {description && <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1 line-clamp-1">{description}</p>}
      </div>
    </div>
  )
}
