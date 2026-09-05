import { reviveInfantry } from './actionPhase'
import type { GameState, Result, Seat, StrategyCardId } from './types'

export const INITIATIVE: Record<StrategyCardId, number> = { leadership: 1, diplomacy: 2, politics: 3, construction: 4, trade: 5, warfare: 6, technology: 7, imperial: 8 }

/**
 * R3.1 N-player strategy draft order, with all eight strategy cards in the pool:
 * 2 to 4 players draft 2 cards each in snake order (e.g. [speaker, other, other, speaker]); 5 and 6 players
 * draft 1 card each, clockwise from the speaker. Four players picking twice is exactly the eight cards.
 */
export function snakeOrder(state: GameState): Seat[] {
  const n = state.players.length
  const seats = Array.from({ length: n }, (_, i) => (state.speaker + i) % n)
  return n <= 4 ? [...seats, ...seats.slice().reverse()] : seats
}

export function initiativeOrder(state: GameState): Seat[] {
  const lowest = (seat: Seat) => {
    const cards = state.players[seat].strategyCards
    if (cards.length === 0) return Infinity   // no card played: goes last
    return Math.min(...cards.map(c => INITIATIVE[c.id]))
  }
  return [...state.players.keys()].sort((a, b) => lowest(a) - lowest(b))
}

export function pickStrategyCard(state: GameState, card: StrategyCardId): Result<GameState> {
  if (state.phase !== 'strategy') return { ok: false, error: 'not in the strategy phase' }
  const seat = state.draft[0]
  if (seat === undefined || seat !== state.active) return { ok: false, error: 'not this player\'s pick' }
  const entry = state.strategyPool.find(c => c.id === card)
  if (!entry) return { ok: false, error: `card ${card} is not available` }
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = { ...player, strategyCards: [...player.strategyCards, { id: card, used: false }], tradeGoods: player.tradeGoods + entry.bonus }
  const draft = state.draft.slice(1)
  let strategyPool = state.strategyPool.filter(c => c.id !== card)
  let next: GameState = { ...state, players, draft, strategyPool, active: draft[0] ?? state.active }
  if (draft.length === 0) {
    strategyPool = strategyPool.map(c => ({ ...c, bonus: c.bonus + 1 }))
    const order = initiativeOrder(next)
    next = reviveInfantry({
      ...next,
      strategyPool,
      phase: 'action',
      active: order[0],
      players: next.players.map(p => ({ ...p, passed: false })),
    }, order[0])
  }
  return { ok: true, value: next }
}
