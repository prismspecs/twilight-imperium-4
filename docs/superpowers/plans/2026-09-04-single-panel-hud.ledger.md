# SDD ledger — plan: docs/superpowers/plans/2026-09-04-single-panel-hud.md

Ruling: work on branch ui-overhaul. Ruling: the single panel follows the active player; a manual seat-tab
pick lasts for the current turn and snaps back when the active seat changes (implemented with a
`useRef`/`useEffect` reset in BoardScreen) — cost if wrong: test edits.
Ruling: 2-player games show the seat-tab strip too, using the faction name as the tab label, so either
seated player can inspect the other's panel — cost if wrong: layout work.
Ruling: with one gutter the stage is wider than the authored map, so the board scales up to fill it
(s = 1.083 at 1440x900); the identity viewport-scale test now asserts the scaled value — cost if wrong:
a visual pass.

## Pre-flight rulings (2026-09-04)
Ruling: kept the descriptive accessibility labels and row text ("Pick a strategy card", "X of Y",
"unpicked, N trade goods on it") unchanged even where a shorter label would fit the compact bar, so
assistive text and the existing tests stay truthful — cost if wrong: test edits (reverted the earlier
shortening of these labels).
Ruling: the old `.gold` button class is kept as an alias of the blue primary accent so the existing
button calls don't all need renaming — cost if wrong: one CSS alias.

## Task execution
Task 1: BoardScreen renders one SidePanel; panel follows active seat via useRef/useEffect reset;
SidePanel drops `side`/`colL`/`colR`.
Task 2: SidePanel rewritten with a `Section` collapsible component; `pcontent` scrolls; seat-tab strip
always shown; secret objectives moved into a section.
Task 3: TopBar rewritten with `player-strip`/`CompactPlayer`; strategy cards 72x92; topology constants
updated (GUTTERS=280, BARS=156); theme.css restructured (topbar 100px, side-panel/stage, player-strip,
collapsible sections, objectives compact, `.btn.gold` alias, VP track inline).
Task 4: viewport-scale tests updated for the new constants and the scaled identity value; Hud/Strategic/
hotseat-e2e/BoardScreen tests updated for the single panel, the always-on seat tabs, and the follow-the-
active-seat behavior (tests flip to seat 0 with `tab-side-0` to inspect a primary's result).

Ruling: a Strategic.test debug render confirmed the panel genuinely renders and follows the active seat —
the earlier `tokens-0-tactic` failures were the panel following seat 1 after the turn passed, not a
missing render.

Final verification: 527/527 tests pass, `tsc -p tsconfig.app.json --noEmit` clean, oxlint 0 errors
(pre-existing warnings only). Plan complete.
