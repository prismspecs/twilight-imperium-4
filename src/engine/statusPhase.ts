import { objectiveDef } from '../data/objectives'
import { distributeTokens } from './economy'
import { addVp, controlledPlanets, controlsMecatol, scoreObjective, scoreable } from './objectives'
import { deriveSeed } from './rng'
import { ALL_STRATEGY_CARDS, postRollEntry, rollGuardianFleet, rollPosts } from './setup'
import { snakeOrder } from './strategyPhase'
import type { GameState, Result, Seat, StatusParams, System } from './types'

// R3.3 step 5 / R4.2: seed salt for the status-phase guardian reroll, kept distinct from other seeded rolls
const GUARDIAN_REROLL_SALT = 91
/**
 * R8: the trade posts turn over every round, so the status phase rolls a new pair in the same step. The salt
 * carries the round that is starting (2 to 6, so the salts are 102 to 106) and is therefore disjoint both
 * from the guardian reroll's 91 on the same seed and from every other round's post roll.
 */
const POSTS_ROUND_SALT_BASE = 100

/** R3.3 step 3: two command tokens, three with Hyper Metabolism. */
export function tokensGained(state: GameState, seat: Seat): number {
  return state.players[seat].techs.includes('hyper_metabolism') ? 3 : 2
}

/** R3.3 step 1: every objective the seat may score, plus 1 VP for Mecatol Rex. */
export function scoreAll(state: GameState, seat: Seat): GameState {
  let next = state
  for (const id of scoreable(state, seat)) next = scoreObjective(next, seat, id)
  if (controlsMecatol(next, seat)) next = addVp(next, seat, 1, 'Mecatol Rex')
  return next
}

/** R7: higher VP, then the Mecatol Rex controller, then more planets, then whoever follows the speaker. */
export function decideWinner(state: GameState): Seat {
  let best: Seat = 0
  for (let i = 1; i < state.players.length; i++) if (better(state, best, i)) best = i
  return best
}

/** Returns true when seat `b` outranks seat `a` on the R7 tie-breakers. */
function better(state: GameState, a: Seat, b: Seat): boolean {
  if (state.players[a].vp !== state.players[b].vp) return state.players[b].vp > state.players[a].vp
  if (controlsMecatol(state, a) !== controlsMecatol(state, b)) return controlsMecatol(state, b)
  const pa = controlledPlanets(state, a).length
  const pb = controlledPlanets(state, b).length
  if (pa !== pb) return pb > pa
  // the speaker's opponent wins ties (the seat immediately after the speaker in turn order)
  const sa = seatAfter(state, a)
  const sb = seatAfter(state, b)
  return sb > sa
}

function seatAfter(state: GameState, seat: Seat): number {
  return (seat - state.speaker + state.players.length) % state.players.length
}

/** R7: the check fires at 7 VP (10 VP for 3-6p) and unconditionally after round 6 (round 8 for 3-6p). */
export function victoryCheck(state: GameState): Seat | null {
  const targetVp = state.players.length <= 2 ? 7 : 10
  const maxRounds = state.players.length <= 2 ? 6 : 8
  if (state.players.every(p => p.vp < targetVp) && state.round < maxRounds) return null
  return decideWinner(state)
}

/** R3.3 steps 2 and 4 to 6, run once both players have submitted their status move. */
export function finishStatusPhase(state: GameState, seed: number): GameState {
  let next = state
  // R7: one objective off the shuffled pool per round; the pool runs out before round 6 does
  const nextId = state.objectiveOrder[state.round]
  const revealed = nextId === undefined ? undefined : objectiveDef(nextId)
  if (state.round < 6 && revealed && !next.publicObjectives.includes(revealed.id)) {
    next = {
      ...next,
      publicObjectives: [...next.publicObjectives, revealed.id],
      log: [...next.log, { t: 'info', text: `objective revealed: ${revealed.text}` }],
    }
  }
  const systems: Record<string, System> = Object.fromEntries(Object.entries(next.systems).map(([id, sys]): [string, System] => [id, {
    ...sys, activatedBy: [], planets: sys.planets.map(p => ({ ...p, exhausted: false })),
  }]))
  const players = [...next.players] as GameState['players']
  for (const seat of state.players.map((_, i) => i)) {
    players[seat] = {
      ...players[seat], strategyCards: [], passed: false, inheritanceExhausted: false,
      resourcesSpentThisRound: 0, influenceSpentThisRound: 0, tradeGoodsSpentThisRound: 0, tokensSpentThisRound: 0,
      tradedThisRound: { west: false, east: false },
    }
  }
  // R3.1: the played cards come back with bonus 0, the unpicked ones keep the trade goods they collected
  const strategyPool = ALL_STRATEGY_CARDS.map(id => ({ id, bonus: next.strategyPool.find(c => c.id === id)?.bonus ?? 0 }))
  next = { ...next, systems, players, strategyPool, tactical: null, turnDone: false, pendingSecondary: null, statusSubmitted: [] }
  // R3.3 step 5 / R4.2: a fresh guardian fleet as long as nobody controls Mecatol Rex
  if (state.players.every((_, i) => !controlsMecatol(next, i))) next = rollGuardianFleet(next, deriveSeed(seed, GUARDIAN_REROLL_SALT))
  const winner = victoryCheck(next)
  if (winner !== null) {
    return { ...next, phase: 'ended', winner, draft: [], log: [...next.log, { t: 'info', text: `seat ${winner} wins with ${next.players[winner].vp} VP` }] }
  }
  // R3.3 step 6 and R3.1: the speaker token moves on and the next round drafts a new snake
  const speaker = (next.speaker + 1) % state.players.length
  // R8: the round starting here gets two new posts, drawn from the four that were not in play. They are new
  // posts, so the ability nobody took is gone with them and the fresh pair starts unused.
  const round = next.round + 1
  const posts = rollPosts(deriveSeed(seed, POSTS_ROUND_SALT_BASE + round), [next.posts.west, next.posts.east])
  const draft = snakeOrder({ ...next, speaker })
  return {
    ...next, round, phase: 'strategy', speaker, active: speaker, draft,
    posts, postAbilityUsed: { west: false, east: false },
    log: [...next.log, { t: 'info', text: postRollEntry(posts) }],
  }
}

// R3.3: the status phase normally opens with `active === speaker` (set by `pass()` on the action phase's last
// pass, and by `toStatusPhase()` in tests), but the phase is closed by counting the submissions in
// `statusSubmitted`, not by comparing the active seat against the speaker: a state that entered the phase on
// the other seat still needs two moves, and no seat may submit twice.
export function status(state: GameState, params: StatusParams, seed: number): Result<GameState> {
  if (state.phase !== 'status') return { ok: false, error: 'not in the status phase' }
  const seat = state.active
  if (state.statusSubmitted.includes(seat)) return { ok: false, error: `R3.3: seat ${seat} has already submitted its status move` }
  const scored = scoreAll(state, seat)
  const distributed = distributeTokens(scored, seat, params.tokens, tokensGained(state, seat))
  if (!distributed.ok) return distributed
  const statusSubmitted = [...state.statusSubmitted, seat]
  const submitted: GameState = { ...distributed.value, statusSubmitted }
  // N-player: the phase closes once every seat has submitted its status move
  if (statusSubmitted.length < state.players.length) return { ok: true, value: { ...submitted, active: (seat + 1) % state.players.length } }
  return { ok: true, value: finishStatusPhase(submitted, seed) }
}
