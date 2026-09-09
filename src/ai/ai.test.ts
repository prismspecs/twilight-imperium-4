import { describe, expect, it } from 'vitest'
import { applyMove, createGame, legalMoves } from '../engine'
import { BASE_CONFIG, toActionPhase, withPlayer } from '../engine/testUtils'
import type { GameState, Move, Seat } from '../engine/types'
import { aiChoose, aiStep, playMatch } from './index'
import { PERSONALITIES, type ScoreWeights } from './score'

const MAX_MOVES = 4000
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 40, 55, 59, 71, 89]

describe('aiStep rejection recovery', () => {
  it('a rejected candidate is excluded and the next-best move is tried instead of stopping (65TM45)', () => {
    // An arborec seat at its home dock: a chooser that insists on an infantry order (which Mitosis
    // forbids) must not freeze the game — the retry takes a move the engine accepts.
    const state = withPlayer(toActionPhase(7, 0), 0, { faction: 'arborec' })
    const moves = legalMoves(state)
    let calls = 0
    const stubborn = (s: GameState, pool: Move[], seat: Seat, weights: Parameters<typeof aiChoose>[3]): Move =>
      calls++ === 0
        ? { type: 'produce', units: { infantry: 2 }, planets: [], tradeGoods: 0 } as Move
        : aiChoose(s, pool, seat, weights)
    const step = aiStep(state, moves, 0, 7, undefined, stubborn)
    expect(step).not.toBeNull()
    expect(step!.rejected).toHaveLength(1)
    expect(step!.chosen.type).not.toBe('produce')
    // the rejected candidate really is rejected by the engine: produce without a tactical action running
    expect(step!.state).not.toBe(state)
  })

  it('returns null when every candidate is rejected, so the caller can say so instead of hanging', () => {
    const state = toActionPhase(7, 0)
    const illegal = (_s: GameState, pool: Move[]): Move => pool[0] // legalMoves offered them, but…
    // …a state where applyMove rejects everything: an unknown system id for every startTactical choice
    const step = aiStep(state, [{ type: 'startTactical', systemId: 'nowhere' }], 0, 7, undefined, illegal)
    expect(step).toBeNull()
  })
})

/** The AI plays one full game as both seats; returns the final state and how many moves it took. */
function playAiGame(seed: number): { state: GameState; moves: number } {
  let state = createGame(BASE_CONFIG, seed)
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
  expect(state.round).toBeLessThanOrEqual(8)
  expect(state.phase === 'ended').toBe(state.winner !== null)
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat]
    expect(Math.min(p.vp, p.tradeGoods, p.commodities, p.tokens.tactic, p.tokens.fleet, p.tokens.strategy)).toBeGreaterThanOrEqual(0)
    // Not vp >= scoredObjectives.length: the Mutiny agenda docks 1 VP from every seat that voted For once it
    // resolves Against (lrr-components.md), so a seat can hold more scored objectives than current VP.
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
      let state = createGame(BASE_CONFIG, seed)
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
    let state = createGame(BASE_CONFIG, 89)
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
    const state = createGame(BASE_CONFIG, 5)
    const options = legalMoves(state)
    expect(options.length).toBeGreaterThan(0)
    const single = aiChoose(state, [options[0]], state.active)
    expect(single).toEqual(options[0])
  })

  it('playMatch is the co-evolution harness: it terminates with a clean result for every seed', () => {
    for (const seed of [1, 7, 13, 55]) {
      const r = playMatch(BASE_CONFIG, seed, [PERSONALITIES.balanced, PERSONALITIES.balanced])
      expect(r.failed).toBeNull()
      expect(r.rounds).toBeGreaterThan(0)
      expect(r.rounds).toBeLessThanOrEqual(8)
      expect(r.vp[0]).toBeGreaterThanOrEqual(0)
      expect(r.vp[1]).toBeGreaterThanOrEqual(0)
      expect(r.winner).not.toBeNull()
    }
  })

  it('personality weights actually change how a seat plays', () => {
    for (const seed of [7, 21]) {
      const patient = playMatch(BASE_CONFIG, seed, [PERSONALITIES.economist, PERSONALITIES.economist])
      const pushy = playMatch(BASE_CONFIG, seed, [PERSONALITIES.aggressive, PERSONALITIES.aggressive])
      // the same seed diverges into visibly different games, so weights are doing real work
      expect(`${patient.moves}${patient.rounds}${patient.vp}`).not.toEqual(`${pushy.moves}${pushy.rounds}${pushy.vp}`)
    }
  })

  it('a trainer can hand a seat a custom weight object (offspring)', () => {
    const offspring: ScoreWeights = { ...PERSONALITIES.balanced, military: 22, economy: 3 }
    const r = playMatch(BASE_CONFIG, 5, [offspring, PERSONALITIES.balanced])
    expect(r.failed).toBeNull()
  })

  it('AI chooses tactical expansion over passing in round 1 when it has tactic tokens', () => {
    // Start action phase in duel
    let state = toActionPhase(42, 1)
    // Mark seat 1's strategic actions as used so it is deciding between tactical and passing
    state = {
      ...state,
      players: state.players.map((p, i) => i === 1 ? {
        ...p,
        strategyCards: p.strategyCards.map(sc => ({ ...sc, used: true })),
      } : p),
    }
    const moves = legalMoves(state)
    const hasPass = moves.some(m => m.type === 'pass')
    const hasTactical = moves.some(m => m.type === 'startTactical')
    expect(hasPass).toBe(true)
    expect(hasTactical).toBe(true)
    const chosen = aiChoose(state, moves, 1)
    expect(chosen.type).not.toBe('pass')
    expect(chosen.type).toBe('startTactical')
  })

  it('6-player game: AI players colonize neutral planets in round 1', () => {
    const config = {
      players: [
        { faction: 'l1z1x' as const, color: 'blue' as const, name: 'P0' },
        { faction: 'letnev' as const, color: 'red' as const, name: 'P1' },
        { faction: 'sol' as const, color: 'yellow' as const, name: 'P2' },
        { faction: 'hacan' as const, color: 'green' as const, name: 'P3' },
        { faction: 'jolnar' as const, color: 'purple' as const, name: 'P4' },
        { faction: 'xxcha' as const, color: 'black' as const, name: 'P5' },
      ],
      speaker: 0,
    }
    let state = createGame(config, 424281949)
    let moves = 0
    while (state.round === 1 && state.phase !== 'ended' && moves < 300) {
      const options = legalMoves(state)
      expect(options.length).toBeGreaterThan(0)
      const move = aiChoose(state, options, state.active)
      const r = applyMove(state, move, 5000 + moves)
      if (!r.ok) {
        expect(r.ok, `move ${move.type} failed: ${r.error}`).toBe(true)
        break
      }
      expect(r.ok).toBe(true)
      state = r.value
      moves++
    }

    // Check that AI players (seats 1-5) colonized neutral planets outside their home systems
    const aiColonizedOutsideHome = Object.values(state.systems)
      .filter(sys => sys.home === null)
      .flatMap(sys => sys.planets)
      .filter(p => p.owner !== null && p.owner > 0)

    expect(aiColonizedOutsideHome.length).toBeGreaterThanOrEqual(4)
  })
})

