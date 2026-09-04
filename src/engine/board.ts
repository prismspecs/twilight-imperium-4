import { isShip, type StatsOwner } from '../data/units'
import { capacity, fleetPoolLimit, nonFighterShips } from './economy'
import { deriveSeed, mulberry32, rollDice, type Rng } from './rng'
import type { DieRoll, GameState, Owner, Result, Seat, System, Unit, UnitType } from './types'

export function statsOwner(state: GameState, owner: Owner): StatsOwner {
  return owner === 'guardian' ? 'guardian' : { faction: state.players[owner].faction, techs: state.players[owner].techs }
}

/** The id of the seat's home system, read from the systems placed in the game (works on any map). */
export function homeSystemOf(state: GameState, seat: Seat): string {
  const home = Object.values(state.systems).find(s => s.home === seat)
  if (!home) throw new Error(`no home system for seat ${String(seat)}`)
  return home.id
}

export function hasTech(state: GameState, owner: Owner, tech: string): boolean {
  return owner !== 'guardian' && state.players[owner].techs.includes(tech)
}

export function shipsOf(sys: System, owner: Owner): Unit[] {
  return sys.space.filter(u => u.owner === owner && isShip(u.type))
}

/** The one dice helper: `dice` dice (Plasma Scoring adds one), a hit on `value` or higher. */
export function rollHits(rng: Rng, dice: number, value: number, extraDie: boolean): { rolls: number[]; hits: number } {
  const rolls = rollDice(rng, Math.max(0, dice + (extraDie ? 1 : 0)))
  return { rolls, hits: rolls.filter(v => v >= value).length }
}

export function dieRolls(owner: Owner, unit: UnitType, rolls: number[], value: number): DieRoll[] {
  return rolls.map(v => ({ owner, unit, value: v, hit: v >= value }))
}

export function removeUnits(state: GameState, systemId: string, ids: number[]): GameState {
  const set = new Set(ids)
  if (!set.size) return state
  const sys = state.systems[systemId]
  return {
    ...state,
    systems: {
      ...state.systems,
      [systemId]: {
        ...sys,
        space: sys.space.filter(u => !set.has(u.id)),
        planets: sys.planets.map(p => ({ ...p, ground: p.ground.filter(u => !set.has(u.id)), structures: p.structures.filter(u => !set.has(u.id)) })),
      },
    },
  }
}

export function returnToReinforcements(state: GameState, units: Unit[]): GameState {
  if (!units.length) return state
  const players = [...state.players] as GameState['players']
  for (const u of units) {
    if (u.owner === 'guardian') continue
    const p = players[u.owner]
    players[u.owner] = { ...p, reinforcements: { ...p.reinforcements, [u.type]: p.reinforcements[u.type] + 1 } }
  }
  return { ...state, players }
}

export function destroyUnits(state: GameState, systemId: string, units: Unit[]): GameState {
  if (!units.length) return state
  return returnToReinforcements(removeUnits(state, systemId, units.map(u => u.id)), units)
}

/**
 * R4.3 step 4: every destroyed infantry of a player with Infantry II rolls once, a 6 or higher makes it
 * return at the start of that player's next turn. One log entry per seat, so the hits can be counted from
 * the log; a seat without the technology rolls nothing.
 */
export function rollRevival(state: GameState, destroyed: Unit[], seed: number): GameState {
  let next = state
  for (const seat of state.players.map((_, i) => i)) {
    const lost = destroyed.filter(u => u.owner === seat && u.type === 'infantry')
    if (!lost.length || !state.players[seat].techs.includes('infantry_ii')) continue
    const { rolls, hits } = rollHits(mulberry32(deriveSeed(seed, seat)), lost.length, 6, false)
    const players = [...next.players] as GameState['players']
    players[seat] = { ...players[seat], pendingInfantry: players[seat].pendingInfantry + hits }
    next = {
      ...next, players,
      log: [...next.log, { t: 'roll', owner: seat, rolls: dieRolls(seat, 'infantry', rolls, 6), context: 'Infantry II revival' }],
    }
  }
  return next
}

/** R4.4: a space dock (I or II) lets up to 3 fighters in the system ignore capacity. */
export function freeFighterSlots(state: GameState, seat: Seat, systemId: string): number {
  return state.systems[systemId].planets.some(p => p.structures.some(u => u.type === 'spacedock' && u.owner === seat)) ? 3 : 0
}

/**
 * R4.4: how many carried fighters and infantry fit. A space dock's (I or II) free slots are fighter-only, so
 * fighters claim them first; the ships' own capacity then carries the infantry, and whatever capacity is left
 * over carries the remaining fighters. The one allocation shared by `fleetExcess` and `trimCargo`, so a
 * trimmed fleet always passes `checkFleet`.
 */
