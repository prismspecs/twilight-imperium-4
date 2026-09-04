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

## Session checkpoint — N-player engine foundation complete (all pushed to twilight/main)

Delivered this session (all green: 457 tests, tsc clean, lint clean; each commit pushed):
- a1f5051/4a3ffc7: N-player core — seats/players arrays, snake draft, initiative, status phase, victory check, setup.
- c5654eb: secondary window — every other seat answers a strategy secondary in turn order, then the holder resumes.
- 36757ec: Diplomacy primary places a token for every other seat.
- e1012fb: plan progress tracker.

This is step 1 of the architecture sequence (engine N-player generalization). The remaining steps
(full faction data + all 17 ability implementations, complete tech/upgrade tree, all objective/action-card/
agenda/promissory decks, Politics + Construction + the agenda phase itself, the full map with anomalies and
wormholes, N-player bots, and the 6-player UI) are a very large body of work that will span further sessions.
Trade primary ("choose any number of other players") is the one remaining engine generalization.

## Iteration complete — Trade primary N-player generalization (commit c40ba95, pushed)

Trade primary now accepts `shareWith?: Seat[]` to choose which other players replenish without
spending a strategy token. The UI renders a checkbox per other player, and legalMoves enumerates
the bare primary plus one variant for each other seat. The trade count increments for both
trading players.

N-player engine generalization progress:
- Step 1 (N-player core): ✅ seats, players arrays, snake draft, initiative, status/victory, strategic/secondary window.
- Trade primary: ✅ N-player sharing (all strategy cards N-player except Trade secondary which is 2-player per player choice).
- Diplomacy primary: ✅ N-player token placement.
- Secondary window: ✅ N-player queue.

Remaining N-player gaps:
- Trade secondary: still 2-player (the responder is always the single other seat).
- Objectives (most are duel-specific "opponent" references, need N-player rewrite).
- AI/fog/score still assume a single foe (needs full player list iteration).

Next: import the full 17-faction data to enable actual multi-faction games.

## Iteration 2 complete — AI opponent generalized to N players (commit 787ed86, pushed)

The AI score's `other()` function now returns `(seat + 1) % n` instead of the hardcoded `seat === 0 ? 1 : 0`.
This enables the AI to play against any seat in an N-player game by using the next seat in order.

N-player engine generalization progress:
- Step 1 (N-player core): ✅ seats, players arrays, snake draft, initiative, status/victory, secondary window, diplomacy primary, Trade primary.
- AI opponent: ✅ generalized to any seat.
- Remaining: objectives (duel-specific opponent references), Setup UI (hardcoded to 2 players).

Next steps: objective N-player generalization or full faction data import to enable actual multi-faction games.

## Iteration 3 (Ralph iter 2) complete — N-player objectives (commit d2b042c, pushed)

more_ships and foothold no longer depend on otherSeat(). They compare against every other seat with
"at least one other" semantics, identical to the 2-player behaviour at N=2 and scaling to N players.
Added shared thirdSeat()/withThirdSeat() helpers in testUtils and an N-player objectives test.
Refactored strategicActions.test to reuse the shared helper.

Engine N-player status: core, secondary window, diplomacy primary, trade primary, AI other(), and
objectives are all N-player now. Remaining 2-player code: the Setup UI (hardcoded to [0,1]), the map
(2 home systems), and the many duel-specific data modules.

## Iteration 4 (Ralph iter 3) complete — faction data foundation (commit a2481d1, pushed)

Widened FactionId to all 17 base-game factions and filled the data layer:
- factions.ts: 15 new FactionDef entries with real starting units/techs/commodities/ability ids
- units.ts: flagship stats for all 17 factions
- art.ts: portrait/sigil paths for all 17 (assets to follow)
- fog.ts: PublicPlayer.faction widened to FactionId

Ruling recorded here: the 15 new factions are DATA ONLY this iteration. The setup screen hardcodes a
l1z1x/letnev swap and the map holds only those two home systems, so the new factions are never placed —
no gameplay change, and picking them is not possible yet. Wiring their abilities, their home systems
(the map import), a faction picker in Setup, and N-player setup are all still ahead.

