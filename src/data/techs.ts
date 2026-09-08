import type { FactionId, TechColor, UnitType } from '../engine/types'

export interface TechDef {
  id: string; name: string
  colour: TechColor | null
  prereq: Partial<Record<TechColor, number>>
  kind: 'general' | 'upgrade' | 'faction'
  faction?: FactionId
  unit?: UnitType
}

const g = (id: string, name: string, colour: TechColor, tier: number): TechDef => ({ id, name, colour, prereq: tier ? { [colour]: tier } : {}, kind: 'general' })

export const TECHS: TechDef[] = [
  g('antimass_deflectors', 'Antimass Deflectors', 'blue', 0), g('gravity_drive', 'Gravity Drive', 'blue', 1),
  g('fleet_logistics', 'Fleet Logistics', 'blue', 2), g('light_wave_deflector', 'Light/Wave Deflector', 'blue', 3),
  g('plasma_scoring', 'Plasma Scoring', 'red', 0), g('magen_defense_grid', 'Magen Defense Grid', 'red', 1),
  g('duranium_armor', 'Duranium Armor', 'red', 2), g('assault_cannon', 'Assault Cannon', 'red', 3),
  g('neural_motivator', 'Neural Motivator', 'green', 0), g('dacxive_animators', 'Dacxive Animators', 'green', 1),
  g('hyper_metabolism', 'Hyper Metabolism', 'green', 2), g('x89_bacterial_weapon', 'X-89 Bacterial Weapon', 'green', 3),
  g('sarween_tools', 'Sarween Tools', 'yellow', 0), g('graviton_laser_system', 'Graviton Laser System', 'yellow', 1),
  g('transit_diodes', 'Transit Diodes', 'yellow', 2), g('integrated_economy', 'Integrated Economy', 'yellow', 3),
  { id: 'infantry_ii', name: 'Infantry II', colour: null, prereq: { green: 2 }, kind: 'upgrade', unit: 'infantry' },
  { id: 'fighter_ii', name: 'Fighter II', colour: null, prereq: { green: 1, blue: 1 }, kind: 'upgrade', unit: 'fighter' },
  { id: 'destroyer_ii', name: 'Destroyer II', colour: null, prereq: { red: 2 }, kind: 'upgrade', unit: 'destroyer' },
  { id: 'cruiser_ii', name: 'Cruiser II', colour: null, prereq: { green: 1, yellow: 1, red: 1 }, kind: 'upgrade', unit: 'cruiser' },
  { id: 'carrier_ii', name: 'Carrier II', colour: null, prereq: { blue: 2 }, kind: 'upgrade', unit: 'carrier' },
  { id: 'dreadnought_ii', name: 'Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'upgrade', unit: 'dreadnought' },
  { id: 'space_dock_ii', name: 'Space Dock II', colour: null, prereq: { yellow: 2 }, kind: 'upgrade', unit: 'spacedock' },
  { id: 'inheritance_systems', name: 'Inheritance Systems', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'l1z1x' },
  { id: 'super_dreadnought_ii', name: 'Super-Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'faction', faction: 'l1z1x', unit: 'dreadnought' },
  { id: 'l4_disruptors', name: 'L4 Disruptors', colour: 'yellow', prereq: { yellow: 1 }, kind: 'faction', faction: 'letnev' },
  { id: 'non_euclidean_shielding', name: 'Non-Euclidean Shielding', colour: 'red', prereq: { red: 2 }, kind: 'faction', faction: 'letnev' },
  { id: 'valefar_assimilator_x', name: 'Valefar Assimilator X', colour: null, prereq: {}, kind: 'faction', faction: 'nekro' },
  { id: 'valefar_assimilator_y', name: 'Valefar Assimilator Y', colour: null, prereq: {}, kind: 'faction', faction: 'nekro' },
  // Faction unit upgrades: same tech-tree slot and prerequisite as the generic upgrade, so `kind` stays
  // 'upgrade' (not 'faction') — `excludesGenericUpgrade` is what stops the faction researching both.
  { id: 'spec_ops_ii', name: 'Spec Ops II', colour: null, prereq: { green: 2 }, kind: 'upgrade', faction: 'sol', unit: 'infantry' },
  { id: 'advanced_carrier_ii', name: 'Advanced Carrier II', colour: null, prereq: { blue: 2 }, kind: 'upgrade', faction: 'sol', unit: 'carrier' },
  { id: 'hybrid_crystal_fighter_ii', name: 'Hybrid Crystal Fighter II', colour: null, prereq: { green: 1, blue: 1 }, kind: 'upgrade', faction: 'naalu', unit: 'fighter' },
  { id: 'production_biomes', name: 'Production Biomes', colour: 'green', prereq: { green: 2 }, kind: 'faction', faction: 'hacan' },
  { id: 'bioplasmosis', name: 'Bioplasmosis', colour: 'green', prereq: { green: 2 }, kind: 'faction', faction: 'arborec' },
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
