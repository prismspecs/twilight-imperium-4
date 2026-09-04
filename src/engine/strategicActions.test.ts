import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { warfareTokenSystems } from './strategicActions'
import { deepFreeze, toActionPhase, withCards, withExhausted, withPlanetOwner, withPlayer, withUnits } from './testUtils'
import type { GameState, Player, Result, StrategicParams, StrategyCardId } from './types'

const play = (state: GameState, card: StrategyCardId, params?: StrategicParams) =>
  applyMove(deepFreeze(state), { type: 'strategic', card, params }, 0)
const answer = (state: GameState, card: StrategyCardId, accept: boolean, params?: StrategicParams) =>
  applyMove(deepFreeze(state), { type: 'secondary', card, accept, params }, 0)
const value = (r: Result<GameState>): GameState => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** A minimal third seat for exercising N-player plumbing on the two-player map. */
function thirdSeat(): Player {
  return {
    seat: 2, faction: 'l1z1x', color: 'green', name: 'C', vp: 0,
    tokens: { tactic: 3, fleet: 3, strategy: 2 }, tradeGoods: 0, commodities: 2, techs: [],
    strategyCards: [], passed: false, scoredObjectives: [], scoredMandates: [],
    resourcesSpentThisRound: 0, spaceCombatWins: 0, trades: 0, tradedThisRound: { west: false, east: false },
    inheritanceExhausted: false, shipyardUsed: false, pendingInfantry: 0,
    reinforcements: { infantry: 12, fighter: 10, destroyer: 8, cruiser: 8, carrier: 4, dreadnought: 5, warsun: 2, flagship: 1, pds: 6, spacedock: 3 },
  }
}

/** Seat 0 holds the card and is active, seat 1 answers; both keep the printed 3/3/2 command sheet. */
function holder(card: StrategyCardId): GameState {
  return withCards(withCards(toActionPhase(), 1, []), 0, [card])
}

