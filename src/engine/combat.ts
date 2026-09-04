import { MECATOL_ID } from '../data/map'
import { NON_FIGHTER_SHIPS, isShip, unitStats, type StatsOwner } from '../data/units'
import { neighbours } from './adjacency'
import { destroyUnits, dieRolls, hasTech, rollHits, shipsOf, statsOwner, trimCargo } from './board'
import { fleetPoolLimit, nonFighterShips } from './economy'
import { afterSpaceStep } from './invasion'
import { deriveSeed, mulberry32 } from './rng'
import type { CombatState, DieRoll, GameState, HitGroup, HitMode, Owner, PendingHits, Result, Seat, Unit, UnitType } from './types'

const DESTROY_ORDER: readonly UnitType[] = ['fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'flagship', 'warsun']
const NON_FIGHTER_ORDER: readonly UnitType[] = DESTROY_ORDER.filter(t => t !== 'fighter')

export type { HitGroup, HitMode }
const MODE_RANK: Record<HitMode, number> = { noFighters: 0, preferNonFighters: 1, any: 2 }

/** The hit groups worth resolving, strictest restriction first, as a copy the assigners may consume. */
function sorted(groups: HitGroup[]): HitGroup[] {
  return groups.filter(g => g.count > 0).map(g => ({ ...g })).sort((a, b) => MODE_RANK[a.mode] - MODE_RANK[b.mode])
}

const canSustain = (u: Unit, owner: StatsOwner): boolean => !u.damaged && unitStats(u.type, owner).sustain

/**
 * All dice draws in a combat use mulberry32(deriveSeed(seed, salt)) with disjoint salts, so a single seed
 * replays deterministically and every die can be reconstructed from the log: anti-fighter barrage uses
 * AFB_SALT_BASE and AFB_SALT_BASE + 1 (one per side); space cannon offense starts at SPACE_CANNON_SALT_BASE
 * and takes one salt per shooting owner (at most two in this duel engine, so it cannot reach the AFB
 * salts); round r >= 1 combat rolls use 4r + 10 (attacker) and 4r + 11 (defender), which start at 14 and so
 * never collide with either pre-combat step.
 */
const AFB_SALT_BASE = 3
const SPACE_CANNON_SALT_BASE = 5

interface Ctx { systemId: string; attacker: Seat; defender: Owner; round: number }

/**
 * R4.1 steps 4 and 6, the automatic assignment: sustain first, then the destruction order; restricted hits with
 * no target are lost. This is what the guardian fleet uses and what resolves a batch that leaves its owner no
 * real decision (`isForcedAssignment`); a player with a choice assigns their hits with the `assignHits` move.
 */
export function autoAssign(units: Unit[], groups: HitGroup[], owner: StatsOwner, nes: boolean): { units: Unit[]; destroyed: Unit[]; sustainedIds: number[]; lost: number } {
  let list = units.map(u => ({ ...u }))
  const destroyed: Unit[] = []
  const sustainedIds: number[] = []
  const queue = sorted(groups)
  let lost = 0
  for (const u of list) {
    if (!queue.some(g => g.count > 0)) break
    if (!canSustain(u, owner)) continue
    u.damaged = true
    sustainedIds.push(u.id)
    let cancel = nes ? 2 : 1
    for (const g of queue) {
      const take = Math.min(cancel, g.count)
      g.count -= take
      cancel -= take
      if (cancel <= 0) break
    }
  }
  for (const g of queue) {
    while (g.count > 0) {
      const first = (types: readonly UnitType[]) => types.flatMap(t => list.filter(u => u.type === t))[0]
      const target = g.mode === 'noFighters' ? first(NON_FIGHTER_ORDER)
        : g.mode === 'preferNonFighters' ? (first(NON_FIGHTER_ORDER) ?? first(DESTROY_ORDER))
          : first(DESTROY_ORDER)
      if (!target) {
        if (g.mode === 'noFighters' && list.length) lost += g.count
        break
      }
      list = list.filter(u => u.id !== target.id)
      destroyed.push(target)
      g.count--
    }
  }
  return { units: list, destroyed, sustainedIds, lost }
}

/** Writes an assignment into the state; keeps `sys.space` in its original relative order (only the owner's ships change). */
function applyAssignment(state: GameState, systemId: string, owner: Owner, kept: Unit[], destroyed: Unit[]): GameState {
  const sys = state.systems[systemId]
  const keptById = new Map(kept.map(u => [u.id, u]))
  const space = sys.space.flatMap(u => {
    if (!(u.owner === owner && isShip(u.type))) return [u]
    const survivor = keptById.get(u.id)
    return survivor ? [survivor] : []
  })
  const next: GameState = { ...state, systems: { ...state.systems, [systemId]: { ...sys, space } } }
  return destroyUnits(next, systemId, destroyed)
}

/** Applies a round or step's hits automatically (guardian fleet, or a batch with no decision in it). */
export function applyCombatHits(state: GameState, systemId: string, owner: Owner, groups: HitGroup[]): GameState {
  if (!groups.some(g => g.count > 0)) return state
  const result = autoAssign(shipsOf(state.systems[systemId], owner), groups, statsOwner(state, owner), hasTech(state, owner, 'non_euclidean_shielding'))
  return applyAssignment(state, systemId, owner, result.units, result.destroyed)
}

// ---------------------------------------------------------------------------------------------------------
// R4.1 step 4: the pending hit queue. Hits scored against a seat's fleet wait in `tactical.combat.pending`
// until that seat assigns them with an `assignHits` move; the combat cannot go on while the queue is filled.
// ---------------------------------------------------------------------------------------------------------

/** The head of the hit queue: the batch that has to be assigned before anything else happens. */
export function pendingFor(state: GameState): PendingHits | null {
  return state.tactical?.combat?.pending?.[0] ?? null
}

/** The seat the engine is waiting on: the owner of the queued hits, otherwise whoever is on turn. */
export function actingSeat(state: GameState): Seat {
  return pendingFor(state)?.owner ?? state.active
}

function withPending(state: GameState, pending: PendingHits[]): GameState {
  const tac = state.tactical
  if (!tac?.combat) return state
  return { ...state, tactical: { ...tac, combat: { ...tac.combat, pending } } }
}

/** The dice of the step being resolved, stored before the hits are assigned so a paused round can still `finish`. */
function withLastRolls(state: GameState, lastRolls: DieRoll[]): GameState {
  const tac = state.tactical
  if (!tac?.combat) return state
  return { ...state, tactical: { ...tac, combat: { ...tac.combat, lastRolls } } }
}

/** The ships of the queue head's owner, in board order. */
function pendingFleet(state: GameState, head: PendingHits): Unit[] {
  return state.tactical ? shipsOf(state.systems[state.tactical.systemId], head.owner) : []
}

/**
 * The ships a batch may be assigned to: fighters only take `any` hits while a non-fighter can take the rest.
 * Ordered like the automatic assignment, cheapest first, so a caller that walks the list in order (the offered
 * pick, the smoke-run driver, a UI list) throws away the cheapest ships rather than whatever arrived first.
 */
function destroyTargets(units: Unit[], groups: HitGroup[]): Unit[] {
  const modes = new Set(sorted(groups).map(g => g.mode))
  const fightersUsable = modes.has('any') || modes.has('preferNonFighters')
  return DESTROY_ORDER.flatMap(t => units.filter(u => u.type === t && (t !== 'fighter' || fightersUsable)))
}

/**
 * How many hits a pick absorbs. Each sustain cancels one hit (two with Non-Euclidean Shielding), each destroyed
 * ship one. The groups are served strictest first, so a ship that could take a restricted hit is never spent on
 * an unrestricted one; a fighter only takes `any` hits, plus `preferNonFighters` hits once the assignment leaves
 * no non-fighter ship in the fleet at all. Hits nothing can take are lost, exactly as in `autoAssign`.
 */
function coverage(fleet: Unit[], destroy: Unit[], sustain: Unit[], groups: HitGroup[], nes: boolean): number {
  const gone = new Set(destroy.map(u => u.id))
  const nonFighterLeft = fleet.some(u => u.type !== 'fighter' && !gone.has(u.id))
  let open = sustain.length * (nes ? 2 : 1) + destroy.filter(u => u.type !== 'fighter').length
  let fighters = destroy.filter(u => u.type === 'fighter').length
  let taken = 0
  for (const g of sorted(groups)) {
    let left = g.count
    const useOpen = Math.min(left, open)
    open -= useOpen
    left -= useOpen
    taken += useOpen
    if (g.mode === 'any' || (g.mode === 'preferNonFighters' && !nonFighterLeft)) {
      const useFighters = Math.min(left, fighters)
      fighters -= useFighters
      taken += useFighters
    }
  }
  return taken
}

/**
 * Rule 4, "no choice, no click": the engine assigns a batch itself when every legal answer comes to the same
 * thing — the hits wipe the fleet, nothing in the fleet can take them at all, or the only candidates are one
 * class of interchangeable ships with no sustain decision to make.
 */
export function isForcedAssignment(units: Unit[], groups: HitGroup[], owner: StatsOwner, nes: boolean): boolean {
  const auto = autoAssign(units, groups, owner, nes)
  if (!auto.units.length) return true                                       // every ship dies whatever is picked
  if (!auto.destroyed.length && !auto.sustainedIds.length) return true      // nothing can be assigned at all
  if (units.some(u => canSustain(u, owner))) return false                   // sustaining is a decision of its own
  return new Set(destroyTargets(units, groups).map(u => `${u.type}:${String(u.damaged)}`)).size <= 1
}

/** The legal picks for the head of the queue: ships that may be destroyed, ships that may sustain instead. */
export function assignmentTargets(state: GameState): { destroy: Unit[]; sustain: Unit[] } {
  const head = pendingFor(state)
  if (!head) return { destroy: [], sustain: [] }
  const fleet = pendingFleet(state, head)
  const owner = statsOwner(state, head.owner)
  return { destroy: destroyTargets(fleet, head.groups), sustain: fleet.filter(u => canSustain(u, owner)) }
}

/**
 * Whether a pick resolves the head of the queue: every picked ship absorbs a hit (nothing wasted) and no further
 * ship could absorb another one (nothing shirked). That is the same thing as taking `min(hits, what the fleet can
 * absorb)` hits, and it keeps the one case where absorbing less is correct: a sustaining ship stays in the fleet,
 * so it may keep a restricted hit away from the fighters behind it.
 */
export function assignmentComplete(state: GameState, destroy: number[], sustain: number[]): boolean {
  const head = pendingFor(state)
  if (!head) return false
  const fleet = pendingFleet(state, head)
  const byId = new Map(fleet.map(u => [u.id, u]))
  const picked = [...destroy, ...sustain]
  if (new Set(picked).size !== picked.length || picked.some(id => !byId.has(id))) return false
  const nes = hasTech(state, head.owner, 'non_euclidean_shielding')
  const owner = statsOwner(state, head.owner)
  const chosen = destroy.map(id => byId.get(id) as Unit)
  const shielded = sustain.map(id => byId.get(id) as Unit)
  const cover = (d: Unit[], s: Unit[]) => coverage(fleet, d, s, head.groups, nes)
  const taken = cover(chosen, shielded)
  for (const u of chosen) if (cover(chosen.filter(x => x.id !== u.id), shielded) === taken) return false
  for (const u of shielded) if (cover(chosen, shielded.filter(x => x.id !== u.id)) === taken) return false
  for (const u of fleet) {
    if (picked.includes(u.id)) continue
    if (cover([...chosen, u], shielded) > taken) return false
    if (canSustain(u, owner) && cover(chosen, [...shielded, u]) > taken) return false
  }
  return true
}

/**
 * A complete pick the enumerator can offer ready to play: sustain first, then the destruction order, which is the
 * order the automatic assignment used before the queue existed. Ships are added while they still absorb another
 * hit, in passes, because destroying the last non-fighter ship can free the fighters behind it.
 */
export function defaultAssignment(state: GameState): { destroy: number[]; sustain: number[] } {
  const head = pendingFor(state)
  if (!head) return { destroy: [], sustain: [] }
  const fleet = pendingFleet(state, head)
  const nes = hasTech(state, head.owner, 'non_euclidean_shielding')
  const targets = assignmentTargets(state)
  const order: [boolean, Unit][] = [
    ...targets.sustain.map((u): [boolean, Unit] => [true, u]),
    ...targets.destroy.map((u): [boolean, Unit] => [false, u]),
  ]
  let destroy: Unit[] = []
  let sustain: Unit[] = []
  const cover = (d: Unit[], s: Unit[]) => coverage(fleet, d, s, head.groups, nes)
  for (let pass = 0; pass <= order.length; pass++) {
    let progress = false
    for (const [shield, u] of order) {
      if (destroy.some(x => x.id === u.id) || sustain.some(x => x.id === u.id)) continue
      const before = cover(destroy, sustain)
      if (shield) {
        if (cover(destroy, [...sustain, u]) > before) { sustain = [...sustain, u]; progress = true }
      } else if (cover([...destroy, u], sustain) > before) { destroy = [...destroy, u]; progress = true }
    }
    if (!progress) break
  }
  // a later pick can make an earlier one redundant, so anything that no longer absorbs a hit is dropped again
  for (const u of [...sustain]) if (cover(destroy, sustain.filter(x => x.id !== u.id)) === cover(destroy, sustain)) sustain = sustain.filter(x => x.id !== u.id)
  for (const u of [...destroy]) if (cover(destroy.filter(x => x.id !== u.id), sustain) === cover(destroy, sustain)) destroy = destroy.filter(x => x.id !== u.id)
  return { destroy: destroy.map(u => u.id), sustain: sustain.map(u => u.id) }
}

/**
 * R4.1 step 4: Duranium Armor repairs one damaged unit that did not sustain a hit this round. Only relevant
 * for round >= 1 combat rounds; the round 0 pre-combat steps never repair.
 */
export function repairAfterRound(state: GameState, systemId: string, owner: Owner, sustainedIds: number[]): GameState {
  if (!hasTech(state, owner, 'duranium_armor')) return state
  const sys = state.systems[systemId]
  const repair = shipsOf(sys, owner).find(u => u.damaged && !sustainedIds.includes(u.id))
  if (!repair) return state
  return { ...state, systems: { ...state.systems, [systemId]: { ...sys, space: sys.space.map(u => u.id === repair.id ? { ...u, damaged: false } : u) } } }
}

/** A combat round's hits; the round 0 pre-combat steps never repair (R4.1 step 4, Duranium Armor). */
const isRoundContext = (context: string): boolean => context.startsWith('combat round')

/**
 * R4.1 step 4: hands a batch of hits to the owner of the ships. The engine resolves it itself for the guardian
 * fleet (which has no player) and whenever rule 4 leaves no real decision, logging what it did; otherwise the
 * batch is appended to the queue and the combat waits. `context` names the step that scored the hits: it labels
 * the batch for the UI and tells `resumeAfterAssignment` where the sequence stopped.
 */
function resolveHits(state: GameState, systemId: string, owner: Owner, groups: HitGroup[], context: string): GameState {
  const repair = (next: GameState, sustainedIds: number[]) =>
    isRoundContext(context) ? repairAfterRound(next, systemId, owner, sustainedIds) : next
  if (!groups.some(g => g.count > 0)) return repair(state, [])
  const units = shipsOf(state.systems[systemId], owner)
  const sOwner = statsOwner(state, owner)
  const nes = hasTech(state, owner, 'non_euclidean_shielding')
  const tac = state.tactical
  if (owner !== 'guardian' && tac?.combat && !isForcedAssignment(units, groups, sOwner, nes)) {
    return withPending(state, [...tac.combat.pending, { owner, groups: sorted(groups), context }])
  }
  const auto = autoAssign(units, groups, sOwner, nes)
  const taken = coverage(units, auto.destroyed, units.filter(u => auto.sustainedIds.includes(u.id)), groups, nes)
  const next = applyAssignment(state, systemId, owner, auto.units, auto.destroyed)
  const logged = taken ? { ...next, log: [...next.log, { t: 'info' as const, text: `${taken} hits assigned automatically in ${systemId}` }] } : next
  return repair(logged, auto.sustainedIds)
}

/** R4.1 step 4: the owner's answer to the head of the queue — which ships die and which ones sustain instead. */
export function assignHits(state: GameState, destroy: number[], sustain: number[], seed: number): Result<GameState> {
  const tac = state.tactical
  const head = pendingFor(state)
  if (!tac?.combat || !head) return { ok: false, error: 'no hits to assign' }
  const fleet = pendingFleet(state, head)
  const byId = new Map(fleet.map(u => [u.id, u]))
  const picked = [...destroy, ...sustain]
  if (new Set(picked).size !== picked.length) return { ok: false, error: 'a ship cannot be picked twice' }
  for (const id of picked) {
    if (byId.has(id)) continue
    const foreign = state.systems[tac.systemId].space.find(u => u.id === id)
    if (foreign && foreign.owner !== head.owner) return { ok: false, error: 'not your hits' }
    return { ok: false, error: `no ship ${id} in ${tac.systemId}` }
  }
  const sOwner = statsOwner(state, head.owner)
  for (const id of sustain) {
    const unit = byId.get(id) as Unit
    if (unit.damaged) return { ok: false, error: `a damaged ${unit.type} cannot sustain another hit` }
    if (!unitStats(unit.type, sOwner).sustain) return { ok: false, error: `a ${unit.type} cannot sustain damage` }
  }
  if (!assignmentComplete(state, destroy, sustain)) return { ok: false, error: 'the hits are not assigned completely' }
  const destroyed = destroy.map(id => byId.get(id) as Unit)
  const kept = fleet.filter(u => !destroy.includes(u.id)).map(u => sustain.includes(u.id) ? { ...u, damaged: true } : u)
  const taken = coverage(fleet, destroyed, sustain.map(id => byId.get(id) as Unit), head.groups, hasTech(state, head.owner, 'non_euclidean_shielding'))
  const detail = [
    ...sustain.map(id => `${(byId.get(id) as Unit).type} sustains`),
    ...destroyed.map(u => `${u.type} destroyed`),
  ].join(', ')
  let next = applyAssignment(state, tac.systemId, head.owner, kept, destroyed)
  next = { ...next, log: [...next.log, { t: 'info', text: `${state.players[head.owner].name} assigns ${taken} hits: ${detail || 'nothing'}` }] }
  next = withPending(next, (next.tactical?.combat?.pending ?? []).slice(1))
  if (isRoundContext(head.context)) next = repairAfterRound(next, tac.systemId, head.owner, sustain)
  if (pendingFor(next)) return { ok: true, value: next }              // the other side still owes an assignment
  return { ok: true, value: resumeAfterAssignment(next, head.context, seed) }
}

/**
 * Where the combat picks up once the queue is empty. The context of the batch that was just assigned says which
 * step had stopped, so round 0 runs as a small state machine (space cannon offense, Assault Cannon, anti-fighter
 * barrage, then `finish`) that can be restarted at the step after the one that paused; a combat round has only
 * `finish` left. `endMovement`'s PDS-only branch has no combat at all: it parks its queue in a combat holder on
 * the movement step, and continues into the invasion instead.
 */
function resumeAfterAssignment(state: GameState, context: string, seed: number): GameState {
  const tac = state.tactical
  if (!tac?.combat) return state
  const ctx: Ctx = { systemId: tac.systemId, attacker: tac.combat.attacker, defender: tac.combat.defender, round: tac.combat.round }
  if (tac.step === 'movement') return afterSpaceCannonOnly(state, ctx.systemId, ctx.attacker)
  if (isRoundContext(context)) return finish(state, ctx)
  return preCombat(state, context === 'space cannon offense' ? 'assault cannon' : 'anti-fighter barrage', ctx, seed)
}

/** The round 0 steps after space cannon offense; each one may pause the sequence on a pending assignment. */
function preCombat(state: GameState, from: 'assault cannon' | 'anti-fighter barrage', ctx: Ctx, seed: number): GameState {
  let next = state
  if (from === 'assault cannon') {
    if (bothAlive(next, ctx)) next = assaultCannon(next, ctx)
    if (pendingFor(next)) return next
  }
  if (bothAlive(next, ctx)) next = antiFighterBarrage(next, ctx, seed)
  return finish(next, ctx)
}

/**
 * R4.1 step 1 without a combat: `endMovement` fires the defending PDS at an arriving fleet that meets no ships.
 * R3.2/16.2: a cannon hit can destroy the carrier of arriving cargo, so the cargo is trimmed the way the end of
 * a space combat trims it — there is no combat here to do it later. The combat holder that carried the queue is
 * dropped again on the way to the invasion.
 */
export function afterSpaceCannonOnly(state: GameState, systemId: string, seat: Seat): GameState {
  const tac = state.tactical
  if (!tac) return state
  const trimmed = trimCargo(state, systemId, seat)
  return {
    ...trimmed,
    tactical: afterSpaceStep(state, tac.systemId, seat),
  }
}

export function canMunitions(state: GameState, owner: Owner): boolean {
  return owner !== 'guardian' && state.players[owner].faction === 'letnev' && state.players[owner].tradeGoods >= 2
}

function payMunitions(state: GameState, owner: Owner): GameState {
  if (owner === 'guardian') return state
  const players = [...state.players] as GameState['players']
  players[owner] = { ...players[owner], tradeGoods: players[owner].tradeGoods - 2 }
  return { ...state, players }
}

/**
 * Rolls one side's combat dice. `rolls` is every die exactly as originally rolled (including misses), so the
 * log always shows what was actually thrown; when `reroll` is set (Munitions Reserves), the new dice for the
 * original misses come back separately in `rerollRolls`, logged under their own ' reroll' context.
 */
function combatRolls(state: GameState, ctx: Ctx, owner: Owner, bonus: number, reroll: boolean, seed: number, salt: number): { rolls: DieRoll[]; rerollRolls: DieRoll[]; hits: number; restricted: number } {
  const sOwner = statsOwner(state, owner)
  const rng = mulberry32(deriveSeed(seed, salt))
  const l1z1x = owner !== 'guardian' && state.players[owner].faction === 'l1z1x'
  const rolls: DieRoll[] = []
  const rerollRolls: DieRoll[] = []
  let hits = 0
  let restricted = 0
  for (const u of shipsOf(state.systems[ctx.systemId], owner)) {
    const stats = unitStats(u.type, sOwner)
    if (stats.combat === null) continue
    const value = stats.combat - bonus
    const roll = rollHits(rng, stats.combatDice, value, false)
    rolls.push(...dieRolls(owner, u.type, roll.rolls, value))
    let unitHits = roll.hits
    if (reroll) {
      const misses = roll.rolls.filter(v => v < value).length
      if (misses) {
        const again = rollHits(rng, misses, value, false)
        rerollRolls.push(...dieRolls(owner, u.type, again.rolls, value))
        unitHits += again.hits
      }
    }
    hits += unitHits
    if (l1z1x && (u.type === 'dreadnought' || u.type === 'flagship')) restricted += unitHits
  }
  return { rolls, rerollRolls, hits, restricted }
}

/**
 * R4.1 step 1: the PDS of every owner in the system except `attacker` fire at the attacker's ships. Fires
 * even when the attacker meets no enemy ships at all (movement.ts's `endMovement` calls this directly in
 * that case, skipping the rest of space combat).
 */
export function spaceCannonOffense(state: GameState, systemId: string, attacker: Owner, seed: number): GameState {
  const shooters: Owner[] = []
  for (const p of state.systems[systemId].planets) for (const u of p.structures) {
    if (u.owner !== attacker && !shooters.includes(u.owner)) shooters.push(u.owner)
  }
  let next = state
  let salt = SPACE_CANNON_SALT_BASE
  // every shooter fires at the same fleet and their dice depend on nothing the hits change (a PDS sits on a
  // planet), so all of them roll first and the attacker assigns the whole barrage as one decision
  const groups: HitGroup[] = []
  for (const owner of shooters) {
    const sOwner = statsOwner(next, owner)
    const pds = next.systems[systemId].planets.flatMap(p => p.structures.filter(u => u.owner === owner && unitStats(u.type, sOwner).spaceCannon))
    if (!pds.length) continue
    const rng = mulberry32(deriveSeed(seed, salt++))
    const rolls: DieRoll[] = []
    let extraDie = hasTech(next, owner, 'plasma_scoring')
    let hits = 0
    for (const u of pds) {
      const sc = unitStats(u.type, sOwner).spaceCannon
      if (!sc) continue
      const roll = rollHits(rng, sc.dice, sc.value, extraDie)
      extraDie = false
      rolls.push(...dieRolls(owner, u.type, roll.rolls, sc.value))
      hits += roll.hits
    }
    next = { ...next, log: [...next.log, { t: 'roll', owner, rolls, context: 'space cannon offense' }] }
    groups.push({ count: hits, mode: hasTech(next, owner, 'graviton_laser_system') ? 'noFighters' : 'any' })
  }
  return resolveHits(next, systemId, attacker, groups, 'space cannon offense')
}

/**
 * R4.1 step 6: with 3 or more non-fighter ships the opponent loses one non-fighter ship, and the owner of that
 * ship picks it (one restricted hit). Both sides' eligibility is read from the state at the start of the step,
 * so a queued assignment on one side cannot change whether the other side's Assault Cannon fires.
 */
function assaultCannon(state: GameState, ctx: Ctx): GameState {
  const sys = state.systems[ctx.systemId]
  const firing = ([[ctx.attacker, ctx.defender], [ctx.defender, ctx.attacker]] as [Owner, Owner][]).filter(([side, foe]) =>
    hasTech(state, side, 'assault_cannon')
    && shipsOf(sys, side).filter(u => NON_FIGHTER_SHIPS.includes(u.type)).length >= 3
    && shipsOf(sys, foe).some(u => NON_FIGHTER_SHIPS.includes(u.type)))
  let next = state
  for (const [, foe] of firing) {
    next = { ...next, log: [...next.log, { t: 'info', text: 'Assault Cannon destroys a non-fighter ship' }] }
    next = resolveHits(next, ctx.systemId, foe, [{ count: 1, mode: 'noFighters' }], 'assault cannon')
  }
  return next
}

/** R4.1 step 2: destroyer barrage, hits destroy enemy fighters only. */
function antiFighterBarrage(state: GameState, ctx: Ctx, seed: number): GameState {
  let next = state
  let salt = AFB_SALT_BASE
  for (const [side, foe] of [[ctx.attacker, ctx.defender], [ctx.defender, ctx.attacker]] as [Owner, Owner][]) {
    const sOwner = statsOwner(next, side)
    const rng = mulberry32(deriveSeed(seed, salt++))
    const rolls: DieRoll[] = []
    let hits = 0
    for (const u of shipsOf(next.systems[ctx.systemId], side)) {
      const afb = unitStats(u.type, sOwner).afb
      if (!afb) continue
      const roll = rollHits(rng, afb.dice, afb.value, false)
      rolls.push(...dieRolls(side, u.type, roll.rolls, afb.value))
      hits += roll.hits
    }
    if (!rolls.length) continue
    next = { ...next, log: [...next.log, { t: 'roll', owner: side, rolls, context: 'anti-fighter barrage' }] }
    next = destroyUnits(next, ctx.systemId, shipsOf(next.systems[ctx.systemId], foe).filter(u => u.type === 'fighter').slice(0, hits))
  }
  return next
}

/**
 * R7: a space combat win feeds two cards. First Strike is a race for one point, so only the first win in
 * Mecatol Rex counts and beating the guardian fleet counts too. The "win a space combat against your
 * opponent" objective counts wins over the other seat only, guardians excluded.
 */
function markCombatWin(state: GameState, ctx: Ctx, winner: Seat): GameState {
  let next = state
  if (ctx.systemId === MECATOL_ID && next.mecatolCombatWinner === null) {
    next = {
      ...next, mecatolCombatWinner: winner,
      log: [...next.log, { t: 'info', text: `Mandate First Strike claimed by seat ${winner}` }],
    }
  }
  if (ctx.defender !== 'guardian') {   // seat against seat, so the winner beat the opponent
    const players = [...next.players] as GameState['players']
    players[winner] = { ...players[winner], spaceCombatWins: players[winner].spaceCombatWins + 1 }
    next = { ...next, players }
  }
  return next
}

/** The winner's log line plus the mandate; a guardian victory earns and logs neither. */
function wonBy(state: GameState, ctx: Ctx, winner: Owner): GameState {
  if (winner === 'guardian') return state
  const marked = markCombatWin(state, ctx, winner)
  return { ...marked, log: [...marked.log, { t: 'info', text: `space combat in ${ctx.systemId} won by seat ${winner}` }] }
}

/** Cargo above the remaining capacity is destroyed when the combat is over. */
function endCombat(state: GameState, ctx: Ctx): GameState {
  return trimCargo(trimCargo(state, ctx.systemId, ctx.attacker), ctx.systemId, ctx.defender)
}

/**
 * R3.2/R4.4: the retreating ships join whatever the seat already had at the destination, which can push it
 * over its fleet pool. The cheapest excess non-fighter ships (NON_FIGHTER_ORDER is cost order) are destroyed
 * and returned to the reinforcements before the cargo is trimmed against the capacity that is left.
 */
function trimFleetPool(state: GameState, systemId: string, seat: Seat): GameState {
  const sys = state.systems[systemId]
  const over = nonFighterShips(sys.space, seat) - fleetPoolLimit(state.players[seat])
  if (over <= 0) return state
  const victims = NON_FIGHTER_ORDER.flatMap(t => shipsOf(sys, seat).filter(u => u.type === t)).slice(0, over)
  if (!victims.length) return state
  const next = destroyUnits(state, systemId, victims)
  return { ...next, log: [...next.log, { t: 'info', text: `${victims.length} ships beyond the fleet pool are destroyed in ${systemId}` }] }
}

/** R4.1 step 5: the announced retreat happens after the round has been fought. */
function withdraw(state: GameState, ctx: Ctx, to: string): GameState {
  const tac = state.tactical
  if (!tac || !tac.combat) return state
  const sys = state.systems[ctx.systemId]
  const dest = state.systems[to]
  const leaving = sys.space.filter(u => u.owner === ctx.attacker)
  const next: GameState = {
    ...state,
    systems: {
      ...state.systems,
      [ctx.systemId]: { ...sys, space: sys.space.filter(u => u.owner !== ctx.attacker) },
      [to]: { ...dest, space: [...dest.space, ...leaving] },
    },
    tactical: { ...tac, step: 'done' },
    log: [...state.log, { t: 'info', text: `seat ${ctx.attacker} retreats from ${ctx.systemId} to ${to}` }],
  }
  return trimCargo(trimCargo(trimFleetPool(next, to, ctx.attacker), to, ctx.attacker), ctx.systemId, ctx.defender)
}

/** Closes a round (or the round 0 pre-combat steps); `lastRolls` was stored when the dice were thrown. */
function finish(state: GameState, ctx: Ctx): GameState {
  const tac = state.tactical
  if (!tac || !tac.combat) return state
  const sys = state.systems[ctx.systemId]
  const attackerShips = shipsOf(sys, ctx.attacker).length
  const defenderShips = shipsOf(sys, ctx.defender).length
  const combat: CombatState = { ...tac.combat, round: ctx.round + 1 }
  if (!attackerShips) {
    // the defender holding the field wins the combat and earns the same mandate the attacker would have
    const done = defenderShips ? wonBy(state, ctx, ctx.defender) : state
    return endCombat({ ...done, tactical: { ...tac, step: 'done', combat } }, ctx)
  }
  if (!defenderShips) {
    const won = wonBy(state, ctx, ctx.attacker)
    return endCombat({ ...won, tactical: { ...afterSpaceStep(won, tac.systemId, ctx.attacker), combat } }, ctx)
  }
  if (combat.retreating === ctx.attacker && combat.retreatTo) return withdraw({ ...state, tactical: { ...tac, combat } }, ctx, combat.retreatTo)
  return { ...state, tactical: { ...tac, combat } }
}

export interface MunitionsRequest { attacker?: boolean; defender?: boolean }

function bothAlive(state: GameState, ctx: Ctx): boolean {
  const sys = state.systems[ctx.systemId]
  return shipsOf(sys, ctx.attacker).length > 0 && shipsOf(sys, ctx.defender).length > 0
}

export function combatRound(state: GameState, munitions: MunitionsRequest | undefined, seed: number): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'spaceCombat' || !tac.combat) return { ok: false, error: 'not in a space combat' }
  if (pendingFor(state)) return { ok: false, error: 'hits must be assigned first' }
  const ctx: Ctx = { systemId: tac.systemId, attacker: tac.combat.attacker, defender: tac.combat.defender, round: tac.combat.round }
  const sys = state.systems[ctx.systemId]
  if (!shipsOf(sys, ctx.attacker).length || !shipsOf(sys, ctx.defender).length) return { ok: false, error: 'the space combat is already decided' }
  const wantAttacker = munitions?.attacker ?? false
  const wantDefender = munitions?.defender ?? false
  if (ctx.round === 0) {
    // R4.1 step 6: Munitions Reserves rerolls a combat round's dice, so it cannot be requested before round 1.
    if (wantAttacker || wantDefender) return { ok: false, error: 'Munitions Reserves cannot be used before combat rounds begin' }
    const opened = withLastRolls(state, [])
    const next = spaceCannonOffense(opened, ctx.systemId, ctx.attacker, seed)
    if (pendingFor(next)) return { ok: true, value: next }
    return { ok: true, value: preCombat(next, 'assault cannon', ctx, seed) }
  }
  if (wantAttacker && !canMunitions(state, ctx.attacker)) return { ok: false, error: 'Munitions Reserves is not available to the attacker' }
  if (wantDefender && !canMunitions(state, ctx.defender)) return { ok: false, error: 'Munitions Reserves is not available to the defender' }
  const salt = ctx.round * 4
  const a = combatRolls(state, ctx, ctx.attacker, 0, wantAttacker, seed, salt + 10)
  const d = combatRolls(state, ctx, ctx.defender, 0, wantDefender, seed, salt + 11)
  let next = state
  if (wantAttacker) next = payMunitions(next, ctx.attacker)
  if (wantDefender) next = payMunitions(next, ctx.defender)
  next = {
    ...next,
    log: [
      ...next.log,
      { t: 'roll', owner: ctx.attacker, rolls: a.rolls, context: `space combat round ${ctx.round}` },
      ...(a.rerollRolls.length ? [{ t: 'roll' as const, owner: ctx.attacker, rolls: a.rerollRolls, context: `space combat round ${ctx.round} reroll` }] : []),
      { t: 'roll', owner: ctx.defender, rolls: d.rolls, context: `space combat round ${ctx.round}` },
      ...(d.rerollRolls.length ? [{ t: 'roll' as const, owner: ctx.defender, rolls: d.rerollRolls, context: `space combat round ${ctx.round} reroll` }] : []),
    ],
  }
  next = withLastRolls(next, [...a.rolls, ...a.rerollRolls, ...d.rolls, ...d.rerollRolls])
  // R4.1 step 4: both sides have rolled, so the assignment order leaks nothing; the attacker's fleet goes first.
  // Duranium Armor repairs once per side, after that side's hits are assigned and never on a unit that sustained.
  const context = `combat round ${ctx.round}`
  next = resolveHits(next, ctx.systemId, ctx.attacker, [{ count: d.hits - d.restricted, mode: 'any' }, { count: d.restricted, mode: 'preferNonFighters' }], context)
  next = resolveHits(next, ctx.systemId, ctx.defender, [{ count: a.hits - a.restricted, mode: 'any' }, { count: a.restricted, mode: 'preferNonFighters' }], context)
  if (pendingFor(next)) return { ok: true, value: next }
  return { ok: true, value: finish(next, ctx) }
}

