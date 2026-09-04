import { SPRITE_FOLDER } from './sprites'
import type { ModelStyle } from './modelStyle'
import type { Color, FactionId, Owner, StrategyCardId, TechColor, UnitType } from '../engine/types'

export const CARD_NUMBER: Record<StrategyCardId, number> = {
  leadership: 1, diplomacy: 2, trade: 5, warfare: 6, technology: 7, imperial: 8,
}

/**
 * R1: every system is composed, never a printed tile with planets baked in. The tile file is the background
 * alone, an empty starfield, and every planet is drawn on top from its own render, so the whole map reads
 * in one style and one nameplate design.
 */
const TILE_FILE: Record<string, string> = {
  'home-n': '00_blue.png', bereg: '00_blue.png', sakulag: '00_blue.png', mecatol: '00_blue.png',
  quann: '00_blue.png', starpoint: '00_blue.png', 'home-s': '00_blue.png',
}

const PLANET_FILE: Record<string, string> = {
  '000': 'planet_Planet000.png', bereg: 'planet_Bereg.png', 'lirta-iv': 'planet_LirtaIV.png',
  'mecatol-rex': 'planet_Mecatol.png', sakulag: 'planet_Sakulag.png', quann: 'planet_Quann.png',
  starpoint: 'planet_Starpoint.png', centauri: 'planet_Vefut.png',
  'arc-prime': 'planet_ArcPrime.png', 'wren-terra': 'planet_WrenTerra.png',
}

/** The card file names do not follow the technology ids, so the mapping is explicit. */
const TECH_FILE: Record<string, string> = {
  antimass_deflectors: 'tech_antimass_deflectors.png', gravity_drive: 'tech_gravity_drive.png',
  fleet_logistics: 'tech_fleet_logistics.png', light_wave_deflector: 'tech_lightwave_deflector.png',
  plasma_scoring: 'tech_plasma_scoring.png', magen_defense_grid: 'tech_magen_defense_grid.png',
  duranium_armor: 'tech_duranium_armor.png', assault_cannon: 'tech_assault_cannon.png',
  neural_motivator: 'tech_neural_motivator.png', dacxive_animators: 'tech_dacxive_animators.png',
  hyper_metabolism: 'tech_hyper_metabolism.png', x89_bacterial_weapon: 'tech_x89_bacterial_weapon.png',
  sarween_tools: 'tech_sarween_tools.png', graviton_laser_system: 'tech_graviton_laser_system.png',
  transit_diodes: 'tech_transit_diodes.png', integrated_economy: 'tech_integrated_economy.png',
  infantry_ii: 'tech_infantry_2.jpg', fighter_ii: 'tech_fighter_2.jpg', destroyer_ii: 'tech_destroyer_2.jpg',
  cruiser_ii: 'tech_cruiser_2.jpg', carrier_ii: 'tech_carrier_2.jpg', dreadnought_ii: 'tech_dreadnought_2.jpg',
  space_dock_ii: 'tech_spacedock_2.jpg',
  inheritance_systems: 'tech_faction_inheritance_systems.jpg',
  super_dreadnought_ii: 'tech_faction_superdreadnought_2.jpg',
  l4_disruptors: 'tech_faction_l4_disruptors.jpg',
  non_euclidean_shielding: 'tech_faction_noneuclidean_shielding.jpg',
}

/** Reference cards for the production drawer; `flagship` is resolved by faction before this lookup. */
const UNIT_CARD: Record<UnitType, string> = {
  infantry: 'unit_generic_infantry.png', fighter: 'unit_generic_fighter.png',
  destroyer: 'unit_generic_destroyer.png', cruiser: 'unit_generic_cruiser.png',
  carrier: 'unit_generic_carrier.png', dreadnought: 'unit_generic_dreadnought.png',
  warsun: 'unit_generic_warsun_0.png', flagship: 'unit_generic_dreadnought.png',
  pds: 'unit_generic_pds.png', spacedock: 'unit_generic_spacedock.png',
}

export const MISC = {
  starfield: '/assets/misc/starfield.png',
  tradeGood: '/assets/misc/emoji_tg.png',
  commodity: '/assets/misc/emoji_comm.png',
  speaker: '/assets/misc/emoji_SpeakerToken.png',
  alpha: '/assets/misc/emoji_WHalpha.png',
  beta: '/assets/misc/emoji_WHbeta.png',
  objectiveBack: '/assets/cards/cardback_public1.png',
  strategyBack: '/assets/cards/cardback_public2.png',
  mandateBack: '/assets/cards/cardback_secret.jpg',
}

export const BADGE = {
  resourceReady: '/assets/cards/pc_res_rdy.png',
  resourceExhausted: '/assets/cards/pc_res_exh.png',
  influenceReady: '/assets/cards/pc_inf_rdy.png',
  influenceExhausted: '/assets/cards/pc_inf_exh.png',
}

