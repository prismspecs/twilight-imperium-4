import { agendaDef } from '../data/agendas'
import { drawActionCards } from './actionCards'
import { destroyUnits } from './board'
import { exhaustPlanets } from './economy'
import { addVp } from './objectives'
import { voteOrder } from './strategyPhase'
import { victoryCheck } from './statusPhase'
import type { AgendaRound, GameState, Move, Result, Seat } from './types'

/**
 * R10: the agenda phase.
 *
 * `AgendaDef.text` (src/data/agendas.ts) is the printed For/Against prose, kept verbatim for display — it is
 * not machine-resolvable as written. `AGENDA_RESOLVERS` below is this engine's own resolution of the agendas
 * whose outcome it can fully enact; every other agenda in the (real, unfiltered) 50-card deck is still voted
 * on for real when revealed, and if the elected outcome has no resolver, `resolveAgendaRound` logs that and
 * moves on rather than pretending to enact it. Unlike the action-card and reaction-card allow-lists, the
 * agenda deck is never filtered: Politics's primary already peeks and reorders the real, full deck, and
 * `politicsConstruction.test.ts` locks that exact order down.
 */

/** The outcomes a voter may name for the revealed agenda, from its printed `target`. */
export function legalOutcomes(state: GameState, agendaId: string): string[] {
  const def = agendaDef(agendaId)
  if (def.target === 'For/Against') return ['For', 'Against']
  if (def.target === 'Elect Player') return state.players.map((_, i) => String(i))
  // Elect Planet / Elect Law / Elect Scored Secret Objective and friends: this increment does not enumerate
  // real targets for them, so the only legal outcome is a 0-vote pass — the round still resolves, and
  // `resolveAgendaRound`'s no-resolver path records that nothing was enacted.
  return ['abstain']
}

/** One castVote move per legal outcome, each suggesting "commit every ready planet" — the UI or AI may
 * submit any smaller (or empty) set instead; `castVote` itself validates whatever is actually sent. */
export function agendaMoves(state: GameState): Move[] {
  const agenda = state.agenda
  if (!agenda) return []
  const seat = agenda.order[0]
  if (seat === undefined) return []
  const readyPlanets = readyInfluencePlanets(state, seat)
  return legalOutcomes(state, agenda.revealed).map((outcome): Move => ({ type: 'castVote', outcome, planets: readyPlanets }))
}

/** Every ready planet of the seat's that prints influence — the maximal, not necessarily wanted, vote. */
export function readyInfluencePlanets(state: GameState, seat: Seat): string[] {
  const out: string[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat && !p.exhausted && p.influence > 0) out.push(p.id)
  }
  return out
}

function tally(agenda: AgendaRound): Map<string, number> {
  const totals = new Map<string, number>()
  for (const vote of Object.values(agenda.votes)) {
    if (!vote) continue
    totals.set(vote.outcome, (totals.get(vote.outcome) ?? 0) + vote.influence)
  }
  return totals
}

/** The winning outcome: most votes, ties broken by the speaker's own vote (TI4 rule) — since the speaker
 * votes last in `voteOrder`, their outcome is simply preferred among the tied leaders. */
function winningOutcome(state: GameState, agenda: AgendaRound): string | null {
  const totals = tally(agenda)
  if (totals.size === 0) return null
  const best = Math.max(...totals.values())
  const leaders = [...totals.entries()].filter(([, v]) => v === best).map(([o]) => o)
  if (leaders.length === 1) return leaders[0]
  const speakerVote = agenda.votes[state.speaker]?.outcome
  return speakerVote && leaders.includes(speakerVote) ? speakerVote : leaders[0]
}

type Resolver = (state: GameState, agenda: AgendaRound, outcome: string) => GameState

