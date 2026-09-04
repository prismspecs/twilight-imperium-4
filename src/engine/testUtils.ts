import type { PostId } from '../data/posts'
import { unitStats } from '../data/units'
import { assignmentComplete, assignmentTargets } from './combat'
import { capacity, cheapestPlanets, fleetPoolLimit, nonFighterShips, productionCost } from './economy'
import { applyMove } from './index'
import { movableShips } from './movement'
import { createGame } from './setup'
import type { GameConfig, GameState, Move, Owner, Player, Seat, StrategyCardId, TacticalContext, Unit, UnitType } from './types'

export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || Array.isArray(value)) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

export const DUEL_CONFIG: GameConfig = {
  players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }],
  speaker: 0,
}

/** A new game plus the whole snake draft, so the state sits in the action phase with `active` to hand. */
export function toActionPhase(seed = 1, active: Seat = 0): GameState {
  let s = createGame(DUEL_CONFIG, seed)
  for (const card of ['warfare', 'leadership', 'imperial', 'technology'] as StrategyCardId[]) {
    const r = applyMove(s, { type: 'pickStrategyCard', card }, 0)
    if (!r.ok) throw new Error(r.error)
    s = r.value
  }
  return deepFreeze({ ...s, active })
}

/** Places units in a system (in space, or on a planet when planetId is given) and takes them out of the reinforcements. */
export function withUnits(state: GameState, systemId: string, owner: Owner, types: UnitType[], planetId?: string): GameState {
  let nextId = state.nextUnitId
  const sys = state.systems[systemId]
  const made: Unit[] = types.map(type => ({ id: nextId++, type, owner, damaged: false }))
  const players = [...state.players] as GameState['players']
  if (owner !== 'guardian') {
    const p = players[owner]
    const reinforcements = { ...p.reinforcements }
    for (const type of types) reinforcements[type] = Math.max(0, reinforcements[type] - 1)
    players[owner] = { ...p, reinforcements }
  }
  const planets = sys.planets.map(p => p.id !== planetId ? p : {
    ...p,
    ground: [...p.ground, ...made.filter(u => u.type === 'infantry')],
    structures: [...p.structures, ...made.filter(u => u.type !== 'infantry')],
  })
  return deepFreeze({
    ...state, players, nextUnitId: nextId,
    systems: { ...state.systems, [systemId]: { ...sys, space: planetId ? sys.space : [...sys.space, ...made], planets } },
  })
}

/** R8: forces the pair of trade posts in play, so a test does not depend on what the seed happened to roll. */
export function withPosts(state: GameState, west: PostId, east: PostId): GameState {
  return deepFreeze({ ...state, posts: { west, east }, postAbilityUsed: { west: false, east: false } })
}

export function withTechs(state: GameState, seat: Seat, techs: string[]): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], techs: [...players[seat].techs, ...techs] }
  return deepFreeze({ ...state, players })
}

export function withPlayer(state: GameState, seat: Seat, patch: Partial<Player>): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], ...patch }
  return deepFreeze({ ...state, players })
}

/** A minimal third seat for exercising N-player plumbing on the two-player map. */
export function thirdSeat(): Player {
  return {
    seat: 2, faction: 'l1z1x', color: 'green', name: 'C', vp: 0,
    tokens: { tactic: 3, fleet: 3, strategy: 2 }, tradeGoods: 0, commodities: 2, techs: [],
    strategyCards: [], passed: false, scoredObjectives: [], scoredMandates: [],
    resourcesSpentThisRound: 0, influenceSpentThisRound: 0, tradeGoodsSpentThisRound: 0, tokensSpentThisRound: 0,
    spaceCombatWins: 0, trades: 0, tradedThisRound: { west: false, east: false },
    inheritanceExhausted: false, shipyardUsed: false, pendingInfantry: 0,
    reinforcements: { infantry: 12, fighter: 10, destroyer: 8, cruiser: 8, carrier: 4, dreadnought: 5, warsun: 2, flagship: 1, pds: 6, spacedock: 3 },
  }
}

/** Appends the minimal third seat to a two-player state for N-player plumbing tests. */
export function withThirdSeat(state: GameState): GameState {
  return deepFreeze({ ...state, players: [...state.players, thirdSeat()] })
}

export function withTactical(state: GameState, tactical: TacticalContext | null): GameState {
  return deepFreeze({ ...state, tactical })
}

/** Replaces the seat's strategy cards, all unused. */
export function withCards(state: GameState, seat: Seat, cards: StrategyCardId[]): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], strategyCards: cards.map(id => ({ id, used: false })) }
  return deepFreeze({ ...state, players })
}

