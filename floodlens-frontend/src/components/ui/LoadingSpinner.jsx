import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  )
}
