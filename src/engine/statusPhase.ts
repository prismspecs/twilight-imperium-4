import { objectiveDef } from '../data/objectives'
import { drawActionCards } from './actionCards'
import { neighbours } from './adjacency'
import { enterAgendaOrNextRound } from './agendas'
import { readyAllPlanets } from './board'
import { distributeTokens } from './economy'
import { controlledPlanets, controlsMecatol, payObjective, scoreObjective, scoreable } from './objectives'
import { deriveSeed } from './rng'
import { ALL_STRATEGY_CARDS } from './setup'
import { snakeOrder } from './strategyPhase'
import type { GameState, Result, Seat, StatusParams, System, Unit } from './types'

/** R3.3 step 3: two command tokens, three with Hyper Metabolism. */
export function tokensGained(state: GameState, seat: Seat): number {
  const player = state.players[seat]
  let gained = player.techs.includes('hyper_metabolism') ? 3 : 2
  if (player.faction === 'sol') gained += 1
  return gained
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
  const readied = readyAllPlanets(next)
  const systems: Record<string, System> = Object.fromEntries(
    Object.entries(readied.systems).map(([id, sys]): [string, System] => [id, { ...sys, activatedBy: [] }])
  )
  const players = [...next.players] as GameState['players']
  for (const seat of state.players.map((_, i) => i)) {
    players[seat] = {
      ...players[seat], strategyCards: [], passed: false, inheritanceExhausted: false, productionBiomesExhausted: false, spatialConduitExhausted: false,
      resourcesSpentThisRound: 0, influenceSpentThisRound: 0, tradeGoodsSpentThisRound: 0, tokensSpentThisRound: 0,
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
export function startNextRound(state: GameState): GameState {
  const speaker = state.speaker
  const round = state.round + 1
  const draft = snakeOrder({ ...state, speaker })
  return {
    ...state, round, phase: 'strategy', speaker, active: speaker, draft,
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
  // R3.3/Arborec Mitosis: "at the start of the status phase, place 1 infantry from your reinforcements
  // on any planet you control" — mandatory unless the Arborec player controls no planets. Runs before this
  // seat's token distribution, so the placement is part of the start-of-phase bookkeeping.
  const mitosis = applyMitosis(state, seat, params.mitosisPlanet)
  if (!mitosis.ok) return mitosis
  let scored = scoreAll(mitosis.value, seat)
  // The status-phase-only spend objectives (SPEND_OBJECTIVES) are never auto-scored; each one this seat
  // chose to pay for is paid and scored here, in the order given.
  for (const [objectiveId, payment] of Object.entries(params.objectivePayments ?? {})) {
    const paid = payObjective(scored, seat, objectiveId, payment.planets, payment.tradeGoods)
    if (!paid.ok) return paid
    scored = paid.value
  }
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

/**
 * R3.3/Arborec Mitosis: "Your space docks cannot produce infantry. Instead, at the start of each status
 * phase, place 1 infantry from your reinforcements on any planet you control." LRR: "Placing the infantry
 * during the status phase is mandatory (unless the Arborec player controls no planets)."
 * Runs once per seat at the start of that seat's status move, before token distribution.
 */
export function applyMitosis(state: GameState, seat: Seat, planetId?: string): Result<GameState> {
  if (state.players[seat].faction !== 'arborec') return { ok: true, value: state }
  const player = state.players[seat]
  if (player.reinforcements.infantry < 1) return { ok: true, value: state }   // nothing to place
  const controlledIds = controlledPlanets(state, seat).map(c => c.planetId)
  if (!controlledIds.length) return { ok: true, value: state }  // skip silently if no planets
  const target = planetId ?? controlledIds[0]
  if (!controlledIds.includes(target)) return { ok: false, error: `Mitosis: you do not control ${target}` }
  const sysId = Object.entries(state.systems).find(([, sys]) => sys.planets.some(p => p.id === target))?.[0]
  if (!sysId) return { ok: false, error: `Mitosis: ${target} is not on the board` }
  const sys = state.systems[sysId]
  const nextId = state.nextUnitId
  const infantry: Unit = { id: nextId, type: 'infantry', owner: seat, damaged: false }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, reinforcements: { ...player.reinforcements, infantry: player.reinforcements.infantry - 1 } }
  const next: GameState = {
    ...state, nextUnitId: nextId + 1,
    players,
    systems: {
      ...state.systems,
      [sysId]: { ...sys, planets: sys.planets.map(p => p.id === target ? { ...p, ground: [...p.ground, infantry] } : p) },
    },
    log: [...state.log, { t: 'info', text: `Arborec Mitosis: seat ${seat} places 1 infantry on ${target}` }],
  }
  return { ok: true, value: next }
}
