import { describe, expect, it } from 'vitest'
import { applyMove, createGame } from './index'
import { legalMoves } from './legalMoves'
import { fillTemplate } from './testUtils'
import type { GameState, Move } from './types'

/** Drives a game purely from the enumerated legal moves, deterministic seeds — the same way the store's
 * rewind replays. Templates are filled engine-side (produce/moveShips), first working pick wins. */
function play(state: GameState, n: number): GameState {
  let cur = state
  for (let i = 0; i < n; i++) {
    const candidates = legalMoves(cur)
    if (!candidates.length) break
    let applied = false
    for (const candidate of candidates) {
      const move: Move = fillTemplate(cur, candidate, () => 0.5)
      const r = applyMove(cur, move, i + 1)
      if (r.ok) { cur = r.value; applied = true; break }
    }
    if (!applied) break
    if (cur.winner !== null) break
  }
  return cur
}

function replay(config: Parameters<typeof createGame>[0], seed: number, moves: Extract<GameState['log'][number], { t: 'move' }>[]): GameState {
  let state = createGame(config, seed)
  for (const entry of moves) {
    const r = applyMove(state, entry.move, entry.seed)
    if (!r.ok) throw new Error(r.error)
    state = r.value
  }
  return state
}

describe('rewind by log replay', () => {
  it('replaying the logged moves (seed per entry) reproduces the exact state', () => {
    const seed = 7
    const config = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 } as const
    const played = play(createGame(config, seed), 40)
    const moves = played.log.filter((e): e is Extract<GameState['log'][number], { t: 'move' }> => e.t === 'move')
    expect(moves.length).toBeGreaterThan(10)
    const rebuilt = replay(config, seed, moves)
    expect(rebuilt).toEqual(played)
  })

  it('dropping the last n moves from the replay lands n moves back — the rewind contract', () => {
    const seed = 7
    const config = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 } as const
    const played = play(createGame(config, seed), 40)
    const moves = played.log.filter((e): e is Extract<GameState['log'][number], { t: 'move' }> => e.t === 'move')
    const n = 5
    // the state n moves back is exactly the state after the first (len - n) moves
    const earlier = moves.slice(0, moves.length - n)
    const rebuilt = replay(config, seed, earlier)
    const earlierMoves = rebuilt.log.filter((e): e is Extract<GameState['log'][number], { t: 'move' }> => e.t === 'move')
    expect(earlierMoves.length).toBe(moves.length - n)
    expect(earlierMoves).toEqual(earlier)
  })
})
