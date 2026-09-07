// src/engine/effects.test.ts
import { describe, expect, it } from 'vitest'
import { clearTacticalEffects, fighterBonus, ignoresFleets, moraleBoost, moveBonus, wormholesLinked } from './effects'
import { deepFreeze, toActionPhase, withTactical } from './testUtils'
import type { ActiveEffect, GameState } from './types'

function withEffects(state: GameState, effects: ActiveEffect[]): GameState {
  return deepFreeze({ ...state, effects })
}

describe('R9 action-card effects (the reader side)', () => {
  it('a tactical effect is live for its owner only, for as long as the tactical action runs', () => {
    const s = withEffects(toActionPhase(), [{ effect: 'flank_speed', seat: 0, scope: 'tactical' }])
    expect(moveBonus(s, 0)).toBe(1)
    expect(moveBonus(s, 1)).toBe(0)
    expect(wormholesLinked(s, 0)).toBe(false)
  })

  it('Lost Star Chart and In The Silence Of Space are their own distinct tactical effects', () => {
    const s = withEffects(toActionPhase(), [
      { effect: 'lost_star_chart', seat: 0, scope: 'tactical' },
      { effect: 'in_the_silence_of_space', seat: 1, scope: 'tactical', systemId: 'home-s' },
    ])
    expect(wormholesLinked(s, 0)).toBe(true)
    expect(wormholesLinked(s, 1)).toBe(false)
    expect(ignoresFleets(s, 1, 'home-s')).toBe(true)
    expect(ignoresFleets(s, 1, 'quann')).toBe(false)   // named a different system than the card chose
    expect(ignoresFleets(s, 0, 'home-s')).toBe(false)   // a different seat's effect
  })

  it('a round-scoped effect only matches the round it was played into, for the combat kind it was played into', () => {
    let s = toActionPhase()
    s = withTactical(s, { systemId: 'bereg', step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } })
    s = withEffects(s, [{ effect: 'morale_boost', seat: 0, scope: 'spaceRound', round: 1 }])
    expect(moraleBoost(s, 0, 'space')).toBe(1)
    expect(moraleBoost(s, 0, 'ground')).toBe(0)   // wrong combat kind
    expect(moraleBoost(s, 1, 'space')).toBe(0)    // wrong seat

    const nextRound = withTactical(s, { systemId: 'bereg', step: 'spaceCombat', combat: { round: 2, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } })
    expect(moraleBoost(nextRound, 0, 'space')).toBe(0)   // the round moved on, so the effect no longer matches
  })

  it('Fighter Prototype is always a space-combat effect, worth +2', () => {
    let s = toActionPhase()
    s = withTactical(s, { systemId: 'bereg', step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } })
    s = withEffects(s, [{ effect: 'fighter_prototype', seat: 0, scope: 'spaceRound', round: 1 }])
    expect(fighterBonus(s, 0)).toBe(2)
    expect(fighterBonus(s, 1)).toBe(0)
    expect(fighterBonus(s, 'guardian')).toBe(0)   // the guardian fleet never holds a card, so never an effect
  })

  it('clearTacticalEffects empties the list, and is a no-op on an already-empty one', () => {
    const s = withEffects(toActionPhase(), [{ effect: 'flank_speed', seat: 0, scope: 'tactical' }])
    const cleared = clearTacticalEffects(s)
    expect(cleared.effects).toEqual([])
    expect(clearTacticalEffects(cleared)).toBe(cleared)   // same reference: nothing to change
  })
})
