import { MECATOL_ID } from '../data/map'
import { MANDATE_IDS, objectiveDef } from '../data/objectives'
import { findTech } from '../data/techs'
import { isShip } from '../data/units'
import { neighbours } from './adjacency'
import { homeSystemOf } from './board'
import type { GameState, PlanetTrait, Seat, TechColor } from './types'

export function controlledPlanets(state: GameState, seat: Seat): { systemId: string; planetId: string }[] {
  const out: { systemId: string; planetId: string }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat) out.push({ systemId: sys.id, planetId: p.id })
  }
  return out
}

export function controlsMecatol(state: GameState, seat: Seat): boolean {
  return state.systems[MECATOL_ID]?.planets.some(p => p.owner === seat) ?? false
}

function shipCount(state: GameState, seat: Seat): number {
  let n = 0
  for (const sys of Object.values(state.systems)) {
    for (const u of sys.space) if (u.owner === seat && isShip(u.type)) n += 1
  }
  return n
}

function maxSameTraitPlanets(state: GameState, seat: Seat): number {
  const counts: Record<PlanetTrait, number> = { industrial: 0, hazardous: 0, cultural: 0 }
  for (const cp of controlledPlanets(state, seat)) {
    const planet = state.systems[cp.systemId]?.planets.find(p => p.id === cp.planetId)
    if (planet?.trait) counts[planet.trait] += 1
  }
  return Math.max(counts.industrial, counts.hazardous, counts.cultural)
}

function controlledNonHomePlanets(state: GameState, seat: Seat): number {
  return controlledPlanets(state, seat).filter(p => state.systems[p.systemId]?.home === null).length
}

function techSpecialtyPlanets(state: GameState, seat: Seat): number {
  let count = 0
  for (const cp of controlledPlanets(state, seat)) {
    const planet = state.systems[cp.systemId]?.planets.find(p => p.id === cp.planetId)
    if (planet?.techSkip !== null && planet?.techSkip !== undefined) count += 1
  }
  return count
}

function shipsAdjacentToMecatol(state: GameState, seat: Seat): number {
  const adjacentSystems = neighbours(state.systems, MECATOL_ID)
  let count = 0
  for (const sysId of adjacentSystems) {
    const sys = state.systems[sysId]
    if (sys && sys.space.some(u => u.owner === seat && isShip(u.type))) count += 1
  }
  return count
}

function controlledPlanetsInOtherHome(state: GameState, seat: Seat): number {
  return controlledPlanets(state, seat).filter(p => {
    const home = state.systems[p.systemId]?.home
    return home !== null && home !== undefined && home !== seat
  }).length
}

function unitUpgradeCount(state: GameState, seat: Seat): number {
  let count = 0
  for (const techId of state.players[seat].techs) {
    const t = findTech(techId)
    if (t && (t.kind === 'upgrade' || t.unit !== undefined)) count += 1
  }
  return count
}

function techColorsWithAtLeast(state: GameState, seat: Seat, minCount: number): number {
  const counts: Record<TechColor, number> = { blue: 0, red: 0, green: 0, yellow: 0 }
  for (const techId of state.players[seat].techs) {
    const t = findTech(techId)
    if (t?.colour) counts[t.colour] += 1
  }
  return Object.values(counts).filter(c => c >= minCount).length
}

