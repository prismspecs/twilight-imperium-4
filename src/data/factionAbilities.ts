export interface FactionAbilityDef { id: string; name: string; text: string }

/**
 * Reference text for every base-game faction ability named in FACTIONS. Most of these are not yet wired
 * into the engine (see the note on FACTIONS) and are shown to players as rules reference only, the way a
 * hot-seat table would keep the faction sheet in view; wording is this project's own paraphrase, not the
 * printed card text.
 */
export const FACTION_ABILITIES: Record<string, FactionAbilityDef> = {
  assimilate: { id: 'assimilate', name: 'Assimilate', text: 'When you take control of a planet, replace any space dock and PDS on it with your own from reinforcements.' },
  harrow: { id: 'harrow', name: 'Harrow', text: 'Your ships with bombardment may fire again after each ground combat round on that planet.' },
  munitions_reserves: { id: 'munitions_reserves', name: 'Munitions Reserves', text: 'At the start of each combat round, you may pay 2 trade goods to reroll any of your dice for that round.' },
  armada: { id: 'armada', name: 'Armada', text: 'Your fleet pool limit is 2 higher than your fleet command tokens would normally allow.' },
  mitosis: { id: 'mitosis', name: 'Mitosis', text: 'Your space docks cannot produce infantry. Instead, at the start of each status phase, place 1 infantry from reinforcements on any planet you control.' },
  scavenge: { id: 'scavenge', name: 'Scavenge', text: 'After you gain control of a planet, gain 1 trade good.' },
  nomadic: { id: 'nomadic', name: 'Nomadic', text: 'You can score objectives that require control of your home system even if you do not control those planets.' },
  star_forge: { id: 'star_forge', name: 'Star Forge', text: 'Spend 1 strategy token to place 2 fighters or 1 destroyer from reinforcements in a system containing one of your war suns.' },
  gashlai_physiology: { id: 'gashlai_physiology', name: 'Gashlai Physiology', text: 'Your ships can move through supernovas.' },
  masters_of_trade: { id: 'masters_of_trade', name: 'Masters of Trade', text: 'Resolving the secondary ability of the Trade strategy card costs you no command token.' },
  guild_ships: { id: 'guild_ships', name: 'Guild Ships', text: 'You may negotiate transactions with players who are not your neighbour.' },
  arbiters: { id: 'arbiters', name: 'Arbiters', text: 'Action cards may be included as part of a transaction.' },
  orbital_drop: { id: 'orbital_drop', name: 'Orbital Drop', text: 'Spend 1 strategy token to place 2 infantry from reinforcements on a planet you control.' },
  versatile: { id: 'versatile', name: 'Versatile', text: 'When you gain command tokens during the status phase, gain 1 additional token.' },
  quantum_entanglement: { id: 'quantum_entanglement', name: 'Quantum Entanglement', text: 'All systems containing an alpha or beta wormhole are adjacent to each other for you, always.' },
  slipstream: { id: 'slipstream', name: 'Slipstream', text: 'Your ships get +1 move when they start their movement in your home system or a wormhole system.' },
  creuss_gate: { id: 'creuss_gate', name: 'Creuss Gate', text: 'Your home system is a wormhole gate placed where the board is assembled; your true home tile sits in your play area instead.' },
  ambush: { id: 'ambush', name: 'Ambush', text: 'At the start of a space combat, up to 2 of your cruisers or destroyers may each roll 2 dice for a bonus hit, assigned by your opponent, before the first combat round.' },
  pillage: { id: 'pillage', name: 'Pillage', text: 'After another player activates a system containing one of your units, if they have trade goods, you may take 1 from them.' },
  telepathic: { id: 'telepathic', name: 'Telepathic', text: 'At the end of the strategy phase, you are always first in initiative order.' },
  foresight: { id: 'foresight', name: 'Foresight', text: "After another player moves ships into a system containing one of your ships, you may retreat your ships to an adjacent, unoccupied system." },
  galactic_threat: { id: 'galactic_threat', name: 'Galactic Threat', text: 'You cannot vote on agendas, but once per agenda phase you may predict its outcome; a correct guess steals a technology from a player who voted that way.' },
  propagation: { id: 'propagation', name: 'Propagation', text: 'You cannot research technology through normal means; whenever you would, gain 3 command tokens instead.' },
  technological_singularity: { id: 'technological_singularity', name: 'Technological Singularity', text: 'Once per combat, after an opponent loses a unit, you may take a technology that they own.' },
  unrelenting: { id: 'unrelenting', name: 'Unrelenting', text: 'Every one of your combat rolls gets +1.' },
  fragile: { id: 'fragile', name: 'Fragile', text: 'Every one of your combat rolls gets -1.' },
  brilliant: { id: 'brilliant', name: 'Brilliant', text: "When you'd spend a command token on the Technology strategy card's secondary, you may resolve its primary instead." },
  analytical: { id: 'analytical', name: 'Analytical', text: 'When researching a non-unit-upgrade technology, you may ignore one of its prerequisites.' },
  blood_ties: { id: 'blood_ties', name: 'Blood Ties', text: "Removing the custodians token from Mecatol Rex costs you no influence." },
  reclamation: { id: 'reclamation', name: 'Reclamation', text: 'After a tactical action gains you control of Mecatol Rex, place a PDS and a space dock there from reinforcements.' },
  peace_accords: { id: 'peace_accords', name: 'Peace Accords', text: "After resolving the Diplomacy strategy card, you may take control of an empty planet adjacent to one you already control." },
  quash: { id: 'quash', name: 'Quash', text: 'When an agenda is revealed, you may spend a strategy token to discard it and reveal the next agenda instead.' },
  indoctrination: { id: 'indoctrination', name: 'Indoctrination', text: "At the start of a ground combat, pay 2 influence to swap one of your opponent's infantry there for one of yours from reinforcements." },
  devotion: { id: 'devotion', name: 'Devotion', text: 'After each space combat round, you may destroy one of your own cruisers or destroyers there to score an automatic hit on the enemy.' },
  stall_tactics: { id: 'stall_tactics', name: 'Stall Tactics', text: 'Action: discard an action card from your hand.' },
  scheming: { id: 'scheming', name: 'Scheming', text: 'Whenever you draw action cards, draw one extra, then discard one from your hand.' },
  crafty: { id: 'crafty', name: 'Crafty', text: 'You may hold any number of action cards; effects cannot force you below the normal limit.' },
}

export function factionAbility(id: string): FactionAbilityDef | undefined {
  return FACTION_ABILITIES[id]
}
