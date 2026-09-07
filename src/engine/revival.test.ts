import { describe, expect, it } from 'vitest'
import { homeSystemId } from '../data/map'
import { otherSeat } from './actionPhase'
import { applyMove, legalMoves } from './index'
import { tokensGained } from './statusPhase'
import { carriedIds, cardsUsed, deepFreeze, hitsIn, toActionPhase, toStatusPhase, withCards, withPlanetOwner, withPlayer, withTechs, withUnits } from './testUtils'
import type { GameState, Result, Seat, UnitType } from './types'

const ok = (r: Result<GameState>): GameState => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const revivalRolls = (state: GameState): number => state.log.filter(e => e.t === 'roll' && e.context === 'Infantry II revival').length

/** Seat 0 lands two infantry on Quann against `defenders` infantry of seat 1. */
function invading(defenders: number, seed = 3): GameState {
  let s = withTechs(toActionPhase(), 0, ['infantry_ii'])
  s = withPlanetOwner(s, 'quann', 'quann', 1)
  s = withUnits(s, 'quann', 1, Array<UnitType>(defenders).fill('infantry'), 'quann')
  s = withUnits(s, 'quann', 0, ['carrier', 'infantry', 'infantry'])
  const started = ok(applyMove(deepFreeze(s), { type: 'startTactical', systemId: 'quann' }, seed))
  const moved = ok(applyMove(started, { type: 'endMovement' }, seed))
  return ok(applyMove(moved, { type: 'land', planetId: 'quann', infantryIds: carriedIds(moved, 'quann', 0) }, seed))
}

/** Both players through a status phase, all new tokens into the tactic pool. */
function runStatus(state: GameState): GameState {
  const step = (s: GameState): GameState => {
    const seat = s.active
    const t = s.players[seat].tokens
    return ok(applyMove(s, { type: 'status', params: { tokens: { ...t, tactic: t.tactic + tokensGained(s, seat) } } }, 7))
  }
  return step(step(toStatusPhase(state)))
}

