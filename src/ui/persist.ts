import type { GameConfig, GameState } from '../engine/types'
import type { Session } from './store'

/**
 * One browser holds many games, one key each. localStorage rather than cookies: a cookie would ride along
 * with every request to the server, is capped at a few kilobytes and is no less browser-local, so it would
 * buy nothing here and cost bandwidth. Nothing leaves the device either way, which is exactly the point:
 * another browser has its own storage and therefore its own games.
 */
export const LEGACY_KEY = 'md:local'
export const INDEX_KEY = 'md:games'
export const MAX_GAMES = 20
/** No I, L, O, 0 or 1: a code is read out loud across the table, and those five are misheard. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function gameKey(code: string): string {
  return `md:game:${code}`
}

/** What the lobby needs to list a game without parsing the whole state. */
export interface GameSummary {
  code: string
  names: string[]
  round: number
  updatedAt: number
}

interface Legacy {
  version: 1
  seed: number
  minutes: number
  clockMs: number[]
  state: GameState
  history: GameState[]
  /** Which seat is an AI; absent in a game saved before the AI existed, which loaded as hot-seat. */
  config?: GameConfig
}

type Payload = Legacy & GameSummary

function isLegacy(value: unknown): value is Legacy {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<Legacy>
  return p.version === 1 && typeof p.seed === 'number' && typeof p.minutes === 'number'
    && Array.isArray(p.clockMs) && p.clockMs.length >= 2
    && Array.isArray(p.history)
    // R7 changed the objectives and with them the shape of a player, so a game saved under version 1 is
    // not readable any more and is dropped rather than crashed into
    && typeof p.state === 'object' && p.state !== null && [2, 3].includes((p.state as { version: number }).version)
}

function isSummary(value: unknown): value is GameSummary {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<GameSummary>
  return typeof s.code === 'string' && s.code.length > 0
    && Array.isArray(s.names) && s.names.length >= 2
    && s.names.every(n => typeof n === 'string')
    && typeof s.round === 'number' && typeof s.updatedAt === 'number'
}

/**
 * R3.2: `turnDone` arrived after the first deploys, so a payload written before it has no such field. It
 * loads as a turn whose action is still open, the only safe reading, which keeps a game in progress playable
 * across the deploy; rejecting the payload would throw the game away instead.
 */
/**
 * A payload written by an older build lacks the fields that version's rules did not have yet. Reading it as
 * the current shape keeps a game in progress playable across a deploy, which is the whole point of saving it;
 * rejecting it would throw the game away. Each step states what the missing field must mean:
 * `turnDone` false (the action is still open), and for a game from before the trade posts had names, the
 * pair the status phase would have rolled anyway, unused.
 */
function normalise(state: GameState): GameState {
  const raw = state as unknown as Partial<GameState> & { turnDone?: unknown; posts?: unknown }
  let next = state
  if (typeof raw.turnDone !== 'boolean') next = { ...next, turnDone: false }
  if (typeof raw.posts !== 'object' || raw.posts === null) {
    next = { ...next, posts: { west: 'sarnex', east: 'kesh' }, postAbilityUsed: { west: false, east: false } }
  }
  return next.version === 3 ? next : { ...next, version: 3 }
}

function isPayload(value: unknown): value is Payload {
  return isLegacy(value) && isSummary(value)
}

// Every access is wrapped: a blocked, full or foreign storage must never throw into the UI.
function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // a full or blocked storage must never break the game in progress
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nothing to do
  }
}

function present(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function hasGame(code: string): boolean {
  return present(gameKey(code))
}

/** Six characters, redrawn while the browser already holds that code; the loop is bounded, never endless. */
export function newGameCode(exists: (code: string) => boolean): string {
  const draw = () => {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    return code
  }
  // `Math.random`, never the engine's seeded RNG: the game seed stays reproducible and independent
  let code = draw()
  for (let attempt = 0; attempt < 100 && exists(code); attempt += 1) code = draw()
  return code
}

function readIndex(): GameSummary[] {
  const parsed = read(INDEX_KEY)
  if (!Array.isArray(parsed)) return []
  // stable sort: entries written in the same millisecond keep the order they were written in
  return (parsed as unknown[]).filter(isSummary).sort((a, b) => b.updatedAt - a.updatedAt)
}

function store(session: Session): void {
  const summary: GameSummary = {
    code: session.code,
    names: session.state.players.map(p => p.name),
    round: session.state.round,
    updatedAt: Date.now(),
  }
  const payload: Payload = {
    ...summary, version: 1, seed: session.seed, minutes: session.minutes,
    clockMs: session.clockMs, state: session.state, history: session.history, config: session.config,
  }
  write(gameKey(session.code), payload)
  const entries = [summary, ...readIndex().filter(e => e.code !== session.code)]
  for (const dropped of entries.slice(MAX_GAMES)) remove(gameKey(dropped.code))
  write(INDEX_KEY, entries.slice(0, MAX_GAMES))
}

/**
 * The first version kept one game under `md:local` and no code at all. The first read of any kind turns it
 * into a coded game, so a player who left a game running before this version simply finds it in the list.
 */
function migrate(): void {
  if (!present(LEGACY_KEY)) return
  const parsed = read(LEGACY_KEY)
  if (isLegacy(parsed)) {
    store({
      code: newGameCode(hasGame), seed: parsed.seed, minutes: parsed.minutes,
      state: normalise(parsed.state), history: parsed.history.map(normalise), clockMs: parsed.clockMs, handoff: null,
    })
  }
  remove(LEGACY_KEY)
}

export function listGames(): GameSummary[] {
  migrate()
  // an index entry whose payload is gone, or was written by an older version of the game, would be a row
  // that resumes into nothing, so it is dropped from the list and from storage
  const out: GameSummary[] = []
  for (const entry of readIndex()) {
    if (isPayload(read(gameKey(entry.code)))) out.push(entry)
    else remove(gameKey(entry.code))
  }
  if (out.length !== readIndex().length) write(INDEX_KEY, out)
  return out
}

export function latestGameCode(): string | null {
  return listGames()[0]?.code ?? null
}

export function saveGame(session: Session): void {
  migrate()
  store(session)
}

export function loadGame(code: string): Session | null {
  migrate()
  const parsed = read(gameKey(code))
  if (!isPayload(parsed)) return null
  return {
    code: parsed.code, seed: parsed.seed, minutes: parsed.minutes,
    state: normalise(parsed.state), history: parsed.history.map(normalise), clockMs: parsed.clockMs, handoff: null,
    config: parsed.config,
  }
}

export function deleteGame(code: string): void {
  migrate()
  remove(gameKey(code))
  write(INDEX_KEY, readIndex().filter(entry => entry.code !== code))
}
