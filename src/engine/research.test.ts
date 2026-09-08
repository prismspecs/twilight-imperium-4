import { describe, expect, it } from 'vitest'
import { TECHS, techDef } from '../data/techs'
import { canResearch, colourCounts, researchable } from './research'

describe('R5 technology', () => {
  it('has 16 general techs, 7 generic unit upgrades plus 3 faction-named ones (no PDS II, no War Sun), and faction techs', () => {
    expect(TECHS.filter(t => t.kind === 'general')).toHaveLength(16)
    expect(TECHS.filter(t => t.kind === 'upgrade' && t.faction === undefined).map(t => t.id).sort()).toEqual(['carrier_ii', 'cruiser_ii', 'destroyer_ii', 'dreadnought_ii', 'fighter_ii', 'infantry_ii', 'space_dock_ii'])
    expect(TECHS.filter(t => t.kind === 'upgrade' && t.faction !== undefined).map(t => t.id).sort()).toEqual(['advanced_carrier_ii', 'hybrid_crystal_fighter_ii', 'spec_ops_ii'])
    expect(TECHS.filter(t => t.kind === 'faction').map(t => t.id).sort()).toEqual(['bioplasmosis', 'e_res_siphons', 'inheritance_systems', 'l4_disruptors', 'non_euclidean_shielding', 'production_biomes', 'spatial_conduit_cylinder', 'super_dreadnought_ii', 'valefar_assimilator_x', 'valefar_assimilator_y'])
    expect(TECHS.find(t => t.id === 'pds_ii')).toBeUndefined()
    expect(TECHS.find(t => t.id === 'war_sun')).toBeUndefined()     // War Suns need no technology, see R4.4
  })
  it('prerequisites follow the tiers', () => {
    expect(techDef('gravity_drive').prereq).toEqual({ blue: 1 })
    expect(techDef('light_wave_deflector').prereq).toEqual({ blue: 3 })
    expect(techDef('cruiser_ii').prereq).toEqual({ green: 1, yellow: 1, red: 1 })
    expect(techDef('super_dreadnought_ii').prereq).toEqual({ blue: 2, yellow: 1 })
    expect(techDef('l4_disruptors').prereq).toEqual({ yellow: 1 })
  })
  it('colour counts ignore unit upgrades and faction techs without colour', () => {
    expect(colourCounts(['neural_motivator', 'plasma_scoring', 'sarween_tools', 'fighter_ii', 'l4_disruptors'])).toEqual({ blue: 0, red: 1, green: 1, yellow: 2 })
  })
  it('L1Z1X at game start can research the four tier-0 techs still missing plus tier-1 of owned colours', () => {
    const p = { faction: 'l1z1x' as const, techs: ['neural_motivator', 'plasma_scoring'] }
    const r = researchable(p).sort()
    expect(r).toEqual(['antimass_deflectors', 'dacxive_animators', 'magen_defense_grid', 'sarween_tools'])
  })
  it('Cruiser II needs one of each of green, yellow, red', () => {
    const p = { faction: 'l1z1x' as const, techs: ['neural_motivator', 'plasma_scoring', 'sarween_tools'] }
    expect(canResearch(p, 'cruiser_ii')).toBe(true)
    expect(canResearch({ ...p, techs: ['neural_motivator', 'plasma_scoring'] }, 'cruiser_ii')).toBe(false)
  })
  it('faction techs are locked to their faction and L1Z1X replaces Dreadnought II', () => {
    const l = { faction: 'l1z1x' as const, techs: ['antimass_deflectors', 'gravity_drive', 'sarween_tools'] }
    expect(canResearch(l, 'super_dreadnought_ii')).toBe(true)
    expect(canResearch(l, 'dreadnought_ii')).toBe(false)
    expect(canResearch(l, 'l4_disruptors')).toBe(false)
    const b = { faction: 'letnev' as const, techs: ['antimass_deflectors', 'gravity_drive', 'sarween_tools'] }
    expect(canResearch(b, 'dreadnought_ii')).toBe(true)
    expect(canResearch(b, 'super_dreadnought_ii')).toBe(false)
    expect(canResearch(b, 'inheritance_systems')).toBe(false)
  })
  it('Sol replaces Infantry II and Carrier II with its own named upgrades; Naalu replaces Fighter II', () => {
    const sol = { faction: 'sol' as const, techs: ['neural_motivator', 'dacxive_animators', 'hyper_metabolism', 'antimass_deflectors', 'gravity_drive'] }
    expect(canResearch(sol, 'spec_ops_ii')).toBe(true)
    expect(canResearch(sol, 'infantry_ii')).toBe(false)
    expect(canResearch(sol, 'advanced_carrier_ii')).toBe(true)
    expect(canResearch(sol, 'carrier_ii')).toBe(false)
    expect(canResearch(sol, 'hybrid_crystal_fighter_ii')).toBe(false)   // a different faction's slot

    const letnev = { faction: 'letnev' as const, techs: ['neural_motivator', 'dacxive_animators'] }
    expect(canResearch(letnev, 'spec_ops_ii')).toBe(false)
    expect(canResearch(letnev, 'infantry_ii')).toBe(true)   // unaffected: this is not their slot to lose

    const naalu = { faction: 'naalu' as const, techs: ['neural_motivator', 'antimass_deflectors'] }
    expect(canResearch(naalu, 'hybrid_crystal_fighter_ii')).toBe(true)
    expect(canResearch(naalu, 'fighter_ii')).toBe(false)
  })
  it('ignorePrereqs (Inheritance Systems) skips colour requirements but not ownership', () => {
    const l = { faction: 'l1z1x' as const, techs: ['neural_motivator'] }
    expect(canResearch(l, 'cruiser_ii', true)).toBe(true)          // green met, yellow and red missing
    expect(canResearch(l, 'neural_motivator', true)).toBe(false)
  })
  it('an unknown tech id cannot be researched instead of throwing', () => {
    const p = { faction: 'l1z1x' as const, techs: [] as string[] }
    expect(canResearch(p, 'nonsense')).toBe(false)
    expect(canResearch(p, 'nonsense', true)).toBe(false)
  })
})
