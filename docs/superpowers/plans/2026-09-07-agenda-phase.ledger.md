# SDD ledger — plan: docs/superpowers/plans/2026-09-07-agenda-phase.md

Note: this plan was executed directly in one session, not through the worktree/review-dispatch process other
ledgers in this directory record — the entries below are rulings and outcomes, not a task-dispatch log.

Ruling: the agenda deck is never filtered the way `PLAYABLE_ACTION_CARDS`/`PLAYABLE_REACTION_CARDS` are.
Politics's primary already peeks and reorders the real, full 50-card deck, and `politicsConstruction.test.ts`
locks that exact order down — filtering the deck would break that guarantee and the printed rule that a
player reordering agendas is reasoning about the actual deck, not a curated subset. So every agenda can be
revealed and voted on for real; only some *outcomes* wait for a resolver. Cost if wrong: rewrite the reveal
path to filter, and rewrite the Politics peek test.

Ruling: Arms Reduction is not in `AGENDA_RESOLVERS` this pass. Its Against clause ("at the start of the next
strategy phase, each player exhausts each planet with a technology specialty") needs a delayed-effect queue
that survives the agenda phase into the next strategy phase — infrastructure nothing else in the engine has
yet. Rather than build that queue for one card, it stays in the no-resolver, real-vote-logged-not-enforced
path like every other still-unresolved agenda. Cost if wrong: one more resolver plus the delayed-effect
queue, needed sooner than expected by some other card.

Ruling: `fillCastVote` (AI) commits only the cheapest single ready planet, not every one `agendaMoves`
suggests, and does not try to pick a *good* outcome — it takes whichever `legalOutcomes` lists first, same
default-naive posture as every other `fill*` helper on day one. Cost if wrong: AI agenda play stays
unsophisticated until a future pass adds real outcome scoring in `src/ai/score.ts`.

Found while manually driving the finished dialog through a live game (`?demo=1&panel=agenda`, a new
manual/visual QA hook alongside `?panel=handoff/log/crowded`): `.stage.has-modal`'s z-index (60) sat below
the floating right deck's (80), so the Agenda dialog's own Cast Vote button rendered in the DOM but behind
the deck, unclickable, whenever the deck was open at this viewport width. Not agenda-specific — every dialog
with a right-aligned header button (Status, Strategic, ...) shares the same header layout and was equally at
risk; simply never triggered because none of them had been driven through with the deck open before. Fixed
by raising `.stage.has-modal` to z-index 85 (`src/ui/theme.css`), the smallest change that clears both the
deck and the unit hover card (also z-index 80) without disturbing the topbar, side-panel tab, or strategy
hover tooltip's ordering (verified: none of those spatially overlap a centered dialog).

Verification: `npm run ai:stress -- 200` (6 players, all-AI): 200/200 finished cleanly, 0 failures, agenda
phase entered 733 times across the run, all 48 imported base agendas voted on at least once (the other 2 of
the 50 are Codices-only illustrative rows already excluded by the `source: "base"` filter upstream). Manual
drive-through confirmed the full slot-1/slot-2 flow, influence exhaustion, VP award, chess clock switching
between voters, and the hot-seat handoff firing on every voter change, ending cleanly into round 2's strategy
phase.

Plan complete as scoped: machinery, vote order, `castVote`, the 7-resolver table, AI, UI, and the full test
and verification matrix. Laws and the agenda-timing action cards remain explicit follow-up work, same as the
plan's own non-goals.
