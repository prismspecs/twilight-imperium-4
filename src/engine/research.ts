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

export function canResearch(player: TechOwner, techId: string, ignorePrereqs = false): boolean {
  if (!findTech(techId)) return false
  if (player.techs.includes(techId) || !availableTo(player, techId)) return false
  if (ignorePrereqs) return true
  const have = colourCounts(player.techs)
  const need = techDef(techId).prereq
  return (Object.keys(need) as TechColor[]).every(colour => have[colour] >= (need[colour] ?? 0))
}

export function researchable(player: TechOwner): string[] {
  return TECHS.map(t => t.id).filter(id => canResearch(player, id))
}
