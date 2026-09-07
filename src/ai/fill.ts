import { NON_FIGHTER_SHIPS, unitStats, type StatsOwner } from '../data/units'
import { readyInfluencePlanets } from '../engine/agendas'
import { checkFleet, maxFightersAllowed } from '../engine/board'
import { cheapestInfluencePlanets, fleetPoolLimit, productionCost, productionLimit, readyResources } from '../engine/economy'
import { movableShips, pathLength } from '../engine/movement'
import { tokensGained } from '../engine/statusPhase'
import type { GameState, Player, Seat, Unit, UnitType } from '../engine/types'
import { getFactionUnitAffinity, getTargetFleetTokens } from './calibrationData'

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
  const needsGroundForces = dest.planets.some(p => p.owner !== seat)
  const candidateList = [...candidates]
  if (needsGroundForces) {
    candidateList.sort((a, b) => {
      const shipA = state.systems[a.from]?.space.find(u => u.id === a.unitId)
      const shipB = state.systems[b.from]?.space.find(u => u.id === b.unitId)
      const capA = shipA ? unitStats(shipA.type, stats).capacity : 0
      const capB = shipB ? unitStats(shipB.type, stats).capacity : 0
      return capB - capA
    })
  }
  for (const { unitId, from } of candidateList) {
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
      if (needsGroundForces) {
        // Prioritize ground forces first so the AI can colonize/invade planets
        for (const p of src.planets) {
          if (carrying.length >= room) break
          for (const g of p.ground) {
            if (carrying.length >= room) break
            if (g.owner === seat && g.type === 'infantry' && !movedIds.has(g.id)) carrying.push(g.id)
          }
        }
        for (const f of src.space) {
          if (carrying.length >= room) break
          if (f.owner === seat && f.type === 'fighter' && !selfMoving.has(f.id) && !movedIds.has(f.id)) carrying.push(f.id)
        }
      } else {
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
 * trade goods. Calibrated against AsyncTI4 competitive play: builds capital ships (Dreadnoughts, Carriers),
 * planetary garrisons (infantry), screens (fighters, destroyers), and fulfills active economic objectives.
 */
export function fillProduce(state: GameState, seat: Seat, systemId: string): ProducePlan {
  const player = state.players[seat]
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  const dest = state.systems[systemId]
  const existingNonFighters = dest.space.filter(u => u.owner === seat && NON_FIGHTER_SHIPS.includes(u.type)).length
  let remainingFleetRoom = fleetPoolLimit(player) - existingNonFighters
  const budget = readyResources(state, seat) + player.tradeGoods
  const maxLimit = productionLimit(state, seat, systemId)
  let remainingUnitsCount = maxLimit
  const hasSarween = player.techs.includes('sarween_tools')

  const units: Partial<Record<UnitType, number>> = {}
  const remainingPlastic = { ...player.reinforcements }

  const canAffordWith = (candidate: Partial<Record<UnitType, number>>): boolean => {
    const totalCount = Object.values(candidate).reduce((sum, n) => (sum ?? 0) + (n ?? 0), 0) ?? 0
    if (totalCount > maxLimit) return false
    const cost = productionCost(candidate, stats, hasSarween)
    if (cost > budget) return false

    // Check fighter capacity using engine's maxFightersAllowed
    const extraShips: Unit[] = (Object.entries(candidate) as [UnitType, number][])
      .filter(([type, n]) => (n ?? 0) > 0 && type !== 'fighter' && type !== 'infantry')
      .flatMap(([type, n]) => Array.from({ length: n ?? 0 }, (): Unit => ({ id: -1, type, owner: seat, damaged: false })))
    const fighterRoom = maxFightersAllowed(state, seat, systemId, extraShips)
    if ((candidate.fighter ?? 0) > fighterRoom) return false

    // Verify checkFleet passes
    const probeShips: Unit[] = (Object.entries(candidate) as [UnitType, number][])
      .filter(([type, n]) => (n ?? 0) > 0 && type !== 'infantry')
      .flatMap(([type, n]) => Array.from({ length: n ?? 0 }, (): Unit => ({ id: -1, type, owner: seat, damaged: false })))
    const probeState: GameState = {
      ...state,
      systems: {
        ...state.systems,
        [systemId]: {
          ...dest,
          space: [...dest.space, ...probeShips],
        },
      },
    }
    if (!checkFleet(probeState, seat, systemId).ok) return false

    return true
  }

  const tryAdd = (type: UnitType, count: number): boolean => {
    if ((remainingPlastic[type] ?? 0) < count) return false
    if (remainingUnitsCount < count) return false
    const isNonFighter = NON_FIGHTER_SHIPS.includes(type)
    if (isNonFighter && remainingFleetRoom < count) return false

    const nextUnits = { ...units, [type]: (units[type] ?? 0) + count }
    if (!canAffordWith(nextUnits)) return false

    units[type] = (units[type] ?? 0) + count
    remainingPlastic[type] = (remainingPlastic[type] ?? 0) - count
    remainingUnitsCount -= count
    if (isNonFighter) remainingFleetRoom -= count
    return true
  }

  // 1. Planetary Garrison: ensure at least 2 infantry on own planets in system
  const localInfantry = dest.planets
    .filter(p => p.owner === seat)
    .reduce((sum, p) => sum + p.ground.filter(g => g.owner === seat && g.type === 'infantry').length, 0)
  if (localInfantry < 2) {
    tryAdd('infantry', 2)
  }

  // 2. Capital Ships / Carrier transport:
  const existingCarriers = dest.space.filter(u => u.owner === seat && u.type === 'carrier').length
  const carrierAffinity = getFactionUnitAffinity(player.faction, 'carrier')
  const dreadAffinity = getFactionUnitAffinity(player.faction, 'dreadnought')
  const cruiserAffinity = getFactionUnitAffinity(player.faction, 'cruiser')

  if (dreadAffinity >= 1.4) {
    tryAdd('dreadnought', 1)
    if (existingCarriers === 0) tryAdd('carrier', 1)
  } else if (carrierAffinity >= 1.4 || existingCarriers === 0) {
    tryAdd('carrier', 1)
    tryAdd('dreadnought', 1)
  } else if (cruiserAffinity >= 1.4) {
    tryAdd('cruiser', 1)
    tryAdd('cruiser', 1)
  } else {
    tryAdd('dreadnought', 1)
  }

  // 3. Objective Synergies:
  const needsSpend8 = state.publicObjectives.includes('erect_a_monument') && !player.scoredObjectives.includes('erect_a_monument')
  const needsSpend6 = state.publicObjectives.includes('spend_6_resources') && !player.scoredObjectives.includes('spend_6_resources')
  if (needsSpend8 || needsSpend6) {
    tryAdd('dreadnought', 1)
    tryAdd('carrier', 1)
    tryAdd('cruiser', 1)
  }

  // 4. Fill remaining production limit and budget with fighters and infantry
  let tries = 0
  while (remainingUnitsCount >= 2 && tries++ < 4) {
    const addedFighters = tryAdd('fighter', 2)
    const addedInfantry = tryAdd('infantry', 2)
    if (!addedFighters && !addedInfantry) break
  }

  // 5. If odd capacity / fleet room and single resource remains, try destroyer
  if (remainingUnitsCount >= 1 && remainingFleetRoom >= 1) {
    const destroyerAffinity = getFactionUnitAffinity(player.faction, 'destroyer')
    if (destroyerAffinity >= 1.0) {
      tryAdd('destroyer', 1)
    }
  }

  // Fallback if nothing could be added above (e.g. tight budget)
  if (Object.keys(units).length === 0) {
    if (remainingUnitsCount >= 1 && remainingFleetRoom > 0 && (remainingPlastic.destroyer ?? 0) > 0) {
      tryAdd('destroyer', 1)
    }
    if (Object.keys(units).length === 0 && remainingUnitsCount >= 2 && (remainingPlastic.infantry ?? 0) >= 2) {
      tryAdd('infantry', 2)
    }
  }

  if (Object.keys(units).length === 0) {
    return { units: {}, planets: [], tradeGoods: 0 }
  }

  const cost = productionCost(units, stats, hasSarween)
  const payment = findCheapestPayment(state, seat, cost)
  if (!payment) return { units: {}, planets: [], tradeGoods: 0 }
  return { units, planets: payment.planets, tradeGoods: payment.tradeGoods }
}

/** The cheapest set of ready planets and trade goods that legally covers `cost`. */
function findCheapestPayment(state: GameState, seat: Seat, cost: number): { planets: string[]; tradeGoods: number } | null {
  if (cost <= 0) return { planets: [], tradeGoods: 0 }
  const ready: { id: string; resources: number }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat && !p.exhausted && p.resources > 0) ready.push({ id: p.id, resources: p.resources })
  }
  const tg = state.players[seat].tradeGoods
  let best: { planets: string[]; tradeGoods: number; total: number } | null = null
  for (let mask = 0; mask < (1 << ready.length); mask++) {
    let res = 0
    const ids: string[] = []
    for (let i = 0; i < ready.length; i++) {
      if (mask & (1 << i)) {
        res += ready[i].resources
        ids.push(ready[i].id)
      }
    }
    const neededTg = Math.max(0, cost - res)
    if (neededTg > tg) continue
    const total = res + neededTg
    if (!best || total < best.total || (total === best.total && (neededTg < best.tradeGoods || (neededTg === best.tradeGoods && ids.length < best.planets.length)))) {
      best = { planets: ids, tradeGoods: neededTg, total }
    }
  }
  return best ? { planets: best.planets, tradeGoods: best.tradeGoods } : null
}

