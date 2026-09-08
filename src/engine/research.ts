import { TECHS, findTech, techDef } from '../data/techs'
import { UPGRADE_TECH, excludesGenericUpgrade } from '../data/units'
import type { FactionId, TechColor } from './types'

type TechOwner = { faction: FactionId; techs: string[] }

export function colourCounts(techs: string[]): Record<TechColor, number> {
  const c: Record<TechColor, number> = { blue: 0, red: 0, green: 0, yellow: 0 }
  for (const id of techs) { const t = techDef(id); if (t.colour) c[t.colour]++ }
  return c
}

function availableTo(player: TechOwner, techId: string): boolean {
  const t = techDef(techId)
  // A faction tech is named for one faction, whatever its `kind`: a faction unit upgrade (kind 'upgrade',
  // e.g. Sol's Spec Ops II) is exclusive to that faction the same way an ability tech (kind 'faction') is.
  if (t.faction !== undefined && t.faction !== player.faction) return false
  // The GENERIC upgrade in the same slot is what a faction with its own named upgrade loses, not that
  // upgrade itself (t.faction === undefined here rules out matching the faction's own tech).
  if (t.kind === 'upgrade' && t.faction === undefined && t.unit && techId === UPGRADE_TECH[t.unit] && excludesGenericUpgrade(t.unit, player.faction)) return false
  return true
}

/**
 * `skips`: one entry per technology specialty planet exhausted alongside this research, LRR "Technology
 * Specialties" 12 — each ignores one prerequisite symbol of the matching colour on the card being
 * researched. A skip of a colour the tech does not need, or beyond what it needs, simply does nothing (the
 * caller decides which planets are worth exhausting; this just checks the result is legal).
 */
export function canResearch(player: TechOwner, techId: string, ignorePrereqs = false, skips: TechColor[] = []): boolean {
  if (!findTech(techId)) return false
  if (player.techs.includes(techId) || !availableTo(player, techId)) return false
  if (ignorePrereqs) return true
  const have = colourCounts(player.techs)
  const need = { ...techDef(techId).prereq }
  for (const colour of skips) {
    if ((need[colour] ?? 0) > 0) need[colour] = (need[colour] ?? 0) - 1
  }
  return (Object.keys(need) as TechColor[]).every(colour => have[colour] >= (need[colour] ?? 0))
}

export function researchable(player: TechOwner): string[] {
  return TECHS.map(t => t.id).filter(id => canResearch(player, id))
}

/** Every technology `skips` (in any combination up to `maxSkips` planets) could newly unlock, beyond what
 * `researchable` already offers with no skips at all. */
export function researchableWithSkips(player: TechOwner, availableSkipColours: TechColor[]): string[] {
  if (!availableSkipColours.length) return []
  return TECHS.map(t => t.id).filter(id => {
    if (canResearch(player, id)) return false   // already offered without spending a planet
    // try every non-empty subset of the available skip colours actually usable on this tech's own prereqs
    const need = techDef(id).prereq
    const usable = availableSkipColours.filter(c => (need[c] ?? 0) > 0)
    for (let mask = 1; mask < 1 << usable.length; mask++) {
      const combo = usable.filter((_, i) => mask & (1 << i))
      if (canResearch(player, id, false, combo)) return true
    }
    return false
  })
}
