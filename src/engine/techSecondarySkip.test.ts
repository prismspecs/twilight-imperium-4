import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { toActionPhase, SAAR_CONFIG } from './testUtils'
import type { GameState } from './types'

describe('Technology secondary and tech specialty skips', () => {
  it('allows Saar with 2 yellow and 0 red to research PDS II using Meer as red tech skip', () => {
    let state = toActionPhase(1, 0, SAAR_CONFIG)
    // Give Saar 2 yellow techs, 0 red techs
    const p0 = state.players[0]
    state = {
      ...state,
      players: [
        {
          ...p0,
          techs: ['sarween_tools', 'graviton_laser_system'],
          tokens: { ...p0.tokens, strategy: 2 },
          tradeGoods: 4,
        },
        state.players[1],
      ],
      pendingSecondary: {
        card: 'technology',
        owner: 1 as const,
        queue: [0 as const],
      },
    }

    // Give Saar Meer (red tech skip) ready, in a system
    const homeSys = Object.keys(state.systems)[0]
    const meerPlanet = {
      id: 'meer',
      name: 'Meer',
      resources: 0,
      influence: 4,
      trait: 'cultural' as const,
      techSkip: 'red' as const,
      owner: 0 as const,
      exhausted: false,
      ground: [],
      structures: [],
    }
    state = {
      ...state,
      systems: {
        ...state.systems,
        [homeSys]: {
          ...state.systems[homeSys],
          planets: [...state.systems[homeSys].planets, meerPlanet],
        },
      },
    }

    // 1. Without techSkipPlanets, research of PDS II fails with R5 error
    const failedResult = applyMove(state, {
      type: 'secondary',
      card: 'technology',
      accept: true,
      params: {
        techId: 'pds_ii',
        planets: [],
        tradeGoods: 4,
      },
    })
    expect(failedResult.ok).toBe(false)
    if (!failedResult.ok) {
      expect(failedResult.error).toBe('R5: pds_ii cannot be researched')
    }

    // 2. With techSkipPlanets: ['meer'], research of PDS II succeeds
    const successResult = applyMove(state, {
      type: 'secondary',
      card: 'technology',
      accept: true,
      params: {
        techId: 'pds_ii',
        techSkipPlanets: ['meer'],
        planets: [],
        tradeGoods: 4,
      },
    })
    expect(successResult.ok).toBe(true)
    if (successResult.ok) {
      const nextState = successResult.value
      expect(nextState.players[0].techs).toContain('pds_ii')
      // Meer should be exhausted by the tech skip
      const updatedMeer = nextState.systems[homeSys].planets.find(p => p.id === 'meer')
      expect(updatedMeer?.exhausted).toBe(true)
    }
  })
})