/**
 * The printed tiles colour a planet's nameplate by its trait: blue for cultural, red for hazardous, green
 * for industrial, and a plain steel blue for the home planets and Mecatol Rex, which have none. It carries
 * no rule in this game, it is what makes the board read like the original.
 */
export type PlanetTrait = 'cultural' | 'hazardous' | 'industrial' | 'none'
const PLANET_TRAIT: Record<string, PlanetTrait> = {
  '000': 'none', bereg: 'hazardous', 'lirta-iv': 'hazardous', sakulag: 'hazardous',
  'mecatol-rex': 'none', quann: 'cultural', starpoint: 'hazardous', centauri: 'cultural',
  'arc-prime': 'none', 'wren-terra': 'none',
}
export function planetTrait(planetId: string): PlanetTrait {
  return PLANET_TRAIT[planetId] ?? 'none'
}

export const PORTRAIT: Record<FactionId, string> = {
  l1z1x: '/assets/factions/leader_l1z1x_commander.png',
  letnev: '/assets/factions/leader_letnev_commander.png',
  arborec: '/assets/factions/leader_arborec_commander.png',
  saar: '/assets/factions/leader_saar_commander.png',
  muaat: '/assets/factions/leader_muaat_commander.png',
  hacan: '/assets/factions/leader_hacan_commander.png',
  sol: '/assets/factions/leader_sol_commander.png',
  creuss: '/assets/factions/leader_creuss_commander.png',
  mentak: '/assets/factions/leader_mentak_commander.png',
  naalu: '/assets/factions/leader_naalu_commander.png',
  nekro: '/assets/factions/leader_nekro_commander.png',
  sardakk: '/assets/factions/leader_sardakk_commander.png',
  jolnar: '/assets/factions/leader_jolnar_commander.png',
  winnu: '/assets/factions/leader_winnu_commander.png',
  xxcha: '/assets/factions/leader_xxcha_commander.png',
  yin: '/assets/factions/leader_yin_commander.png',
  yssaril: '/assets/factions/leader_yssaril_commander.png',
}
export const SIGIL: Record<FactionId, string> = {
  l1z1x: '/assets/factions/l1z1x.png',
  letnev: '/assets/factions/letnev.png',
  arborec: '/assets/factions/arborec.png',
  saar: '/assets/factions/saar.png',
  muaat: '/assets/factions/muaat.png',
  hacan: '/assets/factions/hacan.png',
  sol: '/assets/factions/sol.png',
  creuss: '/assets/factions/creuss.png',
  mentak: '/assets/factions/mentak.png',
  naalu: '/assets/factions/naalu.png',
  nekro: '/assets/factions/nekro.png',
  sardakk: '/assets/factions/sardakk.png',
  jolnar: '/assets/factions/jolnar.png',
  winnu: '/assets/factions/winnu.png',
  xxcha: '/assets/factions/xxcha.png',
  yin: '/assets/factions/yin.png',
  yssaril: '/assets/factions/yssaril.png',
}

export function tileUrl(systemId: string): string {
  return `/assets/tiles/${TILE_FILE[systemId]}`
}
export function planetArtUrl(planetId: string): string | null {
  const file = PLANET_FILE[planetId]
  return file ? `/assets/tiles/${file}` : null
}
export function spriteUrl(colour: Color | 'grey', type: UnitType, style: ModelStyle = 'models'): string {
  return `/assets/sprites/${SPRITE_FOLDER[style]}${colour}_${type}.png`
}
export function tokenUrl(faction: FactionId, kind: 'command' | 'command-fleet' | 'control'): string {
  return `/assets/tokens/${faction}_${kind}.png`
}
export function strategyCardUrl(card: StrategyCardId): string {
  return `/assets/cards/strat_base_game_${CARD_NUMBER[card]}.png`
}
export function techIconUrl(colour: TechColor): string {
  return `/assets/icons/tech_${colour}.png`
}
export function techArtUrl(techId: string): string {
  return `/assets/cards/${TECH_FILE[techId] ?? 'cardback_public2.png'}`
}
export function unitCardUrl(type: UnitType, faction: FactionId): string {
  if (type === 'flagship') {
    return faction === 'l1z1x'
      ? '/assets/factions/unit_l1z1x_flagship_001.png'
      : '/assets/factions/unit_letnev_flagship_arc_secundus.png'
  }
  if (type === 'dreadnought' && faction === 'l1z1x') return '/assets/factions/unit_l1z1x_superdreadnought.jpg'
  return `/assets/cards/${UNIT_CARD[type]}`
}
export function ownerKey(owner: Owner): string {
  return owner === 'guardian' ? 'guardian' : String(owner)
}
