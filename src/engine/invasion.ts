import { isShip, unitStats } from '../data/units'
import { destroyUnits, dieRolls, hasTech, removeUnits, rollHits, rollRevival, statsOwner, combatBonus } from './board'
import { deriveSeed, mulberry32, type Rng } from './rng'
import type { DieRoll, GameState, Owner, Planet, Result, Seat, TacticalContext, Unit, UnitType } from './types'

/**
 * All dice draws in an invasion use mulberry32(deriveSeed(seed, salt)) with disjoint salts, so a single seed
 * replays deterministically and every die can be reconstructed from the log: bombard() uses
 * BOMBARD_SALT_BASE + the number of planets already bombarded this invasion, so the second bombardment of an
 * invasion never replays the first one's dice (each planet is bombarded at most once, guarded by `bombarded`,
 * and a system holds at most two planets); land()'s space cannon defense always uses LANDING_DEFENSE_SALT (one
 * landing call per move). Ground combat is the one action repeated many times within a single invasion, so its
 * rolls are scoped by `tactical.invasion.round`: round r uses GROUND_SALT_BASE + 3r (attacker), + 3r + 1
 * (defender) and + 3r + 2 (Harrow bombardment, L1Z1X only), which start at 20 and so never collide with the
 * bombardment or landing defense salts.
 */
const BOMBARD_SALT_BASE = 10
const LANDING_DEFENSE_SALT = 2
const GROUND_SALT_BASE = 20

/**
 * R4.3 step 4: the revival roll hangs off the salt of the step that killed the infantry, as a derived child
 * seed, so it never enters the salt space of the invasion itself.
 */
const REVIVAL_SALT = 1

function destroyGround(state: GameState, systemId: string, units: Unit[], seed: number, salt: number): GameState {
  return rollRevival(destroyUnits(state, systemId, units), units, deriveSeed(deriveSeed(seed, salt), REVIVAL_SALT))
}

function planetOf(state: GameState, systemId: string, planetId: string): Planet | undefined {
  return state.systems[systemId].planets.find(p => p.id === planetId)
}

/**
 * R4.3 step 1: an enemy planetary shield blocks bombardment unless Arc Secundus is in the system. This is a
 * two-seat duel, so every structure not owned by the attacker belongs to the single other seat (or the
 * Mecatol Rex guardian, which never fields a PDS) — there is no second enemy owner to disambiguate.
 */
function shieldBlocks(state: GameState, systemId: string, planetId: string, seat: Seat): boolean {
  const planet = planetOf(state, systemId, planetId)
  if (!planet) return true
  const shielded = planet.structures.some(u => u.owner !== seat && unitStats(u.type, statsOwner(state, u.owner)).planetaryShield)
  if (!shielded) return false
  const arcSecundus = state.players[seat].faction === 'letnev'
    && state.systems[systemId].space.some(u => u.owner === seat && u.type === 'flagship')
  return !arcSecundus
}

/** Rolls one dice group for a single owner. `statOf` gives each unit's {dice, value}, or null to skip it; `extraDie` adds one die to the first qualifying unit (Plasma Scoring). */
function rollGroup(rng: Rng, units: Unit[], owner: Owner, statOf: (type: UnitType) => { value: number; dice: number } | null, extraDie: boolean): { rolls: DieRoll[]; hits: number } {
  const rolls: DieRoll[] = []
  let extra = extraDie
  let hits = 0
  for (const u of units) {
    const stat = statOf(u.type)
    if (!stat) continue
    const roll = rollHits(rng, stat.dice, stat.value, extra)
    extra = false
    rolls.push(...dieRolls(owner, u.type, roll.rolls, stat.value))
    hits += roll.hits
  }
  return { rolls, hits }
}

