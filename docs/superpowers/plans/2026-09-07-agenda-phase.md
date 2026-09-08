# Agenda phase: machinery and directives (R10)

## Context

The reaction-window system (`docs/superpowers/plans/2026-09-05-reaction-windows.md`) is wired. The agenda
phase itself was still real missing architecture — no `Phase = 'agenda'`, no voting, no laws — even though
the data (`src/data/agendas.ts`, all 50 base agendas) and the deck (`GameState.agendaDeck`, shuffled at
setup) already existed, and Politics's primary already peeks and reorders the real deck. This plan covers
the phase's machinery plus a first slice of directives; laws and the agenda-timing action cards are later
increments.

## Non-goals

- Laws (persistent ongoing effects) and their enforcement hooks.
- The ~24 agenda-timing action cards (Riders, Veto, Bribery, Assassinate Representative, Distinguished
  Councilor) — they need the agenda phase to exist first, and reuse the reaction-window stack once it does.
- Faction abilities that only fire in the agenda phase (Nekro Galactic Threat, Xxcha Quash, Winnu Blood Ties).

## Data model (`src/engine/types.ts`)

- `Phase` gains `'agenda'`.
- `GameState.agenda: AgendaRound | null` — null outside the phase:
  ```ts
  interface AgendaRound {
    revealed: string
    slot: 1 | 2
    votes: Partial<Record<Seat, { outcome: string; influence: number }>>
    order: Seat[]
    barredFromVoting: Seat[]
  }
  ```
- Version bumped to 5, with the matching `normalise()` backfill in `src/ui/persist.ts`.

## Vote order

TI4 votes clockwise starting left of the speaker, speaker last — the opposite of the draft's speaker-first
`snakeOrder`. `voteOrder(state)` lives next to `snakeOrder` in `src/engine/strategyPhase.ts`. Ties are broken
by the speaker's own vote, which falls out for free from voting last.

## Entry point (`src/engine/statusPhase.ts`)

`finishStatusPhase` splits into `endOfRoundCleanup` (everything up to and including the status phase's own
`victoryCheck`) and `enterAgendaOrNextRound` (`src/engine/agendas.ts`): if the Custodians token is gone and
the deck still has cards, reveal the first agenda and enter `phase: 'agenda'`; otherwise call the extracted
`startNextRound` exactly as before.

## Voting move (`src/engine/agendas.ts`)

- `Move`: `{ type: 'castVote'; outcome: string; planets: string[] }`. Planets are exhausted via
  `exhaustPlanets` for influence — planets only, no trade goods, matching the printed rule. An empty list is
  a legal 0-influence vote.
- `legalMoves` gets an `agenda` phase branch enumerating one `castVote` per legal outcome.
- The last voter's `castVote` calls `resolveAgendaRound`, which tallies, applies the outcome, re-checks
  victory (Mutiny and Seed of an Empire can grant VP inside the phase), then reveals the second agenda or
  calls `startNextRound`.

## Resolver table

`AgendaDef.text` is the printed For/Against prose — not machine-resolvable as written. `AGENDA_RESOLVERS`
covers the directives with immediate, globally-supported effects: Economic Equality, Mutiny, Seed of an
Empire, Swords to Plowshares, Unconventional Measures, Archived Secret, Public Execution.

Every other agenda in the real 50-card deck is still voted on for real when revealed — the vote and
influence spend are genuine, not skipped. If the elected outcome has no resolver, `resolveAgendaRound` logs
`"the elected outcome of {agenda} has no engine effect yet — recorded, not enforced"` and continues. This is
deliberately different from the action-card allow-list pattern (which never deals an unresolvable card at
all): the agenda deck cannot be filtered without breaking the Politics peek/reorder guarantee that
`politicsConstruction.test.ts` already locks down. See the ledger for the ruling on Arms Reduction.

## AI

`src/ai/fill.ts`'s `fillCastVote(state, seat)` commits only the cheapest single ready planet, not every one
`agendaMoves` suggests — naive by design, tuned later like every other `fill*` helper. `src/ai/index.ts`'s
`fillTemplate` gets a `case 'castVote'`.

## UI

`src/ui/flows/AgendaDialog.tsx`, modeled on `StatusDialog.tsx`: the revealed agenda's real printed text, one
button per legal outcome (Elect Player renders as the player's name), and a planet picker to commit
influence. Wired into `BoardScreen.tsx` alongside `StatusDialog`, gated the same way on the active seat
being human.

## Tests

- `src/engine/testUtils.ts`: `toAgendaPhase`, following `toStatusPhase`'s pattern.
- `src/engine/agendas.test.ts`: phase gating, vote order, `legalOutcomes` per target shape, `castVote`
  legality, influence exhaustion and 0-vote abstain, order advancement and round resolution, tie-break,
  mid-phase victory re-check, each resolver, and the no-resolver log-and-continue path.
- `src/ai/fill.test.ts`: `fillCastVote` commits at most one planet; `aiChoose` fills a legal outcome.
- `src/engine/fullGame.test.ts`: `castVote` in `ALL_MOVE_TYPES`; two new `COUNTERS` (an agenda revealed, an
  outcome resolved).
- `src/ui/flows/AgendaDialog.test.tsx`: printed text and outcome buttons, voter advancement, influence
  exhaustion, Elect Player naming.

## Verification

- `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` clean before every commit.
- `npm run ai:stress -- 200`, checking the new agenda-phase counters for zero-count entries.
- Manual drive-through via `npm run dev` (`?demo=1&panel=agenda`), confirming the chess clock and hot-seat
  handoff both fire correctly across a vote and into the next round.
