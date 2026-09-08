import { objectiveDef } from '../data/objectives'
import { drawActionCards } from './actionCards'
import { neighbours } from './adjacency'
import { enterAgendaOrNextRound } from './agendas'
import { distributeTokens } from './economy'
import { controlledPlanets, controlsMecatol, scoreObjective, scoreable } from './objectives'
import { deriveSeed } from './rng'
import { ALL_STRATEGY_CARDS, postRollEntry, rollPosts } from './setup'
import { snakeOrder } from './strategyPhase'
import type { GameState, Result, Seat, StatusParams, System } from './types'
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

/** R3.3 step 1: every objective the seat may score. */
export function scoreAll(state: GameState, seat: Seat): GameState {
  let next = state
  for (const id of scoreable(state, seat)) next = scoreObjective(next, seat, id)
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

/** In base game TI4, the check fires at 10 VP and unconditionally after round 8. */
export function victoryCheck(state: GameState): Seat | null {
  const targetVp = 10
  const maxRounds = 8
  if (state.players.every(p => p.vp < targetVp) && state.round < maxRounds) return null
  return decideWinner(state)
}

/** R3.3 steps 2 and 4 to 6: score-adjacent bookkeeping that runs whether or not the agenda phase follows. */
function endOfRoundCleanup(state: GameState, seed: number): GameState {
  let next = state
  // One objective off the shuffled pool per round
  const nextId = state.objectiveOrder[state.round]
  const revealed = nextId === undefined ? undefined : objectiveDef(nextId)
  if (state.round < 8 && revealed && !next.publicObjectives.includes(revealed.id)) {
    next = {
      ...next,
      publicObjectives: [...next.publicObjectives, revealed.id],
      log: [...next.log, { t: 'info', text: `objective revealed: ${revealed.text}` }],
    }
  }
  // R3.3 step 3: each player draws 1 action card, in turn order from the speaker
  for (let i = 0; i < next.players.length; i++) {
    next = drawActionCards(next, (next.speaker + i) % next.players.length, 1, deriveSeed(seed, 110 + i))
  }
  const systems: Record<string, System> = Object.fromEntries(Object.entries(next.systems).map(([id, sys]): [string, System] => [id, {
    ...sys, activatedBy: [], planets: sys.planets.map(p => ({ ...p, exhausted: false })),
  }]))
  const players = [...next.players] as GameState['players']
  for (const seat of state.players.map((_, i) => i)) {
    players[seat] = {
      ...players[seat], strategyCards: [], passed: false, inheritanceExhausted: false, productionBiomesExhausted: false,
      resourcesSpentThisRound: 0, influenceSpentThisRound: 0, tradeGoodsSpentThisRound: 0, tokensSpentThisRound: 0,
      tradedThisRound: { west: false, east: false },
    }
  }
  // R3.1: the played cards come back with bonus 0, the unpicked ones keep the trade goods they collected
  const strategyPool = ALL_STRATEGY_CARDS.map(id => ({ id, bonus: next.strategyPool.find(c => c.id === id)?.bonus ?? 0 }))
  return { ...next, systems, players, strategyPool, tactical: null, turnDone: false, pendingSecondary: null, statusSubmitted: [] }
}

/** R3.1/R10: the round+1/phase:strategy tail, run either right after the status phase (no agenda this round)
 * or after the agenda phase resolves both its agendas. The speaker token does not rotate on its own: it
 * starts with the seat the setup names and only the Politics primary hands it on, which is exactly what
 * makes Politics worth picking. */
export function startNextRound(state: GameState, seed: number): GameState {
  const speaker = state.speaker
  // R8: the round starting here gets two new posts, drawn from the four that were not in play. They are new
  // posts, so the ability nobody took is gone with them and the fresh pair starts unused.
  const round = state.round + 1
  const posts = rollPosts(deriveSeed(seed, POSTS_ROUND_SALT_BASE + round), [state.posts.west, state.posts.east])
  const draft = snakeOrder({ ...state, speaker })
  return {
    ...state, round, phase: 'strategy', speaker, active: speaker, draft,
    posts, postAbilityUsed: { west: false, east: false },
    log: [...state.log, { t: 'info', text: postRollEntry(posts) }],
  }
}

/** R3.3 steps 2 and 4 to 6, run once both players have submitted their status move. */
export function finishStatusPhase(state: GameState, seed: number): GameState {
  const next = endOfRoundCleanup(state, seed)
  const winner = victoryCheck(next)
  if (winner !== null) {
    return { ...next, phase: 'ended', winner, draft: [], log: [...next.log, { t: 'info', text: `seat ${winner} wins with ${next.players[winner].vp} VP` }] }
  }
  return enterAgendaOrNextRound(next, seed, startNextRound)
}

/** Arborec faction tech Bioplasmosis: relocate ground forces to a planet the seat controls in the same
 * system or an adjacent one, validated against the state as it stood when the status phase began (so a
 * batch of moves cannot chain hops through an intermediate planet within the same call). */
function applyBioplasmosis(before: GameState, state: GameState, seat: Seat, moves: { infantryId: number; to: string }[]): Result<GameState> {
  let next = state
  for (const { infantryId, to } of moves) {
    let fromSysId: string | null = null
    let unit: System['planets'][number]['ground'][number] | null = null
    for (const [sysId, sys] of Object.entries(before.systems)) {
      const found = sys.planets.flatMap(p => p.ground).find(u => u.id === infantryId && u.owner === seat && u.type === 'infantry')
      if (found) { fromSysId = sysId; unit = found; break }
    }
    if (!unit || fromSysId === null) return { ok: false, error: `no such infantry ${infantryId}` }
    const toEntry = Object.entries(before.systems).find(([, sys]) => sys.planets.some(p => p.id === to))
    if (!toEntry) return { ok: false, error: `unknown planet ${to}` }
    const [toSysId, toSys] = toEntry
    const destPlanet = toSys.planets.find(p => p.id === to)
    if (!destPlanet || destPlanet.owner !== seat) return { ok: false, error: `${to} is not controlled by seat ${seat}` }
    if (toSysId !== fromSysId && !neighbours(before.systems, fromSysId, state.players[seat].faction).includes(toSysId)) {
      return { ok: false, error: `${to} is not in the same system as infantry ${infantryId}, or an adjacent one` }
    }
    const dropped: System = {
      ...next.systems[fromSysId],
      planets: next.systems[fromSysId].planets.map(p => ({ ...p, ground: p.ground.filter(u => u.id !== infantryId) })),
    }
    if (fromSysId === toSysId) {
      next = { ...next, systems: { ...next.systems, [fromSysId]: { ...dropped, planets: dropped.planets.map(p => p.id === to ? { ...p, ground: [...p.ground, unit!] } : p) } } }
    } else {
      const placed: System = { ...next.systems[toSysId], planets: next.systems[toSysId].planets.map(p => p.id === to ? { ...p, ground: [...p.ground, unit!] } : p) }
      next = { ...next, systems: { ...next.systems, [fromSysId]: dropped, [toSysId]: placed } }
    }
  }
  return { ok: true, value: next }
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
  // R3.3/TI4 rule: after gaining the round's new tokens, a player may also redistribute every command
  // token they already hold among the three pools, not just place the new ones.
  const distributed = distributeTokens(scored, seat, params.tokens, tokensGained(state, seat), true)
  if (!distributed.ok) return distributed
  let withBioplasmosis = distributed.value
  if (params.redistribute?.length) {
    if (!state.players[seat].techs.includes('bioplasmosis')) return { ok: false, error: 'Bioplasmosis has not been researched' }
    const relocated = applyBioplasmosis(state, withBioplasmosis, seat, params.redistribute)
    if (!relocated.ok) return relocated
    withBioplasmosis = relocated.value
  }
  const statusSubmitted = [...state.statusSubmitted, seat]
  const submitted: GameState = { ...withBioplasmosis, statusSubmitted }
  // N-player: the phase closes once every seat has submitted its status move
  if (statusSubmitted.length < state.players.length) return { ok: true, value: { ...submitted, active: (seat + 1) % state.players.length } }
  return { ok: true, value: finishStatusPhase(submitted, seed) }
}
