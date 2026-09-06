import { describe, expect, it } from 'vitest'
import { generateSlices, calculateSliceMetrics } from './sliceGenerator'
import { GALAXY_TILES } from '../../data/tiles'

describe('Milty Draft sliceGenerator', () => {
  it('generates the requested number of slices with 5 tiles each (3 blue, 2 red)', () => {
    const slices = generateSlices(4, 12345)
    expect(slices).toHaveLength(4)

    const allUsedTileNumbers = new Set<number>()
    for (const slice of slices) {
      expect(slice.tiles).toHaveLength(5)
      expect(slice.tileIds).toHaveLength(5)
      const blues = slice.tiles.filter(t => t.back === 'blue' || t.category === 'blue_planet')
      const reds = slice.tiles.filter(t => t.back === 'red' || t.category === 'red_anomaly_or_empty')
      expect(blues).toHaveLength(3)
      expect(reds).toHaveLength(2)

      for (const t of slice.tiles) {
        expect(allUsedTileNumbers.has(t.tile)).toBe(false)
        allUsedTileNumbers.add(t.tile)
      }
    }
  })

  it('is deterministic given the same seed', () => {
    const slices1 = generateSlices(5, 42)
    const slices2 = generateSlices(5, 42)
    expect(slices1.map(s => s.tileIds)).toEqual(slices2.map(s => s.tileIds))
  })

  it('produces different slices given different seeds', () => {
    const slices1 = generateSlices(4, 100)
    const slices2 = generateSlices(4, 200)
    expect(slices1.map(s => s.tileIds)).not.toEqual(slices2.map(s => s.tileIds))
  })

  it('accurately calculates optimal resources, optimal influence, tech skips, and wormholes', () => {
    // Tile 19: Wellon (1/2, yellow skip) -> optI: 2
    // Tile 26: Lodor (3/1, alpha) -> optR: 3, alpha wormhole
    // Tile 35: Bereg (3/1), Lirta IV (2/3) -> optR: 3, optI: 3
    // Tile 39: Alpha wormhole (0/0)
    // Tile 44: Asteroid field (0/0)
    const blue19 = GALAXY_TILES.find(t => t.tile === 19)!
    const blue26 = GALAXY_TILES.find(t => t.tile === 26)!
    const blue35 = GALAXY_TILES.find(t => t.tile === 35)!
    const red39 = GALAXY_TILES.find(t => t.tile === 39)!
    const red44 = GALAXY_TILES.find(t => t.tile === 44)!

    const metrics = calculateSliceMetrics([blue19, blue26, blue35, red39, red44])
    expect(metrics.totalResources).toBe(1 + 3 + 3 + 2) // 9
    expect(metrics.totalInfluence).toBe(2 + 1 + 1 + 3) // 7
    expect(metrics.optimalResources).toBe(3 + 3) // Lodor (3) + Bereg (3)
    expect(metrics.optimalInfluence).toBe(2 + 3) // Wellon (2) + Lirta IV (3)
    expect(metrics.techSkips).toContain('yellow')
    expect(metrics.wormholes).toContain('alpha')
    expect(metrics.anomalies).toContain('asteroid_field')
  })

  it('generates 6 slices for a 6-player game without running out of tiles', () => {
    const slices = generateSlices(6, 999)
    expect(slices).toHaveLength(6)
    // 6 slices * 5 tiles = 30 tiles used out of 32
    const used = new Set(slices.flatMap(s => s.tileIds))
    expect(used.size).toBe(30)
  })
})
