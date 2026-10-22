/**
 * Spinner
 * -------
 * Accessible circular loading indicator for the FloodLens design system.
 *
 * Sizes
 *   'xs'  — 14 px  — icon-inline labels
 *   'sm'  — 16 px  — compact button loading states
 *   'md'  — 20 px  — default inline use
 *   'lg'  — 32 px  — panel / section headers
 *   'xl'  — 48 px  — full-page / empty-state centres
 *
 * Accessibility
 *   role="status" + aria-label for screen readers.
 *   <span className="sr-only"> for visible label placement by the caller.
 *
 * Reduced-motion
 *   The CSS spin animation is suppressed via the Tailwind `motion-reduce:`
 *   variant; a static arc and increased opacity remain as a visual cue.
 */

const SIZES = {
  xs: 'w-3.5 h-3.5 border-[1.5px]',
  sm: 'w-4   h-4   border-2',
  md: 'w-5   h-5   border-2',
  lg: 'w-8   h-8   border-[2.5px]',
  xl: 'w-12  h-12  border-[3px]',
}

export default function Spinner({
  size      = 'md',
  label     = 'Loading\u2026',
  className = '',
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-block rounded-full shrink-0',
        // Arc colours: faint ring + bright leading edge
        'border-[#4cd7f6]/20 border-t-[#4cd7f6]',
        // Motion: spin normally; freeze (static arc) for reduced-motion users
        'animate-spin',
        'motion-reduce:animate-none motion-reduce:border-t-[#4cd7f6]/55',
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
    />
  )
}
