import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

/**
 * PublicLayout — shared wrapper for all public-facing pages (/, /analysis, /about).
 * Renders the top Navbar once; each page provides its own content and padding.
 * No sidebar or TopBar — those belong to the internal dashboard layout.
 */
export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-[#0b1326] dark:text-[#dae2fd] font-sans transition-colors duration-150">
      <Navbar />
      <Outlet />
    </div>
  )
}
