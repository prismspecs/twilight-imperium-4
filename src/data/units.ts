import type { FactionId, UnitStats, UnitType } from '../engine/types'

const base = (p: Partial<UnitStats>): UnitStats => ({
  cost: 0, producedPerCost: 1, combat: null, combatDice: 1, move: 0, capacity: 0, sustain: false,
  bombardment: null, afb: null, spaceCannon: null, planetaryShield: false, production: null, ...p,
})

const LEVEL_I: Record<UnitType, UnitStats> = {
  infantry: base({ cost: 1, producedPerCost: 2, combat: 8 }),
  fighter: base({ cost: 1, producedPerCost: 2, combat: 9 }),
  destroyer: base({ cost: 1, combat: 9, move: 2, afb: { value: 9, dice: 2 } }),
  cruiser: base({ cost: 2, combat: 7, move: 2 }),
  carrier: base({ cost: 3, combat: 9, move: 1, capacity: 4 }),
  dreadnought: base({ cost: 4, combat: 5, move: 1, capacity: 1, sustain: true, bombardment: { value: 5, dice: 1 } }),
  warsun: base({ cost: 12, combat: 3, combatDice: 3, move: 2, capacity: 6, sustain: true, bombardment: { value: 3, dice: 3 } }),
  flagship: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  pds: base({ spaceCannon: { value: 6, dice: 1 }, planetaryShield: true }),
  spacedock: base({ production: 2 }),
  // Saar's Floating Factory: a space dock that moves like a ship, and — unlike a plain space dock — carries
  // cargo like one too. Stats per the printed Floating Factory I card, not a plain space dock's.
  floating_factory: base({ move: 1, capacity: 4, production: 5 }),
}

const LEVEL_II: Partial<Record<UnitType, Partial<UnitStats>>> = {
  infantry: { combat: 7 },
  fighter: { combat: 8, move: 2 },
  destroyer: { combat: 8, afb: { value: 6, dice: 3 } },
  cruiser: { combat: 6, move: 3, capacity: 1 },
  carrier: { move: 2, capacity: 6 },
  dreadnought: { move: 2 },
  spacedock: { production: 4 },
}

export const UPGRADE_TECH: Partial<Record<UnitType, string>> = {
  infantry: 'infantry_ii', fighter: 'fighter_ii', destroyer: 'destroyer_ii', cruiser: 'cruiser_ii',
  carrier: 'carrier_ii', dreadnought: 'dreadnought_ii', spacedock: 'space_dock_ii',
}

/**
 * A faction's own named unit upgrade occupies the same tech-tree slot as the generic one (same prerequisite,
 * mutually exclusive by having its own id) but prints different stats. Sardakk's Exotrireme II and L1Z1X's
 * Super-Dreadnought II also carry an active ability beyond stats, so they stay special-cased in `unitStats`
 * below rather than joining this table.
 */
const FACTION_UPGRADE_TECH: Partial<Record<UnitType, Partial<Record<FactionId, string>>>> = {
  infantry: { sol: 'spec_ops_ii' },
  carrier: { sol: 'advanced_carrier_ii' },
  fighter: { naalu: 'hybrid_crystal_fighter_ii' },
  floating_factory: { saar: 'floating_factory_ii' },
}

const FACTION_LEVEL_II: Partial<Record<UnitType, Partial<Record<FactionId, Partial<UnitStats>>>>> = {
  infantry: { sol: { combat: 6 } },
  carrier: { sol: { move: 2, capacity: 8, sustain: true } },
  fighter: { naalu: { combat: 7, move: 2 } },
  floating_factory: { saar: { move: 2, capacity: 5, production: 7 } },
}

/** The die roll Infantry II (or a faction's equivalent) needs to bring a destroyed infantry back. Sol's Spec
 * Ops II returns on a 5, one better than the generic 6. */
export const INFANTRY_REVIVAL_TECH: Partial<Record<FactionId, { tech: string; value: number }>> = {
  sol: { tech: 'spec_ops_ii', value: 5 },
}

