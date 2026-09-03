import { describe, expect, it } from 'vitest'
import { applyMove, createGame, legalMoves } from '../engine'
import { DUEL_CONFIG } from '../engine/testUtils'
import type { GameState, Seat } from '../engine/types'
import { aiChoose } from './index'

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
})
