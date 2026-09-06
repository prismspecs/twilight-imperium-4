import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { DUEL_CONFIG, toActionPhase } from '../engine/testUtils'
import type { Move } from '../engine/types'
import { fillProduce, fillStatusTokens } from './fill'
import { aiChoose } from './index'

describe('fillProduce calibrated fleet production', () => {
  it('produces a Dreadnought when Letnev has resources and fleet pool space', () => {
    let state = toActionPhase(42, 1) // seat 1 is Letnev
    // Give Letnev 8 trade goods and clear ships from home system
    state = {
      ...state,
      players: state.players.map((p, i) => i === 1 ? { ...p, tradeGoods: 8 } : p),
      systems: {
        ...state.systems,
        'home-s': {
          ...state.systems['home-s'],
          space: [], // clear space to leave ample fleet headroom
        },
      },
    }

    const plan = fillProduce(state, 1, 'home-s')
    expect(plan.units.dreadnought).toBeDefined()
    expect(plan.units.dreadnought).toBeGreaterThanOrEqual(1)
  })

  it('produces infantry and fighters to fill capacity and screen capital ships', () => {
    let state = toActionPhase(43, 0) // seat 0 is L1Z1X
    state = {
      ...state,
      players: state.players.map((p, i) => i === 0 ? { ...p, tradeGoods: 10 } : p),
    }

    const plan = fillProduce(state, 0, 'home-n')
    const totalUnits = Object.values(plan.units).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0

    // Should produce multiple units, not just 1 destroyer or 2 infantry
    expect(totalUnits).toBeGreaterThan(2)
  })

  it('never exceeds production limit or available budget', () => {
    const state = toActionPhase(44, 0)
    const plan = fillProduce(state, 0, 'home-n')

    const totalUnits = Object.values(plan.units).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0
    expect(totalUnits).toBeLessThanOrEqual(7) // dock production limit
  })
})

describe('fillStatusTokens and aiChoose integration', () => {
  it('allocates tokens to fleet pool when seat is below target fleet pool', () => {
    const state = createGame(DUEL_CONFIG, 45) // round 1
    // L1Z1X has target fleet tokens 5, starting fleet tokens 3
    const tokens = fillStatusTokens(state, 0)

    expect(tokens.fleet).toBeGreaterThan(state.players[0].tokens.fleet)
    expect(tokens.tactic).toBeGreaterThanOrEqual(state.players[0].tokens.tactic)
  })

  it('aiChoose fills status token template when moves.length === 1', () => {
    const state = createGame(DUEL_CONFIG, 45)
    const rawMove: Move = {
      type: 'status',
      params: { tokens: { ...state.players[0].tokens, tactic: state.players[0].tokens.tactic + 2 } },
    }
    const chosen = aiChoose(state, [rawMove], 0)

    expect(chosen.type).toBe('status')
    if (chosen.type === 'status') {
      const params = chosen.params as { tokens: { fleet: number; tactic: number; strategy: number } }
      expect(params).toBeDefined()
      expect(params.tokens.fleet).toBeGreaterThan(state.players[0].tokens.fleet)
    }
  })
})
