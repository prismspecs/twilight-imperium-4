// src/engine/board.test.ts
import { describe, expect, it } from 'vitest'
import { freeFighterSlots, rollRevival } from './board'
import { toActionPhase, withPlayer, withUnits } from './testUtils'

describe('freeFighterSlots', () => {
  it('R4.4: a space dock (I or II) grants 3 free fighter slots regardless of technology', () => {
    const base = toActionPhase()
    expect(base.players[0].techs.includes('space_dock_ii')).toBe(false)   // starting techs only, no upgrade
    const withDock = withUnits(base, 'bereg', 0, ['spacedock'], 'bereg')
    expect(freeFighterSlots(withDock, 0, 'bereg')).toBe(3)
  })
  it('R4.4: no dock of the seat\'s own in the system grants no free slots', () => {
    const base = toActionPhase()
    expect(freeFighterSlots(base, 0, 'bereg')).toBe(0)
  })
  it('R4.4: a dock owned by the other seat grants no free slots', () => {
    const base = toActionPhase()
    const withOtherDock = withUnits(base, 'bereg', 1, ['spacedock'], 'bereg')
    expect(freeFighterSlots(withOtherDock, 0, 'bereg')).toBe(0)
  })
})

describe('rollRevival', () => {
  const destroyed = [{ id: 1, type: 'infantry' as const, owner: 0 as const, damaged: false }]

  it('Sol\'s Spec Ops II returns a destroyed infantry on a 5, one better than generic Infantry II\'s 6', () => {
    const sol = withPlayer(toActionPhase(), 0, { faction: 'sol', techs: ['spec_ops_ii'] })
    // seed 15: the die lands on exactly 5, which generic Infantry II's 6-to-return would miss
    const revived = rollRevival(sol, destroyed, 15)
    const roll = revived.log.find(e => e.t === 'roll' && e.owner === 0)
    expect(roll?.t === 'roll' && roll.rolls[0]).toMatchObject({ value: 5, hit: true })
    expect(revived.players[0].pendingInfantry).toBe(1)

    const withGeneric = withPlayer(toActionPhase(), 0, { faction: 'sol', techs: ['infantry_ii'] })
    const notRevived = rollRevival(withGeneric, destroyed, 15)
    const plainRoll = notRevived.log.find(e => e.t === 'roll' && e.owner === 0)
    expect(plainRoll?.t === 'roll' && plainRoll.rolls[0]).toMatchObject({ value: 5, hit: false })
    expect(notRevived.players[0].pendingInfantry).toBe(0)
  })

  it('rolls nothing for a seat with neither technology', () => {
    const base = toActionPhase()
    const next = rollRevival(base, destroyed, 15)
    expect(next).toBe(base)   // no log entry, no state change at all
  })
})