## Resource note (user) — art + extra data source

The Fandom wiki https://twilight-imperium.fandom.com/wiki/Twilight_Imperium_Wiki can be scraped for all
faction portraits/sigils/tile art (and any extra data). Asset convention confirmed: public/assets/factions
already holds l1z1x.png / leader_l1z1x_commander.png, matching the per-faction paths added in art.ts.
Low priority — the 15 new factions are not selectable yet so their images are never loaded. Defer to the
art/faction-picker pass once the map supports more home systems.

## Iteration 5 (Ralph iter 3) — map-import foundation: tile catalogue (commits 172fbad, d94e241, pushed)

Ruling — planet-id scheme: the verified reference tiles.json uses concatenated planet ids
(arcprime, lisisii, mollprimus, mordaiii, archonren, ...) and faction id 'ghost' for the Ghosts of
Creuss. The codebase's active 2-player map and l1z1x/letnev factions keep their existing tested ids
('000', 'arc-prime', 'wren-terra') for now; the 15 unplaced factions were re-pointed at the canonical
tiles.json ids so the generated map needs no translation layer. When the active map is generated from
the catalogue, l1z1x/letnev will be migrated to canonical ids and their tests updated.

Delivered:
- src/data/tiles.ts — all 51 base-game tiles (16 home + Creuss Gate + off-board Creuss + Mecatol +
  20 blue planet + 12 red anomaly/empty), planets with resources/influence/trait/tech-skip/home
  faction, wormholes, anomalies. Generated from the verified JSON; fully typed; helpers tileByNumber,
  HOME_TILES, homeTileFor, CREUSS_GATE, MECATOL_TILE, GALAXY_TILES.
- src/data/tiles.test.ts — validates the catalogue (category/back mix, one home per faction,
  wormhole/anomaly totals, galaxy deck). 463 tests total.

Still ahead for the map: a galaxy generator that lays out N home systems + fills the ring from
GALAXY_TILES and computes hex adjacency; then swap the active map onto it; then N-player setup.

## Iteration 6 (Ralph iter 4) — galaxy generator (commits 233c945, 70d5625, pushed)

Ruling — map layout: the official per-player-count map diagrams are images, not machine-readable, so the
generator lays out a radius-3 axial hex (37 cells) and records these choices:
- Mecatol Rex (tile 18) at the centre (0,0).
- Homes on evenly spaced outer corners: 6p all six; 5p leaves one corner to the deck; 4p two adjacent
  pairs (E/NE and W/SW); 3p the three alternating corners.
- 3p drops the three non-home corner cells: a full ring would need 33 galaxy tiles but the box holds 32;
  dropping them uses 30 and stays 120-symmetric.
- Adjacency is computed from hex coordinates; wormholes link at runtime via adjacency.ts (now widened to
  include delta). This is a balanced, deterministic layout, not a pixel-copy of the printed diagrams.

Delivered:
- src/engine/galaxy.ts — generateGalaxy(homes, seed): 3-6 player galaxy as SystemDef[] + axial q/r.
- src/engine/galaxy.test.ts — 9 tests (board size per player count, home corner placement + planets,
  adjacency symmetry, one-use-per-tile, determinism, wormholes, player-count validation).
- Widened SystemDef.wormhole / System.wormhole to include 'delta'. 472 tests total.

Next: make adjacency state-driven (read state.systems, not the static SYSTEMS) and wire createGame to use
a generated galaxy for N-player configs, keeping the 2-player flower as the default. Then N-player setup.

## Iteration 7 (Ralph iter 5) — state-driven adjacency (commit 393d11d, pushed)

The keystone for dynamic maps: adjacency.ts previously read the static map module, coupling movement and
combat to the fixed duel map. Now each System placed in game state carries its hex neighbours (createGame
copies them from the map spec), and neighbours()/adjacent()/distance() take the systems record and read it,
with wormhole links resolved on top. Only two engine call sites used these (movement.ts pathLength, combat.ts
retreatTargets). The active 2-player map behaves identically — all 472 tests pass.

Ruling: adjacency belongs to game state, not a module constant, so a generated galaxy and the fixed flower
share the same movement/combat code. systemDef()/homeSystemId()/TRADE_POSTS still read the static map; those
are the remaining couplings to lift when createGame is wired to generateGalaxy (next).

