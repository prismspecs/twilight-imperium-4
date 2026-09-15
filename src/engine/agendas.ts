import { agendaDef, findAgenda } from '../data/agendas'
import { objectiveDef } from '../data/objectives'
import { findTech, techDef } from '../data/techs'
import { MECATOL_ID } from '../data/map'
import { drawActionCards } from './actionCards'
import { destroyUnits, readyAllPlanets, returnToReinforcements, trimCargo, trimToFleetPool } from './board'
import { holyPlanetControlSwing, isDemilitarizedZone } from './lawEffects'
import { exhaustPlanets } from './economy'
import { addVp } from './objectives'
import { researchable } from './research'
import { deriveSeed, mulberry32 } from './rng'
import { voteOrder } from './strategyPhase'
import { victoryCheck } from './statusPhase'
import { isShip } from '../data/units'
import { neighbours } from './adjacency'
import type { AgendaRound, GameState, LogEntry, Move, Planet, Result, Seat, Unit, UnitType } from './types'

/** Unit destruction order for automated loss choices (cheapest first). */
const UNIT_DESTRUCTION_ORDER: readonly UnitType[] = [
  'fighter',
  'infantry',
  'destroyer',
  'cruiser',
  'carrier',
  'pds',
  'dreadnought',
  'spacedock',
  'flagship',
  'warsun',
]

/**
 * Shard of the Throne / The Crown of Emphidia: these Elect Player laws move to the player who gains control
 * of the relevant planet, swinging 1 victory point with them. Called whenever control of a planet changes.
 * Both transfer when their owner loses control of a planet in their home system (LRR: "immediately give it
 * to the player who gained control of that planet"). The engine has no legendary-planet trait, so the
 * legendary trigger is not represented; the home-system trigger is fully enforced. VP swing: new owner +1,
 * previous owner -1.
 */
export function transferCrownRoyalLaws(state: GameState, planetId: string, newOwner: Seat, prevOwner: Seat): GameState {
  let next = state
  const sys = Object.values(next.systems).find(s => s.planets.some(p => p.id === planetId))
  const inHomeSystem = sys !== undefined && sys.home === prevOwner
  const newOwnsHome = (): boolean => {
    return Object.values(next.systems).some(s => s.home !== null && s.home === newOwner &&
      s.planets.some(p => p.owner === newOwner))
  }
  if (inHomeSystem) {
    const shardOwner = next.lawOwners?.shard_of_the_throne
    if (shardOwner !== undefined && shardOwner === prevOwner && newOwnsHome()) {
      const players = [...next.players] as GameState['players']
      // LRR 25: victory points never go below zero — an owner holding the law at 0 VP simply loses it at 0.
      players[prevOwner] = { ...players[prevOwner], vp: Math.max(0, players[prevOwner].vp - 1) }
      players[newOwner] = { ...players[newOwner], vp: players[newOwner].vp + 1 }
      next = {
        ...next, players, lawOwners: { ...(next.lawOwners ?? {}), shard_of_the_throne: newOwner },
        log: [...next.log, { t: 'info', text: `Shard of the Throne transfers to ${next.players[newOwner].name} (+1 VP)` }],
      }
    }
    const crownOwner = next.lawOwners?.the_crown_of_emphidia
    if (crownOwner !== undefined && crownOwner === prevOwner && newOwnsHome()) {
      const players = [...next.players] as GameState['players']
      players[prevOwner] = { ...players[prevOwner], vp: Math.max(0, players[prevOwner].vp - 1) }
      players[newOwner] = { ...players[newOwner], vp: players[newOwner].vp + 1 }
      next = {
        ...next, players, lawOwners: { ...(next.lawOwners ?? {}), the_crown_of_emphidia: newOwner },
        log: [...next.log, { t: 'info', text: `The Crown of Emphidia transfers to ${next.players[newOwner].name} (+1 VP)` }],
      }
    }
  }
  // Holy Planet of Ixth swings on ANY control change of its planet, not just home systems: the new owner
  // gains 1 VP and the previous owner loses 1 (clamped at zero, LRR 25).
  return holyPlanetControlSwing(next, planetId, newOwner, prevOwner)
}

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
export function lawsInPlay(state: GameState): string[] {
  const active = state.activeAgendas ?? []
  const attached = Object.values(state.systems).flatMap(s => s.planets.flatMap(p => p.attachments ?? []))
  const owners = Object.keys(state.lawOwners ?? {})
  const all = Array.from(new Set([...active, ...attached, ...owners]))
  return all.filter(id => {
    const def = findAgenda(id)
    return def !== undefined && def.kind === 'law'
  })
}

export function scoredSecretObjectives(state: GameState): string[] {
  const scored = new Set<string>()
  for (const player of state.players) {
    for (const objId of player.scoredObjectives) {
      const def = objectiveDef(objId)
      if (def?.stage === 'secret' && !state.publicObjectives.includes(objId)) {
        scored.add(objId)
      }
    }
  }
  return Array.from(scored)
}

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
  if (def.target === 'Elect Law') {
    const laws = lawsInPlay(state)
    return laws.length ? laws : ['abstain']
  }
  if (def.target === 'Elect Scored Secret Objective') {
    const secrets = scoredSecretObjectives(state)
    return secrets.length ? secrets : ['abstain']
  }
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
  const activeAgendas = (state.activeAgendas ?? []).includes(agendaId) ? state.activeAgendas : [...(state.activeAgendas ?? []), agendaId]
  return {
    ...withPlanet(state, planetId, p => ({ ...p, attachments: [...(p.attachments ?? []), agendaId], ...(patch ?? {}) })),
    activeAgendas,
  }
}

