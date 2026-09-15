import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { decideWinner, tokensGained } from './statusPhase'
import { deepFreeze, groundIds, toActionPhase, toStatusPhase, withPlanetOwner, withPlayer, withTechs } from './testUtils'
import type { GameState, Result, StatusParams } from './types'

const value = (r: Result<GameState>): GameState => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const submit = (state: GameState, params: StatusParams, seed = 7) => applyMove(deepFreeze(state), { type: 'status', params }, seed)
const plain = (tactic: number, fleet = 3, strategy = 2): StatusParams => ({ tokens: { tactic, fleet, strategy } })

/** Both players through the status phase, speaker first; the new tokens all go into the tactic pool. */
function bothSubmit(state: GameState, seed = 7): GameState {
  const step = (s: GameState): GameState => {
    const seat = s.active
    const tokens = s.players[seat].tokens
    return value(submit(s, { tokens: { ...tokens, tactic: tokens.tactic + tokensGained(s, seat) } }, seed))
  }
  return step(step(state))
}

describe('R3.3 status phase', () => {
  it('R3.3 step 3: two command tokens, three with Hyper Metabolism, and existing tokens may be redistributed too', () => {
    const s = toStatusPhase(toActionPhase())
    expect(s.players[0].tokens).toEqual({ tactic: 3, fleet: 3, strategy: 2 })   // 8 on the sheet, 2 to come
    expect(submit(s, plain(5)).ok).toBe(true)                        // 5 + 3 + 2 = 10, both into the tactic pool
    expect(submit(s, plain(3, 4, 3)).ok).toBe(true)                  // 10, one into each of the other pools
    expect(submit(s, plain(4)).ok).toBe(false)                       // 9, one token unassigned
    expect(submit(s, plain(6)).ok).toBe(false)                       // 11, one token too many
    expect(submit(s, plain(2, 5, 3)).ok).toBe(true)                  // 10: the tactic pool may shrink too, redistributing what was already there
    const hyper = toStatusPhase(withTechs(toActionPhase(), 0, ['hyper_metabolism']))
    expect(submit(hyper, plain(6)).ok).toBe(true)                    // 11, three tokens
    expect(submit(hyper, plain(5)).ok).toBe(false)
  })
  it('R3.3 step 1: fulfilled objectives score, each only once', () => {
    // a pool of two keeps the second status phase from revealing something that is already fulfilled
    let s: GameState = {
      ...toActionPhase(), publicObjectives: ['lead_from_the_front'],
      objectiveOrder: ['lead_from_the_front', 'corner_the_market'],
    }
    s = withPlayer(s, 0, { tokensSpentThisRound: 3 })
    s = withPlanetOwner(s, 'mecatol', 'mr', 0)
    const done = bothSubmit(toStatusPhase(s))
    expect(done.players[0].vp).toBe(1)                               // the objective (no passive Mecatol VP in base game)
    expect(done.players[0].scoredObjectives).toEqual(['lead_from_the_front'])
    expect(done.players[1].vp).toBe(0)
    // a fresh deck card keeps the next phase's reveal alive (a dry deck would end the game, LRR 2896.8)
    const second = bothSubmit(toStatusPhase({ ...done, phase: 'action', objectiveOrder: [...done.objectiveOrder, 'expand_borders'] }))
    expect(second.players[0].vp).toBe(1)                             // does not score again
  })
  it('R3.3 step 2: the next objective off the shuffled pool is revealed once at the phase start, and a dry deck ends the game before scoring', () => {
    const start = toActionPhase()
    // setup revealed order[0] and order[1] (LRR 1785); the phase's first status move reveals order[2]
    const done = bothSubmit(toStatusPhase(start))
    expect(done.publicObjectives).toEqual([start.objectiveOrder[0], start.objectiveOrder[1], start.objectiveOrder[2]])
    expect(done.round).toBe(2)
    // a dry deck: every card revealed — the phase's first status move ends the game with the most-VP
    // player ahead and scores nothing (LRR 2896.8)
    const dry = { ...toActionPhase(), round: 8, objectiveOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], publicObjectives: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }
    const late = toStatusPhase(dry)
    const lateSeat = late.active
    const lateTokens = late.players[lateSeat].tokens
    const ended = value(submit(late, { tokens: { ...lateTokens, tactic: lateTokens.tactic + tokensGained(late, lateSeat) } }))
    expect(ended.phase).toBe('ended')
    expect(ended.publicObjectives).toHaveLength(8)
    expect(ended.players[0].scoredObjectives).toEqual([])
  })
  it('R3.3 step 4/R3.1: planets and cards ready, played cards return at 0, unpicked keep their bonus', () => {
    const base = toActionPhase()
    const homeSys = base.systems['home-0']
    const dirty = deepFreeze({
      ...base,
      players: [
        {
          ...base.players[0], inheritanceExhausted: true, resourcesSpentThisRound: 8,
          passed: true, scoredObjectives: ['lead_from_the_front'],
        },
        { ...base.players[1], passed: true },
      ] as GameState['players'],
      systems: { ...base.systems, 'home-0': { ...homeSys, activatedBy: [0 as const], planets: homeSys.planets.map(p => ({ ...p, exhausted: true })) } },
    })
    const done = bothSubmit(toStatusPhase(dirty))
    expect(done.systems['home-0'].activatedBy).toEqual([])
    expect(done.systems['home-0'].planets.every(p => !p.exhausted)).toBe(true)
    expect(done.players[0]).toMatchObject({ inheritanceExhausted: false, resourcesSpentThisRound: 0, passed: false })
    // these are once-per-game (or once-ever) flags, not per-round state: the reset must leave them untouched
    expect(done.players[0]).toMatchObject({ scoredObjectives: ['lead_from_the_front'] })
    expect(done.players.every(p => p.strategyCards.length === 0)).toBe(true)
    // R3.1: warfare, leadership, imperial and technology were played and come back at 0; the two unpicked
    // cards keep the trade good each of them collected at the end of the draft
    expect(done.strategyPool.map(c => c.id)).toEqual(['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial'])
    expect(done.strategyPool.map(c => c.bonus)).toEqual([0, 1, 1, 1, 1, 0, 0, 0])
    const picked = applyMove(done, { type: 'pickStrategyCard', card: 'diplomacy' }, 0)
    if (!picked.ok) throw new Error(picked.error)
    expect(picked.value.players[0].tradeGoods).toBe(done.players[0].tradeGoods + 1)
  })
  it('R3.3 step 5: no guardian fleets are rolled in status phase in base game', () => {
    const s = toStatusPhase(toActionPhase())
    expect(bothSubmit(s).guardianRolls).toBe(0)
    const owned = toStatusPhase(withPlanetOwner(toActionPhase(), 'mecatol', 'mecatol-rex', 1))
    const done = bothSubmit(owned)
    expect(done.guardianRolls).toBe(0)
  })
  it('R3.3 step 6 / R7: 10 victory points end the game, objective deck exhaustion ends it in any case', () => {
    const rich = withPlayer(toActionPhase(), 1, { vp: 10 })
    const done = bothSubmit(toStatusPhase(rich))
    expect(done.phase).toBe('ended')
    expect(done.winner).toBe(1)
    const open = bothSubmit(toStatusPhase(withPlayer(toActionPhase(), 1, { vp: 9 })))
    expect(open.phase).toBe('strategy')
    expect(open.winner).toBeNull()
    const dryState = toStatusPhase({ ...withPlayer(toActionPhase(), 0, { vp: 2 }), round: 10, objectiveOrder: toActionPhase().objectiveOrder.slice(0, 10), publicObjectives: toActionPhase().objectiveOrder.slice(0, 10) })
    const drySeat = dryState.active
    const dryTokens = dryState.players[drySeat].tokens
    const last = value(submit(dryState, { tokens: { ...dryTokens, tactic: dryTokens.tactic + tokensGained(dryState, drySeat) } }))
    expect(last.phase).toBe('ended')
    expect(last.winner).toBe(0)
    expect(last.players[0].scoredObjectives).toEqual([])   // the dry phase scores nothing (LRR 2896.8)
  })
  it('R7: the tie-break chain is Mecatol Rex, then planets, then the speaker\'s opponent', () => {
    const tied = withPlayer(withPlayer(toActionPhase(), 0, { vp: 4 }), 1, { vp: 4 })
    expect(decideWinner(withPlayer(tied, 0, { vp: 5 }))).toBe(0)                        // higher VP first
    expect(decideWinner(withPlanetOwner(tied, 'mecatol', 'mecatol-rex', 1))).toBe(1)    // then Mecatol Rex
    expect(decideWinner(tied)).toBe(1)                                                  // then planets, 1 against 2
    // one planet each side of the map makes it 2 against 2, so only the speaker is left
    const even = withPlanetOwner(tied, 'bereg', 'bereg', 0)
    expect(decideWinner(even)).toBe(1)                                                  // the speaker's opponent
    expect(decideWinner({ ...even, speaker: 1 })).toBe(0)
  })
  it('R7: both players reach 10 VP in the same status phase through real submissions, tie-break decides', () => {
    let s = withPlayer(toActionPhase(), 0, { vp: 9, tokensSpentThisRound: 3 })
    s = withPlayer(s, 1, { vp: 9, tokensSpentThisRound: 3 })
    s = { ...s, publicObjectives: ['lead_from_the_front'], objectiveOrder: ['lead_from_the_front', 'corner_the_market'] }
    s = withPlanetOwner(s, 'mecatol', 'mr', 0)                // tie-break will favor Mecatol Rex controller
    const done = bothSubmit(toStatusPhase(s))
    expect(done.players[0].vp).toBe(10)                               // 9 + 1 for lead_from_the_front
    expect(done.players[1].vp).toBe(10)                               // 9 + 1 for lead_from_the_front
    expect(done.phase).toBe('ended')
    expect(done.winner).toBe(0)                                       // tied at 10, decided by the Mecatol Rex controller
  })
  it('R3.1/R6: the speaker token stays put (only Politics moves it) and the next round drafts a fresh snake', () => {
    const done = bothSubmit(toStatusPhase(toActionPhase()))
    expect(done.speaker).toBe(0)
    expect(done.active).toBe(0)
    expect(done.phase).toBe('strategy')
    expect(done.draft).toEqual([0, 1, 1, 0])
    expect(done.tactical).toBeNull()
    expect(done.pendingSecondary).toBeNull()
  })
  it('R3.3: the phase ends only when both players have submitted, speaker first', () => {
    const s = toStatusPhase(toActionPhase())
    const first = value(submit(s, plain(5, 3, 2)))
    expect(first.phase).toBe('status')
    expect(first.active).toBe(1)
    expect(first.players[0].tokens.tactic).toBe(5)
    const second = value(submit(first, plain(5, 3, 2)))
    expect(second.phase).toBe('strategy')
    expect(submit({ ...toActionPhase(), phase: 'action' }, plain(5)).ok).toBe(false)
  })
  it('R3.3: a seat may not submit twice, and the submissions are tracked in statusSubmitted', () => {
    const s = toStatusPhase(toActionPhase())
    expect(s.statusSubmitted).toEqual([])
    const first = value(submit(s, plain(5, 3, 2)))
    expect(first.statusSubmitted).toEqual([0])
    // the same seat again, whatever the active seat says
    const again = submit({ ...first, active: 0 }, plain(7, 3, 2))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error).toMatch(/already submitted/)
    const second = value(submit(first, plain(5, 3, 2)))
    expect(second.phase).toBe('strategy')
    expect(second.statusSubmitted).toEqual([])                        // the round advance clears it again
  })
  it('R3.3: a phase entered on the speaker\'s opponent still needs both submissions', () => {
    const s = deepFreeze({ ...toStatusPhase(toActionPhase()), active: 1 as const })
    expect(s.speaker).toBe(0)
    const first = value(submit(s, plain(3, 3, 4)))                    // seat 1 goes first here
    expect(first.phase).toBe('status')                                // not closed after one move
    expect(first.active).toBe(0)
    expect(first.statusSubmitted).toEqual([1])
    const second = value(submit(first, plain(5, 3, 2)))
    expect(second.phase).toBe('strategy')
    expect(second.players[0].tokens.tactic).toBe(5)                   // seat 0's own submission was applied
  })
  it('R7: the round objective is scored from the round it was fulfilled in, then its counter resets', () => {
    let s = { ...toActionPhase(), round: 4, publicObjectives: ['lead_from_the_front'] }
    s = withPlayer(s, 0, { tokensSpentThisRound: 3 })
    const done = bothSubmit(toStatusPhase(s))
    expect(done.players[0].scoredObjectives).toEqual(['lead_from_the_front'])
    expect(done.players[0].tokensSpentThisRound).toBe(0)
  })
  describe('Arborec faction tech Bioplasmosis', () => {
    it('relocates infantry to a planet the seat controls in the same or an adjacent system', () => {
      const base = toActionPhase()
      const adjSysId = base.systems['home-0'].neighbours[0]
      const adjPlanet = base.systems[adjSysId]?.planets[0] ?? { id: 'test_adj_p', name: 'Test', resources: 1, influence: 1, trait: null, techSkip: null, owner: 0, ground: [], structures: [], exhausted: false }
      let s = withPlayer(toStatusPhase(base), 0, { faction: 'arborec' })
      if (!base.systems[adjSysId]?.planets.length) {
        s = { ...s, systems: { ...s.systems, [adjSysId]: { ...s.systems[adjSysId], planets: [adjPlanet] } } }
      }
      s = withPlanetOwner(s, adjSysId, adjPlanet.id, 0)
      s = withTechs(s, 0, ['bioplasmosis'])
      const infantryId = groundIds(s, 'home-0', '0.0.0', 0)[0]
      const moved = value(submit(s, { tokens: { ...s.players[0].tokens, tactic: s.players[0].tokens.tactic + tokensGained(s, 0) }, redistribute: [{ infantryId, to: adjPlanet.id }] }))
      expect(moved.systems['home-0'].planets[0].ground.some(u => u.id === infantryId)).toBe(false)
      expect(moved.systems[adjSysId].planets.find(p => p.id === adjPlanet.id)?.ground.some(u => u.id === infantryId)).toBe(true)
    })
    it('is rejected for a seat that has not researched it', () => {
      const s = withPlanetOwner(toStatusPhase(toActionPhase()), 'home-0', '0.0.0', 0)
      const infantryId = groundIds(s, 'home-0', '0.0.0', 0)[0]
      const r = submit(s, { tokens: { ...s.players[0].tokens, tactic: s.players[0].tokens.tactic + tokensGained(s, 0) }, redistribute: [{ infantryId, to: '0.0.0' }] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/not been researched/)
    })
    it('is rejected when the destination planet is not the seat\'s own', () => {
      const s = withTechs(withPlayer(toStatusPhase(toActionPhase()), 0, { faction: 'arborec' }), 0, ['bioplasmosis'])
      const infantryId = groundIds(s, 'home-0', '0.0.0', 0)[0]
      const r = submit(s, { tokens: { ...s.players[0].tokens, tactic: s.players[0].tokens.tactic + tokensGained(s, 0) }, redistribute: [{ infantryId, to: 'mr' }] })   // mr is neutral
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/not controlled/)
    })
    it('is rejected across two systems that are neither the same nor adjacent', () => {
      // home-0 does not neighbour home-1 (opposite sides of hex)
      const base = withPlayer(toStatusPhase(toActionPhase()), 0, { faction: 'arborec' })
      const destPlanet = base.systems['home-1'].planets[0]?.id ?? 'other'
      const s = withTechs(withPlanetOwner(base, 'home-1', destPlanet, 0), 0, ['bioplasmosis'])
      const infantryId = groundIds(s, 'home-0', '0.0.0', 0)[0]
      const r = submit(s, { tokens: { ...s.players[0].tokens, tactic: s.players[0].tokens.tactic + tokensGained(s, 0) }, redistribute: [{ infantryId, to: destPlanet }] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/adjacent/)
    })
  })
})