## Iteration 8 (Ralph iter 6) — planetIndex decoupling + createGame galaxy wiring (commits 2e4a5ec, 18c3c95, pushed)

Ruling — starting-unit placement: FactionDef.startingUnits name the home planet by INDEX into the faction
home system planets (catalogue home-tile order) rather than an absolute planet id. createGame resolves the
index against the active map, so the same faction layout works on the fixed duel map (legacy ids 000,
arc-prime, wren-terra) and on a generated galaxy (canonical tiles.json ids 0.0.0, arcprime, wrenterra). This
avoided migrating ~87 references to the duel planet ids (engine tests + UI pixel layouts in art.ts/layout.ts).
The duel letnev planet order [arc-prime, wren-terra] matches the catalogue [arcprime, wrenterra], so placement
is byte-identical (472 tests stayed green).

createGame now chooses its map by player count: 2 players keep the duel flower; 3-6 generate a galaxy from
the catalogue. New setup tests cover 34-tile 3p and 37-tile 6p construction, per-faction starting units on
canonical home planets, and determinism. 475 tests total. A 3-6 player game now CONSTRUCTS; playing one
through end-to-end (full round loop, N-player bots) is the next verification.

## Iteration 9 (Ralph iter 7) — N-player games PLAY, static-map couplings lifted (commit cebc938, pushed)

Driving a 3-player generated-galaxy game through a full round exposed the remaining places that read the
fixed duel map instead of game state. All now state-driven:
- System gains home: Seat | null (populated by createGame); new homeSystemOf(state, seat) replaces static
  homeSystemId() in Warfare production, reviveInfantry, the Warfare secondary window, and foothold.
- objectives control_4_outside_home reads system.home from state, not systemDef().
- activatableSystems / diplomacySystems / warfareTokenSystems enumerate Object.keys(state.systems), not
  the static SYSTEM_IDS.
- Trade-post lookups tolerate absent post systems, so the duel-only trade-post mechanic is not offered in a
  galaxy. (Ruling: trade posts are a DUEL rules module, not base TI4; the full game will need a proper
  content-set split so N-player games do not set up posts at all. Deferred — the guards suffice for now.)

The duel (2p) is byte-identical (477 tests green). A 3-player game now completes a full round (strategy
draft -> action -> status -> round 2) with no internal errors. New nplayer.test.ts proves the full-round
smoke and the 3-seat snake draft.

N-player status: CONSTRUCT and PLAY both work at the engine level for 3-6 players with the 6 duel strategy
cards and duel objectives. Next: N-player board/UI, then the full-game content (8 strategy cards, action
cards, agendas, secrets, promissory notes).

## Iteration 10 (Ralph iter 8) — faction combat modifiers; card-data sourcing blocker noted (commit 73ffa74, pushed)

Wired the first always-on faction abilities beyond the pre-existing hardcoded Letnev/L1Z1X ones:
- board.combatBonus(state, owner) sums an ability->modifier map (unrelenting +1, fragile -1) read off
  FACTIONS[faction].abilities, so adding an ability id to a faction enables its modifier (data-driven).
- Applied to every combat roll: space combat (combatRolls, via the existing bonus hook) and ground combat
  (groundRolls). Per LRR 66 only combat rolls, not bombardment/AFB/space cannon.
- factionAbilities.test.ts proves the thresholds (Sardakk cruiser 6+, Jol-Nar 8+, others printed 7+),
  attacker and defender. 482 tests. This is the pattern for wiring the rest of the 17 factions.

BLOCKER recorded — base/pok content filtering: the /tmp/ti4-rules card decks (action_cards, agendas,
objectives, promissory_notes) have content_sets "per_card_set: false", i.e. NO per-card base/PoK/Codex
label. The objective Type field (Stage 1/2/Secret) is present and the base Stage I/II lists appear to be
the first 10 of each (names match the known base set), but action cards/agendas have no usable set marker.
To import base-only card content I need a verified base-card list (the Fandom wiki the user flagged, or
AsyncTI4 set annotations). Until then, content that depends on it (Politics' action cards, the agenda
phase, secrets, promissory notes) is blocked. Ruling to make: source the base card lists before importing.

