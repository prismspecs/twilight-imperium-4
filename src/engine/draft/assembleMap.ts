import { MECATOL_ID, type SystemDef } from '../../data/map'
import { GALAXY_TILES, MECATOL_TILE, homeTileFor, type TileDef } from '../../data/tiles'
import { deriveSeed, mulberry32 } from '../rng'
import type { PlayerConfig, Seat } from '../types'
import type { MiltyDraftState } from './miltyDraft'

export interface GeneratedSystem extends SystemDef {
  q: number
  r: number
}

export interface AssembledDraftGame {
  systems: GeneratedSystem[]
  players: PlayerConfig[]
  speaker: Seat
}

const RADIUS = 3
const ASSEMBLE_SALT = 86

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

const CORNERS: readonly (readonly [number, number])[] = [
  [RADIUS, 0], [RADIUS, -RADIUS], [0, -RADIUS], [-RADIUS, 0], [-RADIUS, RADIUS], [0, RADIUS],
]

const HOME_CORNERS: Record<number, readonly number[]> = {
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
}

const REMOVED_CORNERS: Record<number, readonly number[]> = { 3: [1, 3, 5] }

function hexKey(q: number, r: number): string { return `${String(q)},${String(r)}` }

const rotCW = ([q, r]: readonly [number, number]): [number, number] => [q + r, -q]
const rotateN = (pt: readonly [number, number], n: number): [number, number] => {
  let cur: [number, number] = [pt[0], pt[1]]
  for (let i = 0; i < n; i++) cur = rotCW(cur)
  return cur
}

const BASE_SECTOR: readonly (readonly [number, number])[] = [
  [2, 0],   // Front
  [1, 0],   // Facing Mecatol
  [3, -1],  // Ring 3 adjacent
  [2, -1],  // Ring 2 adjacent
  [3, -2],  // Ring 3 equidistant
]

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
    id,
    name: tile.name,
    tile: String(tile.tile),
    planets: tile.planets.map(p => ({
      id: p.id,
      name: p.name,
      resources: p.resources,
      influence: p.influence,
      trait: p.trait,
      techSkip: p.techSkip,
    })),
    wormhole: tile.wormholes[0] ?? null,
    anomalies: [...tile.anomalies],
    neighbours: [],
    home,
    q,
    r,
  }
}

export function assembleDraftedGame(draftState: MiltyDraftState, seed: number): AssembledDraftGame {
  const n = draftState.playerCount
  const cornerIdx = HOME_CORNERS[n]
  if (!cornerIdx) throw new Error(`unsupported player count ${String(n)}`)
  const removedIdx = REMOVED_CORNERS[n] ?? []
  const removed = new Set(removedIdx.map(i => hexKey(CORNERS[i][0], CORNERS[i][1])))

  // Map drafted positions (1..N) to Seat (0..N-1)
  const players: PlayerConfig[] = []
  const seatToSliceTiles = new Map<number, TileDef[]>()

  for (let seat = 0; seat < n; seat++) {
    const position = seat + 1
    const entry = Object.entries(draftState.picks).find(([, p]) => p.position === position)
    if (!entry) throw new Error(`No player drafted position ${String(position)}`)
    const playerIdx = Number(entry[0])
    const pick = entry[1]
    const pInfo = draftState.players[playerIdx]

    if (!pick.faction) throw new Error(`Player ${String(playerIdx)} missing faction`)
    if (!pick.sliceId) throw new Error(`Player ${String(playerIdx)} missing slice`)

    players.push({
      faction: pick.faction,
      color: pInfo.color,
      name: pInfo.name,
      playerType: pInfo.playerType,
    })

    const slice = draftState.slicesPool.find(s => s.id === pick.sliceId)
    if (!slice) throw new Error(`Slice ${pick.sliceId} not found in pool`)
    seatToSliceTiles.set(seat, slice.tiles)
  }

  // Map each seat to their home corner cell and their 5 slice cells
  const tileAtCell = new Map<string, { tile: TileDef; home: Seat | null; id: string }>()
  const usedTileNumbers = new Set<number>()

  // Mecatol Rex
  tileAtCell.set(hexKey(0, 0), { tile: MECATOL_TILE, home: null, id: MECATOL_ID })
  usedTileNumbers.add(MECATOL_TILE.tile)

  for (let seat = 0; seat < n; seat++) {
    const c = cornerIdx[seat]
    const corner = CORNERS[c]
    const homeTile = homeTileFor(players[seat].faction)
    if (!homeTile) throw new Error(`no home tile for faction ${players[seat].faction}`)
    tileAtCell.set(hexKey(corner[0], corner[1]), {
      tile: homeTile,
      home: seat as Seat,
      id: `home-${String(seat)}`,
    })
    usedTileNumbers.add(homeTile.tile)

    const sliceTiles = seatToSliceTiles.get(seat)!
    const sliceCells = BASE_SECTOR.map(pt => rotateN(pt, c))
    sliceCells.forEach((cell, idx) => {
      const tile = sliceTiles[idx]
      if (tile) {
        tileAtCell.set(hexKey(cell[0], cell[1]), {
          tile,
          home: null,
          id: `tile-${String(tile.tile)}`,
        })
        usedTileNumbers.add(tile.tile)
      }
    })
  }

  // Filler tiles for any remaining on-board cells (e.g. 3-5 players)
  const remainingDeck = GALAXY_TILES.filter(t => !usedTileNumbers.has(t.tile))
  const rng = mulberry32(deriveSeed(seed, ASSEMBLE_SALT))
  for (let i = remainingDeck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = remainingDeck[i]
    remainingDeck[i] = remainingDeck[j]
    remainingDeck[j] = tmp
  }
  let fillerIdx = 0

  const idAtCell = new Map<string, string>()
  const placed: GeneratedSystem[] = []

  for (const [q, r] of allCells(RADIUS)) {
    const key = hexKey(q, r)
    if (removed.has(key)) continue

    let item = tileAtCell.get(key)
    if (!item) {
      const tile = remainingDeck[fillerIdx]
      fillerIdx++
      if (!tile) throw new Error('ran out of filler tiles')
      item = { tile, home: null, id: `tile-${String(tile.tile)}` }
      tileAtCell.set(key, item)
    }

    idAtCell.set(key, item.id)
    placed.push(tileToSystem(item.id, item.tile, item.home, q, r))
  }

  // Compute hex adjacency
  for (const system of placed) {
    system.neighbours = DIRECTIONS
      .map(([dq, dr]) => idAtCell.get(hexKey(system.q + dq, system.r + dr)))
      .filter((id): id is string => id !== undefined)
  }

  return {
    systems: placed,
    players,
    speaker: 0 as Seat,
  }
}
