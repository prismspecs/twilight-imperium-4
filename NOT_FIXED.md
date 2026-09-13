# Unwired audit items

## Faction abilities — wired vs display-only in factionAbilities.ts

Wired in engine (with tests): assimilate, harrow (l1z1x); munitions_reserves, armada (letnev); ambush, pillage (mentak); unrelenting (sardakk); fragile, brilliant, analytical (jolnar); quantum_entanglement, slipstream (creuss); mitosis (arborec); scavenge, nomadic (saar); masters_of_trade, guild_ships (hacan); versatile, orbital_drop (sol); star_forge, gashlai_physiology (muaat); peace_accords, quash (xxcha); telepathic, foresight (naalu); galactic_threat, propagation, technological_singularity (nekro).

Remaining (alphabetical by faction):
- hacan: arbiters
- nekro: (technological_singularity wired as valefar-assimilate hook only)
- winnu: blood_ties, reclamation
- yin: indoctrination, devotion
- yssaril: stall_tactics, scheming, crafty

Known limitations of current wirings (rulings taken during execution, need design passes):
- arborec: the Letani Warriors' PRODUCTION ability (pooled, can build infantry without a dock,
  lrr-factions.md 39-43) is not implemented; neither are mechs (the dock-producible Letani Behemoth,
  lrr-factions.md 76). Mitosis itself (no dock-built infantry, mandatory status-phase placement) is wired.
- nekro propagation: grants 3 strategy tokens instead of researching technology (no tech-choice UI).
- nekro galactic_threat: the seat is correctly skipped in the vote order; the outcome-prediction tech steal is not wired.
- agendas: Elect Planet is enumerated and Senate Sanctuary/Terraforming Initiative/Core Mining/Compensated
  Disarmament/Minister of War resolve; the attached ongoing effects (Demilitarized Zone landing ban, Holy
  Planet of Ixth VP swings, Research Team prerequisite ignores) are recorded in `Planet.attachments` but not
  enforced. Elect Law and Elect Scored Secret Objective are still abstain-only stubs (laws in play are only
  tracked as planet attachments so far).
- planet resource/influence changes from attached laws are live in the engine but invisible on the board:
  the generated galaxy's tile art bakes the printed values into the image, so a modified planet needs a
  badge overlay that does not exist yet.
- xxcha quash: auto-reveals the next agenda without a player choice; no rider/when-window handling.
- naalu foresight: reaction-log hook in startTactical, not a full retreat-into-the-active-system mechanic.
- hacan guild_ships: places the infantry automatically; LRR makes it a choice ("may place").
- sol orbital_drop: reinforcement accounting not validated against the fleet supply edge cases.
- muaat star_forge: uses cheapestPlanets for the destroyer cost; production-capacity validation missing.

## Faction tech — 11 factions have zero `kind: 'faction'` entries in techs.ts
(saar, muaat, sol, creuss, mentak, naalu, sardakk, winnu, xxcha, yin, yssaril) — only 6 have faction tech (l1z1x, letnev, arborec, hacan, jolnar, nekro).

## Promissory notes — 0 files, 0 engine wiring
Requires `src/data/promissory_notes.ts` + engine module. The old trade-post code was removed but its tests remain (see below).

## Test-suite debt (measured 2026-09-09: 270 failed / 449 passed at commit 048c117)
The gate was dead for a long stretch; three classes of rot shipped while it was red:
1. Stale fixtures: most engine/UI test files reference the removed fixed 2-player map ids
   ('home-n', 'bereg', 'quann', planet '000'). Biggest offenders: combat.test.ts (35), movement.test.ts (27),
   invasion.test.ts (25), Tactical.test.tsx (19), actionCards.test.ts (16), production.test.ts (15),
   strategicActions.test.ts (14), layout.test.ts (12), BoardMap.test.tsx (11), reactions.test.ts (11).
   Needs a testUtils rework to derive ids from the generated galaxy (factionAbilities.test.ts shows how).
2. Removed trade-post APIs still imported by tests: `tradePostOptions` (componentActions.test.ts),
   `../data/posts` (setup.test.ts, statusPhase.test.ts), `posts`/`postAbilityUsed`/`trades` state fields
   (persist.test.ts, strategicActions.test.ts), `homeSystemId`/`SYSTEMS` from data/map
   (revival.test.ts, debugLogger.test.ts, layout.test.ts). Per CLAUDE.md trade posts are legacy: delete or
   rewrite these tests.
3. combat.ts has 5 implicit-any index errors (type-only, no runtime impact) — the last src/ tsc errors.

## Notes
- 2 factions have `startingTechs: []` (Sardakk, Winnu); correct count, not 8.
- Creuss starts with gravity_drive, which masks Slipstream (+1) at range ≤ 2; test at range 3.
## Agenda residue (2026-09-10)
- New Constitution "For" discards all laws (activeAgendas, lawOwners, planet attachments) but the
  resource/influence value patches baked into planets by Senate Sanctuary (+2 influence) and Core Mining
  (+2 resources) are not stored reversibly, so they persist after the law is discarded until the planet
  is otherwise reread. A reversible value stack on Planet would let this be exact.

## Agenda gaps (2026-09-10)
- `publicize_weapon_schematics` "For": prereq ignore on war sun techs and war sun SUSTAIN DAMAGE loss
  require deeper refactoring: `canResearch` and `canSustain` need GameState to check `activeAgendas`,
  which requires updating all callers in `research.ts`, `combat.ts`, and movement/adjacency.
- `regulated_conscription` "For" production cap is enforced via `productionCost` but doesn't yet affect
  `productionLimit` or the UI's production picker display — a player might still be offered to produce
  2 fighters for 1 resource (if the system has resources for it) despite the law.
- `wormhole_research` "For": each player with ships in a wormhole system may research 1 technology;
  that per-player research prompt is not machine-drivable inside the synchronous resolver, so the
  resolver logs "prompt required" and only destroys the ships in alpha/beta wormhole systems.
- `wormhole_research` "Against": token type returned to reinforcements is unspecified by the card; the
  resolver takes a tactic token (default pool), flooring at 0.
- PDS II: the unit upgrade now appears in the menu, upgrades Space Cannon 6→5, but its Deep Space Cannon
  ability (fire Space Cannon against ships in an ADJACENT system during Space Cannon Offense) is not yet
  wired into combat.ts `spaceCannonOffense`, which only scans the active system.
