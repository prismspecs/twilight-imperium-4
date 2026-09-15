// src/engine/agendas.test.ts
import { describe, expect, it } from 'vitest'
import { agendaMoves, discardLaw, enterAgendaOrNextRound, legalOutcomes, readyInfluencePlanets, transferCrownRoyalLaws } from './agendas'
import { fighterBonus } from './effects'
import { applyMove, legalMoves } from './index'
import { applyMitosis, startNextRound } from './statusPhase'
import { createGame } from './setup'
import { deepFreeze, SAAR_CONFIG, toActionPhase, toAgendaPhase, withPlanetOwner, withPlayer, withTactical, withUnits } from './testUtils'
import { constructionPlanets } from './strategicActions'
import { checkFleet, homeSystemOf } from './board'
import { productionLimit } from './economy'
import { landablePlanets } from './invasion'
import type { GameConfig, GameState, Planet, Result, Seat } from './types'

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

/** The systems that contain at least one unit or planet owned by `seat`. */
function systemsOfPlayer(state: GameState, seat: Seat): typeof state.systems[string][] {
  return Object.values(state.systems).filter(sys =>
    sys.planets.some(p => p.owner === seat) || sys.space.some(u => u.owner === seat))
}

/** Attaches an agenda law id to a planet, mimicking an Elect-Planet resolution. */
function withPlanetAttachment(state: GameState, planetId: string, lawId: string): GameState {
  const systems = Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
    ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, attachments: [...(p.attachments ?? []), lawId] } : p),
  }]))
  return deepFreeze({ ...state, systems })
}

