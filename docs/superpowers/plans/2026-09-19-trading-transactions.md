# Trading (Transactions) Implementation Plan

> **Status:** PLAN — not yet executed. This is the scoping + ordered-steps document the user asked for.
> **Binding authority:** `docs/spec/lrr.md` §Transactions (lines 2755–2791); `docs/spec/game-rules.md` §3.2
> and the unfilled transaction gap noted below. Where this plan and the LRR disagree, the LRR wins.

## Why this exists

Today there is **zero player-to-player trading**. The engine has commodities, trade goods, and the Trade
strategy card (replenish), but no way for one player to hand anything to another. `game-rules.md` §1 says
only "trade goods replenish via the Trade card" — it never mentions transactions. The old two-player
prototype's *custom* "trade posts" were removed as legacy (CLAUDE.md, `docs/spec/unwired.md`); they were a
homebrew subsystem, not the standard TI4 transaction mechanic, so they should **not** be resurrected.

## The authoritative rules (LRR §Transactions, lines 2755–2791)

- A transaction is an exchange of **commodities, trade goods, promissory notes, and relic fragments**.
- During the active player's turn they may resolve **up to one transaction with each neighbor**.
- A transaction may be resolved **at any time during the turn, even during a combat**.
- Either player may give/offer what they want; the exchange need not be even (may be one-sided).
- The players agree on terms **before** any components exchange; after the trade it cannot be undone.
- Deals (non-binding/gentleman's agreements not involving physical components) can be made with anyone;
  a deal that includes a transaction additionally requires the players to be **neighbors**.
- Hacan's Guild Ships lets them trade **action cards** too and negotiate with anyone (still 1 per neighbor
  per turn).
- Agenda phase: while resolving **each** agenda, a player may perform one transaction with **each other**
  player; no neighbor requirement during the agenda phase. (Engine already models agenda phase.)
- The Mentak Pillage ability can steal trade goods on a transaction (faction ability — optional secondary).

Constraints that shape the design (LRR 2761–2771, notes 2782–2789):
- 1 transaction per (active turn, neighbor) pair — track `tradesThisTurn` / analogous.
- Neighbor requirement for action-phase transactions (`adjacency.ts` already computes neighbours).
- Promissory notes are tradable, **but 0 exist yet** (`docs/spec/unwired.md`) — see dependency below.
- Commodities can only be spent by trading them; received commodities become trade goods (LRR 663.5).

## Scope & size

This is a **wide** feature (adds a new subsystem). Realistic pillars, in dependency order:
1. **Engine: a `transaction` move** — one neighbor exchanging commodities/TGs for a trade (with or without
   promissory notes / relic fragments). This is the raw capability.
2. **Two-sided agreement flow** — trading is fundamentally *both* players agreeing. The engine must model
   an offer → accept/reject/counter, or a "transaction window" where both parties commit.
3. **Promissory notes** (data + engine) — tradable, playable cards. Big dependency; without them
   transactions are commodities/TGs only. Ships by itself as its own milestone.
4. **UI** — negotiation panel, offers, accept/counters, and showing what is tradeable.
5. **AI** — bots that make/accept offers. Otherwise trading is human-only.
6. **Pillage / Guild Ships** — faction hooks on top.

Given the breadth, the honest first cut is **pillars 1–2 (engine core) scoped to commodities + trade goods,
no promissory notes yet**, then promissory notes, then UI, then AI. Partial wiring is the norm in this repo
(`docs/spec/unwired.md` says so) — a phase that resolves a transaction but cannot handle notes must *say so*
in the log and in `NOT_FIXED.md`.

## Design decisions (rulings to record in the ledger)

- **Ruling: what can be exchanged in v1.** Commodities and trade goods only. Promissory notes, relic
  fragments, and (Hacan) action cards are explicitly deferred to later phases. This keeps the first
  transaction move small and testable; the LRR table of exchangeable components is the ceiling we expand
  toward. Cost if wrong: a slightly different move shape once notes land — mitigate by keeping the exchange
  payload a flat array keyed by component type now.
- **Ruling: model the agreement as a two-move handshake, not a single atomic move.** TI4's "players agree
  on terms before exchanging" (LRR 2772) is naturally a proposal → acceptance. The active player proposes a
  trade to a neighbor; the neighbor accepts, rejects, or walks away; on accept both are applied atomically.
  This is honest, replayable (seeded), and matches how the human would negotiate. The non-active player's
  turn-input window becomes a tiny "respond to offer" prompt (reuse the existing pending/modal infra from
  reaction windows and secondaries).
- **Ruling: one outstanding offer per pair at a time; the act of proposing does not spend the turn or the
  once-per-pair budget — only a *resolved* transaction does.** Proposals are free try-its; only a completed
  exchange consumes the single transaction-per-neighbor allowance (LRR 2761). Cost if wrong: exploit where
  one player spams proposals — but since a resolution is full and final, the budget is preserved.
- **Ruling: the transaction budget is per (active-turn, neighbor) on the active player.** The same
  neighbour-pair cannot transact twice in one turn. Persist the spent pairs on the player/turn (see state).

## Interface sketch (engine boundary)

