# SDD ledger — plan: docs/superpowers/plans/2026-09-05-reaction-windows.md

Note: this plan was executed directly in one session, not through the worktree/review-dispatch process other
ledgers in this directory record — the entries below are rulings and outcomes, not a task-dispatch log.

Found before starting: Task 1 (the window mechanism) and the card effects for all 8 systemActivated/combat-
round cards (Flank Speed, Lost Star Chart, In The Silence Of Space, Upgrade, Morale Boost, Fighter Prototype,
Emergency Repairs, Skilled Retreat) already existed in `src/engine/reactions.ts` and `src/engine/effects.ts`,
fully written and typed, with zero callers and zero tests. Task 2 steps 1, 2 and 4 (activation, space combat
round, ground combat round) were therefore already-built code needing only wiring, not new design.

Task 2 (wiring): `startTactical` now calls `openActivationWindow`; `applyMove` calls `openCombatWindows` on
every successful result (matching the doc comment's stated intent); a reaction window blocks all other moves
in both `applyMove` and `legalMoves`, mirroring the existing `pendingFor` (hit-assignment) gate; `playActionCard`
routes to `playReactionCard` instead of the whole-action `playActionCard` handler whenever a window is open.

Task 3 (card effects → real gameplay): the effect *readers* in `effects.ts` (`moveBonus`, `wormholesLinked`,
`ignoresFleets`, `moraleBoost`, `fighterBonus`) were also already written but never called from `movement.ts`,
`adjacency.ts`, `combat.ts` or `invasion.ts`. Wired all five in. `clearTacticalEffects` is now called from
`endTactical`.

Ruling: Flank Speed's +1 move value does not let a base-game fighter (move 0, cannot move without a carrier)
move independently — the bonus is only added when the unit's base move is already > 0. Real TI4 has no
official FAQ ruling on this exact interaction; this is the conservative reading (a modifier does not grant an
ability the unit does not otherwise have) — cost if wrong: one `> 0` guard in `movement.ts`'s `moveValueOf`.

Ruling: `neighbours()` in `adjacency.ts` gained a 4th optional parameter (`linkAlphaBeta`, default false) for
Lost Star Chart rather than a new function, mirroring the existing Creuss delta-wormhole special case in the
same function — cost if wrong: a new exported helper.

Task 3 continued: `setup.ts`'s `shuffledActionCards` now shuffles `PLAYABLE_ACTION_CARDS` together with
`PLAYABLE_REACTION_CARDS` into one deck (18 more cards; deck size 24 → 42). Updated the three
`actionCards.test.ts` assertions that hard-coded the old deck size/contents.

Task 4 (AI/verification): `aiChoose`'s existing `default: return 0` in `scoreMove` means `declineReaction`
scores 0 and any reaction `playActionCard` scores `w.economy` (a fixed positive weight) — the AI always plays
a reaction card when one is legally offered, never declines. This is not a stall risk (every reaction move is
already concrete; nothing needs `fillTemplate`) but it is not smart play — deferred, same as the plan's own
"scoring can start naive" allowance. `scripts/ai-stress.ts` now reports how often each reaction effect fired;
150 seeds, 6-player all-AI: 150/150 finished cleanly, all 8 wired effects fired at least once (flank_speed 469,
skilled_retreat 739, morale_boost 733, fighter_prototype 122, emergency_repairs 74,
in_the_silence_of_space 25, upgrade 16, lost_star_chart 12), 0 declines.

New tests: `src/engine/effects.test.ts` (the pure reader functions) and `src/engine/reactions.test.ts` (window
open/decline/stack-close, all 8 cards' effects proven against specific seeds where a raw die roll would miss
at the unboosted threshold and hit at the boosted one — not just that `state.effects` gained an entry).

Not done in this pass (per the plan's own scope): space cannon hit assignment windows (4 cards), planet
control-change windows (3 cards), strategy/status-phase windows (4 cards), Sabotage (needs a new
`ReactionKind` for "another player plays an action card" plus true window stacking, since none of the 8 wired
cards ever produced a stacked window to test against). Remaining cards stay out of `PLAYABLE_REACTION_CARDS`
per the "whole printed ability or not dealt at all" rule.

Plan partially complete: activation + combat-round windows only (Task 2 steps 1, 2, 4 of 7; Task 3 for those
8 cards; Task 4 verification). Steps 3, 5, 6, 7 remain as follow-up work.
