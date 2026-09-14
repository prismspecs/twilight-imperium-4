import type { FactionId, TechColor, UnitType } from '../engine/types'

export interface TechDef {
  id: string; name: string
  colour: TechColor | null
  prereq: Partial<Record<TechColor, number>>
  kind: 'general' | 'upgrade' | 'faction'
  faction?: FactionId
  unit?: UnitType
  description: string
}

const g = (id: string, name: string, colour: TechColor, tier: number, description: string): TechDef => ({
  id, name, colour, prereq: tier ? { [colour]: tier } : {}, kind: 'general', description,
})

export const TECHS: TechDef[] = [
  g('antimass_deflectors', 'Antimass Deflectors', 'blue', 0, 'Your ships can move into and through asteroid fields. When other players use Space Cannon against your units, apply -1 to their roll results.'),
  g('gravity_drive', 'Gravity Drive', 'blue', 1, 'After you activate a system, apply +1 to the move value of 1 of your ships during this tactical action.'),
  g('fleet_logistics', 'Fleet Logistics', 'blue', 2, 'During each of your turns of the action phase, you may perform 2 actions instead of 1.'),
  g('light_wave_deflector', 'Light/Wave Deflector', 'blue', 3, 'Your ships can move through systems that contain other players\' ships.'),
  g('plasma_scoring', 'Plasma Scoring', 'red', 0, 'When 1 or more of your units use Bombardment or Space Cannon, 1 of those units may roll 1 additional die.'),
  g('magen_defense_grid', 'Magen Defense Grid', 'red', 1, 'You may exhaust this card at the start of ground combat on a planet with your structures to produce 1 hit against opponent ground forces.'),
  g('duranium_armor', 'Duranium Armor', 'red', 2, 'During each combat round, after assigning hits, repair 1 damaged unit that did not use Sustain Damage this round.'),
  g('assault_cannon', 'Assault Cannon', 'red', 3, 'At the start of space combat in a system with 3+ of your non-fighter ships, your opponent must destroy 1 of their non-fighter ships.'),
  g('neural_motivator', 'Neural Motivator', 'green', 0, 'During the status phase, draw 2 action cards instead of 1.'),
  g('dacxive_animators', 'Dacxive Animators', 'green', 1, 'After you win a ground combat, you may place 1 infantry from your reinforcements on that planet.'),
  g('hyper_metabolism', 'Hyper Metabolism', 'green', 2, 'During the status phase, gain 3 command tokens instead of 2.'),
  g('x89_bacterial_weapon', 'X-89 Bacterial Weapon', 'green', 3, 'After 1 or more of your units use Bombardment against a planet, destroy all infantry on that planet.'),
  g('sarween_tools', 'Sarween Tools', 'yellow', 0, 'When 1 or more of your units use Production, reduce the combined cost of the produced units by 1.'),
  g('graviton_laser_system', 'Graviton Laser System', 'yellow', 1, 'Exhaust before using Space Cannon; hits produced must be assigned to non-fighter ships if able.'),
  g('transit_diodes', 'Transit Diodes', 'yellow', 2, 'Exhaust at the start of your turn to remove up to 4 ground forces from the board and place them on planets you control.'),
  g('integrated_economy', 'Integrated Economy', 'yellow', 3, 'After gaining control of a planet, produce units there up to that planet\'s resource value.'),
  { id: 'infantry_ii', name: 'Infantry II', colour: null, prereq: { green: 2 }, kind: 'upgrade', unit: 'infantry', description: 'Combat 7. On destruction, roll a d10: on 6+, place this unit on a planet you control in your home system.' },
  { id: 'fighter_ii', name: 'Fighter II', colour: null, prereq: { green: 1, blue: 1 }, kind: 'upgrade', unit: 'fighter', description: 'Combat 8, Move 2. Moves independently. Excess fighters beyond capacity count against your fleet pool.' },
  { id: 'destroyer_ii', name: 'Destroyer II', colour: null, prereq: { red: 2 }, kind: 'upgrade', unit: 'destroyer', description: 'Combat 8, Move 2. Anti-Fighter Barrage 6 (x3).' },
  { id: 'cruiser_ii', name: 'Cruiser II', colour: null, prereq: { green: 1, yellow: 1, red: 1 }, kind: 'upgrade', unit: 'cruiser', description: 'Combat 6, Move 3, Capacity 1.' },
  { id: 'carrier_ii', name: 'Carrier II', colour: null, prereq: { blue: 2 }, kind: 'upgrade', unit: 'carrier', description: 'Combat 9, Move 2, Capacity 6.' },
  { id: 'dreadnought_ii', name: 'Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'upgrade', unit: 'dreadnought', description: 'Combat 5, Move 2, Capacity 1. Sustain Damage, Bombardment 5. Immune to Direct Hit.' },
  { id: 'space_dock_ii', name: 'Space Dock II', colour: null, prereq: { yellow: 2 }, kind: 'upgrade', unit: 'spacedock', description: 'Production value +4. Up to 3 fighters in this system do not count against fleet pool or ship capacity.' },
  { id: 'pds_ii', name: 'PDS II', colour: null, prereq: { red: 1, yellow: 1 }, kind: 'upgrade', unit: 'pds', description: 'Space Cannon 5. Planetary Shield. Deep Space Cannon: can fire Space Cannon into adjacent systems.' },
  { id: 'war_sun', name: 'War Sun', colour: null, prereq: { red: 3, yellow: 1 }, kind: 'upgrade', unit: 'warsun', description: 'Cost 12, Combat 3 (x3), Move 2, Capacity 6. Sustain Damage, Bombardment 3 (x3). Bypasses Planetary Shield.' },
  // Faction unit upgrades
  { id: 'letani_warrior_ii', name: 'Letani Warrior II', colour: null, prereq: { green: 2 }, kind: 'upgrade', faction: 'arborec', unit: 'infantry', description: 'Combat 7, Production 2. On destruction, roll a d10: on 6+, place in your home system.' },
  { id: 'floating_factory_ii', name: 'Floating Factory II', colour: null, prereq: { yellow: 2 }, kind: 'upgrade', faction: 'saar', unit: 'floating_factory', description: 'Move 2, Capacity 5, Production 7. Lives in space area and moves like a ship.' },
  { id: 'prototype_war_sun_ii', name: 'Prototype War Sun II', colour: null, prereq: { red: 3, yellow: 1 }, kind: 'upgrade', faction: 'muaat', unit: 'warsun', description: 'Cost 10, Combat 3 (x3), Move 3, Capacity 6. Sustain Damage, Bombardment 3 (x3). Bypasses Planetary Shield.' },
  { id: 'spec_ops_ii', name: 'Spec Ops II', colour: null, prereq: { green: 2 }, kind: 'upgrade', faction: 'sol', unit: 'infantry', description: 'Combat 6. On destruction, roll a d10: on 5+, place this unit on a planet in your home system.' },
  { id: 'advanced_carrier_ii', name: 'Advanced Carrier II', colour: null, prereq: { blue: 2 }, kind: 'upgrade', faction: 'sol', unit: 'carrier', description: 'Combat 9, Move 2, Capacity 8. Sustain Damage.' },
  { id: 'super_dreadnought_ii', name: 'Super-Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'upgrade', faction: 'l1z1x', unit: 'dreadnought', description: 'Combat 4, Move 2, Capacity 2. Sustain Damage, Bombardment 4. Immune to Direct Hit.' },
  { id: 'hybrid_crystal_fighter_ii', name: 'Hybrid Crystal Fighter II', colour: null, prereq: { green: 1, blue: 1 }, kind: 'upgrade', faction: 'naalu', unit: 'fighter', description: 'Combat 7, Move 2. Moves independently; excess fighters count against fleet pool.' },
  { id: 'exotrireme_ii', name: 'Exotrireme II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'upgrade', faction: 'sardakk', unit: 'dreadnought', description: 'Combat 5, Move 2, Capacity 1. Sustain Damage, Bombardment 4 (x2). After space combat round, can sacrifice to destroy 2 enemy ships.' },
  // Faction ability technologies
  { id: 'bioplasmosis', name: 'Bioplasmosis', colour: 'green', prereq: { green: 2 }, kind: 'faction', faction: 'arborec', description: 'At the end of status phase, remove up to 1 infantry from each planet you control and place on any controlled planets.' },
  { id: 'l4_disruptors', name: 'L4 Disruptors', colour: 'yellow', prereq: { yellow: 1 }, kind: 'faction', faction: 'letnev', description: 'During an invasion, units other players control cannot use Space Cannon against your units.' },
  { id: 'non_euclidean_shielding', name: 'Non-Euclidean Shielding', colour: 'red', prereq: { red: 2 }, kind: 'faction', faction: 'letnev', description: 'When 1 of your units uses Sustain Damage, cancel 2 hits instead of 1.' },
  { id: 'chaos_mapping', name: 'Chaos Mapping', colour: 'blue', prereq: { blue: 1 }, kind: 'faction', faction: 'saar', description: 'Other players cannot activate asteroid fields with your units. At start of your turn, produce 1 unit at a space dock.' },
  { id: 'magmus_reactor', name: 'Magmus Reactor', colour: 'red', prereq: { red: 2 }, kind: 'faction', faction: 'muaat', description: 'Your ships can move into/through supernovas. After producing in a system with a war sun, gain 1 trade good.' },
  { id: 'production_biomes', name: 'Production Biomes', colour: 'green', prereq: { green: 2 }, kind: 'faction', faction: 'hacan', description: 'Action: Exhaust and spend 1 strategy token to gain 4 trade goods and give 1 other player 2 trade goods.' },
  { id: 'quantum_datahub_node', name: 'Quantum Datahub Node', colour: 'yellow', prereq: { yellow: 3 }, kind: 'faction', faction: 'hacan', description: 'At end of strategy phase, spend 1 strategy token and 3 trade goods to swap strategy cards with another player.' },
  { id: 'dimensional_splicer', name: 'Dimensional Splicer', colour: 'red', prereq: { red: 1 }, kind: 'faction', faction: 'creuss', description: 'At start of space combat in a system with a wormhole and your ships, produce 1 hit against an enemy ship.' },
  { id: 'wormhole_generator', name: 'Wormhole Generator', colour: 'blue', prereq: { blue: 2 }, kind: 'faction', faction: 'creuss', description: 'At start of status phase, place or move a Creuss wormhole token into a non-home system without enemy ships.' },
  { id: 'inheritance_systems', name: 'Inheritance Systems', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'l1z1x', description: 'When researching technology, exhaust and spend 2 resources to ignore all prerequisites on that technology.' },
  { id: 'salvage_operations', name: 'Salvage Operations', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'mentak', description: 'After space combat, gain 1 trade good. If you won, produce 1 ship of any type destroyed in that combat.' },
  { id: 'mirror_computing', name: 'Mirror Computing', colour: 'yellow', prereq: { yellow: 3 }, kind: 'faction', faction: 'mentak', description: 'When spending trade goods, each trade good is worth 2 resources or 2 influence instead of 1.' },
  { id: 'neuroglaive', name: 'Neuroglaive', colour: 'green', prereq: { green: 3 }, kind: 'faction', faction: 'naalu', description: 'After another player activates a system with your ships, they must remove 1 token from their fleet pool.' },
  { id: 'valefar_assimilator_x', name: 'Valefar Assimilator X', colour: null, prereq: {}, kind: 'faction', faction: 'nekro', description: 'Copy another player\'s non-upgrade faction technology. This card gains that technology\'s text.' },
  { id: 'valefar_assimilator_y', name: 'Valefar Assimilator Y', colour: null, prereq: {}, kind: 'faction', faction: 'nekro', description: 'Copy another player\'s faction unit upgrade. This card gains that unit upgrade\'s text and stats.' },
  { id: 'valkyrie_particle_weave', name: 'Valkyrie Particle Weave', colour: 'red', prereq: { red: 2 }, kind: 'faction', faction: 'sardakk', description: 'After rolls in ground combat round, if opponent produced hits, produce 1 hit against enemy ground force.' },
  { id: 'e_res_siphons', name: 'E-Res Siphons', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'jolnar', description: 'After another player activates a system that contains 1 or more of your ships, gain 4 trade goods.' },
  { id: 'spatial_conduit_cylinder', name: 'Spatial Conduit Cylinder', colour: 'blue', prereq: { blue: 2 }, kind: 'faction', faction: 'jolnar', description: 'Exhaust after activating a system with your ships: treat it as adjacent to all other systems with your ships.' },
  { id: 'lazax_gate_folding', name: 'Lazax Gate Folding', colour: 'blue', prereq: { blue: 2 }, kind: 'faction', faction: 'winnu', description: 'During tactical actions, if you control Mecatol Rex, treat it as adjacent to all systems with wormholes.' },
  { id: 'hegemonic_trade_policy', name: 'Hegemonic Trade Policy', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'winnu', description: 'Exhaust to swap the resource and influence values of 1 planet you control until the end of the round.' },
  { id: 'instinct_training', name: 'Instinct Training', colour: 'green', prereq: { green: 1 }, kind: 'faction', faction: 'xxcha', description: 'Exhaust and spend 1 strategy token when another player plays an action card to cancel that action card.' },
  { id: 'nullification_field', name: 'Nullification Field', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'xxcha', description: 'After another player activates a system with your ships, exhaust and spend 1 strategy token to end their turn.' },
  { id: 'impulse_core', name: 'Impulse Core', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'yin', description: 'At start of space combat, destroy 1 of your cruisers or destroyers to hit an enemy non-fighter ship.' },
  { id: 'yin_spinner', name: 'Yin Spinner', colour: 'green', prereq: { green: 2 }, kind: 'faction', faction: 'yin', description: 'After 1 or more of your units use Production, place 1 infantry on any planet you control in that system.' },
  { id: 'transparasteel_plating', name: 'Transparasteel Plating', colour: 'green', prereq: { green: 1 }, kind: 'faction', faction: 'yssaril', description: 'Players who play action cards targeting your units or systems must spend 1 strategy token.' },
  { id: 'mageon_implants', name: 'Mageon Implants', colour: 'green', prereq: { green: 3 }, kind: 'faction', faction: 'yssaril', description: 'Action: Exhaust to look at another player\'s action card hand and steal 1 card to add to your hand.' },
]

const BY_ID = new Map(TECHS.map(t => [t.id, t]))
export function findTech(id: string): TechDef | undefined {
  return BY_ID.get(id)
}
export function techDef(id: string): TechDef {
  const t = findTech(id)
  if (!t) throw new Error(`unknown tech ${id}`)
  return t
}