```ts
// types.ts — new Move variant
| { type: 'proposeTransaction'; to: Seat; give: Exchange; take: Exchange }
| { type: 'acceptTransaction' }        // resolves the outstanding proposal atomically
| { type: 'rejectTransaction' }        // closes the proposal; nothing exchanged

interface Exchange { commodities?: number; tradeGoods?: number }   // notes/relics later

// GameState additions
tradesThisTurn: [number, number][]        // seat pairs that already transacted this active turn
pendingProposal: {
  from: Seat; to: Seat; give: Exchange; take: Exchange
} | null                                   // the one outstanding offer (only readable by `to`)

// new module src/engine/transactions.ts
export function canPropose(state, seat, to, give, take): Result<true>  // neighbors, budget, valid counts
export function proposeTransaction(state, seat, to, give, take): Result<GameState>
export function acceptTransaction(state, seat): Result<GameState>       // seat === pendingProposal.to
export function rejectTransaction(state, seat): Result<GameState>
export function transactionPartners(state, seat): Seat[]               // who `seat` may deal with now
```

Wiring seams (each gets a test):
- `legalMoves.ts` — offer `proposeTransaction` per viable neighbor during the active player's turn (action
  phase AND during each agenda); offer `acceptTransaction`/`rejectTransaction` to the non-active `to` seat
  while a proposal targets them.
- `index.ts applyMove` — dispatch the three new move types.
- `adjacency.ts` — neighbour predicate reused for the neighbor gate (Guild Ships/agenda relax it later).

## Ordered steps

### Phase A — engine core: transactions on commodities + trade goods (no notes)
- [ ] A1. `src/engine/transactions.ts` with `canPropose`/`proposeTransaction` (handshake), gating on:
      action- or agenda-phase, active player (or agenda allowance), neighbor (LRR 2761/2771),
      once-per-pair-per-turn budget, non-negative whole counts, both sides actually own what they give.
      Reject with `R8:`/`LRR 27xx:` messages. Apply exchange atomically; received commodities become
      trade goods (LRR 663.5). Add `tradesThisTurn` bookkeeping and a `pendingProposal` to state.
- [ ] A2. `acceptTransaction`/`rejectTransaction` (only the proposal's `to` may answer; reject is free,
      accept applies the give/take). After resolution, record the pair in `tradesThisTurn`, clear
      `pendingProposal`. Reject/accept do **not** spend the active player's action.
- [ ] A3. Move types in `types.ts`; wire `legalMoves.ts` + `index.ts` dispatch so the UI can drive it.
- [ ] A4. Tests (red-first) in `src/engine/transactions.test.ts`: successful even trade; one-sided gift;
      not-neighbors rejected; two transactions with same neighbor in one turn rejected (second);
      6-player each-pair-once; commodities→trade-goods conversion; accepting with insufficient goods
      rejected; reject leaves state unchanged; replay determinism via `fullGame.test.ts`.
- [ ] A5. Spec edits to `game-rules.md` §3.2 (transactions paragraph) documenting the v1 scope and the
      note/action-card gap → `NOT_FIXED.md`. Full `npm test && npx tsc && npm run lint`, commit.
- **Gate:** transactions of commodities/TGs fully playable and tested in the engine.

### Phase B — promissory notes (tradable cards)
- [ ] B1. `src/data/promissory_notes.ts` — 6 notes per the base game (Wait: game-rules.md header says "6
      promissory notes"; LRR lists many more across factions). Start with the universally-relevant notes
      and record the rest in `NOT_FIXED.md`; add to `Exchange` (a note id, max one per side, LRR 2010.5).
- [ ] B2. Player hand field + give/take of notes in the exchange; returned-when-activated mechanics from
      the LRR (e.g. Trade Agreement, Dark Pact) where the ability is implemented; otherwise log the gap.
- [ ] B3. Playable effects for the notes implemented this pass; tests; commit.

### Phase C — UI
- [ ] C1. When a proposal targets a human seat, surface a negotiation modal (reuse reaction/secondary
      modal infra) showing give/take and Accept/Reject.
- [ ] C2. On the active human's turn, a "Trade" affordance listing transaction partners (from
      `transactionPartners`) with sliders/pickers for commodities/TGs.
- [ ] C3. Race-guard UI mockups + drafts; component tests; commit.

### Phase D — AI (bots trade too)
- [ ] D1. `aiChoose` recognises propose/accept/reject and adds a basic heuristic: sell surplus commodities
      to friendly neighbors for trade goods; accept favourable/near-even offers; decline exploitative ones.
- [ ] D2. Stress test with bots trading; verify `npm run ai:stress` still ends `no failures`, replay stays
      deterministic. Commit.

### Deferred (record in `NOT_FIXED.md`, not silently stubbed)
- Hacan Guild Ships action-card trading + negotiate-with-anyone; Mentak Pillage on transactions; relic
  fragments and relics; notes not implemented in Phase B; agenda-phase per-agenda per-player budget
  (if Phase A is action-only, the agenda allowance is logged as a gap).

## Key files to touch
- `src/engine/types.ts` (Move union, GameState trade fields)
- `src/engine/transactions.ts` (new)
- `src/engine/legalMoves.ts`, `src/engine/index.ts` (enumeration + dispatch)
- `src/engine/adjacency.ts` (neighbours reuse)
- `src/data/promissory_notes.ts` (new, Phase B)
- `src/engine/transactions.test.ts` (new) + `fullGame.test.ts` (replay)
- `src/engine/ai*.ts` (Phase D)
- `docs/spec/game-rules.md` §3.2, `NOT_FIXED.md`

## Relationships to existing code
- **Reuse not reinvent:** the pending/modal secondaries + reaction-window infra (`reactions.ts`,
  `pendingSecondary`) for the accept/reject prompt; `adjacency.neighbours` for the neighbor gate;
  `FACTIONS[].commodityValue` and the `Player.tradeGoods/commodities` fields already on state.
- **Delegate/enhance:** the action-phase "who may act" enumeration in `legalMoves.ts` is the single
  extension point; the old trade-post code is dead and should stay dead.
