import { describe, it, expect } from 'vitest'
import { toActionPhase, withUnits, withPlayer, withThirdSeat } from './testUtils'
import {
  acceptTransaction,
  areNeighbors,
  canPropose,
  canProposeTransaction,
  proposeTransaction,
  rejectTransaction,
  transactionOffers,
  transactionPartners,
} from './transactions'
import { legalMoves } from './index'
import { passTurn } from './actionPhase'
import type { GameState, Result, Seat } from './types'

/** Unwrap a successful result, throwing on failure so the caller's `.value` narrows. */
function resolve<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Action phase with seat 0 active, seats 0 and 1 made neighbors (a seat-1 carrier sits in home-0). */
function base(seed = 1, active: Seat = 0): GameState {
  let s = toActionPhase(seed, active)
  s = withUnits(s, 'home-0', 1, ['carrier'])   // seat 1 present in seat 0's home => share a system => neighbors
  return s
}

/** Same but with explicit commodity/trade-good holdings for both seats. */
function rigged(com0 = 0, tg0 = 0, com1 = 0, tg1 = 0): GameState {
  return withPlayer(withPlayer(base(), 0, { commodities: com0, tradeGoods: tg0 }), 1, { commodities: com1, tradeGoods: tg1 })
}

describe('areNeighbors', () => {
  it('false when no shared/adjacent system', () => {
    expect(areNeighbors(toActionPhase(1, 0), 0, 1)).toBe(false)
  })
  it('true when a unit of the other seat occupies the same system', () => {
    expect(areNeighbors(base(), 0, 1)).toBe(true)
  })
})

describe('canPropose / proposeTransaction', () => {
  it('rejects a proposal to a non-neighbor', () => {
    const s = toActionPhase(1, 0)
    expect(canProposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }).ok).toBe(false)
  })
  it('rejects when the proposer does not own what they give', () => {
    const s = rigged(0, 0, 2, 2)
    expect(canProposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }).ok).toBe(false)
  })
  it('rejects when the target cannot give what they agreed to take-side', () => {
    const s = rigged(2, 2, 0, 0)
    expect(canProposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }).ok).toBe(false)
  })
  it('rejects an empty exchange', () => {
    const s = rigged(0, 0, 0, 0)
    expect(canProposeTransaction(s, 1, {}, {}).ok).toBe(false)
  })
  it('rejects a self-proposal', () => {
    const s = rigged(2, 2, 2, 2)
    expect(canProposeTransaction(s, 0, { commodities: 1 }, { tradeGoods: 1 }).ok).toBe(false)
  })
  it('opens a proposal: sets pendingProposal and hands active to the target', () => {
    const s = rigged(2, 2, 2, 2)
    expect(canPropose(s).ok).toBe(true)
    const next = resolve(proposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }))
    expect(next.pendingProposal).toEqual({ from: 0, to: 1, give: { commodities: 1 }, take: { tradeGoods: 1 } })
    expect(next.active).toBe(1)
    expect(next.turnDone).toBe(false) // proposing is free
  })
  it('does not let the proposer open a second proposal while one is live', () => {
    const s = rigged(2, 2, 2, 2)
    const next = resolve(proposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }))
    expect(canPropose(next).ok).toBe(false)
  })
  it('rejects a proposal during an open pendingSecondary', () => {
    const s = { ...rigged(2, 2, 2, 2), pendingSecondary: { card: 'warfare' as const, owner: 0, queue: [1] } }
    expect(canPropose(s).ok).toBe(false)
  })
})

