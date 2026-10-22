import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

/**
 * PublicLayout — shared wrapper for all public-facing pages (/, /analysis, /about).
 * Renders the top Navbar once; each page provides its own content and padding.
 * No sidebar or TopBar — those belong to the internal dashboard layout.
 */
export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] font-sans">
      <Navbar />
      <Outlet />
    </div>
  )
}
