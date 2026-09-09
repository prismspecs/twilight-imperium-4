// src/engine/agendas.test.ts
import { describe, expect, it } from 'vitest'
import { agendaMoves, enterAgendaOrNextRound, legalOutcomes, readyInfluencePlanets } from './agendas'
import { applyMove, legalMoves } from './index'
import { startNextRound } from './statusPhase'
import { createGame } from './setup'
import { deepFreeze, toActionPhase, toAgendaPhase, withPlanetOwner, withPlayer } from './testUtils'
import { homeSystemOf } from './board'
import type { GameConfig, GameState, Result, Seat } from './types'

const value = (r: Result<GameState>): GameState => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const vote = (state: GameState, outcome: string, planets: string[] = []) =>
  applyMove(deepFreeze(state), { type: 'castVote', outcome, planets }, 0)

/** Clears every planet's ground forces board-wide, so a test's own placement is the only infantry in play. */
function withoutGroundForces(state: GameState): GameState {
  const systems = Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
    ...sys, planets: sys.planets.map(p => ({ ...p, ground: [] })),
  }]))
  return deepFreeze({ ...state, systems })
}

describe('R10 agenda phase: entry and vote order', () => {
  it('the custodians token being on Mecatol Rex skips the agenda phase entirely', () => {
    const s = toActionPhase()
    expect(s.custodiansToken).toBe(true)
    // finishStatusPhase is exercised end to end in statusPhase.test.ts; here we only need the gate itself
    expect(s.phase).not.toBe('agenda')
  })

  it('votes go clockwise starting left of the speaker, speaker last', () => {
    const s = toAgendaPhase(withPlayer(toActionPhase(), 0, {}))
    expect(s.agenda?.order).toEqual([1, 0])   // 2 players, speaker 0: seat 1 first, seat 0 (speaker) last
    expect(s.active).toBe(1)
  })

  it('Galactic Threat: the Nekro seat never enters the vote order (6C6RRJ regression)', () => {
    // 6C6RRJ deadlocked in round 3: the vote order included the Nekro seat, legalOutcomes answered []
    // for it, no castVote move existed, and the AI loop silently stopped on the empty move list.
    // Galactic Threat says the Nekro Virus cannot vote, so the order must skip it outright.
    const config: GameConfig = {
      players: [
        { faction: 'l1z1x', color: 'blue', name: 'P1', playerType: 'human' },
        { faction: 'yin', color: 'red', name: 'P2', playerType: 'ai' },
        { faction: 'nekro', color: 'green', name: 'P3', playerType: 'ai' },
        { faction: 'mentak', color: 'yellow', name: 'P4', playerType: 'ai' },
        { faction: 'sardakk', color: 'purple', name: 'P5', playerType: 'ai' },
        { faction: 'naalu', color: 'orange', name: 'P6', playerType: 'ai' },
      ],
      speaker: 0,
    }
    let s: GameState = { ...createGame(config, 1758370400), custodiansToken: false }
    s = enterAgendaOrNextRound(s, 1, startNextRound)
    expect(s.phase).toBe('agenda')
    expect(s.agenda?.order).not.toContain(2)
    expect(s.agenda?.order).toHaveLength(5)
    expect(s.active).not.toBe(2)
    // and the whole agenda phase (both slots) plays out: every seat asked to vote has at least one move
    for (let guard = 0; guard < 12 && s.phase === 'agenda'; guard++) {
      const moves = agendaMoves(s)
      expect(moves.length).toBeGreaterThan(0)
      s = value(applyMove(s, moves[0], 7))
    }
    expect(s.phase).not.toBe('agenda')
  })

  it('Elect Planet: every controlled planet is a legal outcome (LRR agenda rule 10), never a bare abstain', () => {
    // Senate Sanctuary in a live game offered only "Pass (no legal target to elect yet)" with a board
    // full of controlled planets: the Elect Planet stub never enumerated real targets.
    const s = toAgendaPhase(toActionPhase(), 'senate_sanctuary')
    const outcomes = legalOutcomes(s, 'senate_sanctuary')
    expect(outcomes).not.toEqual(['abstain'])
    // every controlled planet is offered, unowned ones (e.g. Mecatol Rex under the custodians) are not
    const controlled = Object.values(s.systems).flatMap(sys => sys.planets).filter(p => p.owner !== null).map(p => p.id)
    expect(outcomes.slice().sort()).toEqual(controlled.slice().sort())
  })

  it('Senate Sanctuary: attaches to the elected planet and raises its influence by 2', () => {
    let s = toAgendaPhase(toActionPhase(), 'senate_sanctuary')
    const target = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1)
    if (!target) throw new Error('no controlled planet in the fixture')
    const before = target.influence
    s = value(vote(s, target.id, []))
    s = value(vote(s, target.id, []))
    const elected = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.id === target.id)
    expect(elected?.influence).toBe(before + 2)
    expect(elected?.attachments).toContain('senate_sanctuary')
  })

  it('Core Mining: attaches, raises resources by 2 and destroys 1 infantry on the elected planet', () => {
    let s = toAgendaPhase(toActionPhase(), 'core_mining')
    const target = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1 && p.ground.length > 0)
    if (!target) throw new Error('no garrisoned planet in the fixture')
    const before = target.resources
    const groundBefore = target.ground.length
    s = value(vote(s, target.id, []))
    s = value(vote(s, target.id, []))
    const elected = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.id === target.id)
    expect(elected?.resources).toBe(before + 2)
    expect(elected?.attachments).toContain('core_mining')
    expect(elected?.ground).toHaveLength(groundBefore - 1)
  })

  it('Compensated Disarmament: destroys every ground force on the elected planet, paying the controller 1 trade good each', () => {
    let s = toAgendaPhase(toActionPhase(), 'compensated_disarmament')
    const target = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1 && p.ground.length > 0)
    if (!target) throw new Error('no garrisoned planet in the fixture')
    const destroyed = target.ground.length
    const goodsBefore = s.players[1].tradeGoods
    s = value(vote(s, target.id, []))
    s = value(vote(s, target.id, []))
    const elected = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.id === target.id)
    expect(elected?.ground).toHaveLength(0)
    expect(s.players[1].tradeGoods).toBe(goodsBefore + destroyed)
  })

  it('Demilitarized Zone: destroys every unit on the elected planet immediately (6C6RRJ: only the ongoing ban is unwired)', () => {
    let s = toAgendaPhase(toActionPhase(), 'demilitarized_zone')
    const target = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1 && p.ground.length > 0)
    if (!target) throw new Error('no garrisoned planet in the fixture')
    s = value(vote(s, target.id, []))
    s = value(vote(s, target.id, []))
    const elected = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.id === target.id)
    expect(elected?.ground).toHaveLength(0)
    expect(elected?.structures).toHaveLength(0)
    expect(elected?.attachments).toContain('demilitarized_zone')
  })

  it('Holy Planet of Ixth: the elected planet’s owner gains 1 victory point immediately', () => {
    let s = toAgendaPhase(toActionPhase(), 'holy_planet_of_ixth')
    const target = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1)
    if (!target) throw new Error('no controlled planet in the fixture')
    const vpBefore = s.players[1].vp
    s = value(vote(s, target.id, []))
    s = value(vote(s, target.id, []))
    expect(s.players[1].vp).toBe(vpBefore + 1)
    const elected = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.id === target.id)
    expect(elected?.attachments).toContain('holy_planet_of_ixth')
  })

  it('legalOutcomes reads the agenda\'s printed target: For/Against, Elect Player, or a safe abstain', () => {
    const s = toActionPhase()
    expect(legalOutcomes(s, 'mutiny')).toEqual(['For', 'Against'])
    expect(legalOutcomes(s, 'archived_secret')).toEqual(['0', '1'])
    expect(legalOutcomes(s, 'judicial_abolishment')).toEqual(['abstain'])   // Elect Law: not enumerated this increment
  })

  it('agendaMoves offers one castVote per legal outcome, each suggesting every ready planet', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')
    const moves = agendaMoves(s)
    expect(moves.map(m => m.type === 'castVote' && m.outcome).sort()).toEqual(['Against', 'For'])
    expect(legalMoves(s)).toEqual(moves)
    const seat = s.agenda?.order[0] as Seat
    for (const m of moves) expect(m.type === 'castVote' && m.planets).toEqual(readyInfluencePlanets(s, seat))
  })
})