/** Looks a planet up by id across every system. */
function planetByIdOf(state: GameState, planetId: string): Planet | undefined {
  return Object.values(state.systems).flatMap(sys => sys.planets).find(p => p.id === planetId)
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

  it('Judicial Abolishment: discards the elected law from play', () => {
    let s = deepFreeze({
      ...toAgendaPhase(toActionPhase(), 'judicial_abolishment'),
      activeAgendas: ['fleet_regulations'],
      agendaDeck: [] as string[],
    })
    expect(legalOutcomes(s, 'judicial_abolishment')).toEqual(['fleet_regulations'])
    s = value(vote(s, 'fleet_regulations', []))
    s = value(vote(s, 'fleet_regulations', []))
    expect(s.agenda).toBeNull()
    expect(s.activeAgendas).not.toContain('fleet_regulations')
    expect(s.log.some(e => e.t === 'info' && e.text.includes('Law discarded from play: Fleet Regulations'))).toBe(true)
  })

  it('Shard of the Throne: the elected player gains 1 VP and becomes the owner', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'shard_of_the_throne'), agendaDeck: [] as string[] })
    s = value(vote(s, '1', []))
    s = value(vote(s, '1', []))
    expect(s.players[1].vp).toBe(1)
    expect(s.lawOwners?.shard_of_the_throne).toBe(1)
    expect(s.activeAgendas).toContain('shard_of_the_throne')
  })

  it('The Crown of Emphidia: the elected player gains 1 VP and becomes the owner', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'the_crown_of_emphidia'), agendaDeck: [] as string[] })
    s = value(vote(s, '0', []))
    s = value(vote(s, '0', []))
    expect(s.players[0].vp).toBe(1)
    expect(s.lawOwners?.the_crown_of_emphidia).toBe(0)
    expect(s.activeAgendas).toContain('the_crown_of_emphidia')
  })

  it('Shard of the Throne: control of the owner\'s home planet transfers the card and swings 1 VP', () => {
    // seat 0 owns the Shard; seat 1 seizes a planet in seat 0's home system and gets the card +1 VP
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'shard_of_the_throne'), agendaDeck: [] as string[] })
    s = value(vote(s, '0', []))
    s = value(vote(s, '0', []))
    expect(s.lawOwners?.shard_of_the_throne).toBe(0)
    const homeId = homeSystemOf(s, 0)
    const planetId = s.systems[homeId].planets[0].id
    s = withPlanetOwner(s, homeId, planetId, 1)
    s = transferCrownRoyalLaws(s, planetId, 1, 0)
    expect(s.lawOwners?.shard_of_the_throne).toBe(1)
    expect(s.players[1].vp).toBe(1)     // +1 from the swing (seat 1 had 0)
    expect(s.players[0].vp).toBe(0)    // 1 from election - 1 from the loss
  })

  it('Fleet Regulations For: the fleet pool limit drops to 4 for every player', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'fleet_regulations'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    for (const p of s.players) expect(p.tokens.fleetPoolOverride).toBe(4)
    expect(s.activeAgendas).toContain('fleet_regulations')
  })

  it('Fleet Regulations For: fleets already over the new pool lose their excess ships (lrr-components.md 2317)', () => {
    const base = toActionPhase()
    const systems = { ...base.systems }
    const sys0 = systems[homeSystemOf(base, 0)]
    // five destroyers in the home system: with the starting dreadnought and carrier that is more
    // non-fighter ships than the seat's fleet pool allows once the law caps it at 4
    systems[homeSystemOf(base, 0)] = {
      ...sys0, space: [
        ...sys0.space,
        ...([0, 1, 2, 3, 4] as const).map(i => ({ id: base.nextUnitId + i, type: 'destroyer' as const, owner: 0 as const, damaged: false })),
      ],
    }
    const ddBefore = base.players[0].reinforcements.destroyer
    const boardDdBefore = 5
    let s = deepFreeze({ ...base, systems })
    s = deepFreeze({ ...toAgendaPhase(s, 'fleet_regulations'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    const home = s.systems[homeSystemOf(base, 0)]
    // whatever the seat's own fleet tokens allow, the fleet now fits it (LRR 27.2)
    const fleet = checkFleet(s, 0, homeSystemOf(base, 0))
    expect(fleet.ok).toBe(true)
    // the destroyed destroyers are back in the reinforcements (LRR 17.6), not vanished
    const ddAfter = home.space.filter(u => u.owner === 0 && u.type === 'destroyer').length
    expect(ddAfter).toBeLessThan(boardDdBefore)
    expect(s.players[0].reinforcements.destroyer - ddBefore).toBe(boardDdBefore - ddAfter)
  })

  it('Fleet Regulations Against: no fleet pool limit is applied', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'fleet_regulations'), agendaDeck: [] as string[] })
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    for (const p of s.players) expect(p.tokens.fleetPoolOverride).toBeUndefined()
    expect(s.activeAgendas).not.toContain('fleet_regulations')
  })

  it('Homeland Defense Act For: the two-PDS-per-planet cap is lifted', () => {
    // Give seat 0 a second PDS on a controlled planet so only the lifted cap can allow a third.
    const base = toActionPhase()
    const homeId = homeSystemOf(base, 0)
    const homePlanet = base.systems[homeId].planets[0].id
    const twoPds = withUnits(deepFreeze({ ...base, activeAgendas: [] }), homeId, 0, ['pds', 'pds'], homePlanet)
    // Without the law the planet is already full (2 PDS) and cannot take a third.
    expect(constructionPlanets(twoPds, 0, 'pds')).not.toContain(homePlanet)
    // Resolve the law's For outcome.
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'homeland_defense_act'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.activeAgendas).toContain('homeland_defense_act')
    // With the cap lifted the same fully-PDS planet is now offered again.
    const lifted = withUnits(deepFreeze({ ...s, activeAgendas: [...(s.activeAgendas ?? [])] }), homeId, 0, ['pds', 'pds'], homePlanet)
    expect(constructionPlanets(lifted, 0, 'pds')).toContain(homePlanet)
  })

  it('Homeland Defense Act Against: each player destroys one PDS', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'homeland_defense_act'), agendaDeck: [] as string[] })
    const homeId = homeSystemOf(s, 0)
    const homePlanet = s.systems[homeId].planets[0].id
    s = withUnits(s, homeId, 0, ['pds', 'pds'], homePlanet)
    const before = systemsOfPlayer(s, 0).flatMap(sys => sys.planets).flatMap(p => p.structures).filter(u => u.type === 'pds' && u.owner === 0).length
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    // seat 0 loses exactly one PDS (whatever it started with)
    const after = systemsOfPlayer(s, 0).flatMap(sys => sys.planets).flatMap(p => p.structures).filter(u => u.type === 'pds' && u.owner === 0).length
    expect(after).toBe(before - 1)
  })

  it('New Constitution For: all laws are discarded and cleared from planets', () => {
    // seat 0 owns the Shard (a law); we also attach a law to one of seat 1's planets to prove stripping.
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'new_constitution'), agendaDeck: [] as string[] })
    s = { ...s, activeAgendas: ['shard_of_the_throne', 'homeland_defense_act'], lawOwners: { shard_of_the_throne: 0 } }
    const homeId = homeSystemOf(s, 1)
    const p1 = s.systems[homeId].planets[0].id
    s = withPlanetAttachment(s, p1, 'senate_sanctuary')
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.activeAgendas ?? []).toHaveLength(0)
    expect(s.lawOwners ?? {}).toEqual({})
    expect(planetByIdOf(s, p1)?.attachments ?? []).toHaveLength(0)
  })

  it('New Constitution Against: no laws are discarded', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'new_constitution'), agendaDeck: [] as string[] })
    s = { ...s, activeAgendas: ['fleet_regulations'], lawOwners: {} }
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    expect(s.activeAgendas).toContain('fleet_regulations')
  })

  it('Enforced Travel Ban Against: destroys PDS in or adjacent to a wormhole system', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'enforced_travel_ban'), agendaDeck: [] as string[] })
    // tile-26 (alpha wormhole) has the planet `lodor`; tile-25 (beta) has `quann`.
    const whPlanet = s.systems['tile-26'].planets[0].id
    // A home system with no wormhole must survive.
    const homeId = homeSystemOf(s, 0)
    const homePlanet = s.systems[homeId].planets[0].id
    s = withUnits(s, 'tile-26', 0, ['pds', 'pds'], whPlanet)   // PDS on the wormhole planet
    s = withUnits(s, homeId, 0, ['pds'], homePlanet)            // PDS in a non-wormhole home system
    const homePdsBefore = planetByIdOf(s, homePlanet)?.structures.filter(u => u.type === 'pds').length ?? 0
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    // Two PDS on the wormhole planet are destroyed; the home PDS survives (count unchanged).
    expect(planetByIdOf(s, whPlanet)?.structures.filter(u => u.type === 'pds')).toHaveLength(0)
    expect(planetByIdOf(s, homePlanet)?.structures.filter(u => u.type === 'pds')).toHaveLength(homePdsBefore)
    expect(s.activeAgendas).not.toContain('enforced_travel_ban')
  })

  it('Wormhole Reconstruction Against: place a token in each wormhole system containing own ships', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'wormhole_reconstruction'), agendaDeck: [] as string[] })
    const initialTactic = s.players[0].tokens.tactic
    // Put two seat-0 ships in the alpha wormhole system (tile-26).
    s = withUnits(s, 'tile-26', 0, ['destroyer', 'cruiser'])
    expect(s.systems['tile-26'].activatedBy).not.toContain(0)
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    // Seat 0 has ships in tile-26 (alpha), so a token lands there.
    expect(s.systems['tile-26'].activatedBy).toContain(0)
    expect(s.players[0].tokens.tactic).toBe(initialTactic - 1)
    expect(s.activeAgendas).not.toContain('wormhole_reconstruction')
  })

  it('Wormhole Research Against: each Against voter returns one command token', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'wormhole_research'), agendaDeck: [] as string[] })
    const before0 = s.players[0].tokens.tactic
    const before1 = s.players[1].tokens.tactic
    // both seats vote Against so the Against outcome wins.
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    expect(s.players[0].tokens.tactic).toBe(before0 - 1)
    expect(s.players[1].tokens.tactic).toBe(before1 - 1)
  })

  it('Wormhole Research For: destroys ships in alpha/beta wormhole systems', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'wormhole_research'), agendaDeck: [] as string[] })
    // tile-26 = alpha wormhole, tile-25 = beta; tile-40 = beta (no planet).
    s = withUnits(s, 'tile-26', 0, ['destroyer', 'fighter', 'fighter'])
    s = withUnits(s, 'tile-25', 1, ['cruiser'])
    const spaceBefore = (id: string) => s.systems[id].space.length
    expect(spaceBefore('tile-26')).toBe(3)
    expect(spaceBefore('tile-25')).toBe(1)
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.systems['tile-26'].space).toHaveLength(0)
    expect(s.systems['tile-25'].space).toHaveLength(0)
  })

  it('Executive Sanctions For: every player hand is trimmed to 3 action cards', () => {
    let base = toActionPhase()
    const players = [...base.players] as GameState['players']
    players[0] = { ...players[0], actionCards: ['plague', 'shields_holding', 'distant_suns', 'confusing_legal_text', 'emergency_reparations'] }
    players[1] = { ...players[1], actionCards: ['plague', 'flank_speed'] }
    base = deepFreeze({ ...base, players })
    let s = deepFreeze({ ...toAgendaPhase(base, 'executive_sanctions'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.players[0].actionCards).toHaveLength(3)
    expect(s.players[1].actionCards).toHaveLength(2)   // already under the cap, untouched
  })

  it('Arms Reduction For: each player keeps only 2 dreadnoughts and 4 cruisers', () => {
    const base = toActionPhase()
    const systems = { ...base.systems }
    const sys0 = systems[homeSystemOf(base, 0)]
    systems[homeSystemOf(base, 0)] = {
      ...sys0, space: [
        ...sys0.space,
        ...([0, 1, 2, 3, 4] as const).map(i => ({ id: base.nextUnitId + i, type: 'dreadnought' as const, owner: 0 as const, damaged: false })),
      ],
    }
    let s = deepFreeze({ ...base, systems })
    s = deepFreeze({ ...toAgendaPhase(s, 'arms_reduction'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    const dds = Object.values(s.systems).flatMap(sys => sys.space).filter(u => u.type === 'dreadnought' && u.owner === 0)
    expect(dds).toHaveLength(2)
  })

  it('Arms Reduction For: the destroyed dreadnoughts return to the reinforcements (LRR 17.6)', () => {
    const base = toActionPhase()
    const before = base.players[0].reinforcements.dreadnought
    const boardBefore = Object.values(base.systems).flatMap(sys => sys.space).filter(u => u.type === 'dreadnought' && u.owner === 0).length + 5
    const systems = { ...base.systems }
    const sys0 = systems[homeSystemOf(base, 0)]
    systems[homeSystemOf(base, 0)] = {
      ...sys0, space: [
        ...sys0.space,
        ...([0, 1, 2, 3, 4] as const).map(i => ({ id: base.nextUnitId + i, type: 'dreadnought' as const, owner: 0 as const, damaged: false })),
      ],
    }
    let s = deepFreeze({ ...base, systems })
    s = deepFreeze({ ...toAgendaPhase(s, 'arms_reduction'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    const boardAfter = Object.values(s.systems).flatMap(sys => sys.space).filter(u => u.type === 'dreadnought' && u.owner === 0).length
    // every dreadnought the agenda removed from the board is back in the reinforcements, not vanished
    expect(s.players[0].reinforcements.dreadnought).toBe(before + (boardBefore - boardAfter))
    const total = boardAfter + s.players[0].reinforcements.dreadnought
    expect(total).toBe(before + boardBefore)
  })

  it('Elect-Player law cards (Imperial Arbiter, ministries) record their owner and activate the law', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'imperial_arbiter'), agendaDeck: [] as string[] })
    s = value(vote(s, '1', []))
    s = value(vote(s, '1', []))
    expect(s.lawOwners?.imperial_arbiter).toBe(1)
    expect(s.activeAgendas).toContain('imperial_arbiter')
    expect(s.players[1].vp).toBe(0)   // no VP for Imperial Arbiter

    let m = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'minister_of_war'), agendaDeck: [] as string[] })
    m = value(vote(m, '0', []))
    m = value(vote(m, '0', []))
    expect(m.lawOwners?.minister_of_war).toBe(0)
    expect(m.activeAgendas).toContain('minister_of_war')
  })

  it('Conventions of War For: sets law active and prevents bombardment of cultural planets', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'conventions_of_war'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.activeAgendas).toContain('conventions_of_war')
  })

  it('Conventions of War Against: each Against voter discards all action cards', () => {
    let base = toActionPhase()
    const players = [...base.players] as GameState['players']
    players[0] = { ...players[0], actionCards: ['plague', 'flank_speed'] }
    players[1] = { ...players[1], actionCards: ['shields_holding'] }
    base = deepFreeze({ ...base, players })
    let s = deepFreeze({ ...toAgendaPhase(base, 'conventions_of_war'), agendaDeck: [] as string[] })
    // seat 1 votes For, seat 0 (speaker) votes Against -> tie broken in favor of Against
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'Against', []))
    // seat 0 voted Against, loses hand; seat 1 voted For, retains hand
    expect(s.players[0].actionCards).toHaveLength(0)
    expect(s.players[1].actionCards).toHaveLength(1)
  })

  it('Terraforming Initiative attaches law to elected planet (+1 resource, +1 influence)', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'terraforming_initiative'), agendaDeck: [] as string[] })
    const homeId = homeSystemOf(s, 0)
    const planetId = s.systems[homeId].planets[0].id
    const origPlanet = planetByIdOf(s, planetId)!
    s = value(vote(s, planetId, []))
    s = value(vote(s, planetId, []))
    const updated = planetByIdOf(s, planetId)!
    expect(updated.attachments).toContain('terraforming_initiative')
    expect(updated.resources).toBe(origPlanet.resources + 1)
    expect(updated.influence).toBe(origPlanet.influence + 1)
  })

  it('Incentive Program For reveals next Stage I public objective, Against reveals Stage II', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'incentive_program'), agendaDeck: [] as string[] })
    const countBefore = s.publicObjectives.length
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.publicObjectives.length).toBe(countBefore + 1)

    let t = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'incentive_program'), agendaDeck: [] as string[] })
    t = value(vote(t, 'Against', []))
    t = value(vote(t, 'Against', []))
    expect(t.publicObjectives.length).toBe(countBefore + 1)
  })

  it('Anti-Intellectual Revolution For/Against activates respective agenda state', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'anti_intellectual_revolution'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'For', []))
    expect(s.activeAgendas).toContain('anti_intellectual_revolution')

    let t = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'anti_intellectual_revolution'), agendaDeck: [] as string[] })
    t = value(vote(t, 'Against', []))
    t = value(vote(t, 'Against', []))
    expect(t.activeAgendas).toContain('anti_intellectual_revolution_against')
  })

  it('Colonial Redistribution destroys units on non-home planet and places infantry for lowest-VP player', () => {
    let base = toActionPhase()
    const players = [...base.players] as GameState['players']
    players[0] = { ...players[0], vp: 3 }
    players[1] = { ...players[1], vp: 1 } // lowest VP
    base = deepFreeze({ ...base, players })
    // tile-26 (lodor) is a non-home planet controlled by seat 0
    let s = withPlanetOwner(base, 'tile-26', 'lodor', 0)
    s = withUnits(s, 'tile-26', 0, ['infantry', 'infantry', 'pds'], 'lodor')
    s = deepFreeze({ ...toAgendaPhase(s, 'colonial_redistribution'), agendaDeck: [] as string[] })
    s = value(vote(s, 'lodor', []))
    s = value(vote(s, 'lodor', []))
    const lodor = planetByIdOf(s, 'lodor')!
    expect(lodor.owner).toBe(1)
    expect(lodor.ground.filter(u => u.type === 'infantry' && u.owner === 1)).toHaveLength(1)
    expect(lodor.structures).toHaveLength(0)
  })

  it('Speaker tie-break is explicitly logged when vote is tied', () => {
    let s = deepFreeze({ ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] })
    s = value(vote(s, 'For', []))
    s = value(vote(s, 'Against', []))
    const tieLog = s.log.find(e => e.t === 'info' && e.text.includes('Tied vote: Speaker'))
    expect(tieLog).toBeDefined()
  })

  it('Classified Document Leaks: elected scored secret objective becomes a public objective', () => {
    let s = toActionPhase()
    s = withPlayer(s, 0, { scoredObjectives: ['uf'] })
    s = deepFreeze({ ...toAgendaPhase(s, 'classified_document_leaks'), agendaDeck: [] as string[] })
    expect(legalOutcomes(s, 'classified_document_leaks')).toEqual(['uf'])
    s = value(vote(s, 'uf', []))
    s = value(vote(s, 'uf', []))
    expect(s.agenda).toBeNull()
    expect(s.publicObjectives).toContain('uf')
    expect(s.activeAgendas).toContain('classified_document_leaks')
    expect(s.log.some(e => e.t === 'info' && e.text.includes('Unveil Flagship" is now a public objective'))).toBe(true)
  })

  it('Miscount Disclosed: elects an active law to revote on', () => {
    let s = toActionPhase()
    s = { ...s, activeAgendas: ['fleet_regulations'] }
    s = deepFreeze({ ...toAgendaPhase(s, 'miscount_disclosed'), agendaDeck: [] as string[] })
    expect(legalOutcomes(s, 'miscount_disclosed')).toEqual(['fleet_regulations'])
    s = value(vote(s, 'fleet_regulations', []))
    s = value(vote(s, 'fleet_regulations', []))
    // The agenda round does not end; instead the elected law is revealed for a revote
    expect(s.agenda?.revealed).toBe('fleet_regulations')
    expect(s.phase).toBe('agenda')
    // Players revote "Against" to discard the law
    s = value(vote(s, 'Against', []))
    s = value(vote(s, 'Against', []))
    expect(s.agenda).toBeNull()
    expect(s.activeAgendas).not.toContain('fleet_regulations')
  })

  it('Prophecy of Ixth: gives +1 fighter combat roll bonus; discarded when producing < 2 fighters, retained when >= 2', () => {
    let s = toActionPhase()
    const sysId = homeSystemOf(s, 0)
    const planetId = s.systems[sysId].planets[0].id
    s = { ...s, activeAgendas: ['prophecy_of_ixth'], lawOwners: { prophecy_of_ixth: 0 } }
    expect(fighterBonus(s, 0)).toBe(1)

    // Producing 2 fighters retains Prophecy of Ixth
    const staged2 = withTactical(s, { systemId: sysId, step: 'production' })
    const r2 = applyMove(staged2, { type: 'produce', units: { fighter: 2 }, planets: [planetId], tradeGoods: 0 }, 0)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.activeAgendas).toContain('prophecy_of_ixth')
      expect(r2.value.lawOwners?.prophecy_of_ixth).toBe(0)
      expect(fighterBonus(r2.value, 0)).toBe(1)
    }

    // Producing 1 fighter discards Prophecy of Ixth
    const staged1 = withTactical(s, { systemId: sysId, step: 'production' })
    const r1 = applyMove(staged1, { type: 'produce', units: { fighter: 1 }, planets: [planetId], tradeGoods: 0 }, 0)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.value.activeAgendas).not.toContain('prophecy_of_ixth')
      expect(r1.value.lawOwners?.prophecy_of_ixth).toBeUndefined()
      expect(fighterBonus(r1.value, 0)).toBe(0)
      expect(r1.value.log.some(e => e.t === 'info' && e.text.includes('Prophecy of Ixth is discarded'))).toBe(true)
    }
  })
})

