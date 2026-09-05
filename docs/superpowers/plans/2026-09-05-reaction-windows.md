# Reaction windows: the rest of the base action card deck

## Objective

`PLAYABLE_ACTION_CARDS` currently holds only the 14 base "ACTION:" cards, because those are the only ones
whose whole printed ability the engine can resolve: a card played as your action, resolved immediately.
Every other base action card waits for a *reaction window* — a moment during someone else's turn, a combat
round, an invasion or the strategy phase where a player may interrupt and play a card. The engine has no
way to pause and offer that, so ~80 imported cards sit out of the deck.

Build the general reaction-window mechanism, then move every card whose window it covers into the deck.

## What the deck actually asks for

Counted from `src/data/actionCards.ts` (base cards only), grouped by the engine point that must pause:

| Engine point | Cards | Example window text |
|---|---|---|
| Tactical: system activated | 10 | "After you activate a system" |
| Space combat: round start | 10 | "At the start of a combat round" |
| Space combat: assigning hits | 8 | "Before you assign hits to your ships during a space combat" |
| Space cannon: assigning hits | 4 | "Before you assign hits produced by another player's SPACE CANNON roll" |
| Space combat: other | 3 | ship destroyed, retreat declared, combat won |
| Invasion / ground combat | 5 | "At the start of an invasion", "After your ground forces make combat rolls" |
| Planet control changes | 3 | "When you gain control of a planet" |
| Strategy phase | 3 | "When another player chooses a strategy card" |
| Status phase | 1 | "When you would return your strategy card(s)" |
| Another player plays an action card | 4 | Sabotage — a reaction to a reaction |
| Agenda phase | ~24 | blocked: the agenda phase does not exist yet |

## Non-goals

- The agenda phase. Its ~24 cards stay out of the deck; the agenda deck data already exists for when it lands.
- No stubs. A card enters `PLAYABLE_ACTION_CARDS` only when its window exists *and* its effect resolves in
  full, exactly as the 14 ACTION cards were handled.

## Plan

### Task 1 — The window mechanism
- `pendingReaction` on `GameState`, following the shape the engine already proved twice: `pendingSecondary`
  (a queue of seats polled in turn order) and `PendingHits` (nothing else is legal until it is answered).
- A window carries: its kind, the seat whose action triggered it, the queue of seats that may respond, and
  the context the card needs (system id, combat state, planet id...).
- `legalMoves` offers only `playActionCard` for a matching card, or `declineReaction`, while one is open —
  the same "this is the only thing anybody may do" rule `pendingFor` already enforces for hits.
- A **stack**, not a single slot: Sabotage reacts to a card being played, so a window can open on top of a
  window. Resolve innermost first.

### Task 2 — Open windows at the engine points
Each point raises a window, and does nothing else differently. In dependency order:
1. Tactical activation (`startTactical`) — 10 cards, and the simplest context.
2. Space combat round start and hit assignment (`combatRound`, `assignHits`) — 18 cards, the biggest win.
3. Space cannon hit assignment — 4 cards.
4. Invasion and ground combat — 5 cards.
5. Planet control changes (`resolveControl`) — 3 cards.
6. Strategy phase pick, status phase card return — 4 cards.
7. Sabotage on top of any of them — 4 cards.

### Task 3 — Card effects
Implement each card's printed ability against its window's context, moving it into
`PLAYABLE_ACTION_CARDS` only once its test passes. Report which cards land and which do not.

### Task 4 — AI and verification
- `aiChoose` must answer an open window (play or decline) or the game stalls; the AI stress script is the
  proof, since a stall shows up as an empty legal-move set.
- `npm run ai:stress -- 200` must stay clean, and `scripts/ai-stress.ts` should be extended to report how
  often each window opened, so a window that never fires in 200 games is visible rather than assumed working.

## Rulings

- Reaction windows reuse the `pendingSecondary` polling shape rather than inventing a second idiom; the
  engine already asks seats to answer in turn order and the UI already knows how to render that.
- A window with no eligible responder never opens, so the common path costs nothing.
