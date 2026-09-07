import { describe, expect, it } from 'vitest'
import { unitStats } from './units'

const l1z1x = { faction: 'l1z1x' as const, techs: [] as string[] }
const letnev = { faction: 'letnev' as const, techs: [] as string[] }

describe('unit stats (R1 components)', () => {
  it('generic level I stats match the reference table', () => {
    expect(unitStats('fighter', letnev)).toMatchObject({ cost: 1, producedPerCost: 2, combat: 9, move: 0, capacity: 0 })
    expect(unitStats('destroyer', letnev)).toMatchObject({ cost: 1, combat: 9, move: 2, afb: { value: 9, dice: 2 } })
    expect(unitStats('cruiser', letnev)).toMatchObject({ cost: 2, combat: 7, move: 2, capacity: 0 })
    expect(unitStats('carrier', letnev)).toMatchObject({ cost: 3, combat: 9, move: 1, capacity: 4 })
    expect(unitStats('dreadnought', letnev)).toMatchObject({ cost: 4, combat: 5, move: 1, capacity: 1, sustain: true, bombardment: { value: 5, dice: 1 } })
    expect(unitStats('warsun', letnev)).toMatchObject({ cost: 12, combat: 3, combatDice: 3, move: 2, capacity: 6, sustain: true })
    expect(unitStats('infantry', letnev)).toMatchObject({ cost: 1, producedPerCost: 2, combat: 8 })
    expect(unitStats('pds', letnev)).toMatchObject({ spaceCannon: { value: 6, dice: 1 }, planetaryShield: true })
    expect(unitStats('spacedock', letnev)).toMatchObject({ production: 2 })
  })
  it('level II upgrades change the stats', () => {
    const t = { faction: 'letnev' as const, techs: ['fighter_ii', 'destroyer_ii', 'cruiser_ii', 'carrier_ii', 'dreadnought_ii', 'infantry_ii', 'space_dock_ii'] }
    expect(unitStats('fighter', t)).toMatchObject({ combat: 8, move: 2 })
    expect(unitStats('destroyer', t)).toMatchObject({ combat: 8, afb: { value: 6, dice: 3 } })
    expect(unitStats('cruiser', t)).toMatchObject({ combat: 6, move: 3, capacity: 1 })
    expect(unitStats('carrier', t)).toMatchObject({ move: 2, capacity: 6 })
    expect(unitStats('dreadnought', t)).toMatchObject({ move: 2 })
    expect(unitStats('infantry', t)).toMatchObject({ combat: 7 })
    expect(unitStats('spacedock', t)).toMatchObject({ production: 4 })
  })
  it('L1Z1X dreadnoughts are super-dreadnoughts', () => {
    expect(unitStats('dreadnought', l1z1x)).toMatchObject({ cost: 4, combat: 5, move: 1, capacity: 2, bombardment: { value: 5, dice: 1 } })
    expect(unitStats('dreadnought', { ...l1z1x, techs: ['super_dreadnought_ii'] })).toMatchObject({ combat: 4, move: 2, capacity: 2, bombardment: { value: 4, dice: 1 } })
    expect(unitStats('dreadnought', { ...l1z1x, techs: ['dreadnought_ii'] })).toMatchObject({ combat: 5, move: 1 })
  })
  it('flagships are faction specific', () => {
    expect(unitStats('flagship', l1z1x)).toMatchObject({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 5, sustain: true, bombardment: null })
    expect(unitStats('flagship', letnev)).toMatchObject({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true, bombardment: { value: 5, dice: 3 } })
  })
  it('guardian units use generic level I stats', () => {
    expect(unitStats('dreadnought', 'guardian')).toMatchObject({ combat: 5, capacity: 1 })
  })
  it('a faction with its own named unit upgrade uses its own stats, not the generic II ones', () => {
    const sol = { faction: 'sol' as const, techs: [] as string[] }
    expect(unitStats('infantry', sol)).toMatchObject({ cost: 1, combat: 8 })
    expect(unitStats('infantry', { ...sol, techs: ['spec_ops_ii'] })).toMatchObject({ cost: 1, combat: 6 })
    expect(unitStats('carrier', { ...sol, techs: ['advanced_carrier_ii'] })).toMatchObject({ move: 2, capacity: 8, sustain: true })

    const naalu = { faction: 'naalu' as const, techs: [] as string[] }
    expect(unitStats('fighter', naalu)).toMatchObject({ combat: 9, move: 0 })
    expect(unitStats('fighter', { ...naalu, techs: ['hybrid_crystal_fighter_ii'] })).toMatchObject({ combat: 7, move: 2 })
  })
})
