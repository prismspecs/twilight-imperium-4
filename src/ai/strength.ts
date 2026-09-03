import { isShip } from '../data/units'
import type { Unit } from '../engine/types'

/**
 * A crude but useful combat power rating: the sum over a fleet of each ship's value, weighted so that big
 * pieces (dreadnoughts, war suns) count for more than a swarm of fighters. Purely heuristic — the engine
 * owns the real dice.
 */
export function shipStrength(units: Unit[], owner: number): number {
  let s = 0
  for (const u of units) {
    if (!isShip(u.type) || u.owner !== owner) continue
    s += weight(u.type)
  }
  return s
}

function weight(type: Unit['type']): number {
  switch (type) {
    case 'warsun': return 9
    case 'flagship': return 7
    case 'dreadnought': return 5
    case 'carrier': return 3
    case 'cruiser': return 2
    case 'destroyer': return 1
    case 'fighter': return 1
    default: return 0
  }
}
