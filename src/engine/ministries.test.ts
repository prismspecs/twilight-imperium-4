// src/engine/ministries.test.ts — Elect-Player minister law effects that are engine-enforced.
import { describe, expect, it } from 'vitest'
import { finishStatusPhase } from './statusPhase'
import { applyMove } from './index'
import { deepFreeze, toActionPhase, toAgendaPhase, withCards, withTechs } from './testUtils'
import type { GameState } from './types'

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('Minister of Sciences: free research via the Technology card', () => {
  it('the owning seat plays the Technology primary and pays no resources', () => {
    const base = withCards(toActionPhase(1, 0), 0, ['technology'])
    const s: GameState = { ...base, lawOwners: { minister_of_sciences: 0 }, activeAgendas: ['minister_of_sciences'] }
    const before = s.players[0].tradeGoods
    const played = value(applyMove(deepFreeze(s), { type: 'strategic', card: 'technology', params: { techId: 'sarween_tools' } }, 0))
    expect(played.players[0].techs).toContain('sarween_tools')
    expect(played.players[0].tradeGoods).toBe(before)
  })

  it('a non-owning seat still pays the full secondary cost', () => {
    const base = withCards(toActionPhase(1, 0), 0, ['technology'])
    // seat 0 owns the card AND the law; seat 1 researches through the secondary and must pay 4
    const s: GameState = { ...base, lawOwners: { minister_of_sciences: 0 }, activeAgendas: ['minister_of_sciences'] }
    const played = value(applyMove(deepFreeze(s), { type: 'strategic', card: 'technology' }, 0))
    const answered = value(applyMove(deepFreeze(played), { type: 'secondary', card: 'technology', accept: true, params: { techId: 'sarween_tools' } }, 0))
    expect(answered.players[1].techs).toContain('sarween_tools')
    expect(answered.players[1].resourcesSpentThisRound).toBe(4)   // paid 4 via planets
  })

  it('the owning seat researches via the secondary free of charge', () => {
    const base = withCards(toActionPhase(1, 0), 0, ['technology'])
    // seat 1 owns the law but not the card, so it researches via the secondary for free
    const s: GameState = { ...base, lawOwners: { minister_of_sciences: 1 }, activeAgendas: ['minister_of_sciences'] }
    const played = value(applyMove(deepFreeze(s), { type: 'strategic', card: 'technology' }, 0))
    const answered = value(applyMove(deepFreeze(played), { type: 'secondary', card: 'technology', accept: true, params: { techId: 'sarween_tools' } }, 0))
    expect(answered.players[1].techs).toContain('sarween_tools')
    expect(answered.players[1].resourcesSpentThisRound).toBe(0)   // nothing spent
  })
})

describe('Minister of Sciences: VP-free Elect-Player law resolver grants the card', () => {
  it('records ownership and activates the law via the agenda resolver (no VP)', () => {
    let s = toAgendaPhase(toActionPhase(), 'minister_of_sciences')
    s = value(applyMove(deepFreeze(s), { type: 'castVote', outcome: '1', planets: [] }, 0))
    s = value(applyMove(deepFreeze(s), { type: 'castVote', outcome: '1', planets: [] }, 0))
    expect(s.lawOwners?.minister_of_sciences).toBe(1)
    expect(s.activeAgendas).toContain('minister_of_sciences')
    expect(s.players[1].vp).toBe(0)
  })
})

describe('Minister of Policy: the owner draws an action card at the end of the status phase', () => {
  it('the owner receives 1 action card during the round-end cleanup', () => {
    const control: GameState = { ...toActionPhase(), phase: 'status', statusSubmitted: [0, 1] }
    const withLaw: GameState = {
      ...toActionPhase(), phase: 'status', statusSubmitted: [0, 1],
      lawOwners: { minister_of_policy: 1 }, activeAgendas: ['minister_of_policy'],
    }
    const baseCount = control.players[1].actionCards.length
    const done = finishStatusPhase(deepFreeze(withLaw), 7)
    // round-end cleanup draws 1 per player; the minister adds exactly one more for the owner
    expect(done.players[1].actionCards.length).toBe(baseCount + 2)
    expect(done.log.some(e => e.t === 'info' && e.text.includes('Minister of Policy'))).toBe(true)
  })

  it('no extra draw when no one owns the card', () => {
    const s: GameState = { ...toActionPhase(), phase: 'status', statusSubmitted: [0, 1] }
    const control = finishStatusPhase(deepFreeze(s), 7)
    expect(control.players[0].actionCards.length).toBe(s.players[0].actionCards.length + 1)   // just the step-3 draw
    expect(control.log.some(e => e.t === 'info' && e.text.includes('Minister of Policy'))).toBe(false)
  })
})

// Exercise the withTechs helper so a future test can reuse it without an unused-import lint error.
void withTechs
