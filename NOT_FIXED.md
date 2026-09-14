# Unwired audit items

## Faction abilities — wired vs display-only in factionAbilities.ts

Wired in engine (with tests): assimilate, harrow (l1z1x); munitions_reserves, armada (letnev); ambush, pillage (mentak); unrelenting (sardakk); fragile, brilliant, analytical (jolnar); quantum_entanglement, slipstream (creuss); mitosis (arborec); scavenge, nomadic (saar); masters_of_trade, guild_ships (hacan); versatile, orbital_drop (sol); star_forge, gashlai_physiology (muaat); peace_accords, quash (xxcha); telepathic, foresight (naalu); galactic_threat, propagation, technological_singularity (nekro); blood_ties, reclamation (winnu); stall_tactics, scheming, crafty (yssaril).

Remaining (alphabetical by faction):
- hacan: arbiters
- nekro: (technological_singularity wired as valefar-assimilate hook only)
- yin: indoctrination, devotion

Known limitations of current wirings (rulings taken during execution, need design passes):
- arborec: the Letani Warriors' PRODUCTION ability (pooled, can build infantry without a dock,
  lrr-factions.md 39-43) is not implemented; neither are mechs (the dock-producible Letani Behemoth,
  lrr-factions.md 76). Mitosis itself (no dock-built infantry, mandatory status-phase placement) is wired.
- nekro propagation: grants 3 strategy tokens instead of researching technology (no tech-choice UI).
- nekro galactic_threat: the seat is correctly skipped in the vote order; the outcome-prediction tech steal is not wired.
- agendas: All 50 base game agendas are fully defined in AGENDA_RESOLVERS. Elect Planet, Elect Law, Elect Scored Secret Objective, and Elect Player are all enumerated with legal outcomes. Attached laws (Senate Sanctuary, Terraforming Initiative, Core Mining, Compensated Disarmament, Demilitarized Zone, Holy Planet of Ixth, Research Teams) and Elect Player laws (Ministries, Imperial Arbiter, Shard of the Throne, Crown of Emphidia, Prophecy of Ixth, Committee Formation, Crown of Thalnos) are resolved. Prophecy of Ixth (+1 fighter combat bonus, discarded when producing < 2 fighters) and Conventions of War (cultural bombardment ban) are enforced. Miscount Disclosed triggers an immediate revote on the elected law. Classified Document Leaks places the secret objective in publicObjectives. Judicial Abolishment discards the elected law from play.
- planet resource/influence changes from attached laws are live in the engine but invisible on the board:
  the generated galaxy's tile art bakes the printed values into the image, so a modified planet needs a
  badge overlay that does not exist yet.
- xxcha quash: auto-reveals the next agenda without a player choice; no rider/when-window handling.
- naalu foresight: reaction-log hook in startTactical, not a full retreat-into-the-active-system mechanic.
- hacan guild_ships: places the infantry automatically; LRR makes it a choice ("may place").
- sol orbital_drop: reinforcement accounting not validated against the fleet supply edge cases.
- muaat star_forge: uses cheapestPlanets for the destroyer cost; production-capacity validation missing.

## Faction tech — all 17 factions populated in techs.ts
All 17 factions have both of their faction technologies (34 total: 8 unit upgrades and 26 faction ability technologies) fully defined in `src/data/techs.ts`.

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
- `regulated_conscription` "For": cost calculation (1 resource per fighter/infantry) is enforced in engine via `productionCost(..., state)`, and UI `ProductionPicker` and AI `fillProduce` pass `state`.
- `wormhole_research` "For": each player with ships in a wormhole system may research 1 technology;
  that per-player research prompt is not machine-drivable inside the synchronous resolver, so the
  resolver logs "prompt required" and only destroys the ships in alpha/beta wormhole systems.
- `wormhole_research` "Against": token type returned to reinforcements is unspecified by the card; the
  resolver takes a tactic token (default pool), flooring at 0.
