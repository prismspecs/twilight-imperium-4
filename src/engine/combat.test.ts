// src/engine/combat.test.ts
import { describe, expect, it } from 'vitest'
import { unitStats } from '../data/units'
import { checkFleet, trimCargo } from './board'
import { applyCombatHits, assignmentComplete, assignmentTargets, autoAssign, isForcedAssignment, pendingFor, type HitGroup, type MunitionsRequest } from './combat'
import { applyMove, legalMoves, validateMove } from './index'
import { deepFreeze, hitsIn, shipId, toActionPhase, withPlanetOwner, withPlayer, withTechs, withUnits } from './testUtils'
import type { DieRoll, GameState, Move, Owner, Seat, Unit, UnitType } from './types'

const letnev = { faction: 'letnev' as const, techs: [] as string[] }

/** Clears the system, puts both fleets in and opens the space combat at the given round. */
function combat(systemId: string, attacker: UnitType[], defenderUnits: UnitType[], round: number, defender: Owner = 1, seed = 1): GameState {
  const base = toActionPhase(seed)
  const cleared: GameState = { ...base, systems: { ...base.systems, [systemId]: { ...base.systems[systemId], space: [] } } }
  const s = withUnits(withUnits(cleared, systemId, 0, attacker), systemId, defender, defenderUnits)
  return deepFreeze({
    ...s,
    tactical: { systemId, step: 'spaceCombat', combat: { round, attacker: 0, defender, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
  })
}

const fight = (state: GameState, seed = 7, munitions?: MunitionsRequest) => {
  const r = applyMove(deepFreeze(state), { type: 'combatRound', ...(munitions === undefined ? {} : { munitions }) }, seed)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Puts a batch of hits into the queue by hand, for the cases a real combat resolves without asking. */
function queue(state: GameState, owner: Seat, groups: HitGroup[], context = 'combat round 1'): GameState {
  const tac = state.tactical
  if (!tac?.combat) throw new Error('the fixture has no combat')
  return deepFreeze({ ...state, tactical: { ...tac, combat: { ...tac.combat, pending: [{ owner, groups, context }] } } })
}

const assign = (state: GameState, destroy: number[], sustain: number[], seed = 7) => {
  const r = applyMove(deepFreeze(state), { type: 'assignHits', destroy, sustain }, seed)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Plays the enumerated assignment until the queue is empty, the way a player would answer it. */
const settle = (state: GameState, seed: number) => {
  let s = state
  for (let i = 0; i < 20 && pendingFor(s); i++) {
    const move = legalMoves(s).find(m => m.type === 'assignHits')
    if (!move) throw new Error('no assignHits offered while hits are pending')
    s = assign(s, move.destroy, move.sustain, seed)
  }
  return s
}

const fightToEnd = (state: GameState, seed: number) => {
  let s = state
  for (let i = 0; i < 40 && s.tactical?.step === 'spaceCombat' && !pendingFor(s); i++) s = settle(fight(s, seed + i), seed + i)
  return s
}

const owned = (state: GameState, systemId: string, owner: Owner) => state.systems[systemId].space.filter(u => u.owner === owner)
const units = (spec: [UnitType, boolean][]): Unit[] => spec.map(([type, damaged], i) => ({ id: i + 1, type, owner: 0, damaged }))

describe('R4.1 dice', () => {
  it('sustain damage cancels first, then the destruction order applies', () => {
    const one = autoAssign(units([['dreadnought', false], ['fighter', false], ['cruiser', false]]), [{ count: 1, mode: 'any' }], letnev, false)
    expect(one.destroyed).toHaveLength(0)
    expect(one.units.find(u => u.type === 'dreadnought')?.damaged).toBe(true)
    const three = autoAssign(units([['dreadnought', true], ['fighter', false], ['cruiser', false], ['carrier', false]]), [{ count: 3, mode: 'any' }], letnev, false)
    expect(three.destroyed.map(u => u.type)).toEqual(['fighter', 'cruiser', 'carrier'])
  })
  it('Non-Euclidean Shielding cancels 2 hits with one sustain', () => {
    const plain = autoAssign(units([['dreadnought', false], ['fighter', false]]), [{ count: 2, mode: 'any' }], letnev, false)
    expect(plain.destroyed.map(u => u.type)).toEqual(['fighter'])
    const nes = autoAssign(units([['dreadnought', false], ['fighter', false]]), [{ count: 2, mode: 'any' }], letnev, true)
    expect(nes.destroyed).toHaveLength(0)
    expect(nes.units.find(u => u.type === 'dreadnought')?.damaged).toBe(true)
  })
  it('preferNonFighters hits ([0.0.1] and L1Z1X dreadnoughts) skip fighters while non-fighters remain', () => {
    const mixed = autoAssign(units([['fighter', false], ['cruiser', false]]), [{ count: 1, mode: 'preferNonFighters' }], letnev, false)
    expect(mixed.destroyed.map(u => u.type)).toEqual(['cruiser'])
    const only = autoAssign(units([['fighter', false], ['fighter', false]]), [{ count: 1, mode: 'preferNonFighters' }], letnev, false)
    expect(only.destroyed.map(u => u.type)).toEqual(['fighter'])
    expect(only.lost).toBe(0)
  })
  it('R4.1 step 6: noFighters hits (Graviton Laser System) that cannot be assigned are lost', () => {
    const mixed = autoAssign(units([['fighter', false], ['cruiser', false]]), [{ count: 2, mode: 'noFighters' }], letnev, false)
    expect(mixed.destroyed.map(u => u.type)).toEqual(['cruiser'])
    expect(mixed.lost).toBe(1)
    const fighters = autoAssign(units([['fighter', false], ['fighter', false]]), [{ count: 2, mode: 'noFighters' }], letnev, false)
    expect(fighters.destroyed).toHaveLength(0)
    expect(fighters.units).toHaveLength(2)
    expect(fighters.lost).toBe(2)
  })
  it('applyCombatHits itself never repairs; Duranium Armor repair is a separate post-round step (repairAfterRound)', () => {
    const base = combat('bereg', ['cruiser'], ['dreadnought', 'dreadnought'], 1)
    const ids = owned(base, 'bereg', 1).map(u => u.id)
    const damaged: GameState = {
      ...base,
      systems: { ...base.systems, bereg: { ...base.systems.bereg, space: base.systems.bereg.space.map(u => u.id === ids[1] ? { ...u, damaged: true } : u) } },
    }
    const hit: HitGroup[] = [{ count: 1, mode: 'any' }]
    const withDuranium = applyCombatHits(withTechs(damaged, 1, ['duranium_armor']), 'bereg', 1, hit)
    expect(withDuranium.systems.bereg.space.filter(u => u.owner === 1 && u.damaged)).toHaveLength(2)
    expect(withDuranium.systems.bereg.space.filter(u => u.owner === 1)).toHaveLength(2)
  })
  it('R4.1 step 4: Duranium Armor repairs one damaged unit after a round in which it did not sustain, but never in round 0', () => {
    const preDamage = (state: GameState): GameState => {
      const id = owned(state, 'bereg', 1)[0].id
      return { ...state, systems: { ...state.systems, bereg: { ...state.systems.bereg, space: state.systems.bereg.space.map(u => u.id === id ? { ...u, damaged: true } : u) } } }
    }
    const round0 = withTechs(preDamage(combat('bereg', ['cruiser'], ['dreadnought'], 0)), 1, ['duranium_armor'])
    const afterRound0 = fight(round0, 1)
    expect(owned(afterRound0, 'bereg', 1)[0]?.damaged).toBe(true)   // no repair happens during round 0

    const round2 = withTechs(preDamage(combat('bereg', ['cruiser'], ['dreadnought'], 2)), 1, ['duranium_armor'])
    const afterRound2 = fight(round2, 2)   // seed 2: both the cruiser and the dreadnought miss this round
    expect(owned(afterRound2, 'bereg', 1)[0]?.damaged).toBe(false)
  })
  it('destroyed units go back to the reinforcements', () => {
    const s = combat('bereg', ['cruiser'], ['cruiser'], 1)
    const after = applyCombatHits(s, 'bereg', 1, [{ count: 1, mode: 'any' }])
    expect(owned(after, 'bereg', 1)).toHaveLength(0)
    expect(after.players[1].reinforcements.cruiser).toBe(s.players[1].reinforcements.cruiser + 1)
  })
})

describe('R4.1 step 4: the owner assigns the hits', () => {
  it('a real choice queues the hits instead of assigning them', () => {
    const s = combat('bereg', ['cruiser', 'cruiser'], ['dreadnought', 'fighter', 'fighter'], 1)
    const after = fight(s, 3)   // seed 3: the attacker scores one hit, the defender none
    expect(owned(after, 'bereg', 1)).toHaveLength(3)                    // nothing destroyed
    expect(owned(after, 'bereg', 1).some(u => u.damaged)).toBe(false)   // and nothing sustained
    const pending = after.tactical?.combat?.pending ?? []
    expect(pending).toHaveLength(1)
    expect(pending[0].owner).toBe(1)
    expect(pending[0].groups.filter(g => g.count > 0)).toEqual([{ count: 1, mode: 'any' }])
    const moves = legalMoves(after)
    expect(moves.some(m => m.type === 'assignHits')).toBe(true)
    expect(moves.some(m => m.type === 'combatRound')).toBe(false)
    expect(after.tactical?.combat?.round).toBe(1)                       // the round is not over until the hits are assigned
  })
  it('the queue is the only thing on offer while it is filled', () => {
    const s = fight(combat('bereg', ['cruiser', 'cruiser'], ['dreadnought', 'fighter', 'fighter'], 1), 3)
    expect(legalMoves(s).map(m => m.type)).toEqual(['assignHits'])
    for (const move of [{ type: 'combatRound' }, { type: 'endTactical' }, { type: 'pass' }, { type: 'retreat', to: 'home-n' }] as Move[]) {
      const rejected = validateMove(s, move)
      expect(rejected.ok ? '' : rejected.error).toBe('hits must be assigned first')
      const applied = applyMove(s, move, 3)
      expect(applied.ok ? '' : applied.error).toBe('hits must be assigned first')
    }
  })
  it('the picks have to be the assigning seat\'s own ships and cannot be both destroyed and sustained', () => {
    const s = fight(combat('bereg', ['cruiser', 'cruiser'], ['dreadnought', 'fighter', 'fighter'], 1), 3)
    const dread = shipId(s, 'bereg', 'dreadnought', 1)
    const reject = (destroy: number[], sustain: number[]) => {
      const r = applyMove(s, { type: 'assignHits', destroy, sustain }, 3)
      return r.ok ? '' : r.error
    }
    expect(reject([shipId(s, 'bereg', 'cruiser', 0)], [])).toBe('not your hits')
    expect(reject([9999], [])).toBe('no ship 9999 in bereg')
    expect(reject([dread], [dread])).toBe('a ship cannot be picked twice')
    expect(reject([], [shipId(s, 'bereg', 'fighter', 1)])).toBe('a fighter cannot sustain damage')
    expect(reject([], [])).toBe('the hits are not assigned completely')
    expect(reject([dread, shipId(s, 'bereg', 'fighter', 1)], [])).toBe('the hits are not assigned completely')   // one hit, two ships
    const damaged = assign(s, [], [dread])
    expect(owned(damaged, 'bereg', 1).find(u => u.type === 'dreadnought')?.damaged).toBe(true)
    expect(pendingFor(damaged)).toBeNull()
    expect(damaged.tactical?.combat?.round).toBe(2)   // the round is finished by the last assignment
    expect(damaged.log.some(e => e.t === 'info' && e.text === 'B assigns 1 hits: dreadnought sustains')).toBe(true)
  })
  it('R4.1 step 4: a sustained ship can be destroyed later, but not by the same batch', () => {
    const s = fight(combat('bereg', ['cruiser', 'cruiser'], ['dreadnought', 'fighter', 'fighter'], 1), 3)
    const dread = shipId(s, 'bereg', 'dreadnought', 1)
    const damaged = assign(s, [], [dread])
    const next = queue(damaged, 1, [{ count: 1, mode: 'any' }])   // one more hit, with the dreadnought damaged
    expect(assignmentTargets(next).sustain).toHaveLength(0)       // it cannot sustain twice
    expect(assignmentComplete(next, [dread], [])).toBe(true)      // but it is still a ship the hit may destroy
    expect(owned(assign(next, [dread], []), 'bereg', 1).map(u => u.type)).toEqual(['fighter', 'fighter'])
  })
  it('R4.1 step 4: each sustain absorbs one hit, two with Non-Euclidean Shielding', () => {
    const two = queue(combat('bereg', ['cruiser'], ['dreadnought', 'fighter'], 1), 1, [{ count: 2, mode: 'any' }])
    const dread = shipId(two, 'bereg', 'dreadnought', 1)
    const fighter = shipId(two, 'bereg', 'fighter', 1)
    expect(assignmentComplete(two, [], [dread])).toBe(false)               // one sustain leaves a hit over
    expect(assignmentComplete(two, [fighter], [dread])).toBe(true)
    expect(assignmentComplete(two, [fighter, dread], [])).toBe(true)       // losing both is a legal answer as well
    const shielded = withTechs(two, 1, ['non_euclidean_shielding'])
    expect(assignmentComplete(shielded, [], [dread])).toBe(true)           // one sustain cancels both hits
    expect(assignmentComplete(shielded, [fighter], [dread])).toBe(false)   // and then the fighter absorbs nothing
  })
  it('R4.1 step 6: a restricted hit has to be taken by a non-fighter ship while there is one', () => {
    const s = queue(combat('bereg', ['cruiser'], ['fighter', 'fighter', 'cruiser'], 1), 1, [{ count: 1, mode: 'noFighters' }])
    const cruiser = shipId(s, 'bereg', 'cruiser', 1)
    expect(assignmentTargets(s).destroy.map(u => u.id)).toEqual([cruiser])   // the fighters are no legal target
    expect(assignmentComplete(s, [cruiser], [])).toBe(true)
    expect(assignmentComplete(s, [shipId(s, 'bereg', 'fighter', 1)], [])).toBe(false)
    expect(assignmentComplete(s, [], [])).toBe(false)
    expect(isForcedAssignment(units([['fighter', false], ['fighter', false], ['cruiser', false]]), [{ count: 1, mode: 'noFighters' }], letnev, false)).toBe(true)
  })
  it('rule 4: batches with no decision in them are assigned by the engine and never queued', () => {
    const hit: HitGroup[] = [{ count: 1, mode: 'any' }]
    // three hits against two ships: everything dies whatever is picked, and the third hit is lost
    expect(isForcedAssignment(units([['cruiser', false], ['fighter', false]]), [{ count: 3, mode: 'any' }], letnev, false)).toBe(true)
    expect(isForcedAssignment(units([['fighter', false], ['fighter', false], ['fighter', false]]), [{ count: 2, mode: 'any' }], letnev, false)).toBe(true)
    // a restricted hit with nothing to take it is lost, so there is nothing to decide either
    expect(isForcedAssignment(units([['fighter', false], ['fighter', false]]), hit.map(g => ({ ...g, mode: 'noFighters' as const })), letnev, false)).toBe(true)
    expect(isForcedAssignment(units([['cruiser', false], ['fighter', false]]), hit, letnev, false)).toBe(false)      // two classes: a choice
    expect(isForcedAssignment(units([['dreadnought', false]]), hit, letnev, false)).toBe(false)                      // sustain or die: a choice
    expect(isForcedAssignment(units([['dreadnought', true], ['dreadnought', true]]), hit, letnev, false)).toBe(true) // damaged twins: none
  })
  it('R4.1 step 4: the guardian fleet assigns its own hits, the seat still assigns theirs', () => {
    const s = combat('mecatol', ['dreadnought', 'fighter'], ['cruiser', 'fighter'], 1, 'guardian')
    const after = fight(s, 12)   // seed 12: one hit each way
    // resolved without asking; the hit came from an L1Z1X dreadnought, so it had to take the non-fighter ship
    expect(owned(after, 'mecatol', 'guardian').map(u => u.type)).toEqual(['fighter'])
    expect(after.log.some(e => e.t === 'info' && e.text === '1 hits assigned automatically in mecatol')).toBe(true)
    const queued = after.tactical?.combat?.pending ?? []
    expect(queued.map(p => p.owner)).toEqual([0])                                      // and only the seat is asked
    expect(assignmentTargets(after).sustain.map(u => u.type)).toEqual(['dreadnought'])
    const settled = settle(after, 12)
    expect(pendingFor(settled)).toBeNull()
    expect(settled.tactical?.combat?.round).toBe(2)
  })
  it('R4.1 step 6: a round 0 that stops on a space cannon hit runs its remaining steps after the assignment', () => {
    const base = combat('bereg', ['dreadnought', 'fighter'], ['destroyer'], 0)
    const s = withUnits(base, 'bereg', 1, ['pds'], 'bereg')
    const stopped = fight(s, 1)   // seed 1: the PDS scores the hit the attacker now has to place
    expect(pendingFor(stopped)).toMatchObject({ owner: 0, context: 'space cannon offense' })
    expect(stopped.log.some(e => e.t === 'roll' && e.context === 'anti-fighter barrage')).toBe(false)
    expect(stopped.tactical?.combat?.round).toBe(0)
    const after = assign(stopped, [shipId(stopped, 'bereg', 'fighter', 0)], [])
    expect(after.log.some(e => e.t === 'roll' && e.context === 'anti-fighter barrage')).toBe(true)
    expect(after.tactical?.combat?.round).toBe(1)   // the pre-combat sequence ran to its end
  })
})

describe('R4.1 space combat', () => {
  it('R4.1 step 1: every PDS that is not the active player fires, guardian defender included', () => {
    const base = combat('mecatol', ['fighter', 'fighter', 'fighter'], ['cruiser'], 0, 'guardian')
    const s = withUnits(withPlanetOwner(base, 'mecatol', 'mecatol-rex', 1), 'mecatol', 1, ['pds'], 'mecatol-rex')
    const after = fight(s)
    const entries = after.log.filter(e => e.t === 'roll' && e.context === 'space cannon offense')
    expect(entries).toHaveLength(1)
    expect(entries[0].t === 'roll' && entries[0].owner).toBe(1)
    expect(owned(after, 'mecatol', 0)).toHaveLength(3 - hitsIn(after, 'space cannon offense'))
    expect(after.tactical?.combat?.round).toBe(1)
  })
  it('R4.1 step 1: Graviton Laser System hits are lost against a fighter-only fleet', () => {
    const base = combat('bereg', ['fighter', 'fighter'], ['cruiser'], 0)
    const s = withTechs(withUnits(base, 'bereg', 1, ['pds'], 'bereg'), 1, ['graviton_laser_system'])
    const after = fight(s)
    expect(after.log.some(e => e.t === 'roll' && e.context === 'space cannon offense')).toBe(true)
    expect(owned(after, 'bereg', 0).filter(u => u.type === 'fighter')).toHaveLength(2)
    expect(pendingFor(after)).toBeNull()   // nothing could take those hits, so there is nothing to assign
  })
  it('R4.1 step 2: anti-fighter barrage only destroys fighters', () => {
    const s = combat('bereg', ['fighter', 'fighter', 'cruiser'], ['destroyer'], 0)
    const after = fight(s)
    const hits = hitsIn(after, 'anti-fighter barrage')
    expect(owned(after, 'bereg', 0).filter(u => u.type === 'fighter')).toHaveLength(Math.max(0, 2 - hits))
    expect(owned(after, 'bereg', 0).some(u => u.type === 'cruiser')).toBe(true)
  })
  it('R4.1 step 6: the pre-combat steps run as space cannon offense, Assault Cannon, anti-fighter barrage', () => {
    const base = combat('bereg', ['cruiser', 'cruiser', 'cruiser', 'cruiser', 'cruiser'], ['destroyer', 'destroyer'], 0)
    const s = withTechs(withUnits(base, 'bereg', 1, ['pds'], 'bereg'), 0, ['assault_cannon'])
    const after = fight(s)
    const order = after.log.flatMap(e =>
      e.t === 'roll' && e.context === 'space cannon offense' ? ['cannon']
        : e.t === 'info' && e.text.startsWith('Assault Cannon') ? ['assault']
          : e.t === 'roll' && e.context === 'anti-fighter barrage' ? ['barrage'] : [])
    expect(order).toEqual(['cannon', 'assault', 'barrage'])
    expect(owned(after, 'bereg', 1).filter(u => u.type === 'destroyer')).toHaveLength(1)
  })
  it('R4.1 step 6: Assault Cannon is one restricted hit and the victim\'s owner answers it', () => {
    const s = withTechs(combat('bereg', ['cruiser', 'cruiser', 'cruiser'], ['dreadnought', 'fighter'], 0), 0, ['assault_cannon'])
    const queued = fight(s)
    expect(owned(queued, 'bereg', 1)).toHaveLength(2)   // nothing is destroyed before the owner has picked
    expect(pendingFor(queued)).toMatchObject({ owner: 1, groups: [{ count: 1, mode: 'noFighters' }], context: 'assault cannon' })
    const dread = shipId(queued, 'bereg', 'dreadnought', 1)
    const destroyed = assign(queued, [dread], [])
    expect(owned(destroyed, 'bereg', 1).map(u => u.type)).toEqual(['fighter'])
    expect(destroyed.players[1].reinforcements.dreadnought).toBe(s.players[1].reinforcements.dreadnought + 1)
    // the fighter is no legal target for a restricted hit, and sustaining it is the owner's other option
    const sustained = assign(queued, [], [dread])
    expect(owned(sustained, 'bereg', 1).find(u => u.type === 'dreadnought')?.damaged).toBe(true)
    expect(sustained.tactical?.combat?.round).toBe(1)   // and the pre-combat steps ran on to the end of round 0
    expect(applyMove(queued, { type: 'assignHits', destroy: [shipId(queued, 'bereg', 'fighter', 1)], sustain: [] }, 7).ok).toBe(false)
  })
  it('R4.1 step 3: a combat round rolls every ship, logs both sides and is deterministic for a seed', () => {
    const s = combat('bereg', ['cruiser', 'cruiser'], ['carrier'], 1)
    const after = fight(s)
    expect(after.log.filter(e => e.t === 'roll' && e.context === 'space combat round 1')).toHaveLength(2)
    expect(after.tactical?.combat?.round).toBe(2)
    expect(after.tactical?.combat?.lastRolls.length).toBe(3)
    expect(JSON.stringify(fight(s).systems.bereg.space)).toBe(JSON.stringify(after.systems.bereg.space))
  })
  it('the move entry is logged before the dice rolls it produced', () => {
    const s = combat('bereg', ['cruiser', 'cruiser'], ['carrier'], 1)
    const added = fight(s).log.slice(s.log.length).map(e => e.t)
    expect(added[0]).toBe('move')
    expect(added).toContain('roll')
  })
  it('R4.1 step 3: Munitions Reserves costs Letnev 2 trade goods and is per side (a flag never spends the other side\'s goods)', () => {
    const base = withPlayer(combat('bereg', ['cruiser'], ['cruiser'], 1), 1, { tradeGoods: 3 })
    const defenderUse = fight(base, 7, { defender: true })   // seat 1 is Letnev by the fixture's default faction
    expect(defenderUse.players[1].tradeGoods).toBe(1)
    expect(defenderUse.players[0].tradeGoods).toBe(base.players[0].tradeGoods)
    expect(applyMove(base, { type: 'combatRound', munitions: { attacker: true } }, 7).ok).toBe(false)   // seat 0 is l1z1x, not Letnev

    // force both seats to Letnev to prove requesting one side's flag never touches the other side's trade goods
    const bothLetnev = withPlayer(withPlayer(base, 0, { faction: 'letnev', tradeGoods: 5 }), 1, { tradeGoods: 5 })
    const attackerUse = fight(bothLetnev, 7, { attacker: true })
    expect(attackerUse.players[0].tradeGoods).toBe(3)
    expect(attackerUse.players[1].tradeGoods).toBe(5)
  })
  it('R4.1 step 6: Munitions Reserves cannot be requested before combat rounds begin (round 0)', () => {
    const s = withPlayer(combat('bereg', ['cruiser'], ['cruiser'], 0), 1, { tradeGoods: 3 })
    expect(applyMove(s, { type: 'combatRound', munitions: { defender: true } }, 7).ok).toBe(false)
  })
  it('R4.1 step 3: a rerolled miss is logged as the original roll plus a separate "... reroll" entry, only for the side that requested it', () => {
    const base = withPlayer(withPlayer(combat('bereg', ['cruiser'], ['cruiser'], 1), 0, { faction: 'letnev', tradeGoods: 4 }), 1, { tradeGoods: 4 })
    const after = fight(base, 1, { attacker: true })   // seed 1: the attacker's single die misses at round 1, triggering a reroll
    const original = after.log.filter(e => e.t === 'roll' && e.context === 'space combat round 1' && e.owner === 0)
    const reroll = after.log.filter(e => e.t === 'roll' && e.context === 'space combat round 1 reroll' && e.owner === 0)
    expect(original).toHaveLength(1)
    expect(original[0].t === 'roll' && original[0].rolls).toHaveLength(1)
    expect(reroll).toHaveLength(1)
    expect(reroll[0].t === 'roll' && reroll[0].rolls).toHaveLength(1)
    expect(after.log.some(e => e.t === 'roll' && e.context.includes('reroll') && e.owner === 1)).toBe(false)   // the defender never requested it
  })
  it('R4.1 step 6: round 0 stops after a pre-combat step that wipes a side; no barrage against an empty fleet', () => {
    const base = combat('bereg', ['fighter'], ['destroyer'], 0)
    const s = withUnits(base, 'bereg', 1, ['pds'], 'bereg')
    const after = fight(s, 1)   // seed 1: the lone PDS hits the lone attacker fighter
    expect(owned(after, 'bereg', 0)).toHaveLength(0)
    expect(after.log.some(e => e.t === 'roll' && e.context === 'anti-fighter barrage')).toBe(false)
    expect(after.tactical?.step).toBe('done')
  })
  it('R4.1 step 6: the combat ends when one side has no ships and the winner goes on', () => {
    const after = fightToEnd(combat('bereg', ['dreadnought', 'dreadnought', 'cruiser'], ['fighter'], 1), 100)
    const attackerLeft = owned(after, 'bereg', 0).length > 0
    // R4.3: the winner carries no infantry and Bereg holds no enemy ground forces, so there is no invasion to open
    expect(after.tactical?.step).toBe('done')
    expect(owned(after, 'bereg', 1)).toHaveLength(attackerLeft ? 0 : 1)
  })
  it('R7: a win over the guardians is not a win over an opponent, so the public objective stays unfulfilled', () => {
    const after = fightToEnd(combat('mecatol', ['dreadnought', 'dreadnought', 'cruiser'], ['fighter'], 1, 'guardian'), 200)
    expect(after.players[0].spaceCombatWins).toBe(0)
  })
  it('R7: the defender that wipes the attacker also counts as winning the space combat', () => {
    const after = fightToEnd(combat('mecatol', ['fighter'], ['dreadnought', 'dreadnought', 'dreadnought'], 1, 1), 500)
    expect(owned(after, 'mecatol', 0)).toHaveLength(0)
    expect(after.tactical?.step).toBe('done')
    expect(after.players[1].spaceCombatWins).toBe(1)
    expect(after.players[0].spaceCombatWins).toBe(0)
  })
  it('R7: a space combat won anywhere counts for the objective', () => {
    const after = fightToEnd(combat('home-n', ['fighter'], ['dreadnought', 'dreadnought', 'dreadnought'], 1, 1), 600)
    expect(owned(after, 'home-n', 0)).toHaveLength(0)
    expect(after.players[1].spaceCombatWins).toBe(1)
    expect(after.players[0].spaceCombatWins).toBe(0)
  })
  it('R4.1 step 5: the retreat is announced before a round and carried out after it', () => {
    expect(applyMove(combat('bereg', ['dreadnought'], ['dreadnought'], 1), { type: 'retreat', to: 'home-n' }, 0).ok).toBe(false)
    const later = combat('bereg', ['dreadnought'], ['dreadnought'], 2)
    expect(applyMove(later, { type: 'retreat', to: 'quann' }, 0).ok).toBe(false)                             // no units and no token there
    expect(applyMove(withPlanetOwner(later, 'quann', 'quann', 0), { type: 'retreat', to: 'quann' }, 0).ok).toBe(false)   // a controlled planet is not enough
    const announced = applyMove(later, { type: 'retreat', to: 'home-n' }, 0)
    if (!announced.ok) throw new Error(announced.error)
    expect(announced.value.tactical?.combat).toMatchObject({ retreating: 0, retreatTo: 'home-n' })
    expect(announced.value.tactical?.step).toBe('spaceCombat')
    expect(owned(announced.value, 'bereg', 0)).toHaveLength(1)                                              // nothing has moved yet
    expect(applyMove(announced.value, { type: 'retreat', to: 'home-n' }, 0).ok).toBe(false)                  // one announcement per combat
    // one dreadnought per side rolls at most one hit, which the other side sustains, so both survive the round
    const after = fight(announced.value, 3)
    expect(owned(after, 'bereg', 0)).toHaveLength(0)
    expect(owned(after, 'home-n', 0).filter(u => u.type === 'dreadnought')).toHaveLength(2)
    expect(after.tactical?.step).toBe('done')
    expect(after.log.some(e => e.t === 'info' && e.text.includes('retreats'))).toBe(true)
  })
  it('R4.4: a retreat over the fleet pool destroys the cheapest excess non-fighter ships at the destination', () => {
    // home-n already holds the L1Z1X dreadnought and carrier plus an added cruiser: 3 non-fighter ships is
    // exactly the fleet pool, so the retreating dreadnought is one too many and the cruiser is the cheapest
    const crowded = withUnits(combat('bereg', ['dreadnought'], ['dreadnought'], 2), 'home-n', 0, ['cruiser'])
    const announced = applyMove(crowded, { type: 'retreat', to: 'home-n' }, 0)
    if (!announced.ok) throw new Error(announced.error)
    const after = fight(announced.value, 3)   // seed 3: both dreadnoughts survive the round, so the retreat runs
    expect(after.tactical?.step).toBe('done')
    expect(owned(after, 'home-n', 0).filter(u => u.type === 'cruiser')).toHaveLength(0)
    expect(after.players[0].reinforcements.cruiser).toBe(crowded.players[0].reinforcements.cruiser + 1)
    expect(owned(after, 'home-n', 0).filter(u => u.type === 'dreadnought')).toHaveLength(2)
    expect(owned(after, 'home-n', 0).filter(u => u.type !== 'fighter')).toHaveLength(3)
    expect(after.log.some(e => e.t === 'info' && e.text.includes('beyond the fleet pool'))).toBe(true)
  })
  it('R4.1 step 5: a structure (PDS or space dock) on a planet counts as the attacker\'s presence for a retreat target', () => {
    const later = combat('bereg', ['dreadnought'], ['dreadnought'], 2)
    const withDock = withUnits(later, 'quann', 0, ['spacedock'], 'quann')
    expect(applyMove(withDock, { type: 'retreat', to: 'quann' }, 0).ok).toBe(true)
  })
  it('R4.1 step 5: an announced retreat is dropped when the combat ends in that round', () => {
    const announced = applyMove(combat('bereg', ['dreadnought', 'dreadnought', 'cruiser'], ['fighter'], 2), { type: 'retreat', to: 'home-n' }, 0)
    if (!announced.ok) throw new Error(announced.error)
    const after = fightToEnd(announced.value, 400)
    // R4.3: whoever is left has nothing to land and nothing to bombard, so the action goes straight to the end
    expect(after.tactical?.step).toBe('done')
  })
  it('R4.1 step 6: carried infantry are trimmed when the combat ends, not after a single round', () => {
    const base = withUnits(combat('bereg', ['carrier'], ['cruiser', 'cruiser', 'cruiser'], 1), 'bereg', 0, ['infantry', 'infantry'])
    expect(unitStats('carrier', letnev).capacity).toBe(4)
    const after = fightToEnd(base, 300)
    const mine = owned(after, 'bereg', 0)
    expect(mine.filter(u => u.type === 'infantry')).toHaveLength(mine.some(u => u.type === 'carrier') ? 2 : 0)
  })
})

describe('trimCargo (cargo above capacity at combat end)', () => {
  it('R4.4: a space dock (I or II) adds up to 3 free fighter slots on top of ship capacity', () => {
    const base = withUnits(toActionPhase(), 'bereg', 0, ['fighter', 'fighter', 'fighter', 'fighter', 'fighter'])
    const s = withTechs(withUnits(base, 'bereg', 0, ['spacedock'], 'bereg'), 0, ['space_dock_ii'])
    const trimmed = trimCargo(s, 'bereg', 0)
    expect(trimmed.systems.bereg.space.filter(u => u.owner === 0 && u.type === 'fighter')).toHaveLength(3)
    expect(trimmed.players[0].reinforcements.fighter).toBe(s.players[0].reinforcements.fighter + 2)
  })
  it('Fighter II fighters above capacity are kept up to the remaining fleet pool, the rest destroyed', () => {
    const base = withUnits(toActionPhase(), 'bereg', 0, ['cruiser', 'fighter', 'fighter', 'fighter', 'fighter', 'fighter'])
    const s = withTechs(base, 0, ['fighter_ii'])
    const trimmed = trimCargo(s, 'bereg', 0)
    // fleet pool 3 (l1z1x), one cruiser already counts against it, so 2 excess fighters survive as loose ships
    expect(trimmed.systems.bereg.space.filter(u => u.owner === 0 && u.type === 'fighter')).toHaveLength(2)
    expect(trimmed.players[0].reinforcements.fighter).toBe(s.players[0].reinforcements.fighter + 3)
  })
  it('R4.4: a space dock\'s free slots are fighter-only, so the infantry is trimmed and the fighters stay', () => {
    // a destroyer carries nothing, so the only room is the dock's 3 fighter-only slots
    const base = withUnits(toActionPhase(), 'bereg', 0, ['destroyer', 'fighter', 'fighter', 'infantry', 'infantry'])
    const s = withTechs(withUnits(base, 'bereg', 0, ['spacedock'], 'bereg'), 0, ['space_dock_ii'])
    const trimmed = trimCargo(s, 'bereg', 0)
    const mine = trimmed.systems.bereg.space.filter(u => u.owner === 0)
    expect(mine.filter(u => u.type === 'fighter')).toHaveLength(2)
    expect(mine.filter(u => u.type === 'infantry')).toHaveLength(0)
    expect(trimmed.players[0].reinforcements.infantry).toBe(s.players[0].reinforcements.infantry + 2)
    expect(checkFleet(trimmed, 0, 'bereg').ok).toBe(true)
  })
})

describe('Mentak faction ability: Ambush', () => {
  it('rolls 2 dice per cruiser/destroyer for up to 2 ships at the start of space combat', () => {
    const base = combat('bereg', ['cruiser', 'cruiser', 'carrier'], ['fighter', 'fighter', 'fighter', 'fighter'], 0)
    const mentakState: GameState = {
      ...base,
      players: [
        { ...base.players[0], faction: 'mentak' },
        base.players[1],
      ],
    }
    const after = fight(mentakState, 100)
    const ambushRoll = after.log.find(e => e.t === 'roll' && e.context === 'Mentak Ambush') as { t: 'roll'; owner: Owner; rolls: DieRoll[]; context: string } | undefined
    expect(ambushRoll).toBeDefined()
    expect(ambushRoll?.owner).toBe(0)
    // 2 cruisers * 2 dice = 4 dice
    expect(ambushRoll?.rolls).toHaveLength(4)
    expect(ambushRoll?.rolls.every(r => r.unit === 'cruiser')).toBe(true)
    expect(ambushRoll?.rolls.every(r => typeof r.hit === 'boolean')).toBe(true)
    expect(after.log.some(e => e.t === 'info' && e.text.includes('Mentak') && e.text.includes('Ambush'))).toBe(true)
  })

  it('caps at 2 ships even with 3 cruisers and 1 destroyer in the system', () => {
    const base = combat('bereg', ['cruiser', 'cruiser', 'cruiser', 'destroyer'], ['dreadnought', 'dreadnought'], 0)
    const mentakState: GameState = {
      ...base,
      players: [
        { ...base.players[0], faction: 'mentak' },
        base.players[1],
      ],
    }
    const after = fight(mentakState, 100)
    const ambushRoll = after.log.find(e => e.t === 'roll' && e.context === 'Mentak Ambush') as { t: 'roll'; rolls: unknown[] } | undefined
    expect(ambushRoll).toBeDefined()
    // Exactly 2 ships * 2 dice = 4 dice max
    expect(ambushRoll?.rolls).toHaveLength(4)
  })

  it('prioritizes cruisers over destroyers when selecting the 2 ships to ambush with', () => {
    const base = combat('bereg', ['cruiser', 'destroyer', 'destroyer'], ['carrier', 'fighter'], 0)
    const mentakState: GameState = {
      ...base,
      players: [
        { ...base.players[0], faction: 'mentak' },
        base.players[1],
      ],
    }
    const after = fight(mentakState, 100)
    const ambushRoll = after.log.find(e => e.t === 'roll' && e.context === 'Mentak Ambush') as { t: 'roll'; rolls: { unit: string }[] } | undefined
    expect(ambushRoll).toBeDefined()
    // 1 cruiser (2 dice) + 1 destroyer (2 dice)
    const cruiserDice = ambushRoll?.rolls.filter(r => r.unit === 'cruiser')
    const destroyerDice = ambushRoll?.rolls.filter(r => r.unit === 'destroyer')
    expect(cruiserDice).toHaveLength(2)
    expect(destroyerDice).toHaveLength(2)
  })

  it('does not trigger Ambush for non-Mentak factions', () => {
    const base = combat('bereg', ['cruiser', 'cruiser'], ['fighter', 'fighter'], 0)
    const after = fight(base, 100)
    const ambushRoll = after.log.find(e => e.t === 'roll' && e.context === 'Mentak Ambush')
    expect(ambushRoll).toBeUndefined()
  })
})
