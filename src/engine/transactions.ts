import { neighbours } from './adjacency'
import type { GameState, Move, Result, Seat } from './types'

/**
 * Trading — the LRR "Transactions" rules (§docs/spec/lrr.md lines 2755–2791).
 *
 * A transaction is an exchange of commodities and trade goods between two players. v1 scope: commodities
 * and trade goods only — promissory notes, relic fragments and (Hacan) action cards are deferred (see
 * `docs/superpowers/plans/2026-09-19-trading-transactions.md` and NOT_FIXED).
 *
 * The engine models the "players agree on terms before exchanging" rule as a two-move handshake:
 *   - the active player proposes a trade to a neighbor (`proposeTransaction`);
 *   - the target either accepts (`acceptTransaction`, applies the give/take atomically) or rejects
 *     (`rejectTransaction`, nothing exchanged).
 * Proposing never spends the active player's action, and only a *resolved* transaction consumes the
 * once-per-(turn, neighbor) budget (LRR 2761).
 */

export interface Exchange {
  commodities?: number
  tradeGoods?: number
}

/** The single outstanding proposal, or null once none is live. */
export interface PendingProposal {
  from: Seat
  to: Seat
  give: Exchange
  take: Exchange
}

/** All system ids where `seat` has a presence: owns a planet, or has any unit/structure on the board. */
function seatSystems(state: GameState, seat: Seat): string[] {
  const out: string[] = []
  for (const [id, sys] of Object.entries(state.systems)) {
    if (sys.home === seat) { out.push(id); continue }
    let present = sys.space.some(u => u.owner === seat)
    if (!present) for (const p of sys.planets) {
      if (p.owner === seat || p.ground.some(u => u.owner === seat) || p.structures.some(u => u.owner === seat)) { present = true; break }
    }
    if (present) out.push(id)
  }
  return out
}

/**
 * LRR "Neighbors": two players are neighbors when either player's units or structures are in a system that
 * is adjacent to, or the same as, a system containing the other player's units or structures.
 */
export function areNeighbors(state: GameState, a: Seat, b: Seat): boolean {
  if (a === b) return false
  const aSys = seatSystems(state, a)
  const bSys = new Set(seatSystems(state, b))
  for (const id of aSys) {
    if (bSys.has(id)) return true
    for (const nid of neighbours(state.systems, id, state.players[a].faction, false, state)) {
      if (bSys.has(nid)) return true
    }
  }
  return false
}

/** The seats `seat` may currently resolve a transaction with, in the action phase. */
export function transactionPartners(state: GameState, seat: Seat): Seat[] {
  if (state.phase !== 'action' || state.turnDone) return []
  const out: Seat[] = []
  for (let i = 0; i < state.players.length; i++) {
    const other = i as Seat
    if (other === seat || !areNeighbors(state, seat, other)) continue
    if (tradedWith(state, seat, other)) continue
    out.push(other)
  }
  return out
}

/**
 * Concrete, always-playable `proposeTransaction` moves, one per neighbor not yet traded with, using a
 * simple default exchange (one commodity for one trade good). The UI replaces give/take with the player's
 * real terms in Phase C; the engine only ever promises a move it can resolve as-is (LRR 683.3).
 */
export function transactionOffers(state: GameState, seat: Seat): Move[] {
  if (!canPropose(state).ok) return []
  const out: Move[] = []
  for (const other of transactionPartners(state, seat)) {
    const from = state.players[seat]
    const to = state.players[other]
    const give = from.commodities > 0 ? { commodities: 1 } : from.tradeGoods > 0 ? { tradeGoods: 1 } : null
    const take = to.tradeGoods > 0 ? { tradeGoods: 1 } : to.commodities > 0 ? { commodities: 1 } : null
    if (!give || !take) continue
    if (canProposeTransaction(state, other, give, take).ok) out.push({ type: 'proposeTransaction', to: other, give, take })
  }
  return out
}

function tradedWith(state: GameState, a: Seat, b: Seat): boolean {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return (state.tradesThisTurn ?? []).some(([x, y]) => x === lo && y === hi)
}

function ok(x: boolean, error: string): Result<true> {
  return x ? { ok: true, value: true } : { ok: false, error }
}

function validateExchange(state: GameState, seat: Seat, ex: Exchange | undefined, what: string): Result<true> {
  const c = ex?.commodities ?? 0
  const g = ex?.tradeGoods ?? 0
  if (c < 0 || g < 0 || !Number.isInteger(c) || !Number.isInteger(g)) return ok(false, `${what} must be non-negative whole numbers`)
  if (state.players[seat].commodities < c) return ok(false, `seat ${seat} does not own ${c} commodities to ${what}`)
  if (state.players[seat].tradeGoods < g) return ok(false, `seat ${seat} does not own ${g} trade goods to ${what}`)
  return ok(true, '')
}

function isEmptyExchange(ex: Exchange | undefined): boolean {
  return (ex?.commodities ?? 0) === 0 && (ex?.tradeGoods ?? 0) === 0
}

/**
 * R8/transactions gate for the active player proposing a trade. Does not check the specific give/take
 * counts (`canPropose` does that); this is the coarse "may you even open a transaction right now" gate.
 */
