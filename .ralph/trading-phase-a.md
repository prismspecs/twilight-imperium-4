# Phase A — Engine core: transactions on commodities + trade goods

Implement the engine core of TI4 transactions in the mecatol-online repo (see docs/superpowers/plans/2026-09-19-trading-transactions.md). Two-sided handshake:
- active player proposes a transaction to a neighbor (proposeTransaction move)
- the neighbor may accept (applies exchange atomically) or reject (nothing exchanged)
- 1 transaction per (active-turn, neighbor) pair; only a resolved transaction consumes the budget
- neighbor gate via adjacency.neighbours; received commodities become trade goods (LRR 663.5)

## Status: COMPLETE (all steps A1–A5 committed to main)

## Steps (each a micro-commit to main)
- [x] A1. src/engine/transactions.ts with canPropose/proposeTransaction/acceptTransaction/rejectTransaction/transactionPartners (+ areNeighbors, transactionOffers). Gate: action phase, active player, neighbor (LRR 2741), once-per-pair budget, valid counts. Apply exchange atomically; received commodities convert to trade goods (LRR 663.5). Added `tradesThisTurn` and `pendingProposal` to GameState. — commit c038cb0
- [x] A2. acceptTransaction/rejectTransaction: only the proposal's `to` may answer; reject is free (leaves state unchanged); accept applies give/take atomically, records the normalized pair, clears the proposal, and hands the turn back to the proposer. Neither spends the active player's action (proposing free, resolution restores active + turnDone). — commit c038cb0
- [x] A3. Move types in types.ts; wired legalMoves.ts enumerate + matches() + index.ts applyMove dispatch + store.tsx seatToAct/shouldAiStep so the accept/reject handoff works (pendingProposal makes state.active the target, mirroring pendingSecondary). — commit fa482ed
- [x] A4. Tests red-first in src/engine/transactions.test.ts (21 tests): even trade, one-sided gift, not-neighbors rejected, self-proposal, insufficient goods, empty exchange, second transaction same neighbor rejected, independent pairs (different neighbor budget not consumed), commodities→trade-goods conversion, accept-by-non-target rejected, reject leaves state unchanged, budget resets on turn handoff, legalMoves integration, replay determinism. — committed below
- [x] A5. Spec edit docs/spec/game-rules.md §3.2 (transactions paragraph, v1 scope + promissory-notes gap) + docs/spec/unwired.md (new Transactions section + promissory-notes deferred reference). tsc clean on non-test src, lint clean on changed files, targeted test file passes. — committed below

## Constraints (satisfied)
- Micro-commits (5), each leaving non-test src tsc clean. Pushed/committed to main.
- Engine pure/deterministic; no React/DOM/Node imports in engine; never mutates input GameState (all spreads).
- Reused adjacency.neighbours for the neighbor gate; reuses FACTIONS[].commodityValue and Player.tradeGoods/commodities on state. Did NOT resurrect trade posts.
- The active→target handoff mirrors pendingSecondary (set active=queue[0]/target, restore to owner on close) in strategicActions.ts and store.tsx.
- Regression check: full-suite failing-set diff between HEAD (baseline) and this branch is EMPTY for existing tests — zero regressions. 217 pre-existing failures are documented unwired.md debt, none from transactions.*

## Completion gate (externally rerunnable from a clean shell)
Command (from repo root):
```
npx vitest run src/engine/transactions.test.ts && npx tsc -p tsconfig.app.json --noEmit
```
Expected: `Test Files  1 passed (1) / Tests  21 passed (21)` and NO `error TS` lines in non-test src (the only `error TS` lines are the pre-existing `.test.`/`.test.tsx` debt). Confirmed green at the final commit.
