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
