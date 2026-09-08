import { playActionCard } from './actionCards'
import { endTactical, endTurn, pass, startTactical } from './actionPhase'
import { castVote } from './agendas'
import { assignHits, combatRound, pendingFor, retreat } from './combat'
import { declineReaction, openActivationWindow, openCombatWindows, openSustainReactionWindows, pendingReaction, playReactionCard } from './reactions'
import { productionBiomes, research, shipyard } from './componentActions'
import { bombard, endInvasion, groundCombatRound, land, removeCustodians } from './invasion'
import { endMovement, exhaustSpatialConduit, moveShips } from './movement'
import { produce } from './production'
import { secondary, strategic } from './strategicActions'
import { startNextRound, status } from './statusPhase'
import { pickStrategyCard } from './strategyPhase'
import type { GameState, Move, Result } from './types'

export function applyMove(state: GameState, move: Move, seed: number): Result<GameState> {
  if (state.winner !== null) return { ok: false, error: 'game over' }
  // R4.1 step 4: while hits wait to be assigned, assigning them is the only thing anybody may do
  if (pendingFor(state) && move.type !== 'assignHits') return { ok: false, error: 'hits must be assigned first' }
  // R9: while a reaction window is open, the only thing anybody may do is answer it — play a card into it or
  // decline. `playActionCard` here always means "the card played into the window", never a whole action.
  if (pendingReaction(state) && move.type !== 'playActionCard' && move.type !== 'declineReaction') {
    return { ok: false, error: 'R9: a reaction window is open' }
  }
  // the move is logged before it is dispatched, so it always precedes the dice rolls it produced; a rejected
  // move returns the error and the caller keeps its untouched state, log entry included
  const logged: GameState = { ...state, log: [...state.log, { t: 'move', seat: state.active, move, seed }] }
  let result: Result<GameState>
  try {
    switch (move.type) {
      case 'pickStrategyCard': result = pickStrategyCard(logged, move.card); break
      case 'startTactical': {
        const started = startTactical(logged, move.systemId)
        result = started.ok ? { ok: true, value: openActivationWindow(started.value, state.active, move.systemId) } : started
        break
      }
      case 'pass': result = pass(logged); break
      case 'endTactical': result = endTactical(logged); break
      case 'endTurn': result = endTurn(logged); break
      case 'moveShips': result = moveShips(logged, move.moves, seed); break
      case 'endMovement': result = endMovement(logged, seed); break
      case 'exhaustSpatialConduit': result = exhaustSpatialConduit(logged); break
      case 'combatRound': result = combatRound(logged, move.munitions, seed); break
      case 'assignHits': result = assignHits(logged, move.destroy, move.sustain, seed); break
      case 'retreat': result = retreat(logged, move.to); break
      case 'bombard': result = bombard(logged, move.planetId, seed); break
      case 'removeCustodians': result = removeCustodians(logged, move.planets, move.tradeGoods); break
      case 'land': result = land(logged, move.planetId, move.infantryIds, seed); break
      case 'groundCombatRound': result = groundCombatRound(logged, seed); break
      case 'endInvasion': result = endInvasion(logged); break
      case 'produce': result = produce(logged, move.units, move.planets, move.tradeGoods, move.groundTo); break
      case 'strategic': result = strategic(logged, move.card, move.params, seed); break
      case 'secondary': result = secondary(logged, move.card, move.accept, move.params, seed); break
      // R9: a reaction window open means this card answers it, never a fresh whole action
      case 'playActionCard':
        result = pendingReaction(logged) ? playReactionCard(logged, move.cardId, move.params) : playActionCard(logged, move.cardId, move.params, seed)
        break
      case 'research': result = research(logged, move.techId); break
      case 'shipyard': result = shipyard(logged, move.planetId, move.planets, move.tradeGoods); break
      case 'productionBiomes': result = productionBiomes(logged, move.target); break
      case 'status': result = status(logged, move.params, seed); break
      case 'castVote': result = castVote(logged, move.outcome, move.planets, seed, startNextRound); break
      case 'declineReaction': result = declineReaction(logged); break
      default: {
        // every Move kind is dispatched above; this only runs for a malformed move from outside the type system
        const unknown: never = move
        result = { ok: false, error: `not implemented: ${String((unknown as { type?: string }).type)}` }
      }
    }
  } catch (e) {
    // an exception is an engine bug, not a rules rejection; `internal` keeps the two apart for callers
    return { ok: false, error: e instanceof Error ? e.message : String(e), internal: true }
  }
  // R9 Direct Hit: drains any sustains still owed a window before a round is allowed to close; then, "at the
  // start of a combat round" — checked after every move, so the window opens wherever the engine came to rest
  // at the start of one, whatever move brought it there.
  return result.ok ? { ok: true, value: openCombatWindows(openSustainReactionWindows(result.value)) } : result
}

export { createGame } from './setup'
export { legalMoves, validateMove } from './legalMoves'
export { isAi } from './types'
export type * from './types'

// Milty Draft
export { generateSlices, calculateSliceMetrics } from './draft/sliceGenerator'
export type { DraftSlice, DraftSliceMetrics } from './draft/sliceGenerator'
export { createDraftState, applyDraftPick, availablePicksFor, aiDraftPick } from './draft/miltyDraft'
export type { MiltyDraftState, MiltyDraftConfig, DraftPick, DraftPlayer, DraftPosition, PlayerPicks } from './draft/miltyDraft'
export { assembleDraftedGame } from './draft/assembleMap'
export type { AssembledDraftGame } from './draft/assembleMap'

// Read-only queries the UI derives its controls from. Re-exports only: no new logic, no behaviour change.
export { HAND_LIMIT, PLAYABLE_ACTION_CARDS, actionCardMoves, actionCardName } from './actionCards'
export { ACTION_SPENT, activatableSystems, canPass, otherSeat } from './actionPhase'
export { homeSystemOf } from './board'
export { actingSeat, assignmentComplete, assignmentTargets, canMunitions, pendingFor, retreatTargets } from './combat'
export { canInheritance, canProductionBiomes, canShipyard, inheritanceTechs, productionBiomesTargets, shipyardPlanets } from './componentActions'
export { capacity, cheapestPayment, cheapestPlanets, fleetPoolLimit, productionCost, productionLimit, readyInfluence, readyResources } from './economy'
export { bombardablePlanets, groundCombatPending, landablePlanets, removeCustodians } from './invasion'
export { movableShips, movementObstacle, shipsThatCanReach } from './movement'
export type { MovementObstacle } from './movement'
export { controlledPlanets, controlsMecatol, scoreable } from './objectives'
export { PRODUCIBLE, isBlockaded } from './production'
export { researchable } from './research'
export { deriveSeed } from './rng'
export { unitsOf } from './setup'
export { tokensGained } from './statusPhase'
export { agendaMoves, legalOutcomes, readyInfluencePlanets } from './agendas'
export { cardOwner, constructionPlanets, diplomacySystems, secondaryTokenCost, unusedCards, warfareTokenSystems } from './strategicActions'
export { INITIATIVE } from './strategyPhase'
export { PLAYABLE_REACTION_CARDS, pendingReaction, reactingSeat, reactionMoves, skilledRetreatTargets } from './reactions'
export { neighbours } from './adjacency'
