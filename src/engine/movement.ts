import { tileByNumber } from '../data/tiles'
import { isMovable, isShip, unitStats, type StatsOwner } from '../data/units'
import { neighbours } from './adjacency'
import { checkFleet, hasTech, returnToReinforcements, statsOwner, trimCargo } from './board'
import { ignoresFleets, moveBonus, tacticalEffect, wormholesLinked } from './effects'
import { afterSpaceStep } from './invasion'
import { deriveSeed, mulberry32 } from './rng'
import type { Anomaly, CombatState, GameState, Result, Seat, System, Unit } from './types'

export interface MoveSpec { unitId: number; from: string; carrying: number[] }

export function anomaliesOf(sys: System): Anomaly[] {
  if (sys.anomalies && sys.anomalies.length > 0) return sys.anomalies
  if (sys.tile) {
    const num = Number(sys.tile)
    if (!Number.isNaN(num) && num > 0) {
      try {
        return tileByNumber(num).anomalies
      } catch {
        return []
      }
    }
  }
  return []
}

/**
 * R1/LRR 10/57/81: Anomaly and fleet restrictions on movement.
 * - Asteroid fields require Antimass Deflectors to enter or pass through.
 * - Supernovas cannot be entered or passed through.
 * - Nebulae can be entered as destinations, but cannot be passed through as waypoints.
 * - Enemy or guardian ships block movement through waypoints.
 */
function passable(state: GameState, seat: Seat, id: string, destination: boolean, ignoreFleets: boolean): boolean {
  const sys = state.systems[id]
  if (!sys) return false
  const anoms = anomaliesOf(sys)
  if (anoms.includes('supernova')) return false
  if (anoms.includes('asteroid_field') && !state.players[seat].techs.includes('antimass_deflectors')) return false
  if (!destination && anoms.includes('nebula')) return false
  if (destination || ignoreFleets) return true
  return !sys.space.some(u => u.owner !== seat && isShip(u.type))   // R3.2: no moving through enemy or guardian ships
}

/**
 * R5 Jol-Nar faction tech Spatial Conduit Cylinder: once exhausted for this tactical action, the activated
 * system is adjacent to every other system holding the seat's own ships, and each of those systems is
 * adjacent to the activated one right back.
 */
function withSpatialConduit(state: GameState, seat: Seat, id: string, base: readonly string[]): string[] {
  const tac = state.tactical
  if (!tac || !tacticalEffect(state, seat, 'spatial_conduit_cylinder')) return [...base]
  const hasMyShips = (sysId: string) => state.systems[sysId]?.space.some(u => u.owner === seat && isShip(u.type)) ?? false
  if (id === tac.systemId) {
    const linked = Object.keys(state.systems).filter(sysId => sysId !== id && hasMyShips(sysId))
    return [...new Set([...base, ...linked])]
  }
  if (id !== tac.systemId && hasMyShips(id)) return [...new Set([...base, tac.systemId])]
  return [...base]
}

/** A system's own gravity rift status (not a neighbour's), independent of who is asking. */
function hasGravityRift(state: GameState, id: string): boolean {
  const sys = state.systems[id]
  return sys ? anomaliesOf(sys).includes('gravity_rift') : false
}

/**
 * Shortest legal path, or null when the destination is out of reach. `ignoreFleets` drops the rule that a
 * fleet in the way stops movement; only `movementObstacle` uses it, to tell a blocked path apart from one
 * that was always too long.
 *
 * LRR Gravity Rift 1: a system exited or passed through (never the final destination) that holds a gravity
 * rift refunds its own step — "+1 to move value" for a ship's whole movement is the same thing as that step
 * costing nothing. `steps` is what the move value actually spends, which can be less than `path.length - 1`
 * once a rift is on the path; this is a least-cost search rather than plain BFS because a longer detour
 * through a rift can beat a shorter path that avoids one.
 */
