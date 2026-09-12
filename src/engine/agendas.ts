import { agendaDef } from '../data/agendas'
import { MECATOL_ID } from '../data/map'
import { drawActionCards } from './actionCards'
import { destroyUnits, readyAllPlanets, returnToReinforcements } from './board'
import { exhaustPlanets } from './economy'
import { addVp } from './objectives'
import { voteOrder } from './strategyPhase'
import { victoryCheck } from './statusPhase'
import { isShip } from '../data/units'
import { neighbours } from './adjacency'
import type { AgendaRound, GameState, Move, Planet, Result, Seat, UnitType } from './types'

/** The cost order for non-fighter ships, matching the combat module's logic. */
const NON_FIGHTER_ORDER: readonly UnitType[] = (['fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'flagship', 'warsun'] as const).filter(t => t !== 'fighter')

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
  // LRR: an elected planet must be controlled by a player — every controlled planet is a legal target.
  if (def.target === 'Elect Planet') {
    const ids = electablePlanets(state, 'any')
    return ids.length ? ids : ['abstain']
  }
  if (def.target === 'Elect Non-Home Planet Other Than Mecatol Rex') {
    const ids = electablePlanets(state, 'non-home')
    return ids.length ? ids : ['abstain']
  }
  // Elect Law / Elect Scored Secret Objective and friends: this increment does not enumerate real targets
  // for them, so the only legal outcome is a 0-vote pass — the round still resolves, and
  // `resolveAgendaRound`'s no-resolver path records that nothing was enacted.
  return ['abstain']
}

/** The planets a vote may elect: controlled by a player (LRR), narrowed to non-home non-Mecatol on request. */
function electablePlanets(state: GameState, kind: 'any' | 'non-home'): string[] {
  const out: string[] = []
  for (const sys of Object.values(state.systems)) {
    if (kind === 'non-home' && (sys.home !== null || sys.id === MECATOL_ID)) continue
    for (const p of sys.planets) if (p.owner !== null) out.push(p.id)
  }
  return out
}

/** Applies `fn` to the one planet with `planetId`, wherever it sits. */
function withPlanet(state: GameState, planetId: string, fn: (p: Planet) => Planet): GameState {
  const systems = Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
    ...sys, planets: sys.planets.map(p => p.id === planetId ? fn(p) : p),
  }]))
  return { ...state, systems }
}

/** The system a planet lives in. */
function systemOfPlanet(state: GameState, planetId: string): string | undefined {
  return Object.values(state.systems).find(sys => sys.planets.some(p => p.id === planetId))?.id
}

/** Attaches a law agenda to its elected planet, applying any value change it prints. */
function attachLaw(state: GameState, agendaId: string, planetId: string, patch?: Partial<Pick<Planet, 'resources' | 'influence'>>): GameState {
  return withPlanet(state, planetId, p => ({ ...p, attachments: [...(p.attachments ?? []), agendaId], ...(patch ?? {}) }))
}

