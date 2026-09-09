import { MECATOL_ID } from '../data/map'
import { objectiveDef } from '../data/objectives'
import { findTech } from '../data/techs'
import { isShip } from '../data/units'
import { neighbours } from './adjacency'
import { homeSystemOf } from './board'
import { payCost, payInfluence } from './economy'
import type { GameState, PlanetTrait, Result, Seat, TechColor } from './types'

/**
 * lrr-components.md: Erect a Monument, Found a Golden Age, Sway the Council, Manipulate Galactic Law,
 * Negotiate Trade Routes and Centralize Galactic Trade all carry the same ruling — "must be spent during the
 * status phase; any [resource] spent during the action phase will have no effect" — so unlike every other
 * objective these are never auto-scored from a passive state check. `payObjective` is the only way to score
 * one, and it is the actual spend the ruling requires, not a retroactive read of round-total spending.
 */
export const SPEND_OBJECTIVES: Readonly<Record<string, { kind: 'resources' | 'influence' | 'tradeGoods'; amount: number }>> = {
  erect_a_monument: { kind: 'resources', amount: 8 },
  sway_the_council: { kind: 'influence', amount: 8 },
  negotiate_trade_routes: { kind: 'tradeGoods', amount: 5 },
  found_a_golden_age: { kind: 'resources', amount: 16 },
  manipulate_galactic_law: { kind: 'influence', amount: 16 },
  centralize_galactic_trade: { kind: 'tradeGoods', amount: 10 },
}

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
  const faction = state.players[seat]?.faction
  const adjacentSystems = neighbours(state.systems, MECATOL_ID, faction)
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

/** R7: evaluates fulfilment of public and secret objectives. An unknown id is false, never a throw. */
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
    case 'expand_borders':
      return controlledNonHomePlanets(state, seat) >= 6
    case 'found_research_outposts':
      return techSpecialtyPlanets(state, seat) >= 3
    case 'intimidate_council':
      return shipsAdjacentToMecatol(state, seat) >= 2
    case 'lead_from_the_front':
      return player.tokensSpentThisRound >= 3

    // Stage II public objectives (2 VP)
    case 'conquer_the_weak':
      return controlledPlanetsInOtherHome(state, seat) >= 1
    case 'form_galactic_brain_trust':
      return techSpecialtyPlanets(state, seat) >= 5
    case 'galvanize_the_people':
      return player.tokensSpentThisRound >= 6
    case 'master_the_sciences':
      return techColorsWithAtLeast(state, seat, 2) >= 4
    case 'revolutionize_warfare':
      return unitUpgradeCount(state, seat) >= 3
    case 'subdue_the_galaxy':
      return controlledNonHomePlanets(state, seat) >= 11
    case 'unify_the_colonies':
      return maxSameTraitPlanets(state, seat) >= 6

    case 'more_ships': {
      const myShips = shipCount(state, seat)
      const allOtherSeats = state.players.map((_, i) => i).filter(i => i !== seat)
      return allOtherSeats.some(other => myShips > shipCount(state, other))
    }

    // Secret objectives (1 VP)
    case 'ans':
      return player.techs.filter(tId => findTech(tId)?.kind === 'faction').length >= 2
    case 'btgk': {
      const hasAlpha = Object.values(state.systems).some(s => s.wormhole === 'alpha' && s.space.some(u => u.owner === seat && isShip(u.type)))
      const hasBeta = Object.values(state.systems).some(s => s.wormhole === 'beta' && s.space.some(u => u.owner === seat && isShip(u.type)))
      return hasAlpha && hasBeta
    }
    case 'csl':
      return Object.values(state.systems).some(s =>
        s.space.some(u => u.owner === seat && isShip(u.type)) &&
        (s.planets.some(p => p.structures.some(u => u.owner !== seat && u.type === 'spacedock'))
          || s.space.some(u => u.owner !== seat && u.type === 'floating_factory'))
      )
    case 'ctr':
      return Object.values(state.systems).filter(s => s.space.some(u => u.owner === seat && isShip(u.type))).length >= 6
    case 'dtgs':
      return player.spaceCombatWins >= 1
    case 'eap':
      return Object.values(state.systems).flatMap(s => s.planets.flatMap(p => p.structures)).filter(u => u.owner === seat && u.type === 'pds').length >= 4
    case 'faa':
      return controlledPlanets(state, seat).filter(cp => state.systems[cp.systemId]?.planets.find(p => p.id === cp.planetId)?.trait === 'cultural').length >= 4
    case 'fsn':
      return player.tokensSpentThisRound >= 3 || player.tradeGoodsSpentThisRound >= 3
    case 'fwm':
      return Object.values(state.systems).flatMap(s => [...s.planets.flatMap(p => p.structures), ...s.space])
        .filter(u => u.owner === seat && (u.type === 'spacedock' || u.type === 'floating_factory')).length >= 3
    case 'gamf':
      return Object.values(state.systems).flatMap(s => s.space).filter(u => u.owner === seat && u.type === 'dreadnought').length >= 5
    case 'lsc': {
      const anomalyTiles = ['41', '42', '43', '44', '45']
      const anomalySystems = new Set(Object.values(state.systems).filter(s => s.tile && (anomalyTiles.includes(s.tile) || s.name.toLowerCase().includes('nebula') || s.name.toLowerCase().includes('supernova') || s.name.toLowerCase().includes('asteroid') || s.name.toLowerCase().includes('rift'))).map(s => s.id))
      return Object.values(state.systems).filter(s => s.space.some(u => u.owner === seat && isShip(u.type)) && neighbours(state.systems, s.id, player.faction).some(nid => anomalySystems.has(nid))).length >= 3
    }
    case 'mew':
      return player.spaceCombatWins >= 1
    case 'mlp':
      return techColorsWithAtLeast(state, seat, 4) >= 1
    case 'mp':
      return controlledPlanets(state, seat).filter(cp => state.systems[cp.systemId]?.planets.find(p => p.id === cp.planetId)?.trait === 'industrial').length >= 4
    case 'mrm':
      return controlledPlanets(state, seat).filter(cp => state.systems[cp.systemId]?.planets.find(p => p.id === cp.planetId)?.trait === 'hazardous').length >= 4
    case 'ose':
      return controlsMecatol(state, seat) && (state.systems[MECATOL_ID]?.space.filter(u => u.owner === seat && isShip(u.type)).length ?? 0) >= 3
    case 'sar':
      return player.spaceCombatWins >= 1
    case 'te': {
      const otherHomes = state.players.filter(p => p.seat !== seat).map(p => homeSystemOf(state, p.seat))
      return Object.values(state.systems).some(s => s.space.some(u => u.owner === seat && isShip(u.type)) && neighbours(state.systems, s.id, player.faction).some(nid => otherHomes.includes(nid)))
    }
    case 'ttfd':
      return player.spaceCombatWins >= 1
    case 'uf':
      return player.spaceCombatWins >= 1 && Object.values(state.systems).some(s => s.space.some(u => u.owner === seat && u.type === 'flagship'))

    default:
      return false
  }
}