function bombardment(state: GameState, systemId: string, planetId: string, seat: Seat, seed: number, salt: number, context: string): GameState {
  const sOwner = statsOwner(state, seat)
  const ships = state.systems[systemId].space.filter(u => u.owner === seat && isShip(u.type) && unitStats(u.type, sOwner).bombardment)
  if (!ships.length) return state
  const rng = mulberry32(deriveSeed(seed, salt))
  const extraDie = state.players[seat].techs.includes('plasma_scoring')
  const { rolls, hits } = rollGroup(rng, ships, seat, type => unitStats(type, sOwner).bombardment, extraDie)
  const logged: GameState = { ...state, log: [...state.log, { t: 'roll', owner: seat, rolls, context }] }
  const planet = planetOf(logged, systemId, planetId)
  if (!planet) return logged
  return destroyGround(logged, systemId, planet.ground.filter(u => u.owner !== seat).slice(0, hits), seed, salt)
}

export function bombardablePlanets(state: GameState): string[] {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return []
  const inv = tac.invasion
  if (inv.planetId !== null) return []   // R4.3: bombardment ends once landing has begun this invasion; only Harrow bombards afterwards
  const seat = state.active
  const sOwner = statsOwner(state, seat)
  const canBombard = state.systems[tac.systemId].space.some(u => u.owner === seat && isShip(u.type) && unitStats(u.type, sOwner).bombardment)
  if (!canBombard) return []
  return state.systems[tac.systemId].planets
    .filter(p => !inv.bombarded.includes(p.id)
      && p.ground.some(u => u.owner !== seat)
      && !shieldBlocks(state, tac.systemId, p.id, seat))
    .map(p => p.id)
}

export function groundCombatPending(state: GameState): boolean {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return false
  const inv = tac.invasion
  if (!inv.planetId) return false
  const planet = planetOf(state, tac.systemId, inv.planetId)
  if (!planet) return false
  const seat = state.active
  return planet.ground.some(u => u.owner === seat) && planet.ground.some(u => u.owner !== seat)
}

export function landablePlanets(state: GameState): { planetId: string; infantryIds: number[] }[] {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return []
  const inv = tac.invasion
  const seat = state.active
  const infantryIds = state.systems[tac.systemId].space.filter(u => u.owner === seat && u.type === 'infantry').map(u => u.id)
  if (!infantryIds.length) return []
  if (groundCombatPending(state)) return []   // R4.3 step 4: the running ground combat is fought out first
  return state.systems[tac.systemId].planets
    .filter(p => p.id !== inv.planetId)       // R4.3 step 3: one landing per planet per invasion
    .map(p => ({ planetId: p.id, infantryIds }))
}

/** R4.3 step 5: the attacker takes the planet when it has ground forces there and no defender is left. */
function resolveControl(state: GameState, systemId: string, planetId: string, seat: Seat): GameState {
  const planet = planetOf(state, systemId, planetId)
  if (!planet || planet.owner === seat) return state
  if (!planet.ground.some(u => u.owner === seat) || planet.ground.some(u => u.owner !== seat)) return state
  const assimilate = state.players[seat].faction === 'l1z1x'
  const players = [...state.players] as GameState['players']
  const replacements: Unit[] = []
  let nextId = state.nextUnitId
  for (const s of planet.structures) {
    if (s.owner !== 'guardian') {
      const loser = players[s.owner]
      players[s.owner] = { ...loser, reinforcements: { ...loser.reinforcements, [s.type]: loser.reinforcements[s.type] + 1 } }
    }
    if (!assimilate) continue
    const me = players[seat]
    if (me.reinforcements[s.type] < 1) continue
    players[seat] = { ...me, reinforcements: { ...me.reinforcements, [s.type]: me.reinforcements[s.type] - 1 } }
    replacements.push({ id: nextId++, type: s.type, owner: seat, damaged: false })
  }
  const sys = state.systems[systemId]
  return {
    ...state, players, nextUnitId: nextId,
    systems: {
      ...state.systems,
      [systemId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, owner: seat, exhausted: true, structures: replacements } : p) },
    },
    log: [...state.log, { t: 'info', text: `seat ${seat} takes control of ${planetId}` }],
  }
}

