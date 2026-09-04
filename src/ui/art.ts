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
  delta: '/assets/misc/emoji_WHdelta.png',
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
export function planetTrait(planetId: string, traitOverride?: PlanetTrait | null): PlanetTrait {
  if (traitOverride) return traitOverride
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

export const TILE_IMAGE_BY_NUMBER: Readonly<Record<number, string>> = {
  1: '01_Jord.png',
  2: '02_MollPrimus.png',
  3: '03_Darien.png',
  4: '04_Muaat.png',
  5: '05_Nestphar.png',
  6: '06_000.png',
  7: '07_Winnu.png',
  8: '08_MordaiII.png',
  9: '09_Maaluuk.png',
  10: '10_ArcPime.png',
  11: '11_LisisII.png',
  12: '12_Nar.png',
  13: '13_Trenlak.png',
  14: '14_ArchonRen.png',
  15: '15_Retillion.png',
  16: '16_Arretze.png',
  17: '17_DeltaWH.png',
  18: '18_MR.png',
  19: '19_Wellon.png',
  20: '20_VefutII.png',
  21: '21_Thibah.png',
  22: '22_Tarmann.png',
  23: '23_Saudor.png',
  24: '24_MeharXull.png',
  25: '25_Quann.png',
  26: '26_Lodor.png',
  27: '27_NewAlbion.png',
  28: '28_Tequran.png',
  29: '29_Qucenn.png',
  30: '30_Mellon.png',
  31: '31_Lazar.png',
  32: '32_DalBootha.png',
  33: '33_Corneeq.png',
  34: '34_Centauri.png',
  35: '35_Bereg.png',
  36: '36_Arnor.png',
  37: '37_Arinam.png',
  38: '38_Abyz.png',
  39: '39_AlphaWH.png',
  40: '40_BetaWH.png',
  41: '41_GravityRift.png',
  42: '42_Nebula.png',
  43: '43_Supernova.png',
  44: '44_Asteroids.png',
  45: '45_Asteroids.png',
  46: '46_Void.png',
  47: '47_Void.png',
  48: '48_Void.png',
  49: '49_Void.png',
  50: '50_Void.png',
  51: '51_Creuss.png',
} as const

function resolveTileFile(tileFile: string): string | null {
  const num = Number(tileFile)
  if (!Number.isNaN(num) && TILE_IMAGE_BY_NUMBER[num]) {
    return `/assets/tiles/${TILE_IMAGE_BY_NUMBER[num]}`
  }
  const base = tileFile.replace(/\.png$/, '')
  if (base.startsWith('tile_')) return `/assets/tiles/${base}.png`
  const byName = Object.values(TILE_IMAGE_BY_NUMBER).find(f => f.replace(/\.png$/, '').toLowerCase() === base.toLowerCase())
  return byName ? `/assets/tiles/${byName}` : null
}

export function tileUrl(systemId: string, tileFile?: string, isGalaxy = false): string {
  if (isGalaxy) {
    if (tileFile) {
      const resolved = resolveTileFile(tileFile)
      if (resolved) return resolved
    }
    if (systemId === 'mecatol') return '/assets/tiles/18_MR.png'
    return '/assets/tiles/00_blue.png'
  }

  if (TILE_FILE[systemId]) return `/assets/tiles/${TILE_FILE[systemId]}`
  if (tileFile) {
    const resolved = resolveTileFile(tileFile)
    if (resolved) return resolved
    const known = ['00_blue', '06_000', '10_ArcPime', '18_MR', '35_Bereg', '42_Nebula', '44_Asteroids', 'tile_anomaly', 'tile_anomaly_chevron']
    const base = tileFile.replace(/\.png$/, '')
    if (known.includes(base)) return `/assets/tiles/${base}.png`
  }
  return '/assets/tiles/00_blue.png'
}
export function planetArtUrl(planetId: string): string | null {
  const file = PLANET_FILE[planetId]
  return file ? `/assets/tiles/${file}` : null
}

/** The same six axial hex directions the galaxy generator lays tiles out with (src/engine/galaxy.ts). */
const HEX_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

/** Every axial cell at exactly `ring` steps from the origin, walked corner to corner - the standard hex-ring
 * traversal (redblobgames.com/grids/hexagons/#rings): start at `ring` steps in direction 4, then walk each
 * of the six sides for `ring` steps. Ring 0 is just the origin itself. */
function hexRing(ring: number): [number, number][] {
  if (ring === 0) return [[0, 0]]
  const cells: [number, number][] = []
  let [q, r] = [HEX_DIRECTIONS[4][0] * ring, HEX_DIRECTIONS[4][1] * ring]
  for (const [dq, dr] of HEX_DIRECTIONS) {
    for (let step = 0; step < ring; step++) {
      cells.push([q, r])
      q += dq; r += dr
    }
  }
  return cells
}

/**
 * The map-position number a tile shows in a corner, AsyncTI4-style (see the user-supplied reference:
 * https://github.com/AsyncTI4/ti4_web_new): Mecatol Rex at the centre is "000", the six tiles touching it
 * are "101"-"106", the next ring out is "201"-"212", and so on - ring number times 100 plus a 1-indexed
 * position within that ring. This is a map-position label, not the physical FFG catalog tile number; it
 * only depends on the system's axial coordinates, so it works the same for the generated galaxy and the
 * fixed duel map (which is exactly a radius-1 hex around Mecatol). Returns null off that hex entirely.
 */
export function tileNumberLabel(q: number | undefined, r: number | undefined): string | null {
  if (q === undefined || r === undefined) return null
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
  if (ring === 0) return '000'
  const position = hexRing(ring).findIndex(([hq, hr]) => hq === q && hr === r)
  if (position < 0) return null
  return `${ring}${String(position + 1).padStart(2, '0')}`
}
export function spriteUrl(colour: Color | 'grey', type: UnitType, style: ModelStyle = 'models'): string {
  return `/assets/sprites/${SPRITE_FOLDER[style]}${colour}_${type}.png`
}
const KNOWN_TOKEN_FACTIONS = new Set<FactionId>(['l1z1x', 'letnev'])
export function tokenUrl(faction: FactionId, kind: 'command' | 'command-fleet' | 'control'): string {
  const f = KNOWN_TOKEN_FACTIONS.has(faction) ? faction : 'l1z1x'
  return `/assets/tokens/${f}_${kind}.png`
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
