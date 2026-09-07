// src/engine/reactions.test.ts
import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { openCombatWindows, pendingReaction } from './reactions'
import { deepFreeze, shipId, toActionPhase, withPlanetOwner, withTactical, withUnits } from './testUtils'
import type { GameState, Seat, System, UnitType } from './types'

/** Puts exactly `cards` in a seat's hand. */
function withHand(state: GameState, seat: Seat, cards: string[]): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], actionCards: cards }
  return deepFreeze({ ...state, players })
}

/** Strips every ship of the seat's from the whole board, so a test's own fleet is the only one that exists. */
function clearFleet(state: GameState, seat: Seat): GameState {
  const systems: Record<string, System> = {}
  for (const [id, sys] of Object.entries(state.systems)) systems[id] = { ...sys, space: sys.space.filter(u => u.owner !== seat) }
  return deepFreeze({ ...state, systems })
}

/** Clears the system, puts both fleets in and builds the space combat state at the given round. */
function combat(systemId: string, attacker: UnitType[], defenderUnits: UnitType[], round: number, defender: Seat = 1, seed = 1): GameState {
  const base = toActionPhase(seed)
  const cleared: GameState = { ...base, systems: { ...base.systems, [systemId]: { ...base.systems[systemId], space: [] } } }
  const s = withUnits(withUnits(cleared, systemId, 0, attacker), systemId, defender, defenderUnits)
  return deepFreeze({
    ...s,
    tactical: { systemId, step: 'spaceCombat', combat: { round, attacker: 0, defender, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
  })
}

describe('R9 reaction windows: activation ("after you activate a system")', () => {
  it('opens for Flank Speed only when the extra move value actually helps, and playing it lets the ship reach', () => {
    // quann -> starpoint is 2 hops; a move-1 dreadnought cannot make it without help
    let s = clearFleet(toActionPhase(), 1)
    s = withUnits(s, 'quann', 1, ['dreadnought'])
    s = withHand(s, 1, ['flank_speed_1'])
    s = deepFreeze({ ...s, active: 1 })

    const opened = applyMove(s, { type: 'startTactical', systemId: 'starpoint' }, 0)
    if (!opened.ok) throw new Error(opened.error)
    expect(pendingReaction(opened.value)).toMatchObject({ kind: 'systemActivated', queue: [1] })
    expect(opened.value.active).toBe(1)
    expect(legalMoves(opened.value)).toContainEqual({ type: 'playActionCard', cardId: 'flank_speed_1', params: {} })

    const played = applyMove(opened.value, { type: 'playActionCard', cardId: 'flank_speed_1', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.pendingReactions).toEqual([])
    expect(played.value.players[1].actionCards).toEqual([])
    expect(played.value.effects).toContainEqual({ effect: 'flank_speed', seat: 1, scope: 'tactical' })

    const dread = shipId(played.value, 'quann', 'dreadnought', 1)
    const moved = applyMove(played.value, { type: 'moveShips', moves: [{ unitId: dread, from: 'quann', carrying: [] }] }, 0)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.value.systems.starpoint.space.some(u => u.id === dread)).toBe(true)
  })

  it('never opens when no held card would change anything', () => {
    let s = clearFleet(toActionPhase(), 1)
    s = withUnits(s, 'quann', 1, ['dreadnought'])
    s = withHand(s, 1, ['flank_speed_1'])
    s = deepFreeze({ ...s, active: 1 })
    // bereg is 1 hop from quann: the dreadnought already reaches it, so Flank Speed adds nothing
    const opened = applyMove(s, { type: 'startTactical', systemId: 'bereg' }, 0)
    if (!opened.ok) throw new Error(opened.error)
    expect(pendingReaction(opened.value)).toBeNull()
    expect(opened.value.active).toBe(1)
  })

  it('declining the window hands play back to the activating seat and movement proceeds normally', () => {
    let s = clearFleet(toActionPhase(), 1)
    s = withUnits(s, 'quann', 1, ['dreadnought'])
    s = withHand(s, 1, ['flank_speed_1'])
    s = deepFreeze({ ...s, active: 1 })
    const opened = applyMove(s, { type: 'startTactical', systemId: 'starpoint' }, 0)
    if (!opened.ok) throw new Error(opened.error)
    const declined = applyMove(opened.value, { type: 'declineReaction' }, 0)
    if (!declined.ok) throw new Error(declined.error)
    expect(declined.value.pendingReactions).toEqual([])
    expect(declined.value.active).toBe(1)
    expect(declined.value.players[1].actionCards).toEqual(['flank_speed_1'])   // the card was not spent
    // and the dreadnought still cannot make the 2-hop trip on its own
    const dread = shipId(declined.value, 'quann', 'dreadnought', 1)
    const moved = applyMove(declined.value, { type: 'moveShips', moves: [{ unitId: dread, from: 'quann', carrying: [] }] }, 0)
    expect(moved.ok).toBe(false)
  })

  it('Upgrade replaces a cruiser in the activated system with a dreadnought from reinforcements', () => {
    let s = clearFleet(toActionPhase(), 1)
    s = withUnits(s, 'quann', 1, ['cruiser'])
    s = withHand(s, 1, ['upgrade'])
    s = deepFreeze({ ...s, active: 1 })
    const opened = applyMove(s, { type: 'startTactical', systemId: 'quann' }, 0)
    if (!opened.ok) throw new Error(opened.error)
    expect(pendingReaction(opened.value)).toMatchObject({ kind: 'systemActivated' })
    const played = applyMove(opened.value, { type: 'playActionCard', cardId: 'upgrade', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    const units = played.value.systems.quann.space.filter(u => u.owner === 1)
    expect(units.map(u => u.type)).toEqual(['dreadnought'])
  })
})

describe('R9 reaction windows: combat round ("at the start of a combat round")', () => {
  it('opens at round 1 (not round 0), offers Morale Boost, and playing it lowers the roll needed to hit', () => {
    let s = combat('bereg', ['cruiser'], ['destroyer'], 1)
    s = withHand(s, 1, ['morale_boost_1'])
    const opened = openCombatWindows(s)
    expect(pendingReaction(opened)).toMatchObject({ kind: 'spaceCombatRound', round: 1, queue: [1] })   // seat 0 holds nothing, so the queue skips to seat 1

    const played = applyMove(opened, { type: 'playActionCard', cardId: 'morale_boost_1', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.pendingReactions).toEqual([])
    // seed 9: without Morale Boost the destroyer's die lands on 8, which misses its normal 9-to-hit — proof
    // the roll passing here is the boost lowering the threshold to 8, not chance.
    const fought = applyMove(played.value, { type: 'combatRound' }, 9)
    if (!fought.ok) throw new Error(fought.error)
    const destroyerRoll = fought.value.log.find(e => e.t === 'roll' && e.owner === 1 && e.context === 'space combat round 1')
    if (!destroyerRoll || destroyerRoll.t !== 'roll') throw new Error('no roll logged')
    expect(destroyerRoll.rolls[0]).toMatchObject({ value: 8, hit: true })

    const withoutCard = applyMove(combat('bereg', ['cruiser'], ['destroyer'], 1), { type: 'combatRound' }, 9)
    if (!withoutCard.ok) throw new Error(withoutCard.error)
    const plainRoll = withoutCard.value.log.find(e => e.t === 'roll' && e.owner === 1 && e.context === 'space combat round 1')
    expect(plainRoll?.t === 'roll' && plainRoll.rolls[0]).toMatchObject({ value: 8, hit: false })
  })

  it('does not open at round 0, and round 2 is not the first round of dice for Fighter Prototype', () => {
    let atRound0 = combat('bereg', ['fighter'], ['destroyer'], 0)
    atRound0 = withHand(atRound0, 0, ['fighter_prototype'])
    expect(pendingReaction(openCombatWindows(atRound0))).toBeNull()

    let atRound2 = combat('bereg', ['fighter'], ['destroyer'], 2)
    atRound2 = withHand(atRound2, 0, ['fighter_prototype'])
    expect(pendingReaction(openCombatWindows(atRound2))).toBeNull()
  })

  it('Fighter Prototype boosts only fighter rolls, at round 1', () => {
    let s = combat('bereg', ['fighter'], ['destroyer'], 1)
    s = withHand(s, 0, ['fighter_prototype'])
    const opened = openCombatWindows(s)
    expect(pendingReaction(opened)).toMatchObject({ queue: [0] })
    const played = applyMove(opened, { type: 'playActionCard', cardId: 'fighter_prototype', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    // seed 4: without Fighter Prototype the fighter's die lands on 8, which misses its normal 9-to-hit —
    // proof the hit below comes from the +2 boost dropping the threshold to 7, not chance.
    const fought = applyMove(played.value, { type: 'combatRound' }, 4)
    if (!fought.ok) throw new Error(fought.error)
    const fighterRoll = fought.value.log.find(e => e.t === 'roll' && e.owner === 0 && e.context === 'space combat round 1')
    if (!fighterRoll || fighterRoll.t !== 'roll') throw new Error('no roll logged')
    expect(fighterRoll.rolls[0]).toMatchObject({ value: 8, hit: true })

    const withoutCard = applyMove(combat('bereg', ['fighter'], ['destroyer'], 1), { type: 'combatRound' }, 4)
    if (!withoutCard.ok) throw new Error(withoutCard.error)
    const plainRoll = withoutCard.value.log.find(e => e.t === 'roll' && e.owner === 0 && e.context === 'space combat round 1')
    expect(plainRoll?.t === 'roll' && plainRoll.rolls[0]).toMatchObject({ value: 8, hit: false })
  })

  it('also opens for a ground combat round, at the same "start of a combat round" moment', () => {
    let s = withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1)
    s = withUnits(s, 'bereg', 0, ['infantry', 'infantry'], 'bereg')
    s = withUnits(s, 'bereg', 1, ['infantry'], 'bereg')
    s = withTactical(s, { systemId: 'bereg', step: 'invasion', invasion: { planetId: 'bereg', landed: [], bombarded: [], round: 1 } })
    s = withHand(s, 0, ['morale_boost_1'])
    const opened = openCombatWindows(s)
    expect(pendingReaction(opened)).toMatchObject({ kind: 'groundCombatRound', round: 1, queue: [0] })
    const played = applyMove(opened, { type: 'playActionCard', cardId: 'morale_boost_1', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.effects).toContainEqual({ effect: 'morale_boost', seat: 0, scope: 'groundRound', round: 1 })
  })

  it('Emergency Repairs clears sustained damage on the seat\'s units in the active system', () => {
    let s = combat('bereg', ['dreadnought'], ['destroyer'], 1)
    const dread = shipId(s, 'bereg', 'dreadnought', 0)
    s = deepFreeze({
      ...s,
      systems: { ...s.systems, bereg: { ...s.systems.bereg, space: s.systems.bereg.space.map(u => u.id === dread ? { ...u, damaged: true } : u) } },
    })
    s = withHand(s, 0, ['emergency_repairs'])
    const opened = openCombatWindows(s)
    expect(pendingReaction(opened)).toMatchObject({ queue: [0] })
    const played = applyMove(opened, { type: 'playActionCard', cardId: 'emergency_repairs', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.bereg.space.find(u => u.id === dread)?.damaged).toBe(false)
  })

  it('Skilled Retreat moves the seat\'s fleet out and ends the combat in a draw', () => {
    let s = combat('bereg', ['cruiser'], ['destroyer'], 1)
    s = withHand(s, 0, ['skilled_retreat_1'])
    const opened = openCombatWindows(s)
    expect(pendingReaction(opened)).toMatchObject({ queue: [0] })
    const played = applyMove(opened, { type: 'playActionCard', cardId: 'skilled_retreat_1', params: { systemId: 'home-n' } }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.bereg.space.some(u => u.owner === 0)).toBe(false)
    expect(played.value.systems['home-n'].space.some(u => u.owner === 0 && u.type === 'cruiser')).toBe(true)
    expect(played.value.tactical?.step).toBe('done')
  })
})

describe('R9 action-card effects are cleared with the tactical action that could have created them', () => {
  it('a Flank Speed effect does not survive into the next tactical action', () => {
    let s = clearFleet(toActionPhase(), 1)
    s = withUnits(s, 'quann', 1, ['dreadnought'])
    s = withHand(s, 1, ['flank_speed_1'])
    s = deepFreeze({ ...s, active: 1 })
    const opened = applyMove(s, { type: 'startTactical', systemId: 'starpoint' }, 0)
    if (!opened.ok) throw new Error(opened.error)
    const played = applyMove(opened.value, { type: 'playActionCard', cardId: 'flank_speed_1', params: {} }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.effects.length).toBeGreaterThan(0)
    const dread = shipId(played.value, 'quann', 'dreadnought', 1)
    const moved = applyMove(played.value, { type: 'moveShips', moves: [{ unitId: dread, from: 'quann', carrying: [] }] }, 0)
    if (!moved.ok) throw new Error(moved.error)
    const done = applyMove(moved.value, { type: 'endMovement' }, 0)
    if (!done.ok) throw new Error(done.error)
    const ended = applyMove(done.value, { type: 'endTactical' }, 0)
    if (!ended.ok) throw new Error(ended.error)
    expect(ended.value.effects).toEqual([])
  })
})
