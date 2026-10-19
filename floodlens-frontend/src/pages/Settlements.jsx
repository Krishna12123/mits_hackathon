import { useState } from 'react'
import SeverityBadge from '../components/ui/SeverityBadge'
import { Search, Download, Users, Home, Wheat } from 'lucide-react'

const settlements = [
  { id: 1, name: 'Hayaghat',     district: 'Darbhanga',   population: 42300,  flooded_pct: 78, severity: 'severe', homes: 8200, farms_ha: 1240 },
  { id: 2, name: 'Benipur',      district: 'Darbhanga',   population: 31500,  flooded_pct: 55, severity: 'high',   homes: 6100, farms_ha: 890  },
  { id: 3, name: 'Sheohar',      district: 'Sitamarhi',   population: 28900,  flooded_pct: 63, severity: 'high',   homes: 5400, farms_ha: 760  },
  { id: 4, name: 'Runnisaidpur', district: 'Sitamarhi',   population: 18700,  flooded_pct: 41, severity: 'medium', homes: 3900, farms_ha: 510  },
  { id: 5, name: 'Sitamarhi',    district: 'Sitamarhi',   population: 94200,  flooded_pct: 32, severity: 'medium', homes: 17300, farms_ha: 2100 },
  { id: 6, name: 'Muzaffarpur', district: 'Muzaffarpur',  population: 354000, flooded_pct: 11, severity: 'low',    homes: 64000, farms_ha: 3200 },
  { id: 7, name: 'Sakra',        district: 'Muzaffarpur', population: 22100,  flooded_pct: 19, severity: 'low',    homes: 4100, farms_ha: 620  },
  { id: 8, name: 'Pusa',         district: 'Darbhanga',   population: 14800,  flooded_pct: 88, severity: 'severe', homes: 2700, farms_ha: 430  },
]

export default function Settlements() {
  const [search, setSearch]       = useState('')
  const [filterSeverity, setFilter] = useState('all')

  const filtered = settlements.filter(s => {
    const matchSearch   = s.name.toLowerCase().includes(search.toLowerCase()) ||
                          s.district.toLowerCase().includes(search.toLowerCase())
    const matchSeverity = filterSeverity === 'all' || s.severity === filterSeverity
    return matchSearch && matchSeverity
  })

  const totalPop = filtered.reduce((a, s) => a + Math.round(s.population * s.flooded_pct / 100), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Affected Settlements</h1>
          <p className="text-gray-400 text-sm mt-1">
            OSM + Admin boundary intersection · {settlements.length} settlements identified
          </p>
        </div>
        <button className="btn-primary">
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users,  label: 'At-Risk Population', value: '1.24M' },
          { icon: Home,   label: 'Affected Homes',      value: '112K'  },
          { icon: Wheat,  label: 'Farmland Affected',   value: '9,750 ha' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search settlement or district…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-gray-600"
          />
        </div>
        {['all', 'severe', 'high', 'medium', 'low'].map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
              filterSeverity === level
                ? 'bg-brand-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            {level === 'all' ? 'All' : level}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                {['Settlement', 'District', 'Severity', 'Population', 'Flooded %', 'Homes', 'Farmland'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-gray-900/30'}`}
                >
                  <td className="px-5 py-3 text-white font-medium">{s.name}</td>
                  <td className="px-5 py-3 text-gray-400">{s.district}</td>
                  <td className="px-5 py-3"><SeverityBadge level={s.severity} /></td>
                  <td className="px-5 py-3 text-gray-300">{s.population.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-20">
                        <div
                          className={`h-1.5 rounded-full ${
                            s.severity === 'severe' ? 'bg-purple-500' :
                            s.severity === 'high'   ? 'bg-red-500'    :
                            s.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${s.flooded_pct}%` }}
                        />
                      </div>
                      <span className="text-gray-300">{s.flooded_pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{s.homes.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-400">{s.farms_ha.toLocaleString()} ha</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-10 text-sm">No settlements match your filters.</p>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-600 text-right">
        Showing {filtered.length} of {settlements.length} settlements · Source: OSM + QGIS admin boundaries
      </p>
    </div>
  )
}
