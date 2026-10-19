import clsx from 'clsx'

const severityConfig = {
  low:    { label: 'Low',    className: 'badge-low'    },
  medium: { label: 'Medium', className: 'badge-medium' },
  high:   { label: 'High',   className: 'badge-high'   },
  severe: { label: 'Severe', className: 'badge-severe' },
}

export default function SeverityBadge({ level }) {
  const config = severityConfig[level] || severityConfig.low
  return (
    <span className={config.className}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', {
        'bg-green-400':  level === 'low',
        'bg-yellow-400': level === 'medium',
        'bg-red-400':    level === 'high',
        'bg-purple-400': level === 'severe',
      })} />
      {config.label}
    </span>
  )
}
