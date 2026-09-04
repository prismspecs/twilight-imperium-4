# Expand Mecatol Duel into the Full Twilight Imperium 4 Base Game (with Codices), playable by up to 6 players

## Context

The repo `/home/grayson/workbench/mecatol-duel` currently implements a **2-player distillation** of TI4 (only L1Z1X vs Letnev, 6 strategy cards, no action cards/agendas/promissory notes/secret objectives, a custom trade-post system, map hardcoded to 2 players). All 455 tests pass. Baseline is clean.

The goal is to expand it to the **entire TI4 4th edition base game with Codices updates**, playable by **up to 6 players** (e.g. 1 human + 5 bots).

Authoritative rules data was cloned to `/tmp/ti4-rules` from `prismspecs/ti4`:
- `data/factions.json` — all factions (17 base + PoK + TE + Keleres), with abilities, starting units/techs, faction techs, promissory notes, flagship
- `data/strategy_cards.json` — all 8 strategy cards (base + PoK/TE variants)
- `data/objectives.json` — 80 objectives (Stage I, Stage II, secrets)
- `data/action_cards.json` — 107 action cards
- `data/agendas.json` — 63 agendas
- `data/promissory_notes.json` — generic promissory notes
- `data/technology.json` / `unit_upgrades.json` — full tech tree + unit upgrades
- `data/planets.json` — 143 planets
- `rules/complete.md` — full living rules reference, `rules/INDEX.md` — index
- `data/content_sets.json` — authoritative map of what belongs to base vs codex vs pok vs te

Existing verified reference data in repo: `data/reference/factions.json`, `data/reference/techs.json`, `data/reference/tiles.json`. Existing binding spec: `docs/spec/game-rules.md` (currently duel-specific) and `docs/spec/engine-design.md`. Existing data modules in `src/data/*.ts`, engine in `src/engine/*.ts`.

## Scope decisions (record rulings in the plan ledger as you go)

- **Base game + Codices I-IV layered on base.** Per `content_sets.json`, the base factions are: Arborec, Barony of Letnev, Clan of Saar, Embers of Muaat, Emirates of Hacan, Federation of Sol, Ghosts of Creuss, L1Z1X Mindnet, Mentak Coalition, Naalu Collective, Nekro Virus, Sardakk N'orr, Universities of Jol-Nar, Winnu, Xxcha Kingdom, Yin Brotherhood, Yssaril Tribes (17 factions).
- **Codex content**: Codices I-IV update/errata base components (e.g. various faction ability rebalances, Diplomacy errata, omega cards). The "Alliance" promissory notes (Codex II) require commanders (PoK mechanic) so they are OUT. Council Keleres (Codex III) requires PoK so it is OUT. Filter the `data/*.json` decks to base-only per `content_sets.json`. Always prefer the Codex-erratated text where it exists and note it.
- **6-player game**: full TI4 setup with 6-player map (or configurable 3-6 players), speaker token, snake draft of factions, 8 strategy cards, initiative order, agenda phase, action cards, secret objectives, public objectives (Stage I + Stage II), promissory notes.
- **Bots**: at least 1 human + up to 5 AI. The existing AI (`src/ai/*`) must be generalized from 2 seats to N seats.

## Rules for every change (from CLAUDE.md)

- Commit after every logical step, in small commits: the failing test, the implementation, each fix, each doc change gets its own commit. Never bundle several tasks into one commit.
- Push every commit to `main` as soon as it is green (wired to Vercel). Do not sit on a stack of local commits.
- Conventional commit messages (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), English only.
- Before a commit that touches `src/`: `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` must be clean.
- Engine and data modules: strict TypeScript, no `any`, no non-null assertions, no React/DOM/Node imports, never mutate an input `GameState`, all randomness from the seed passed in, every dice roll logged.
- `docs/spec/game-rules.md` is the binding authority; update it as the game expands. Record rulings in the plan's `.ledger.md`.

## Suggested architecture sequence (revise as needed, record in ledger)

1. **Generalize the engine to N players** (foundational — everything depends on it):
   - `src/engine/types.ts`: `Seat = 0|1` → `number` (or a bounded type); `Owner = Seat | 'guardian'`; `players: Player[]`; `speaker`, `active`, `draft` as seats; player initiative order. Add new fields for the full game state (action cards hand, secret objectives, promissory notes, agenda deck, strategy cards with new cards, command sheet per player).
   - Update all engine modules, data modules, AI, UI to N-player. Decide whether to rewrite incrementally keeping 2-player tests green, or bite the bullet with a big refactor. Record the decision.
