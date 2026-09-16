import { useState } from 'react'

/** Which set of unit art the board draws: the cinematic miniatures, the same models from above, the flat
 * AsyncTI4 counters, or the studio isometric renders. The choice is the viewer's own and persists. */
export type ModelStyle = 'models' | 'topdown' | 'counters' | 'studio'

const STORAGE_KEY = 'md:modelStyle'
const DEFAULT_STYLE: ModelStyle = 'counters'
const STYLES: ModelStyle[] = ['models', 'topdown', 'counters', 'studio']

function stored(): ModelStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ModelStyle | null
    return raw !== null && STYLES.includes(raw) ? raw : DEFAULT_STYLE
  } catch {
    return DEFAULT_STYLE
  }
}

export function useModelStyle(): { style: ModelStyle; setStyle: (style: ModelStyle) => void } {
  const [style, setStyleState] = useState<ModelStyle>(stored)
  const setStyle = (next: ModelStyle) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode: the choice lives for the session */ }
    setStyleState(next)
  }
  return { style, setStyle }
}
