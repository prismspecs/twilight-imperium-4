## Goal: Implement remaining missing agenda effects

### Agendas NOT implemented yet:

**Directive agendas (For/Against or Elect outcomes):**
1. `enforced_travel_ban` - For: disable alpha/beta wormholes; Against: destroy PDS in/wormhole systems
2. `publicize_weapon_schematics` - For: ignore war sun prereqs ✓ (partial, prereq/sustain needs deeper refactoring); Against: war sun owners discard action cards ✓
3. `regulated_conscription` - For: 1 fighter+infantry per cost ✓; Against: no effect (commit NEXT)
4. `representative_government_base_game` - For: limit votes; Against: exhaust cultural planets
5. `shared_research` - For: move through nebulae; Against: place token in home system
6. `wormhole_reconstruction` - For: all alpha/beta wormholes adjacent; Against: place tokens in wormhole systems
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

### Reflection (iteration 6):
- Iterations 3-6 produced 6 commits implementing 5 directives (homeland_defense_act, new_constitution,
  regulated_conscription For, representative_government, shared_research) and partial publicize_weapon_schematics.
- All commits passed tsc/lint; suite remains 256 failed / 496 passed (752 total), same as committed baseline.
- `shared_research` For: passable() now allows nebulae as waypoints when activeAgendas includes shared_research.
  Per spec, ships starting in nebulae treat their move value as one — this is handled implicitly by the
  movement code (shortestPath uses the ship's move value against path length).
- Commits: 7ba2058 pushed. Cumulative agenda commits: 3a503ac, 3c8b9d9, 4b4ac5b, 54f9690, a9694cb,
  4283114, 05b8953, 751c370, 7a2618e, 7ba2058.
- Remaining: `enforced_travel_ban` (wormhole movement ban), `wormhole_reconstruction` (wormhole adjacency),
  `representative_government_base_game` vote limit (For), `shared_research` (nebula movement) ✓,
  `wormhole_research` (???), or Elect-Law `miscount_disclosed`, `the_crown_of_thalnos`,
  `colonial_redistribution`, `committee_formation`.