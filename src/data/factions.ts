import type { FactionId, UnitType } from '../engine/types'

export interface FactionDef {
  id: FactionId; name: string; commodityValue: number
  startingTechs: string[]
  startingUnits: { type: UnitType; count: number; planetId?: string }[]
  abilities: string[]
}

/**
 * All 17 base-game factions. Only l1z1x and letnev are currently selectable and placed (the map has
 * their two home systems); the other fifteen are complete data — starting units/techs, commodities and
 * ability ids — pending the full map import and per-faction ability wiring. Their `planetId`s reference
 * the home planets that map will add, so they are never dereferenced until then.
 */
export const FACTIONS: Record<FactionId, FactionDef> = {
  l1z1x: {
    id: 'l1z1x', name: 'L1Z1X Mindnet', commodityValue: 2,
    startingTechs: ['neural_motivator', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 5, planetId: '000' }, { type: 'spacedock', count: 1, planetId: '000' }, { type: 'pds', count: 1, planetId: '000' },
    ],
    abilities: ['assimilate', 'harrow'],
  },
  letnev: {
    id: 'letnev', name: 'Barony of Letnev', commodityValue: 2,
    startingTechs: ['antimass_deflectors', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 1 },
      { type: 'infantry', count: 2, planetId: 'arc-prime' }, { type: 'infantry', count: 1, planetId: 'wren-terra' }, { type: 'spacedock', count: 1, planetId: 'arc-prime' },
    ],
    abilities: ['munitions_reserves', 'armada'],
  },
  arborec: {
    id: 'arborec', name: 'Arborec', commodityValue: 3,
    startingTechs: ['magen_defense_grid'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetId: 'nestphar' }, { type: 'spacedock', count: 1, planetId: 'nestphar' }, { type: 'pds', count: 1, planetId: 'nestphar' },
    ],
    abilities: ['mitosis'],
  },
  saar: {
    id: 'saar', name: 'Clan of Saar', commodityValue: 3,
    startingTechs: ['antimass_deflectors'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetId: 'lisis-ii' }, { type: 'infantry', count: 2, planetId: 'ragh' }, { type: 'spacedock', count: 1, planetId: 'ragh' },
    ],
    abilities: ['scavenge', 'nomadic'],
  },
  muaat: {
    id: 'muaat', name: 'Embers of Muaat', commodityValue: 4,
    startingTechs: ['plasma_scoring'],
    startingUnits: [
      { type: 'warsun', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetId: 'muaat' }, { type: 'spacedock', count: 1, planetId: 'muaat' },
    ],
    abilities: ['star_forge', 'gashlai_physiology'],
  },
  hacan: {
    id: 'hacan', name: 'Emirates of Hacan', commodityValue: 6,
    startingTechs: ['antimass_deflectors', 'sarween_tools'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetId: 'hercant' }, { type: 'infantry', count: 1, planetId: 'arretze' }, { type: 'infantry', count: 1, planetId: 'kamdorn' },
      { type: 'spacedock', count: 1, planetId: 'arretze' },
    ],
    abilities: ['masters_of_trade', 'guild_ships', 'arbiters'],
  },
  sol: {
    id: 'sol', name: 'Federation of Sol', commodityValue: 4,
    startingTechs: ['neural_motivator', 'antimass_deflectors'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 5, planetId: 'jord' }, { type: 'spacedock', count: 1, planetId: 'jord' },
    ],
    abilities: ['orbital_drop', 'versatile'],
  },
  creuss: {
    id: 'creuss', name: 'Ghosts of Creuss', commodityValue: 4,
    startingTechs: ['gravity_drive'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'destroyer', count: 2 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetId: 'creuss' }, { type: 'spacedock', count: 1, planetId: 'creuss' },
    ],
    abilities: ['quantum_entanglement', 'slipstream', 'creuss_gate'],
  },
  mentak: {
    id: 'mentak', name: 'Mentak Coalition', commodityValue: 2,
    startingTechs: ['sarween_tools', 'plasma_scoring'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 2 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 4, planetId: 'moll-primus' }, { type: 'spacedock', count: 1, planetId: 'moll-primus' }, { type: 'pds', count: 1, planetId: 'moll-primus' },
    ],
    abilities: ['ambush', 'pillage'],
  },
  naalu: {
    id: 'naalu', name: 'Naalu Collective', commodityValue: 3,
    startingTechs: ['sarween_tools', 'neural_motivator'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 3, planetId: 'druaa' }, { type: 'infantry', count: 1, planetId: 'maaluuk' }, { type: 'spacedock', count: 1, planetId: 'druaa' }, { type: 'pds', count: 1, planetId: 'druaa' },
    ],
    abilities: ['telepathic', 'foresight'],
  },
  nekro: {
    id: 'nekro', name: 'Nekro Virus', commodityValue: 3,
    startingTechs: ['dacxive_animators', 'valefar_assimilator_x', 'valefar_assimilator_y'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetId: 'mordai-ii' }, { type: 'spacedock', count: 1, planetId: 'mordai-ii' },
    ],
    abilities: ['galactic_threat', 'propagation', 'technological_singularity'],
  },
  sardakk: {
    id: 'sardakk', name: "Sardakk N'orr", commodityValue: 3,
    startingTechs: [],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 },
      { type: 'infantry', count: 3, planetId: 'quinarra' }, { type: 'infantry', count: 2, planetId: 'trenlak' },
      { type: 'spacedock', count: 1, planetId: 'quinarra' }, { type: 'pds', count: 1, planetId: 'quinarra' },
    ],
    abilities: ['unrelenting'],
  },
  jolnar: {
    id: 'jolnar', name: 'Universities of Jol-Nar', commodityValue: 4,
    startingTechs: ['neural_motivator', 'antimass_deflectors', 'sarween_tools', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 2 }, { type: 'fighter', count: 1 },
      { type: 'infantry', count: 1, planetId: 'jol' }, { type: 'infantry', count: 1, planetId: 'nar' },
      { type: 'spacedock', count: 1, planetId: 'nar' }, { type: 'pds', count: 2, planetId: 'nar' },
    ],
    abilities: ['fragile', 'brilliant', 'analytical'],
  },
  winnu: {
    id: 'winnu', name: 'Winnu', commodityValue: 3,
    // Winnu chooses any one prerequisite-free technology at setup; recorded as empty until that pick is wired.
    startingTechs: [],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetId: 'winnu' }, { type: 'spacedock', count: 1, planetId: 'winnu' }, { type: 'pds', count: 1, planetId: 'winnu' },
    ],
    abilities: ['blood_ties', 'reclamation'],
  },
  xxcha: {
    id: 'xxcha', name: 'Xxcha Kingdom', commodityValue: 4,
    startingTechs: ['graviton_laser_system'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 2 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 3, planetId: 'archon-ren' }, { type: 'infantry', count: 1, planetId: 'archon-tau' },
      { type: 'spacedock', count: 1, planetId: 'archon-ren' }, { type: 'pds', count: 1, planetId: 'archon-ren' },
    ],
    abilities: ['peace_accords', 'quash'],
  },
  yin: {
    id: 'yin', name: 'Yin Brotherhood', commodityValue: 2,
    startingTechs: ['sarween_tools'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 4 },
      { type: 'infantry', count: 4, planetId: 'darien' }, { type: 'spacedock', count: 1, planetId: 'darien' },
    ],
    abilities: ['indoctrination', 'devotion'],
  },
  yssaril: {
    id: 'yssaril', name: 'Yssaril Tribes', commodityValue: 3,
    startingTechs: ['neural_motivator'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 3, planetId: 'retillion' }, { type: 'infantry', count: 2, planetId: 'shalloq' },
      { type: 'spacedock', count: 1, planetId: 'retillion' }, { type: 'pds', count: 1, planetId: 'retillion' },
    ],
    abilities: ['stall_tactics', 'scheming', 'crafty'],
  },
}
