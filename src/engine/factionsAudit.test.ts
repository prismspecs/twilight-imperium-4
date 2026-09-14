import { describe, expect, it } from 'vitest'
import { FACTIONS } from '../data/factions'
import { FLAGSHIP_INFO } from '../data/flagships'
import { TECHS } from '../data/techs'
import { excludesGenericUpgrade, unitStats } from '../data/units'
import { fulfils } from './objectives'
import { createGame } from './setup'
import type { FactionId, GameConfig, GameState } from './types'

const ALL_17_FACTIONS: FactionId[] = [
  'arborec', 'letnev', 'saar', 'muaat', 'hacan', 'sol', 'creuss', 'l1z1x',
  'mentak', 'naalu', 'nekro', 'sardakk', 'jolnar', 'winnu', 'xxcha', 'yin', 'yssaril',
]

describe('TI4 17 Factions Specification Audit', () => {
  it('all 17 base-game factions have complete definitions and commodities', () => {
    expect(Object.keys(FACTIONS).sort()).toEqual(ALL_17_FACTIONS.slice().sort())
    for (const fid of ALL_17_FACTIONS) {
      const f = FACTIONS[fid]
      expect(f.id).toBe(fid)
      expect(f.name.length).toBeGreaterThan(0)
      expect(f.commodityValue).toBeGreaterThanOrEqual(2)
      expect(f.commodityValue).toBeLessThanOrEqual(6)
      expect(Array.isArray(f.startingTechs)).toBe(true)
      expect(f.startingUnits.length).toBeGreaterThan(0)
      expect(f.abilities.length).toBeGreaterThan(0)
    }
  })

  it('Hacan has correct starting units with 2 infantry on Arretze and 1 on Hercant and Kamdorn', () => {
    const hacan = FACTIONS.hacan
    const inf0 = hacan.startingUnits.find(u => u.type === 'infantry' && u.planetIndex === 0)
    const inf1 = hacan.startingUnits.find(u => u.type === 'infantry' && u.planetIndex === 1)
    const inf2 = hacan.startingUnits.find(u => u.type === 'infantry' && u.planetIndex === 2)
    const dock = hacan.startingUnits.find(u => u.type === 'spacedock' && u.planetIndex === 1)

    expect(inf0?.count).toBe(1) // Hercant
    expect(inf1?.count).toBe(2) // Arretze (home capital with space dock)
    expect(inf2?.count).toBe(1) // Kamdorn
    expect(dock?.count).toBe(1) // Space dock on Arretze
  })

  it('all 17 factions have non-empty flagship info and stats', () => {
    for (const fid of ALL_17_FACTIONS) {
      const info = FLAGSHIP_INFO[fid]
      expect(info, `Flagship info missing for ${fid}`).toBeDefined()
      expect(info.name.length).toBeGreaterThan(0)
      expect(info.ability.trim().length, `Ability empty for ${fid}`).toBeGreaterThan(0)

      const stats = unitStats('flagship', { faction: fid, techs: [] })
      expect(stats.cost).toBe(8)
      expect(stats.sustain).toBe(true)
      expect(stats.combat).not.toBeNull()
    }
    // Saar's Son of Ragh specifically has AFB text
    expect(FLAGSHIP_INFO.saar.name).toBe('Son of Ragh')
    expect(FLAGSHIP_INFO.saar.ability).toContain('Anti-Fighter Barrage')
  })

  it('every faction has exactly 2 faction technologies in TECHS (34 total across all 17)', () => {
    for (const fid of ALL_17_FACTIONS) {
      const factionTechs = TECHS.filter(t => t.faction === fid)
      expect(factionTechs, `Expected 2 faction techs for ${fid}`).toHaveLength(2)
    }

    const allFactionTechs = TECHS.filter(t => t.faction !== undefined)
    expect(allFactionTechs).toHaveLength(34)

    // 8 are faction unit upgrades, 26 are ability techs
    expect(allFactionTechs.filter(t => t.kind === 'upgrade')).toHaveLength(8)
    expect(allFactionTechs.filter(t => t.kind === 'faction')).toHaveLength(26)
  })

  it('faction unit upgrades exclude generic upgrades, and Saar excludes space dock II', () => {
    expect(excludesGenericUpgrade('infantry', 'sol')).toBe(true)
    expect(excludesGenericUpgrade('carrier', 'sol')).toBe(true)
    expect(excludesGenericUpgrade('infantry', 'arborec')).toBe(true)
    expect(excludesGenericUpgrade('fighter', 'naalu')).toBe(true)
    expect(excludesGenericUpgrade('dreadnought', 'l1z1x')).toBe(true)
    expect(excludesGenericUpgrade('dreadnought', 'sardakk')).toBe(true)
    expect(excludesGenericUpgrade('warsun', 'muaat')).toBe(true)
    expect(excludesGenericUpgrade('spacedock', 'saar')).toBe(true)

    // Standard factions do not exclude generic upgrades
    expect(excludesGenericUpgrade('infantry', 'letnev')).toBe(false)
    expect(excludesGenericUpgrade('dreadnought', 'letnev')).toBe(false)
    expect(excludesGenericUpgrade('carrier', 'letnev')).toBe(false)
    expect(excludesGenericUpgrade('warsun', 'letnev')).toBe(false)
  })

  it('Muaat Prototype War Sun has move 1 initially, and move 3 with cost 10 when upgraded', () => {
    const unupgraded = unitStats('warsun', { faction: 'muaat', techs: [] })
    expect(unupgraded.cost).toBe(12)
    expect(unupgraded.move).toBe(1)
    expect(unupgraded.combat).toBe(3)
    expect(unupgraded.combatDice).toBe(3)

    const upgraded = unitStats('warsun', { faction: 'muaat', techs: ['prototype_war_sun_ii'] })
    expect(upgraded.cost).toBe(10)
    expect(upgraded.move).toBe(3)
    expect(upgraded.combat).toBe(3)
    expect(upgraded.combatDice).toBe(3)
  })

  it('Arborec infantry has production 1 initially, and combat 7 / production 2 when upgraded', () => {
    const unupgraded = unitStats('infantry', { faction: 'arborec', techs: [] })
    expect(unupgraded.combat).toBe(8)
    expect(unupgraded.production).toBe(1)

    const upgraded = unitStats('infantry', { faction: 'arborec', techs: ['letani_warrior_ii'] })
    expect(upgraded.combat).toBe(7)
    expect(upgraded.production).toBe(2)
  })

  it('secret objective Adapt New Strategies (ans) scores for factions with unit upgrades and ability techs', () => {
    const mockState = (faction: FactionId, techs: string[]): GameState => {
      const cfg: GameConfig = {
        players: [{ faction, color: 'blue', name: 'Test' }, { faction: 'letnev', color: 'red', name: 'Other' }],
        speaker: 0,
      }
      const s = createGame(cfg, 100)
      s.players[0] = { ...s.players[0], techs, secretObjectives: ['ans'] }
      return s
    }

    // Sol with 2 faction unit upgrades
    const solState = mockState('sol', ['spec_ops_ii', 'advanced_carrier_ii'])
    expect(fulfils(solState, 0, 'ans')).toBe(true)

    // Sol with only 1 faction upgrade
    const solIncomplete = mockState('sol', ['spec_ops_ii'])
    expect(fulfils(solIncomplete, 0, 'ans')).toBe(false)

    // Letnev with 2 faction ability techs
    const letnevState = mockState('letnev', ['l4_disruptors', 'non_euclidean_shielding'])
    expect(fulfils(letnevState, 0, 'ans')).toBe(true)

    // L1Z1X with 1 ability tech and 1 faction unit upgrade
    const l1z1xState = mockState('l1z1x', ['inheritance_systems', 'super_dreadnought_ii'])
    expect(fulfils(l1z1xState, 0, 'ans')).toBe(true)
  })
})
