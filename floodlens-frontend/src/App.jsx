import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import FloodMap from './pages/FloodMap'
import Settlements from './pages/Settlements'
import Reports from './pages/Reports'
import Configure from './pages/Configure'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index          element={<Dashboard />} />
        <Route path="map"     element={<FloodMap />} />
        <Route path="settlements" element={<Settlements />} />
        <Route path="reports" element={<Reports />} />
        <Route path="configure" element={<Configure />} />
      </Route>
    </Routes>
  )
}