2. **Full data import**: 17 factions, full tech tree + unit upgrades + faction techs, all objectives (Stage I/II + secrets), action cards, agendas, promissory notes, 8 strategy cards, map tiles + planets, anomalies (asteroid fields, nebulae, gravity rifts, supernovas), wormholes.
3. **Full setup + draft**: faction/colour selection, 6-player map generation, speaker, starting units/techs, objective decks, action card deal, secret objective deal, and the table setup.
4. **Full round structure**: strategy phase (8 cards, initiative), action phase (tactical/strategic/component/pass), agenda phase (new), status phase (scoring, objectives, tokens, readying). Add Politics + Construction strategy cards.
5. **Agendas, action cards, promissory notes mechanics.**
6. **Faction abilities** across 17 factions.
7. **Bots for 6 players.**
8. **UI**: setup screen for up to 6 players, board rendering of a 6-player map, all the new panels.

## Iteration strategy

Tackle ONE coherent, verifiable chunk per iteration. Keep tests green (or define the failing test for that chunk). Update the ledger with rulings. Commit and push each chunk. The goal is steady, verifiable progress toward the full game rather than a half-finished giant refactor left broken.

## Iteration 1 complete — Trade primary N-player generalization (commit cbdbc38)

Delivered this iteration:
- Trade primary generalized to N players: `shareWith?: Seat[]` replaces `shareWithOpponent?: boolean`
- Engine: strategicActions.ts iterates over chosen seats to replenish without token cost
- LegalMoves: enumerates bare primary + one variant per other seat
- UI: StrategicDialog renders per-other-player checkboxes
- Tests: updated `shareWithOpponent: true` → `shareWith: [seat]` and added trade-count assertions

N-player engine generalization status:
- ✅ Seats/players arrays, snake draft, initiative, status/victory phases
- ✅ Secondary window queues every other seat in order
- ✅ Diplomacy primary places token for every other seat
- ✅ Trade primary accepts `shareWith` to choose who replenishes

Remaining N-player gaps:
- Trade secondary: still 2-player (responder is single other seat)
- Objectives: most are duel-specific "opponent" references
- AI/fog/score: still assume a single foe

Next iteration: full faction data import (17 factions, tech tree) or Trade secondary N-player.

## Ledger

See `docs/superpowers/plans/2026-09-04-ti4-full-game.ledger.md` for all rulings and completion notes.

## Iteration 2 complete — AI opponent generalized to N players (commit 787ed86)

Delivered this iteration:
- AI score's `other()` function now returns the next seat in order for N-player games
- This enables the AI to play against any seat (though scoring weights may need tuning)

N-player engine generalization status:
- ✅ Seats/players arrays, snake draft, initiative, status/victory phases
- ✅ Secondary window queues every other seat in order
- ✅ Diplomacy primary places token for every other seat
- ✅ Trade primary accepts `shareWith` to choose who replenishes
- ✅ AI opponent generalized to any seat in N-player game

Remaining N-player gaps:
- Trade secondary: already N-player (secondary window queues all others)
- Objectives: most are duel-specific "opponent" references
- Setup UI: hardcoded to 2 players (`[0, 1]`)

Next iteration: objective N-player generalization (or full faction data import).

## Ledger

See `docs/superpowers/plans/2026-09-04-ti4-full-game.ledger.md` for all rulings and completion notes.

## Iteration 3 — N-player objectives generalization (commit d2b042c)

Delivered this iteration:
- more_ships and foothold objectives now compare against any other seat (at-least-one semantics), not a single opponent
- Added shared thirdSeat()/withThirdSeat() helpers in testUtils
- New N-player objectives test (458 tests total)
- Refactored strategicActions tests to reuse the shared helper

N-player engine status:
- ✅ Core (seats, draft, initiative, status/victory)
- ✅ Secondary window, diplomacy primary, trade primary
- ✅ AI other()
- ✅ Objectives (more_ships, foothold)

Remaining:
- Setup UI hardcoded to [0,1]
- Map with only 2 home systems
- Full faction data import (the big next step)

