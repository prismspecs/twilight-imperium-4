import type { PostId } from '../data/posts'
import { otherSeat } from '../engine/actionPhase'
import type {
  GameState,
  Phase,
  Player,
  Seat,
  StrategyCardId,
  System,
  TacticalContext,
  UnitType,
} from '../engine/types'

/**
 * The information one seat is allowed to see about a player. This is the fog-of-war contract for the AI.
 *
 * With action cards in the game, an opponent's hand is concealed: trade goods, commodities, technology
 * and strategy cards are face-down. Mecatol Duel v1 plays no action cards, so every field is currently
 * public and the AI sees the whole board; the abstraction exists so that when cards arrive, only
 * `maskPlayer` needs to change and the scoring code stays untouched.
 */
export interface PublicPlayer {
  seat: Seat
  faction: 'l1z1x' | 'letnev'
  color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'black' | 'orange' | 'pink'
  name: string
  vp: number
  tokens: { tactic: number; fleet: number; strategy: number }
  tradeGoods: number
  commodities: number
  techs: string[]
  strategyCards: { id: StrategyCardId; used: boolean }[]
  passed: boolean
  scoredObjectives: string[]
  scoredMandates: string[]
  resourcesSpentThisRound: number
  spaceCombatWins: number
  trades: number
  tradedThisRound: { west: boolean; east: boolean }
  inheritanceExhausted: boolean
  shipyardUsed: boolean
  pendingInfantry: number
  reinforcements: Record<UnitType, number>
}

/**
 * The full game state from one seat's point of view. Public fields are copied through; the few fields
 * that would be concealed with action cards (the objective order, opponent hidden resources) are handled
 * in `playerView` below. The view is read-only for scoring; the engine still runs on the raw GameState.
 */
export interface GameStateView {
  round: number
  phase: Phase
  speaker: Seat
  active: Seat
  strategyPool: { id: StrategyCardId; bonus: number }[]
  draft: Seat[]
  publicObjectives: string[]
  mecatolCombatWinner: Seat | null
  players: [PublicPlayer, PublicPlayer]
  systems: Record<string, System>
  tactical: TacticalContext | null
  turnDone: boolean
  pendingSecondary: StrategyCardId | null
  statusSubmitted: Seat[]
  posts: { west: PostId; east: PostId }
  postAbilityUsed: { west: boolean; east: boolean }
  winner: Seat | null
}

function forwardPlayer(player: Player): PublicPlayer {
  return { ...player }
}

/**
 * Build the view of `state` from `seat`'s perspective. The own seat keeps its full fields; the opponent's
 * concealed fields are masked here. With no action cards in play everything is public, so both seats are
 * forwarded whole — the masking hook is where card-era hiding will be switched on.
 */
export function playerView(state: GameState, seat: Seat): GameStateView {
  const own = state.players[seat]
  const foe = state.players[otherSeat(seat)]
  return {
    round: state.round,
    phase: state.phase,
    speaker: state.speaker,
    active: state.active,
    strategyPool: state.strategyPool,
    draft: state.draft,
    publicObjectives: state.publicObjectives,
    mecatolCombatWinner: state.mecatolCombatWinner,
    players: [forwardPlayer(own), forwardPlayer(foe)],
    systems: state.systems,
    tactical: state.tactical,
    turnDone: state.turnDone,
    pendingSecondary: state.pendingSecondary,
    statusSubmitted: state.statusSubmitted,
    posts: state.posts,
    postAbilityUsed: state.postAbilityUsed,
    winner: state.winner,
  }
}