/** R4.1 step 5: adjacent systems that hold the retreating player's units or command token and no enemy ships. */
export function retreatTargets(state: GameState, seat: Seat): string[] {
  const tac = state.tactical
  if (!tac) return []
  return neighbours(state.systems, tac.systemId).filter(id => {
    const sys = state.systems[id]
    if (sys.space.some(u => u.owner !== seat && isShip(u.type))) return false
    return sys.activatedBy.includes(seat)
      || sys.space.some(u => u.owner === seat)
      || sys.planets.some(p => p.ground.some(u => u.owner === seat) || p.structures.some(u => u.owner === seat))
  })
}

/** R4.1 step 5: announcement only; the next `combatRound` fights the round and then carries it out. */
export function retreat(state: GameState, to: string): Result<GameState> {
  const tac = state.tactical
  if (!tac || tac.step !== 'spaceCombat' || !tac.combat) return { ok: false, error: 'not in a space combat' }
  if (pendingFor(state)) return { ok: false, error: 'hits must be assigned first' }
  const seat = state.active
  if (seat !== tac.combat.attacker) return { ok: false, error: 'R4.1: only the attacker may retreat' }
  if (tac.combat.round < 2) return { ok: false, error: 'R4.1: a retreat can only be announced before a round after the first' }
  if (tac.combat.retreating !== null) return { ok: false, error: 'a retreat is already announced' }
  if (!retreatTargets(state, seat).includes(to)) return { ok: false, error: `cannot retreat to ${to}` }
  return {
    ok: true,
    value: {
      ...state,
      tactical: { ...tac, combat: { ...tac.combat, retreating: seat, retreatTo: to } },
      log: [...state.log, { t: 'info', text: `seat ${seat} announces a retreat to ${to}` }],
    },
  }
}