/** R3.3 step 1: what the seat may score right now, each objective once per game. */
export function scoreable(state: GameState, seat: Seat): string[] {
  const player = state.players[seat]
  if (!player) return []
  const out = state.publicObjectives.filter(id => !player.scoredObjectives.includes(id) && fulfils(state, seat, id))
  for (const id of player.secretObjectives ?? []) {
    if (!player.scoredObjectives.includes(id) && fulfils(state, seat, id)) out.push(id)
  }
  return out
}

/** The status-phase-only spend objectives (see SPEND_OBJECTIVES) still on the board and not yet scored by
 * this seat — a player may choose to pay for any of these during the status phase, but nothing scores them
 * automatically the way `scoreable` does. */
export function payableObjectives(state: GameState, seat: Seat): string[] {
  const player = state.players[seat]
  if (!player) return []
  return state.publicObjectives.filter(id => id in SPEND_OBJECTIVES && !player.scoredObjectives.includes(id))
}

/**
 * lrr-components.md rulings on Erect a Monument / Found a Golden Age / Sway the Council / Manipulate
 * Galactic Law / Negotiate Trade Routes / Centralize Galactic Trade: the resources, influence or trade
 * goods must be spent during the status phase itself — this is that spend, not a check of what a player
 * already happened to spend earlier in the round. Resources and influence may be paid partly in trade
 * goods (one for one); the two trade-goods objectives take only trade goods, per their own rulings.
 */
export function payObjective(state: GameState, seat: Seat, objectiveId: string, planets: string[], tradeGoods: number): Result<GameState> {
  const spend = SPEND_OBJECTIVES[objectiveId]
  if (!spend) return { ok: false, error: `${objectiveId} is not a spend objective` }
  const player = state.players[seat]
  if (!player) return { ok: false, error: 'unknown seat' }
  if (player.scoredObjectives.includes(objectiveId)) return { ok: false, error: `${objectiveId} already scored` }
  if (!state.publicObjectives.includes(objectiveId)) return { ok: false, error: `${objectiveId} is not in play` }
  if (spend.kind === 'tradeGoods') {
    if (planets.length > 0) return { ok: false, error: `${objectiveId} is paid in trade goods only, not planets` }
    if (!Number.isInteger(tradeGoods) || tradeGoods < 0 || tradeGoods > player.tradeGoods) return { ok: false, error: 'not enough trade goods' }
    if (tradeGoods < spend.amount) return { ok: false, error: `${objectiveId} needs ${String(spend.amount)} trade goods` }
    const players = [...state.players] as GameState['players']
    players[seat] = { ...player, tradeGoods: player.tradeGoods - tradeGoods, tradeGoodsSpentThisRound: player.tradeGoodsSpentThisRound + tradeGoods }
    return { ok: true, value: scoreObjective({ ...state, players }, seat, objectiveId) }
  }
  const paid = spend.kind === 'resources'
    ? payCost(state, seat, spend.amount, planets, tradeGoods)
    : payInfluence(state, seat, spend.amount, planets, tradeGoods)
  if (!paid.ok) return paid
  return { ok: true, value: scoreObjective(paid.value, seat, objectiveId) }
}

export function addVp(state: GameState, seat: Seat, points: number, reason: string): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], vp: players[seat].vp + points }
  const next: GameState = { ...state, players, log: [...state.log, { t: 'info', text: `seat ${seat} scores ${points} VP: ${reason}` }] }
  if (state.phase !== 'status' && players[seat].vp >= 10 && next.winner === null) {
    return { ...next, phase: 'ended', winner: seat }
  }
  return next
}

/** R7: records the objective and adds its victory points. Fulfilment is checked by the caller. */
export function scoreObjective(state: GameState, seat: Seat, objectiveId: string): GameState {
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = { ...player, scoredObjectives: [...player.scoredObjectives, objectiveId] }
  const def = objectiveDef(objectiveId)
  const points = def?.points ?? 1
  return addVp({ ...state, players }, seat, points, def?.text ?? objectiveId)
}