describe('R3.2 strategic actions', () => {
  it('R3.2: the primary marks the card used, opens the secondary window and hands over the turn', () => {
    const s = holder('trade')
    const played = value(play(s, 'trade'))
    expect(played.players[0].strategyCards).toEqual([{ id: 'trade', used: true }])
    expect(played.pendingSecondary?.card).toBe('trade')
    expect(played.active).toBe(1)
    expect(s.players[0].strategyCards[0].used).toBe(false)        // input not mutated
  })
  it('R3.2: nothing else happens while a secondary window is open', () => {
    const played = value(play(holder('trade'), 'trade'))
    expect(applyMove(played, { type: 'startTactical', systemId: 'bereg' }, 0).ok).toBe(false)
    expect(applyMove(played, { type: 'pass' }, 0).ok).toBe(false)
    expect(applyMove(played, { type: 'strategic', card: 'warfare' }, 0).ok).toBe(false)
    const done = value(answer(played, 'trade', false))
    expect(done.pendingSecondary).toBeNull()
    // R3.2: the window closes back onto the card holder, whose action is spent but whose turn is not over
    expect(done.active).toBe(0)
    expect(done.turnDone).toBe(true)
    expect(value(applyMove(done, { type: 'endTurn' }, 0)).active).toBe(1)   // now the answering seat takes its turn
  })
  it('R3.2: a passed opponent still answers, and the card holder keeps the turn it never lost', () => {
    const s = withPlayer(holder('trade'), 1, { passed: true, strategyCards: [] })
    const done = value(answer(value(play(s, 'trade')), 'trade', false))
    expect(done.active).toBe(0)
    expect(done.turnDone).toBe(true)
    // the opponent has passed for the round, so ending the turn simply starts a fresh one for seat 0
    const next = value(applyMove(done, { type: 'endTurn' }, 0))
    expect(next.active).toBe(0)
    expect(next.turnDone).toBe(false)
  })
  it('R3.2: only the holder plays a card, only once, and only the opponent answers', () => {
    const s = holder('trade')
    expect(play(s, 'warfare').ok).toBe(false)                     // seat 0 does not hold it
    const played = value(play(s, 'trade'))
    expect(answer({ ...played, active: 0 }, 'trade', true).ok).toBe(false)
    const done = value(answer(played, 'trade', false))
    // `turnDone` cleared, so this tests the "already used" rejection and not the spent-action one
    expect(play({ ...done, turnDone: false }, 'trade').ok).toBe(false)   // already used
    expect(answer(done, 'trade', false).ok).toBe(false)                  // window closed
  })
  it('R6 Leadership primary: 3 command tokens plus 1 for every 3 influence spent', () => {
    let s = holder('leadership')
    s = withPlanetOwner(s, 'bereg', 'lirta-iv', 0)                // influence 3
    s = withPlanetOwner(s, 'starpoint', 'centauri', 0)            // influence 3
    const played = value(play(s, 'leadership', { planets: ['lirta-iv', 'centauri'], tokens: { tactic: 6, fleet: 4, strategy: 3 } }))
    expect(played.players[0].tokens).toEqual({ tactic: 6, fleet: 4, strategy: 3 })   // 8 + 3 + 2
    expect(played.systems.bereg.planets.find(p => p.id === 'lirta-iv')?.exhausted).toBe(true)
    expect(value(play(s, 'leadership')).players[0].tokens).toEqual({ tactic: 6, fleet: 3, strategy: 2 })
  })
  it('R6 Leadership: the distribution takes exactly the new tokens and never moves old ones', () => {
    const s = holder('leadership')
    expect(play(s, 'leadership', { tokens: { tactic: 4, fleet: 4, strategy: 2 } }).ok).toBe(false)   // 10, not 11
    expect(play(s, 'leadership', { tokens: { tactic: 2, fleet: 4, strategy: 5 } }).ok).toBe(false)   // tactic below 3
    expect(play(s, 'leadership', { tokens: { tactic: 3, fleet: 3, strategy: 5 } }).ok).toBe(true)
    expect(play(s, 'leadership', { planets: ['arc-prime'] }).ok).toBe(false)                          // not controlled
  })
  it('R6 Leadership secondary: 1 token per 3 influence and no strategy token cost', () => {
    let s = holder('leadership')
    s = withPlanetOwner(s, 'bereg', 'lirta-iv', 1)
    const answered = value(answer(value(play(s, 'leadership')), 'leadership', true, { planets: ['lirta-iv'] }))
    expect(answered.players[1].tokens).toEqual({ tactic: 4, fleet: 3, strategy: 2 })
    expect(answered.systems.bereg.planets.find(p => p.id === 'lirta-iv')?.exhausted).toBe(true)
  })
  it('R6 Leadership primary: trade goods also count as influence, spent 1 for 1', () => {
    const s = withPlayer(holder('leadership'), 0, { tradeGoods: 3 })
    const played = value(play(s, 'leadership', { tradeGoods: 3, tokens: { tactic: 4, fleet: 4, strategy: 4 } }))
    expect(played.players[0].tradeGoods).toBe(0)
    expect(played.players[0].tokens).toEqual({ tactic: 4, fleet: 4, strategy: 4 })   // 8 + 3 + 1 (3 trade goods / 3)
    expect(play(s, 'leadership', { tradeGoods: 4 }).ok).toBe(false)                  // only 3 trade goods available
  })
  it('R6 Diplomacy errata primary: the opponent gets a command token there, up to 2 planets are readied', () => {
    const s = withExhausted(holder('diplomacy'), ['000'])
    const played = value(play(s, 'diplomacy', { systemId: 'home-n', planets: ['000'] }))
    expect(played.systems['home-n'].activatedBy).toEqual([1])
    expect(played.systems['home-n'].planets[0].exhausted).toBe(false)
    const done = value(answer(played, 'diplomacy', false))
    const handed = value(applyMove(done, { type: 'endTurn' }, 0))                               // seat 1's turn
    expect(applyMove(handed, { type: 'startTactical', systemId: 'home-n' }, 0).ok).toBe(false)  // seat 1 is blocked there
    expect(applyMove(handed, { type: 'startTactical', systemId: 'quann' }, 0).ok).toBe(true)
  })
  it('R6 Diplomacy: not Mecatol Rex, only a system with a planet you control, at most 2 planets', () => {
    const s = withExhausted(holder('diplomacy'), ['000'])
    expect(play(s, 'diplomacy', { systemId: 'mecatol' }).ok).toBe(false)
    expect(play(s, 'diplomacy', { systemId: 'quann' }).ok).toBe(false)
    expect(play(s, 'diplomacy', {}).ok).toBe(false)
    expect(play(s, 'diplomacy', { systemId: 'home-n', planets: ['000', '000', '000'] }).ok).toBe(false)
    expect(play(withExhausted(s, ['000'], false), 'diplomacy', { systemId: 'home-n', planets: ['000'] }).ok).toBe(false)
  })
  it('R6 Diplomacy primary at N players: every other seat places a command token in the chosen system', () => {
    const base = withExhausted(withCards(toActionPhase(), 1, []), ['000'])
    const s = deepFreeze({ ...base, players: [...base.players, thirdSeat()], active: 0, pendingSecondary: null })
    const played = value(play(withCards(s, 0, ['diplomacy']), 'diplomacy', { systemId: 'home-n', planets: ['000'] }))
    expect(played.systems['home-n'].activatedBy).toEqual([1, 2])   // both other seats place a token
    expect(played.systems['home-n'].planets[0].exhausted).toBe(false)   // and two of your planets ready
  })
  it('R3.2/R6 Diplomacy: with no eligible system the primary is still playable', () => {
    let s = withExhausted(holder('diplomacy'), ['000'])
    s = withPlanetOwner(s, 'home-n', '000', null)                 // seat 0 controls nothing but Mecatol Rex
    s = withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0)
    const played = value(play(s, 'diplomacy', {}))
    expect(played.pendingSecondary?.card).toBe('diplomacy')
    expect(played.systems.mecatol.activatedBy).toEqual([])        // Mecatol Rex is never chosen
    expect(play(s, 'diplomacy', { systemId: 'mecatol' }).ok).toBe(false)
  })
  it('R6 Diplomacy secondary: a strategy token readies up to 2 exhausted planets you control', () => {
    const s = withExhausted(holder('diplomacy'), ['000', 'arc-prime', 'wren-terra'])
    const played = value(play(s, 'diplomacy', { systemId: 'home-n' }))
    const answered = value(answer(played, 'diplomacy', true, { planets: ['arc-prime', 'wren-terra'] }))
    expect(answered.players[1].tokens.strategy).toBe(1)
    expect(answered.systems['home-s'].planets.map(p => p.exhausted)).toEqual([false, false])   // both named planets
    expect(answer(withPlayer(played, 1, { tokens: { tactic: 3, fleet: 3, strategy: 0 } }), 'diplomacy', true, { planets: ['arc-prime'] }).ok).toBe(false)
  })
  it('R6 Trade primary: 3 trade goods, commodities replenished, the opponent may replenish too', () => {
    const s = withPlayer(withPlayer(holder('trade'), 0, { commodities: 0 }), 1, { commodities: 0 })
    const alone = value(play(s, 'trade'))
    expect(alone.players[0]).toMatchObject({ tradeGoods: 3, commodities: 2 })
    expect(alone.players[1].commodities).toBe(0)
    const shared = value(play(s, 'trade', { shareWith: [1] }))
    expect(shared.players[1].commodities).toBe(2)
    expect(shared.players[0].trades).toBe(1)   // sharing counts as a trade for both
    expect(shared.players[1].trades).toBe(1)
  })
  it('R6 Trade secondary: a strategy token replenishes commodities', () => {
    const s = withPlayer(holder('trade'), 1, { commodities: 0 })
    const answered = value(answer(value(play(s, 'trade')), 'trade', true))
    expect(answered.players[1]).toMatchObject({ commodities: 2, tokens: { tactic: 3, fleet: 3, strategy: 1 } })
  })
})

