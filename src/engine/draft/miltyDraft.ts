import { FACTIONS } from '../../data/factions'
import { deriveSeed, mulberry32 } from '../rng'
import type { Color, FactionId, PlayerType, Seat } from '../types'
import { generateSlices, type DraftSlice } from './sliceGenerator'

export interface DraftPosition {
  position: number // 1 to P
  name: string
  seat: Seat // 0 to P-1
}

export interface PlayerPicks {
  faction?: FactionId
  sliceId?: string
  position?: number
}

export interface DraftPlayer {
  name: string
  color: Color
  playerType: PlayerType
}

export interface MiltyDraftConfig {
  playerCount: number
  players: DraftPlayer[]
  seed: number
  factionsCount?: number
  slicesCount?: number
}

export interface MiltyDraftState {
  playerCount: number
  players: DraftPlayer[]
  draftOrder: number[]
  pickSequence: number[]
  turnIndex: number
  factionsPool: FactionId[]
  slicesPool: DraftSlice[]
  positionsPool: DraftPosition[]
  picks: Record<number, PlayerPicks>
  claimedFactions: FactionId[]
  claimedSlices: string[]
  claimedPositions: number[]
  isComplete: boolean
}

export type DraftPick =
  | { playerIndex: number; kind: 'faction'; value: FactionId }
  | { playerIndex: number; kind: 'slice'; value: string }
  | { playerIndex: number; kind: 'position'; value: number }

const DRAFT_SALT = 85

export function createDraftState(config: MiltyDraftConfig): MiltyDraftState {
  const { playerCount, players, seed } = config
  const rng = mulberry32(deriveSeed(seed, DRAFT_SALT))

  // Determine initial draft order: 0 to playerCount - 1
  const draftOrder = Array.from({ length: playerCount }, (_, i) => i)

  // 3 rounds snake sequence:
  // Round 1: 0 .. P-1
  // Round 2: P-1 .. 0
  // Round 3: 0 .. P-1
  const round1 = [...draftOrder]
  const round2 = [...draftOrder].reverse()
  const round3 = [...draftOrder]
  const pickSequence = [...round1, ...round2, ...round3]

  // Factions pool
  const allFactionIds = Object.keys(FACTIONS) as FactionId[]
  const shuffledFactions = [...allFactionIds]
  for (let i = shuffledFactions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = shuffledFactions[i]
    shuffledFactions[i] = shuffledFactions[j]
    shuffledFactions[j] = temp
  }
  const fCount = config.factionsCount ?? Math.min(17, Math.max(playerCount + 3, 6))
  const factionsPool = shuffledFactions.slice(0, fCount)

  // Slices pool
  const sCount = config.slicesCount ?? Math.min(6, Math.max(playerCount + 1, 4))
  const slicesPool = generateSlices(sCount, seed)

  // Positions pool
  const positionsPool: DraftPosition[] = Array.from({ length: playerCount }, (_, i) => ({
    position: i + 1,
    name: i === 0 ? 'Speaker (1st)' : `${String(i + 1)}th pick`,
    seat: i as Seat,
  }))

  const picks: Record<number, PlayerPicks> = {}
  for (let i = 0; i < playerCount; i++) {
    picks[i] = {}
  }

  return {
    playerCount,
    players,
    draftOrder,
    pickSequence,
    turnIndex: 0,
    factionsPool,
    slicesPool,
    positionsPool,
    picks,
    claimedFactions: [],
    claimedSlices: [],
    claimedPositions: [],
    isComplete: false,
  }
}

export function availablePicksFor(state: MiltyDraftState, playerIndex: number) {
  const p = state.picks[playerIndex] ?? {}
  const canPickFaction = !p.faction
  const canPickSlice = !p.sliceId
  const canPickPosition = !p.position

  const availableFactions = canPickFaction
    ? state.factionsPool.filter(f => !state.claimedFactions.includes(f))
    : []
  const availableSlices = canPickSlice
    ? state.slicesPool.filter(s => !state.claimedSlices.includes(s.id))
    : []
  const availablePositions = canPickPosition
    ? state.positionsPool.filter(pos => !state.claimedPositions.includes(pos.position))
    : []

  return {
    canPickFaction,
    canPickSlice,
    canPickPosition,
    availableFactions,
    availableSlices,
    availablePositions,
  }
}

