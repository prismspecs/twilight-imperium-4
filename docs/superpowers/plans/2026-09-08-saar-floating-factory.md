# Saar's Floating Factory: a space dock that moves

**Goal:** the Clan of Saar player can move their space dock, because it isn't a space dock — it's a
Floating Factory, their unique unit, and it lives in the space area of a system, never on a planet.

**Trigger:** the player expected Saar to be able to move its dock and it can't. Investigation found the
feature was never committed anywhere in this repo (no branch, no stash, no reflog trace) — it needs to be
built from scratch. Full rules: `docs/spec/lrr-factions.md:2105-2134` (Floating Factory rulings) plus
scattered cross-references in `docs/spec/lrr-components.md` (search "Floating Factory").

## What this is *not*

There is no faction ability that grants space-dock movement. Saar's two faction-sheet abilities are
`scavenge` and `nomadic` (`src/data/factionAbilities.ts:15-16`), already correctly modelled and unrelated to
this. The real mechanic: every space dock the Saar player ever owns — starting unit or produced later — uses
the Floating Factory model instead of a generic space dock, no tech or unlock required, same way their
flagship is unique. A Floating Factory:

- always sits in a system's space area, never on a planet (`lrr-components.md:1810`)
- moves like a 1-move ship, and is affected by move-changing effects (Gravity Drive, Flank Speed, Light/Wave
  Deflector, Antimass Deflectors)
- does not count toward fleet pool
- cannot be hit by space cannon
- still produces (ships and ground forces; ground forces may be placed in space or on a controlled planet)
- has its own destruction/blockade interactions in combat, distinct from a normal dock

## Why this is bigger than "let this unit move"

`spacedock` today is architecturally a *planet* structure, never a space-area unit: `Planet.structures:
Unit[]` (`src/engine/types.ts:30`) is the only place a dock lives, and roughly a dozen files look it up there
(`economy.ts`, `production.ts`, `invasion.ts`, `objectives.ts`, `board.ts`, `strategicActions.ts`,
`componentActions.ts`, `actionCards.ts`, plus UI). Making a dock move means giving it a second home
(`System.space`, alongside ships) and touching every one of those lookups for the Saar case. This is not a
one-line fix in `movement.ts` — it's a new unit type threaded through most of the economy/production/combat
surface, which is exactly why the earlier "rewrite" (whatever it touched) apparently never made it to a
committed, passing state.

## Two clauses this plan cannot deliver yet — not a scope cut, a missing prerequisite

Two Floating Factory rulings depend on base-game mechanics that don't exist for *any* unit yet, Saar or
otherwise:

1. **Gravity rift removal roll** (`lrr-factions.md:2111`) — "must roll for removal, +1 to movement." Grepping
   `movement.ts` turns up `gravity_drive` (the tech) but no roll-for-destruction mechanic for gravity rifts at
   all. No ship rolls to avoid removal today; this is a pre-existing engine gap, not a Saar gap.
