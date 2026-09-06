// src/ui/store.test.ts
import { describe, expect, it } from 'vitest'
import { toActionPhase, withTactical } from '../engine/testUtils'
import { seatToAct, shouldAiStep } from './store'
import type { GameConfig } from '../engine/types'

describe('shouldAiStep and seatToAct', () => {
  const configWithHumanAndAi: GameConfig = {
    speaker: 0,
    players: [
      { name: 'Human', faction: 'sol', color: 'blue', playerType: 'human' },
      { name: 'Bot', faction: 'letnev', color: 'red', playerType: 'ai' },
    ],
  }

  const configBothAi: GameConfig = {
    speaker: 0,
    players: [
      { name: 'Bot 1', faction: 'sol', color: 'blue', playerType: 'ai' },
      { name: 'Bot 2', faction: 'letnev', color: 'red', playerType: 'ai' },
    ],
  }

  it('seatToAct returns active seat during normal turn', () => {
    const s = toActionPhase()
    expect(seatToAct(s)).toBe(s.active)
  })

  it('seatToAct returns pending hit owner during combat hit assignment', () => {
    let s = withTactical(toActionPhase(), {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 1, // AI attacked
        defender: 0, // Human defender
        retreating: null,
        retreatTo: null,
        lastRolls: [],
        pending: [
          { owner: 0, groups: [{ count: 2, mode: 'any' }], context: 'combat round 1' },
        ],
      },
    })
    s = { ...s, active: 1 } // AI is the tactical action owner
    expect(seatToAct(s)).toBe(0) // but Human seat 0 must act!
  })

  it('shouldAiStep returns false when human has pending hits, even if active player is AI', () => {
    let s = withTactical(toActionPhase(), {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 1,
        defender: 0,
        retreating: null,
        retreatTo: null,
        lastRolls: [],
        pending: [
          { owner: 0, groups: [{ count: 2, mode: 'any' }], context: 'combat round 1' },
        ],
      },
    })
    s = { ...s, active: 1 }
    // Human seat 0 must assign hits - AI must NOT step!
    expect(shouldAiStep(configWithHumanAndAi, s)).toBe(false)
  })

  it('shouldAiStep returns true when AI has pending hits', () => {
    let s = withTactical(toActionPhase(), {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 0, // Human attacked
        defender: 1, // AI defender
        retreating: null,
        retreatTo: null,
        lastRolls: [],
        pending: [
          { owner: 1, groups: [{ count: 1, mode: 'any' }], context: 'combat round 1' },
        ],
      },
    })
    s = { ...s, active: 0 }
    // AI seat 1 owns the hits - AI should step to assign them!
    expect(shouldAiStep(configWithHumanAndAi, s)).toBe(true)
  })

  it('shouldAiStep returns false in space combat round initiation when a human is involved', () => {
    let s = withTactical(toActionPhase(), {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 1, // AI
        defender: 0, // Human
        retreating: null,
        retreatTo: null,
        lastRolls: [],
        pending: [],
      },
    })
    s = { ...s, active: 1 }
    // Human is a participant - AI must NOT auto-roll! Wait for human to click roll.
    expect(shouldAiStep(configWithHumanAndAi, s)).toBe(false)
  })

  it('shouldAiStep returns true in space combat round initiation when both are AI', () => {
    let s = withTactical(toActionPhase(), {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 1, // AI
        defender: 0, // AI
        retreating: null,
        retreatTo: null,
        lastRolls: [],
        pending: [],
      },
    })
    s = { ...s, active: 1 }
    // Both participants are AI - AI should resolve combat automatically
    expect(shouldAiStep(configBothAi, s)).toBe(true)
  })
})
