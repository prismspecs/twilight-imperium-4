import type { PlanetTrait, Seat, TechSkip } from '../engine/types'

export interface PlanetDef { id: string; name: string; resources: number; influence: number; trait?: PlanetTrait | null; techSkip?: TechSkip | null }
export interface SystemDef {
  id: string; name: string; tile: string
  planets: PlanetDef[]
  wormhole: 'alpha' | 'beta' | 'delta' | null
  neighbours: string[]
  home: Seat | null
  q?: number
  r?: number
}

// Flower layout: mecatol in the centre; ring order clockwise from the top: home-n, bereg, quann, home-s, starpoint, sakulag.
export const SYSTEMS: SystemDef[] = [
  { id: 'home-n', name: '[0.0.0]', tile: '06_000', planets: [{ id: '000', name: '[0.0.0]', resources: 5, influence: 0 }], wormhole: null, neighbours: ['mecatol', 'bereg', 'sakulag'], home: 0, q: 0, r: -1 },
  { id: 'bereg', name: 'Bereg', tile: '35_Bereg', planets: [{ id: 'bereg', name: 'Bereg', resources: 3, influence: 1, trait: 'hazardous' }, { id: 'lirta-iv', name: 'Lirta IV', resources: 2, influence: 3, trait: 'hazardous' }], wormhole: 'alpha', neighbours: ['mecatol', 'home-n', 'quann'], home: null, q: 1, r: -1 },
  { id: 'quann', name: 'Quann', tile: '00_blue', planets: [{ id: 'quann', name: 'Quann', resources: 2, influence: 1, trait: 'cultural' }], wormhole: 'beta', neighbours: ['mecatol', 'bereg', 'home-s'], home: null, q: 1, r: 0 },
  { id: 'home-s', name: 'Arc Prime', tile: '10_ArcPime', planets: [{ id: 'arc-prime', name: 'Arc Prime', resources: 4, influence: 0 }, { id: 'wren-terra', name: 'Wren Terra', resources: 2, influence: 1 }], wormhole: null, neighbours: ['mecatol', 'quann', 'starpoint'], home: 1, q: 0, r: 1 },
  { id: 'starpoint', name: 'Starpoint', tile: '00_blue', planets: [{ id: 'starpoint', name: 'Starpoint', resources: 3, influence: 1, trait: 'hazardous' }, { id: 'centauri', name: 'Centauri', resources: 2, influence: 3, trait: 'cultural' }], wormhole: 'alpha', neighbours: ['mecatol', 'home-s', 'sakulag'], home: null, q: -1, r: 1 },
  { id: 'sakulag', name: 'Sakulag', tile: '00_blue', planets: [{ id: 'sakulag', name: 'Sakulag', resources: 2, influence: 1, trait: 'hazardous' }], wormhole: 'beta', neighbours: ['mecatol', 'starpoint', 'home-n'], home: null, q: -1, r: 0 },
  { id: 'mecatol', name: 'Mecatol Rex', tile: '18_MR', planets: [{ id: 'mecatol-rex', name: 'Mecatol Rex', resources: 1, influence: 6 }], wormhole: null, neighbours: ['home-n', 'bereg', 'quann', 'home-s', 'starpoint', 'sakulag'], home: null, q: 0, r: 0 },
]

export const MECATOL_ID = 'mecatol'
export const SYSTEM_IDS: string[] = SYSTEMS.map(s => s.id)
export const TRADE_POSTS = { west: ['sakulag', 'starpoint'], east: ['bereg', 'quann'] } as const

const BY_ID = new Map(SYSTEMS.map(s => [s.id, s]))
export function systemDef(id: string): SystemDef {
  const s = BY_ID.get(id)
  if (!s) throw new Error(`unknown system ${id}`)
  return s
}

export function homeSystemId(seat: Seat): string {
  const home = SYSTEMS.find(s => s.home === seat)
  if (!home) throw new Error(`no home system for seat ${String(seat)}`)
  return home.id
}