export function withExhausted(state: GameState, planetIds: string[], exhausted = true): GameState {
  const systems = Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
    ...sys, planets: sys.planets.map(p => planetIds.includes(p.id) ? { ...p, exhausted } : p),
  }]))
  return deepFreeze({ ...state, systems })
}

export function withPlanetOwner(state: GameState, systemId: string, planetId: string, owner: Seat | null): GameState {
  const sys = state.systems[systemId]
  return deepFreeze({
    ...state,
    systems: { ...state.systems, [systemId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, owner } : p) } },
  })
}

export function cardsUsed(state: GameState): GameState {
  return deepFreeze({
    ...state,
    players: state.players.map(p => ({ ...p, strategyCards: p.strategyCards.map(c => ({ ...c, used: true })) })) as GameState['players'],
  })
}

export function shipId(state: GameState, systemId: string, type: UnitType, owner: Owner = 0): number {
  const unit = state.systems[systemId].space.find(u => u.type === type && u.owner === owner)
  if (!unit) throw new Error(`no ${type} of ${String(owner)} in ${systemId}`)
  return unit.id
}

export function groundIds(state: GameState, systemId: string, planetId: string, owner: Owner = 0): number[] {
  return state.systems[systemId].planets
    .filter(p => p.id === planetId)
    .flatMap(p => p.ground.filter(u => u.owner === owner).map(u => u.id))
}

export function carriedIds(state: GameState, systemId: string, owner: Owner = 0): number[] {
  return state.systems[systemId].space.filter(u => u.owner === owner && u.type === 'infantry').map(u => u.id)
}

/** Puts a state into the status phase the way `pass` does: speaker first, nothing else running. */
export function toStatusPhase(state: GameState): GameState {
  return deepFreeze({ ...state, phase: 'status' as const, tactical: null, pendingSecondary: null, statusSubmitted: [], active: state.speaker })
}

export function hitsIn(state: GameState, context: string): number {
  return state.log.flatMap(e => e.t === 'roll' && e.context === context ? e.rolls : []).filter(r => r.hit).length
}

export function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * Turns a template move into a concrete one; falls back to the closing move of the step. Only `moveShips`
 * and `produce` need this, every other enumerated move already carries usable parameters. `assignHits` is
 * re-picked rather than filled in: the enumerator offers one complete answer, and a driver that always played
 * that one would never prove another legal answer is accepted.
 */
export function fillTemplate(state: GameState, move: Move, rng: () => number): Move {
  if (move.type === 'assignHits') {
    // R4.1 step 4: destroy ships until the batch is covered, never sustain; the offered pick is the fallback
    const destroy: number[] = []
    for (const unit of assignmentTargets(state).destroy) {
      if (assignmentComplete(state, destroy, [])) break
      destroy.push(unit.id)
    }
    return assignmentComplete(state, destroy, []) ? { type: 'assignHits', destroy, sustain: [] } : move
  }
  const tac = state.tactical
  const seat = state.active
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  if (move.type === 'moveShips') {
    if (!tac) return { type: 'endMovement' }
    const dest = state.systems[tac.systemId]
    const mineThere = dest.space.filter(u => u.owner === seat)
    const room = fleetPoolLimit(player) - nonFighterShips(dest.space, seat)
    for (const option of shuffle(movableShips(state, seat), rng)) {
      const ship = state.systems[option.from].space.find(u => u.id === option.unitId)
      if (!ship || ship.type === 'fighter' || room < 1) continue
      const free = capacity([...mineThere, ship], seat, stats) - mineThere.filter(u => u.type === 'infantry' || u.type === 'fighter').length
      const slots = Math.max(0, Math.min(free, unitStats(ship.type, stats).capacity))
      const cargo = state.systems[option.from].planets.flatMap(p => p.ground.filter(u => u.owner === seat)).slice(0, slots).map(u => u.id)
      return { type: 'moveShips', moves: [{ unitId: option.unitId, from: option.from, carrying: cargo }] }
    }
    return { type: 'endMovement' }
  }
  if (move.type === 'produce') {
    if (player.reinforcements.infantry < 1) return { type: 'endTactical' }
    const cost = productionCost({ infantry: 1 }, stats, player.techs.includes('sarween_tools'))
    const planets = cheapestPlanets(state, seat, cost)
    if (!planets) return { type: 'endTactical' }
    return { type: 'produce', units: { infantry: 1 }, planets, tradeGoods: 0 }
  }
  return move
}
