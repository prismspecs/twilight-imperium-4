/**
 * Identifier normalisation for AsyncTI4 data -> this repo's base-17 world.
 *
 * AsyncTI4 serves an expanded faction / tech / tile pool. This module holds the
 * lookup tables that map AsyncTI4's abbreviated tech codes and faction strings onto
 * stable canonical identifiers, and flags everything that does NOT exist in this
 * repo's base game so the extractor emits an `unmapped` reason rather than a wrong
 * action. The tech code table was extracted from AsyncTI4's own JS bundle
 * (`{alias, name}` entries), so it is authoritative over guessing.
 */
import type { FactionId } from '../../src/engine/types'

/**
 * AsyncTI4 tech code -> canonical snake_case tech id (this repo's convention,
 * matching scripts/calibrate-asyncti4.ts TECH_ALIAS_MAP). Only BASE+PoK techs that
 * exist in this repo are mapped; homebrew-only codes are deliberately absent so they
 * fall through to `unmapped`.
 */
export const TECH_CODES: Record<string, string> = {
  // Blue
  gd: 'gravity_drive',
  fl: 'fleet_logistics',
  lwd: 'light_wave_deflector',
  amd: 'antimass_deflectors',
  det: 'dark_energy_tap',
  sr: 'sling_relay',
  // Yellow
  sar: 'sarween_tools',
  pi: 'predictive_intelligence',
  ie: 'integrated_economy',
  sc: 'supercharge',
  scc: 'spatial_conduit_cylinder',
  // Red
  ps: 'plasma_scoring',
  md: 'magen_defense_grid',
  da: 'duranium_armor',
  asc: 'assault_cannon',
  cm: 'chaos_mapping',
  // Green
  nm: 'neural_motivator',
  hm: 'hyper_metabolism',
  bio: 'bioplasmosis',
  pa: 'psychoarchaeology',
  x89c4: 'x89_bacterial_weapon',
  // Upgrades (unit tech) — normalise to the base unit-tech ids
  inf2: 'infantry_ii',
  ff2: 'fighter_ii',
  dd2: 'destroyer_ii',
  cr2: 'cruiser_ii',
  cv2: 'carrier_ii',
  dn2: 'dreadnought_ii',
  pds2: 'pds_ii',
  sd2: 'space_dock_ii',
  ffac2: 'floating_factory_ii',
}

const FACTION_SET: ReadonlySet<string> = new Set<FactionId>([
  'arborec', 'letnev', 'saar', 'muaat', 'hacan', 'sol', 'creuss', 'l1z1x',
  'mentak', 'naalu', 'nekro', 'sardakk', 'jolnar', 'winnu', 'xxcha', 'yin', 'yssaril',
])

/** AsyncTI4 faction strings that alias onto a base faction (a few differ in casing). */
export const FACTION_ALIASES: Record<string, FactionId> = {
  barony: 'letnev',
  'barony of letnev': 'letnev',
  sardakk_norr: 'sardakk',
  'sardakk n\'orr': 'sardakk',
  naalu_collective: 'naalu',
}

/**
 * Return the repo FactionId for an AsyncTI4 faction string, or null if it is not in
 * this repo's base-17 set (homebrew / PoK-only factions such as keleresm, cabal …).
 */
export function normalizeFaction(raw: string | null | undefined): FactionId | null {
  if (!raw) return null
  const key = raw.toLowerCase()
  if (FACTION_SET.has(key)) return key as FactionId
  return FACTION_ALIASES[key] ?? null
}

/**
 * Return the canonical tech id for an AsyncTI4 tech code, or null if unmapped.
 * Unknown codes (faction techs, homebrew) fall through to null.
 */
export function normalizeTech(code: string | null | undefined): string | null {
  if (!code) return null
  const c = code.toLowerCase()
  if (TECH_CODES[c]) return TECH_CODES[c]
  // Base-unit tech codes like pds2/sd2 handled above; anything else is unmapped.
  return null
}