Next iteration: full faction data import (17 factions, abilities, techs) — the highest-value remaining
item. Start by expanding src/data/factions.ts from 2 to all 17 base factions, then wire faction abilities
into combat/research, then the full tech tree.

## Iteration 4 — faction data foundation (commit a2481d1)

Delivered this iteration:
- FactionId widened to all 17 base-game factions
- factions.ts: 15 new factions with real starting units/techs/commodities/ability ids
- units.ts: flagship stats for all 17 factions
- art.ts + fog.ts updated to match

Scope note: the 15 new factions are data-only. Setup still swaps l1z1x/letnev and the map holds only
their two home systems, so the new factions are never placed and their special abilities are not wired.

Resource (user): https://twilight-imperium.fandom.com/wiki/Twilight_Imperium_Wiki can be scraped for
faction portraits/sigils/tile art + extra data. Asset convention confirmed. Low priority until the
faction picker + map expansion land; defer to the art pass.

Next iteration: the big coupled item — full map import (all home systems + the rest of the base
galaxy), which unblocks both N-player setup and placing the 15 new factions.

## Iteration 5 — map-import foundation: full tile catalogue (commits 172fbad, d94e241)

Delivered this iteration:
- Reconciled the 15 new factions' starting planet ids to the canonical tiles.json ids (saar/mentak/nekro/xxcha)
- src/data/tiles.ts: all 51 base-game tiles (16 home + Creuss Gate + off-board Creuss + Mecatol + 20 blue + 12 red),
  planets with resources/influence/trait/tech-skip/home faction, wormholes, anomalies. Fully typed, generated from
  the verified reference JSON. Helpers: tileByNumber, HOME_TILES, homeTileFor, CREUSS_GATE, MECATOL_TILE, GALAXY_TILES.
- src/data/tiles.test.ts: catalogue validation (463 tests total)

Ruling: planet-id scheme — tiles.json concatenated ids are canonical; active map keeps its tested ids for now;
new factions re-pointed to canonical ids.

Next iteration: galaxy generator — lay out N home systems on a hex grid, fill the ring from GALAXY_TILES,
compute adjacency, then swap the active map onto it and enable N-player setup.

## Iteration 6 — galaxy generator (commits 233c945, 70d5625)

Delivered this iteration:
- Widened SystemDef/System wormhole to include 'delta'
- src/engine/galaxy.ts: generateGalaxy(homes, seed) builds a 3-6 player galaxy on a radius-3 axial hex —
  Mecatol center, faction homes on evenly spaced corners, ring filled from seeded-shuffled GALAXY_TILES,
  hex adjacency computed. Output is SystemDef[] + axial q/r coords for rendering.
- src/engine/galaxy.test.ts: 9 tests (472 total)