describe('R3.2 strategic actions, the remaining three cards', () => {
  it('R6 Warfare primary: a command token comes off the board, one is gained and the sheet is redistributed', () => {
    const base = holder('warfare')
    const s = deepFreeze({ ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, activatedBy: [0 as const] } } })
    const played = value(play(s, 'warfare', { systemId: 'bereg', tokens: { tactic: 2, fleet: 5, strategy: 2 } }))
    expect(played.systems.bereg.activatedBy).toEqual([])
    expect(played.players[0].tokens).toEqual({ tactic: 2, fleet: 5, strategy: 2 })   // 8 + 1, freely moved
    expect(play(s, 'warfare', { systemId: 'quann' }).ok).toBe(false)                  // no token of yours there
    expect(play(s, 'warfare', {}).ok).toBe(false)                                     // a token is on the board, name it
  })
  it('R6 Warfare primary: without a token on the board it only redistributes and gains nothing', () => {
    const s = holder('warfare')
    expect(warfareTokenSystems(s, 0)).toEqual([])
    expect(play(s, 'warfare', { tokens: { tactic: 1, fleet: 4, strategy: 3 } }).ok).toBe(true)
    expect(play(s, 'warfare', { tokens: { tactic: 2, fleet: 4, strategy: 3 } }).ok).toBe(false)   // 9, not 8
    expect(value(play(s, 'warfare')).players[0].tokens).toEqual({ tactic: 3, fleet: 3, strategy: 2 })
  })
  it('R4.4/R6 Warfare primary: a redistribution that leaves a fleet over its pool is rejected', () => {
    // three cruisers in bereg, so seat 0 needs at least 3 in the fleet pool to keep them
    const base = withUnits(holder('warfare'), 'bereg', 0, ['cruiser', 'cruiser', 'cruiser'])
    expect(play(base, 'warfare', { tokens: { tactic: 4, fleet: 2, strategy: 2 } }).ok).toBe(false)   // 8, fleet down to 2
    expect(play(base, 'warfare', { tokens: { tactic: 2, fleet: 4, strategy: 2 } }).ok).toBe(true)    // 8, fleet up to 4
    // the same check on the branch that takes a token off the board and hands out a ninth
    const onBoard = deepFreeze({ ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, activatedBy: [0 as const] } } })
    expect(play(onBoard, 'warfare', { systemId: 'bereg', tokens: { tactic: 5, fleet: 2, strategy: 2 } }).ok).toBe(false)
    const moved = value(play(onBoard, 'warfare', { systemId: 'bereg', tokens: { tactic: 4, fleet: 3, strategy: 2 } }))
    expect(moved.players[0].tokens).toEqual({ tactic: 4, fleet: 3, strategy: 2 })
  })
  it('R6 Warfare secondary: a strategy token produces at the home space dock under the R4.4 rules', () => {
    const played = value(play(holder('warfare'), 'warfare'))
    const answered = value(answer(played, 'warfare', true, { units: { infantry: 2 }, planets: ['wren-terra'], tradeGoods: 0 }))
    expect(answered.players[1].tokens.strategy).toBe(1)
    expect(answered.systems['home-s'].planets.find(p => p.id === 'arc-prime')?.ground).toHaveLength(4)
    expect(answered.tactical).toBeNull()
    expect(answer(played, 'warfare', true, { units: { infantry: 99 }, planets: ['wren-terra'] }).ok).toBe(false)
    expect(answer(played, 'warfare', true, {}).ok).toBe(false)                        // nothing to produce
  })
  it('R5/R6 Technology primary: one technology, a second for 6 resources, in order', () => {
    const s = withPlayer(holder('technology'), 0, { tradeGoods: 1 })
    const played = value(play(s, 'technology', { techId: 'antimass_deflectors', secondTechId: 'gravity_drive', planets: ['000'], tradeGoods: 1 }))
    expect(played.players[0].techs).toContain('antimass_deflectors')
    expect(played.players[0].techs).toContain('gravity_drive')      // prerequisite met by the first one
    expect(played.players[0].tradeGoods).toBe(0)
    expect(played.systems['home-n'].planets[0].exhausted).toBe(true)
  })
  it('R5: the second technology needs the first, the payment and a met prerequisite', () => {
    const s = holder('technology')
    expect(play(s, 'technology', { secondTechId: 'sarween_tools', planets: ['000'], tradeGoods: 1 }).ok).toBe(false)
    expect(play(s, 'technology', { techId: 'sarween_tools', secondTechId: 'antimass_deflectors', planets: ['000'] }).ok).toBe(false)   // 5 of 6
    expect(play(s, 'technology', { techId: 'carrier_ii' }).ok).toBe(false)             // prerequisites missing (blue 2)
    expect(play(s, 'technology', { techId: 'l4_disruptors' }).ok).toBe(false)          // wrong faction
    expect(value(play(s, 'technology')).players[0].techs).toHaveLength(2)              // researching nothing is allowed
  })
  it('R5/R6 Technology secondary: a strategy token and 4 resources for one technology', () => {
    const played = value(play(holder('technology'), 'technology'))
    const answered = value(answer(played, 'technology', true, { techId: 'sarween_tools', planets: ['arc-prime'] }))
    expect(answered.players[1].techs).toContain('sarween_tools')
    expect(answered.players[1].tokens.strategy).toBe(1)
    expect(answer(played, 'technology', true, { techId: 'sarween_tools', planets: ['wren-terra'] }).ok).toBe(false)   // 2 of 4
    expect(answer(played, 'technology', true, {}).ok).toBe(false)
  })
  it('R7/R6 Imperial primary: scores one fulfilled public objective and 1 VP for Mecatol Rex', () => {
    // seat 0 starts with five ships against four, so "more ships" is fulfilled from the first turn
    const revealed = { ...holder('imperial'), publicObjectives: ['more_ships'] }
    const s = withPlanetOwner(revealed, 'mecatol', 'mecatol-rex', 0)
    const played = value(play(s, 'imperial', { objectiveId: 'more_ships' }))
    expect(played.players[0].vp).toBe(2)
    expect(played.players[0].scoredObjectives).toEqual(['more_ships'])
    expect(play(s, 'imperial', { objectiveId: 'trade_three_times' }).ok).toBe(false)   // not revealed
    const unfulfilled = { ...holder('imperial'), publicObjectives: ['trade_three_times'] }
    expect(play(unfulfilled, 'imperial', { objectiveId: 'trade_three_times' }).ok).toBe(false)
    expect(play(withPlayer(s, 0, { scoredObjectives: ['more_ships'] }), 'imperial', { objectiveId: 'more_ships' }).ok).toBe(false)
    expect(value(play(holder('imperial'), 'imperial')).players[0].vp).toBe(0)          // no objective, no Mecatol Rex
  })
  it('R6 Imperial secondary: a strategy token for 2 trade goods', () => {
    const played = value(play(holder('imperial'), 'imperial'))
    const answered = value(answer(played, 'imperial', true))
    expect(answered.players[1]).toMatchObject({ tradeGoods: 2, tokens: { tactic: 3, fleet: 3, strategy: 1 } })
    expect(value(answer(played, 'imperial', false)).players[1].tradeGoods).toBe(0)
  })
  it('R3.2: with three players every other seat answers the secondary in order before the holder resumes', () => {
    // a minimal third seat bolted onto the two-player map so the strategic plumbing can be exercised at N=3
    const base = withCards(toActionPhase(), 1, [])
    const s = deepFreeze({ ...base, players: [...base.players, thirdSeat()], active: 0, pendingSecondary: null })
    const played = value(play(withCards(s, 0, ['trade']), 'trade'))
    expect(played.pendingSecondary?.card).toBe('trade')
    expect(played.pendingSecondary?.queue).toEqual([1, 2])
    expect(played.active).toBe(1)
    const after1 = value(answer(played, 'trade', true))
    expect(after1.pendingSecondary?.queue).toEqual([2])
    expect(after1.active).toBe(2)
    const after2 = value(answer(after1, 'trade', false))
    expect(after2.pendingSecondary).toBeNull()
    expect(after2.active).toBe(0)
    expect(after2.turnDone).toBe(true)
  })
})
