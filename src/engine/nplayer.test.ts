import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { createGame } from './setup'
import { fillTemplate, shuffle } from './testUtils'
import type { GameConfig, GameState, Move } from './types'

const THREE: GameConfig = {
  players: [
    { faction: 'l1z1x', color: 'blue', name: 'A' },
    { faction: 'sol', color: 'red', name: 'B' },
    { faction: 'hacan', color: 'yellow', name: 'C' },
  ],
  speaker: 0,
}

// moves that close out a step or turn, so the driver makes progress instead of drifting
const CLOSERS: readonly Move['type'][] = ['pass', 'status', 'endTactical', 'endTurn', 'endMovement', 'endInvasion', 'secondary', 'pickStrategyCard']

/** N-player invariants: every unit unique and accounted for, no negative pools, phase/winner consistent. */
function nInvariants(state: GameState): void {
  const allUnits = Object.values(state.systems).flatMap(sys => [
    ...sys.space,
    ...sys.planets.flatMap(p => [...p.ground, ...p.structures]),
  ])
  expect(new Set(allUnits.map(u => u.id)).size).toBe(allUnits.length)
  for (const u of allUnits) expect(u.id).toBeLessThan(state.nextUnitId)
  expect(state.phase === 'ended').toBe(state.winner !== null)
  for (const p of state.players) {
    expect(Math.min(p.vp, p.tradeGoods, p.commodities, p.tokens.tactic, p.tokens.fleet, p.tokens.strategy)).toBeGreaterThanOrEqual(0)
    for (const n of Object.values(p.reinforcements)) expect(n).toBeGreaterThanOrEqual(0)
    expect(p.vp).toBeGreaterThanOrEqual(p.scoredObjectives.length)
  }
}

/** Plays a game forward with seeded legal moves until it ends or reaches targetRound, checking invariants. */
function playUntil(config: GameConfig, seed: number, targetRound: number, maxMoves: number): { state: GameState; moves: number } {
  let bits = (seed * 2654435761) >>> 0
  const rng = () => { bits = (Math.imul(bits, 1664525) + 1013904223) >>> 0; return bits / 4294967296 }
  let state = createGame(config, seed)
  let moves = 0
  while (state.phase !== 'ended' && state.round < targetRound && moves < maxMoves) {
    const options = legalMoves(state)
    expect(options.length).toBeGreaterThan(0)
    // past a third of the budget, prefer the closing move so the run reaches the next round promptly
    const closer = moves > maxMoves / 3 ? options.find(m => CLOSERS.includes(m.type)) : undefined
    const order = closer ? [closer, ...shuffle(options, rng)] : shuffle(options, rng)
    let applied: GameState | null = null
    for (const option of order) {
      const move = fillTemplate(state, option, rng)
      const r = applyMove(state, move, 1000 + moves)
      if (!r.ok) {
        if (r.internal) throw new Error(`internal error on ${move.type}: ${r.error}`)
        continue
      }
      applied = r.value
      break
    }
    expect(applied, `no legal move applicable at move ${moves} (phase ${state.phase})`).not.toBeNull()
    if (!applied) break
    state = applied
    moves++
    nInvariants(state)
  }
  return { state, moves }
}

describe('N-player full-round smoke', () => {
  it('a 3-player generated-galaxy game completes a full round without internal errors', () => {
    const { state, moves } = playUntil(THREE, 1, 2, 800)
    expect(moves).toBeGreaterThan(0)
    // round advanced past 1 (strategy -> action -> status all ran for three seats), or someone already won
    expect(state.round >= 2 || state.winner !== null).toBe(true)
  })

  it('the three-player strategy draft deals every seat two cards in snake order', () => {
    const g = createGame(THREE, 1)
    expect(g.draft).toEqual([0, 1, 2, 2, 1, 0])
    // drive just the strategy phase: each pickStrategy is legal for the active seat
    let state = g
    let guard = 0
    while (state.phase === 'strategy' && guard++ < 12) {
      const pick = legalMoves(state).find(m => m.type === 'pickStrategyCard')
      expect(pick, `seat ${state.active} has a card to pick`).toBeDefined()
      if (!pick) break
      const r = applyMove(state, pick, 2000 + guard)
      expect(r.ok).toBe(true)
      if (r.ok) state = r.value
    }
    expect(state.phase).toBe('action')
    expect(state.players.every(p => p.strategyCards.length === 2)).toBe(true)
  })
})
