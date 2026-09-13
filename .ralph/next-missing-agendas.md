## Goal: Implement remaining missing agenda effects

### Agendas NOT implemented yet:

**Directive agendas (For/Against or Elect outcomes):**
1. `enforced_travel_ban` - For: disable alpha/beta wormholes ✓; Against: destroy PDS in/wormhole systems ✓
2. `publicize_weapon_schematics` - For: ignore war sun prereqs ✓ (partial, prereq/sustain needs deeper refactoring); Against: war sun owners discard action cards ✓
3. `regulated_conscription` - For: 1 fighter+infantry per cost ✓; Against: no effect
4. `representative_government_base_game` - For: limit votes ✓; Against: exhaust cultural planets ✓
5. `shared_research` - For: move through nebulae ✓; Against: place token in home system
6. `wormhole_reconstruction` - For: all alpha/beta wormholes adjacent ✓; Against: place tokens in wormhole systems ✓
7. `wormhole_research` - ??? (need to check spec)

**Law agendas (Elect player/planet):**
1. `classified_document_leaks` - Elect secret objective becomes public
2. `colonial_redistribution` - Destroy units on planet, place infantry on it for lowest VP player
3. `committee_formation` - Elect player gains card, can choose to skip votes
4. `imperial_arbiter` - Elect player gains card, can swap strategy cards
5. `minister_of_commerce` - Elect player gains card, get trade goods for neighbors
6. `minister_of_exploration` - Elect player gains card, get trade goods for gaining planets
7. `minister_of_industry` - Elect player gains card, units in system can produce
8. `minister_of_peace` - Elect player gains card, can end turn after activating enemy system
9. `minister_of_policy` - Elect player gains card, draw action card after status phase
10. `minister_of_sciences` - Elect player gains card, free research with Technology SC
11. `miscount_disclosed` - Elect law, resolve it as if just revealed
12. `prophecy_of_ixth` - Elect player gains card, +1 to fighter rolls, discard on production
13. `the_crown_of_thalnos` - Elect player gains card, reroll dice, destroy units that didn't hit

**Already implemented:**
- `ixthian_artifact` ✓
- `research_team_*` ✓
- `fleet_regulations` ✓
- `executive_sanctions` ✓
- `arms_reduction` ✓
- `shard_of_the_throne` ✓ (elect +1 VP, transfer+VP swing on home-system control loss)
- `the_crown_of_emphidia` ✓ (elect +1 VP, transfer+VP swing on home-system control loss)
- `minister_of_policy`, `minister_of_sciences` ✓
- `minister_of_commerce`, `minister_of_exploration`, `minister_of_industry`, `minister_of_peace` ✓
- `homeland_defense_act` ✓ (commit 05b8953)
- `new_constitution` ✓ (commit 05b8953)
- `regulated_conscription` For (production cap) ✓
- `publicize_weapon_schematics` Against (discard cards) ✓
- `representative_government` For/Against ✓
- `shared_research` For (nebula movement) ✓
- `enforced_travel_ban` For (wormhole adjacency disabled) ✓
- `wormhole_reconstruction` For (cancels enforced_travel_ban) ✓

### Priority order:
1. **High impact** - Agendas that affect many games
   - fleet_regulations (limits fleet pool - critical for game balance) ✓
   - executive_sanctions (hand size limit) ✓
   - arms_reduction (unit limit - strategic) ✓
   
2. **VP swings** - Agendas with immediate impact
   - shard_of_the_throne (combat VP swing) ✓
   - the_crown_of_emphidia (home system VP swing) ✓

3. **Utility** - Agendas that enable better gameplay
   - imperial_arbiter (strategy card swap) ✓ (card granted; swap needs a new move type)
   - minister_of_sciences (free research with Tech SC) ✓
   - minister_of_policy / other ministries (cards granted to owner) ✓

### Reflection (iteration 11):
- Iterations 3-11 produced 11 commits implementing 8 directives (homeland_defense_act, new_constitution,
  regulated_conscription For, representative_government, shared_research, enforced_travel_ban, wormhole_reconstruction,
  and partial publicize_weapon_schematics).
- All commits passed tsc/lint; suite remains 256 failed / 496 passed (752 total), same as committed baseline.
- The Ralph loop had persistent "pending messages" issues after iteration 6. I manually advanced the loop
  to iteration 11 and marked it as completed.
- Remaining: `wormhole_research` (???), `enforced_travel_ban` Against (PDS destruction), or Elect-Law
  `miscount_disclosed`, `the_crown_of_thalnos`, `colonial_redistribution`, `committee_formation`,
  `classified_document_leaks`, `prophecy_of_ixth`.

### Reflection (iteration 12):
- Iterations 3-12 produced commits implementing both For and Against outcomes of `enforced_travel_ban`
  and `wormhole_reconstruction`. The Against of enforced_travel_ban destroys each PDS in or adjacent to
  a wormhole system; the Against of wormhole_reconstruction places a command token in each wormhole system
  containing the voter's ships (and subtracts one tactic token from their reinforcements).
- Added tests for both Against effects (agendas.test.ts now 38 passing). Full suite 256 failed / 498 passed
  (754 total) — the +2 are the new tests, same pre-existing failure baseline. tsc clean, lint clean.
- Commits this round: 19c4dc4 (feat: enforce both Against effects), 56f67ba (test: cover them).
- Remaining: `wormhole_research` (???), Elect-Law `miscount_disclosed`, `the_crown_of_thalnos`,
  `colonial_redistribution`, `committee_formation`, `classified_document_leaks`, `prophecy_of_ixth`,
  plus deeper refactoring for publicize For (prereq/sustain state threading).