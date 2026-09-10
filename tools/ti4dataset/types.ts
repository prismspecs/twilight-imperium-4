/**
 * Typed model for AsyncTI4 raw game data (`/events` and `/web-data`) and for the
 * extracted, engine-ready training records produced by this toolkit.
 *
 * These types describe the *AsyncTI4* data exactly as it arrives from
 * bot.asyncti4.com (see docs/scraping-asyncti4.md). They deliberately do NOT reuse
 * this repo's src/engine/types.ts verbatim: AsyncTI4 serves an expanded faction set,
 * homebrew modes, and more players, so the raw schema is kept separate and mapped /
 * aliased onto the engine's base-17 world by `decoder`/`replay` instead.
 */

/** One move in an AsyncTI4 game log. */
export interface RawEvent {
  seq: number
  archetype: string
  round: number
  phase: string
  faction: string | null
  timestamp: number
  payload: Record<string, unknown>
  /** Compact serialised board snapshot; present on board-mutating moves only. */
  mapState?: string
}

/** The `/events` endpoint response. */
export type RawEventLog = RawEvent[]

/**
 * A decoded piece of board layout.
 * Tile units are coded `['u'|'t'|'a', <code>, count, ...]`:
 *   u -> unit,  t -> token (frontier/wormhole/custodian),  a -> planet attachment.
 */
export type UnitStack = { kind: 'unit' | 'token' | 'attachment'; code: string; count: number; data: number[] }

export interface DecodedTile {
  /** AsyncTI4 tile/system id, e.g. "101", "000" (Mecatol), "tl" (wormhole), "special". */
  id: string
  /** 1 when the system has been activated this round. */
  activated: boolean
  /** Ships in the system keyed by controlling faction string. */
  space: Record<string, UnitStack[]>
  /** Planets: name, controller faction, resources, influence, ground units, structures. */
  planets: {
    name: string
    controller: string | null
    resources: number
    influence: number
    ground: UnitStack[] // infantry/mechs/PDS/mm
    attachments: string[] // 'a' codes (tech skip, relic fragment, ...)
  }[]
  /** Command tokens present (faction strings). */
  commandTokens: string[]
  /** PDS. */
  pds: string[]
  /** Control/misc tokens. */
  control: unknown[]
}

/** Board snapshot: round number + the tile grid. */
export interface DecodedBoard {
  round: number
  tiles: Record<string, DecodedTile>
}

/** A single extracted state->action training record (the toolkit's output). */
export interface DatasetRecord {
  gameId: string
  /** Reconstructed board at the moment before the action. */
  board: DecodedBoard
  /** Reconstructed player state just before the action. */
  players: Record<string, ReplayPlayer>
  /** The action taken, in AsyncTI4-native terms (mapped further in the next stage). */
  event: RawEvent
  /* Mapping status for this action. */
  mapped: boolean
}

/** Player state reconstructed by replaying the event log. */
export interface ReplayPlayer {
  /** Final faction string from web-data, or first seen in events. */
  faction: string
  /** Techs researched so far, in research order. */
  techs: string[]
  techsByRound: Record<number, string[]>
  /** Strategy cards held this round keyed by scNumber. */
  strategyCards: number[]
  /** Objectives this player has scored. */
  scoredObjectives: string[]
  /** Points at this moment (reconstructed where possible). */
  vp: number
  /** Final status, from web-data when available. */
  finalVp?: number
  totalTurns?: number
  eliminated?: boolean
}

/** Parsed /web-data response (the subset this toolkit needs). */
export interface RawWebData {
  gameName: string
  gameCustomName?: string
  gameRound?: number
  vpsToWin?: number
  gameState: {
    phase: string
    winner: string | null
    activePlayer?: string | null
    round?: number
  }
  playerData?: RawPlayerData[]
  objectives?: Record<string, unknown>
  lawsInPlay?: unknown[]
  tilePositions?: string[]
  tileUnitData?: Record<string, unknown>
  scoreBreakdowns?: Record<string, unknown>
}

export interface RawPlayerData {
  faction: string
  color: string
  userName?: string
  discordId?: string
  techs: string[]
  totalVps: number
  eliminated: boolean
  passed: boolean
  resources?: number
  influence?: number
  tg?: number
  commodities?: number
  planets?: string[]
  unitCounts?: Record<string, unknown>
  [key: string]: unknown
}
