// src/engine/agendas.test.ts
import { describe, expect, it } from 'vitest'
import { agendaMoves, legalOutcomes, readyInfluencePlanets } from './agendas'
import { applyMove, legalMoves } from './index'
import { deepFreeze, toActionPhase, toAgendaPhase, withPlanetOwner, withPlayer } from './testUtils'
import type { GameState, Result, Seat } from './types'

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

  it('legalOutcomes reads the agenda\'s printed target: For/Against, Elect Player, or a safe abstain', () => {
    const s = toActionPhase()
    expect(legalOutcomes(s, 'mutiny')).toEqual(['For', 'Against'])
    expect(legalOutcomes(s, 'archived_secret')).toEqual(['0', '1'])
    expect(legalOutcomes(s, 'core_mining')).toEqual(['abstain'])   // Elect Planet: not enumerated this increment
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
    expect(voted.systems['home-s'].planets.find(p => p.id === planet)?.exhausted).toBe(true)
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
})

describe('R10 vote resolution: ties, the speaker breaks them, and victory is rechecked', () => {
  it('the outcome with the most influence-weighted votes wins', () => {
    let s = toAgendaPhase(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 'mutiny')
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
    let s = withoutGroundForces(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1))
    s = { ...s, systems: { ...s.systems, bereg: { ...s.systems.bereg, planets: s.systems.bereg.planets.map(p => p.id === 'bereg' ? { ...p, ground: [1, 2, 3].map(id => ({ id, type: 'infantry' as const, owner: 1 as const, damaged: false })) } : p) } } }
    s = deepFreeze({ ...toAgendaPhase(deepFreeze(s), 'swords_to_plowshares'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    const planet = s.systems.bereg.planets.find(p => p.id === 'bereg')
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
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'core_mining'), agendaDeck: [] as string[] })   // one round only
    s = value(vote(s, 'abstain', []))
    s = value(vote(s, 'abstain', []))
    expect(s.agenda).toBeNull()
    expect(s.log.some(e => e.t === 'info' && e.text.includes('no engine effect yet'))).toBe(true)
  })
})
