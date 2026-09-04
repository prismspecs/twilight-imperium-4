// src/engine/objectives.test.ts
import { describe, expect, it } from 'vitest'
import { FIRST_STRIKE, FOOTHOLD, PUBLIC_OBJECTIVES } from '../data/objectives'
import { createGame } from './setup'
import { addVp, controlsMecatol, fulfils, scoreObjective, scoreable } from './objectives'
import { DUEL_CONFIG, deepFreeze, toActionPhase, withPlanetOwner, withPlayer, withThirdSeat, withUnits } from './testUtils'
import type { GameState } from './types'

/** Gives seat 0 the four neutral ring planets used by the control objectives. */
function withRing(state: GameState): GameState {
  let s = withPlanetOwner(state, 'bereg', 'bereg', 0)
  s = withPlanetOwner(s, 'bereg', 'lirta-iv', 0)
  s = withPlanetOwner(s, 'quann', 'quann', 0)
  return withPlanetOwner(s, 'sakulag', 'sakulag', 0)
}

describe('R7 objectives', () => {
  it('R7: win a space combat against your opponent, a guardian fleet does not count', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'win_space_combat')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { spaceCombatWins: 1 }), 0, 'win_space_combat')).toBe(true)
  })
  it('R7: control 4 planets outside your home system', () => {
    const s = toActionPhase()
    expect(fulfils(withPlanetOwner(withRing(s), 'sakulag', 'sakulag', null), 0, 'control_4_outside_home')).toBe(false)
    expect(fulfils(withRing(s), 0, 'control_4_outside_home')).toBe(true)
    expect(fulfils(withRing(s), 1, 'control_4_outside_home')).toBe(false)
  })
  it('R7: spend 6 resources in a single round, however they were spent', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 5 }), 0, 'spend_6_resources')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 6 }), 0, 'spend_6_resources')).toBe(true)
  })
  it('R7: trade three times, at the posts or with the opponent', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { trades: 2 }), 0, 'trade_three_times')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { trades: 3 }), 0, 'trade_three_times')).toBe(true)
  })
  it('R7: have more ships on the board than your opponent, every ship type counts', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'more_ships')).toBe(true)                                   // 5 against 4 at setup
    expect(fulfils(s, 1, 'more_ships')).toBe(false)
    expect(fulfils(withUnits(s, 'bereg', 1, ['fighter', 'fighter']), 1, 'more_ships')).toBe(true)
    // a tie is not "more"
    expect(fulfils(withUnits(s, 'bereg', 1, ['fighter']), 0, 'more_ships')).toBe(false)
  })
  it('R7 First Strike: the first space combat won in Mecatol Rex takes the point, and only that one', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, FIRST_STRIKE.id)).toBe(false)
    const claimed = deepFreeze({ ...s, mecatolCombatWinner: 0 as const })
    expect(fulfils(claimed, 0, FIRST_STRIKE.id)).toBe(true)
    expect(fulfils(claimed, 1, FIRST_STRIKE.id)).toBe(false)
  })
  it('R7 Foothold: a planet taken in the opponent home system, one for each player', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, FOOTHOLD.id)).toBe(false)
    expect(fulfils(withPlanetOwner(s, 'home-s', 'wren-terra', 0), 0, FOOTHOLD.id)).toBe(true)
    expect(fulfils(withPlanetOwner(s, 'home-n', '000', 1), 1, FOOTHOLD.id)).toBe(true)
    expect(fulfils(s, 0, 'no_such_objective')).toBe(false)
  })
  it('R7: N-player objectives compare against any other seat, not a single opponent', () => {
    // seat 0: 5 ships, seat 1: 4 ships, seat 2: none on this two-player map
    const s = withThirdSeat(toActionPhase())
    expect(fulfils(s, 0, 'more_ships')).toBe(true)            // 5 > seat 2's 0
    expect(fulfils(s, 2, 'more_ships')).toBe(false)           // 0 beats nobody
    // foothold: seat 0 taking seat 1's home system counts with a third seat present too
    expect(fulfils(withPlanetOwner(s, 'home-s', 'wren-terra', 0), 0, FOOTHOLD.id)).toBe(true)
  })
  it('R7: the pool is shuffled per game and one objective is revealed at setup', () => {
    const ids = PUBLIC_OBJECTIVES.map(o => o.id).sort()
    const orders = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => createGame(DUEL_CONFIG, seed).objectiveOrder)
    for (const order of orders) {
      expect([...order].sort()).toEqual(ids)
      expect(order).toHaveLength(PUBLIC_OBJECTIVES.length)
    }
    expect(new Set(orders.map(o => o.join(','))).size).toBeGreaterThan(1)
    const game = createGame(DUEL_CONFIG, 7)
    expect(game.publicObjectives).toEqual([game.objectiveOrder[0]])
  })
  it('R7: scoreable lists revealed, fulfilled and unscored objectives plus both mandates', () => {
    const base = toActionPhase()
    const revealed = base.publicObjectives[0]
    const s = deepFreeze({
      ...withPlayer(base, 0, { spaceCombatWins: 1, trades: 3, resourcesSpentThisRound: 6 }),
      mecatolCombatWinner: 0 as const,
      publicObjectives: ['win_space_combat', 'trade_three_times'],
    })
    expect(revealed).toBeTruthy()
    expect(scoreable(s, 0)).toEqual(['win_space_combat', 'trade_three_times', FIRST_STRIKE.id])
    expect(scoreable(withPlayer(s, 0, {
      scoredObjectives: ['win_space_combat', 'trade_three_times'], scoredMandates: [FIRST_STRIKE.id],
    }), 0)).toEqual([])
    expect(scoreable(s, 1)).toEqual([])
  })
  it('R7: scoring records the objective and adds one victory point', () => {
    const s = deepFreeze({ ...toActionPhase(), publicObjectives: ['win_space_combat'] })
    const scored = scoreObjective(s, 0, 'win_space_combat')
    expect(scored.players[0].vp).toBe(1)
    expect(scored.players[0].scoredObjectives).toEqual(['win_space_combat'])
    const mandate = scoreObjective(scored, 0, FOOTHOLD.id)
    expect(mandate.players[0].vp).toBe(2)
    expect(mandate.players[0].scoredMandates).toEqual([FOOTHOLD.id])
    expect(mandate.players[0].scoredObjectives).toEqual(['win_space_combat'])
    expect(addVp(mandate, 0, 1, 'Mecatol Rex').players[0].vp).toBe(3)
    expect(s.players[0].vp).toBe(0)                                // input not mutated
  })
  it('R7: Mecatol Rex control is read from the centre system', () => {
    const s = toActionPhase()
    expect(controlsMecatol(s, 0)).toBe(false)
    expect(controlsMecatol(withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0), 0)).toBe(true)
    expect(controlsMecatol(withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0), 1)).toBe(false)
  })
})