export function shortestPath(state: GameState, seat: Seat, from: string, to: string, moveValue: number, ignoreFleets = false): { steps: number; path: string[] } | null {
  if (from === to || moveValue < 1) return null
  // R9 In The Silence Of Space: ships starting from the named system ignore fleets in the way for the whole
  // path, on top of whatever the caller (movementObstacle's diagnostic probe) already asked to ignore.
  const effectiveIgnoreFleets = ignoreFleets || ignoresFleets(state, seat, from)
  // R9 Lost Star Chart: alpha and beta wormholes count as the same class for this tactical action.
  const linkAlphaBeta = wormholesLinked(state, seat)
  if (!passable(state, seat, to, true, effectiveIgnoreFleets)) return null
  const ids = Object.keys(state.systems)
  const dist = new Map<string, number>(ids.map(id => [id, Infinity]))
  const parent = new Map<string, string>()
  dist.set(from, 0)
  // Bellman-Ford over the whole (small) galaxy graph rather than a depth-bounded BFS: a rift's refund means
  // the cheapest path to a system is not always the one with the fewest hops, so depth can't be capped early.
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false
    for (const u of ids) {
      if (u === to) continue   // nothing moves onward from its own destination
      const du = dist.get(u) ?? Infinity
      if (!Number.isFinite(du)) continue
      const edgeWeight = hasGravityRift(state, u) ? 0 : 1
      for (const n of withSpatialConduit(state, seat, u, neighbours(state.systems, u, state.players[seat]?.faction, linkAlphaBeta))) {
        if (!passable(state, seat, n, n === to, effectiveIgnoreFleets)) continue
        const nd = du + edgeWeight
        if (nd < (dist.get(n) ?? Infinity)) {
          dist.set(n, nd)
          parent.set(n, u)
          changed = true
        }
      }
    }
    if (!changed) break
  }
  const total = dist.get(to) ?? Infinity
  if (!Number.isFinite(total) || total > moveValue) return null
  const path = [to]
  let cur = to
  while (cur !== from) {
    const p = parent.get(cur)
    if (!p) return null
    path.unshift(p)
    cur = p
  }
  return { steps: total, path }
}

/** Shortest legal path length alone, for the many callers that only need to know reachability. */
export function pathLength(state: GameState, seat: Seat, from: string, to: string, moveValue: number, ignoreFleets = false): number | null {
  return shortestPath(state, seat, from, to, moveValue, ignoreFleets)?.steps ?? null
}

function moveValueOf(state: GameState, seat: Seat, unit: Unit): number {
  const player = state.players[seat]
  const base = unitStats(unit.type, { faction: player.faction, techs: player.techs }).move
  // R9 Flank Speed: +1 to the move value of each of the seat's ships for the rest of this tactical action.
  // A base fighter's move value is 0 (it cannot move without a carrier, LRR 91.3) and stays that way: Flank
  // Speed boosts an existing move value, it does not grant one a unit does not otherwise have.
  // Slipstream (Creuss): +1 move when starting movement in home system or wormhole system.
  const isCreuss = player.faction === 'creuss'
  const sysId = state.systems ? Object.entries(state.systems).find(([, s]) => s.space.some(u => u.id === unit.id))?.[0] : undefined
  const isHomeOrWormhole = isCreuss && (sysId === homeSystemOf(state, seat) || (sysId && state.systems?.[sysId]?.planets.some(p => p.id.includes('wormhole'))))
  const slipstreamBonus = isHomeOrWormhole ? 1 : 0
  return base > 0 ? base + moveBonus(state, seat) + slipstreamBonus : base
}

/** Every ship (plus a Saar Floating Factory) of the seat that could reach `systemId`, whether or not that
 * system is activated yet. */
