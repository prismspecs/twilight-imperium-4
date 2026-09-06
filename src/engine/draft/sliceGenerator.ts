import { GALAXY_TILES, type TileDef } from '../../data/tiles'
import { deriveSeed, mulberry32 } from '../rng'
import type { Anomaly, TechColor } from '../types'

export interface DraftSliceMetrics {
  totalResources: number
  totalInfluence: number
  optimalResources: number
  optimalInfluence: number
  optimalFlex: number
  techSkips: TechColor[]
  wormholes: ('alpha' | 'beta' | 'delta')[]
  anomalies: Anomaly[]
}

export interface DraftSlice extends DraftSliceMetrics {
  id: string
  name: string
  tileIds: number[]
  tiles: TileDef[]
}

const SLICE_SALT = 84

export function calculateSliceMetrics(tiles: readonly TileDef[]): DraftSliceMetrics {
  let totalResources = 0
  let totalInfluence = 0
  let optimalResources = 0
  let optimalInfluence = 0
  let optimalFlex = 0
  const techSkips: TechColor[] = []
  const wormholes: ('alpha' | 'beta' | 'delta')[] = []
  const anomalies: Anomaly[] = []

  for (const tile of tiles) {
    for (const anom of tile.anomalies) {
      if (!anomalies.includes(anom)) anomalies.push(anom)
    }
    for (const wh of tile.wormholes) {
      if (!wormholes.includes(wh)) wormholes.push(wh)
    }
    for (const planet of tile.planets) {
      totalResources += planet.resources
      totalInfluence += planet.influence
      if (planet.resources > planet.influence) {
        optimalResources += planet.resources
      } else if (planet.influence > planet.resources) {
        optimalInfluence += planet.influence
      } else if (planet.resources > 0) {
        optimalFlex += planet.resources
      }
      if (planet.techSkip) {
        techSkips.push(planet.techSkip)
      }
    }
  }

  return {
    totalResources,
    totalInfluence,
    optimalResources,
    optimalInfluence,
    optimalFlex,
    techSkips,
    wormholes,
    anomalies,
  }
}

/**
 * Generates N slices (each having 3 blue planet tiles and 2 red anomaly/blank tiles).
 * Slices are disjoint (drawn without replacement from the base game GALAXY_TILES).
 * Deterministic given `seed`.
 */
export function generateSlices(count: number, seed: number): DraftSlice[] {
  const maxSlices = 6 // 20 blue tiles / 3 = 6; 12 red tiles / 2 = 6
  const sliceCount = Math.min(maxSlices, Math.max(1, count))

  const rng = mulberry32(deriveSeed(seed, SLICE_SALT))

  const blues = GALAXY_TILES.filter(t => t.back === 'blue' || t.category === 'blue_planet')
  const reds = GALAXY_TILES.filter(t => t.back === 'red' || t.category === 'red_anomaly_or_empty')

  // Shuffle copies
  const shuffledBlues = [...blues]
  for (let i = shuffledBlues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = shuffledBlues[i]
    shuffledBlues[i] = shuffledBlues[j]
    shuffledBlues[j] = temp
  }

  const shuffledReds = [...reds]
  for (let i = shuffledReds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = shuffledReds[i]
    shuffledReds[i] = shuffledReds[j]
    shuffledReds[j] = temp
  }

  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const slices: DraftSlice[] = []

  for (let i = 0; i < sliceCount; i++) {
    const sliceBlues = shuffledBlues.slice(i * 3, i * 3 + 3)
    const sliceReds = shuffledReds.slice(i * 2, i * 2 + 2)
    const sliceTiles = [...sliceBlues, ...sliceReds]

    const metrics = calculateSliceMetrics(sliceTiles)
    const id = `slice-${labels[i] ?? String(i + 1)}`
    const name = `Slice ${labels[i] ?? String(i + 1)}`

    slices.push({
      id,
      name,
      tileIds: sliceTiles.map(t => t.tile),
      tiles: sliceTiles,
      ...metrics,
    })
  }

  return slices
}
