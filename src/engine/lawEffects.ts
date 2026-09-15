import type { GameState, Seat } from './types'

/**
 * R10: the two Elect-Planet laws whose ongoing effects restrict what may happen on the planet they are
 * attached to. Both live on `Planet.attachments`, so every predicate is a read of that list and every
 * module above the state shape can cite the law by name instead of scattering attachment string checks.
 */

function attachmentsOf(state: GameState, planetId: string): readonly string[] {
  for (const sys of Object.values(state.systems)) {
    const planet = sys.planets.find(p => p.id === planetId)
    if (planet) return planet.attachments ?? []
  }
  return []
}

/** Holy Planet of Ixth: "Units on this planet cannot use PRODUCTION." */
export function isHolyPlanet(state: GameState, planetId: string): boolean {
  return attachmentsOf(state, planetId).includes('holy_planet_of_ixth')
}

/** Demilitarized Zone: "Player's units cannot land, be produced, or be placed on this planet." */
export function isDemilitarizedZone(state: GameState, planetId: string): boolean {
  return attachmentsOf(state, planetId).includes('demilitarized_zone')
}

/**
 * Holy Planet of Ixth: "When a player gains control of this planet, they gain 1 victory point. When a
 * player loses control of this planet, they lose 1 victory point." Called at every control change of the
 * attached planet. LRR 25: victory points never go below zero — an owner at 0 VP simply loses the planet
 * at 0. Discarding the law takes no VP back (lrr-components.md, Holy Planet of Ixth 1), which is why the
 * swing lives here at control-change time and nowhere else.
 */
export function holyPlanetControlSwing(state: GameState, planetId: string, newOwner: Seat, prevOwner: Seat): GameState {
  if (newOwner === prevOwner || !isHolyPlanet(state, planetId)) return state
  const players = [...state.players] as GameState['players']
  const gained = players[newOwner]
  const lost = players[prevOwner]
  players[newOwner] = { ...gained, vp: gained.vp + 1 }
  players[prevOwner] = { ...lost, vp: Math.max(0, lost.vp - 1) }
  const name = state.players[newOwner]?.name ?? `seat ${String(newOwner)}`
  const lostName = state.players[prevOwner]?.name ?? `seat ${String(prevOwner)}`
  return {
    ...state,
    players,
    log: [...state.log, { t: 'info', text: `Holy Planet of Ixth: ${name} gains 1 VP and ${lostName} loses 1 VP with the planet` }],
  }
}
