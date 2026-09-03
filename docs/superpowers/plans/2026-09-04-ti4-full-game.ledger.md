# TI4 Full Game — execution ledger

Rulings and decisions made while executing `2026-09-04-ti4-full-game.md`.

## Ruling 2026-09-04: sequencing — generalize the engine to N players first, keep the duel test suite green

The current duel engine is deeply 2-player (tuple `players`, `Seat = 0|1`, one `pendingSecondary` responder,
2-seat draft/turn/status logic, hardcoded L1Z1X/Letnev). Every future content step (17 factions, agenda
phase, 8 strategy cards, secrets) sits on top of the engine's player plumbing, so the foundational, order-
preserving first move is to **generalize the player plumbing to N seats** (Seat = number, players: Player[],
N-player turn alternation / draft / initiative / status submission / strategy-card secondary response) while
keeping all 455 existing tests green at N=2.

Duel-specific content (trade posts, "spend 6 resources" objective, the two Mandates, the L1Z1X/Letnev map,
emergency shipyard) is *not* the real TI4 base game and will be **replaced** in later stages — so this stage
generalizes mechanics only and does not try to preserve those systems as "real". Each later stage records its
own rulings. This keeps each commit small and green, per CLAUDE.md.

Noted trade-off: some duel-only plumbing (trade posts, pendingSecondary-as-single-responder) will be partly
reworked again when the real content lands. The N-player core (Seat, players array, turn/draft/status
ordering, "all other players respond to a secondary") is exactly what the real game needs, so it is not
throwaway.

## Iteration 1 complete — N-player engine core (commits a1f5051, 4a3ffc7, pushed to twilight/main)

Generalized `Seat = number`, `players: Player[]`, and the player plumbing (turn alternation via
`nextActiveSeat`, N-player snake draft + initiative, N-player status submission + winner ranking + speaker
rotation, N-player setup) while keeping all 455 tests green at N=2. Note: pushes go to the `twilight` remote
(`prismspecs/twilight-imperial-4`) because the SSH key authenticates as prismspecs, not DespotB; `main`'s
tracking HEAD matches that remote, so code is deployed.

Known remaining 2-player-only plumbing (kept working at N=2, will be generalized when real content lands):
- `strategicActions.ts`: Diplomacy/Trade primary address "the other seat" via `otherSeat`; the real game
  addresses *all other players* (Diplomacy) / *any number chosen* (Trade).
- `pendingSecondary` models exactly one responder; the real game lets *each other player* answer a secondary
  one at a time. Generalizing this is the next engine step (iteration 2).
- `objectives.ts` are duel-specific ("your opponent"); the full game's public/secret objectives have no
  opponent reference, so these will be replaced wholesale with the real deck.
- `ai/`, `ui/` still assume two seats in a few tuple spots; content lands after the engine is generalized.

## Iteration 2 complete — N-player strategy-card secondary window (commit c5654eb, pushed)

`pendingSecondary` is now a `SecondaryWindow` ({ card, owner, queue }) and the secondary response is queued
over every other seat in turn order; the holder's turn resumes with their action spent only once all others
have answered. N=2 behaviour unchanged; added a 3-player secondary test. Also made the AI fog view forward
`players: PublicPlayer[]` and read `window.card` in SecondaryPanel.

Remaining 2-player-only plumbing noted in iteration 1 still stands (Diplomacy/Trade primary still use
`otherSeat`, objectives are duel-specific, ai/ui still touch seat 0/1 in spots). Next: import the full base
faction/tech data, then content phases.

## Iteration 3 complete — Diplomacy primary generalized to N players (commit 36757ec, pushed)

Diplomacy primary now places a command token for every other seat in the chosen system (dedupes those already
present); identical at N=2. Added an N-player diplomacy assertion. Imported the `Player` type into the test and
extracted a `thirdSeat()` helper shared by the two N=3 plumbing tests.

Remaining: Trade primary "choose any number of other players" is still 2-player; the 17-faction data import,
full tech/upgrade tree, objectives/action-cards/agendas/promissory, Politics+Construction + agenda phase, map,
and N-player bots/UI are all still ahead.