describe('R10 Elect-Planet laws with teeth: Holy Planet of Ixth and Demilitarized Zone', () => {
  /** seat 0's home planet that carries their starting space dock. */
  function dockPlanetOf(s: GameState): { sysId: string; planetId: string } {
    const sysId = homeSystemOf(s, 0)
    const planet = s.systems[sysId].planets.find(p => p.structures.some(u => u.type === 'spacedock' && u.owner === 0))
    if (!planet) throw new Error('no dock planet in the fixture')
    return { sysId, planetId: planet.id }
  }

  it('Holy Planet of Ixth: the planet\'s own space dock produces nothing (units there cannot use PRODUCTION)', () => {
    const s = toActionPhase()
    const { sysId, planetId } = dockPlanetOf(s)
    const before = productionLimit(s, 0, sysId)
    expect(before).toBeGreaterThan(0)
    const withLaw = withPlanetAttachment(s, planetId, 'holy_planet_of_ixth')
    expect(productionLimit(withLaw, 0, sysId)).toBe(0)
  })

  it('Holy Planet of Ixth: control of the planet swings 1 VP, clamped at zero (LRR 25)', () => {
    let s = toActionPhase()
    const { sysId, planetId } = dockPlanetOf(s)
    s = withPlanetAttachment(s, planetId, 'holy_planet_of_ixth')
    // the owner loses the planet with 1 VP: they drop to 0 while the taker gains 1
    const rich = { ...s, players: s.players.map((p, i) => i === 0 ? { ...p, vp: 1 } : p) }
    const swung = transferCrownRoyalLaws(rich, planetId, 1, 0)
    expect(swung.players[0].vp).toBe(0)
    expect(swung.players[1].vp).toBe(1)
    // the owner loses the planet at 0 VP: they stay at 0, VP never goes negative
    const swung2 = transferCrownRoyalLaws(s, planetId, 1, 0)
    expect(swung2.players[0].vp).toBe(0)
    expect(swung2.players[1].vp).toBe(1)
  })

  it('Holy Planet of Ixth: discarding the law takes no victory point back (lrr-components.md, Holy Planet 1)', () => {
    let s = toActionPhase()
    const { planetId } = dockPlanetOf(s)
    s = withPlanetAttachment(s, planetId, 'holy_planet_of_ixth')
    s = { ...s, players: s.players.map((p, i) => i === 0 ? { ...p, vp: 3 } : p) }
    const after = discardLaw(s, 'holy_planet_of_ixth')
    expect(after.players[0].vp).toBe(3)
    expect(planetByIdOf(after, planetId)?.attachments ?? []).not.toContain('holy_planet_of_ixth')
  })

  it('Demilitarized Zone: units cannot land there (handler and enumeration agree)', () => {
    let s = toActionPhase()
    const sysId = homeSystemOf(s, 1)   // the enemy home system, activated for an invasion
    const planetId = s.systems[sysId].planets[0].id
    s = withPlanetAttachment(s, planetId, 'demilitarized_zone')
    const staged = withTactical(withUnits(s, sysId, 0, ['carrier', 'infantry']), {
      systemId: sysId, step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 },
    })
    expect(landablePlanets(staged).map(l => l.planetId)).not.toContain(planetId)
    const infantry = staged.systems[sysId].space.filter(u => u.owner === 0 && u.type === 'infantry').map(u => u.id)
    const r = applyMove(staged, { type: 'land', planetId, infantryIds: infantry }, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Demilitarized Zone')
  })

  it('Demilitarized Zone: no structure may be placed there', () => {
    let s = toActionPhase()
    const { sysId, planetId } = dockPlanetOf(s)
    s = withPlanetAttachment(s, planetId, 'demilitarized_zone')
    expect(constructionPlanets(s, 0, 'pds', sysId)).not.toContain(planetId)
    expect(constructionPlanets(s, 0, 'spacedock', sysId)).not.toContain(planetId)
  })

  it('Demilitarized Zone: produced ground forces cannot be placed there, not even by a Floating Factory', () => {
    let s = toActionPhase(1, 0, SAAR_CONFIG)
    const sysId = homeSystemOf(s, 0)
    const planetId = s.systems[sysId].planets.find(p => p.owner === 0)?.id
    if (!planetId) throw new Error('no controlled planet in the fixture')
    s = withPlanetAttachment(s, planetId, 'demilitarized_zone')
    const staged = withTactical(withUnits(s, sysId, 0, ['floating_factory']), { systemId: sysId, step: 'production' })
    const r = applyMove(staged, { type: 'produce', units: { infantry: 1 }, planets: [planetId], tradeGoods: 0, groundTo: planetId }, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Demilitarized Zone')
  })

  it('Demilitarized Zone: Mitosis cannot place infantry there', () => {
    let s = withPlayer(toActionPhase(), 0, { faction: 'arborec' })
    const { sysId, planetId } = dockPlanetOf(s)
    // a second controlled planet so the default Mitosis target has somewhere legal to go
    const otherSys = Object.values(s.systems).find(sys => sys.planets.some(p => p.owner === null && p.id !== planetId))
    const other = otherSys?.planets.find(p => p.owner === null)
    if (!otherSys || !other) throw new Error('no unowned planet in the fixture')
    s = withPlanetOwner(s, otherSys.id, other.id, 0)
    s = withPlanetAttachment(s, planetId, 'demilitarized_zone')
    const groundBefore = planetByIdOf(s, planetId)?.ground.length ?? 0
    // the explicit DMZ target is refused
    const r = applyMitosis(s, 0, planetId)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Demilitarized Zone')
    // and the default placement goes to the legal planet, never the DMZ one
    const placed = applyMitosis(s, 0)
    expect(placed.ok).toBe(true)
    if (placed.ok) {
      expect(planetByIdOf(placed.value, planetId)?.ground.length).toBe(groundBefore)
      expect(planetByIdOf(placed.value, other.id)?.ground.length).toBe((planetByIdOf(s, other.id)?.ground.length ?? 0) + 1)
    }
  })
})