/** The planet with `planetId`, or undefined. */
function planetById(state: GameState, planetId: string): Planet | undefined {
  return Object.values(state.systems).flatMap(sys => sys.planets).find(p => p.id === planetId)
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

/** The law attached and its value change (if any) applied, but the ongoing effect needs engine support
 * that does not exist yet — say so in the log instead of pretending. */
function notEnforced(state: GameState, name: string, what: string): GameState {
  return { ...state, log: [...state.log, { t: 'info', text: `${name}: the law is attached, but ${what} is not enforced by the engine yet` }] }
}

const AGENDA_RESOLVERS: Readonly<Partial<Record<string, Resolver>>> = {
  senate_sanctuary: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    return planet ? attachLaw(state, 'senate_sanctuary', outcome, { influence: planet.influence + 2 }) : state
  },
  terraforming_initiative: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    return planet ? attachLaw(state, 'terraforming_initiative', outcome, { resources: planet.resources + 1, influence: planet.influence + 1 }) : state
  },
  core_mining: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    if (!planet) return state
    let next = attachLaw(state, 'core_mining', outcome, { resources: planet.resources + 2 })
    const sysId = systemOfPlanet(next, outcome)
    if (sysId && planet.ground.length > 0) next = destroyUnits(next, sysId, planet.ground.slice(0, 1))
    return next
  },
  compensated_disarmament: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    const sysId = systemOfPlanet(state, outcome)
    if (!planet || !sysId || planet.owner === null) return state
    const destroyed = planet.ground.length
    if (destroyed === 0) return state
    const next = destroyUnits(state, sysId, planet.ground)
    const players = [...next.players] as GameState['players']
    players[planet.owner] = { ...players[planet.owner], tradeGoods: players[planet.owner].tradeGoods + destroyed }
    return { ...next, players }
  },
  minister_of_war: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    const sysId = systemOfPlanet(state, outcome)
    if (!planet || !sysId) return state
    let next = destroyUnits(state, sysId, [...planet.ground, ...planet.structures])
    // Ruling (a choice the engine takes for the table): "the player who controls that planet chooses 1
    // player with the fewest victory points" resolves to the lowest-VP seat, ties to the lowest seat.
    const controller = planet.owner
    if (controller === null) return next
    const seats = next.players.map((_, i) => i as Seat)
    const fewest = seats.reduce((best, s) => next.players[s].vp < next.players[best].vp ? s : best, seats[0])
    if (next.players[fewest].reinforcements.infantry < 1) return next
    const players = [...next.players] as GameState['players']
    players[fewest] = { ...players[fewest], reinforcements: { ...players[fewest].reinforcements, infantry: players[fewest].reinforcements.infantry - 1 } }
    const infantry = { id: next.nextUnitId, type: 'infantry' as const, owner: fewest, damaged: false }
    next = {
      ...withPlanet({ ...next, players, nextUnitId: next.nextUnitId + 1 }, outcome, p => ({ ...p, ground: [...p.ground, infantry] })),
      log: [...next.log, { t: 'info', text: `Minister of War: seat ${fewest} (fewest VP) places 1 infantry on ${planet.name}` }],
    }
    return next
  },
  // Attached laws whose ongoing effect this engine does not enforce yet; the attachment is recorded so
  // the law is at least visible in the state (Elect Law needs it too), and the resolution says so.
  // Attached laws whose ongoing effect this engine does not enforce yet; the attachment is recorded so
  // the law is at least visible in the state (Elect Law needs it too), and the resolution says so. The
  // immediate effects printed on the same cards (the destruction, the 1 VP) ARE resolved here.
  demilitarized_zone: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    const sysId = systemOfPlanet(state, outcome)
    const units = planet ? [...planet.ground, ...planet.structures] : []
    const destroyed = sysId && units.length > 0 ? destroyUnits(state, sysId, units) : state
    return notEnforced(attachLaw(destroyed, 'demilitarized_zone', outcome), 'Demilitarized Zone', 'the landing/production ban')
  },
  holy_planet_of_ixth: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    let next = attachLaw(state, 'holy_planet_of_ixth', outcome)
    if (planet && planet.owner !== null) next = addVp(next, planet.owner, 1, 'Holy Planet of Ixth')
    return notEnforced(next, 'Holy Planet of Ixth', 'the control-change VP swings and the PRODUCTION ban')
  },
  ixthian_artifact: (state, _agenda) => {
    // Ixthian Artifact: destroy units adjacent to Mecatol Rex
    const mecatol = Object.entries(state.systems).find(([id]) => id === 'mecatol' || id === 'mecatolrex')
    if (!mecatol) return state
    const [mecatolId] = mecatol
    const adjacentSysIds = neighbours(state.systems, mecatolId)
    
    let next = state
    // Destroy units in adjacent systems
    const systems = { ...next.systems }
    for (const sysId of adjacentSysIds) {
      const sys = systems[sysId]
      if (!sys) continue
      for (const seat of state.players.map((_, i) => i as Seat)) {
        const myUnits = sys.space.filter(u => u.owner === seat && isShip(u.type))
        if (myUnits.length <= 3) {
          // Destroy all units if 3 or fewer
          if (myUnits.length > 0) {
            systems[sysId] = { ...sys, space: sys.space.filter(u => u.owner !== seat || !isShip(u.type)) }
            next = { ...next, systems }
            next = returnToReinforcements(next, myUnits)
            next = { ...next, log: [...next.log, { t: 'info', text: `Ixthian Artifact: ${myUnits.length} units of seat ${seat + 1} are destroyed in ${sysId} (adjacent to Mecatol)` }] }
          }
        } else {
          // Otherwise, destroy 3 cheapest units
          const toDestroy = NON_FIGHTER_ORDER.flatMap(t => myUnits.filter(u => u.type === t)).slice(0, 3)
          if (toDestroy.length > 0) {
            systems[sysId] = { ...sys, space: sys.space.filter(u => !toDestroy.find(v => v.id === u.id)) }
            next = { ...next, systems }
            next = returnToReinforcements(next, toDestroy)
            next = { ...next, log: [...next.log, { t: 'info', text: `Ixthian Artifact: 3 units of seat ${seat + 1} are destroyed in ${sysId}` }] }
          }
        }
      }
    }
    return next
  },
  research_team_biotic: (state, _agenda, outcome) => notEnforced(attachLaw(state, 'research_team_biotic', outcome), 'Research Team: Biotic', 'the prerequisite ignore'),
  research_team_cybernetic: (state, _agenda, outcome) => notEnforced(attachLaw(state, 'research_team_cybernetic', outcome), 'Research Team: Cybernetic', 'the prerequisite ignore'),
  research_team_propulsion: (state, _agenda, outcome) => notEnforced(attachLaw(state, 'research_team_propulsion', outcome), 'Research Team: Propulsion', 'the prerequisite ignore'),
  research_team_warfare: (state, _agenda, outcome) => notEnforced(attachLaw(state, 'research_team_warfare', outcome), 'Research Team: Warfare', 'the prerequisite ignore'),
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
  // Galactic Threat: the Nekro Virus cannot vote, so it never enters the order — filtering it out here,
  // rather than offering it zero outcomes, is what keeps the vote able to run to completion.
  const order = voteOrder(state).filter(s => !barredFromVoting.includes(s) && state.players[s].faction !== 'nekro')
  // Xxcha: Quash - discard the current agenda and reveal the next one
  const isQuash = state.players[state.active].faction === 'xxcha' && slot === 1 && state.agendaDeck.length > 1
  const nextSlot = isQuash ? 2 : slot
  return {
    ...state,
    agendaDeck: isQuash ? state.agendaDeck.slice(2) : state.agendaDeck.slice(1),
    agenda: { revealed: isQuash ? state.agendaDeck[1] : revealed, slot: nextSlot, votes: {}, order, barredFromVoting },
    active: order[0] ?? state.speaker,
    log: [...state.log, { t: 'info', text: `agenda revealed: ${agendaDef(isQuash ? state.agendaDeck[1] : revealed).name}` }],
  }
}

