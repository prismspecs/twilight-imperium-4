## Goal: Implement missing agenda effects

### Agendas that need implementation (no resolver yet):

**Directive agendas (For/Against or Elect outcomes):**
1. `arms_reduction` - For: destroy excess dreadnoughts/cruisers; Against: exhaust planets with tech specialties
2. `enforced_travel_ban` - For: disable alpha/beta wormholes; Against: destroy PDS in/wormhole systems
3. `executive_sanctions` - For: limit action cards to 3; Against: discard 1 random action card
4. `fleet_regulations` - For: limit fleet pool to 4; Against: add 1 token to fleet pool
5. `homeland_defense_act` - For: remove PDS limit; Against: destroy 1 PDS
6. `new_constitution` - For: discard all laws; Against: exhaust home planets
7. `publicize_weapon_schematics` - For: ignore war sun prereqs; Against: war sun owners discard action cards
8. `regulated_conscription` - For: 1 fighter+infantry per cost; Against: no effect
9. `representative_government_base_game` - For: limit votes; Against: exhaust cultural planets
10. `shared_research` - For: move through nebulae; Against: place token in home system
11. `wormhole_reconstruction` - For: all alpha/beta wormholes adjacent; Against: place tokens in wormhole systems
12. `wormhole_research` - ??? (need to check spec)

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
13. `shard_of_the_throne` - Elect player gains card and 1 VP, VP swings on combat
14. `the_crown_of_emphidia` - Elect player gains card and 1 VP, VP swings on home system control
15. `the_crown_of_thalnos` - Elect player gains card, reroll dice, destroy units that didn't hit

**Tech prerequisite ignore (research teams):**
16. `research_team_biotic` - Ignore 1 green prerequisite when exhausting
17. `research_team_cybernetic` - Ignore 1 yellow prerequisite when exhausting
18. `research_team_propulsion` - Ignore 1 blue prerequisite when exhausting
19. `research_team_warfare` - Ignore 1 red prerequisite when exhausting

### Priorities:
1. Research teams (16-19) - they're just placeholders, easy to implement
2. Most impactful directive agendas (arms_reduction, fleet_regulations, executive_sanctions)
3. Law agendas with immediate VP swings (shard_of_the_throne, the_crown_of_emphidia)

### Plan:
1. Implement research team agendas first (they're straightforward)
2. Then implement the most impactful ones based on game impact
3. Test each implementation
4. Commit and push