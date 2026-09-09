# Unwired audit items (from structural audit, not new breakage)

## Faction abilities — 30 display-only in factionAbilities.ts (wired: 7/34)
Wired in engine: assimilate, harrow (l1z1x); munitions_reserves, armada (letnev); ambush (mentak); unrelenting (sardakk); fragile, brilliant, analytical (jolnar); quantum_entanglement (adjacency only).

Remaining (alphabetical by faction):
- arborec: mitosis
- saar: scavenge, nomadic
- muaat: star_forge, gashlai_physiology
- hacan: masters_of_trade, guild_ships, arbiters
- sol: orbital_drop, versatile
- creuss: slipstream, creuss_gate (quantum_entanglement adjacency fixed)
- mentak: pillage (ambush wired)
- naalu: telepathic, foresight
- nekro: galactic_threat, propagation, technological_singularity
- winnu: blood_ties, reclamation
- xxcha: peace_accords, quash
- yin: indoctrination, devotion
- yssaril: stall_tactics, scheming, crafty

## Faction tech — 11 factions have zero `kind: 'faction'` entries in techs.ts
(saar, muaat, sol, creuss, mentak, naalu, sardakk, winnu, xxcha, yin, yssaril) — only 6 have faction tech (l1z1x, letnev, arborec, hacan, jolnar, nekro).

## Promissory notes — 0 files, 0 engine wiring
Requires `src/data/promissory_notes.ts` + `posts`/`trades` module (currently missing — causes 198 pre-existing test failures).

## Notes
- 2 factions have `startingTechs: []` (Sardakk, Winnu); correct count, not 8.
- L1Z1X Assimilate/Harrow, Letnev Armada/Munitions, Mentak Ambush, Sardakk Unrelenting, Jol-Nar Fragile ARE wired.