export function bombard(state: GameState, planetId: string, seed: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return { ok: false, error: 'not in the invasion step' }
  const inv = tac.invasion
  if (inv.planetId !== null) return { ok: false, error: 'R4.3: bombardment is only legal before the first landing of this invasion; Harrow bombards afterwards' }
  const seat = state.active
  const planet = planetOf(state, tac.systemId, planetId)
  if (!planet) return { ok: false, error: `planet ${planetId} is not in the active system` }
  if (inv.bombarded.includes(planetId)) return { ok: false, error: `${planetId} was already bombarded` }
  if (!planet.ground.some(u => u.owner !== seat)) return { ok: false, error: 'no ground forces to bombard' }
  if (shieldBlocks(state, tac.systemId, planetId, seat)) return { ok: false, error: 'R4.3: the planetary shield blocks the bombardment' }
  const sOwner = statsOwner(state, seat)
  if (!state.systems[tac.systemId].space.some(u => u.owner === seat && isShip(u.type) && unitStats(u.type, sOwner).bombardment)) {
    return { ok: false, error: 'no unit with BOMBARDMENT in the system' }
  }
  const bombed = bombardment(state, tac.systemId, planetId, seat, seed, BOMBARD_SALT_BASE + inv.bombarded.length, `bombardment of ${planetId}`)
  const next: GameState = { ...bombed, tactical: { ...tac, invasion: { ...inv, bombarded: [...inv.bombarded, planetId] } } }
  // A pre-existing attacker presence on the planet (from an earlier turn) may now stand alone if this clears the last defender.
  return { ok: true, value: resolveControl(next, tac.systemId, planetId, seat) }
}

export function land(state: GameState, planetId: string, infantryIds: number[], seed: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return { ok: false, error: 'not in the invasion step' }
  const inv = tac.invasion
  const seat = state.active
  const sys = state.systems[tac.systemId]
  const planet = planetOf(state, tac.systemId, planetId)
  if (!planet) return { ok: false, error: `planet ${planetId} is not in the active system` }
  if (!infantryIds.length) return { ok: false, error: 'no infantry to land' }
  if (groundCombatPending(state)) return { ok: false, error: 'R4.3 step 4: finish the running ground combat first' }
  if (inv.planetId === planetId) return { ok: false, error: `R4.3 step 3: ${planetId} was already landed on this invasion` }
  const landing: Unit[] = []
  for (const id of infantryIds) {
    const u = sys.space.find(x => x.id === id && x.owner === seat && x.type === 'infantry')
    if (!u || landing.some(l => l.id === id)) return { ok: false, error: `no carried infantry ${id} in the active system` }
    landing.push(u)
  }
  let next = state
  let survivors = landing
  const pds = planet.structures.filter(u => u.owner !== seat && unitStats(u.type, statsOwner(state, u.owner)).spaceCannon)
  if (pds.length && !hasTech(state, seat, 'l4_disruptors')) {
    // Duel-only assumption: with only two seats, every PDS not owned by the attacker belongs to the single other seat.
    const defender: Owner = pds[0].owner
    const sOwner = statsOwner(state, defender)
    const rng = mulberry32(deriveSeed(seed, LANDING_DEFENSE_SALT))
    const extraDie = hasTech(state, defender, 'plasma_scoring')
    const { rolls, hits } = rollGroup(rng, pds, defender, type => unitStats(type, sOwner).spaceCannon, extraDie)
    next = { ...next, log: [...next.log, { t: 'roll', owner: defender, rolls, context: `space cannon defense on ${planetId}` }] }
    next = destroyGround(next, tac.systemId, survivors.slice(0, hits), seed, LANDING_DEFENSE_SALT)
    survivors = survivors.slice(hits)
  }
  next = removeUnits(next, tac.systemId, survivors.map(u => u.id))
  if (!survivors.length) {
    // R4.3 step 3: the whole landing party died to space cannon defense before reaching the ground; nothing was landed, so the invasion keeps whatever planet (if any) was already selected.
    next = { ...next, log: [...next.log, { t: 'info', text: `the landing party on ${planetId} was destroyed by space cannon defense before reaching the ground` }] }
    return { ok: true, value: resolveControl(next, tac.systemId, planetId, seat) }
  }
  const target = next.systems[tac.systemId]
  next = {
    ...next,
    systems: {
      ...next.systems,
      [tac.systemId]: { ...target, planets: target.planets.map(p => p.id === planetId ? { ...p, ground: [...p.ground, ...survivors] } : p) },
    },
    tactical: { ...tac, invasion: { ...inv, planetId, landed: [...inv.landed, ...survivors.map(u => u.id)] } },
  }
  return { ok: true, value: resolveControl(next, tac.systemId, planetId, seat) }
}

