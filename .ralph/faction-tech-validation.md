# Fix: Star Forge and Orbital Drop not appearing in legal moves

## Problem
The Star Forge (Muaat) and Orbital Drop (Sol) faction abilities are implemented in `src/engine/componentActions.ts` but are NOT offered in the legal move enumerator (`src/engine/legalMoves.ts`). This means players cannot see these as available moves even though they should be playable.

## Current State
- ✅ `src/engine/componentActions.ts` has `canStarForge()` and `starForge()` functions
- ✅ `src/engine/componentActions.ts` has `canOrbitalDrop()` and `orbitalDrop()` functions
- ✅ `src/engine/legalMoves.ts` NOW offers these as legal moves (fixed)
- ✅ AI stress tests pass without regression (50/50 finished cleanly)

## Changes Made
1. **src/engine/types.ts**: Added `starForge` and `orbitalDrop` to Move union type with proper fields
2. **src/engine/legalMoves.ts**: Added enumeration of Star Forge (fighter/destroyer) and Orbital Drop moves for legal play
3. **src/engine/index.ts**: Added handlers for starForge and orbitalDrop in applyMove, plus re-exports

## Verification
- Star Forge: Offers 2 moves (fighter, destroyer) when Muaat has war sun and 1+ strategy token in action phase
- Orbital Drop: Offers move per controlled planet when Sol has 2+ infantry in reinforcements and 1+ strategy token in action phase
- Both are only available in the action phase (as per rules)
- All AI stress and match tests pass without regression

## Root Cause
In `legalMoves.ts` around line 406-430, the engine offers:
- `research` for Inheritance Systems
- `productionBiomes` for Hacan
- `transitDiodes` for Xxcha

But it's missing:
- `starForge` for Muaat
- `orbitalDrop` for Sol

## Plan
1. Import `canStarForge`, `starForge`, `canOrbitalDrop`, `orbitalDrop` in `legalMoves.ts`
2. Add checks for these abilities in the `legalMoves()` function and offer them as moves
3. Add match handlers in the `matches()` function
4. Run tests to verify

## Expected Outcome
- Star Forge and Orbital Drop should appear in legal moves when available
- Players should be able to play these abilities through the UI
- No more erroneous moves where these abilities are ignored

## COMPLETE
All items done. Implementation verified in action phase with targeted tests:
- Muaat Star Forge offers `{type:'starForge', unitType:'fighter'}` and `{type:'starForge', unitType:'destroyer'}` when war sun + 1+ strategy token
- Sol Orbital Drop offers `{type:'orbitalDrop', planetId}` for each controlled planet when 2+ infantry reinforcements + 1+ strategy token
- Both gated to action phase via existing canStarForge/canOrbitalDrop readiness + applyMove phase validation
- No regression: `npm run ai:stress` → `no failures` (50/50)
- Unit test counts unchanged (30 failed / 64 passed files), all pre-existing

## Final Monitor-Rerunnable Command
Working dir: `/home/grayson/workbench/mecatol-online`
Env: PROD-less vitest config, `NODE_ENV=test` implied by npm scripts
```
npm run ai:stress
```
Expected output summary: ends with `no failures` after 50 6-player AI games. This exercises the full engine including the new starForge/orbitalDrop matches without regression.
## LRR Re-validation (second pass) — Star Forge mechanics bug found & fixed

Free placement, not production, per printed text / LRR:
- Printed Star Forge: "Spend 1 strategy token to place 2 fighters or 1 destroyer **from reinforcements** in a system containing one of your war suns." → **no resource cost**, no space dock, no production step.
- lrr-factions.md Star Forge: only clarification is the war-sun-on-board requirement; mechanics come from the faction sheet (free placement).
- LRR 683.3: a component action cannot be performed if its ability cannot be completely resolved.

Pre-existing `starForge()` was broken two ways:
1. It routed through `produce(...)`, which requires `state.tactical.step === 'production'` — but `actionReady()` (the gate that `starForge()` already calls) refuses any active tactical action. Result: Star Forge appeared in legalMoves but ALWAYS failed execution with `not in the production step`. (Confirmed via targeted test: both fighter and destroyer returned that error before the fix.)
2. It charged `4` resources to build a destroyer — contradicts the rules and the engine's own data text (free placement).

Fix (`src/engine/componentActions.ts`):
- Rewrote `starForge()` as a direct placement from reinforcements (mirroring `orbitalDrop`): decrement the chosen unit from `reinforcements`, push it into the chosen war-sun system's space area, spend 1 strategy token, set `turnDone: true`.
- Added `starForgeTarget(state, seat, unitType)` — returns the war-sun system that can legally receive the unit, probing `checkFleet` (capacity / fleet pool per LRR 1123.3) and requiring enough units in reinforcements (LRR 683.3).
- Added `canStarForgeUnit(state, seat, unitType)` so legalMoves only offers the fighter move when 2 fighters can be placed and the destroyer move when 1 destroyer can be placed (previously both were offered blindly from `canStarForge`).
- Removed now-unused `produce` import.

Verification:
- Fighter Star Forge: reinforcements fighter 97→95, warsun system fighters 2→4, strategy token 2→1, `turnDone: true`.
- Destroyer Star Forge: reinforcements destroyer 8→7, strategy token spent.
- Second use same turn correctly rejected (`R3.2: your action is already spent`).
- `npx tsc -p tsconfig.app.json --noEmit`: no errors in changed files.
- `npm run lint`: clean (pre-existing warnings only).
- `npm test`: unchanged pre-existing counts (30 failed / 64 passed files; 216 failed / 667 passed tests).
- `npm run ai:stress` → `no failures` (50/50).