const AGENDA_RESOLVERS: Readonly<Partial<Record<string, Resolver>>> = {
  economic_equality: (state, _agenda, outcome) => {
    const players = state.players.map(p => ({
      ...p, tradeGoods: outcome === 'For' ? 5 : 0,
    })) as GameState['players']
    return { ...state, players }
  },
  mutiny: (state, agenda, outcome) => {
    let next = state
    for (const seat of state.players.map((_, i) => i as Seat)) {
      if (agenda.votes[seat]?.outcome !== 'For') continue
      next = addVp(next, seat, outcome === 'For' ? 1 : -1, 'Mutiny')
    }
    return next
  },
  seed_of_an_empire: (state, _agenda, outcome) => {
    const seats = state.players.map((_, i) => i as Seat)
    const target = outcome === 'For'
      ? seats.reduce((best, s) => state.players[s].vp > state.players[best].vp ? s : best)
      : seats.reduce((best, s) => state.players[s].vp < state.players[best].vp ? s : best)
    return addVp(state, target, 1, 'Seed of an Empire')
  },
  swords_to_plowshares: (state, _agenda, outcome) => {
    let next = state
    for (const [sysId, sys] of Object.entries(state.systems)) {
      for (const planet of sys.planets) {
        if (planet.owner === null) continue
        if (outcome === 'For') {
          const infantry = planet.ground.filter(u => u.type === 'infantry')
          const doomed = infantry.slice(0, Math.ceil(infantry.length / 2))
          if (!doomed.length) continue
          next = destroyUnits(next, sysId, doomed)
          const players = [...next.players] as GameState['players']
          players[planet.owner] = { ...players[planet.owner], tradeGoods: players[planet.owner].tradeGoods + doomed.length }
          next = { ...next, players }
        } else {
          const players = [...next.players] as GameState['players']
          const p = players[planet.owner]
          if (p.reinforcements.infantry < 1) continue
          players[planet.owner] = { ...p, reinforcements: { ...p.reinforcements, infantry: p.reinforcements.infantry - 1 } }
          const unit = { id: next.nextUnitId, type: 'infantry' as const, owner: planet.owner, damaged: false }
          next = {
            ...next, players, nextUnitId: next.nextUnitId + 1,
            systems: {
              ...next.systems,
              [sysId]: { ...next.systems[sysId], planets: next.systems[sysId].planets.map(pl => pl.id === planet.id ? { ...pl, ground: [...pl.ground, unit] } : pl) },
            },
          }
        }
      }
    }
    return next
  },
  unconventional_measures: (state, agenda, outcome) => {
    let next = state
    for (const seat of state.players.map((_, i) => i as Seat)) {
      if (agenda.votes[seat]?.outcome !== 'For') continue
      if (outcome === 'For') {
        next = drawActionCards(next, seat, 2, seat + 1)
      } else {
        const players = [...next.players] as GameState['players']
        const hand = players[seat].actionCards
        players[seat] = { ...players[seat], actionCards: [] }
        next = { ...next, players, actionCardDiscard: [...next.actionCardDiscard, ...hand] }
      }
    }
    return next
  },
  archived_secret: (state, _agenda, outcome) => {
    const target = Number.parseInt(outcome, 10) as Seat
    const [drawn, ...rest] = state.secretObjectiveDeck
    if (drawn === undefined) return state
    const players = [...state.players] as GameState['players']
    players[target] = { ...players[target], secretObjectives: [...players[target].secretObjectives, drawn] }
    return { ...state, players, secretObjectiveDeck: rest }
  },
  public_execution: (state, _agenda, outcome) => {
    const target = Number.parseInt(outcome, 10) as Seat
    const players = [...state.players] as GameState['players']
    const hand = players[target].actionCards
    players[target] = { ...players[target], actionCards: [] }
    let next: GameState = { ...state, players, actionCardDiscard: [...state.actionCardDiscard, ...hand] }
    if (next.speaker === target) {
      next = { ...next, speaker: (target + 1) % next.players.length }
    }
    return next
  },
}

/** Public Execution keeps the elected player out of the vote for the rest of this agenda phase. */
const BARS_VOTING: Readonly<Record<string, true>> = { public_execution: true }

