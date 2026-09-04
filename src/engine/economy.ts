import { NON_FIGHTER_SHIPS, isShip, unitStats, type StatsOwner } from '../data/units'
import type { GameState, Owner, Player, Result, Seat, Unit, UnitType } from './types'

export function readyResources(state: GameState, seat: Seat): number {
  let sum = 0
  for (const sys of Object.values(state.systems)) for (const p of sys.planets) if (p.owner === seat && !p.exhausted) sum += p.resources
  return sum
}

export function readyInfluence(state: GameState, seat: Seat): number {
  let sum = 0
  for (const sys of Object.values(state.systems)) for (const p of sys.planets) if (p.owner === seat && !p.exhausted) sum += p.influence
  return sum
}

/** Exhausts the listed ready planets of the seat and reports what they were worth. */
export function exhaustPlanets(state: GameState, seat: Seat, planets: string[]): Result<{ state: GameState; resources: number; influence: number }> {
  let resources = 0
  let influence = 0
  const systems = { ...state.systems }
  for (const planetId of planets) {
    const sysId = Object.keys(systems).find(id => systems[id].planets.some(p => p.id === planetId))
    if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
    const sys = systems[sysId]
    const planet = sys.planets.find(p => p.id === planetId)
    if (!planet || planet.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
    if (planet.exhausted) return { ok: false, error: `planet ${planetId} is exhausted` }
    resources += planet.resources
    influence += planet.influence
    systems[sysId] = { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, exhausted: true } : p) }
  }
  return { ok: true, value: { state: { ...state, systems }, resources, influence } }
}

export function payCost(state: GameState, seat: Seat, cost: number, planets: string[], tradeGoods: number): Result<GameState> {
  const player = state.players[seat]
  // the count comes straight out of a move, so it is checked for shape before it is compared: `NaN` passes
  // every `<` and `>`, and a numeric string turns the addition below into string concatenation
  if (!Number.isInteger(tradeGoods)) return { ok: false, error: 'the trade good count must be a whole number' }
  if (tradeGoods < 0 || tradeGoods > player.tradeGoods) return { ok: false, error: 'not enough trade goods' }
  const spent = exhaustPlanets(state, seat, planets)
  if (!spent.ok) return spent
  const paid = tradeGoods + spent.value.resources
  if (paid < cost) return { ok: false, error: `paid ${paid} of ${cost}` }
  const players = [...spent.value.state.players] as GameState['players']
  // R7: the "spend 6 resources in a single round" objective counts what the payment actually cost, so an
  // overpaid planet does not inflate it
  const me = spent.value.state.players[seat]
  const resourcesPaid = Math.max(0, cost - tradeGoods)
  players[seat] = {
    ...me, tradeGoods: me.tradeGoods - tradeGoods,
    resourcesSpentThisRound: me.resourcesSpentThisRound + resourcesPaid,
    tradeGoodsSpentThisRound: me.tradeGoodsSpentThisRound + tradeGoods,
  }
  return { ok: true, value: { ...spent.value.state, players } }
}

const TOKEN_POOLS = ['tactic', 'fleet', 'strategy'] as const

/**
 * R3.3 and R6: `wanted` is the resulting command sheet. The three pools must sum to the current total
 * plus `gained`, and without `redistribute` no pool may shrink, because Leadership and the status phase hand
 * out new tokens and only Warfare moves the ones already on the sheet. Undefined means "all into tactic".
 */
export function distributeTokens(state: GameState, seat: Seat, wanted: Player['tokens'] | undefined, gained: number, redistribute = false): Result<GameState> {
  const current = state.players[seat].tokens
  const target = wanted ?? { ...current, tactic: current.tactic + gained }
  for (const pool of TOKEN_POOLS) {
    if (!Number.isInteger(target[pool]) || target[pool] < 0) return { ok: false, error: `invalid token count for the ${pool} pool` }
    if (!redistribute && target[pool] < current[pool]) return { ok: false, error: `the ${pool} pool may not shrink here` }
  }
  const total = TOKEN_POOLS.reduce((sum, pool) => sum + target[pool], 0)
  if (total !== current.tactic + current.fleet + current.strategy + gained) return { ok: false, error: `distribute exactly ${gained} new command tokens` }
  const players = [...state.players] as GameState['players']
  // `target` may be the caller's own `params.tokens` object, so the sheet goes into the state as a copy
  players[seat] = { ...players[seat], tokens: { ...target } }
  return { ok: true, value: { ...state, players } }
}

export function productionCost(units: Partial<Record<UnitType, number>>, owner: StatsOwner, sarween: boolean): number {
  let cost = 0
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
    if (!n) continue
    const s = unitStats(type, owner)
    cost += Math.ceil(n / s.producedPerCost) * s.cost
  }
  return sarween ? Math.max(0, cost - 1) : cost
}

export function productionLimit(state: GameState, seat: Seat, systemId: string): number {
  const player = state.players[seat]
  const sys = state.systems[systemId]
  if (!sys) return 0
  for (const p of sys.planets) {
    const dock = p.structures.find(u => u.type === 'spacedock' && u.owner === seat)
    if (dock) return p.resources + (unitStats('spacedock', { faction: player.faction, techs: player.techs }).production ?? 0)
  }
  return 0
}

export function fleetPoolLimit(player: Player): number {
  return player.tokens.fleet + (player.faction === 'letnev' ? 2 : 0)
}

export function nonFighterShips(units: Unit[], owner: Owner): number {
  return units.filter(u => u.owner === owner && NON_FIGHTER_SHIPS.includes(u.type)).length
}

export function capacity(units: Unit[], owner: Owner, stats: StatsOwner): number {
  return units.filter(u => u.owner === owner && isShip(u.type)).reduce((sum, u) => sum + unitStats(u.type, stats).capacity, 0)
}

/**
 * The cheapest set of ready planets of the seat that covers `cost`: least total resources, then fewest
 * planets, then map order. Used where a move carries no payment parameters (R6 Inheritance Systems) and by
 * the enumerator to build payable templates. Seven systems means at most nine planets, so the exact search
 * over all subsets is cheap and deterministic.
 */
export function cheapestPlanets(state: GameState, seat: Seat, cost: number): string[] | null {
  if (cost <= 0) return []
  const ready: { id: string; resources: number }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat && !p.exhausted) ready.push({ id: p.id, resources: p.resources })
  }
  let best: { ids: string[]; total: number } | null = null
  for (let mask = 1; mask < 1 << ready.length; mask++) {
    let total = 0
    const ids: string[] = []
    for (let i = 0; i < ready.length; i++) if (mask & (1 << i)) { total += ready[i].resources; ids.push(ready[i].id) }
    if (total < cost) continue
    if (!best || total < best.total || (total === best.total && ids.length < best.ids.length)) best = { ids, total }
  }
  return best ? best.ids : null
}