/**
 * R10: which planets to exhaust for influence behind a vote. `agendaMoves` already suggests every ready
 * planet (the maximal vote); naive AI play commits only the cheapest planet that covers 1 influence, rather
 * than always maxing out, so a stronger vote is left for later tuning of which outcome to actually favor.
 */
export function fillCastVote(state: GameState, seat: Seat): string[] {
  if (readyInfluencePlanets(state, seat).length === 0) return []
  return cheapestInfluencePlanets(state, seat, 1)?.planets ?? []
}

/**
 * Distribute gained command tokens in the status phase using empirical targets from AsyncTI4 winners.
 * Allocates tokens to the fleet pool when below the faction's target, ensures a buffer for strategy,
 * and feeds the remaining tokens into tactic.
 */
export function fillStatusTokens(state: GameState, seat: Seat): Player['tokens'] {
  const current = state.players[seat].tokens
  const gained = tokensGained(state, seat)
  const targetFleet = getTargetFleetTokens(state.players[seat].faction)

  let toFleet = 0
  let toStrategy = 0
  let toTactic = 0

  let remaining = gained

  // 1. If fleet is below empirical target, allocate up to 2 tokens to fleet
  if (current.fleet < targetFleet && remaining > 0) {
    const deficit = targetFleet - current.fleet
    toFleet = Math.min(remaining, Math.min(2, deficit))
    remaining -= toFleet
  }

  // 2. If strategy tokens are low (< 2), allocate 1 token to strategy
  if (current.strategy < 2 && remaining > 0) {
    toStrategy = 1
    remaining -= 1
  }

  // 3. Remainder goes to tactic
  toTactic = remaining

  return {
    tactic: current.tactic + toTactic,
    fleet: current.fleet + toFleet,
    strategy: current.strategy + toStrategy,
  }
}