export function shipsThatCanReach(state: GameState, seat: Seat, systemId: string): { unitId: number; from: string }[] {
  const gdAvailable = state.players[seat].techs.includes('gravity_drive') && !state.tactical?.gravityDriveUsed
  const bonus = gdAvailable ? 1 : 0
  const out: { unitId: number; from: string }[] = []
  for (const sys of Object.values(state.systems)) {
    if (sys.id === systemId || sys.activatedBy.includes(seat)) continue
    for (const u of sys.space) {
      if (u.owner !== seat || !isMovable(u.type)) continue
      const baseMove = moveValueOf(state, seat, u)
      if (baseMove < 1) continue
      if (pathLength(state, seat, sys.id, systemId, baseMove + bonus) !== null) {
        out.push({ unitId: u.id, from: sys.id })
      }
    }
  }
  return out
}

/** Every ship of the seat that could reach the active system this activation. */
export function movableShips(state: GameState, seat: Seat): { unitId: number; from: string }[] {
  const tac = state.tactical
  if (!tac || tac.step !== 'movement') return []
  return shipsThatCanReach(state, seat, tac.systemId)
}

/**
 * Why no ship of the seat reaches `systemId`, so the interface can say it out loud instead of a bare
 * "nothing can reach this system": a hostile fleet on the only path, plain range, or simply having no ship
 * left to move. `null` means ships do reach the system.
 */
export type MovementObstacle = 'blocked' | 'range' | 'none'
export function movementObstacle(state: GameState, seat: Seat, systemId: string): MovementObstacle | null {
  if (shipsThatCanReach(state, seat, systemId).length > 0) return null
  const targetSys = state.systems[systemId]
  if (targetSys) {
    const anoms = anomaliesOf(targetSys)
    if (anoms.includes('supernova')) return 'range'
    if (anoms.includes('asteroid_field') && !state.players[seat].techs.includes('antimass_deflectors')) return 'blocked'
  }
  const gdAvailable = state.players[seat].techs.includes('gravity_drive') && !state.tactical?.gravityDriveUsed
  const bonus = gdAvailable ? 1 : 0
  let anyShip = false
  let blocked = false
  for (const sys of Object.values(state.systems)) {
    if (sys.id === systemId || sys.activatedBy.includes(seat)) continue
    for (const u of sys.space) {
      if (u.owner !== seat || !isMovable(u.type)) continue
      const baseMove = moveValueOf(state, seat, u)
      if (baseMove < 1) continue
      anyShip = true
      // the same search once more, but with hostile fleets ignored: a path that only appears then was blocked
      const reach = baseMove + bonus
      if (pathLength(state, seat, sys.id, systemId, reach, true) !== null) blocked = true
    }
  }
  if (!anyShip) return 'none'
  return blocked ? 'blocked' : 'range'
}

/**
 * lrr-factions.md 2129/2131: if a system holds a Floating Factory and none of its owner's own ships, another
 * seat's ships arriving there destroys it immediately — before Space Cannon Offense, so it never gets to
 * fire and it is never itself a legal combat target. Only ships arriving trigger this: `moveShips` only calls
 * this when the arriving seat brought at least one ship, never for a Floating Factory moving in alone.
 */
function abandonedFloatingFactory(sys: System, arrivingSeat: Seat): Unit | null {
  const ff = sys.space.find(u => u.type === 'floating_factory' && u.owner !== arrivingSeat)
  if (!ff) return null
  const hasEscort = sys.space.some(u => u.owner === ff.owner && isShip(u.type))
  return hasEscort ? null : ff
}

/** Disjoint from every other salt scheme in this file: `moveShips` is the only place in `movement.ts` that
 * rolls dice, one per ship per gravity rift it crosses, all off the move's own seed. */
const GRAVITY_RIFT_SALT_BASE = 300

