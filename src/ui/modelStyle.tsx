import { useSyncExternalStore } from 'react'

/** Which set of unit art the board draws: the cinematic miniatures, the same models from above, the flat
 * AsyncTI4 counters, or the studio isometric renders. The choice is the viewer's own and persists. */
export type ModelStyle = 'models' | 'topdown' | 'counters' | 'studio'

const STORAGE_KEY = 'md:modelStyle'
export const MODEL_STYLES: ModelStyle[] = ['models', 'topdown', 'counters', 'studio']
const DEFAULT_STYLE: ModelStyle = 'counters'

/** Module-level store: every surface (board, panels, menu, setup screen) shares one live choice. */
let current: ModelStyle = readStored()
const listeners = new Set<() => void>()

function readStored(): ModelStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ModelStyle | null
    return raw !== null && MODEL_STYLES.includes(raw) ? raw : DEFAULT_STYLE
  } catch {
    return DEFAULT_STYLE
  }
}

export function getStyle(): ModelStyle {
  return current
}

export function setStyle(next: ModelStyle): void {
  if (!MODEL_STYLES.includes(next) || next === current) return
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode: the choice lives for the session */ }
  listeners.forEach(listener => { listener() })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useModelStyle(): { style: ModelStyle; setStyle: (next: ModelStyle) => void } {
  const style = useSyncExternalStore(subscribe, getStyle)
  return { style, setStyle }
}
