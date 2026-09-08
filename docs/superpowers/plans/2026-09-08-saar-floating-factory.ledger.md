# SDD ledger — plan: docs/superpowers/plans/2026-09-08-saar-floating-factory.md

Ruling: Floating Factory is modelled as its own `UnitType`, not as `spacedock` plus a per-faction movement
flag. It lives in `System.space`, never `Planet.structures` — `lrr-components.md:1810` is explicit that a
Floating Factory is never on a planet, so folding it into the existing structure model would misrepresent
where it can be targeted, blockaded, and destroyed. Cost if wrong: a rename/re-type pass across every file in
plan step 4-7's lookups.

Ruling: the gravity-rift destruction roll and Direct Hit's real effect are out of scope for this plan and
tracked as explicit prerequisites instead of being built ad hoc under a Saar-specific fix — see the plan's
"Explicitly deferred" section for why.

### 2026-09-08 — Implemented

All ten sequence steps landed except the frontier/exploration step (step 8), which turned out to be moot: this
build has no exploration/frontier-token system at all yet (PoK-scoped, out of this project's stated base+Codex
scope per `2026-09-04-ti4-full-game.md`), so there is nothing for a Floating Factory exclusion to attach to.

Rulings and scope calls made while implementing:

- **Reactor Meltdown** ("Destroy 1 space dock in a non-home system") still only targets `spacedock`, not
  `floating_factory`. No sourced ruling says a Floating Factory is or isn't a legal target for another
  player's card that says "space dock" by name, and guessing wrong is worse than leaving it as printed.
  Flagging this as an open question rather than a silent decision — worth a real FAQ/ruling check before this
  card's interaction with Saar comes up in an actual game.
- **The "neither side has ships, so the Floating Factory survives" clause** (lrr-factions.md 2114) is
  implemented (`destroyEscortlessFloatingFactories`'s early return in `combat.ts`) but has no dedicated
  automated test — forcing a simultaneous mutual wipe-out in one combat round through the seeded RNG without a
  lot of extra rigging wasn't worth it this pass. The escort-loss test that does exist only exercises the
  one-side-wiped case. Low risk: the early return is a two-line guard, easy to verify by inspection.
- **Ground-force placement choice** (lrr-factions.md 2108: space area *or* a controlled planet) is implemented
  in the engine (`produce()`'s new `groundTo` field) but the UI does not yet offer the choice — it always
  defaults to the space area, which is always a legal placement. Exposing the picker is a small follow-up, not
  a correctness gap.
- **Construction dialog / secondary panel** now source their offered planets from `constructionPlanets()`
  instead of a local per-planet filter, which was the more invasive but also more honest fix: the old local
  filter would have offered every controlled planet as "dockable" for Saar (since they never place a
  `spacedock`-typed structure on any planet), even planets in a system that already has their Floating Factory.
- **Saar's Floating Factory art**: no dedicated miniature/sprite/card art exists in `public/assets`. It renders
  using the plain space dock's art (`spriteUnitType()` in `sprites.ts`, and the `unitCardUrl()`/`UNIT_CARD`
  fallback in `art.ts`) rather than inventing image paths nothing backs. `sprites.test.ts`'s manifest-fidelity
  check stays honest because `floating_factory` was deliberately kept out of the `SPRITE_SETS` tables.

Verification: `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint` are clean (only the pre-existing,
already-documented `posts`/`postAbilityUsed` test debt from the duel-post removal, unrelated to this work).
`npx vitest run`: 429 passing / 269 failing, exactly the pre-existing 269 (the duel-map-removal test debt noted
in `.ralph/mecatol-online.md`) plus this plan's 9 new passing tests — zero regressions, confirmed by running the
full suite against `git stash` of this plan's changes and diffing the pass/fail counts.
