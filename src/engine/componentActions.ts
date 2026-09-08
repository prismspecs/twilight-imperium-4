import { TECHS } from '../data/techs'
import { ACTION_SPENT } from './actionPhase'
import { cheapestPlanets, payCost } from './economy'
import { canResearch } from './research'
import { grantTech } from './strategicActions'
import type { GameState, Result, Seat } from './types'

const INHERITANCE_COST = 2

/**
 * R3.2/R8: your own turn in the action phase, with no tactical action running and no open secondary window.
 * A spent turn (`turnDone`) passes this check on purpose: R8 calls trading at a post free rather than an
 * action, and the whole point of ending an action without ending the turn is that the free moves are still
 * open afterwards. Narrowing kept from TI4: the sale still needs a quiet moment, so it is refused in the
 * middle of a tactical action, inside a secondary window and after the seat has passed for the round.
 * The two real component actions add their own `turnDone` guard on top, because they are actions.
 */
export function turnReady(state: GameState): Result<Seat> {
  if (state.phase !== 'action') return { ok: false, error: 'not in the action phase' }
  if (state.tactical) return { ok: false, error: 'finish the tactical action first' }
  if (state.pendingSecondary) return { ok: false, error: 'R3.2: a secondary window is open' }
  const seat = state.active
  if (state.players[seat].passed) return { ok: false, error: 'this player has passed' }
  return { ok: true, value: seat }
}

/** R3.2: a component action is an action, so a turn that already spent one may not take another. */
function actionReady(state: GameState): Result<Seat> {
  const ready = turnReady(state)
  if (!ready.ok) return ready
  if (state.turnDone) return { ok: false, error: ACTION_SPENT }
  return ready
}

export function canInheritance(state: GameState, seat: Seat): boolean {
  const player = state.players[seat]
  return player.techs.includes('inheritance_systems') && !player.inheritanceExhausted
    && cheapestPlanets(state, seat, INHERITANCE_COST) !== null
}

/** R5/R6: Inheritance Systems ignores the prerequisites, so every technology of the faction is open. */
export function inheritanceTechs(state: GameState, seat: Seat): string[] {
  return TECHS.map(t => t.id).filter(id => canResearch(state.players[seat], id, true))
}

export function research(state: GameState, techId: string): Result<GameState> {
  const ready = actionReady(state)
  if (!ready.ok) return ready
  const seat = ready.value
  const player = state.players[seat]
  if (!player.techs.includes('inheritance_systems')) return { ok: false, error: 'R6: Inheritance Systems is not owned' }
  if (player.inheritanceExhausted) return { ok: false, error: 'R6: Inheritance Systems is exhausted' }
  const planets = cheapestPlanets(state, seat, INHERITANCE_COST)
  if (!planets) return { ok: false, error: `R6: ${INHERITANCE_COST} resources are needed` }
  const paid = payCost(state, seat, INHERITANCE_COST, planets, 0)
  if (!paid.ok) return paid
  const granted = grantTech(paid.value, seat, techId, true)
  if (!granted.ok) return granted
  const players = [...granted.value.players] as GameState['players']
  players[seat] = { ...players[seat], inheritanceExhausted: true }
  // R3.2: the action is spent, the turn is not; `endTurn` hands it over
  return { ok: true, value: { ...granted.value, players, turnDone: true } }
}

export function canProductionBiomes(state: GameState, seat: Seat): boolean {
  const player = state.players[seat]
  return player.techs.includes('production_biomes') && !player.productionBiomesExhausted && player.tokens.strategy >= 1
}

/** Hacan faction tech Production Biomes: every other seat is a legal choice for the 2-trade-good gift. */
export function productionBiomesTargets(state: GameState, seat: Seat): Seat[] {
  return state.players.map((_, i) => i as Seat).filter(i => i !== seat)
}

/**
 * Hacan faction tech Production Biomes: "Action: Exhaust this card and spend 1 token from your strategy pool
 * to gain 4 trade goods and choose 1 other player; that player gains 2 trade goods."
 */
export function productionBiomes(state: GameState, target: Seat): Result<GameState> {
  const ready = actionReady(state)
  if (!ready.ok) return ready
  const seat = ready.value
  const player = state.players[seat]
  if (!canProductionBiomes(state, seat)) return { ok: false, error: 'R6: Production Biomes is not available' }
  if (!productionBiomesTargets(state, seat).includes(target)) return { ok: false, error: 'R6: name another player' }
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...player,
    productionBiomesExhausted: true,
    tokens: { ...player.tokens, strategy: player.tokens.strategy - 1 },
    tokensSpentThisRound: player.tokensSpentThisRound + 1,
    tradeGoods: player.tradeGoods + 4,
  }
  players[target] = { ...players[target], tradeGoods: players[target].tradeGoods + 2 }
  // R3.2: the action is spent, the turn is not; `endTurn` hands it over
  return {
    ok: true,
    value: {
      ...state, players, turnDone: true,
      log: [...state.log, { t: 'info', text: `seat ${seat} uses Production Biomes: gains 4 trade goods, seat ${target} gains 2` }],
    },
  }
}