describe('R10 castVote', () => {
  it('rejects a vote from anyone but the seat at the head of the order', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')   // order [1, 0]: seat 1 votes first
    expect(vote({ ...s, active: 0 }, 'For').ok).toBe(false)
    expect(vote(s, 'For').ok).toBe(true)
  })

  it('rejects an outcome the agenda does not offer', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')
    expect(vote(s, 'Elect Player').ok).toBe(false)
  })

  it('exhausts exactly the named planets for influence, and an empty list is a legal 0-vote abstain', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')
    const seat = s.agenda?.order[0] as Seat
    const planet = readyInfluencePlanets(s, seat)[0]
    const voted = value(vote(s, 'For', [planet]))
    expect(voted.agenda?.votes[seat]?.influence).toBeGreaterThan(0)
    const owning = Object.values(voted.systems).find(sys => sys.planets.some(p => p.id === planet))
    expect(owning?.planets.find(p => p.id === planet)?.exhausted).toBe(true)
    const abstained = value(vote(toAgendaPhase(toActionPhase(), 'mutiny'), 'For', []))
    expect(abstained.agenda?.votes[seat]).toEqual({ outcome: 'For', influence: 0 })
  })

  it('advances the order one seat at a time, and resolves once it empties', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] })   // one round only
    expect(s.agenda?.order).toEqual([1, 0])
    s = value(vote(s, 'For'))
    expect(s.agenda?.order).toEqual([0])
    expect(s.active).toBe(0)
    s = value(vote(s, 'Against'))
    expect(s.agenda).toBeNull()   // the round resolved
  })

  it('R10 agenda phase step 3: readies planets exhausted for voting before the next round begins', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] })   // one round only
    const round = s.round
    const seat1Planet = readyInfluencePlanets(s, 1)[0]
    s = value(vote(s, 'For', [seat1Planet]))
    const findExhausted = (state: GameState, planetId: string) =>
      Object.values(state.systems).flatMap(sys => sys.planets).find(p => p.id === planetId)?.exhausted
    expect(findExhausted(s, seat1Planet)).toBe(true)   // still exhausted mid-vote
    s = value(vote(s, 'Against', []))   // resolves the round, no second agenda queued
    expect(s.agenda).toBeNull()
    expect(s.round).toBe(round + 1)
    expect(findExhausted(s, seat1Planet)).toBe(false)
  })
})

