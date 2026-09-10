/**
 * Decodes AsyncTI4 raw JSON into the typed model in types.ts.
 *
 * The two hard formats to decode are the compact serialised `mapState` board
 * (a `[round, tile, tile, ...]` array) and the unit/token/attachment codes
 * (`['u'|'t'|'a', <code>, ...]`). Decoding is verified against known web-data
 * finals in the tests.
 */
import type { DecodedBoard, DecodedTile, RawEvent, RawWebData, UnitStack } from './types'

/** Map AsyncTI4 unit codes to unit kinds. */
export const UNIT_CODES: Record<string, string> = {
  ca: 'cruiser',
  cv: 'carrier',
  dd: 'destroyer',
  dn: 'dreadnought',
  ff: 'fighter',
  fs: 'flagship',
  gf: 'infantry',
  mf: 'mech',
  pd: 'pds',
  sd: 'spacedock',
  ws: 'warsun',
}

/**
 * Parse one `['u'|'t'|'a', code, count, ...]` stack entry.
 * Continuation numbers after count are AsyncTI4-internal (reinforcement caps etc.)
 * and ignored here.
 */
export function decodeUnitStack(entry: unknown[]): UnitStack {
  const kind = entry[0] === 'u' ? 'unit' : entry[0] === 'a' ? 'attachment' : 'token'
  const code = String(entry[1] ?? '')
  // AsyncTI4 encodes a count across TWO fields: index 2 (the main/healthy count) and
  // index 3 (a secondary count, e.g. damaged / still-in-reinforcements). The true number
  // of physical units is their sum (verified against web-data tileUnitData).
  const n2 = typeof entry[2] === 'number' ? entry[2] : 0
  const n3 = typeof entry[3] === 'number' ? entry[3] : 0
  const count = kind === 'unit' ? n2 + n3 : Math.max(n2, 1)
  return { kind, code, count, data: entry.slice(3).map(Number) }
}

/**
 * Decode one tile's 7-element array:
 *   [0] system id, [1] activated(0/1),
 *   [2] space: [[faction, [stacks...]], ...],
 *   [3] planets: [[name, controller, ?, res, infl, ?, ?, [ground stacks]], ...],
 *   [4] command tokens (faction strings),
 *   [5] PDS,
 *   [6] control/misc.
 */
export function decodeTile(raw: unknown[]): DecodedTile {
  if (!Array.isArray(raw) || raw.length < 5) {
    return { id: String(raw?.[0] ?? '?'), activated: false, space: {}, planets: [], commandTokens: [], pds: [], control: [] }
  }
  const id = String(raw[0])
  const activated = raw[1] === 1 || raw[1] === true

  const space: Record<string, UnitStack[]> = {}
  for (const group of Array.isArray(raw[2]) ? raw[2] : []) {
    const faction = String(group[0])
    space[faction] = (Array.isArray(group[1]) ? group[1] : []).map((s) => decodeUnitStack(s as unknown[]))
  }

  const planets = (Array.isArray(raw[3]) ? raw[3] : []).map((p) => {
    const pl = p as unknown[]
    const name = String(pl[0])
    const controller = pl[1] == null ? null : String(pl[1])
    const res = typeof pl[3] === 'number' ? pl[3] : 0
    const infl = typeof pl[4] === 'number' ? pl[4] : 0
    const ground: UnitStack[] = []
    const attachments: string[] = []
    for (const rawGs of Array.isArray(pl[7]) ? (pl[7] as unknown[]) : []) {
      const gs = rawGs as unknown[]
      for (const stack of Array.isArray(gs[1]) ? (gs[1] as unknown[][]) : []) {
        const du = decodeUnitStack(stack)
        if (du.kind === 'attachment') attachments.push(`${du.code}:${du.count}`)
        else ground.push(du)
      }
    }
    return { name, controller, resources: res, influence: infl, ground, attachments }
  })

  const commandTokens = (Array.isArray(raw[4]) ? raw[4] : []).map(String)
  const pds = (Array.isArray(raw[5]) ? raw[5] : []).map(String)
  const control = Array.isArray(raw[6]) ? raw[6] : []

  return { id, activated, space, planets, commandTokens, pds, control }
}

/**
 * Decode a full board snapshot (the `mapState` string on an event).
 * Layout: index 0 is the round; indices 1..n are tiles.
 */
export function decodeBoard(mapState: string): DecodedBoard | null {
  let arr: unknown[]
  try {
    arr = JSON.parse(mapState) as unknown[]
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length < 1) return null
  const round = typeof arr[0] === 'number' ? arr[0] : 0
  const tiles: Record<string, DecodedTile> = {}
  for (let i = 1; i < arr.length; i += 1) {
    if (Array.isArray(arr[i])) {
      const t = decodeTile(arr[i] as unknown[])
      tiles[t.id] = t
    }
  }
  return { round, tiles }
}

/** Normalise a web-data response to the typed subset. */
export function parseWebData(raw: RawWebData): RawWebData {
  return raw
}

/** Returns true if an event carries a board snapshot. */
export function hasBoard(event: RawEvent): boolean {
  return typeof event.mapState === 'string' && event.mapState.length > 0
}
