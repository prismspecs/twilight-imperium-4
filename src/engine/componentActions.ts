import { TRADE_POSTS } from '../data/map'
import { POSTS, type PostDef } from '../data/posts'
import { TECHS } from '../data/techs'
import { ACTION_SPENT } from './actionPhase'
import { cheapestPlanets, payCost } from './economy'
import { controlledPlanets } from './objectives'
import { canResearch } from './research'
import { unitsOf } from './setup'
import { grantTech } from './strategicActions'
import type { GameState, Result, Seat, Unit } from './types'

const INHERITANCE_COST = 2
export const SHIPYARD_COST = 4

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

export function canShipyard(state: GameState, seat: Seat): boolean {
  const player = state.players[seat]
  return !player.shipyardUsed && player.tokens.strategy >= 1 && player.reinforcements.spacedock >= 1
    && !unitsOf(state, seat).some(u => u.type === 'spacedock')
    && cheapestPlanets(state, seat, SHIPYARD_COST) !== null
    && controlledPlanets(state, seat).length > 0
}

export function shipyardPlanets(state: GameState, seat: Seat): string[] {
  return controlledPlanets(state, seat).map(p => p.planetId)
}

/** R6: once per game, only without a space dock, one strategy token plus 4 resources. */
export function shipyard(state: GameState, planetId: string, planets: string[], tradeGoods: number): Result<GameState> {
  const ready = actionReady(state)
  if (!ready.ok) return ready
  const seat = ready.value
  const player = state.players[seat]
  if (player.shipyardUsed) return { ok: false, error: 'R6: the emergency shipyard is used up' }
  if (unitsOf(state, seat).some(u => u.type === 'spacedock')) return { ok: false, error: 'R6: only while you control no space dock' }
  if (player.reinforcements.spacedock < 1) return { ok: false, error: 'no space dock in the reinforcements' }
  if (player.tokens.strategy < 1) return { ok: false, error: 'R6: no token in the strategy pool' }
  const sysId = Object.keys(state.systems).find(id => state.systems[id].planets.some(p => p.id === planetId))
  if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
  const target = state.systems[sysId].planets.find(p => p.id === planetId)
  if (!target || target.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
  const paid = payCost(state, seat, SHIPYARD_COST, planets, tradeGoods)
  if (!paid.ok) return paid
  const dock: Unit = { id: paid.value.nextUnitId, type: 'spacedock', owner: seat, damaged: false }
  const players = [...paid.value.players] as GameState['players']
  const me = players[seat]
  players[seat] = {
    ...me, shipyardUsed: true,
    tokens: { ...me.tokens, strategy: me.tokens.strategy - 1 },
    tokensSpentThisRound: me.tokensSpentThisRound + 1,
    reinforcements: { ...me.reinforcements, spacedock: me.reinforcements.spacedock - 1 },
  }
  const sys = paid.value.systems[sysId]
  // R3.2: the action is spent, the turn is not; `endTurn` hands it over
  return {
    ok: true,
    value: {
      ...paid.value, players, nextUnitId: paid.value.nextUnitId + 1, turnDone: true,
      systems: {
        ...paid.value.systems,
        [sysId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, structures: [...p.structures, dock] } : p) },
      },
      log: [...paid.value.log, { t: 'info', text: `seat ${seat} builds an emergency space dock on ${planetId}` }],
    },
  }
}

/** R8: the post in play on that side this round. */
export function postDef(state: GameState, post: 'west' | 'east'): PostDef {
  return POSTS[state.posts[post]]
}

/** R8: whether the seat controls a planet in one of the two systems the post serves. */
export function postLinked(state: GameState, seat: Seat, post: 'west' | 'east'): boolean {
  // trade posts are a duel-board mechanic; on a generated galaxy their systems are simply absent
  return TRADE_POSTS[post].some(id => {
    const sys = state.systems[id]
    return sys !== undefined && sys.planets.some(p => p.owner === seat)
  })
}

/** R8: the posts a seat may still sell commodities at this round. */
export function tradePostOptions(state: GameState, seat: Seat): ('west' | 'east')[] {
  const player = state.players[seat]
  if (player.commodities < 1) return []
  return (['west', 'east'] as const).filter(post => !player.tradedThisRound[post] && postLinked(state, seat, post))
}

/**
 * R8: commodities for 1 trade good each, once per round per post per player; the turn goes on. How many one
 * sale takes is the post's own `commodityLimit`, so a Sarnex Wheel takes four from the round it arrives in.
 */
export function tradePost(state: GameState, post: 'west' | 'east', commodities: number): Result<GameState> {
  const ready = turnReady(state)
  if (!ready.ok) return ready
  const seat = ready.value
  const player = state.players[seat]
  const limit = postDef(state, post).commodityLimit
  if (!Number.isInteger(commodities) || commodities < 1 || commodities > limit) return { ok: false, error: `R8: 1 to ${limit} commodities` }
  if (commodities > player.commodities) return { ok: false, error: 'R8: not enough commodities' }
  if (player.tradedThisRound[post]) return { ok: false, error: `R8: the ${post} post is already used this round` }
  if (!postLinked(state, seat, post)) {
    return { ok: false, error: `R8: no planet controlled in a system linked to the ${post} post` }
  }
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...player,
    commodities: player.commodities - commodities,
    tradeGoods: player.tradeGoods + commodities,
    tradedThisRound: { ...player.tradedThisRound, [post]: true },
    trades: player.trades + 1,
  }
  return {
    ok: true,
    value: {
      ...state, players,
      log: [...state.log, { t: 'info', text: `seat ${seat} sells ${commodities} commodities at the ${post} post, the ${postDef(state, post).name}` }],
    },
  }
}
