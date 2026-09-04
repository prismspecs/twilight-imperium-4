import type { System } from './types'

/**
 * Adjacency is state-driven: it reads the systems that were placed in the game (each carries its hex
 * `neighbours`), not a static map module, so a generated galaxy works the same as the fixed duel map.
 * Wormholes link every pair of systems that share a wormhole type, on top of hex adjacency.
 */
type Systems = Readonly<Record<string, System>>

export function neighbours(systems: Systems, id: string): string[] {
  const sys = systems[id]
  if (!sys) throw new Error(`unknown system ${id}`)
  const out = new Set(sys.neighbours)
  if (sys.wormhole) for (const s of Object.values(systems)) if (s.id !== id && s.wormhole === sys.wormhole) out.add(s.id)
  return [...out]
}

export function adjacent(systems: Systems, a: string, b: string): boolean {
  return neighbours(systems, a).includes(b)
}

export function distance(systems: Systems, from: string, to: string): number {
  if (from === to) return 0
  const seen = new Set([from])
  let frontier = [from]
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) for (const n of neighbours(systems, id)) {
      if (n === to) return d
      if (!seen.has(n)) { seen.add(n); next.push(n) }
    }
    frontier = next
  }
  return Infinity
}
