import { NON_FIGHTER_SHIPS, unitStats, type StatsOwner } from '../data/units'
import { checkFleet } from '../engine/board'
import { cheapestPlanets, fleetPoolLimit, productionCost, productionLimit, readyResources } from '../engine/economy'
import { movableShips, pathLength } from '../engine/movement'
import type { GameState, Seat, Unit, UnitType } from '../engine/types'

export type MoveShipSpec = { unitId: number; from: string; carrying: number[] }
export type ProducePlan = { units: Partial<Record<UnitType, number>>; planets: string[]; tradeGoods: number }

/**
 * Fill the `moveShips` template (legalMoves offers it with an empty `moves` array) with a concrete plan:
 * move the seat's ships that can reach the active system, carrying fighters and infantry when a ship has
 * capacity, without breaking the fleet pool at the destination.
 */
export function fillMoveShips(state: GameState, seat: Seat): MoveShipSpec[] {
  const tac = state.tactical
  if (!tac || tac.step !== 'movement') return []
  const stats: StatsOwner = { faction: state.players[seat].faction, techs: state.players[seat].techs }
  const dest = state.systems[tac.systemId]
  const existing = dest.space.filter(u => u.owner === seat && NON_FIGHTER_SHIPS.includes(u.type)).length
  const fleetRoom = fleetPoolLimit(state.players[seat]) - existing
  const moves: MoveShipSpec[] = []
  let nonFighters = 0
  let movedIds = new Set<number>()
  const candidates = movableShips(state, seat)
  const destId = tac.systemId
  // Which candidates are genuine top-level movers, mirroring the engine's own reachability check
  // (movement.ts): a Fighter I cannot move on its own, and Gravity Drive helps only ONE ship per activation,
  // so a batch must not assume every gravity-teched ship gets the bonus — the second such ship is rejected.
  const player = state.players[seat]
  const hasGravityDrive = player.techs.includes('gravity_drive')
  let gravityUsed = false
  const selfMoving = new Set<number>()
  for (const { unitId, from } of candidates) {
    const src = state.systems[from]
    const ship = src?.space.find(u => u.id === unitId)
    if (!ship) continue
    const base = unitStats(ship.type, stats).move
    if (base < 1) continue // Fighter I: cargo only, never a mover
    const reaches = pathLength(state, seat, from, destId, base) !== null
    if (reaches) { selfMoving.add(unitId); continue }
    if (hasGravityDrive && !gravityUsed && pathLength(state, seat, from, destId, base + 1) !== null) {
      selfMoving.add(unitId)
      gravityUsed = true
    }
  }
  for (const { unitId, from } of candidates) {
    const src = state.systems[from]
    if (!src) continue
    const ship = src.space.find(u => u.id === unitId)
    if (!ship) continue
    // a Fighter I cannot move on its own; it is only ever cargo on a carrier, so it is not a mover here
    if (!selfMoving.has(unitId)) continue
    const isNonFighter = NON_FIGHTER_SHIPS.includes(ship.type)
    if (isNonFighter && nonFighters >= fleetRoom) continue
    const s = unitStats(ship.type, stats)
    const carrying: number[] = []
    if (s.capacity > 0) {
      const room = s.capacity
      // fighters in the source are cargo only if they are not themselves moving on their own (Fighter II)
      for (const f of src.space) {
        if (carrying.length >= room) break
        if (f.owner === seat && f.type === 'fighter' && !selfMoving.has(f.id) && !movedIds.has(f.id)) carrying.push(f.id)
      }
      for (const p of src.planets) {
        if (carrying.length >= room) break
        for (const g of p.ground) {
          if (carrying.length >= room) break
          if (g.owner === seat && g.type === 'infantry' && !movedIds.has(g.id)) carrying.push(g.id)
        }
      }
    }
    moves.push({ unitId, from, carrying })
    movedIds.add(unitId)
    for (const c of carrying) movedIds.add(c)
    if (isNonFighter) nonFighters++
  }
  return trimToFleet(state, seat, destId, moves)
}

/**
 * The fleet-pool accounting in the filler is a good heuristic, but the authority is the engine's `checkFleet`,
 * which also folds in capacity overage (excess fighters/infantry that arrive and cannot be carried once the
 * destination's combined capacity is tallied) and free fighter slots. Rather than reinvent that math, validate
 * the reconstructed destination and trim until it passes: first drop carried cargo, then non-fighter movers.
 */
function trimToFleet(state: GameState, seat: Seat, destId: string, moves: MoveShipSpec[]): MoveShipSpec[] {
  const passes = (specs: MoveShipSpec[]): boolean => {
    let id = 100000
    const space: Unit[] = []
    for (const m of specs) {
      const src = state.systems[m.from]
      const ship = src?.space.find(u => u.id === m.unitId)
      if (!ship) continue
      space.push({ id: id++, type: ship.type, owner: seat, damaged: false })
      for (const cid of m.carrying) {
        let type: UnitType | undefined
        const passengers = src ? [src.space, ...src.planets.map(p => p.ground)] : []
        for (const list of passengers) {
          const u = list.find(u => u.id === cid)
          if (u) { type = u.type as UnitType; break }
        }
        if (type) space.push({ id: id++, type, owner: seat, damaged: false })
      }
    }
    const dest = state.systems[destId]
    const probe: GameState = { ...state, systems: { ...state.systems, [destId]: { ...dest, space: [...dest.space, ...space] } } }
    return checkFleet(probe, seat, destId).ok
  }
  let out = moves
  let prev = ''
  let guard = 0
  while (guard++ < 200 && JSON.stringify(out) !== prev) {
    prev = JSON.stringify(out)
    if (passes(out)) break
    const withCargo = out.find(m => m.carrying.length > 0)
    if (withCargo) {
      out = out.map(m => (m === withCargo ? { ...m, carrying: m.carrying.slice(0, m.carrying.length - 1) } : m))
      continue
    }
    out = out.slice(0, out.length - 1)
  }
  return out
}

/**
 * Fill the `produce` template with a concrete order the seat can actually pay for from its ready planets and
 * trade goods. Prefers the ship that strengthens the fleet when there is fleet-pool headroom, otherwise leans
 * on infantry and fighters, which build up cheaply.
 */
export function fillProduce(state: GameState, seat: Seat, systemId: string): ProducePlan {
  const player = state.players[seat]
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  const dest = state.systems[systemId]
  const existing = dest.space.filter(u => u.owner === seat && NON_FIGHTER_SHIPS.includes(u.type)).length
  const fleetRoom = fleetPoolLimit(player) - existing
  const budget = readyResources(state, seat) + player.tradeGoods
  const limit = Math.min(productionLimit(state, seat, systemId), budget)

  const units: Partial<Record<UnitType, number>> = {}
  if (limit >= 4 && fleetRoom > 0 && player.reinforcements.destroyer > 0) {
    units.destroyer = 1
  } else if (limit >= 2 && player.reinforcements.infantry >= 2) {
    units.infantry = 2
  }
  if (units.destroyer === undefined && units.infantry === undefined) return { units, planets: [], tradeGoods: 0 }
  const cost = productionCost(units, stats, player.techs.includes('sarween_tools'))
  const planets = cheapestPlanets(state, seat, cost) ?? []
  let tradeGoods = 0
  const need = cost - readyResources(state, seat)
  if (need > 0) tradeGoods = Math.min(need, player.tradeGoods)
  return { units, planets, tradeGoods }
}
