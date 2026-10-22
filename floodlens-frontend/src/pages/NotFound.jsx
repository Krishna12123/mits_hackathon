import { Link, useLocation } from 'react-router-dom'
import { Satellite, MapPin, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] font-sans flex flex-col items-center justify-center px-4 text-center">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[360px] bg-[#4cd7f6]/4 rounded-full blur-[120px]" />
      </div>

      <div className="relative">
        {/* Logo mark */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/25 flex items-center justify-center">
            <Satellite className="w-5 h-5 text-[#4cd7f6]" />
          </div>
          <span className="text-white font-bold font-display text-lg">FloodLens</span>
        </div>

        {/* 404 number */}
        <p className="font-display text-[8rem] sm:text-[10rem] font-bold text-[#4cd7f6]/10 leading-none select-none mb-2">
          404
        </p>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
          Page Not Found
        </h1>

        <p className="text-[#dae2fd]/50 text-sm leading-relaxed mb-3 max-w-sm mx-auto">
          The route{' '}
          <code className="text-[#4cd7f6]/80 bg-[#4cd7f6]/8 px-1.5 py-0.5 rounded text-xs font-mono">
            {pathname}
          </code>{' '}
          does not exist in this application.
        </p>

        <p className="text-[#dae2fd]/35 text-xs mb-10">
          Use the links below to navigate to a valid page.
        </p>

        {/* Navigation options */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#4cd7f6] text-[#0b1326] text-sm font-semibold rounded-xl hover:bg-[#4cd7f6]/90 transition-all duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Home
          </Link>
          <Link
            to="/analysis"
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-[#4cd7f6]/25 text-[#dae2fd]/75 text-sm font-medium rounded-xl hover:border-[#4cd7f6]/50 hover:text-[#dae2fd] transition-all duration-150"
          >
            Flood Analysis
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-[#4cd7f6]/25 text-[#dae2fd]/75 text-sm font-medium rounded-xl hover:border-[#4cd7f6]/50 hover:text-[#dae2fd] transition-all duration-150"
          >
            About
          </Link>
        </div>

        {/* Small print */}
        <div className="flex items-center justify-center gap-1.5 text-[#dae2fd]/25 text-xs">
          <MapPin className="w-3 h-3" />
          <span>FloodLens · NAKSHATRA 2026 · Nepal Terai</span>
        </div>
      </div>
    </div>
  )
}
