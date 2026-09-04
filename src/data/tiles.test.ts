import { describe, expect, it } from 'vitest'
import { FACTIONS } from './factions'
import { CREUSS_GATE, GALAXY_TILES, HOME_TILES, MECATOL_TILE, TILES, homeTileFor, tileByNumber } from './tiles'
import type { FactionId } from '../engine/types'

const count = <T,>(xs: readonly T[], pred: (x: T) => boolean): number => xs.filter(pred).length

describe('base-game tile catalogue', () => {
  it('holds all 51 base-game tiles with the right category mix', () => {
    expect(TILES).toHaveLength(51)
    expect(count(TILES, t => t.category === 'home')).toBe(16)
    expect(count(TILES, t => t.category === 'home_gate')).toBe(1)   // Creuss Gate, tile 17
    expect(count(TILES, t => t.category === 'home_offboard')).toBe(1) // Creuss, tile 51
    expect(count(TILES, t => t.category === 'mecatol_rex')).toBe(1)
    expect(count(TILES, t => t.category === 'blue_planet')).toBe(20)
    expect(count(TILES, t => t.category === 'red_anomaly_or_empty')).toBe(12)
    expect(count(TILES, t => t.back === 'green')).toBe(18)
    expect(count(TILES, t => t.back === 'blue')).toBe(21)  // Mecatol + 20 planet tiles
    expect(count(TILES, t => t.back === 'red')).toBe(12)
  })

  it('every one of the 17 base factions has exactly one home tile', () => {
    expect(HOME_TILES).toHaveLength(17)
    const factions = Object.keys(FACTIONS) as FactionId[]
    expect(factions).toHaveLength(17)
    for (const faction of factions) {
      const tile = homeTileFor(faction)
      expect(tile, `home tile for ${faction}`).toBeDefined()
      expect(tile?.faction).toBe(faction)
      expect(tile?.planets.every(p => p.homeOf === faction)).toBe(true)
    }
    expect(count(HOME_TILES, t => t.faction !== null)).toBe(17)
  })

  it('known tiles: l1z1x home, Creuss Gate wormhole, Mecatol, Jord', () => {
    expect(tileByNumber(6).faction).toBe('l1z1x')
    expect(tileByNumber(6).planets[0]).toMatchObject({ id: '0.0.0', resources: 5, influence: 0 })
    expect(CREUSS_GATE).toMatchObject({ tile: 17, faction: 'creuss', wormholes: ['delta'], planets: [] })
    expect(MECATOL_TILE.planets[0]).toMatchObject({ id: 'mr', resources: 1, influence: 6 })
    expect(tileByNumber(1).planets[0]).toMatchObject({ id: 'jord', homeOf: 'sol' })
  })

  it('wormhole and anomaly totals match the base game box', () => {
    const wormholes = TILES.flatMap(t => t.wormholes)
    expect(count(wormholes, w => w === 'alpha')).toBe(2)
    expect(count(wormholes, w => w === 'beta')).toBe(2)
    expect(count(wormholes, w => w === 'delta')).toBe(2)
    const anomalies = TILES.flatMap(t => t.anomalies)
    expect(count(anomalies, a => a === 'asteroid_field')).toBe(2)
    expect(count(anomalies, a => a === 'nebula')).toBe(1)
    expect(count(anomalies, a => a === 'gravity_rift')).toBe(1)
    expect(count(anomalies, a => a === 'supernova')).toBe(1)
  })

  it('the galaxy deck is the 20 blue planet tiles plus the 12 red tiles', () => {
    expect(GALAXY_TILES).toHaveLength(32)
    expect(GALAXY_TILES.every(t => t.category === 'blue_planet' || t.category === 'red_anomaly_or_empty')).toBe(true)
    expect(GALAXY_TILES.some(t => t.planets.length > 1)).toBe(true) // e.g. New Albion / Starpoint
    expect(GALAXY_TILES.some(t => t.anomalies.length > 0)).toBe(true)
  })
})