2. **Direct Hit interactions** (`lrr-factions.md:2116-2122`) — depends on the *Direct Hit* action card
   actually destroying a ship after Sustain Damage, and on the alternating-Sustain-Damage-order rule. Direct
   Hit is imported as data only; `src/engine/actionCards.test.ts:94` confirms it's a deliberate stub ("waits
   for a moment") — it isn't in `PLAYABLE_ACTION_CARDS` and has no engine handler. This is the reaction-window
   action-card backlog already tracked in `2026-09-04-ti4-full-game.md` step 6 ("the 80 action cards with
   reaction windows"), not something to build ad hoc inside a Saar fix.

Building real fidelity for these two clauses means building generic engine mechanics (gravity rift
destruction rolls; Direct Hit's actual effect) that other factions/situations need too. Folding them into this
plan would mean this "fix Saar's dock" task quietly grows into "build gravity rifts and reaction-window action
cards." I'll implement every other clause faithfully now, and land these two the moment their prerequisite
lands — tracked explicitly below, not dropped.

## Sequence

1. **Data & types.** Add `floating_factory` to `UnitType` (`types.ts:16`); stats in `units.ts` (production 2/4
   like `spacedock`, but `move: 1`, `sustain: false`, no combat); a `REINFORCEMENTS` pool entry (3, matching
   the real plastic count); Saar's starting unit at `factions.ts:58` becomes `floating_factory` instead of
   `spacedock`.
2. **Movement.** `isShip()`/`SHIP_TYPES` in `units.ts:110` stays ship-only (fighters, warsuns, etc.) — a
   Floating Factory isn't a ship, it's a unique structure-that-moves. Add a parallel `isMovable()` (or extend
   the movement-path predicates in `movement.ts` — `shipsThatCanReach`, `movableShips`, `moveShips`,
   `movementObstacle`) to also admit `floating_factory`. Gravity Drive, Flank Speed, Light/Wave Deflector,
   Antimass Deflectors already key off move-affecting logic near ships; extend those checks to include it.
3. **Fleet pool exemption.** `NON_FIGHTER_SHIPS` (`economy.ts`) must explicitly exclude `floating_factory` even
   though it now moves — `nonFighterShips()`/`fleetPoolLimit()` checks stay untouched by it.
4. **Production.** `economy.ts:142`, `production.ts:21` currently find a dock by scanning `planet.structures`.
   For Saar, also scan `system.space` for an owned `floating_factory` as a valid production source in that
   system. `R14.1` blockade (`production.ts:9-28`) already keys off "enemy ships present, none of the seat's
   own" — since a Floating Factory sits in space it participates in that same space-presence check, so this
   should fall out mostly for free once it's a space-area unit; verify with a test rather than assume.
5. **Construction / component actions.** `strategicActions.ts` (`constructionPlanets`, `placeStructure`),
   `componentActions.ts` (Flagship... no, shipyard-type dock placement) — Saar's placement resolves to
   `floating_factory` in `system.space`, still gated on "controls a planet in that system"
   (`lrr-components.md:73`, `lrr-factions.md:2124`), never gated on planet structure slots (a Floating Factory
   is never on a planet, so the existing "1 space dock per planet" limit in `structureRoom` doesn't apply to
   it — it's a per-system unit, not a per-planet one).
6. **Combat.** Space cannon hit assignment must never offer a Floating Factory as a target
   (`lrr-factions.md:2109`). Blockade/abandonment destruction (`lrr-factions.md:2129-2132`): if a Floating
   Factory is alone in a system (no Saar ships) and an opponent moves ships in, it's destroyed immediately,
   before Space Cannon Offense — add this as an explicit check at the point ships arrive in `movement.ts`
   /`combat.ts`, not folded into the general blockade-for-production check. Retreat interaction
   (`lrr-factions.md:2112-2114`): if all the Saar player's ships in a system are destroyed in a round, any
   Floating Factory there is destroyed without retreating (unless *neither* side has ships left, in which case
   it survives) — hook into `combatRound`/the post-round resolution near `retreat`/`withdraw`
   (`combat.ts:643-696`).
7. **Objectives.** `Improve Infrastructure` and `Protect the Border` (`objectives.ts`) must not count a
   Floating Factory (`lrr-components.md:1733`, `1844`) — these currently likely count via `spacedock`/planet
   presence; add an explicit exclusion once the objective scoring touches structures in space.
8. **Frontier/exploration interactions**, if frontier tokens exist in this build's scope (Codices, not PoK —
   confirm against `content_sets.json`/the scope decision in `2026-09-04-ti4-full-game.md` before building
   this; skip if frontier exploration isn't in scope at all).
9. **UI.** `UnitStack.tsx`, `SidePanel.tsx`, `FloatingRightDeck.tsx` force-order arrays need a
   `floating_factory` entry; it renders in the space area of a system like a ship (not with a planet
   nameplate). Needs its own unit art/token in Saar's colour, per CLAUDE.md's "units are shown as the models on
   the board... everywhere they are named." `StrategicDialog.tsx`/`SecondaryPanel.tsx` Construction offers need
   to show "Floating Factory" instead of "Space dock" when the seat is Saar.
10. **Tests.** New coverage for: movement (can move, obeys move-affecting techs/cards), fleet pool exemption,
    production from a Floating Factory, blockade/space-cannon immunity, retreat/destruction interactions,
    objective exclusions, Construction placement targeting a system not a planet. Existing `movement.test.ts`
    is already at 27/30 failing from the unrelated duel-removal refactor (`fdaadca`) — fix or account for that
    debt before trusting this suite as a regression signal, per the project's own deferred-test-debt note.

## Explicitly deferred (tracked, not forgotten)

- Gravity rift destruction-roll mechanic for all units (blocks Floating Factory clause 5) — needs its own
  plan; touches `movement.ts` for every faction, not just Saar.
- Direct Hit action card's real effect + alternating Sustain Damage order (blocks Floating Factory clauses
  6-8, 11) — part of the existing reaction-window action-card backlog
  (`2026-09-04-ti4-full-game.md` step 6, `2026-09-05-reaction-windows.md`).

Once either lands, revisit this file's ledger to close out the corresponding clause.

Rulings and any deviations made while executing are recorded in `2026-09-08-saar-floating-factory.ledger.md`.
