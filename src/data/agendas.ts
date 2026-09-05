/**
 * The 50 base-game agendas, imported from the AsyncTI4 catalogue filtered on `source: "base"`
 * (PoK, Codex, Absol and Discordant Stars agendas are excluded).
 *
 * The agenda phase itself is not implemented yet. The deck is real all the same: it is shuffled from the
 * game seed at setup and the Politics primary looks at its top two cards and puts them back in any order,
 * so when the agenda phase lands it reveals from exactly this deck, in exactly this order.
 */
export type AgendaKind = 'law' | 'directive'

export interface AgendaDef {
  id: string
  name: string
  /** A law stays in play once resolved; a directive resolves once and is discarded. */
  kind: AgendaKind
  /** What is voted on: 'For/Against', 'Elect Player', 'Elect Planet', ... */
  target: string
  /** The printed outcome text; For and Against outcomes are joined into one string. */
  text: string
}

export const AGENDAS: readonly AgendaDef[] = [
  { id: 'anti_intellectual_revolution', name: 'Anti-Intellectual Revolution', kind: 'law', target: 'For/Against', text: 'For: After a player researches a technology, that player must destroy 1 of their non-fighter ships. Against: At the start of the next strategy phase, each player chooses and exhausts 1 planet for each technology that they own.' },
  { id: 'archived_secret', name: 'Archived Secret', kind: 'directive', target: 'Elect Player', text: 'The elected player draws 1 secret objective.' },
  { id: 'arms_reduction', name: 'Arms Reduction', kind: 'directive', target: 'For/Against', text: 'For: Each player destroys all but 2 of their dreadnoughts and all but 4 of their cruisers. Against: At the start of the next strategy phase, each player exhausts each of their planets that have a technology specialty.' },
  { id: 'classified_document_leaks', name: 'Classified Document Leaks', kind: 'law', target: 'Elect Scored Secret Objective', text: 'The elected secret objective becomes a public objective - place it near the other public objectives in the common play area.' },
  { id: 'colonial_redistribution', name: 'Colonial Redistribution', kind: 'directive', target: 'Elect Non-Home Planet Other Than Mecatol Rex', text: 'Destroy each unit on the elected planet. Then, the player who controls that planet chooses 1 player with the fewest victory points - that player may place 1 infantry from their reinforcements on that planet.' },
  { id: 'committee_formation', name: 'Committee Formation', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. Before players vote on an agenda that requires a player to be elected, the owner of this card may discard this card to choose a player to be elected. Players do not vote on that agenda.' },
  { id: 'compensated_disarmament', name: 'Compensated Disarmament', kind: 'directive', target: 'Elect Planet', text: 'Destroy each ground force on the elected planet. For each unit that was destroyed, the player who control that planet gains 1 trade good.' },
  { id: 'conventions_of_war', name: 'Conventions of War', kind: 'law', target: 'For/Against', text: 'For: Players cannot use BOMBARDMENT against units that are on cultural planets. Against: Each player that voted "Against" discards all of their action cards.' },
  { id: 'core_mining', name: 'Core Mining', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. Then, destroy 1 infantry on the planet. The resource value of this planet is increased by 2.' },
  { id: 'demilitarized_zone', name: 'Demilitarized Zone', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. Then, destroy all units on that planet. Player\'s units cannot land, be produced, or be placed on this planet.' },
  { id: 'economic_equality', name: 'Economic Equality', kind: 'directive', target: 'For/Against', text: 'For: Each player returns all of their trade goods to the supply. Then, each player gains 5 trade goods. Against: Each player returns all of their trade goods to the supply.' },
  { id: 'enforced_travel_ban', name: 'Enforced Travel Ban', kind: 'law', target: 'For/Against', text: 'For: Alpha and beta wormholes have no effect during movement. [Note: this only affects normal wormhole adjacency. Creuss agent, other agenda laws, and the _Lost Star Chart_ action card will overrule this.] Against: Destroy each PDS in or adjacent to a system that contains a wormhole.' },
  { id: 'executive_sanctions', name: 'Executive Sanctions', kind: 'law', target: 'For/Against', text: 'For: Each player can have a maximum of 3 action cards in their hand. Against: Each player discards 1 random action card from their hand.' },
  { id: 'fleet_regulations', name: 'Fleet Regulations', kind: 'law', target: 'For/Against', text: 'For: Each player cannot have more than 4 tokens in their fleet pool. Against: Each player places 1 command token from their reinforcements in their fleet pool.' },
  { id: 'holy_planet_of_ixth', name: 'Holy Planet of Ixth', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. The planet\'s owner gains 1 victory point. Units on this planet cannot use PRODUCTION. When a player gains control of this planet, they gain 1 victory point. When a player loses control of this planet, they lose 1 victory point.' },
  { id: 'homeland_defense_act', name: 'Homeland Defense Act', kind: 'law', target: 'For/Against', text: 'For: Each player can have any number of PDS units on planets they control. Against: Each player destroys 1 of their PDS units.' },
  { id: 'imperial_arbiter', name: 'Imperial Arbiter', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. At the end of the strategy phase, the owner of this card may discard this card to swap 1 of their strategy cards with 1 of another player\'s strategy cards.' },
  { id: 'incentive_program', name: 'Incentive Program', kind: 'directive', target: 'For/Against', text: 'For: Draw and reveal 1 stage I public objective from the deck and place it near the public objectives. Against: Draw and reveal 1 stage II public from the deck and place it near the public objectives.' },
  { id: 'ixthian_artifact', name: 'Ixthian Artifact', kind: 'directive', target: 'For/Against', text: 'For: The speaker rolls 1 die. If the result is 6-10, each player may research 2 technologies. If the result is 1-5, destroy all units in Mecatol Rex\'s system, and each player with units in systems adjacent to Mecatol Rex\'s system destroys 3 of their own units in each of those systems. Against: No effect.' },
  { id: 'judicial_abolishment', name: 'Judicial Abolishment', kind: 'directive', target: 'Elect Law', text: 'Discard the elected law from play.' },
  { id: 'minister_of_commerce', name: 'Minister of Commerce', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. After the owner of this card replenishes commodities, they gain 1 trade good for each player that is their neighbor.' },
  { id: 'minister_of_exploration', name: 'Minister of Exploration', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. When the owner of this card gains control of a planet, they gain 1 trade good.' },
  { id: 'minister_of_industry', name: 'Minister of Industry', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. When the owner of this card places a space dock in a system, their units in that system may use their PRODUCTION abilities.' },
  { id: 'minister_of_peace', name: 'Minister of Peace', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. After a player activates a system that contains 1 or more of a different player\'s units, the owner of this card may discard this card - immediately end the active player\'s turn.' },
  { id: 'minister_of_policy', name: 'Minister of Policy', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. At the end of the status phase, the owner of this card draws 1 action card.' },
  { id: 'minister_of_sciences', name: 'Minister of Sciences', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. When the owner of this card resolves the primary or secondary ability of the "Technology" strategy card, they do not need to spend resources to research technology.' },
  { id: 'minister_of_war', name: 'Minister of War', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. The owner of this card may discard this card after performing an action to remove 1 of their command counters from the game board and return it to their reinforcements - then they may perform 1 additional action.' },
  { id: 'miscount_disclosed', name: 'Miscount Disclosed', kind: 'directive', target: 'Elect Law', text: '(When this agenda is revealed, if there are no laws in play, discard this card and reveal another agenda from the top of the deck.) Vote on the elected law as if it were just revealed from the top of the deck.' },
  { id: 'mutiny', name: 'Mutiny', kind: 'directive', target: 'For/Against', text: 'For: Each player that voted "For" gains 1 victory point. Against: Each player that voted "For" loses 1 victory point.' },
  { id: 'new_constitution', name: 'New Constitution', kind: 'directive', target: 'For/Against', text: '(When this agenda is revealed, if there are no laws in play, discard this card and reveal another agenda from the top of the deck.) For: Discard all laws from play. At the start of the next strategy phase, each player exhausts each planet in their home system. Against: No effect.' },
  { id: 'prophecy_of_ixth', name: 'Prophecy of Ixth', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. The owner of this card applies +1 to the result of their fighter\'s combat rolls. When the owner of this card uses PRODUCTION, they discard this card unless they produce 2 or more fighters.' },
  { id: 'public_execution', name: 'Public Execution', kind: 'directive', target: 'Elect Player', text: 'The elected player discards all of their action cards. If they have the speaker token, they give it to the player on their left. The elected player cannot vote on any agendas during this agenda phase.' },
  { id: 'publicize_weapon_schematics', name: 'Publicize Weapon Schematics', kind: 'law', target: 'For/Against', text: 'For: If any player owns a war sun technology, all players may ignore all prerequisites on war sun technologies. All war suns lose SUSTAIN DAMAGE. Against: Each player that owns a war sun technology discards all of their action cards.' },
  { id: 'regulated_conscription', name: 'Regulated Conscription', kind: 'law', target: 'For/Against', text: 'For: When a player produces units, they produce only 1 fighter and infantry for its cost instead of 2. Against: No effect.' },
  { id: 'representative_government_base_game', name: 'Representative Government (Base Game)', kind: 'law', target: 'For/Against', text: 'For: Players cannot exhaust planets to cast votes during the agenda phase. Each player may cast 1 vote on each agenda instead. Against: At the start of the next strategy phase, each player that voted "Against" exhausts all of their cultural planets.' },
  { id: 'research_team_biotic', name: 'Research Team: Biotic', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. When the owner of this planet researches technology, they may exhaust this card to ignore 1 green prerequisite.' },
  { id: 'research_team_cybernetic', name: 'Research Team: Cybernetic', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. When the owner of this planet researches technology, they may exhaust this card to ignore 1 yellow prerequisite.' },
  { id: 'research_team_propulsion', name: 'Research Team: Propulsion', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. When the owner of this planet researches technology, they may exhaust this card to ignore 1 blue prerequisite.' },
  { id: 'research_team_warfare', name: 'Research Team: Warfare', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. When the owner of this planet researches technology, they may exhaust this card to ignore 1 red prerequisite.' },
  { id: 'seed_of_an_empire', name: 'Seed of an Empire', kind: 'directive', target: 'For/Against', text: 'For: The player with the most victory points gains 1 victory point. Against: The player with the fewest victory points gains 1 victory point.' },
  { id: 'senate_sanctuary', name: 'Senate Sanctuary', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. The influence value of this planet is increased by 2.' },
  { id: 'shard_of_the_throne', name: 'Shard of the Throne', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card and 1 victory point. A player gains this card and 1 victory point when they win a combat against the owner of this card. Then, the previous owner of this card loses 1 victory point.' },
  { id: 'shared_research', name: 'Shared Research', kind: 'law', target: 'For/Against', text: 'For: Each player\'s units can move through nebulae. Against: Each player places a command token from their reinforcements in their home system, if able.' },
  { id: 'swords_to_plowshares', name: 'Swords to Plowshares', kind: 'directive', target: 'For/Against', text: 'For: Each player destroys half of their infantry on each planet they control, rounded up. Then, each player gains trade goods equal to the number of their infantry that were destroyed. Against: Each player places 1 infantry from their reinforcements on each planet they control.' },
  { id: 'terraforming_initiative', name: 'Terraforming Initiative', kind: 'law', target: 'Elect Planet', text: 'Attach this card to the elected planet\'s card. The resource and influence values of this planet are increased by 1.' },
  { id: 'the_crown_of_emphidia', name: 'The Crown of Emphidia', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card and 1 victory point. A player gains this card and 1 victory point after they gain control of a planet in the home system of this card\'s owner. Then, the previous owner of this card loses 1 victory point.' },
  { id: 'the_crown_of_thalnos', name: 'The Crown of Thalnos', kind: 'law', target: 'Elect Player', text: 'The elected player gains this card. During each combat round, the owner of this card may reroll any number of dice; they must destroy each of their units that did not produce a hit with its reroll.' },
  { id: 'unconventional_measures', name: 'Unconventional Measures', kind: 'directive', target: 'For/Against', text: 'For: Each player that voted "For" draws 2 action cards. Against: Each player that voted "For" discards all of their action cards.' },
  { id: 'wormhole_reconstruction', name: 'Wormhole Reconstruction', kind: 'law', target: 'For/Against', text: 'For: All systems that contain either an alpha or beta wormhole are adjacent to each other. [Note that this will essentially overrule any effect of the Enforced Travel Ban agenda] Against: Each player places a command token from their reinforcements in each system that contains a wormhole and 1 or more of their ships.' },
  { id: 'wormhole_research', name: 'Wormhole Research', kind: 'directive', target: 'For/Against', text: 'For: Each player who has 1 or more ships in a system that contains a wormhole may research 1 technology. Then, destroy all ships in systems that contain an alpha or beta wormhole. Against: Each player that voted "Against" removes 1 command token from their command sheet and returns it to their reinforcements.' },
]

const BY_ID = new Map(AGENDAS.map(a => [a.id, a]))

export function findAgenda(id: string): AgendaDef | undefined {
  return BY_ID.get(id)
}

export function agendaDef(id: string): AgendaDef {
  const agenda = findAgenda(id)
  if (!agenda) throw new Error(`unknown agenda ${id}`)
  return agenda
}
