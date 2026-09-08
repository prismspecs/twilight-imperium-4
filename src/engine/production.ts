import { isShip, type StatsOwner } from '../data/units'
import { checkFleet, maxFightersAllowed } from './board'
import { payCost, productionCost, productionLimit } from './economy'
import { unitsOf } from './setup'
import type { GameState, Result, Seat, Unit, UnitType } from './types'

export const PRODUCIBLE: readonly UnitType[] = ['infantry', 'fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship']

/** R14.1: a dock (or any unit with PRODUCTION) is blockaded when the system holds another player's ships
 * and none of the seat's own - a blockaded unit may still produce ground forces, just not ships. */
export function isBlockaded(state: GameState, seat: Seat, systemId: string): boolean {
  const space = state.systems[systemId].space
  return space.some(u => u.owner !== seat && isShip(u.type)) && !space.some(u => u.owner === seat && isShip(u.type))
}

export function produce(state: GameState, units: Partial<Record<UnitType, number>>, planets: string[], tradeGoods: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'production') return { ok: false, error: 'not in the production step' }
  const seat = state.active
  const player = state.players[seat]
  const dockPlanet = state.systems[tac.systemId].planets.find(p => p.structures.some(u => u.type === 'spacedock' && u.owner === seat))
  if (!dockPlanet) return { ok: false, error: 'R4.4: no space dock of your own in the active system' }
  const blockaded = isBlockaded(state, seat, tac.systemId)
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
    if (n === 0) continue
    if (n < 0 || !Number.isInteger(n)) return { ok: false, error: `invalid count for ${type}` }
    if (!PRODUCIBLE.includes(type)) return { ok: false, error: `R4.4: ${type} cannot be produced` }
    if (blockaded && isShip(type)) return { ok: false, error: 'R14.1: this dock is blockaded by another player\'s ships — it can still produce ground forces' }
  }
  // R4.4: fighters above the capacity plus the dock's (I or II) free slots are simply not produced. The new
  // non-fighter ships in this same order pool their capacity too, so they count toward the room before trimming.
  const wanted = units.fighter ?? 0
  const extraShips: Unit[] = (Object.entries(units) as [UnitType, number][])
    .filter(([type, n]) => n > 0 && type !== 'fighter' && type !== 'infantry')
    .flatMap(([type, n]) => Array.from({ length: n }, (): Unit => ({ id: -1, type, owner: seat, damaged: false })))
  const room = maxFightersAllowed(state, seat, tac.systemId, extraShips)
  const trimmedFighters = Math.max(0, wanted - room)
  const order: Partial<Record<UnitType, number>> = trimmedFighters ? { ...units, fighter: Math.min(wanted, room) } : units
  const entries = (Object.entries(order) as [UnitType, number][]).filter(([, n]) => n > 0)
  if (!entries.length) return { ok: false, error: 'nothing to produce' }
  // the reinforcements are checked against the trimmed order: fighters that are not produced anyway must not
  // reject an order the fleet could otherwise take.
  for (const [type, n] of entries) {
    if (player.reinforcements[type] < n) return { ok: false, error: `not enough ${type} in the reinforcements` }
  }
  const flagships = order.flagship ?? 0
  if (flagships > 1 || (flagships === 1 && unitsOf(state, seat).some(u => u.type === 'flagship'))) {
    return { ok: false, error: 'R4.4: only one flagship at a time' }
  }
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  const limit = productionLimit(state, seat, tac.systemId)
  if (total > limit) return { ok: false, error: `R4.4: production limit ${limit} exceeded by ${total} units` }
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  const cost = productionCost(order, stats, player.techs.includes('sarween_tools'))
  const paid = payCost(state, seat, cost, planets, tradeGoods)
  if (!paid.ok) return paid
  let nextId = paid.value.nextUnitId
  const ships: Unit[] = []
  const ground: Unit[] = []
  const players = [...paid.value.players] as GameState['players']
  let me = players[seat]
  for (const [type, n] of entries) {
    for (let i = 0; i < n; i++) {
      const unit: Unit = { id: nextId++, type, owner: seat, damaged: false }
      if (type === 'infantry') ground.push(unit); else ships.push(unit)
    }
    me = { ...me, reinforcements: { ...me.reinforcements, [type]: me.reinforcements[type] - n } }
  }
  players[seat] = me
  const sys = paid.value.systems[tac.systemId]
  const log = [...paid.value.log, { t: 'info' as const, text: `seat ${seat} produces ${total} units for ${cost}` }]
  if (trimmedFighters) log.push({ t: 'info' as const, text: `${trimmedFighters} fighters exceed the capacity and are not produced` })
  const next: GameState = {
    ...paid.value, players, nextUnitId: nextId, log,
    systems: {
      ...paid.value.systems,
      [tac.systemId]: {
        ...sys,
        space: [...sys.space, ...ships],
        planets: sys.planets.map(p => p.id === dockPlanet.id ? { ...p, ground: [...p.ground, ...ground] } : p),
      },
    },
  }
  const fleet = checkFleet(next, seat, tac.systemId)
  if (!fleet.ok) return { ok: false, error: fleet.error }
  return { ok: true, value: { ...next, tactical: { ...tac, step: 'done' } } }
}
