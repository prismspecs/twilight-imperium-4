/**
 * Plays a batch of full 6-player, all-AI games end to end and reports where the engine got stuck: an
 * illegal move the AI chose, a legal-move enumeration that came up empty, or a game that never reached
 * `phase === 'ended'` within the move budget. This is a debugging tool, not a benchmark - see
 * scripts/ai-match.ts for personality win-rate comparisons.
 *
 * Usage:
 *   npm run ai:stress                # seeds 1..50
 *   npm run ai:stress -- 200         # seeds 1..200
 */
import { aiChoose } from '../src/ai'
import { PERSONALITIES } from '../src/ai/score'
import { applyMove, createGame, legalMoves } from '../src/engine'
import { deriveSeed } from '../src/engine/rng'
import type { FactionId, GameConfig, Move } from '../src/engine/types'

const FACTIONS: FactionId[] = ['l1z1x', 'letnev', 'sol', 'hacan', 'jolnar', 'xxcha']
const COLOURS = ['blue', 'red', 'green', 'yellow', 'purple', 'black'] as const
const WEIGHTS = Object.values(PERSONALITIES)
const MAX_MOVES = 4000

function config(): GameConfig {
  return {
    speaker: 0,
    players: FACTIONS.map((faction, seat) => ({
      faction, color: COLOURS[seat], name: `P${seat}`, playerType: 'ai',
    })),
  }
}

interface Failure {
  seed: number
  kind: 'no-legal-moves' | 'illegal-move' | 'stuck'
  moves: number
  round: number
  seat?: number
  move?: Move
  error?: string
}

const args = process.argv.slice(2)
const seedCount = Number.parseInt(args[0] ?? '50', 10) || 50

const failures: Failure[] = []
let ended = 0
const moveCounts: number[] = []

for (let seed = 1; seed <= seedCount; seed++) {
  let state = createGame(config(), seed)
  let moves = 0
  let failure: Failure | null = null
  while (state.phase !== 'ended' && moves < MAX_MOVES) {
    const options = legalMoves(state)
    if (options.length === 0) {
      failure = { seed, kind: 'no-legal-moves', moves, round: state.round, seat: state.active }
      break
    }
    const weights = WEIGHTS[state.active % WEIGHTS.length]
    const move = aiChoose(state, options, state.active, weights)
    const r = applyMove(state, move, deriveSeed(seed, moves))
    if (!r.ok) {
      failure = { seed, kind: 'illegal-move', moves, round: state.round, seat: state.active, move, error: r.error }
      break
    }
    state = r.value
    moves++
  }
  if (failure) {
    failures.push(failure)
  } else if (state.phase !== 'ended') {
    failures.push({ seed, kind: 'stuck', moves, round: state.round })
  } else {
    ended++
    moveCounts.push(moves)
  }
}

console.log(`\n${String(seedCount)} seeds, 6 players, all AI`)
console.log(`finished cleanly: ${String(ended)}/${String(seedCount)}`)
if (moveCounts.length) {
  const avg = moveCounts.reduce((a, b) => a + b, 0) / moveCounts.length
  console.log(`moves per game: min ${String(Math.min(...moveCounts))}, max ${String(Math.max(...moveCounts))}, avg ${avg.toFixed(0)}`)
}
if (failures.length) {
  console.log(`\n${String(failures.length)} failures:`)
  for (const f of failures) {
    console.log(`  seed ${String(f.seed)}: ${f.kind} at move ${String(f.moves)}, round ${String(f.round)}${f.seat !== undefined ? `, seat ${String(f.seat)}` : ''}${f.move ? `, move ${JSON.stringify(f.move)}` : ''}${f.error ? `, error: ${f.error}` : ''}`)
  }
} else {
  console.log('\nno failures')
}