export function moveShips(state: GameState, specs: MoveSpec[], seed: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'movement') return { ok: false, error: 'not in the movement step' }
  const seat = state.active
  const player = state.players[seat]
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  let gravityDrive = player.techs.includes('gravity_drive') && !tac.gravityDriveUsed
  let gravityDriveUsedThisCall = false
  const taken = new Set<number>()
  const arriving: Unit[] = []
  // LRR Gravity Rift 2/6: one roll per rift system a mover exits or passes through on the path it actually
  // takes; carried cargo never rolls on its own (2.1). Keyed by the moving unit's id.
  const riftCrossings = new Map<number, string[]>()
  for (const spec of specs) {
    const src = state.systems[spec.from]
    if (!src) return { ok: false, error: `unknown system ${spec.from}` }
    if (spec.from === tac.systemId) return { ok: false, error: 'ships in the active system do not move' }
    if (src.activatedBy.includes(seat)) return { ok: false, error: `R3.2: ships in ${spec.from} already carry your command token` }
    const ship = src.space.find(u => u.id === spec.unitId && u.owner === seat && isMovable(u.type))
    if (!ship || taken.has(ship.id)) return { ok: false, error: `no movable ship ${spec.unitId} in ${spec.from}` }
    const value = moveValueOf(state, seat, ship)
    if (value < 1) return { ok: false, error: `a ${ship.type} cannot move on its own` }
    let found = shortestPath(state, seat, spec.from, tac.systemId, value)
    if (!found && gravityDrive) {
      const withGd = shortestPath(state, seat, spec.from, tac.systemId, value + 1)
      if (withGd) {
        found = withGd
        gravityDrive = false     // R3.2: Gravity Drive helps one ship per activation
        gravityDriveUsedThisCall = true
      }
    }
    if (!found) return { ok: false, error: `${ship.type} ${ship.id} cannot reach ${tac.systemId}` }
    taken.add(ship.id)
    arriving.push(ship)
    const rifts = found.path.slice(0, -1).filter(id => hasGravityRift(state, id))
    if (rifts.length) riftCrossings.set(ship.id, rifts)
    if (spec.carrying.length > unitStats(ship.type, stats).capacity) return { ok: false, error: `${ship.type} ${ship.id} carries more than its capacity` }
    for (const id of spec.carrying) {
      const cargo = src.space.find(u => u.id === id) ?? src.planets.flatMap(p => p.ground).find(u => u.id === id)
      if (!cargo || cargo.owner !== seat || (cargo.type !== 'fighter' && cargo.type !== 'infantry')) return { ok: false, error: `unit ${id} cannot be carried` }
      if (taken.has(id)) return { ok: false, error: `unit ${id} is carried twice` }
      taken.add(id)
      arriving.push(cargo)
    }
  }
  if (!arriving.length) return { ok: false, error: 'no ships moved' }

  // LRR Gravity Rift Notes 3: every mover above is already fully declared, so the rolls below cannot be
  // influenced by seeing an earlier one. A removed ship's own cargo (its `carrying` list) is removed with it
  // (Rules Reference 2.2) rather than delivered or left at the origin.
  const carryingOf = new Map(specs.map(s => [s.unitId, s.carrying]))
  const removed: Unit[] = []
  const rollLog: { t: 'info'; text: string }[] = []
  let rollIndex = 0
  for (const [unitId, rifts] of riftCrossings) {
    const unit = arriving.find(u => u.id === unitId)
    if (!unit) continue
    for (const riftId of rifts) {
      const rng = mulberry32(deriveSeed(seed, GRAVITY_RIFT_SALT_BASE + rollIndex++))
      const roll = 1 + Math.floor(rng() * 10)
      const hit = roll <= 3
      rollLog.push({ t: 'info', text: `seat ${seat}'s ${unit.type} ${unit.id} rolls ${roll} for the gravity rift in ${riftId}${hit ? ' — removed from the board' : ''}` })
      if (hit) {
        removed.push(unit)
        for (const cargoId of carryingOf.get(unitId) ?? []) {
          const cargo = arriving.find(u => u.id === cargoId)
          if (cargo) removed.push(cargo)
        }
        break   // Notes 2: removed, not destroyed — and no longer there to roll again for a later rift
      }
    }
  }
  const removedIds = new Set(removed.map(u => u.id))
  const survivors = arriving.filter(u => !removedIds.has(u.id))

  const systems: Record<string, System> = {}
  for (const [id, sys] of Object.entries(state.systems)) {
    systems[id] = {
      ...sys,
      space: sys.space.filter(u => !taken.has(u.id)),
      planets: sys.planets.map(p => p.ground.some(u => taken.has(u.id)) ? { ...p, ground: p.ground.filter(u => !taken.has(u.id)) } : p),
    }
  }
  const dest = systems[tac.systemId]
  const arrived = { ...dest, space: [...dest.space, ...survivors] }
  const abandoned = survivors.some(u => u.owner === seat && isShip(u.type)) ? abandonedFloatingFactory(arrived, seat) : null
  systems[tac.systemId] = abandoned ? { ...arrived, space: arrived.space.filter(u => u.id !== abandoned.id) } : arrived
  let next: GameState = {
    ...state,
    systems,
    tactical: {
      ...tac,
      gravityDriveUsed: Boolean(tac.gravityDriveUsed || gravityDriveUsedThisCall),
    },
    log: [
      ...state.log,
      ...rollLog,
      ...(abandoned ? [{ t: 'info' as const, text: `seat ${abandoned.owner}'s Floating Factory in ${tac.systemId} is destroyed — seat ${seat}'s ships arrived and it had no escort` }] : []),
    ],
  }
  // Notes 3: removed ships (LRR Gravity Rift 2.3) go back to reinforcements, not to the destination.
  next = returnToReinforcements(next, removed)
  // R3.2/16.2: fighters or infantry left behind by a departing ship are excess if the origin's remaining
  // ships can no longer carry them; trim them the same way a combat or retreat does.
  for (const from of new Set(specs.map(s => s.from))) next = trimCargo(next, from, seat)
  const fleet = checkFleet(next, seat, tac.systemId)
  if (!fleet.ok) return { ok: false, error: fleet.error }
  return { ok: true, value: next }
}

