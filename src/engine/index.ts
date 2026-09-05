import { playActionCard } from './actionCards'
import { endTactical, endTurn, pass, startTactical } from './actionPhase'
import { assignHits, combatRound, pendingFor, retreat } from './combat'
import { declineReaction } from './reactions'
import { research, shipyard, tradePost } from './componentActions'
import { bombard, endInvasion, groundCombatRound, land, removeCustodians } from './invasion'
import { endMovement, moveShips } from './movement'
import { postAbility } from './postAbilities'
import { produce } from './production'
import { secondary, strategic } from './strategicActions'
import { status } from './statusPhase'
import { pickStrategyCard } from './strategyPhase'
import type { GameState, Move, Result } from './types'

export function applyMove(state: GameState, move: Move, seed: number): Result<GameState> {
  if (state.winner !== null) return { ok: false, error: 'game over' }
  // R4.1 step 4: while hits wait to be assigned, assigning them is the only thing anybody may do
  if (pendingFor(state) && move.type !== 'assignHits') return { ok: false, error: 'hits must be assigned first' }
  // the move is logged before it is dispatched, so it always precedes the dice rolls it produced; a rejected
  // move returns the error and the caller keeps its untouched state, log entry included
  const logged: GameState = { ...state, log: [...state.log, { t: 'move', seat: state.active, move, seed }] }
  try {
    switch (move.type) {
      case 'pickStrategyCard': return pickStrategyCard(logged, move.card)
      case 'startTactical': return startTactical(logged, move.systemId)
      case 'pass': return pass(logged)
      case 'endTactical': return endTactical(logged)
      case 'endTurn': return endTurn(logged)
      case 'moveShips': return moveShips(logged, move.moves)
      case 'endMovement': return endMovement(logged, seed)
      case 'combatRound': return combatRound(logged, move.munitions, seed)
      case 'assignHits': return assignHits(logged, move.destroy, move.sustain, seed)
      case 'retreat': return retreat(logged, move.to)
      case 'bombard': return bombard(logged, move.planetId, seed)
      case 'removeCustodians': return removeCustodians(logged, move.planets, move.tradeGoods)
      case 'land': return land(logged, move.planetId, move.infantryIds, seed)
      case 'groundCombatRound': return groundCombatRound(logged, seed)
      case 'endInvasion': return endInvasion(logged)
      case 'produce': return produce(logged, move.units, move.planets, move.tradeGoods)
      case 'strategic': return strategic(logged, move.card, move.params, seed)
      case 'secondary': return secondary(logged, move.card, move.accept, move.params, seed)
      case 'playActionCard': return playActionCard(logged, move.cardId, move.params)
      case 'research': return research(logged, move.techId)
      case 'shipyard': return shipyard(logged, move.planetId, move.planets, move.tradeGoods)
      case 'tradePost': return tradePost(logged, move.post, move.commodities)
      case 'postAbility': return postAbility(logged, move.post, move.params)
      case 'status': return status(logged, move.params, seed)
      case 'declineReaction': return declineReaction(logged)
      default: {
        // every Move kind is dispatched above; this only runs for a malformed move from outside the type system
        const unknown: never = move
        return { ok: false, error: `not implemented: ${String((unknown as { type?: string }).type)}` }
      }
    }
  } catch (e) {
    // an exception is an engine bug, not a rules rejection; `internal` keeps the two apart for callers
    return { ok: false, error: e instanceof Error ? e.message : String(e), internal: true }
  }
}

export { createGame } from './setup'
export { legalMoves, validateMove } from './legalMoves'
export { isAi } from './types'
export type * from './types'

// Read-only queries the UI derives its controls from. Re-exports only: no new logic, no behaviour change.
export { HAND_LIMIT, PLAYABLE_ACTION_CARDS, actionCardMoves, actionCardName } from './actionCards'
export { ACTION_SPENT, activatableSystems, canPass, otherSeat } from './actionPhase'
export { homeSystemOf } from './board'
export { actingSeat, assignmentComplete, assignmentTargets, canMunitions, pendingFor, retreatTargets } from './combat'
export { canInheritance, canShipyard, inheritanceTechs, postDef, postLinked, shipyardPlanets, tradePostOptions } from './componentActions'
export { capacity, cheapestPlanets, fleetPoolLimit, productionCost, productionLimit, readyInfluence, readyResources } from './economy'
export { bombardablePlanets, groundCombatPending, landablePlanets, removeCustodians } from './invasion'
export { movableShips, movementObstacle, shipsThatCanReach } from './movement'
export { CHARTER_TRADE_GOODS, TIME_TRADE_VP, postAbilityOptions, postAbilityReady } from './postAbilities'
export type { MovementObstacle } from './movement'
export { controlledPlanets, controlsMecatol, scoreable } from './objectives'
export { PRODUCIBLE } from './production'
export { researchable } from './research'
export { deriveSeed } from './rng'
export { unitsOf } from './setup'
export { tokensGained } from './statusPhase'
export { cardOwner, diplomacySystems, secondaryTokenCost, unusedCards, warfareTokenSystems } from './strategicActions'
export { INITIATIVE } from './strategyPhase'