/** Discards a law from play (activeAgendas, lawOwners, attachments), adjusting any attached VP. */
export function discardLaw(state: GameState, lawId: string): GameState {
  let next = state
  const activeAgendas = (next.activeAgendas ?? []).filter(a => a !== lawId)
  let lawOwners = next.lawOwners
  if (lawOwners && lawOwners[lawId] !== undefined) {
    const ownerSeat = lawOwners[lawId]
    if (lawId === 'shard_of_the_throne' || lawId === 'the_crown_of_emphidia') {
      next = addVp(next, ownerSeat, -1, findAgenda(lawId)?.name ?? lawId)
    }
    const { [lawId]: _, ...rest } = lawOwners
    lawOwners = rest
  }
  let systems = next.systems
  for (const [sysId, sys] of Object.entries(next.systems)) {
    let changed = false
    const planets = sys.planets.map(p => {
      if (p.attachments?.includes(lawId)) {
        changed = true
        // lrr-components.md, Holy Planet of Ixth 1: "If the Holy Planet of Ixth law is discarded, no player
        // loses a victory point" — the +1s already gained stay.
        return { ...p, attachments: p.attachments.filter(a => a !== lawId) }
      }
      return p
    })
    if (changed) {
      systems = { ...systems, [sysId]: { ...sys, planets } }
    }
  }
  let publicObjectives = next.publicObjectives
  if (lawId === 'classified_document_leaks') {
    publicObjectives = publicObjectives.filter(id => objectiveDef(id)?.stage !== 'secret')
  }
  const lawName = findAgenda(lawId)?.name ?? lawId
  return {
    ...next,
    activeAgendas,
    lawOwners,
    systems,
    publicObjectives,
    log: [...next.log, { t: 'info', text: `Law discarded from play: ${lawName}` }],
  }
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

/** Human-readable representation of an outcome (player name, planet name, or For/Against). */
export function formatOutcome(state: GameState, agendaId: string, outcome: string): string {
  if (outcome === 'For' || outcome === 'Against' || outcome === 'abstain') return outcome === 'abstain' ? 'Pass (no legal target)' : outcome
  const def = agendaId ? findAgenda(agendaId) : undefined
  if (def?.target === 'Elect Player' || (!def && /^\d+$/.test(outcome) && state.players[Number.parseInt(outcome, 10)])) {
    const seat = Number.parseInt(outcome, 10)
    if (Number.isInteger(seat) && state.players[seat]) {
      return state.players[seat].name
    }
  }
  if (def?.target === 'Elect Law') {
    const lawDef = findAgenda(outcome)
    if (lawDef) return lawDef.name
  }
  if (def?.target === 'Elect Scored Secret Objective') {
    const obj = objectiveDef(outcome)
    if (obj) return obj.name
  }
  if (def?.target.includes('Planet') || !def) {
    const planet = Object.values(state.systems).flatMap(s => s.planets).find(p => p.id === outcome)
    if (planet) {
      const ownerDesc = planet.owner !== null ? ` (${state.players[planet.owner].name})` : ''
      return `${planet.name}${ownerDesc}`
    }
  }
  return outcome
}

export interface WinningOutcomeResult {
  outcome: string
  tieBreak: boolean
}

/** The winning outcome: most votes, ties broken by the speaker's own vote (TI4 rule) — since the speaker
 * votes last in `voteOrder`, their outcome is simply preferred among the tied leaders. */
export function winningOutcome(state: GameState, agenda: AgendaRound): WinningOutcomeResult | null {
  const totals = tally(agenda)
  if (totals.size === 0) return null
  const best = Math.max(...totals.values())
  const leaders = [...totals.entries()].filter(([, v]) => v === best).map(([o]) => o)
  if (leaders.length === 1 && best > 0) return { outcome: leaders[0], tieBreak: false }
  const speakerVote = agenda.votes[state.speaker]?.outcome
  const chosen = speakerVote && leaders.includes(speakerVote) ? speakerVote : leaders[0]
  return { outcome: chosen, tieBreak: true }
}

type Resolver = (state: GameState, agenda: AgendaRound, outcome: string, seed?: number) => GameState

/** Grants an Elect-Player law card to the elected seat: records ownership and marks the law active. */
function grantLawTo(state: GameState, outcome: string, lawId: string): GameState {
  const seat = Number(outcome)
  if (Number.isNaN(seat) || !state.players[seat]) return state
  const activeAgendas = (state.activeAgendas ?? []).includes(lawId) ? state.activeAgendas : [...(state.activeAgendas ?? []), lawId]
  const cardName = findAgenda(lawId)?.name ?? lawId
  return {
    ...state,
    activeAgendas,
    lawOwners: { ...(state.lawOwners ?? {}), [lawId]: seat },
    log: [...state.log, { t: 'info', text: `${cardName}: granted to ${state.players[seat].name}` }],
  }
}

export const AGENDA_RESOLVERS: Readonly<Partial<Record<string, Resolver>>> = {
  senate_sanctuary: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    return planet ? attachLaw(state, 'senate_sanctuary', outcome, { influence: planet.influence + 2 }) : state
  },
  fleet_regulations: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      const limit = 4
      const players = state.players.map(p => ({
        ...p, tokens: { ...p.tokens, fleetPoolOverride: limit }
      })) as GameState['players']
      const activeAgendas = [...(state.activeAgendas ?? []).filter(a => a !== 'fleet_regulations'), 'fleet_regulations']
      // LRR 27.2 via lrr-components.md 2317: every fleet already on the board must fit the new pool before
      // any other effect resolves, so the cheapest excess ships are destroyed and their cargo trimmed.
      const next = trimToFleetPool({ ...state, players })
      return { ...next, activeAgendas, log: [...next.log, { t: 'info', text: 'Fleet Regulations: fleet pool capped at 4' }] }
    }
    // Against: each player places 1 command token from their reinforcements in their fleet pool
    const players = state.players.map(p => ({
      ...p, tokens: { ...p.tokens, fleet: p.tokens.fleet + 1, fleetPoolOverride: undefined }
    })) as GameState['players']
    return { ...state, players, log: [...state.log, { t: 'info', text: 'Fleet Regulations: each player places 1 command token in their fleet pool' }] }
  },
  executive_sanctions: (state, _agenda, outcome, seed) => {
    if (outcome === 'For') {
      let next: GameState = {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []).filter(a => a !== 'executive_sanctions'), 'executive_sanctions'],
        log: [...state.log, { t: 'info' as const, text: 'Executive Sanctions: players can have at most 3 action cards' }],
      }
      const maxHand = 3
      const players = next.players.map(p => {
        if (p.actionCards.length > maxHand) {
          const discarded = p.actionCards.slice(maxHand)
          next = { ...next, actionCardDiscard: [...next.actionCardDiscard, ...discarded] }
          return { ...p, actionCards: p.actionCards.slice(0, maxHand) }
        }
        return p
      }) as GameState['players']
      return { ...next, players }
    }
    // Against: Each player discards 1 random action card from their hand
    let next: GameState = state
    const rng = mulberry32(deriveSeed(seed ?? 42, 331))
    for (const seat of state.players.map((_, i) => i as Seat)) {
      const hand = next.players[seat].actionCards
      if (hand.length > 0) {
        const idx = Math.floor(rng() * hand.length)
        const discarded = hand[idx]
        const remaining = hand.filter((_, i) => i !== idx)
        next = {
          ...next,
          actionCardDiscard: [...next.actionCardDiscard, discarded],
          players: next.players.map((p, i) => i === seat ? { ...p, actionCards: remaining } : p) as GameState['players'],
          log: [...next.log, { t: 'info' as const, text: `Executive Sanctions: ${next.players[seat].name} discards 1 random action card` }],
        }
      }
    }
    return next
  },
  enforced_travel_ban: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'enforced_travel_ban'],
        log: [...state.log, { t: 'info', text: 'Enforced Travel Ban: wormhole adjacency disabled' }],
      }
    }
    // Against: destroy each PDS in or adjacent to a system that contains a wormhole
    // (alpha, beta or delta). Build the set of wormhole systems and their hex neighbours.
    const wormholeSystems = new Set<string>()
    for (const [sysId, sys] of Object.entries(state.systems)) {
      if (sys.wormhole) wormholeSystems.add(sysId)
    }
    const targetSystems = new Set(wormholeSystems)
    for (const sysId of wormholeSystems) {
      for (const n of neighbours(state.systems, sysId)) targetSystems.add(n)
    }
    let next = state
    let destroyed = 0
    for (const [sysId, sys] of Object.entries(state.systems)) {
      if (!targetSystems.has(sysId)) continue
      for (const planet of sys.planets) {
        const pds = planet.structures.filter(u => u.type === 'pds')
        if (pds.length > 0) {
          next = destroyUnits(next, sysId, pds)
          destroyed += pds.length
        }
      }
    }
    if (destroyed > 0) {
      next = { ...next, log: [...next.log, { t: 'info', text: `Enforced Travel Ban: destroyed ${destroyed} PDS in or adjacent to wormhole systems` }] }
    }
    return next
  },
  arms_reduction: (state, _agenda, outcome) => {
    let next = state
    for (const seat of state.players.map((_, i) => i as Seat)) {
      if (outcome === 'For') {
        // For: destroy all but 2 dreadnoughts and all but 4 cruisers. destroyUnits (LRR 17.6) returns the
        // ships to the reinforcements, and trimCargo destroys the fighters or infantry whose capacity
        // died with them — the same cleanup the end of a combat applies (R4.1 step 4). The resolver
        // returns `next` itself: a stale players snapshot here would silently discard those returns.
        for (const [sysId, sys] of Object.entries(next.systems)) {
          let ddsLeft = 2
          let cruisersLeft = 4
          const destroyed: Unit[] = []
          for (const u of sys.space) {
            if (u.owner !== seat) continue
            if (u.type === 'dreadnought') {
              if (ddsLeft > 0) { ddsLeft--; continue }
              destroyed.push(u)
              continue
            }
            if (u.type === 'cruiser') {
              if (cruisersLeft > 0) { cruisersLeft--; continue }
              destroyed.push(u)
            }
          }
          if (destroyed.length) next = trimCargo(destroyUnits(next, sysId, destroyed), sysId, seat)
        }
      } else {
        // Against: exhaust planets with tech specialties
        for (const [sysId, sys] of Object.entries(next.systems)) {
          const sysObj = { ...sys, planets: [...sys.planets] }
          sysObj.planets = sysObj.planets.map(p => p.techSkip ? { ...p, exhausted: true } : p)
          next = { ...next, systems: { ...next.systems, [sysId]: sysObj } }
        }
      }
    }
    return next
  },
  shard_of_the_throne: (state, _agenda, outcome) => {
    // Elect Player: the elected player gains this card and 1 victory point.
    const seat = Number(outcome)
    if (Number.isNaN(seat) || !state.players[seat]) return state
    let next = addVp(state, seat, 1, 'Shard of the Throne')
    next = { ...next, lawOwners: { ...(next.lawOwners ?? {}), shard_of_the_throne: seat } }
    return { ...next, activeAgendas: [...(next.activeAgendas ?? []), 'shard_of_the_throne'] }
  },
  the_crown_of_emphidia: (state, _agenda, outcome) => {
    // Elect Player: the elected player gains this card and 1 victory point.
    const seat = Number(outcome)
    if (Number.isNaN(seat) || !state.players[seat]) return state
    let next = addVp(state, seat, 1, 'The Crown of Emphidia')
    next = { ...next, lawOwners: { ...(next.lawOwners ?? {}), the_crown_of_emphidia: seat } }
    return { ...next, activeAgendas: [...(next.activeAgendas ?? []), 'the_crown_of_emphidia'] }
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
  colonial_redistribution: (state, _agenda, outcome) => {
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
    // Demilitarized Zone on the elected planet: the infantry may not be placed (the law outlives the
    // destruction it just caused), but control still passes.
    const dmz = isDemilitarizedZone(state, outcome)
    const players = [...next.players] as GameState['players']
    if (!dmz) players[fewest] = { ...players[fewest], reinforcements: { ...players[fewest].reinforcements, infantry: players[fewest].reinforcements.infantry - 1 } }
    const infantry = { id: next.nextUnitId, type: 'infantry' as const, owner: fewest, damaged: false }
    next = {
      ...withPlanet({ ...next, players, ...(dmz ? {} : { nextUnitId: next.nextUnitId + 1 }) }, outcome, p => ({ ...p, owner: fewest, ...(dmz ? {} : { ground: [...p.ground, infantry] }) })),
      log: [...next.log, dmz
        ? { t: 'info' as const, text: `Colonial Redistribution: ${planet.name} is a Demilitarized Zone — no infantry is placed` }
        : { t: 'info' as const, text: `Colonial Redistribution: ${next.players[fewest].name} (fewest VP) places 1 infantry on ${planet.name}` }],
    }
    // Holy Planet of Ixth on the elected planet: the control change swings 1 VP.
    return controller !== null ? holyPlanetControlSwing(next, outcome, fewest, controller) : next
  },
  // Elect-Player law cards granted to a seat. The elected seat becomes the card's owner, recorded in
  // `lawOwners` and the law is marked active in `activeAgendas`. `imperial_arbiter` and the ministries
  // grant no VP. `committee_formation`, `the_crown_of_thalnos`, and `prophecy_of_ixth` also grant no VP;
  // their effects (vote skipping, combat rerolls, +1 fighter rolls) are not yet wired and remain in
  // NOT_FIXED.md. All four law cards are now granted via `grantLawTo` and marked active.
  imperial_arbiter: (state, _agenda, outcome) => grantLawTo(state, outcome, 'imperial_arbiter'),
  minister_of_commerce: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_commerce'),
  minister_of_exploration: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_exploration'),
  minister_of_industry: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_industry'),
  minister_of_peace: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_peace'),
  minister_of_policy: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_policy'),
  minister_of_sciences: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_sciences'),
  minister_of_war: (state, _agenda, outcome) => grantLawTo(state, outcome, 'minister_of_war'),
  committee_formation: (state, _agenda, outcome) => grantLawTo(state, outcome, 'committee_formation'),
  the_crown_of_thalnos: (state, _agenda, outcome) => grantLawTo(state, outcome, 'the_crown_of_thalnos'),
  prophecy_of_ixth: (state, _agenda, outcome) => grantLawTo(state, outcome, 'prophecy_of_ixth'),
  // Homeland Defense Act — For: lift the two-PDS-per-planet cap (construction checks activeAgendas for
  // `homeland_defense_act`). Against: each player destroys 1 of their PDS (any one they control anywhere).
  homeland_defense_act: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'homeland_defense_act'],
        log: [...state.log, { t: 'info', text: 'Homeland Defense Act: the PDS cap is lifted' }],
      }
    }
    // Against: each player that controls at least one PDS destroys one of them (LRR 65: "each player
    // destroys 1 of their PDS units"). We remove the lowest-numbered (first-found) PDS for each seat.
    let next = state
    for (const seat of state.players.map((_, i) => i as Seat)) {
      let found: { sysId: string; unit: { id: number } } | undefined
      for (const [sysId, sys] of Object.entries(state.systems)) {
        for (const planet of sys.planets) {
          const pds = planet.structures.find(u => u.type === 'pds' && u.owner === seat)
          if (pds) { found = { sysId, unit: pds }; break }
        }
        if (found) break
      }
      if (found) {
        next = destroyUnits(next, found.sysId, [{ id: found.unit.id, type: 'pds' as const, owner: seat, damaged: false }])
        next = { ...next, log: [...next.log, { t: 'info', text: `Homeland Defense Act: seat ${seat} destroys a PDS` }] }
      }
    }
    return next
  },
  // New Constitution — (When revealed with no laws in play, discard this and reveal another.) For: discard
  // all laws from play. Against: no effect. Discarding clears every active law: the activeAgendas list, the
  // elected owners in lawOwners, and every law attachment on planets. The resource/influence value patches
  // baked into the planet (Senate Sanctuary +2 influence, Core Mining +2 resources) are not reverted here —
  // they are not stored reversibly, so they persist as a (noted) residue until the planet is freed.
  regulated_conscription: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'regulated_conscription'],
        log: [...state.log, { t: 'info', text: 'Regulated Conscription: fighters and infantry now cost 1 resource per unit' }],
      }
    }
    return state
  },
  // Publicize Weapon Schematics — For: if any player owns a war sun tech, all players may ignore prereqs
  // on war sun techs, and all war suns lose SUSTAIN DAMAGE. Against: each war-sun-tech owner discards
  // all their action cards. We define "owns a war sun technology" as having any tech with unit==='warsun'.
  publicize_weapon_schematics: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      const anyHasWarsunTech = state.players.some(p =>
        p.techs.some(tid => {
          const t = findTech(tid)
          return t?.unit === 'warsun'
        })
      )
      if (!anyHasWarsunTech) {
        // No one has a war sun tech, so the law has no effect
        return { ...state, log: [...state.log, { t: 'info', text: 'Publicize Weapon Schematics: no player owns a war sun technology' }] }
      }
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'publicize_weapon_schematics'],
        log: [...state.log, { t: 'info', text: 'Publicize Weapon Schematics: war sun prereqs ignored, all war suns lose SUSTAIN DAMAGE' }],
      }
    }
    // Against: each player that owns a war sun tech discards all their action cards
    let next = state
    for (const seat of state.players.map((_, i) => i as Seat)) {
      const hasWarsunTech = state.players[seat].techs.some(tid => {
        const t = findTech(tid)
        return t?.unit === 'warsun'
      })
      if (hasWarsunTech) {
        const discarded = next.players[seat].actionCards
        next = {
          ...next,
          actionCardDiscard: [...next.actionCardDiscard, ...discarded],
          players: [...next.players] as GameState['players'],
        }
        next.players[seat] = { ...next.players[seat], actionCards: [] }
        next = { ...next, log: [...next.log, { t: 'info', text: `Publicize Weapon Schematics: seat ${seat} discards ${discarded.length} action cards (owns war sun technology)` }] }
      }
    }
    return next
  },
  shared_research: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'shared_research'],
        log: [...state.log, { t: 'info', text: 'Shared Research: ships in nebulae can move' }],
      }
    }
    return state
  },
  wormhole_reconstruction: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'wormhole_reconstruction'],
        log: [...state.log, { t: 'info', text: 'Wormhole Reconstruction: Enforced Travel Ban has no effect' }],
      }
    }
    // Against: each player places a command token from their reinforcements in each system that
    // contains a wormhole and 1 or more of that player's ships. The token is placed as it would be
    // by activation (recorded in the system's activatedBy and removed from the player's tactic pool).
    let next = state
    const tokens = state.players.map(p => ({ ...p, tokens: { ...p.tokens } })) as GameState['players']
    for (const seat of state.players.map((_, i) => i as Seat)) {
      for (const [sysId, sys] of Object.entries(state.systems)) {
        if (!sys.wormhole) continue
        if (!sys.space.some(u => u.owner === seat && isShip(u.type))) continue
        if (sys.activatedBy.includes(seat)) continue   // already activated by this seat
        const systems = { ...next.systems, [sysId]: { ...sys, activatedBy: [...sys.activatedBy, seat] } }
        const player = { ...tokens[seat], tokens: { ...tokens[seat].tokens, tactic: Math.max(0, tokens[seat].tokens.tactic - 1) } }
        tokens[seat] = player
        next = { ...next, systems, log: [...next.log, { t: 'info', text: `Wormhole Reconstruction: seat ${seat} places a token in ${sysId}` }] }
      }
    }
    next = { ...next, players: tokens }
    return next
  },
  wormhole_research: (state, _agenda, outcome) => {
    if (outcome === 'Against') {
      // Each player that voted Against removes 1 command token from their command sheet and returns
      // it to their reinforcements. The token type is unspecified; we take a tactic token (the default
      // pool drawn from), flooring at 0.
      let next = state
      const players = state.players.map(p => ({ ...p, tokens: { ...p.tokens } })) as GameState['players']
      for (const seat of state.players.map((_, i) => i as Seat)) {
        const votes = state.agenda?.votes ?? {}
        const votedAgainst = votes[seat]?.outcome === 'Against'
        if (!votedAgainst) continue
        const tactic = Math.max(0, players[seat].tokens.tactic - 1)
        players[seat] = { ...players[seat], tokens: { ...players[seat].tokens, tactic } }
        next = { ...next, players, log: [...next.log, { t: 'info', text: `Wormhole Research: seat ${seat} returns a command token` }] }
      }
      return next
    }
    // For: each player with ships in a wormhole system may research 1 technology (interaction prompt —
    // recorded, not machine-drivable here), then destroy all ships in systems containing an alpha or
    // beta wormhole. Ships in delta/gamma-only systems survive.
    let next = state
    let destroyed = 0
    let log: GameState['log'] = state.log
    for (const [sysId, sys] of Object.entries(state.systems)) {
      const wh = sys.wormhole
      if (wh !== 'alpha' && wh !== 'beta') continue
      const ships = sys.space.filter(u => isShip(u.type))
      if (ships.length > 0) {
        next = destroyUnits(next, sysId, ships)
        destroyed += ships.length
      }
    }
    if (destroyed > 0) {
      log = [...log, { t: 'info', text: `Wormhole Research: destroyed ${destroyed} ships in alpha/beta wormhole systems` }]
    }
    log = [...log, { t: 'info', text: 'Wormhole Research: qualifying players may research 1 technology (prompt required)' }]
    return { ...next, log }
  },
  representative_government_base_game: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'representative_government_base_game'],
        log: [...state.log, { t: 'info', text: 'Representative Government: players cast only 1 vote per agenda' }],
      }
    }
    return state
  },
  new_constitution: (state, _agenda, outcome) => {
    if (outcome !== 'For') return state
    const withAgendas: GameState = { ...state, activeAgendas: [], lawOwners: {} }
    let next = withAgendas
    let stripped = 0
    for (const [, sys] of Object.entries(state.systems)) {
      for (const planet of sys.planets) {
        if (planet.attachments && planet.attachments.length > 0) {
          stripped += planet.attachments.length
          next = withPlanet(next, planet.id, p => ({ ...p, attachments: [] }))
        }
      }
    }
    return {
      ...next,
      log: [...state.log, { t: 'info', text: `New Constitution: all laws are discarded${stripped > 0 ? `, ${stripped} law attachments removed from planets` : ''}` }],
    }
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
    // The landing / production / placement ban is enforced by `isDemilitarizedZone` at every path that
    // lands, produces onto, or places a structure or ground force on the planet.
    const attached = attachLaw(destroyed, 'demilitarized_zone', outcome)
    return { ...attached, log: [...attached.log, { t: 'info', text: 'Demilitarized Zone: units cannot land on, be produced on, or be placed on this planet' }] }
  },
  holy_planet_of_ixth: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    let next = attachLaw(state, 'holy_planet_of_ixth', outcome)
    if (planet && planet.owner !== null) next = addVp(next, planet.owner, 1, 'Holy Planet of Ixth')
    // The control-change VP swings are enforced by `holyPlanetControlSwing` at every control change, and
    // the PRODUCTION ban by `productionLimit` skipping the planet's own dock.
    return { ...next, log: [...next.log, { t: 'info', text: 'Holy Planet of Ixth: its dock cannot produce; control of the planet swings 1 VP' }] }
  },
  ixthian_artifact: (state, _agenda, outcome, seed) => {
    if (outcome !== 'For') {
      return {
        ...state,
        log: [...state.log, { t: 'info', text: 'Ixthian Artifact: voted Against — no effect' }],
      }
    }

    // Roll 1d10
    const rng = mulberry32(deriveSeed(seed ?? 42, 8472))
    const roll = 1 + Math.floor(rng() * 10)

    let next: GameState = {
      ...state,
      log: [
        ...state.log,
        { t: 'info', text: `Ixthian Artifact: Speaker rolls a ${roll} on 1d10` },
      ],
    }

    if (roll >= 6) {
      // 6-10: each player may research 2 technologies in speaker order
      const n = next.players.length
      const speakerOrder: Seat[] = Array.from({ length: n }, (_, i) => ((next.speaker + i) % n) as Seat)
      const players = [...next.players] as GameState['players']

      for (const seat of speakerOrder) {
        let p = players[seat]
        const researched: string[] = []
        for (let step = 0; step < 2; step++) {
          const options = researchable(p)
          if (!options.length) break
          // Pick best tech: faction techs first, then unit upgrades, then most prereqs, then alphabetical
          const best = [...options].sort((a, b) => {
            const da = techDef(a)
            const db = techDef(b)
            const aFaction = da.faction !== undefined ? 1 : 0
            const bFaction = db.faction !== undefined ? 1 : 0
            if (aFaction !== bFaction) return bFaction - aFaction
            const aUpgrade = da.kind === 'upgrade' ? 1 : 0
            const bUpgrade = db.kind === 'upgrade' ? 1 : 0
            if (aUpgrade !== bUpgrade) return bUpgrade - aUpgrade
            const aPrereq = Object.values(da.prereq ?? {}).reduce((s, c) => s + c, 0)
            const bPrereq = Object.values(db.prereq ?? {}).reduce((s, c) => s + c, 0)
            if (aPrereq !== bPrereq) return bPrereq - aPrereq
            return a.localeCompare(b)
          })[0]
          p = { ...p, techs: [...p.techs, best] }
          researched.push(best)
        }
        players[seat] = p
        if (researched.length > 0) {
          const names = researched.map(id => techDef(id).name).join(', ')
          next = {
            ...next,
            players,
            log: [...next.log, { t: 'info', text: `Ixthian Artifact: seat ${seat} researches ${researched.length} technolog${researched.length === 1 ? 'y' : 'ies'}: ${names}` }],
          }
        }
      }
      return { ...next, players }
    }

    // 1-5: destroy all units in Mecatol Rex's system, and each player with units in systems adjacent
    // to Mecatol Rex's system destroys 3 of their own units in each of those systems.
    const mecatolEntry = Object.entries(next.systems).find(([id]) => id === 'mecatol' || id === 'mecatolrex' || id === MECATOL_ID)
    if (!mecatolEntry) return next
    const [mecatolId, mecatolSys] = mecatolEntry

    // 1. Destroy ALL units in Mecatol Rex's system (space + planets)
    const mecatolSpaceUnits = [...mecatolSys.space]
    const mecatolGroundUnits = mecatolSys.planets.flatMap(p => [...p.ground, ...p.structures])
    const allMecatolUnits = [...mecatolSpaceUnits, ...mecatolGroundUnits]

    const clearedMecatol = {
      ...mecatolSys,
      space: [],
      planets: mecatolSys.planets.map(p => ({ ...p, ground: [], structures: [] })),
    }
    next = {
      ...next,
      systems: { ...next.systems, [mecatolId]: clearedMecatol },
    }
    next = returnToReinforcements(next, allMecatolUnits)
    if (allMecatolUnits.length > 0) {
      next = {
        ...next,
        log: [...next.log, { t: 'info', text: `Ixthian Artifact: destroyed all ${allMecatolUnits.length} units in Mecatol Rex system` }],
      }
    }

    // 2. Destroy 3 units per player in systems adjacent to Mecatol Rex
    const adjacentSysIds = neighbours(next.systems, mecatolId, undefined, false, next)
    for (const sysId of adjacentSysIds) {
      for (const seat of next.players.map((_, i) => i as Seat)) {
        const sys = next.systems[sysId]
        if (!sys) continue
        const seatSpaceUnits = sys.space.filter(u => u.owner === seat)
        const seatPlanetUnits = sys.planets.flatMap(p => [...p.ground, ...p.structures].filter(u => u.owner === seat))
        const totalSeatUnits = [...seatSpaceUnits, ...seatPlanetUnits]
        if (totalSeatUnits.length === 0) continue

        let victims: typeof totalSeatUnits
        if (totalSeatUnits.length <= 3) {
          victims = totalSeatUnits
        } else {
          victims = [...totalSeatUnits].sort((a, b) => {
            const rankA = UNIT_DESTRUCTION_ORDER.indexOf(a.type)
            const rankB = UNIT_DESTRUCTION_ORDER.indexOf(b.type)
            return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB)
          }).slice(0, 3)
        }

        const victimIds = new Set(victims.map(u => u.id))
        const updatedSys = {
          ...next.systems[sysId],
          space: next.systems[sysId].space.filter(u => !victimIds.has(u.id)),
          planets: next.systems[sysId].planets.map(p => ({
            ...p,
            ground: p.ground.filter(u => !victimIds.has(u.id)),
            structures: p.structures.filter(u => !victimIds.has(u.id)),
          })),
        }
        next = {
          ...next,
          systems: { ...next.systems, [sysId]: updatedSys },
        }
        next = returnToReinforcements(next, victims)
        next = trimCargo(next, sysId, seat)
        next = {
          ...next,
          log: [...next.log, { t: 'info', text: `Ixthian Artifact: seat ${seat} destroys ${victims.length} units in ${sysId}` }],
        }
      }
    }
    return next
  },
  research_team_biotic: (state, _agenda, outcome) => attachLaw(state, 'research_team_biotic', outcome),
  research_team_cybernetic: (state, _agenda, outcome) => attachLaw(state, 'research_team_cybernetic', outcome),
  research_team_propulsion: (state, _agenda, outcome) => attachLaw(state, 'research_team_propulsion', outcome),
  research_team_warfare: (state, _agenda, outcome) => attachLaw(state, 'research_team_warfare', outcome),
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
  conventions_of_war: (state, agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'conventions_of_war'],
        log: [...state.log, { t: 'info', text: 'Conventions of War: bombardment against cultural planets is forbidden' }],
      }
    }
    // Against: Each player that voted "Against" discards all of their action cards
    let next = state
    const votes = agenda.votes
    for (const seat of state.players.map((_, i) => i as Seat)) {
      if (votes[seat]?.outcome === 'Against') {
        const discarded = next.players[seat].actionCards
        if (discarded.length > 0) {
          next = {
            ...next,
            actionCardDiscard: [...next.actionCardDiscard, ...discarded],
            players: next.players.map((p, i) => i === seat ? { ...p, actionCards: [] } : p) as GameState['players'],
            log: [...next.log, { t: 'info', text: `Conventions of War: ${next.players[seat].name} discards ${discarded.length} action cards` }],
          }
        }
      }
    }
    return next
  },
  terraforming_initiative: (state, _agenda, outcome) => {
    const planet = planetById(state, outcome)
    return planet ? attachLaw(state, 'terraforming_initiative', outcome, { resources: planet.resources + 1, influence: planet.influence + 1 }) : state
  },
  incentive_program: (state, _agenda, outcome) => {
    const isStage1 = outcome === 'For'
    const nextId = state.objectiveOrder.find(id => {
      const def = objectiveDef(id)
      return def && def.stage === (isStage1 ? 'stage1' : 'stage2') && !state.publicObjectives.includes(id)
    })
    if (!nextId) {
      return { ...state, log: [...state.log, { t: 'info', text: `Incentive Program: no remaining ${isStage1 ? 'Stage I' : 'Stage II'} public objectives to reveal` }] }
    }
    const def = objectiveDef(nextId)
    return {
      ...state,
      publicObjectives: [...state.publicObjectives, nextId],
      log: [...state.log, { t: 'info', text: `Incentive Program: revealed public objective ${def?.text ?? nextId}` }],
    }
  },
  anti_intellectual_revolution: (state, _agenda, outcome) => {
    if (outcome === 'For') {
      return {
        ...state,
        activeAgendas: [...(state.activeAgendas ?? []), 'anti_intellectual_revolution'],
        log: [...state.log, { t: 'info', text: 'Anti-Intellectual Revolution: researching tech requires destroying 1 non-fighter ship' }],
      }
    }
    return {
      ...state,
      activeAgendas: [...(state.activeAgendas ?? []), 'anti_intellectual_revolution_against'],
      log: [...state.log, { t: 'info', text: 'Anti-Intellectual Revolution: each player must exhaust 1 planet per technology at start of strategy phase' }],
    }
  },
  classified_document_leaks: (state, _agenda, outcome) => {
    if (outcome === 'abstain') return state
    const obj = objectiveDef(outcome)
    const objName = obj?.name ?? outcome
    const activeAgendas = (state.activeAgendas ?? []).includes('classified_document_leaks')
      ? state.activeAgendas
      : [...(state.activeAgendas ?? []), 'classified_document_leaks']
    const publicObjectives = state.publicObjectives.includes(outcome)
      ? state.publicObjectives
      : [...state.publicObjectives, outcome]
    return {
      ...state,
      activeAgendas,
      publicObjectives,
      log: [
        ...state.log,
        { t: 'info', text: `Classified Document Leaks: secret objective "${objName}" is now a public objective` },
      ],
    }
  },
  judicial_abolishment: (state, _agenda, outcome) => {
    if (outcome === 'abstain') return state
    return discardLaw(state, outcome)
  },
  miscount_disclosed: (state, _agenda, outcome) => {
    if (outcome === 'abstain') return state
    const lawDef = findAgenda(outcome)
    const lawName = lawDef?.name ?? outcome
    return {
      ...state,
      log: [...state.log, { t: 'info', text: `Miscount Disclosed: ${lawName} is elected for revote` }],
    }
  },
}