function applyOutcome(state: GameState, agenda: AgendaRound, outcome: string): GameState {
  const resolver = AGENDA_RESOLVERS[agenda.revealed]
  const resolved = resolver ? resolver(state, agenda, outcome) : state
  if (resolver) {
    return { ...resolved, log: [...resolved.log, { t: 'info', text: `${agendaDef(agenda.revealed).name} resolves: ${outcome}` }] }
  }
  return {
    ...resolved,
    log: [...resolved.log, { t: 'info', text: `the elected outcome of ${agendaDef(agenda.revealed).name} has no engine effect yet — recorded, not enforced` }],
  }
}

/** Reveals the round's first (or second) agenda and seeds a fresh vote. */
function revealAgenda(state: GameState, slot: 1 | 2, barredFromVoting: Seat[]): GameState {
  const revealed = state.agendaDeck[0]
  const order = voteOrder(state).filter(s => !barredFromVoting.includes(s))
  return {
    ...state,
    agendaDeck: state.agendaDeck.slice(1),
    agenda: { revealed, slot, votes: {}, order, barredFromVoting },
    active: order[0] ?? state.speaker,
    log: [...state.log, { t: 'info', text: `agenda revealed: ${agendaDef(revealed).name}` }],
  }
}

/** R10: enters the agenda phase once the status phase's own cleanup is done, or goes straight to the next
 * round if the custodians token is still on Mecatol Rex. */
export function enterAgendaOrNextRound(state: GameState, seed: number, startNextRound: (s: GameState, seed: number) => GameState): GameState {
  if (state.custodiansToken !== false) return startNextRound(state, seed)
  if (state.agendaDeck.length === 0) return startNextRound(state, seed)   // the deck ran dry: nothing to reveal
  return { ...revealAgenda(state, 1, []), phase: 'agenda' }
}

/** R10: tally the just-finished vote, apply the outcome, then move to the second agenda or the next round. */
function resolveAgendaRound(state: GameState, seed: number, startNextRound: (s: GameState, seed: number) => GameState): GameState {
  const agenda = state.agenda
  if (!agenda) return state
  const outcome = winningOutcome(state, agenda)
  let next = outcome === null ? state : applyOutcome(state, agenda, outcome)
  const barred = BARS_VOTING[agenda.revealed] && outcome !== null ? [Number.parseInt(outcome, 10) as Seat] : []
  next = { ...next, agenda: null }
  const winner = victoryCheck(next)
  if (winner !== null) {
    return { ...next, phase: 'ended', winner, log: [...next.log, { t: 'info', text: `seat ${winner} wins with ${next.players[winner].vp} VP` }] }
  }
  if (agenda.slot === 1 && next.agendaDeck.length > 0) {
    return { ...revealAgenda(next, 2, barred), phase: 'agenda' }
  }
  return startNextRound(next, seed)
}

/** R10: one seat's vote on the revealed agenda. */
export function castVote(state: GameState, outcome: string, planets: string[], seed: number, startNextRound: (s: GameState, seed: number) => GameState): Result<GameState> {
  if (state.phase !== 'agenda' || !state.agenda) return { ok: false, error: 'not in the agenda phase' }
  const agenda = state.agenda
  const seat = agenda.order[0]
  if (seat === undefined || seat !== state.active) return { ok: false, error: 'R10: not this seat\'s vote' }
  if (!legalOutcomes(state, agenda.revealed).includes(outcome)) return { ok: false, error: `R10: ${outcome} is not a legal outcome` }
  const paid = exhaustPlanets(state, seat, planets)
  if (!paid.ok) return paid
  const votes = { ...agenda.votes, [seat]: { outcome, influence: paid.value.influence } }
  const order = agenda.order.slice(1)
  const withVote: GameState = { ...paid.value.state, agenda: { ...agenda, votes, order }, active: order[0] ?? seat }
  if (order.length > 0) return { ok: true, value: withVote }
  return { ok: true, value: resolveAgendaRound(withVote, seed, startNextRound) }
}