/**
 * A faction with its own named unit upgrade never has the generic one to research too — one slot, one path.
 * L1Z1X's Super-Dreadnought II is special-cased directly in `unitStats` (it has an active ability beyond
 * stats), so it is listed here by hand rather than joining `FACTION_UPGRADE_TECH`.
 */
export function excludesGenericUpgrade(type: UnitType, faction: FactionId): boolean {
  if (type === 'dreadnought' && faction === 'l1z1x') return true
  return FACTION_UPGRADE_TECH[type]?.[faction] !== undefined
}

const FLAGSHIPS: Record<FactionId, UnitStats> = {
  l1z1x: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 5, sustain: true }),
  letnev: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true, bombardment: { value: 5, dice: 3 } }),
  arborec: base({ cost: 8, combat: 7, combatDice: 2, move: 1, capacity: 5, sustain: true }),
  saar: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true, afb: { value: 6, dice: 4 } }),
  muaat: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  hacan: base({ cost: 8, combat: 7, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  sol: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 12, sustain: true }),
  creuss: base({ cost: 8, combat: 5, combatDice: 1, move: 1, capacity: 3, sustain: true }),
  mentak: base({ cost: 8, combat: 7, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  naalu: base({ cost: 8, combat: 9, combatDice: 2, move: 1, capacity: 6, sustain: true }),
  nekro: base({ cost: 8, combat: 9, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  sardakk: base({ cost: 8, combat: 6, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  jolnar: base({ cost: 8, combat: 6, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  winnu: base({ cost: 8, combat: 7, combatDice: 1, move: 1, capacity: 3, sustain: true }),
  xxcha: base({ cost: 8, combat: 7, combatDice: 2, move: 1, capacity: 3, sustain: true, spaceCannon: { value: 5, dice: 3 } }),
  yin: base({ cost: 8, combat: 9, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  yssaril: base({ cost: 8, combat: 5, combatDice: 2, move: 2, capacity: 3, sustain: true }),
}

const SUPER_DREADNOUGHT_I = base({ cost: 4, combat: 5, move: 1, capacity: 2, sustain: true, bombardment: { value: 5, dice: 1 } })
const SUPER_DREADNOUGHT_II = base({ cost: 4, combat: 4, move: 2, capacity: 2, sustain: true, bombardment: { value: 4, dice: 1 } })

export type StatsOwner = { faction: FactionId; techs: string[] } | 'guardian'

export function unitStats(type: UnitType, owner: StatsOwner): Readonly<UnitStats> {
  if (owner === 'guardian') return LEVEL_I[type]
  if (type === 'flagship') return FLAGSHIPS[owner.faction]
  if (type === 'dreadnought' && owner.faction === 'l1z1x') {
    return owner.techs.includes('super_dreadnought_ii') ? SUPER_DREADNOUGHT_II : SUPER_DREADNOUGHT_I
  }
  const factionUpgrade = FACTION_UPGRADE_TECH[type]?.[owner.faction]
  if (factionUpgrade && owner.techs.includes(factionUpgrade)) {
    return { ...LEVEL_I[type], ...FACTION_LEVEL_II[type]?.[owner.faction] }
  }
  const upgrade = UPGRADE_TECH[type]
  if (upgrade && owner.techs.includes(upgrade) && LEVEL_II[type]) return { ...LEVEL_I[type], ...LEVEL_II[type] }
  return LEVEL_I[type]
}

export const SHIP_TYPES: readonly UnitType[] = ['fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship']
export const NON_FIGHTER_SHIPS: readonly UnitType[] = ['destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship']
export function isShip(type: UnitType): boolean { return SHIP_TYPES.includes(type) }

/** A Saar Floating Factory is not a ship (it doesn't fight, doesn't count toward fleet pool), but it moves
 * like one — it's the only non-ship unit that can be a move's `unitId`. */
export function isMovable(type: UnitType): boolean { return isShip(type) || type === 'floating_factory' }
