/**
 * The 101 base-game action cards, imported from the AsyncTI4 catalogue filtered on `source: "base"`
 * (PoK, Codex and Discordant Stars cards are excluded). Duplicated printings keep one entry each, numbered
 * `_1`, `_2`, ..., because the deck really holds that many copies.
 *
 * This module is the printed catalogue. Which of these cards the engine can actually play, and therefore
 * which of them are shuffled into a game's deck, is decided by `PLAYABLE_ACTION_CARDS` in
 * `src/engine/actionCards.ts`: a card is never dealt as a card that does nothing.
 */
export type ActionCardPhase = 'action' | 'agenda' | 'strategy' | 'status' | 'any'

export interface ActionCardDef {
  id: string
  name: string
  /** The phase the card names, from the printed card. */
  phase: ActionCardPhase
  /** The printed timing window, e.g. "After you activate a system". "Action" means it is your whole action. */
  window: string
  text: string
}

export const ACTION_CARDS: readonly ActionCardDef[] = [
  { id: 'ancient_burial_sites', name: 'Ancient Burial Sites', phase: 'agenda', window: 'At the start of the agenda phase', text: 'Choose 1 player. Exhaust each cultural planet owned by that player.' },
  { id: 'assassinate_representative_1', name: 'Assassinate Representative', phase: 'agenda', window: 'After an agenda is revealed', text: 'Choose 1 player. That player cannot vote on this agenda.' },
  { id: 'assassinate_representative_2', name: 'Assassinate Representative', phase: 'agenda', window: 'After an agenda is revealed', text: 'Choose 1 player. That player cannot vote on this agenda.' },
  { id: 'assassinate_representative_3', name: 'Assassinate Representative', phase: 'agenda', window: 'After an agenda is revealed', text: 'Choose 1 player. That player cannot vote on this agenda.' },
  { id: 'assassinate_representative_4', name: 'Assassinate Representative', phase: 'agenda', window: 'After an agenda is revealed', text: 'Choose 1 player. That player cannot vote on this agenda.' },
  { id: 'bribery_1', name: 'Bribery', phase: 'agenda', window: 'After the speaker votes on an agenda', text: 'Spend any number of trade goods. For each trade good spent, cast 1 additional vote for the outcome on which you voted.' },
  { id: 'bribery_2', name: 'Bribery', phase: 'agenda', window: 'After the speaker votes on an agenda', text: 'Spend any number of trade goods. For each trade good spent, cast 1 additional vote for the outcome on which you voted.' },
  { id: 'bribery_3', name: 'Bribery', phase: 'agenda', window: 'After the speaker votes on an agenda', text: 'Spend any number of trade goods. For each trade good spent, cast 1 additional vote for the outcome on which you voted.' },
  { id: 'bribery_4', name: 'Bribery', phase: 'agenda', window: 'After the speaker votes on an agenda', text: 'Spend any number of trade goods. For each trade good spent, cast 1 additional vote for the outcome on which you voted.' },
  { id: 'bunker', name: 'Bunker', phase: 'action', window: 'At the start of an invasion', text: 'During this invasion, apply -4 to the result of each BOMBARDMENT roll against planets you control.' },
  { id: 'confusing_legal_text', name: 'Confusing Legal Text', phase: 'agenda', window: 'When you are elected as the outcome of an agenda', text: 'Choose 1 player. That player is the elected player instead.' },
  { id: 'construction_rider', name: 'Construction Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, place 1 space dock from your reinforcements on a planet you control.' },
  { id: 'courageous_to_the_end', name: 'Courageous to the End', phase: 'action', window: 'After 1 of your ships is destroyed during a space combat', text: 'Roll 2 dice. For each result equal to or greater than that ship\'s combat value, your opponent must choose and destroy 1 of their ships.' },
  { id: 'cripple_defenses', name: 'Cripple Defenses', phase: 'action', window: 'Action', text: 'Choose 1 planet. Destroy each PDS on that planet.' },
  { id: 'diplomacy_rider', name: 'Diplomacy Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, choose 1 system that contains a planet you control. Each other player places a command token from their reinforcements in that system.' },
  { id: 'direct_hit_1', name: 'Direct Hit', phase: 'action', window: 'After another player\'s ship uses SUSTAIN DAMAGE to cancel a hit produced by your units or abilities', text: 'Destroy that ship.' },
  { id: 'direct_hit_2', name: 'Direct Hit', phase: 'action', window: 'After another player\'s ship uses SUSTAIN DAMAGE to cancel a hit produced by your units or abilities', text: 'Destroy that ship.' },
  { id: 'direct_hit_3', name: 'Direct Hit', phase: 'action', window: 'After another player\'s ship uses SUSTAIN DAMAGE to cancel a hit produced by your units or abilities', text: 'Destroy that ship.' },
  { id: 'direct_hit_4', name: 'Direct Hit', phase: 'action', window: 'After another player\'s ship uses SUSTAIN DAMAGE to cancel a hit produced by your units or abilities', text: 'Destroy that ship.' },
  { id: 'disable_1', name: 'Disable', phase: 'action', window: 'At the start of an invasion in a system that contains 1 or more of your opponents\' PDS units', text: 'Your opponents\' PDS units lose PLANETARY SHIELD and SPACE CANNON during this invasion.' },
  { id: 'disable_2', name: 'Disable', phase: 'action', window: 'At the start of an invasion in a system that contains 1 or more of your opponents\' PDS units', text: 'Your opponents\' PDS units lose PLANETARY SHIELD and SPACE CANNON during this invasion.' },
  { id: 'distinguished_councilor_1', name: 'Distinguished Councilor', phase: 'agenda', window: 'After you cast votes on an outcome of an agenda', text: 'Cast 5 additional votes for that outcome.' },
  { id: 'distinguished_councilor_2', name: 'Distinguished Councilor', phase: 'agenda', window: 'After you cast votes on an outcome of an agenda', text: 'Cast 5 additional votes for that outcome.' },
  { id: 'economic_initiative', name: 'Economic Initiative', phase: 'action', window: 'Action', text: 'Ready each cultural planet you control.' },
  { id: 'emergency_repairs', name: 'Emergency Repairs', phase: 'action', window: 'At the start or end of a combat round', text: 'Repair all of your units that have SUSTAIN DAMAGE in the active system.' },
  { id: 'experimental_battlestation_1', name: 'Experimental Battlestation', phase: 'action', window: 'After another player moves ships into a system during a tactical action', text: 'Choose 1 of your space docks that is either in or adjacent to that system. That space dock uses SPACE CANNON 5(x3) against ships in the active system.' },
  { id: 'experimental_battlestation_2', name: 'Experimental Battlestation', phase: 'action', window: 'After another player moves ships into a system during a tactical action', text: 'Choose 1 of your space docks that is either in or adjacent to that system. That space dock uses SPACE CANNON 5(x3) against ships in the active system.' },
  { id: 'fighter_prototype', name: 'Fighter Prototype', phase: 'action', window: 'At the start of the first round of a space combat', text: 'Apply +2 to the result of each of your fighters\' combat rolls during this combat round.' },
  { id: 'fire_team', name: 'Fire Team', phase: 'action', window: 'After your ground forces make combat rolls during a round of ground combat', text: 'Reroll any number of your dice.' },
  { id: 'flank_speed_1', name: 'Flank Speed', phase: 'action', window: 'After you activate a system', text: 'Apply +1 to the move value of each of your ships during this tactical action.' },
  { id: 'flank_speed_2', name: 'Flank Speed', phase: 'action', window: 'After you activate a system', text: 'Apply +1 to the move value of each of your ships during this tactical action.' },
  { id: 'flank_speed_3', name: 'Flank Speed', phase: 'action', window: 'After you activate a system', text: 'Apply +1 to the move value of each of your ships during this tactical action.' },
  { id: 'flank_speed_4', name: 'Flank Speed', phase: 'action', window: 'After you activate a system', text: 'Apply +1 to the move value of each of your ships during this tactical action.' },
  { id: 'focused_research_1', name: 'Focused Research', phase: 'action', window: 'Action', text: 'Spend 4 trade goods to research 1 technology' },
  { id: 'focused_research_2', name: 'Focused Research', phase: 'action', window: 'Action', text: 'Spend 4 trade goods to research 1 technology' },
  { id: 'focused_research_3', name: 'Focused Research', phase: 'action', window: 'Action', text: 'Spend 4 trade goods to research 1 technology' },
  { id: 'focused_research_4', name: 'Focused Research', phase: 'action', window: 'Action', text: 'Spend 4 trade goods to research 1 technology' },
  { id: 'frontline_deployment_1', name: 'Frontline Deployment', phase: 'action', window: 'Action', text: 'Place 3 infantry from your reinforcements on 1 planet you control.' },
  { id: 'frontline_deployment_2', name: 'Frontline Deployment', phase: 'action', window: 'Action', text: 'Place 3 infantry from your reinforcements on 1 planet you control.' },
  { id: 'ghost_ship_1', name: 'Ghost Ship', phase: 'action', window: 'Action', text: 'Place 1 destroyer from your reinforcements in a non-home system that contains a wormhole and does not contain other players\' ships.' },
  { id: 'ghost_ship_2', name: 'Ghost Ship', phase: 'action', window: 'Action', text: 'Place 1 destroyer from your reinforcements in a non-home system that contains a wormhole and does not contain other players\' ships.' },
  { id: 'imperial_rider', name: 'Imperial Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, gain 1 victory point.' },
  { id: 'in_the_silence_of_space_1', name: 'In The Silence Of Space', phase: 'action', window: 'After you activate a system', text: 'Choose 1 system. During this tactical action, your ships in the chosen system can move through systems that contain other players\' ships.' },
  { id: 'in_the_silence_of_space_2', name: 'In The Silence Of Space', phase: 'action', window: 'After you activate a system', text: 'Choose 1 system. During this tactical action, your ships in the chosen system can move through systems that contain other players\' ships.' },
  { id: 'industrial_initiative', name: 'Industrial Initiative', phase: 'action', window: 'Action', text: 'Gain 1 trade good for each industrial planet you control.' },
  { id: 'infiltrate_1', name: 'Infiltrate', phase: 'action', window: 'When you gain control of a planet', text: 'Replace each PDS and space dock that is on that planet with a matching unit from your reinforcements.' },
  { id: 'infiltrate_2', name: 'Infiltrate', phase: 'action', window: 'When you gain control of a planet', text: 'Replace each PDS and space dock that is on that planet with a matching unit from your reinforcements.' },
  { id: 'insubordination', name: 'Insubordination', phase: 'action', window: 'Action', text: 'Remove 1 token from another player\'s tactic pool and return it to their reinforcements.' },
  { id: 'intercept', name: 'Intercept', phase: 'action', window: 'After your opponent declares a retreat during a space combat', text: 'Your opponent cannot retreat during this round of space combat.' },
  { id: 'leadership_rider', name: 'Leadership Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, gain 3 command tokens.' },
  { id: 'lost_star_chart', name: 'Lost Star Chart', phase: 'action', window: 'After you activate a system', text: 'During this tactical action, systems that contain alpha and beta wormholes are adjacent to each other.' },
  { id: 'lucky_shot', name: 'Lucky Shot', phase: 'action', window: 'Action', text: 'Destroy 1 dreadnought, cruiser, or destroyer in a system that contains a planet you control.' },
  { id: 'maneuvering_jets_1', name: 'Maneuvering Jets', phase: 'action', window: 'Before you assign hits produced by another player\'s SPACE CANNON roll', text: 'Cancel 1 hit.' },
  { id: 'maneuvering_jets_2', name: 'Maneuvering Jets', phase: 'action', window: 'Before you assign hits produced by another player\'s SPACE CANNON roll', text: 'Cancel 1 hit.' },
  { id: 'maneuvering_jets_3', name: 'Maneuvering Jets', phase: 'action', window: 'Before you assign hits produced by another player\'s SPACE CANNON roll', text: 'Cancel 1 hit.' },
  { id: 'maneuvering_jets_4', name: 'Maneuvering Jets', phase: 'action', window: 'Before you assign hits produced by another player\'s SPACE CANNON roll', text: 'Cancel 1 hit.' },
  { id: 'mining_initiative', name: 'Mining Initiative', phase: 'action', window: 'Action', text: 'Gain trade goods equal to the resource value of 1 planet you control.' },
  { id: 'morale_boost_1', name: 'Morale Boost', phase: 'action', window: 'At the start of a combat round', text: 'Apply +1 to the result of each of your unit\'s combat rolls during this combat round.' },
  { id: 'morale_boost_2', name: 'Morale Boost', phase: 'action', window: 'At the start of a combat round', text: 'Apply +1 to the result of each of your unit\'s combat rolls during this combat round.' },
  { id: 'morale_boost_3', name: 'Morale Boost', phase: 'action', window: 'At the start of a combat round', text: 'Apply +1 to the result of each of your unit\'s combat rolls during this combat round.' },
  { id: 'morale_boost_4', name: 'Morale Boost', phase: 'action', window: 'At the start of a combat round', text: 'Apply +1 to the result of each of your unit\'s combat rolls during this combat round.' },
  { id: 'parley', name: 'Parley', phase: 'action', window: 'After another player commits units to land on a planet you control', text: 'Return the committed units to the space area.' },
  { id: 'plague', name: 'Plague', phase: 'action', window: 'Action', text: 'Choose 1 planet that is controlled by another player. Roll 1 die for each infantry on that planet. For each result of 6 or greater, destroy 1 of those units.' },
  { id: 'political_stability', name: 'Political Stability', phase: 'status', window: 'When you would return your strategy card(s) during the status phase', text: 'Do not return your strategy card(s). You do not choose strategy cards during the next strategy phase.' },
  { id: 'politics_rider', name: 'Politics Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, draw 3 action cards and gain the speaker token.' },
  { id: 'public_disgrace_1', name: 'Public Disgrace', phase: 'strategy', window: 'When another player chooses a strategy card during the strategy phase', text: 'That player must choose a different strategy card instead, if able.' },
  { id: 'public_disgrace_2', name: 'Public Disgrace', phase: 'strategy', window: 'When another player chooses a strategy card during the strategy phase', text: 'That player must choose a different strategy card instead, if able.' },
  { id: 'reactor_meltdown', name: 'Reactor Meltdown', phase: 'action', window: 'Action', text: 'Destroy 1 space dock in a non-home system.' },
  { id: 'reparations', name: 'Reparations', phase: 'action', window: 'After another player gains control of a planet you control', text: 'Exhaust 1 planet that player controls and ready 1 planet you control.' },
  { id: 'repeal_law', name: 'Repeal Law', phase: 'action', window: 'Action', text: 'Discard 1 law from play.' },
  { id: 'rise_of_a_messiah', name: 'Rise of a Messiah', phase: 'action', window: 'Action', text: 'Place 1 infantry from your reinforcements on each planet you control.' },
  { id: 'sabotage_1', name: 'Sabotage', phase: 'any', window: 'When another player plays an action card other than \'Sabotage\'', text: 'Cancel that action card.' },
  { id: 'sabotage_2', name: 'Sabotage', phase: 'any', window: 'When another player plays an action card other than \'Sabotage\'', text: 'Cancel that action card.' },
  { id: 'sabotage_3', name: 'Sabotage', phase: 'any', window: 'When another player plays an action card other than \'Sabotage\'', text: 'Cancel that action card.' },
  { id: 'sabotage_4', name: 'Sabotage', phase: 'any', window: 'When another player plays an action card other than \'Sabotage\'', text: 'Cancel that action card.' },
  { id: 'salvage', name: 'Salvage', phase: 'action', window: 'After you win a space combat', text: 'Your opponent gives you all of their commodities.' },
  { id: 'shields_holding_1', name: 'Shields Holding', phase: 'action', window: 'Before you assign hits to your ships during a space combat', text: 'Cancel up to 2 hits.' },
  { id: 'shields_holding_2', name: 'Shields Holding', phase: 'action', window: 'Before you assign hits to your ships during a space combat', text: 'Cancel up to 2 hits.' },
  { id: 'shields_holding_3', name: 'Shields Holding', phase: 'action', window: 'Before you assign hits to your ships during a space combat', text: 'Cancel up to 2 hits.' },
  { id: 'shields_holding_4', name: 'Shields Holding', phase: 'action', window: 'Before you assign hits to your ships during a space combat', text: 'Cancel up to 2 hits.' },
  { id: 'signal_jamming', name: 'Signal Jamming', phase: 'action', window: 'Action', text: 'Choose 1 non-home system that contains or is adjacent to 1 of your ships. Place a command token from another player\'s reinforcements in that system.' },
  { id: 'skilled_retreat_1', name: 'Skilled Retreat', phase: 'action', window: 'At the start of a [space] combat round', text: 'Move all of your ships from the active system into an adjacent system that does not contain another player\'s ships. The space combat ends in a draw. Then, place a command token from your reinforcements in that system.' },
  { id: 'skilled_retreat_2', name: 'Skilled Retreat', phase: 'action', window: 'At the start of a [space] combat round', text: 'Move all of your ships from the active system into an adjacent system that does not contain another player\'s ships. The space combat ends in a draw. Then, place a command token from your reinforcements in that system.' },
  { id: 'skilled_retreat_3', name: 'Skilled Retreat', phase: 'action', window: 'At the start of a [space] combat round', text: 'Move all of your ships from the active system into an adjacent system that does not contain another player\'s ships. The space combat ends in a draw. Then, place a command token from your reinforcements in that system.' },
  { id: 'skilled_retreat_4', name: 'Skilled Retreat', phase: 'action', window: 'At the start of a [space] combat round', text: 'Move all of your ships from the active system into an adjacent system that does not contain another player\'s ships. The space combat ends in a draw. Then, place a command token from your reinforcements in that system.' },
  { id: 'spy', name: 'Spy', phase: 'action', window: 'Action', text: 'Choose 1 player. That player gives you 1 random action card from their hand.' },
  { id: 'summit', name: 'Summit', phase: 'strategy', window: 'At the start of the strategy phase', text: 'Gain 2 command tokens.' },
  { id: 'tactical_bombardment', name: 'Tactical Bombardment', phase: 'action', window: 'Action', text: 'Choose 1 system that contains 1 or more of your units that have BOMBARDMENT. Exhaust each planet controlled by other players in that system.' },
  { id: 'technology_rider', name: 'Technology Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, research 1 technology.' },
  { id: 'trade_rider', name: 'Trade Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, gain 5 trade goods.' },
  { id: 'unexpected_action_1', name: 'Unexpected Action', phase: 'action', window: 'Action', text: 'Remove 1 of your command tokens from the game board and return it to your reinforcements.' },
  { id: 'unexpected_action_2', name: 'Unexpected Action', phase: 'action', window: 'Action', text: 'Remove 1 of your command tokens from the game board and return it to your reinforcements.' },
  { id: 'unstable_planet', name: 'Unstable Planet', phase: 'action', window: 'Action', text: 'Choose 1 hazardous planet. Exhaust that planet and destroy up to 3 infantry on it.' },
  { id: 'upgrade', name: 'Upgrade', phase: 'action', window: 'After you activate a system that contains 1 or more of your ships', text: 'Replace 1 of your cruisers in that system with 1 dreadnought from your reinforcements.' },
  { id: 'uprising', name: 'Uprising', phase: 'action', window: 'Action', text: 'Exhaust 1 non-home planet controlled by another player. Then gain trade goods equal to its resource value.' },
  { id: 'veto_1', name: 'Veto', phase: 'agenda', window: 'When an agenda is revealed', text: 'Discard that agenda and reveal 1 agenda from the top of the deck. Players vote on this agenda instead.' },
  { id: 'veto_2', name: 'Veto', phase: 'agenda', window: 'When an agenda is revealed', text: 'Discard that agenda and reveal 1 agenda from the top of the deck. Players vote on this agenda instead.' },
  { id: 'veto_3', name: 'Veto', phase: 'agenda', window: 'When an agenda is revealed', text: 'Discard that agenda and reveal 1 agenda from the top of the deck. Players vote on this agenda instead.' },
  { id: 'veto_4', name: 'Veto', phase: 'agenda', window: 'When an agenda is revealed', text: 'Discard that agenda and reveal 1 agenda from the top of the deck. Players vote on this agenda instead.' },
  { id: 'war_effort', name: 'War Effort', phase: 'action', window: 'Action', text: 'Place 1 cruiser from your reinforcements in a system that contains 1 or more of your ships.' },
  { id: 'warfare_rider', name: 'Warfare Rider', phase: 'agenda', window: 'After an agenda is revealed', text: 'You cannot vote on this agenda. Predict aloud an outcome of this agenda. If your prediction is correct, place 1 dreadnought from your reinforcements in a system that contains 1 or more of your ships.' },
]

const BY_ID = new Map(ACTION_CARDS.map(c => [c.id, c]))

export function findActionCard(id: string): ActionCardDef | undefined {
  return BY_ID.get(id)
}

export function actionCardDef(id: string): ActionCardDef {
  const card = findActionCard(id)
  if (!card) throw new Error(`unknown action card ${id}`)
  return card
}