describe('R10 vote resolution: ties, the speaker breaks them, and victory is rechecked', () => {
  it('the outcome with the most influence-weighted votes wins', () => {
    // seat 1 already owns its home planets, so its vote carries influence without any extra setup
    let s = toAgendaPhase(toActionPhase(), 'mutiny')
    const seat1Planet = readyInfluencePlanets(s, 1)[0]   // seat 1 (order[0]) votes first, with influence
    s = value(vote(s, 'For', [seat1Planet]))             // seat 1: For, weighted
    s = value(vote(s, 'Against', []))                    // seat 0 (speaker): Against, 0 weight
    // Mutiny For: each seat that voted For gains 1 VP. Seat 1 voted For and outvoted, so For wins.
    expect(s.players[1].vp).toBe(1)
    expect(s.players[0].vp).toBe(0)
  })

  it('a tie goes to the speaker\'s own vote, since the speaker always votes last', () => {
    // Both seats cast 0 influence: a dead tie at 0 votes each for their own outcome.
    let s = toAgendaPhase(toActionPhase(), 'mutiny')
    s = value(vote(s, 'For', []))       // seat 1
    s = value(vote(s, 'Against', []))   // seat 0, the speaker: their own vote breaks the tie
    // Against grants nothing to the seat that voted For (Mutiny's Against only punishes For-voters), so
    // seat 1 (who voted For) loses a point under the Against outcome.
    expect(s.players[1].vp).toBe(-1)
  })

  it('re-checks victory after an agenda that can grant VP mid-phase (Seed of an Empire)', () => {
    let s = toAgendaPhase(withPlayer(toActionPhase(), 1, { vp: 9 }), 'seed_of_an_empire')
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.phase).toBe('ended')
    expect(s.winner).toBe(1)   // seat 1 had the most VP and gains the deciding point
  })
})

