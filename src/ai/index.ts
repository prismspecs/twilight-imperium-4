import { applyMove, createGame, legalMoves } from '../engine'
import { homeSystemOf } from '../engine/board'
import { deriveSeed, mulberry32 } from '../engine/rng'
import type { GameState, Move, Seat } from '../engine/types'
import { fillCastVote, fillMoveShips, fillProduce, fillStatusTokens } from './fill'
import { playerView } from './fog'
import { DEFAULT_WEIGHTS, scoreMove } from './score'
import type { ScoreWeights } from './score'

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
    case 'status': {
      const tokens = fillStatusTokens(state, seat)
      return { type: 'status', params: { tokens } }
    }
    case 'castVote': {
      const planets = fillCastVote(state, seat)
      return { ...move, planets }
    }
    case 'secondary': {
      if (move.card === 'warfare' && move.accept) {
        const homeId = homeSystemOf(state, seat)
        const plan = fillProduce(state, seat, homeId)
        if (Object.keys(plan.units).length === 0) {
          return { type: 'secondary', card: 'warfare', accept: false }
        }
        return {
          type: 'secondary',
          card: 'warfare',
          accept: true,
          params: { units: plan.units, planets: plan.planets, tradeGoods: plan.tradeGoods },
        }
      }
      return move
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
 * Choose the move the AI seat plays next. The choice is a pure function of the state and the seat's
 * personality weights: scoring is deterministic and ties break on a flow from the game seed, so tests can
 * rely on the exact chosen move. A training loop swaps `weights` per seat to evolve distinct players.
 */
export function aiChoose(state: GameState, moves: Move[], seat: Seat, weights: Readonly<ScoreWeights> = DEFAULT_WEIGHTS): Move {
  if (moves.length === 0) throw new Error(`no legal moves for seat ${seat}`)
  if (moves.length === 1) return fillTemplate(state, moves[0], seat)
  const view = playerView(state, seat)
  const candidates: Candidate[] = moves.map(move => ({ move: fillTemplate(state, move, seat), score: 0 }))
  for (const c of candidates) c.score = scoreMove(view, c.move, seat, weights)
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

/**
 * Move types whose legalMoves entry is a template the chooser fills in (produce, moveShips, status): for
 * those, one rejection excludes the whole template, of which there is only one. Concrete moves are
 * excluded by their exact payload; a castVote is keyed by its outcome, so one rejected outcome does not
 * take the others down with it.
 */
const TEMPLATE_MOVES: ReadonlySet<Move['type']> = new Set(['moveShips', 'produce', 'status'])
const exclusionKey = (m: Move): string =>
  m.type === 'castVote' ? `castVote:${m.outcome}` : TEMPLATE_MOVES.has(m.type) ? m.type : JSON.stringify(m)

export interface AiStepResult { state: GameState; chosen: Move; rejected: Move[] }

/**
 * One AI move, with recovery. The chooser and the engine can drift (game 65TM45: the produce filler built
 * an infantry order for the Arborec, whose docks may not produce infantry), and a rejection that simply
 * stops the loop looks exactly like an AI refusing to move. The rejected candidate is excluded and the
 * next-best tried, up to `maxAttempts`; null when nothing in the list is accepted.
 */
export function aiStep(
  state: GameState, moves: Move[], seat: Seat, seed: number,
  weights: Readonly<ScoreWeights> = DEFAULT_WEIGHTS,
  choose: (state: GameState, moves: Move[], seat: Seat, weights: Readonly<ScoreWeights>) => Move = aiChoose,
  maxAttempts = 3,
): AiStepResult | null {
  const rejected: Move[] = []
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const keys = new Set(rejected.map(exclusionKey))
    const pool = moves.filter(m => !keys.has(exclusionKey(m)))
    if (pool.length === 0) break
    const chosen = choose(state, pool, seat, weights)
    const r = applyMove(state, chosen, deriveSeed(seed, moveCount(state)))
    if (r.ok) return { state: r.value, chosen, rejected }
    rejected.push(chosen)
  }
  return null
}

/** The full AI loop for a seat: keep playing legal moves while it is `seat`'s turn and the game is live. */
export function aiPlay(state: GameState, seat: Seat, seed: number, weights: Readonly<ScoreWeights> = DEFAULT_WEIGHTS): GameState {
  let current = state
  while (current.winner === null && current.phase !== 'ended' && current.active === seat) {
    const moves = legalMoves(current)
    if (moves.length === 0) break
    const move = aiChoose(current, moves, seat, weights)
    const result = applyMove(current, move, deriveSeed(seed, moveCount(current)))
    if (!result.ok) break
    current = result.value
  }
  return current
}

function moveCount(state: GameState): number {
  return state.log.filter(e => e.t === 'move').length
}

export interface MatchResult {
  winner: Seat | null
  moves: number
  rounds: number
  /** the seats' VP; -1 if the seat somehow failed to finish */
  vp: number[]
  /** a seat whose own AI move was rejected by the engine, so the trainer knows the run was corrupt */
  failed: Seat | null
}

/**
 * Play a whole game between two per-seat personalities and report who won. This is the harness a
 * co-evolution loop (and the `npm run ai:match` CLI) calls over and over; it is pure and deterministic for a
 * given config, seed and weight pair, so evolution can evaluate offspring reliably.
 */
export function playMatch(
  config: Parameters<typeof createGame>[0],
  seed: number,
  weights: Readonly<ScoreWeights>[] | [Readonly<ScoreWeights>, Readonly<ScoreWeights>],
  maxMoves = 600,
): MatchResult {
  let state = createGame(config, seed)
  let moves = 0
  let failed: Seat | null = null
  while (state.phase !== 'ended' && moves < maxMoves) {
    const options = legalMoves(state)
    if (options.length === 0) { failed = state.active; break }
    const seatWeight = weights[state.active] ?? weights[0] ?? DEFAULT_WEIGHTS
    const move = aiChoose(state, options, state.active, seatWeight)
    const r = applyMove(state, move, deriveSeed(seed, moves))
    if (!r.ok) { failed = state.active; break }
    state = r.value
    moves++
  }
  return {
    winner: state.phase === 'ended' ? state.winner : null,
    moves,
    rounds: state.round,
    vp: state.players.map(p => p.vp),
    failed,
  }
}
