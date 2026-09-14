import { TECHS, findTech, techDef } from '../data/techs'
import { UPGRADE_TECH, excludesGenericUpgrade } from '../data/units'
import type { FactionId, GameState, Result, Seat, TechColor } from './types'

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

/**
 * All ready planets with a technology specialty controlled by `seat`.
 */
export function techSkipCandidates(state: GameState, seat: Seat): { planetId: string; colour: TechColor }[] {
  const out: { planetId: string; colour: TechColor }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat && !p.exhausted && p.techSkip) out.push({ planetId: p.id, colour: p.techSkip })
  }
  return out
}

/**
 * One legal (not the only possible) set of the seat's specialty planets that gets `techId` researchable —
 * greedily one planet per still-needed colour, cheapest in the sense of "fewest planets spent" since it never
 * takes a second planet of a colour the tech only needs once. Empty array if no skip is needed at all; null if
 * no combination of the seat's own specialty planets reaches it.
 */
export function skipPlanetsFor(state: GameState, seat: Seat, techId: string, owned: string[]): string[] | null {
  const player = { faction: state.players[seat].faction, techs: owned }
  if (canResearch(player, techId)) return []
  const need = { ...techDef(techId).prereq }
  const chosen: { planetId: string; colour: TechColor }[] = []
  for (const c of techSkipCandidates(state, seat)) {
    if ((need[c.colour] ?? 0) > chosen.filter(x => x.colour === c.colour).length) chosen.push(c)
  }
  const skips = chosen.map(c => c.colour)
  return canResearch(player, techId, false, skips) ? chosen.map(c => c.planetId) : null
}

/**
 * LRR "Technology Specialties" 12: exhausts each named planet (controlled, ready, carrying that specialty)
 * before the research itself is checked, and hands back the colour it ignores one prerequisite of.
 */
export function exhaustTechSkipPlanets(state: GameState, seat: Seat, planetIds: string[]): Result<{ state: GameState; skips: TechColor[] }> {
  let next = state
  const skips: TechColor[] = []
  for (const planetId of planetIds) {
    const sysId = Object.keys(next.systems).find(id => next.systems[id].planets.some(p => p.id === planetId))
    if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
    const sys = next.systems[sysId]
    const planet = sys.planets.find(p => p.id === planetId)
    if (!planet || planet.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
    if (planet.exhausted) return { ok: false, error: `planet ${planetId} is exhausted` }
    if (!planet.techSkip) return { ok: false, error: `planet ${planetId} has no technology specialty` }
    skips.push(planet.techSkip)
    next = { ...next, systems: { ...next.systems, [sysId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, exhausted: true } : p) } } }
  }
  return { ok: true, value: { state: next, skips } }
}