export function canPropose(state: GameState): Result<true> {
  if (state.phase !== 'action') return ok(false, 'transactions happen in the action phase')
  if (state.pendingProposal) return ok(false, 'a transaction is already outstanding — the target must accept or reject it')
  if (state.pendingSecondary) return ok(false, 'R3.2: the current secondary window must close first')
  if (state.tactical) return ok(false, 'finish the tactical action first')   // v1: no mid-combat transactions (LRR 2786 deferred)
  if (state.turnDone) return ok(false, 'R3.2: end the turn first, transactions are not a free move after the action')
  const seat = state.active
  if (state.players[seat].passed) return ok(false, 'this player has passed')
  return ok(true, '')
}

/** Full legality for one concrete proposal: gate + neighbor + not-already-traded + both sides own their terms.
 * `give` is what the PROPOSER offers; `take` is what the PROPOSER asks in return. Either side may be empty
 * (a one-sided gift is legal), but the whole transaction cannot be empty. */
export function canProposeTransaction(state: GameState, to: Seat, give: Exchange, take: Exchange): Result<true> {
  const gate = canPropose(state)
  if (!gate.ok) return gate
  const from = state.active
  if (to === from || to < 0 || to >= state.players.length) return ok(false, 'you cannot trade with yourself')
  if (!areNeighbors(state, from, to)) return ok(false, 'R8: you may only transact with a neighbor')
  if (tradedWith(state, from, to)) return ok(false, 'R8: you have already resolved a transaction with that player this turn')
  if (isEmptyExchange(give) && isEmptyExchange(take)) return ok(false, 'R8: a transaction must exchange at least one commodity, trade good or (later) other component')
  const g = validateExchange(state, from, give, 'give')
  if (!g.ok) return g
  // `take` is paid by the TARGET, so it is the target who must own it
  const t = validateExchange(state, to, take, 'take')
  if (!t.ok) return t
  return ok(true, '')
}

export function proposeTransaction(state: GameState, to: Seat, give: Exchange, take: Exchange): Result<GameState> {
  const check = canProposeTransaction(state, to, give, take)
  if (!check.ok) return check
  const from = state.active
  const proposed: GameState = {
    ...state,
    pendingProposal: { from, to, give, take },
    active: to,   // mirror the pendingSecondary handoff: the target seat must answer before the turn resumes
    log: [...state.log, { t: 'info', text: `seat ${from} proposes a transaction with seat ${to}` }],
  }
  return { ok: true, value: proposed }
}

function applyExchange(state: GameState, seat: Seat, ex: Exchange): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...players[seat],
    commodities: players[seat].commodities - (ex.commodities ?? 0),
    tradeGoods: players[seat].tradeGoods - (ex.tradeGoods ?? 0),
  }
  return { ...state, players }
}

/** A received commodity converts to a trade good (LRR 663.5); received trade goods stay trade goods. */
function receiveExchange(state: GameState, seat: Seat, ex: Exchange): GameState {
  const players = [...state.players] as GameState['players']
  const c = ex.commodities ?? 0
  const g = ex.tradeGoods ?? 0
  players[seat] = { ...players[seat], commodities: players[seat].commodities, tradeGoods: players[seat].tradeGoods + c + g }
  return { ...state, players }
}

export function acceptTransaction(state: GameState): Result<GameState> {
  const p = state.pendingProposal
  if (!p) return { ok: false, error: 'no transaction is outstanding' }
  if (state.active !== p.to) return { ok: false, error: 'only the player the transaction is proposed to may accept it' }
  // Re-validate ownership at the moment of acceptance: the proposer must still own `give` (what they offer)
  // and the target must still own `take` (what they pay in return).
  const g = validateExchange(state, p.from, p.give, 'give')
  if (!g.ok) return g
  const t = validateExchange(state, p.to, p.take, 'take')
  if (!t.ok) return t
  // apply: the proposer gives `give` to the target; the target gives `take` to the proposer
  let next = applyExchange(state, p.from, p.give)
  next = receiveExchange(next, p.to, p.give)
  next = applyExchange(next, p.to, p.take)
  next = receiveExchange(next, p.from, p.take)
  const lo = Math.min(p.from, p.to)
  const hi = Math.max(p.from, p.to)
  next = {
    ...next,
    pendingProposal: null,
    active: p.from,   // hand the turn back to the proposer
    tradesThisTurn: [...(next.tradesThisTurn ?? []), [lo, hi]],
    log: [...next.log, { t: 'info', text: `seat ${p.from} and seat ${p.to} resolve a transaction` }],
  }
  return { ok: true, value: next }
}

export function rejectTransaction(state: GameState): Result<GameState> {
  const p = state.pendingProposal
  if (!p) return { ok: false, error: 'no transaction is outstanding' }
  if (state.active !== p.to) return { ok: false, error: 'only the player the transaction is proposed to may reject it' }
  return {
    ok: true,
    value: {
      ...state,
      pendingProposal: null,
      active: p.from,
      log: [...state.log, { t: 'info', text: `seat ${p.to} declines the transaction from seat ${p.from}` }],
    },
  }
}
