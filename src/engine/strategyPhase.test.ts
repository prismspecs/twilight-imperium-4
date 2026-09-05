import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { createGame } from './setup'
import { INITIATIVE, initiativeOrder } from './strategyPhase'
import { deepFreeze } from './testUtils'
import type { GameConfig, GameState, StrategyCardId } from './types'

const config: GameConfig = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 }

function pick(state: GameState, card: StrategyCardId): GameState {
  const r = applyMove(state, { type: 'pickStrategyCard', card }, 0)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('R3.1 strategy phase', () => {
  it('initiative numbers are the printed ones', () => {
    expect(INITIATIVE).toEqual({ leadership: 1, diplomacy: 2, politics: 3, construction: 4, trade: 5, warfare: 6, technology: 7, imperial: 8 })
  })
  it('a player holding no strategy cards goes last in initiative order', () => {
    const g = createGame(config, 1)
    expect(initiativeOrder(g)).toEqual([0, 1])
  })
  it('legal moves in the strategy phase are one pick per pool card for the drafting player', () => {
    const g = createGame(config, 1)
    expect(legalMoves(g)).toHaveLength(8)
    expect(legalMoves(g).every(m => m.type === 'pickStrategyCard')).toBe(true)
  })
  it('snake draft: speaker, other, other, speaker; wrong player or missing card is rejected', () => {
    const g = createGame(config, 1)
    expect(applyMove({ ...g, active: 1 }, { type: 'pickStrategyCard', card: 'trade' }, 0).ok).toBe(false)
    const s1 = pick(g, 'warfare')
    expect(s1.active).toBe(1); expect(s1.players[0].strategyCards).toEqual([{ id: 'warfare', used: false }])
    expect(applyMove(s1, { type: 'pickStrategyCard', card: 'warfare' }, 0).ok).toBe(false)
    const s2 = pick(s1, 'leadership'); expect(s2.active).toBe(1)
    const s3 = pick(s2, 'imperial'); expect(s3.active).toBe(0)
    const s4 = pick(s3, 'technology')
    expect(s4.phase).toBe('action')
    expect(s4.strategyPool.map(c => [c.id, c.bonus])).toEqual([['diplomacy', 1], ['politics', 1], ['construction', 1], ['trade', 1]])
    expect(s4.active).toBe(1)   // leadership 1 beats warfare 6
    expect(initiativeOrder(s4)).toEqual([1, 0])
    expect(s4.players[0].passed).toBe(false); expect(s4.players[1].passed).toBe(false)
    expect(s4.log.filter(e => e.t === 'move')).toHaveLength(4)
  })
  it('a picked card with bonus trade goods pays them out and resets the bonus', () => {
    const g = createGame(config, 1)
    const pool = g.strategyPool.map(c => c.id === 'trade' ? { ...c, bonus: 2 } : c)
    const s = pick({ ...g, strategyPool: pool }, 'trade')
    expect(s.players[0].tradeGoods).toBe(2)
    expect(s.strategyPool.find(c => c.id === 'trade')).toBeUndefined()
  })
  it('moves of other types are rejected in the strategy phase', () => {
    const g = createGame(config, 1)
    expect(applyMove(g, { type: 'pass' }, 0).ok).toBe(false)
  })
  it('an unknown strategy card is rejected rather than throwing', () => {
    const g = createGame(config, 1)
    expect(applyMove(g, { type: 'pickStrategyCard', card: 'nonsense' as never }, 0).ok).toBe(false)
  })
  it('the full four-pick draft succeeds on a deep-frozen game state', () => {
    const g = deepFreeze(createGame(config, 1))
    const s1 = deepFreeze(pick(g, 'warfare'))
    const s2 = deepFreeze(pick(s1, 'leadership'))
    const s3 = deepFreeze(pick(s2, 'imperial'))
    const s4 = deepFreeze(pick(s3, 'technology'))
    expect(s4.phase).toBe('action')
    expect(s4.draft).toEqual([])
  })

  it('in a 6-player game, each seat drafts one card and the phase cleanly advances to action', () => {
    const config6: GameConfig = {
      players: [
        { faction: 'sol', color: 'blue', name: 'P0' },
        { faction: 'letnev', color: 'red', name: 'P1' },
        { faction: 'hacan', color: 'yellow', name: 'P2' },
        { faction: 'jolnar', color: 'purple', name: 'P3' },
        { faction: 'l1z1x', color: 'green', name: 'P4' },
        { faction: 'xxcha', color: 'orange', name: 'P5' },
      ],
      speaker: 0,
    }
    const g = createGame(config6, 42)
    expect(g.draft).toEqual([0, 1, 2, 3, 4, 5])
    let state = g
    for (let seat = 0; seat < 6; seat++) {
      expect(state.phase).toBe('strategy')
      expect(state.active).toBe(seat)
      const card = state.strategyPool[0].id
      state = pick(state, card)
    }
    expect(state.phase).toBe('action')
    expect(state.draft).toEqual([])
    expect(state.players.every(p => p.strategyCards.length === 1)).toBe(true)
    expect(legalMoves(state).length).toBeGreaterThan(0)
  })

  it('in a 5-player game, each seat drafts one card and the unchosen card gains a trade good bonus', () => {
    const config5: GameConfig = {
      players: [
        { faction: 'sol', color: 'blue', name: 'P0' },
        { faction: 'letnev', color: 'red', name: 'P1' },
        { faction: 'hacan', color: 'yellow', name: 'P2' },
        { faction: 'jolnar', color: 'purple', name: 'P3' },
        { faction: 'l1z1x', color: 'green', name: 'P4' },
      ],
      speaker: 0,
    }
    const g = createGame(config5, 42)
    expect(g.draft).toEqual([0, 1, 2, 3, 4])
    let state = g
    for (let seat = 0; seat < 5; seat++) {
      const card = state.strategyPool[0].id
      state = pick(state, card)
    }
    expect(state.phase).toBe('action')
    expect(state.draft).toEqual([])
    expect(state.strategyPool).toHaveLength(3)
    expect(state.strategyPool.every(c => c.bonus === 1)).toBe(true)
    expect(legalMoves(state).length).toBeGreaterThan(0)
  })

  it('in a 4-player game, each seat drafts two cards in snake order and the pool empties', () => {
    const config4: GameConfig = {
      players: [
        { faction: 'sol', color: 'blue', name: 'P0' },
        { faction: 'letnev', color: 'red', name: 'P1' },
        { faction: 'hacan', color: 'yellow', name: 'P2' },
        { faction: 'jolnar', color: 'purple', name: 'P3' },
      ],
      speaker: 0,
    }
    const g = createGame(config4, 42)
    expect(g.draft).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    let state = g
    for (let pickNo = 0; pickNo < 8; pickNo++) {
      const card = state.strategyPool[0].id
      state = pick(state, card)
    }
    expect(state.phase).toBe('action')
    expect(state.draft).toEqual([])
    expect(state.strategyPool).toHaveLength(0)
    expect(state.players.every(p => p.strategyCards.length === 2)).toBe(true)
    expect(legalMoves(state).length).toBeGreaterThan(0)
  })
})