describe('acceptTransaction', () => {
  it('applies the exchange atomically and returns the turn to the proposer', () => {
    const s = resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))
    const next = resolve(acceptTransaction(s))
    // seat 0: gave 1 commodity, received 1 trade good
    expect(next.players[0].commodities).toBe(1)
    expect(next.players[0].tradeGoods).toBe(3)
    // seat 1: gave 1 trade good, received 1 commodity — which converts to a trade good (LRR 663.5)
    expect(next.players[1].commodities).toBe(2)
    expect(next.players[1].tradeGoods).toBe(2)
    expect(next.pendingProposal).toBeNull()
    expect(next.active).toBe(0)
    expect(next.tradesThisTurn).toEqual([[0, 1]])
  })
  it('a received commodity converts to a trade good (LRR 663.5)', () => {
    // seat 0 gives nothing, receives 1 commodity from seat 1 → +1 trade good, +1 commodity
    const s = resolve(proposeTransaction(rigged(0, 0, 2, 0), 1, {}, { commodities: 1 }))
    const next = resolve(acceptTransaction(s))
    expect(next.players[0].commodities).toBe(0)
    expect(next.players[0].tradeGoods).toBe(1)
    expect(next.players[1].commodities).toBe(1)
  })
  it('can only be executed by the target seat', () => {
    const s = resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))
    const a = acceptTransaction({ ...s, active: 0 })
    expect(a.ok).toBe(false)
  })
})

describe('rejectTransaction', () => {
  it('clears the proposal without exchanging and returns the turn to the proposer', () => {
    const s = resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))
    const next = resolve(rejectTransaction(s))
    expect(next.pendingProposal).toBeNull()
    expect(next.active).toBe(0)
    expect(next.players[0].commodities).toBe(2)
    expect(next.players[1].tradeGoods).toBe(2)
    expect(next.tradesThisTurn).toEqual([]) // rejection does not consume the per-neighbor budget
  })
})

describe('per-neighbor budget and turn lifecycle', () => {
  it('blocks a second transaction with the same neighbor in the same turn', () => {
    const s = resolve(acceptTransaction(resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))))
    expect(canProposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }).ok).toBe(false)
    expect(transactionPartners(s, 0)).toEqual([])
  })
  it('resets the budget when the turn is handed on', () => {
    const s = resolve(acceptTransaction(resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))))
    const next = passTurn(s)
    expect(next.tradesThisTurn).toEqual([])
  })
  it('a transaction with one neighbor does not consume a different neighbor\'s budget (independent pairs)', () => {
    // seat 0 neighbors both seat 1 and seat 2 (each parks a ship in home-0)
    let s = withThirdSeat(base())
    s = withUnits(s, 'home-0', 2, ['carrier'])
    s = withPlayer(withPlayer(withPlayer(s, 0, { commodities: 2, tradeGoods: 2 }), 1, { commodities: 0, tradeGoods: 2 }), 2, { commodities: 2, tradeGoods: 0 })
    // resolve a transaction with seat 1
    s = resolve(acceptTransaction(resolve(proposeTransaction(s, 1, { commodities: 1 }, { tradeGoods: 1 }))))
    // seat 0 has now traded with 1 but not with 2, so 2 is still a live partner
    expect(transactionPartners(s, 0)).toEqual([2])
    const r = proposeTransaction(s, 2, { commodities: 1 }, { commodities: 1 })
    expect(r.ok).toBe(true)
  })
  it('replay determinism: re-running the same seeded flow yields an identical state', () => {
    const run = () => resolve(acceptTransaction(resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))))
    expect(run()).toEqual(run())
  })
})

describe('legalMoves integration', () => {
  it('offers transactionOffers to the active player for a neighbor', () => {
    const s = rigged(2, 2, 2, 2)
    const offers = transactionOffers(s, 0)
    expect(offers.some(m => m.type === 'proposeTransaction' && m.to === 1)).toBe(true)
  })
  it('offers the target seat only accept/reject while a proposal is live', () => {
    const s = resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))
    const moves = legalMoves(s)   // state.active is the proposal target (1)
    const types = moves.map(m => m.type)
    expect(types).toContain('acceptTransaction')
    expect(types).toContain('rejectTransaction')
    expect(types).not.toContain('activate')
    expect(types).not.toContain('pass')
  })
  it('freezes the proposer out of normal turns while a proposal is live', () => {
    const s = resolve(proposeTransaction(rigged(2, 2, 2, 2), 1, { commodities: 1 }, { tradeGoods: 1 }))
    // even though the proposer (0) still has an unspent action, active is the target; the only legal moves
    // anywhere are the target's accept/reject — no activate, pass or secondary is offered on the board
    const types = legalMoves(s).map(m => m.type)
    expect(types).toEqual(['acceptTransaction', 'rejectTransaction'])
  })
})