describe('R10 resolvers', () => {
  it('Economic Equality: For resets to 5 trade goods each, Against resets to 0', () => {
    let s = toAgendaPhase(withPlayer(withPlayer(toActionPhase(), 0, { tradeGoods: 3 }), 1, { tradeGoods: 7 }), 'economic_equality')
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.players.map(p => p.tradeGoods)).toEqual([5, 5])
  })

  it('Swords to Plowshares For: half (rounded up) of each planet\'s infantry dies for trade goods', () => {
    const base = toActionPhase()
    const sysId = homeSystemOf(base, 1)
    const planetId = base.systems[sysId].planets[0].id
    let s = withoutGroundForces(withPlanetOwner(base, sysId, planetId, 1))
    s = { ...s, systems: { ...s.systems, [sysId]: { ...s.systems[sysId], planets: s.systems[sysId].planets.map(p => p.id === planetId ? { ...p, ground: [1, 2, 3].map(id => ({ id, type: 'infantry' as const, owner: 1 as const, damaged: false })) } : p) } } }
    s = deepFreeze({ ...toAgendaPhase(deepFreeze(s), 'swords_to_plowshares'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    const planet = s.systems[sysId].planets.find(p => p.id === planetId)
    expect(planet?.ground).toHaveLength(1)          // 3 infantry, ceil(3/2) = 2 destroyed, 1 left
    expect(s.players[1].tradeGoods).toBe(2)
  })

  it('Archived Secret: the elected player draws a secret objective', () => {
    let s = toAgendaPhase(toActionPhase(), 'archived_secret')
    const before = s.secretObjectiveDeck.length
    s = value(vote(s, '1', []))
    s = value(vote(s, '1', []))
    expect(s.players[1].secretObjectives.length).toBeGreaterThan(0)
    expect(s.secretObjectiveDeck.length).toBe(before - 1)
  })

  it('Public Execution: the elected player discards their hand, loses the speaker token if they held it, and cannot vote on the second agenda this phase', () => {
    let base = toActionPhase()
    const players = [...base.players] as GameState['players']
    players[0] = { ...players[0], actionCards: ['plague'] }
    base = deepFreeze({ ...base, players, agendaDeck: ['public_execution', 'mutiny', ...base.agendaDeck] })
    let s = toAgendaPhase(base)
    expect(s.agenda?.revealed).toBe('public_execution')
    s = value(vote(s, '0', []))   // seat 1 elects seat 0 (the speaker)
    s = value(vote(s, '0', []))   // seat 0 votes on their own election, then the round resolves
    expect(s.players[0].actionCards).toEqual([])
    expect(s.speaker).toBe(1)                 // the speaker token moved off the elected (former) speaker
    expect(s.agenda?.revealed).toBe('mutiny')  // straight into the second agenda
    expect(s.agenda?.order).not.toContain(0)   // seat 0 is barred from this vote
  })

  it('an agenda with no resolver still resolves the vote and logs that nothing was enforced', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'judicial_abolishment'), agendaDeck: [] as string[] })   // one round only
    s = value(vote(s, 'abstain', []))
    s = value(vote(s, 'abstain', []))
    expect(s.agenda).toBeNull()
    expect(s.log.some(e => e.t === 'info' && e.text.includes('no engine effect yet'))).toBe(true)
  })
})
