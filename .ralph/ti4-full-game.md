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
