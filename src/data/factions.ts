import type { FactionId, UnitType } from '../engine/types'

export interface FactionDef {
  id: FactionId; name: string; commodityValue: number
  startingTechs: string[]
  /**
   * `planetIndex` is the index into the faction's home-system planets (the catalogue home-tile order in
   * src/data/tiles.ts), not an absolute planet id, so the same starting layout works on the fixed duel map
   * and on a generated galaxy. Ships (no planetIndex) are placed in the home system's space; infantry and
   * structures go on the named home planet.
   */
  startingUnits: { type: UnitType; count: number; planetIndex?: number }[]
  abilities: string[]
}

/**
 * All 17 base-game factions. Only l1z1x and letnev are currently selectable and placed (the duel map has
 * their two home systems); the other fifteen are complete data — starting units/techs, commodities and
 * ability ids — pending per-faction ability wiring, and are placed once a galaxy is generated for N-player
 * games. Home-planet indices follow the catalogue home-tile planet order.
 */
export const FACTIONS: Record<FactionId, FactionDef> = {
  l1z1x: {
    id: 'l1z1x', name: 'L1Z1X Mindnet', commodityValue: 2,
    startingTechs: ['neural_motivator', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 5, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['assimilate', 'harrow'],
  },
  letnev: {
    id: 'letnev', name: 'Barony of Letnev', commodityValue: 2,
    startingTechs: ['antimass_deflectors', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 1 },
      { type: 'infantry', count: 2, planetIndex: 0 }, { type: 'infantry', count: 1, planetIndex: 1 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['munitions_reserves', 'armada'],
  },
  arborec: {
    id: 'arborec', name: 'Arborec', commodityValue: 3,
    startingTechs: ['magen_defense_grid'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['mitosis'],
  },
  saar: {
    id: 'saar', name: 'Clan of Saar', commodityValue: 3,
    startingTechs: ['antimass_deflectors'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetIndex: 0 }, { type: 'infantry', count: 2, planetIndex: 1 }, { type: 'spacedock', count: 1, planetIndex: 1 },
    ],
    abilities: ['scavenge', 'nomadic'],
  },
  muaat: {
    id: 'muaat', name: 'Embers of Muaat', commodityValue: 4,
    startingTechs: ['plasma_scoring'],
    startingUnits: [
      { type: 'warsun', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['star_forge', 'gashlai_physiology'],
  },
  hacan: {
    id: 'hacan', name: 'Emirates of Hacan', commodityValue: 6,
    startingTechs: ['antimass_deflectors', 'sarween_tools'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetIndex: 0 }, { type: 'infantry', count: 1, planetIndex: 1 }, { type: 'infantry', count: 1, planetIndex: 2 },
      { type: 'spacedock', count: 1, planetIndex: 1 },
    ],
    abilities: ['masters_of_trade', 'guild_ships', 'arbiters'],
  },
  sol: {
    id: 'sol', name: 'Federation of Sol', commodityValue: 4,
    startingTechs: ['neural_motivator', 'antimass_deflectors'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 5, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['orbital_drop', 'versatile'],
  },
  creuss: {
    id: 'creuss', name: 'Ghosts of Creuss', commodityValue: 4,
    startingTechs: ['gravity_drive'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'destroyer', count: 2 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 4, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['quantum_entanglement', 'slipstream', 'creuss_gate'],
  },
  mentak: {
    id: 'mentak', name: 'Mentak Coalition', commodityValue: 2,
    startingTechs: ['sarween_tools', 'plasma_scoring'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 2 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 4, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['ambush', 'pillage'],
  },
  naalu: {
    id: 'naalu', name: 'Naalu Collective', commodityValue: 3,
    startingTechs: ['sarween_tools', 'neural_motivator'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 3, planetIndex: 1 }, { type: 'infantry', count: 1, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 1 }, { type: 'pds', count: 1, planetIndex: 1 },
    ],
    abilities: ['telepathic', 'foresight'],
  },
  nekro: {
    id: 'nekro', name: 'Nekro Virus', commodityValue: 3,
    startingTechs: ['dacxive_animators', 'valefar_assimilator_x', 'valefar_assimilator_y'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['galactic_threat', 'propagation', 'technological_singularity'],
  },
  sardakk: {
    id: 'sardakk', name: "Sardakk N'orr", commodityValue: 3,
    startingTechs: [],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 },
      { type: 'infantry', count: 3, planetIndex: 1 }, { type: 'infantry', count: 2, planetIndex: 0 },
      { type: 'spacedock', count: 1, planetIndex: 1 }, { type: 'pds', count: 1, planetIndex: 1 },
    ],
    abilities: ['unrelenting'],
  },
  jolnar: {
    id: 'jolnar', name: 'Universities of Jol-Nar', commodityValue: 4,
    startingTechs: ['neural_motivator', 'antimass_deflectors', 'sarween_tools', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 2 }, { type: 'fighter', count: 1 },
      { type: 'infantry', count: 1, planetIndex: 1 }, { type: 'infantry', count: 1, planetIndex: 0 },
      { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 2, planetIndex: 0 },
    ],
    abilities: ['fragile', 'brilliant', 'analytical'],
  },
  winnu: {
    id: 'winnu', name: 'Winnu', commodityValue: 3,
    // Winnu chooses any one prerequisite-free technology at setup; recorded as empty until that pick is wired.
    startingTechs: [],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 2, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['blood_ties', 'reclamation'],
  },
  xxcha: {
    id: 'xxcha', name: 'Xxcha Kingdom', commodityValue: 4,
    startingTechs: ['graviton_laser_system'],
    startingUnits: [
      { type: 'carrier', count: 1 }, { type: 'cruiser', count: 2 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 3, planetIndex: 0 }, { type: 'infantry', count: 1, planetIndex: 1 },
      { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['peace_accords', 'quash'],
  },
  yin: {
    id: 'yin', name: 'Yin Brotherhood', commodityValue: 2,
    startingTechs: ['sarween_tools'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 4 },
      { type: 'infantry', count: 4, planetIndex: 0 }, { type: 'spacedock', count: 1, planetIndex: 0 },
    ],
    abilities: ['indoctrination', 'devotion'],
  },
  yssaril: {
    id: 'yssaril', name: 'Yssaril Tribes', commodityValue: 3,
    startingTechs: ['neural_motivator'],
    startingUnits: [
      { type: 'carrier', count: 2 }, { type: 'cruiser', count: 1 }, { type: 'fighter', count: 2 },
      { type: 'infantry', count: 3, planetIndex: 0 }, { type: 'infantry', count: 2, planetIndex: 1 },
      { type: 'spacedock', count: 1, planetIndex: 0 }, { type: 'pds', count: 1, planetIndex: 0 },
    ],
    abilities: ['stall_tactics', 'scheming', 'crafty'],
  },
}