/** Public Execution keeps the elected player out of the vote for the rest of this agenda phase. */
const BARS_VOTING: Readonly<Record<string, true>> = { public_execution: true }

function applyOutcome(state: GameState, agenda: AgendaRound, outcome: string, seed?: number): GameState {
  const resolver = AGENDA_RESOLVERS[agenda.revealed]
  let resolved = resolver ? resolver(state, agenda, outcome, seed) : state
  const def = findAgenda(agenda.revealed)
  if (def?.kind === 'law' && outcome === 'Against' && resolved.activeAgendas?.includes(agenda.revealed)) {
    resolved = {
      ...resolved,
      activeAgendas: resolved.activeAgendas.filter(a => a !== agenda.revealed),
    }
  }
  const formatted = formatOutcome(state, agenda.revealed, outcome)
  const logEntries: LogEntry[] = [
    { t: 'info', text: `${agendaDef(agenda.revealed).name} resolves: ${formatted}` },
  ]
  if (!resolver) {
    logEntries.push({
      t: 'info',
      text: `the elected outcome of ${agendaDef(agenda.revealed).name} has no engine effect yet — recorded, not enforced`,
    })
  }
  return { ...resolved, log: [...resolved.log, ...logEntries] }
}

/** Reveals the round's first (or second) agenda and seeds a fresh vote. */
function revealAgenda(state: GameState, slot: 1 | 2, barredFromVoting: Seat[]): GameState {
  if (state.agendaDeck.length === 0) return state
  let currentDeck = state.agendaDeck
  let log = state.log

  // (When this agenda is revealed, if there are no valid targets, discard and reveal another from top of deck)
  while (currentDeck.length > 1) {
    const top = currentDeck[0]
    const noLaws = (top === 'miscount_disclosed' || top === 'new_constitution' || top === 'judicial_abolishment') && lawsInPlay(state).length === 0
    const noSecrets = top === 'classified_document_leaks' && scoredSecretObjectives(state).length === 0
    if (noLaws || noSecrets) {
      log = [...log, { t: 'info', text: `${agendaDef(top).name}: discarded because no valid targets in play, revealing next agenda` }]
      currentDeck = currentDeck.slice(1)
    } else {
      break
    }
  }

  const revealed = currentDeck[0]
  // Galactic Threat: the Nekro Virus cannot vote, so it never enters the order — filtering it out here,
  // rather than offering it zero outcomes, is what keeps the vote able to run to completion.
  const order = voteOrder(state).filter(s => !barredFromVoting.includes(s) && state.players[s].faction !== 'nekro')
  // Xxcha: Quash - discard the current agenda and reveal the next one
  const isQuash = state.players[state.active]?.faction === 'xxcha' && slot === 1 && currentDeck.length > 1
  const nextSlot = isQuash ? 2 : slot
  const actualRevealed = isQuash ? currentDeck[1] : revealed
  return {
    ...state,
    agendaDeck: isQuash ? currentDeck.slice(2) : currentDeck.slice(1),
    agenda: { revealed: actualRevealed, slot: nextSlot, votes: {}, order, barredFromVoting },
    active: order[0] ?? state.speaker,
    log: [...log, { t: 'info', text: `agenda revealed: ${agendaDef(actualRevealed).name}` }],
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
function resolveAgendaRound(state: GameState, seed: number, startNextRound: (s: GameState) => GameState): GameState {
  const agenda = state.agenda
  if (!agenda) return state
  const win = winningOutcome(state, agenda)
  const outcome = win?.outcome ?? null
  let next = state
  if (win && win.tieBreak && outcome !== null) {
    const speakerName = state.players[state.speaker]?.name ?? `seat ${state.speaker}`
    const formatted = formatOutcome(state, agenda.revealed, win.outcome)
    next = {
      ...next,
      log: [...next.log, { t: 'info', text: `Tied vote: Speaker ${speakerName} decided outcome in favor of ${formatted}` }],
    }
  }
  next = outcome === null ? next : applyOutcome(next, agenda, outcome, seed)
  const barred = BARS_VOTING[agenda.revealed] && outcome !== null ? [Number.parseInt(outcome, 10) as Seat] : []

  // Miscount Disclosed: revote on the elected law as if just revealed
  if (agenda.revealed === 'miscount_disclosed' && outcome !== null && outcome !== 'abstain') {
    const order = voteOrder(next).filter(s => !barred.includes(s) && next.players[s].faction !== 'nekro')
    return {
      ...next,
      agenda: { revealed: outcome, slot: agenda.slot, votes: {}, order, barredFromVoting: barred },
      active: order[0] ?? next.speaker,
      log: [...next.log, { t: 'info', text: `Miscount Disclosed: revoting on ${agendaDef(outcome).name} as if just revealed` }],
    }
  }

  next = { ...next, agenda: null }
  const winner = victoryCheck(next)
  if (winner !== null) {
    return { ...next, phase: 'ended', winner, log: [...next.log, { t: 'info', text: `${next.players[winner].name} wins with ${next.players[winner].vp} VP` }] }
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
  // R10 Representative Government For: each player may cast 1 vote on each agenda instead of exhausting planets
  if (state.activeAgendas?.includes('representative_government_base_game')) {
    if (agenda.votes[seat]) return { ok: false, error: 'R10: you have already cast a vote on this agenda' }
  }
  const paid = exhaustPlanets(state, seat, planets)
  if (!paid.ok) return paid
  const votes = { ...agenda.votes, [seat]: { outcome, influence: paid.value.influence } }
  const order = agenda.order.slice(1)
  const withVote: GameState = { ...paid.value.state, agenda: { ...agenda, votes, order }, active: order[0] ?? seat }
  if (order.length > 0) return { ok: true, value: withVote }
  return { ok: true, value: resolveAgendaRound(withVote, seed, startNextRound) }
}
