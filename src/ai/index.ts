import { applyMove, legalMoves } from '../engine'
import { deriveSeed, mulberry32 } from '../engine/rng'
import type { GameState, Move, Seat } from '../engine/types'
import { fillMoveShips, fillProduce } from './fill'
import { playerView } from './fog'
import { scoreMove } from './score'

/**
 * Fill legalMoves' templates with a concrete plan before scoring. `legalMoves` hands back `moveShips` with an
 * empty `moves` array and `produce` with empty `units`/`planets`; a human fills them through the interface,
 * the AI fills them here with the whole (engine-visible) state, then hands the result to the scorer.
 */
function fillTemplate(state: GameState, move: Move, seat: Seat): Move {
  switch (move.type) {
    case 'moveShips': {
      const moves = fillMoveShips(state, seat)
      return moves.length ? { ...move, moves } : { type: 'endMovement' }
    }
    case 'produce': {
      const tac = state.tactical
      if (!tac) return move
      const plan = fillProduce(state, seat, tac.systemId)
      return { type: 'produce', units: plan.units, planets: plan.planets, tradeGoods: plan.tradeGoods }
    }
    default:
      return move
  }
}

/**
 * A scorable candidate: the concrete move and how good the seat found it.
 */
interface Candidate { move: Move; score: number }

/**
 * Choose the move the AI seat plays next. The choice is a pure function of the state: scoring is
 * deterministic and ties break on a flow from the game seed, so tests can rely on the exact chosen move.
 */
export function aiChoose(state: GameState, moves: Move[], seat: Seat): Move {
  if (moves.length === 0) throw new Error(`no legal moves for seat ${seat}`)
  if (moves.length === 1) return moves[0]
  const view = playerView(state, seat)
  const candidates: Candidate[] = moves.map(move => ({ move: fillTemplate(state, move, seat), score: 0 }))
  for (const c of candidates) c.score = scoreMove(view, c.move, seat)
  candidates.sort((a, b) => b.score - a.score || a.move.type.localeCompare(b.move.type))
  const best = candidates[0].score
  const top = candidates.filter(c => c.score === best)
  if (top.length === 1) return top[0].move
  const rng = mulberry32(deriveSeed(seedOf(state), seat))
  return top[Math.floor(rng() * top.length)].move
}

/** A cheap but stable tie-break seed from the state so equal-scoring choices stay deterministic. */
function seedOf(state: GameState): number {
  let h = 2166136261 >>> 0
  for (const e of state.log) {
    if (e.t !== 'move') continue
    h ^= e.seed
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** The full AI loop for a seat: keep playing legal moves while it is `seat`'s turn and the game is live. */
export function aiPlay(state: GameState, seat: Seat, seed: number): GameState {
  let current = state
  while (current.winner === null && current.phase !== 'ended' && current.active === seat) {
    const moves = legalMoves(current)
    if (moves.length === 0) break
    const move = aiChoose(current, moves, seat)
    const result = applyMove(current, move, deriveSeed(seed, moveCount(current)))
    if (!result.ok) break
    current = result.value
  }
  return current
}

function moveCount(state: GameState): number {
  return state.log.filter(e => e.t === 'move').length
}
