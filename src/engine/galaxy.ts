import { MECATOL_ID, type SystemDef } from '../data/map'
import { GALAXY_TILES, MECATOL_TILE, homeTileFor, type TileDef } from '../data/tiles'
import { deriveSeed, mulberry32 } from './rng'
import type { FactionId, Seat } from './types'

/** A player's claim on a home system: which seat plays which faction. */
export interface GalaxyHome { seat: Seat; faction: FactionId }

/** A generated system: the static SystemDef shape plus axial hex coordinates for rendering. */
export interface GeneratedSystem extends SystemDef { q: number; r: number }

/**
 * R8: the salt that derives the galaxy-tile shuffle stream from the game seed. `deriveSeed` is injective in
 * its salt, and the setup module already uses 91 (objectives) and 92 (trade posts), so 90 cannot collide.
 */
const GALAXY_SALT = 90

/** Radius of the hex grid: ring 0 is Mecatol, rings 1-3 give 1 + 6 + 12 + 18 = 37 cells. */
const RADIUS = 3

/** The six axial neighbour directions. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

/** The six corner cells of the radius-3 hex, clockwise from due east: E, NE, NW, W, SW, SE. */
const CORNERS: readonly (readonly [number, number])[] = [
  [RADIUS, 0], [RADIUS, -RADIUS], [0, -RADIUS], [-RADIUS, 0], [-RADIUS, RADIUS], [0, RADIUS],
]

/**
 * Ruling (map layout): the official per-player-count diagrams are not machine-readable, so homes sit on
 * evenly spaced corners of the radius-3 hex. 6p uses all six; 5p leaves one corner to the deck; 4p uses two
 * adjacent pairs facing off (corners E/NE and W/SW); 3p uses the three alternating corners.
 */
const HOME_CORNERS: Record<number, readonly number[]> = {
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
}

/**
 * Ruling (map layout): a full radius-3 ring with 3 homes needs 33 galaxy tiles but the box holds 32, so the
 * three non-home corners are left off-board, which keeps the 3-player galaxy 120°-symmetric and uses 30 tiles.
 */
const REMOVED_CORNERS: Record<number, readonly number[]> = { 3: [1, 3, 5] }

function hexKey(q: number, r: number): string { return `${q},${r}` }

/** Every cell of the radius-`radius` hex, as axial [q, r] pairs. */
function allCells(radius: number): [number, number][] {
  const cells: [number, number][] = []
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius)
    const hi = Math.min(radius, -q + radius)
    for (let r = lo; r <= hi; r++) cells.push([q, r])
  }
  return cells
}

function tileToSystem(id: string, tile: TileDef, home: Seat | null, q: number, r: number): GeneratedSystem {
  return {
    id, name: tile.name, tile: String(tile.tile),
    planets: tile.planets.map(p => ({ id: p.id, name: p.name, resources: p.resources, influence: p.influence, trait: p.trait, techSkip: p.techSkip })),
    wormhole: tile.wormholes[0] ?? null,
    neighbours: [],
    home, q, r,
  }
}

/** The system id of a seat's home system in a generated galaxy. */
export function generatedHomeId(seat: Seat): string { return `home-${seat}` }

/**
 * Builds a complete N-player galaxy (3-6 players): Mecatol Rex at the centre, each faction's home system on
 * an evenly spaced corner of the radius-3 hex, and every remaining cell filled from the shuffled galaxy-tile
 * deck. Hex adjacency is computed from the grid; wormhole links are resolved at runtime by adjacency.ts.
 * Deterministic in `seed`: the same seed and homes always produce the same galaxy.
 */
export function generateGalaxy(homes: readonly GalaxyHome[], seed: number): GeneratedSystem[] {
  const n = homes.length
  const cornerIdx = HOME_CORNERS[n]
  if (n < 3 || n > 6 || !cornerIdx) throw new Error(`galaxy supports 3-6 players, got ${String(n)}`)
  const removedIdx = REMOVED_CORNERS[n] ?? []

  const homeAtCell = new Map<string, GalaxyHome>()
  homes.forEach((home, i) => {
    const corner = CORNERS[cornerIdx[i]]
    homeAtCell.set(hexKey(corner[0], corner[1]), home)
  })
  const removed = new Set(removedIdx.map(i => hexKey(CORNERS[i][0], CORNERS[i][1])))

  // Shuffle the galaxy-tile deck from the seed (Fisher-Yates).
  const deck = [...GALAXY_TILES]
  const rng = mulberry32(deriveSeed(seed, GALAXY_SALT))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp
  }

  // Walk the grid, assigning a tile and a stable id to every on-board cell.
  const idAtCell = new Map<string, string>()
  const placed: GeneratedSystem[] = []
  let deckPos = 0
  for (const [q, r] of allCells(RADIUS)) {
    if (removed.has(hexKey(q, r))) continue
    const home = homeAtCell.get(hexKey(q, r))
    let id: string
    let tile: TileDef
    if (q === 0 && r === 0) { id = MECATOL_ID; tile = MECATOL_TILE }
    else if (home) {
      const homeTile = homeTileFor(home.faction)
      if (!homeTile) throw new Error(`no home tile for faction ${home.faction}`)
      id = generatedHomeId(home.seat); tile = homeTile
    } else {
      const next = deck[deckPos]; deckPos++
      if (!next) throw new Error('galaxy deck ran out of tiles')
      id = `tile-${next.tile}`; tile = next
    }
    idAtCell.set(hexKey(q, r), id)
    placed.push(tileToSystem(id, tile, home ? home.seat : null, q, r))
  }

  // Hex adjacency: the six axial neighbours that are on the board, by system id.
  for (const system of placed) {
    system.neighbours = DIRECTIONS
      .map(([dq, dr]) => idAtCell.get(hexKey(system.q + dq, system.r + dr)))
      .filter((id): id is string => id !== undefined)
  }
  return placed
}