describe('R4.3 step 4 Infantry II revival', () => {
  it('R4.3 step 4: infantry lost in ground combat roll to return, but only with Infantry II', () => {
    let s = invading(6)
    for (let i = 0; i < 20 && s.systems.quann.planets[0].ground.some(u => u.owner === 0); i++) {
      s = ok(applyMove(s, { type: 'groundCombatRound' }, 30 + i))
    }
    expect(revivalRolls(s)).toBeGreaterThan(0)                       // six defenders at 8+ wipe two attackers
    expect(s.players[0].pendingInfantry).toBe(hitsIn(s, 'Infantry II revival'))
    expect(s.players[1].pendingInfantry).toBe(0)                     // seat 1 has no Infantry II
  })
  it('R4.3 step 4: bombardment and space cannon defense roll for the same return', () => {
    let s = withTechs(toActionPhase(), 1, ['infantry_ii'])
    s = withPlanetOwner(s, 'quann', 'quann', 1)
    s = withUnits(s, 'quann', 1, ['infantry', 'infantry', 'infantry'], 'quann')
    s = withUnits(s, 'quann', 0, ['dreadnought'])
    const started = ok(applyMove(deepFreeze(s), { type: 'startTactical', systemId: 'quann' }, 4))
    const moved = ok(applyMove(started, { type: 'endMovement' }, 4))
    const bombed = ok(applyMove(moved, { type: 'bombard', planetId: 'quann' }, 4))
    const killed = 3 - bombed.systems.quann.planets[0].ground.filter(u => u.owner === 1).length
    expect(revivalRolls(bombed)).toBe(killed > 0 ? 1 : 0)            // one entry per group that lost infantry
    expect(bombed.players[1].pendingInfantry).toBe(hitsIn(bombed, 'Infantry II revival'))
    expect(bombed.players[0].pendingInfantry).toBe(0)

    let t = withTechs(toActionPhase(), 0, ['infantry_ii'])
    t = withPlanetOwner(t, 'quann', 'quann', 1)
    t = withUnits(t, 'quann', 1, ['pds'], 'quann')
    t = withUnits(t, 'quann', 0, ['carrier', 'infantry', 'infantry'])
    // seed 4 (not the brief's 6): letnev's Plasma Scoring gives the entry PDS shot two dice, and with seed 6
    // both hit and destroy the carrier before it ever reaches the planet, so `land` never runs; seed 4 is the
    // smallest seed where the carrier survives entry, letting this scenario reach the landing defense it tests.
    const s2 = ok(applyMove(deepFreeze(t), { type: 'startTactical', systemId: 'quann' }, 4))
    const m2 = ok(applyMove(s2, { type: 'endMovement' }, 4))
    const c2 = ok(applyMove(m2, { type: 'combatRound' }, 4))
    const inv = ok(applyMove(c2, { type: 'combatRound' }, 4))
    const landed = ok(applyMove(inv, { type: 'land', planetId: 'quann', infantryIds: carriedIds(inv, 'quann', 0) }, 4))
    const lost = 2 - landed.systems.quann.planets[0].ground.filter(u => u.owner === 0).length
    expect(revivalRolls(landed)).toBe(lost > 0 ? 1 : 0)
    expect(landed.players[0].pendingInfantry).toBe(hitsIn(landed, 'Infantry II revival'))
  })
  it('R4.3 step 4: the infantry come back on a home planet at the start of your next turn', () => {
    const s = withPlayer(cardsUsed(toActionPhase(1, 1)), 0, { pendingInfantry: 2 })
    const before = s.players[0].reinforcements.infantry
    const done = ok(applyMove(s, { type: 'pass' }, 0))                // seat 1 passes, seat 0 is on turn
    expect(done.active).toBe(0)
    expect(done.players[0].pendingInfantry).toBe(0)
    expect(done.players[0].reinforcements.infantry).toBe(before - 2)
    expect(done.systems['home-n'].planets[0].ground.filter(u => u.owner === 0)).toHaveLength(7)
  })
  it('R4.3 step 4: without a home planet or reinforcements the infantry are lost', () => {
    const base = withPlayer(cardsUsed(toActionPhase(1, 1)), 0, { pendingInfantry: 2 })
    const homeless = withPlanetOwner(base, 'home-n', '000', null)
    const lost = ok(applyMove(homeless, { type: 'pass' }, 0))
    expect(lost.players[0].pendingInfantry).toBe(0)
    expect(lost.systems['home-n'].planets[0].ground.filter(u => u.owner === 0)).toHaveLength(5)
    const empty = withPlayer(base, 0, { pendingInfantry: 2, reinforcements: { ...base.players[0].reinforcements, infantry: 1 } })
    const partial = ok(applyMove(empty, { type: 'pass' }, 0))
    expect(partial.players[0]).toMatchObject({ pendingInfantry: 0, reinforcements: expect.objectContaining({ infantry: 0 }) })
    expect(partial.systems['home-n'].planets[0].ground.filter(u => u.owner === 0)).toHaveLength(6)
  })
  it('R3.3/R4.3: pending infantry survive the status phase and arrive when the next action phase opens', () => {
    const s = withPlayer(withPlayer(toActionPhase(), 0, { pendingInfantry: 1 }), 1, { pendingInfantry: 1 })
    let next = runStatus(s)
    expect(next.players.map(p => p.pendingInfantry)).toEqual([1, 1])
    expect(next.phase).toBe('strategy')
    while (next.phase === 'strategy') next = ok(applyMove(next, legalMoves(next)[0], 0))
    const first: Seat = next.active
    expect(next.players[first].pendingInfantry).toBe(0)
    expect(next.players[otherSeat(first)].pendingInfantry).toBe(1)   // the opponent waits for its own turn
    expect(next.systems[homeSystemId(first)].planets.some(p => p.ground.some(u => u.owner === first))).toBe(true)
  })
  it('R3.2/R4.3: answering a strategy card is not a turn, so nothing returns yet', () => {
    const s = withPlayer(withCards(withCards(toActionPhase(), 1, []), 0, ['trade']), 1, { pendingInfantry: 1 })
    const played = ok(applyMove(s, { type: 'strategic', card: 'trade' }, 0))
    expect(played.active).toBe(1)
    expect(played.players[1].pendingInfantry).toBe(1)                // the window is a response, not a turn
    const answered = ok(applyMove(played, { type: 'secondary', card: 'trade', accept: false }, 0))
    expect(answered.active).toBe(0)                                  // the card holder's turn is not over yet
    expect(answered.players[1].pendingInfantry).toBe(1)              // so seat 1's turn has not started either
    const handed = ok(applyMove(answered, { type: 'endTurn' }, 0))
    expect(handed.players[1].pendingInfantry).toBe(0)                // now seat 1 takes its turn
  })
})
