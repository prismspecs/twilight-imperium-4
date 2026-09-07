/** Minimal line icons for UI chrome (panel toggles, close controls) — no emoji, no icon font. */

export function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M9 3 L4 8 L9 13' : 'M5 3 L10 8 L5 13'
  return (
    <svg className="icon-svg" width="12" height="16" viewBox="0 0 14 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg className="icon-svg" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 1 L11 11 M11 1 L1 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