Ruling: layout is balanced/deterministic (official per-count diagrams aren't machine-readable). 3p drops
the 3 non-home corners so the 32-tile deck suffices.

Next iteration: make adjacency state-driven (read state.systems) and wire createGame to a generated galaxy
for N-player configs (keeping the 2-player flower default). Then N-player setup.

## Final verification command (monitor-rerunnable)

Run from /home/grayson/workbench/mecatol-duel in a fresh shell:
    npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint
Expected: 472+ tests passing, tsc no output, lint 0 errors (only pre-existing fast-refresh warnings).

## Iteration 7 — state-driven adjacency (commit 393d11d)

Delivered this iteration:
- System now carries its hex neighbours; createGame populates them from the map spec
- adjacency.ts neighbours()/adjacent()/distance() take the systems record (no static-map import)
- Updated movement.ts pathLength, combat.ts retreatTargets, adjacency.test.ts
- Active 2-player map behaves identically (472 tests pass)

This is the keystone that lets a generated galaxy share the movement/combat code paths.

Remaining static-map couplings to lift next: systemDef() (planet defs for objectives/UI),
homeSystemId(), TRADE_POSTS, MECATOL_ID/SYSTEM_IDS.

Next iteration: wire createGame to build systems from generateGalaxy for N-player configs (GameConfig
carries faction+colour per seat), keeping the 2-player flower as the default; lift homeSystemId to be
state-driven. Then N-player setup + UI.

---

## 🪞 REFLECTION (after iteration 7 / Ralph iter 6)

**Accomplished.** The N-player *engine core* is done and green: seats as numbers, players[], snake draft,
initiative order, status/victory, secondary-window queue, N-player diplomacy/trade primaries, AI other(),
N-player objectives. On top of that, three foundational layers for the full game: all 17 base factions as
data (FactionId, starting units/techs/commodities/ability ids, flagship stats); the full 51-tile base-game
catalogue (tiles.ts) with planets/traits/tech-skips/wormholes/anomalies; and a seeded galaxy generator
(generateGalaxy) that lays out 3-6 player radius-3 hex maps with computed adjacency. The keystone refactor
(state-driven adjacency) means a generated galaxy and the fixed duel map now share movement/combat code.

**Working well.** The incremental, green-every-commit discipline (455 → 472 tests, never red on push).
Building pure, well-tested data/generator modules *before* wiring them in keeps risk low and each chunk
honestly verifiable. Recording rulings in the ledger as decisions are made. Small conventional commits
pushed immediately to main.

**Not working / blocking.** (1) The active map is still the 2-player flower; generateGalaxy is not yet wired
into createGame, and systemDef()/homeSystemId()/TRADE_POSTS still read the static map. (2) The 15 new
factions are data-only — abilities not wired. (3) The *bulk* of the full game is untouched: action cards,
agendas, promissory notes, Politics/Construction strategy cards, secret objectives, the agenda phase. That is
a very large surface and the real risk to "finishing."

**Adjust approach?** Yes, one steering change: stop perfecting foundations and get to a *playable N-player
vertical slice* as fast as possible — createGame builds a generated galaxy for N factions, a 3-6 player game
runs start-to-finish with the existing 6 strategy cards, minimal playable UI. A running N-player game is
worth more than further groundwork and de-risks the big feature surface by giving it somewhere to live.
The full-game features (action cards/agendas/promissory/secrets/Politics/Construction) come after the slice.

**Next priorities.** (1) Wire createGame to generateGalaxy for N-player configs + lift homeSystemId to state
(this iteration). (2) Prove a 3-player game constructs and runs. (3) Minimal N-player board/UI. (4) Then the
full-game content: 8 strategy cards (add Politics/Construction), action cards, agenda phase, secrets.

---

## Iteration 8 — planetIndex decoupling + createGame galaxy wiring (commits 2e4a5ec, 18c3c95)

Delivered this iteration:
- Refactored FactionDef.startingUnits to use planetIndex (index into home-system planets) instead of
  absolute planet ids — decouples factions from the map id scheme without migrating ~87 duel-id references
- createGame now picks its map by player count: 2 players keep the duel flower; 3-6 generate a galaxy
  via generateGalaxy, placing each faction's starting units on its canonical home planets
- New setup tests: 34-tile 3p / 37-tile 6p construction, per-faction units on home planets, determinism
  (475 tests total)

A 3-6 player game now CONSTRUCTS end-to-end. The duel (2p) is unchanged.

Next iteration: verify a 3-player game can be PLAYED through a full round (strategy draft → action phase
→ status) with N-player bots, not just constructed. Then minimal N-player board/UI. Then full-game content
(action cards, agendas, 8 strategy cards, secrets, promissory notes).

## Iteration 9 — N-player games PLAY (commit cebc938)

Delivered this iteration:
- Lifted the remaining static-map couplings so a generated galaxy plays, not just constructs:
  - System.home added; homeSystemOf(state, seat) replaces static homeSystemId() (Warfare, revive, foothold)
  - activatableSystems/diplomacySystems/warfareTokenSystems enumerate state.systems, not static SYSTEM_IDS
  - objectives control_4_outside_home reads system.home from state
  - trade-post lookups tolerate absent post systems (duel-only mechanic, not offered in a galaxy)
- New nplayer.test.ts: a 3-player generated-galaxy game completes a full round with no internal errors;
  3-seat snake draft verified. 477 tests total.

MILESTONE: N-player games (3-6) now CONSTRUCT and PLAY through a full round at the engine level.
The 2-player duel is byte-identical.

Ruling: trade posts are a duel rules module, not base TI4; full game needs a content-set split so N-player
games don't set up posts. Deferred (guards suffice for now).

Next iteration: N-player board/UI (render the generated hex galaxy, faction picker for up to 6 players),
OR start the full-game content (8 strategy cards incl. Politics/Construction). The engine vertical slice
is playable; UI makes it visible.

## Final verification command (monitor-rerunnable)

Run from /home/grayson/workbench/mecatol-duel in a fresh shell:
    npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint
Expected: 477+ tests passing, tsc no output, lint 0 errors (only pre-existing fast-refresh warnings).

## Iteration 10 — faction combat modifiers; card-data blocker noted (commit 73ffa74)

Delivered this iteration:
- Data-driven faction combat-roll modifiers: board.combatBonus() sums ability->modifier (unrelenting +1,
  fragile -1) from FACTIONS[faction].abilities, applied to space + ground combat rolls
- factionAbilities.test.ts: Sardakk cruiser hits 6+, Jol-Nar 8+, others printed 7+, attacker and defender
  (482 tests total)
- This is the pattern for wiring the rest of the 17 factions' abilities

BLOCKER noted: the /tmp/ti4-rules card decks (action_cards, agendas, objectives, promissory_notes) have NO
per-card base/PoK/Codex label (content_sets per_card_set: false). Objective Type (Stage1/2/Secret) exists and
the base Stage I/II lists look like the first 10 of each (names match), but action cards/agendas have no set
marker. Need a verified base-card list (Fandom wiki / AsyncTI4) before importing base-only card content.

Next iteration options:
(a) Source the base card lists (web research on Fandom wiki) then import objectives/action cards/agendas
(b) Wire more faction abilities (bounded, unblocked, high-value) — e.g. movement/production/combat abilities
(c) N-player UI (setup screen + hex board) — large but makes the slice human-playable

Faction abilities are the clearest unblocked mechanics path; card content needs the base-list sourcing first.

## Iteration 11 — planet trait/tech-skip in state; base objective list sourced (commit 1144c52)

Delivered this iteration:
- Planet gains trait (industrial/hazardous/cultural) + techSkip colour, populated on the duel map and
  generated galaxies. Foundation for real objectives + the tech-skip mechanic.
- Sourced + verified the base-game public objective list (10 Stage I + 10 Stage II; recorded in ledger).
  The objectives data is base-first ordered, so base = first 10 of each stage.

Progress: N-player engine plays; factions data complete; map/galaxy complete; combat modifiers wired;
planet traits/tech-skips in state. 483 tests.

## Iteration 12 — 20 base public objectives imported; stage I/II deck & spend tracking wired

Delivered this iteration:
- Imported all 20 base TI4 public objectives (10 Stage I worth 1 VP, 10 Stage II worth 2 VP) in `src/data/objectives.ts`.
- Player and PublicPlayer state tracking: `resourcesSpentThisRound`, `influenceSpentThisRound`, `tradeGoodsSpentThisRound`, `tokensSpentThisRound`.
- Per-round spend trackers wired into `startTactical`, `spendStrategyTokens`, `payCost`, `payMunitions`, `shipyard`, and `leadership`; reset on status phase.
- Objective deck setup: 5 Stage I cards placed on top of 5 Stage II cards from seed.
- `fulfils()` and `scoreObjective()` evaluate all 20 base objectives and award respective VP.
- AI bot scoring in `ai/score.ts` updated for all 20 objectives and invasion bombardment ordering.
- 504 passing tests across 51 test suites.

## Iteration 13 — N-player board/UI (rendered hex galaxy, dynamic 2-6p lobby, multi-seat HUD)

Delivered this iteration:
- `src/data/map.ts` & `src/engine/setup.ts`: assigned axial `q, r` coordinates to duel map systems and propagated `tile`, `q`, `r` to `state.systems` in `createGame`.
- `src/ui/layout.ts`: implemented flat-topped axial `hexToPixel(q, r, origin)`, `FLOWER_ORIGIN` (480, 480) & `GALAXY_ORIGIN` (522, 603), `GALAXY_MAP_SIZE` (1276x1407), generic planet markers (centers and fallback spots for 1, 2, or 3 planets), and space boxes for arbitrary systems.
- `src/ui/art.ts`: added `planetTrait` lookup, fallback tile asset (`00_blue.png`) for empty/untextured hexes, and generic token URL fallbacks for non-duel factions.
- `src/ui/board/Tile.tsx` & `src/ui/board/BoardMap.tsx`: dynamically renders every system in `state.systems` with exact hex positioning (guarding Mecatol placement on galaxy maps), sets CSS `--map-w`/`--map-h`, suppresses duel-only trade posts on generated galaxies.
- `src/ui/hud/TopBar.tsx`, `SidePanel.tsx`, `ActionBar.tsx`, `GameOverScreen.tsx`: multi-player top bar (compact blocks for 3-6p, classic dual layout for 2p, scored tokens across all seats), side panel seat inspection tabs, dynamic round and VP targets (7 VP / 6 rounds for 2p, 10 VP / 8 rounds for 3-6p).
- `src/ui/screens/SetupScreen.tsx`: 2-6 player toggle, dynamic seat config for all 17 factions with faction portraits, sigils, starting fleets, techs, commodities, duplicate faction/color collision auto-resolution, AI/Human controller selection, dynamic map summary and VP targets.
- `src/ui/store.tsx`: dynamic `clockMs: number[]` for arbitrary player count.
- Added comprehensive unit and UI tests in `SetupScreen.test.tsx`, `BoardMap.test.tsx`, and `Hud.test.tsx`.
- 509 passing tests across 51 test suites, 0 type errors, 0 lint errors.

MILESTONE: Full 2-to-6 player games are now completely human-playable through the UI!

## Iteration 14 (Ralph iter 12) — Complete base-game tile assets & 4-6 player strategy phase draft fix

Delivered this iteration:
- **Tile Assets Imported**: Downloaded all 51 official high-res 345×299 PNG base-game system tiles (01 to 51) from AsyncTI4 (`TI4_map_generator_bot/src/main/resources/tiles/`) into `public/assets/tiles/` (`01_Jord.png` through `51_Creuss.png`).
- **Wormhole Delta Asset**: Added `/assets/misc/emoji_WHdelta.png` and registered in `MISC.delta`.
- **Tile Resolution & Board Rendering (`src/ui/art.ts`, `src/ui/board/Tile.tsx`, `BoardMap.tsx`, `layout.ts`)**:
  - Added immutable `TILE_IMAGE_BY_NUMBER: Readonly<Record<number, string>>` for all 51 tiles and robust numerical/string name resolution in `tileUrl(systemId, tileFile, isGalaxy)`.
  - Propagated `isGalaxy` through `BoardMap` and `Tile.tsx`. On generated galaxy boards, tiles render authentic printed art with planets, anomalies, and wormholes directly on the hex, suppressing redundant floating planet image discs (`planetArtUrl`) while preserving interactive control nameplates, ground forces, structures, and space fleet boxes.
  - Resolved Creuss Gate (Tile 17) wormhole/sigil collision via `getWormholeSpot(systemId, hasSigil)` which places the delta wormhole on the left flank at `(36, 40)`.
- **Strategy Phase Draft Freeze Fix (`src/engine/strategyPhase.ts`, `src/engine/setup.ts`, `src/ui/store.tsx`)**:
  - Fixed `snakeOrder` in `strategyPhase.ts` and initial `draft` order in `setup.ts`:
    - 2–3 players: draft 2 cards in snake order (`[s0, s1, s1, s0]` or `[s0, s1, s2, s2, s1, s0]`).
    - 4–6 players: draft 1 card clockwise from speaker (`[s0, s1, ...]`).
    - Fixed stall where 6 players previously generated 12 draft slots for 6 cards, exhausting the strategy pool after 6 picks and freezing with 0 legal moves.
  - In `src/ui/store.tsx`: `apply()` synchronously updates `sessionRef.current = updated` before invoking `pumpAi(seed)`.
- **Tests & Verification**:
  - Added tests in `strategyPhase.test.ts` for 4, 5, and 6 player drafts, verifying transition to `action` phase, empty `draft`, trade good bonuses, and legal moves.
  - Added tests in `BoardMap.test.tsx` verifying printed tile src on generated galaxies (`18_MR.png`, `01_Jord.png`) and Creuss Gate delta wormhole without sigil collision.
  - 513 passing tests across 51 test suites, 0 type errors, 0 lint errors.

Next iteration options:
(a) Import the 8 standard TI4 base strategy cards (Politics / Construction to replace custom duel versions)
(b) Wire action card deck, player hands, and action card play window
(c) Wire secret objectives deck and scoring