export function applyDraftPick(
  state: MiltyDraftState,
  pick: DraftPick,
): { ok: true; value: MiltyDraftState } | { ok: false; error: string } {
  if (state.isComplete) {
    return { ok: false, error: 'Draft is already complete' }
  }

  const expectedPlayer = state.pickSequence[state.turnIndex]
  if (pick.playerIndex !== expectedPlayer) {
    return {
      ok: false,
      error: `Not player ${String(pick.playerIndex)}'s turn. Expected player ${String(expectedPlayer)}`,
    }
  }

  const avail = availablePicksFor(state, pick.playerIndex)

  if (pick.kind === 'faction') {
    if (!avail.canPickFaction) {
      return { ok: false, error: `Player ${String(pick.playerIndex)} has already drafted a faction` }
    }
    if (!avail.availableFactions.includes(pick.value)) {
      return { ok: false, error: `Faction ${pick.value} is not available` }
    }

    const nextPicks = {
      ...state.picks,
      [pick.playerIndex]: { ...state.picks[pick.playerIndex], faction: pick.value },
    }
    const nextClaimed = [...state.claimedFactions, pick.value]
    const nextTurn = state.turnIndex + 1

    return {
      ok: true,
      value: {
        ...state,
        picks: nextPicks,
        claimedFactions: nextClaimed,
        turnIndex: nextTurn,
        isComplete: nextTurn >= state.pickSequence.length,
      },
    }
  }

  if (pick.kind === 'slice') {
    if (!avail.canPickSlice) {
      return { ok: false, error: `Player ${String(pick.playerIndex)} has already drafted a slice` }
    }
    if (!avail.availableSlices.some(s => s.id === pick.value)) {
      return { ok: false, error: `Slice ${pick.value} is not available` }
    }

    const nextPicks = {
      ...state.picks,
      [pick.playerIndex]: { ...state.picks[pick.playerIndex], sliceId: pick.value },
    }
    const nextClaimed = [...state.claimedSlices, pick.value]
    const nextTurn = state.turnIndex + 1

    return {
      ok: true,
      value: {
        ...state,
        picks: nextPicks,
        claimedSlices: nextClaimed,
        turnIndex: nextTurn,
        isComplete: nextTurn >= state.pickSequence.length,
      },
    }
  }

  if (pick.kind === 'position') {
    if (!avail.canPickPosition) {
      return { ok: false, error: `Player ${String(pick.playerIndex)} has already drafted a position` }
    }
    if (!avail.availablePositions.some(p => p.position === pick.value)) {
      return { ok: false, error: `Position ${String(pick.value)} is not available` }
    }

    const nextPicks = {
      ...state.picks,
      [pick.playerIndex]: { ...state.picks[pick.playerIndex], position: pick.value },
    }
    const nextClaimed = [...state.claimedPositions, pick.value]
    const nextTurn = state.turnIndex + 1

    return {
      ok: true,
      value: {
        ...state,
        picks: nextPicks,
        claimedPositions: nextClaimed,
        turnIndex: nextTurn,
        isComplete: nextTurn >= state.pickSequence.length,
      },
    }
  }

  return { ok: false, error: 'Invalid pick kind' }
}

const FACTION_TIERS: Record<FactionId, number> = {
  sol: 10,
  jolnar: 9.8,
  l1z1x: 9.2,
  hacan: 8.8,
  letnev: 8.5,
  naalu: 8.4,
  saar: 8.2,
  yssaril: 7.8,
  xxcha: 7.5,
  mentak: 7.2,
  creuss: 7.0,
  yin: 6.8,
  nekro: 6.5,
  sardakk: 5.8,
  muaat: 5.4,
  arborec: 5.2,
  winnu: 4.8,
}

export function aiDraftPick(state: MiltyDraftState, playerIndex: number): DraftPick {
  const avail = availablePicksFor(state, playerIndex)
  const options: { pick: DraftPick; score: number }[] = []

  if (avail.canPickFaction) {
    for (const f of avail.availableFactions) {
      const base = FACTION_TIERS[f] ?? 7.0
      options.push({
        pick: { playerIndex, kind: 'faction', value: f },
        score: base,
      })
    }
  }

  if (avail.canPickSlice) {
    for (const s of avail.availableSlices) {
      const val =
        s.optimalResources * 1.3 +
        s.optimalInfluence * 1.1 +
        s.optimalFlex * 1.0 +
        s.techSkips.length * 1.5 +
        s.wormholes.length * 0.8 -
        s.anomalies.length * 0.4
      options.push({
        pick: { playerIndex, kind: 'slice', value: s.id },
        score: val,
      })
    }
  }

  if (avail.canPickPosition) {
    for (const p of avail.availablePositions) {
      const speakerBonus = p.position === 1 ? 4.5 : 0
      const posScore = (state.playerCount - p.position + 1) * 1.8 + speakerBonus
      options.push({
        pick: { playerIndex, kind: 'position', value: p.position },
        score: posScore,
      })
    }
  }

  if (options.length === 0) {
    throw new Error(`No available draft options for player ${String(playerIndex)}`)
  }

  // Sort descending by score
  options.sort((a, b) => b.score - a.score)
  return options[0].pick
}
