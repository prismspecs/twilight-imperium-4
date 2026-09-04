// src/engine/production.test.ts
import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { deepFreeze, toActionPhase, withPlayer, withTactical, withTechs, withUnits } from './testUtils'
import type { GameState, UnitType } from './types'

/** Seat 0 in the production step of its own home system: dock on a 5 resource planet, fleet pool 3, capacity 6. */
const producing = (seed = 1) => withTactical(toActionPhase(seed), { systemId: 'home-n', step: 'production' })

const produce = (state: GameState, units: Partial<Record<UnitType, number>>, planets: string[], tradeGoods = 0) =>
  applyMove(deepFreeze(state), { type: 'produce', units, planets, tradeGoods }, 0)

const fighters = (state: GameState) => state.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'fighter').length

describe('R4.4 production', () => {
  it('R4.4: produces ships into the space and infantry onto the dock planet, then finishes the step', () => {
    const s = producing()
    const r = produce(s, { cruiser: 1, infantry: 2 }, ['000'])
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'cruiser')).toHaveLength(1)
    expect(r.value.systems['home-n'].planets[0].ground.filter(u => u.owner === 0)).toHaveLength(7)
    expect(r.value.systems['home-n'].planets[0].exhausted).toBe(true)
    expect(r.value.players[0].reinforcements.cruiser).toBe(s.players[0].reinforcements.cruiser - 1)
    expect(r.value.players[0].reinforcements.infantry).toBe(s.players[0].reinforcements.infantry - 2)
    expect(r.value.tactical?.step).toBe('done')
    const ids = r.value.systems['home-n'].space.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('R4.4: the production limit is the planet resources plus the dock bonus', () => {
    const s = producing()
    expect(produce(s, { infantry: 8 }, ['000']).ok).toBe(false)     // limit 7
    expect(produce(s, { infantry: 6, fighter: 1 }, ['000']).ok).toBe(true)
  })
  it('R4.4: fighters and infantry come in pairs and Sarween Tools takes one off the total', () => {
    const s = producing()
    expect(produce(s, { fighter: 2, infantry: 2 }, []).ok).toBe(false)     // cost 2, nothing paid
    expect(produce(s, { fighter: 2, infantry: 2 }, ['000']).ok).toBe(true)
    expect(produce(withTechs(s, 0, ['sarween_tools']), { infantry: 2 }, []).ok).toBe(true)   // cost 1 minus 1
  })
  it('R4.4: a War Sun needs no technology and may be produced from the first round', () => {
    const rich = withPlayer(producing(), 0, { tradeGoods: 20 })
    const r = produce(rich, { warsun: 1 }, [], 12)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'warsun')).toHaveLength(1)
    expect(r.value.players[0].tradeGoods).toBe(8)
  })
  it('R4.4: only one flagship may exist at a time', () => {
    const rich = withPlayer(producing(), 0, { tradeGoods: 20 })
    expect(produce(rich, { flagship: 2 }, [], 16).ok).toBe(false)
    const hasFlagship = withUnits(rich, 'home-n', 0, ['flagship'])
    // restore the reinforcement spent by the fixture so this hits the uniqueness guard, not a reinforcement shortage
    const canAffordAnother = withPlayer(hasFlagship, 0, { reinforcements: { ...hasFlagship.players[0].reinforcements, flagship: 1 } })
    expect(produce(canAffordAnother, { flagship: 1 }, [], 8).ok).toBe(false)
  })
  it('R4.4: reinforcements and the fleet pool limit the production', () => {
    const s = producing()
    const empty = withPlayer(s, 0, { reinforcements: { ...s.players[0].reinforcements, cruiser: 0 }, tradeGoods: 20 })
    expect(produce(empty, { cruiser: 1 }, [], 2).ok).toBe(false)
    const rich = withPlayer(s, 0, { tradeGoods: 20 })
    expect(produce(rich, { warsun: 1, cruiser: 1 }, [], 14).ok).toBe(false)   // 2 present plus 2 produced is over the fleet pool of 3
    expect(produce(rich, { cruiser: 1 }, [], 2).ok).toBe(true)
  })
  it('R4.4: the dock\'s free slots (Space Dock I, no tech needed) admit fighters up to capacity plus 3', () => {
    const rich = withPlayer(producing(), 0, { tradeGoods: 10 })
    expect(fighters(rich)).toBe(3)                                  // carrier 4 plus super-dreadnought 2 is capacity 6
    const r = produce(rich, { fighter: 6 }, [], 3)
    if (!r.ok) throw new Error(r.error)
    expect(fighters(r.value)).toBe(9)                               // capacity 6 plus the dock's 3 free slots: all 6 fit
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(false)
    // beyond that room, fighters are still trimmed regardless of the tech: Space Dock II doesn't add more slots
    const overflow = produce(withTechs(rich, 0, ['space_dock_ii']), { fighter: 8 }, [], 3)
    if (!overflow.ok) throw new Error(overflow.error)
    expect(fighters(overflow.value)).toBe(9)                        // still capped at capacity 6 plus 3 free slots
    expect(overflow.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(true)
    const none = produce(withPlayer(rich, 0, { tradeGoods: 10 }), { fighter: 0 }, [])
    expect(none.ok).toBe(false)
  })
  it('R4.4: a new ship\'s own capacity is pooled into the trim, so it can keep fighters that would otherwise be cut', () => {
    const sixFighters = withUnits(producing(), 'home-n', 0, ['fighter', 'fighter', 'fighter'])   // 3 existing + 3 more = 6, exactly capacity 6
    expect(fighters(sixFighters)).toBe(6)
    const r = produce(sixFighters, { carrier: 1, fighter: 4 }, ['000'])
    if (!r.ok) throw new Error(r.error)
    expect(fighters(r.value)).toBe(10)                              // the new carrier's +4 capacity covers all 4 new fighters
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(false)
  })
  it('R4.4: a new ship\'s capacity, not just the pre-existing fleet, sets the exact fighter trim', () => {
    const s1 = withTactical(toActionPhase(1, 1), { systemId: 'home-s', step: 'production' })
    const packed = withUnits(s1, 'home-s', 1, ['fighter', 'fighter', 'fighter', 'fighter'])   // 1 existing + 4 more = 5, exactly fills capacity 5 (dreadnought 1 + carrier 4)
    const rich = withPlayer(packed, 1, { tradeGoods: 10 })
    const fightersS = (state: GameState) => state.systems['home-s'].space.filter(u => u.owner === 1 && u.type === 'fighter').length
    expect(fightersS(rich)).toBe(5)
    const r = produce(rich, { dreadnought: 1, fighter: 6 }, [], 10)
    if (!r.ok) throw new Error(r.error)
    // capacity 5 plus the new dreadnought's +1 plus the dock's 3 free slots is 9 total room; 5 existing fighters
    // leave room for exactly 4 of the 6 requested
    expect(fightersS(r.value)).toBe(9)
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(true)
  })
  it('R4.4: the dock\'s free slots admit fighters even when carried infantry already fill the ship capacity', () => {
    const s = producing()
    const dockOnly = s.systems['home-n'].space.filter(u => u.owner !== 0 || u.type === 'dreadnought')   // drop the carrier and starting fighters, keep the capacity-2 dreadnought
    const packed: GameState = { ...s, systems: { ...s.systems, 'home-n': { ...s.systems['home-n'], space: dockOnly } } }
    const withInfantry = withUnits(packed, 'home-n', 0, ['infantry', 'infantry'])   // 2 infantry aboard, exactly filling the dreadnought's capacity of 2
    const withDockII = withTechs(withInfantry, 0, ['space_dock_ii'])
    const r = produce(withDockII, { fighter: 2 }, ['000'])
    if (!r.ok) throw new Error(r.error)
    expect(fighters(r.value)).toBe(2)                               // 0 pre-existing fighters, both new ones ride the free slots, never rejected after trimming
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(false)
  })
  it('R4.4: the reinforcement check runs on the trimmed order, so short fighters trim instead of rejecting', () => {
    // 3 existing plus 3 more: capacity 6 plus the dock's 3 free slots (9 total) leaves room for only 3 more
    const rich = withPlayer(withUnits(producing(), 'home-n', 0, ['fighter', 'fighter', 'fighter']), 0, { tradeGoods: 10 })
    expect(fighters(rich)).toBe(6)
    const short = withPlayer(rich, 0, { reinforcements: { ...rich.players[0].reinforcements, fighter: 3 } })
    const r = produce(short, { fighter: 6 }, [], 3)                 // 6 wanted, 3 in the reinforcements, room for 3
    if (!r.ok) throw new Error(r.error)
    expect(fighters(r.value)).toBe(9)
    expect(r.value.players[0].reinforcements.fighter).toBe(0)
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('not produced'))).toBe(true)
    const shorter = withPlayer(rich, 0, { reinforcements: { ...rich.players[0].reinforcements, fighter: 2 } })
    expect(produce(shorter, { fighter: 3 }, [], 3).ok).toBe(false)   // still short after the trim
  })
  it('R4.4: PDS and space docks cannot be produced in the duel', () => {
    const s = producing()
    expect(produce(s, { pds: 1 }, ['000']).ok).toBe(false)
    expect(produce(s, { spacedock: 1 }, ['000']).ok).toBe(false)
  })
  it('R7: what a production costs adds to the resources spent this round', () => {
    const first = produce(producing(), { infantry: 2 }, ['000'])
    if (!first.ok) throw new Error(first.error)
    expect(first.value.players[0].resourcesSpentThisRound).toBe(1)
    const again = withPlayer(withTactical(first.value, { systemId: 'home-n', step: 'production' }), 0, { tradeGoods: 6 })
    const second = produce(again, { dreadnought: 1, infantry: 4 }, [], 6)
    if (!second.ok) throw new Error(second.error)
    expect(second.value.players[0].resourcesSpentThisRound).toBe(1)
    expect(second.value.players[0].tradeGoodsSpentThisRound).toBe(6)
    expect(second.value.players[0].tradeGoods).toBe(0)
    expect(second.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'dreadnought')).toHaveLength(2)
    expect(second.value.systems['home-n'].planets[0].ground.filter(u => u.owner === 0)).toHaveLength(11)
  })
  it('R4.4: production needs a space dock of your own in the active system and the production step', () => {
    const s = producing()
    expect(produce(withTactical(s, { systemId: 'bereg', step: 'production' }), { infantry: 2 }, ['000']).ok).toBe(false)
    expect(produce(withTactical(s, { systemId: 'home-n', step: 'movement' }), { infantry: 2 }, ['000']).ok).toBe(false)
  })
})
