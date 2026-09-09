import type { FactionId, System } from './types'

/**
 * Adjacency is state-driven: it reads the systems that were placed in the game (each carries its hex
 * `neighbours`), not a static map module, so a generated galaxy works the same as the fixed duel map.
 * Wormholes link every pair of systems that share a wormhole type, on top of hex adjacency.
 * Ghosts of Creuss (Quantum Entanglement) treat all alpha and beta wormholes as adjacent.
 */
type Systems = Readonly<Record<string, System>>

/**
 * `linkAlphaBeta` treats alpha and beta as one class on top of the usual same-type link — R9 Lost Star
 * Chart's "systems that contain alpha and beta wormholes are adjacent to each other" for the tactical
 * action it was played into.
 */
export function neighbours(systems: Systems, id: string, faction?: FactionId, linkAlphaBeta = false): string[] {
  const sys = systems[id]
  if (!sys) throw new Error(`unknown system ${id}`)
  const out = new Set(sys.neighbours)
  if (sys.wormhole) {
    const isCreuss = faction === 'creuss'
    for (const s of Object.values(systems)) {
      if (s.id !== id && s.wormhole) {
        if (s.wormhole === sys.wormhole) {
          out.add(s.id)
        } else if (isCreuss) {
          if ((sys.wormhole === 'alpha' || sys.wormhole === 'beta') && (s.wormhole === 'alpha' || s.wormhole === 'beta')) {
            out.add(s.id)
          }
        } else if (linkAlphaBeta && (sys.wormhole === 'alpha' || sys.wormhole === 'beta') && (s.wormhole === 'alpha' || s.wormhole === 'beta')) {
          out.add(s.id)
        }
      }
    }
  }
  return [...out]
}

export function adjacent(systems: Systems, a: string, b: string, faction?: FactionId): boolean {
  return neighbours(systems, a, faction).includes(b)
}

export function distance(systems: Systems, from: string, to: string, faction?: FactionId): number {
  if (from === to) return 0
  const seen = new Set([from])
  let frontier = [from]
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) for (const n of neighbours(systems, id, faction)) {
      if (n === to) return d
      if (!seen.has(n)) { seen.add(n); next.push(n) }
    }
    frontier = next
  }
  return Infinity
}
