import { describe, expect, it } from 'vitest'
import { generateGalaxy, generatedHomeId, type GalaxyHome, type GeneratedSystem } from './galaxy'
import { GALAXY_TILES } from '../data/tiles'
import type { FactionId, Seat } from './types'

const SIX: FactionId[] = ['l1z1x', 'letnev', 'sol', 'saar', 'hacan', 'mentak']

function homesFor(factions: readonly FactionId[]): GalaxyHome[] {
  return factions.map((faction, seat) => ({ seat: seat as Seat, faction }))
}

function byId(galaxy: readonly GeneratedSystem[]): Map<string, GeneratedSystem> {
  return new Map(galaxy.map(s => [s.id, s]))
}

function homes(galaxy: readonly GeneratedSystem[]): GeneratedSystem[] {
  return galaxy.filter(s => s.home !== null)
}

function galaxyTiles(galaxy: readonly GeneratedSystem[]): GeneratedSystem[] {
  return galaxy.filter(s => s.id !== 'mecatol' && s.home === null)
}

describe('generateGalaxy', () => {
  it('builds the full 37-tile radius-3 hex for six players', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 1)
    expect(galaxy).toHaveLength(37)
    expect(homes(galaxy)).toHaveLength(6)
    expect(galaxyTiles(galaxy)).toHaveLength(30)
    const mecatol = byId(galaxy).get('mecatol')
    expect(mecatol).toMatchObject({ q: 0, r: 0, home: null })
  })

  it('scales the board and home count for 3, 4 and 5 players', () => {
    expect(generateGalaxy(homesFor(SIX.slice(0, 3)), 1)).toHaveLength(34)  // 37 - 3 removed corners
    expect(homes(generateGalaxy(homesFor(SIX.slice(0, 3)), 1))).toHaveLength(3)
    expect(galaxyTiles(generateGalaxy(homesFor(SIX.slice(0, 3)), 1))).toHaveLength(30)

    expect(generateGalaxy(homesFor(SIX.slice(0, 4)), 1)).toHaveLength(37)
    expect(homes(generateGalaxy(homesFor(SIX.slice(0, 4)), 1))).toHaveLength(4)
    expect(galaxyTiles(generateGalaxy(homesFor(SIX.slice(0, 4)), 1))).toHaveLength(32)  // whole deck

    expect(generateGalaxy(homesFor(SIX.slice(0, 5)), 1)).toHaveLength(37)
    expect(galaxyTiles(generateGalaxy(homesFor(SIX.slice(0, 5)), 1))).toHaveLength(31)
  })

  it('rejects unsupported player counts', () => {
    expect(() => generateGalaxy(homesFor(SIX.slice(0, 2)), 1)).toThrow()
    expect(() => generateGalaxy(homesFor([...SIX, 'nekro']), 1)).toThrow()
  })

  it('places each faction home at a corner with its real planets', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 7)
    const map = byId(galaxy)
    const sol = map.get(generatedHomeId(2))
    expect(sol?.home).toBe(2)
    expect(sol?.planets).toEqual([{ id: 'jord', name: 'Jord', resources: 4, influence: 2 }])
    // every home sits on a ring-3 corner (hex distance 3 from the centre)
    for (const h of homes(galaxy)) {
      const dist = (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r)) / 2
      expect(dist).toBe(3)
      // a corner cell has exactly three on-board hex neighbours
      expect(h.neighbours).toHaveLength(3)
    }
  })

  it('gives Mecatol exactly the six ring-1 neighbours', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 1)
    const mecatol = byId(galaxy).get('mecatol')
    expect(mecatol?.neighbours).toHaveLength(6)
  })

  it('hex adjacency is symmetric and every neighbour exists', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 3)
    const map = byId(galaxy)
    for (const s of galaxy) {
      for (const nid of s.neighbours) {
        const other = map.get(nid)
        expect(other, `neighbour ${nid} of ${s.id}`).toBeDefined()
        expect(other?.neighbours).toContain(s.id)
      }
    }
  })

  it('uses each galaxy tile at most once', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 5)
    const numbers = galaxyTiles(galaxy).map(s => s.tile)
    expect(new Set(numbers).size).toBe(numbers.length)
    // every galaxy tile comes from the catalogue deck
    const deckNumbers = new Set(GALAXY_TILES.map(t => String(t.tile)))
    for (const num of numbers) expect(deckNumbers.has(num)).toBe(true)
  })

  it('is deterministic in the seed', () => {
    const players = homesFor(SIX)
    expect(generateGalaxy(players, 42)).toEqual(generateGalaxy(players, 42))
    const a = generateGalaxy(players, 1)
    const b = generateGalaxy(players, 2)
    // home placement is seed-independent, but the dealt galaxy tiles differ
    expect(galaxyTiles(a).map(s => s.id)).not.toEqual(galaxyTiles(b).map(s => s.id))
    expect(homes(a).map(s => s.id).sort()).toEqual(homes(b).map(s => s.id).sort())
  })

  it('wormhole tiles keep their wormhole type for runtime linking', () => {
    const galaxy = generateGalaxy(homesFor(SIX), 9)
    const withWormhole = galaxy.filter(s => s.wormhole !== null)
    for (const s of withWormhole) expect(['alpha', 'beta', 'delta']).toContain(s.wormhole)
  })
})