/** R5 Jol-Nar faction tech Spatial Conduit Cylinder: exhaust the card for the rest of this tactical action. */
export function exhaustSpatialConduit(state: GameState): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'movement') return { ok: false, error: 'not in the movement step' }
  const seat = state.active
  const player = state.players[seat]
  if (!hasTech(state, seat, 'spatial_conduit_cylinder')) return { ok: false, error: 'Spatial Conduit Cylinder has not been researched' }
  if (player.spatialConduitExhausted) return { ok: false, error: 'Spatial Conduit Cylinder is already exhausted this round' }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, spatialConduitExhausted: true }
  return {
    ok: true,
    value: {
      ...state, players,
      effects: [...state.effects, { effect: 'spatial_conduit_cylinder', seat, scope: 'tactical' }],
      log: [...state.log, { t: 'info', text: `seat ${seat} exhausts Spatial Conduit Cylinder` }],
    },
  }
}

export function endMovement(state: GameState, _seed?: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'movement') return { ok: false, error: 'not in the movement step' }
  const seat = state.active
  const sys = state.systems[tac.systemId]
  const mine = sys.space.filter(u => u.owner === seat && isShip(u.type))
  const foes = sys.space.filter(u => u.owner !== seat && isShip(u.type))
  if (mine.length && foes.length) {
    const combat: CombatState = { round: 0, attacker: seat, defender: foes[0].owner, retreating: null, retreatTo: null, lastRolls: [], pending: [] }
    return { ok: true, value: { ...state, tactical: { ...tac, step: 'spaceCombat', combat } } }
  }
  // R4.1 step 1: a defending PDS fires even when there are no enemy ships in space.
  // We enter the spaceCombat step with round 0 so the defense roll is interactive and visible.
  const gunner = sys.planets.flatMap(p => p.structures).find(u => u.owner !== seat && unitStats(u.type, statsOwner(state, u.owner)).spaceCannon)
  if (!mine.length || !gunner) {
    return { ok: true, value: { ...state, tactical: afterSpaceStep(state, tac.systemId, seat) } }
  }
  const combat: CombatState = { round: 0, attacker: seat, defender: gunner.owner, retreating: null, retreatTo: null, lastRolls: [], pending: [] }
  return { ok: true, value: { ...state, tactical: { ...tac, step: 'spaceCombat', combat } } }
}