/** R10: enters the agenda phase once the status phase's own cleanup is done, or goes straight to the next
 * round if the custodians token is still on Mecatol Rex. */
export function enterAgendaOrNextRound(state: GameState, _seed: number, startNextRound: (s: GameState) => GameState): GameState {
  if (state.custodiansToken !== false) return startNextRound(state)
  if (state.agendaDeck.length === 0) return startNextRound(state)   // the deck ran dry: nothing to reveal
  return { ...revealAgenda(state, 1, []), phase: 'agenda' }
}

/** R10: tally the just-finished vote, apply the outcome, then move to the second agenda or the next round. */
function resolveAgendaRound(state: GameState, _seed: number, startNextRound: (s: GameState) => GameState): GameState {
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
  // LRR agenda phase step 3: planets exhausted for voting ready again here, before the next round begins —
  // separately from the status phase's own readying, which already happened earlier this round.
  return startNextRound(readyAllPlanets(next))
}

/** R10: one seat's vote on the revealed agenda. */
export function castVote(state: GameState, outcome: string, planets: string[], seed: number, startNextRound: (s: GameState) => GameState): Result<GameState> {
  if (state.phase !== 'agenda' || !state.agenda) return { ok: false, error: 'not in the agenda phase' }
  const agenda = state.agenda
  const seat = agenda.order[0]
  if (seat === undefined || seat !== state.active) return { ok: false, error: 'R10: not this seat\'s vote' }
  if (state.players[seat].faction === 'nekro') return { ok: false, error: 'R10: the Nekro Virus cannot vote (Galactic Threat)' }
  if (!legalOutcomes(state, agenda.revealed).includes(outcome)) return { ok: false, error: `R10: ${outcome} is not a legal outcome` }
  const paid = exhaustPlanets(state, seat, planets)
  if (!paid.ok) return paid
  const votes = { ...agenda.votes, [seat]: { outcome, influence: paid.value.influence } }
  const order = agenda.order.slice(1)
  const withVote: GameState = { ...paid.value.state, agenda: { ...agenda, votes, order }, active: order[0] ?? seat }
  if (order.length > 0) return { ok: true, value: withVote }
  return { ok: true, value: resolveAgendaRound(withVote, seed, startNextRound) }
}
