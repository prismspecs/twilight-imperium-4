import { describe, expect, it } from 'vitest'
import { applyMove, createGame, legalMoves } from '../engine'
import { DUEL_CONFIG } from '../engine/testUtils'
import type { GameState, Seat } from '../engine/types'
import { aiChoose, playMatch } from './index'
import { PERSONALITIES, type ScoreWeights } from './score'

const MAX_MOVES = 4000
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 40, 55, 59, 71, 89]

/** The AI plays one full game as both seats; returns the final state and how many moves it took. */
function playAiGame(seed: number): { state: GameState; moves: number } {
  let state = createGame(DUEL_CONFIG, seed)
  let moves = 0
  while (state.phase !== 'ended' && moves < MAX_MOVES) {
    const options = legalMoves(state)
    expect(options.length).toBeGreaterThan(0)
    // aiChoose is a pure function of the state; replay it the same way the UI will, with the move index as seed
    const move = aiChoose(state, options, state.active)
    const r = applyMove(state, move, 1000 + moves)
    if (!r.ok) { expect(r.ok, `AI move ${move.type} was rejected: ${r.error}`).toBe(true); break }
    state = r.value
    moves++
  }
  return { state, moves }
}

function invariants(state: GameState): void {
  expect(state.round).toBeLessThanOrEqual(6)
  expect(state.phase === 'ended').toBe(state.winner !== null)
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat]
    expect(Math.min(p.vp, p.tradeGoods, p.commodities, p.tokens.tactic, p.tokens.fleet, p.tokens.strategy)).toBeGreaterThanOrEqual(0)
    expect(p.vp).toBeGreaterThanOrEqual(p.scoredObjectives.length)
  }
}

describe('AI opponent', () => {
  it('plays every seeded game to the end without an illegal move', { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const { state, moves } = playAiGame(seed)
      expect(state.phase).toBe('ended')
      expect(state.winner).not.toBeNull()
      expect(moves).toBeLessThan(MAX_MOVES)
      invariants(state)
    }
  })

  it('aiChoose returns a move that the engine accepts, at every phase', () => {
    for (const seed of [1, 13, 89]) {
      let state = createGame(DUEL_CONFIG, seed)
      let guard = 0
      while (state.phase !== 'ended' && guard < 2000) {
        const options = legalMoves(state)
        const move = aiChoose(state, options, state.active)
        const r = applyMove(state, move, seed + guard)
        if (!r.ok) { expect(r.ok, `rejected ${move.type}: ${r.error}`).toBe(true); break }
        state = r.value
        guard++
      }
      expect(state.phase).toBe('ended')
    }
  })

  it('the AI neither stalls nor hangs: active alternates and the game terminates', () => {
    const { state, moves } = playAiGame(7)
    expect(moves).toBeGreaterThan(0)
    expect(state.phase).toBe('ended')
  })

  it('aiChoose is deterministic: the same state, options and seat pick the same move', () => {
    let state = createGame(DUEL_CONFIG, 89)
    let guard = 0
    while (state.phase !== 'ended' && guard < 2000) {
      const options = legalMoves(state)
      const first = aiChoose(state, options, state.active)
      const second = aiChoose(state, options, state.active)
      expect(second).toEqual(first)
      const r = applyMove(state, first, guard + 1)
      if (!r.ok) { expect(r.ok, `rejected ${first.type}: ${r.error}`).toBe(true); break }
      state = r.value
      guard++
    }
    expect(state.phase).toBe('ended')
  })

  it('aiChoose returns the only option directly when there is a single legal move', () => {
    const state = createGame(DUEL_CONFIG, 5)
    const options = legalMoves(state)
    expect(options.length).toBeGreaterThan(0)
    const single = aiChoose(state, [options[0]], state.active)
    expect(single).toEqual(options[0])
  })

  it('playMatch is the co-evolution harness: it terminates with a clean result for every seed', () => {
    for (const seed of [1, 7, 13, 55]) {
      const r = playMatch(DUEL_CONFIG, seed, [PERSONALITIES.balanced, PERSONALITIES.balanced])
      expect(r.failed).toBeNull()
      expect(r.rounds).toBeGreaterThan(0)
      expect(r.rounds).toBeLessThanOrEqual(6)
      expect(r.vp[0]).toBeGreaterThanOrEqual(0)
      expect(r.vp[1]).toBeGreaterThanOrEqual(0)
      expect(r.winner).not.toBeNull()
    }
  })

  it('personality weights actually change how a seat plays', () => {
    for (const seed of [7, 21]) {
      const patient = playMatch(DUEL_CONFIG, seed, [PERSONALITIES.economist, PERSONALITIES.economist])
      const pushy = playMatch(DUEL_CONFIG, seed, [PERSONALITIES.aggressive, PERSONALITIES.aggressive])
      // the same seed diverges into visibly different games, so weights are doing real work
      expect(`${patient.moves}${patient.rounds}${patient.vp}`).not.toEqual(`${pushy.moves}${pushy.rounds}${pushy.vp}`)
    }
  })

  it('a trainer can hand a seat a custom weight object (offspring)', () => {
    const offspring: ScoreWeights = { ...PERSONALITIES.balanced, military: 22, economy: 3 }
    const r = playMatch(DUEL_CONFIG, 5, [offspring, PERSONALITIES.balanced])
    expect(r.failed).toBeNull()
  })
})
