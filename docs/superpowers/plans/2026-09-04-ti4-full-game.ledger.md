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