function groundRolls(state: GameState, units: Unit[], owner: Owner, seed: number, salt: number): { rolls: DieRoll[]; hits: number } {
  const sOwner = statsOwner(state, owner)
  const rng = mulberry32(deriveSeed(seed, salt))
  const bonus = combatBonus(state, owner)
  return rollGroup(rng, units, owner, type => {
    const stats = unitStats(type, sOwner)
    return stats.combat === null ? null : { value: stats.combat - bonus, dice: stats.combatDice }
  }, false)
}

export function groundCombatRound(state: GameState, seed: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion' || !tac.invasion) return { ok: false, error: 'no ground combat is running' }
  const inv = tac.invasion
  if (!inv.planetId) return { ok: false, error: 'no ground combat is running' }
  const seat = state.active
  const planetId = inv.planetId
  const planet = planetOf(state, tac.systemId, planetId)
  if (!planet) return { ok: false, error: `planet ${planetId} is not in the active system` }
  const mine = planet.ground.filter(u => u.owner === seat)
  const foes = planet.ground.filter(u => u.owner !== seat)
  if (!mine.length || !foes.length) return { ok: false, error: 'the ground combat is already decided' }
  const defender = foes[0].owner
  const round = inv.round
  const a = groundRolls(state, mine, seat, seed, GROUND_SALT_BASE + 3 * round)
  const d = groundRolls(state, foes, defender, seed, GROUND_SALT_BASE + 3 * round + 1)
  let next: GameState = { ...state, log: [...state.log,
    { t: 'roll', owner: seat, rolls: a.rolls, context: `ground combat on ${planetId}` },
    { t: 'roll', owner: defender, rolls: d.rolls, context: `ground combat on ${planetId}` }] }
  next = destroyGround(next, tac.systemId, foes.slice(0, a.hits), seed, GROUND_SALT_BASE + 3 * round)
  next = destroyGround(next, tac.systemId, mine.slice(0, d.hits), seed, GROUND_SALT_BASE + 3 * round + 1)
  next = { ...next, tactical: { ...tac, invasion: { ...inv, round: round + 1 } } }
  const after = planetOf(next, tac.systemId, planetId)
  // HARROW: L1Z1X may bombard after every ground combat round; v1 does it automatically
  if (state.players[seat].faction === 'l1z1x' && after && after.ground.some(u => u.owner !== seat) && !shieldBlocks(next, tac.systemId, planetId, seat)) {
    next = bombardment(next, tac.systemId, planetId, seat, seed, GROUND_SALT_BASE + 3 * round + 2, `Harrow bombardment of ${planetId}`)
  }
  return { ok: true, value: resolveControl(next, tac.systemId, planetId, seat) }
}

/**
 * R4.3: the invasion step only opens when there is something to do in it, that is infantry in space that
 * could land, an enemy planet worth bombarding, or a ground combat already under way. A player who only
 * moved ships into an empty system is not asked about an invasion that cannot happen; the tactical action
 * goes straight on to production, or ends if there is no space dock of theirs in the system.
 */
export function afterSpaceStep(state: GameState, systemId: string, seat: Seat): TacticalContext {
  const opened: TacticalContext = { systemId, step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 } }
  const staged: GameState = { ...state, active: seat, tactical: opened }
  const worth = landablePlanets(staged).length > 0 || bombardablePlanets(staged).length > 0 || groundCombatPending(staged)
  if (worth) return opened
  const dock = state.systems[systemId].planets.some(p => p.structures.some(u => u.type === 'spacedock' && u.owner === seat))
  return { systemId, step: dock ? 'production' : 'done' }
}

export function endInvasion(state: GameState): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'invasion') return { ok: false, error: 'not in the invasion step' }
  if (groundCombatPending(state)) return { ok: false, error: 'the ground combat is unresolved' }
  const seat = state.active
  const dock = state.systems[tac.systemId].planets.some(p => p.structures.some(u => u.type === 'spacedock' && u.owner === seat))
  return { ok: true, value: { ...state, tactical: { ...tac, step: dock ? 'production' : 'done' } } }
}