function fitCargo(space: Unit[], owner: Owner, stats: StatsOwner, freeSlots: number): { fighters: number; infantry: number; keepFighters: number; keepInfantry: number } {
  const mine = space.filter(u => u.owner === owner)
  const fighters = mine.filter(u => u.type === 'fighter').length
  const infantry = mine.filter(u => u.type === 'infantry').length
  const cap = capacity(space, owner, stats)
  const freeFighters = Math.min(freeSlots, fighters)
  const keepInfantry = Math.min(infantry, cap)
  const keepFighters = freeFighters + Math.min(fighters - freeFighters, cap - keepInfantry)
  return { fighters, infantry, keepFighters, keepInfantry }
}

/**
 * R3.2/R4.4: excess fighters and carried infantry beyond capacity (0 if none), and whether that excess is a
 * hard block (capacity exceeded with no Fighter II rescue). The one piece of capacity/fleet-pool arithmetic
 * shared by `checkFleet` and the production fighter trim, so both apply identical math.
 */
function fleetExcess(space: Unit[], seat: Seat, stats: StatsOwner, fighterIi: boolean, freeSlots: number): { excess: number; blocked: boolean } {
  const fit = fitCargo(space, seat, stats, freeSlots)
  const excessInfantry = fit.infantry - fit.keepInfantry
  const excess = excessInfantry + (fit.fighters - fit.keepFighters)
  if (excess > 0) {
    // R3.2: only Fighter II turns excess fighters into a fleet pool question instead of an illegal move;
    // infantry beyond the ships' capacity is always illegal, the free slots never take it.
    if (!fighterIi || excessInfantry > 0) return { excess, blocked: true }
  }
  return { excess, blocked: false }
}

/** Capacity for carried fighters and infantry plus the fleet pool for non-fighter ships (Armada +2). */
export function checkFleet(state: GameState, seat: Seat, systemId: string): Result<true> {
  const player = state.players[seat]
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  const space = state.systems[systemId].space
  const { excess, blocked } = fleetExcess(space, seat, stats, player.techs.includes('fighter_ii'), freeFighterSlots(state, seat, systemId))
  if (blocked) return { ok: false, error: `capacity exceeded in ${systemId}` }
  if (nonFighterShips(space, seat) + excess > fleetPoolLimit(player)) return { ok: false, error: `fleet pool exceeded in ${systemId}` }
  return { ok: true, value: true }
}

/**
 * R4.4: the most fighters that can be added on top of `extraShips` (new non-fighter ships produced in the
 * same order, which pool their capacity with the existing fleet) without failing `checkFleet`'s capacity and
 * fleet-pool arithmetic. Newly produced infantry never belongs in `extraShips` — it lands on the dock's
 * planet, not in the system's space. Mirrors `checkFleet`'s math exactly, so a production order trimmed to
 * this room always passes the final `checkFleet` call.
 */
export function maxFightersAllowed(state: GameState, seat: Seat, systemId: string, extraShips: Unit[]): number {
  const player = state.players[seat]
  const stats: StatsOwner = { faction: player.faction, techs: player.techs }
  const space = [...state.systems[systemId].space, ...extraShips]
  const freeSlots = freeFighterSlots(state, seat, systemId)
  const fighterIi = player.techs.includes('fighter_ii')
  const pool = fleetPoolLimit(player)
  let room = 0
  for (let n = 0; n <= 200; n++) {
    const probeFighters: Unit[] = Array.from({ length: n }, (): Unit => ({ id: -1, type: 'fighter', owner: seat, damaged: false }))
    const probe = [...space, ...probeFighters]
    const { excess, blocked } = fleetExcess(probe, seat, stats, fighterIi, freeSlots)
    if (blocked || nonFighterShips(probe, seat) + excess > pool) break
    room = n
  }
  return room
}

/**
 * Destroys carried infantry and fighters above the remaining capacity, when a combat ends or a retreat
 * resolves. A space dock's (I or II) free fighter slots are fighter-only (`fitCargo`), so they never rescue
 * infantry; with Fighter II, fighters beyond capacity are kept up to the remaining fleet pool room (the
 * excess counts against the pool, matching `checkFleet`), the rest are destroyed and returned to
 * reinforcements.
 */
export function trimCargo(state: GameState, systemId: string, owner: Owner): GameState {
  const sys = state.systems[systemId]
  const mine = sys.space.filter(u => u.owner === owner)
  const infantry = mine.filter(u => u.type === 'infantry')
  const fighters = mine.filter(u => u.type === 'fighter')
  const free = owner === 'guardian' ? 0 : freeFighterSlots(state, owner, systemId)
  const fit = fitCargo(sys.space, owner, statsOwner(state, owner), free)
  let keepFighters = fit.keepFighters
  if (owner !== 'guardian' && state.players[owner].techs.includes('fighter_ii')) {
    const poolRoom = Math.max(0, fleetPoolLimit(state.players[owner]) - nonFighterShips(sys.space, owner))
    keepFighters += Math.min(fighters.length - keepFighters, poolRoom)
  }
  return destroyUnits(state, systemId, [...infantry.slice(fit.keepInfantry), ...fighters.slice(keepFighters)])
}