/** R7: evaluates fulfilment of public objectives and mandates. An unknown id is false, never a throw. */
export function fulfils(state: GameState, seat: Seat, objectiveId: string): boolean {
  const player = state.players[seat]
  if (!player) return false

  switch (objectiveId) {
    // Stage I public objectives (1 VP)
    case 'corner_the_market':
      return maxSameTraitPlanets(state, seat) >= 4
    case 'develop_weaponry':
      return unitUpgradeCount(state, seat) >= 2
    case 'diversify_research':
      return techColorsWithAtLeast(state, seat, 2) >= 2
    case 'erect_a_monument':
      return player.resourcesSpentThisRound >= 8
    case 'expand_borders':
      return controlledNonHomePlanets(state, seat) >= 6
    case 'found_research_outposts':
      return techSpecialtyPlanets(state, seat) >= 3
    case 'intimidate_council':
      return shipsAdjacentToMecatol(state, seat) >= 2
    case 'lead_from_the_front':
      return player.tokensSpentThisRound >= 3
    case 'negotiate_trade_routes':
      return player.tradeGoodsSpentThisRound >= 5
    case 'sway_the_council':
      return player.influenceSpentThisRound >= 8

    // Stage II public objectives (2 VP)
    case 'centralize_galactic_trade':
      return player.tradeGoodsSpentThisRound >= 10
    case 'conquer_the_weak':
      return controlledPlanetsInOtherHome(state, seat) >= 1
    case 'form_galactic_brain_trust':
      return techSpecialtyPlanets(state, seat) >= 5
    case 'found_a_golden_age':
      return player.resourcesSpentThisRound >= 16
    case 'galvanize_the_people':
      return player.tokensSpentThisRound >= 6
    case 'manipulate_galactic_law':
      return player.influenceSpentThisRound >= 16
    case 'master_the_sciences':
      return techColorsWithAtLeast(state, seat, 2) >= 4
    case 'revolutionize_warfare':
      return unitUpgradeCount(state, seat) >= 3
    case 'subdue_the_galaxy':
      return controlledNonHomePlanets(state, seat) >= 11
    case 'unify_the_colonies':
      return maxSameTraitPlanets(state, seat) >= 6

    // Legacy duel objectives (for transitional compatibility)
    case 'win_space_combat':
      return player.spaceCombatWins >= 1
    case 'control_4_outside_home':
      return controlledPlanets(state, seat).filter(p => state.systems[p.systemId]?.home !== seat).length >= 4
    case 'spend_6_resources':
      return player.resourcesSpentThisRound >= 6
    case 'trade_three_times':
      return player.trades >= 3
    case 'more_ships': {
      const myShips = shipCount(state, seat)
      const allOtherSeats = state.players.map((_, i) => i).filter(i => i !== seat)
      return allOtherSeats.some(other => myShips > shipCount(state, other))
    }
    case 'first_strike':
      return state.mecatolCombatWinner === seat
    case 'foothold': {
      const allOtherSeats = state.players.map((_, i) => i).filter(i => i !== seat)
      return allOtherSeats.some(other =>
        controlledPlanets(state, seat).some(p => p.systemId === homeSystemOf(state, other))
      )
    }

    default:
      return false
  }
}

/** R3.3 step 1: what the seat may score right now, each objective and each mandate once per game. */
export function scoreable(state: GameState, seat: Seat): string[] {
  const player = state.players[seat]
  if (!player) return []
  const out = state.publicObjectives.filter(id => !player.scoredObjectives.includes(id) && fulfils(state, seat, id))
  for (const id of MANDATE_IDS) {
    if (!player.scoredMandates.includes(id) && fulfils(state, seat, id)) out.push(id)
  }
  return out
}

export function addVp(state: GameState, seat: Seat, points: number, reason: string): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], vp: players[seat].vp + points }
  return { ...state, players, log: [...state.log, { t: 'info', text: `seat ${seat} scores ${points} VP: ${reason}` }] }
}

/** R7: records the objective (or the mandate) and adds its victory points. Fulfilment is checked by the caller. */
export function scoreObjective(state: GameState, seat: Seat, objectiveId: string): GameState {
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = MANDATE_IDS.includes(objectiveId)
    ? { ...player, scoredMandates: [...player.scoredMandates, objectiveId] }
    : { ...player, scoredObjectives: [...player.scoredObjectives, objectiveId] }
  const def = objectiveDef(objectiveId)
  const points = def?.points ?? 1
  return addVp({ ...state, players }, seat, points, def?.text ?? objectiveId)
}