## Iteration 11 (Ralph iter 9) — planet trait/tech-skip in state; base objective list sourced (commit 1144c52, pushed)

Added planet trait (industrial/hazardous/cultural) and tech-skip colour to the engine Planet, populated on
the duel map (from the catalogue) and generated galaxies. Foundation for the real objectives and the
tech-skip mechanic. Validated: every generated planet matches the catalogue. 483 tests.

SOURCING RULING (objectives): the /tmp/ti4-rules objectives.json has Type (Stage 1/Stage 2/Secret) but no
base/PoK label. Cross-referencing the Fandom wiki + twilightimperium.hu confirms the base game has exactly
10 Stage I + 10 Stage II public objectives and 12 secret objectives, and the data is ordered base-first.
Base public objectives (verified):
- Stage I (1 VP): Corner the Market, Develop Weaponry, Diversify Research, Erect a Monument, Expand Borders,
  Found Research Outposts, Intimidate Council, Lead From the Front, Negotiate Trade Routes, Sway the Council.
- Stage II (2 VP): Centralize Galactic Trade, Conquer the Weak, Form Galactic Brain Trust, Found a Golden Age,
  Galvanize the People, Manipulate Galactic Law, Master the Sciences, Revolutionize Warfare, Subdue the Galaxy,
  Unify the Colonies.
Action cards and agendas still lack a usable set marker in the data; source their base lists before import.

## Iteration 12 (Ralph iter 10) — 20 base public objectives imported, fulfils evaluation, Stage I/II deck structure, spend trackers

Replaced the custom 2-player duel objective deck with the authoritative 20 base TI4 public objectives (10 Stage I and 10 Stage II):
- `src/data/objectives.ts`: defined `ObjectiveDef` with `id`, `name`, `stage: 'stage1' | 'stage2'`, `points: 1 | 2`, `text`, `short`. Exported all 10 Stage I objectives (1 VP) and 10 Stage II objectives (2 VP), unified under `PUBLIC_OBJECTIVES`. Preserved legacy mandate definitions for transitional safety.
- `src/engine/types.ts` and `src/ai/fog.ts`: added `influenceSpentThisRound`, `tradeGoodsSpentThisRound`, and `tokensSpentThisRound` to `Player` and `PublicPlayer`.
- Engine spend tracking:
  - `startTactical`, `spendStrategyTokens`, and `shipyard` increment `tokensSpentThisRound`.
  - `payCost` cleanly separates resources paid from trade goods paid, incrementing `resourcesSpentThisRound` and `tradeGoodsSpentThisRound`.
  - `payMunitions` tracks trade goods spent in combat.
  - `leadership` tracks influence and trade goods spent on command tokens.
  - `finishStatusPhase` resets all 4 round-spend counters to 0.
- Public objective deck setup: `shuffledObjectives(seed)` shuffles 5 Stage I objectives on top of 5 Stage II objectives (10 cards total), drawn progressively across rounds.
- Objective scoring:
  - `fulfils()` evaluates all 20 base objectives (planet traits, unit upgrades, tech colors, non-home systems, tech specialties, ships adjacent to Mecatol, spend trackers, home planet capture).
  - `scoreObjective()` awards `def.points` (1 VP for Stage I, 2 VP for Stage II).
  - `ai/score.ts` evaluates all 20 base objectives in `objectiveFulfilled` and prioritizes `bombard` over `land` during invasion to soften defenders.
- Tests & verification:
  - `src/data/objectives.test.ts`: verified all 20 base objective definitions and points.
  - `src/engine/objectives.test.ts`: 26 comprehensive unit tests verifying all 20 base objectives, 1 vs 2 VP scoring, 5 Stage I + 5 Stage II deck structure, and Mecatol control.
  - Updated `production.test.ts`, `Strategic.test.tsx`, `hotseat.e2e.test.tsx`, and `fullGame.test.ts` (retuned SEEDS with 203 to cover bombard and ground combat).
  - 51 test files passing (504 tests total), 0 type errors, 0 lint errors.

