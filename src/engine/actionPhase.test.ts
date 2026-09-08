import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { cardsUsed, deepFreeze, toActionPhase, withPlayer, withTechs, withUnits } from './testUtils'
import type { GameState, Seat } from './types'

const start = (state: GameState, systemId: string) => applyMove(deepFreeze(state), { type: 'startTactical', systemId }, 0)

describe('R3.2 action phase', () => {
  it('R3.2: activation spends a tactic token, marks the system and opens the movement step', () => {
    const s = toActionPhase()
    const r = start(s, 'bereg')
    if (!r.ok) throw new Error(r.error)
    expect(r.value.players[0].tokens.tactic).toBe(2)
    expect(r.value.systems.bereg.activatedBy).toEqual([0])
    expect(r.value.tactical).toEqual({ systemId: 'bereg', step: 'movement' })
    expect(s.players[0].tokens.tactic).toBe(3)   // input not mutated
  })
  it('R3.2: a system that already contains your own command token cannot be activated', () => {
    const base = toActionPhase()
    const s: GameState = { ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, activatedBy: [0 as Seat] } } }
    expect(start(s, 'bereg').ok).toBe(false)
    expect(start(s, 'quann').ok).toBe(true)
    const home: GameState = { ...base, systems: { ...base.systems, 'home-n': { ...base.systems['home-n'], activatedBy: [0 as Seat] } } }
    expect(start(home, 'home-n').ok).toBe(false)   // the home system is not an exception
  })
  it('R3.2: activation needs a tactic token and no running tactical action', () => {
    const base = toActionPhase()
    const broke = withPlayer(base, 0, { tokens: { tactic: 0, fleet: 3, strategy: 2 } })
    expect(start(broke, 'bereg').ok).toBe(false)
    const running: GameState = { ...base, tactical: { systemId: 'bereg', step: 'movement' } }
    expect(start(running, 'quann').ok).toBe(false)
  })
  it('R3.2: a player may not pass while holding an unused strategy card', () => {
    const s = toActionPhase()
    expect(applyMove(s, { type: 'pass' }, 0).ok).toBe(false)
    expect(applyMove(cardsUsed(s), { type: 'pass' }, 0).ok).toBe(true)
  })
  it('R3.2: after one pass the other player continues; when both have passed the status phase begins', () => {
    const s = cardsUsed(toActionPhase())
    const first = applyMove(s, { type: 'pass' }, 0)
    if (!first.ok) throw new Error(first.error)
    expect(first.value.players[0].passed).toBe(true)
    expect(first.value.active).toBe(1)
    expect(first.value.phase).toBe('action')
    const second = applyMove(first.value, { type: 'pass' }, 0)
    if (!second.ok) throw new Error(second.error)
    expect(second.value.phase).toBe('status')
    expect(second.value.active).toBe(second.value.speaker)
  })
  it('R3.2: ending the turn after a finished action gives the other seat the turn, unless it has passed', () => {
    const base = toActionPhase()
    const done: GameState = { ...base, tactical: { systemId: 'bereg', step: 'done' } }
    const spent = applyMove(deepFreeze(done), { type: 'endTactical' }, 0)
    if (!spent.ok) throw new Error(spent.error)
    const r = applyMove(spent.value, { type: 'endTurn' }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.tactical).toBeNull()
    expect(r.value.active).toBe(1)
    const alone = withPlayer(spent.value, 1, { passed: true })
    const r2 = applyMove(alone, { type: 'endTurn' }, 0)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.value.active).toBe(0)         // the opponent has passed, so the turn comes straight back
    expect(r2.value.turnDone).toBe(false)   // and it is a fresh turn
  })
  it('endTactical is rejected while the tactical action is unfinished and allowed from the production step', () => {
    const base = toActionPhase()
    expect(applyMove({ ...base, tactical: { systemId: 'bereg', step: 'movement' } }, { type: 'endTactical' }, 0).ok).toBe(false)
    expect(applyMove({ ...base, tactical: { systemId: 'bereg', step: 'production' } }, { type: 'endTactical' }, 0).ok).toBe(true)
    expect(applyMove(base, { type: 'endTactical' }, 0).ok).toBe(false)
  })
  it('R3.2: ending the tactical action ends the action, not the turn', () => {
    const base = toActionPhase()
    const done: GameState = { ...base, tactical: { systemId: 'bereg', step: 'done' } }
    const r = applyMove(deepFreeze(done), { type: 'endTactical' }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.tactical).toBeNull()
    expect(r.value.active).toBe(0)          // the acting seat keeps the turn
    expect(r.value.turnDone).toBe(true)
    const moves = legalMoves(r.value)
    expect(moves).toContainEqual({ type: 'endTurn' })
    expect(moves.some(m => m.type === 'startTactical')).toBe(false)
    const ended = applyMove(r.value, { type: 'endTurn' }, 0)
    if (!ended.ok) throw new Error(ended.error)
    expect(ended.value.active).toBe(1)
    expect(ended.value.turnDone).toBe(false)
  })
  it('legal moves without a running tactical action are the activations plus pass', () => {
    const s = toActionPhase()
    expect(legalMoves(s).filter(m => m.type === 'startTactical')).toHaveLength(7)
    expect(legalMoves(s).some(m => m.type === 'pass')).toBe(false)
    expect(legalMoves(cardsUsed(s)).some(m => m.type === 'pass')).toBe(true)
    expect(legalMoves(withPlayer(s, 0, { passed: true }))).toEqual([])
    expect(legalMoves({ ...s, tactical: { systemId: 'bereg', step: 'done' } })).toEqual([{ type: 'endTactical' }])
  })
  it('R5 Jol-Nar faction tech E-Res Siphons: activating a system with a bystander\'s ship grants them 4 trade goods', () => {
    let s = withTechs(toActionPhase(), 1, ['e_res_siphons'])
    s = withUnits(s, 'bereg', 1, ['destroyer'])
    const before = s.players[1].tradeGoods
    const r = applyMove(deepFreeze(s), { type: 'startTactical', systemId: 'bereg' }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.players[1].tradeGoods).toBe(before + 4)
    expect(r.value.log.some(e => e.t === 'info' && e.text.includes('E-Res Siphons'))).toBe(true)
    // no ship of the owner's in the activated system: nothing triggers
    const empty = applyMove(deepFreeze(withTechs(toActionPhase(), 1, ['e_res_siphons'])), { type: 'startTactical', systemId: 'bereg' }, 0)
    if (!empty.ok) throw new Error(empty.error)
    expect(empty.value.players[1].tradeGoods).toBe(before)
  })
})
