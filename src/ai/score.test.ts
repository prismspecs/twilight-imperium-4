import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { DUEL_CONFIG } from '../engine/testUtils'
import type { Move } from '../engine/types'
import { playerView } from './fog'
import { DEFAULT_WEIGHTS, scoreMove, scoreTech } from './score'

describe('scoreTech and calibrated tech scoring', () => {
  it('scores signature faction techs higher than low-affinity techs', () => {
    const state = createGame(DUEL_CONFIG, 101)
    const view = playerView(state, 0) // seat 0 is L1Z1X
    const w = DEFAULT_WEIGHTS

    const sd2Score = scoreTech(view, 0, 'super_dreadnought_ii', w)
    const dacxiveScore = scoreTech(view, 0, 'dacxive_animators', w)

    expect(sd2Score).toBeGreaterThan(dacxiveScore)
  })

  it('elevates unit upgrade techs when develop_weaponry is an active public objective', () => {
    let state = createGame(DUEL_CONFIG, 102)
    state = {
      ...state,
      publicObjectives: ['develop_weaponry'],
    }
    const view = playerView(state, 1) // seat 1 is Letnev
    const w = DEFAULT_WEIGHTS

    const dread2Score = scoreTech(view, 1, 'dreadnought_ii', w)
    const plasmaScore = scoreTech(view, 1, 'plasma_scoring', w)

    // Dreadnought II is an upgrade tech and satisfies develop_weaponry
    expect(dread2Score).toBeGreaterThan(plasmaScore)
  })

  it('differentiates secondary technology moves based on the selected techId', () => {
    const state = createGame(DUEL_CONFIG, 103)
    const view = playerView(state, 0) // L1Z1X
    const w = DEFAULT_WEIGHTS

    const moveSuperDn: Move = {
      type: 'secondary',
      card: 'technology',
      accept: true,
      params: { techId: 'super_dreadnought_ii', planets: [] },
    }

    const moveLow: Move = {
      type: 'secondary',
      card: 'technology',
      accept: true,
      params: { techId: 'dacxive_animators', planets: [] },
    }

    const scoreSuperDn = scoreMove(view, moveSuperDn, 0, w)
    const scoreLow = scoreMove(view, moveLow, 0, w)

    expect(scoreSuperDn).toBeGreaterThan(scoreLow)
  })

  it('differentiates strategic technology moves based on tech1 and tech2 choices', () => {
    const state = createGame(DUEL_CONFIG, 104)
    const view = playerView(state, 1) // Letnev
    const w = DEFAULT_WEIGHTS

    const moveGood: Move = {
      type: 'strategic',
      card: 'technology',
      params: { techId: 'gravity_drive', secondTechId: 'non_euclidean_shielding', planets: [] },
    }

    const moveBad: Move = {
      type: 'strategic',
      card: 'technology',
      params: { techId: 'dacxive_animators', secondTechId: 'graviton_laser_system', planets: [] },
    }

    const scoreGood = scoreMove(view, moveGood, 1, w)
    const scoreBad = scoreMove(view, moveBad, 1, w)

    expect(scoreGood).toBeGreaterThan(scoreBad)
  })
})
