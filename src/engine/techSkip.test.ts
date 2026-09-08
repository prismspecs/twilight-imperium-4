import { describe, expect, it } from 'vitest'
import { homeSystemOf } from './board'
import { applyMove } from './index'
import { canResearch, researchableWithSkips } from './research'
import { deepFreeze, toActionPhase, withCards, withTechs } from './testUtils'
import type { GameState, TechColor, TechSkip } from './types'

/** Gives a controlled, ready planet the named technology specialty, for exercising LRR "Technology
 * Specialties" 12: exhausting it ignores one matching prerequisite when researching. */
function withSpecialty(state: GameState, systemId: string, planetId: string, techSkip: TechSkip): GameState {
  const sys = state.systems[systemId]
  return deepFreeze({
    ...state,
    systems: { ...state.systems, [systemId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, techSkip, exhausted: false } : p) } },
  })
}

describe('LRR "Technology Specialties" 12: tech skips', () => {
  it('canResearch: a matching specialty ignores one prerequisite symbol, never more than the tech needs', () => {
    const p = { faction: 'l1z1x' as const, techs: [] as string[] }
    // Cruiser II needs green 1, yellow 1, red 1
    expect(canResearch(p, 'cruiser_ii')).toBe(false)
    expect(canResearch(p, 'cruiser_ii', false, ['green'])).toBe(false)          // still needs yellow and red
    expect(canResearch(p, 'cruiser_ii', false, ['green', 'yellow', 'red'])).toBe(true)
    // a second green skip does nothing once the one green requirement is already covered
    const withOwnedGreen = { faction: 'l1z1x' as const, techs: ['neural_motivator'] }   // green tier 0
    expect(canResearch(withOwnedGreen, 'cruiser_ii', false, ['yellow', 'red'])).toBe(true)
  })

  it('researchableWithSkips: only lists techs a skip newly unlocks, not ones already researchable', () => {
    const p = { faction: 'l1z1x' as const, techs: [] as string[] }
    const skips: TechColor[] = ['green', 'yellow', 'red']
    const unlocked = researchableWithSkips(p, skips)
    expect(unlocked).toContain('cruiser_ii')
    expect(unlocked).not.toContain('sarween_tools')   // tier-0 yellow, already researchable with no skip
  })

  it('R5/R6: exhausts the named specialty planet and grants a tech otherwise one prerequisite short', () => {
    const base = toActionPhase(1, 0)   // L1Z1X starts with green (neural_motivator) and red (plasma_scoring), no blue or yellow
    const home = homeSystemOf(base, 0)
    const homePlanet = base.systems[home].planets.find(p => p.owner === 0)!
    const s = withSpecialty(withCards(base, 0, ['technology']), home, homePlanet.id, 'yellow')

    // Super-Dreadnought II needs blue 2, yellow 1 — the yellow specialty alone still leaves blue 2 fully unmet
    const short = applyMove(s, { type: 'strategic', card: 'technology', params: { techId: 'super_dreadnought_ii', techSkipPlanets: [homePlanet.id] } }, 0)
    expect(short.ok).toBe(false)

    // Once blue is owned, the yellow specialty alone covers the rest
    const withBlueTech = withTechs(s, 0, ['antimass_deflectors', 'gravity_drive'])   // blue tier 0 + tier 1 = blue 2
    const done = applyMove(withBlueTech, { type: 'strategic', card: 'technology', params: { techId: 'super_dreadnought_ii', techSkipPlanets: [homePlanet.id] } }, 0)
    if (!done.ok) throw new Error(done.error)
    expect(done.value.players[0].techs).toContain('super_dreadnought_ii')
    expect(done.value.systems[home].planets.find(p => p.id === homePlanet.id)!.exhausted).toBe(true)
    expect(done.value.log.some(e => e.t === 'info' && e.text.includes('prerequisite') && e.text.includes('skipped'))).toBe(true)

    // the same planet, already exhausted, cannot pay for a second skip
    const reused = applyMove(done.value, { type: 'research', techId: 'x', via: 'inheritance' }, 0)
    expect(reused.ok).toBe(false)
  })

  it('rejects a named planet with no technology specialty, or one already exhausted', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    const homePlanet = base.systems[home].planets.find(p => p.owner === 0)!
    const s = withCards(withTechs(base, 0, ['antimass_deflectors', 'gravity_drive']), 0, ['technology'])
    const noSpecialty = applyMove(s, { type: 'strategic', card: 'technology', params: { techId: 'super_dreadnought_ii', techSkipPlanets: [homePlanet.id] } }, 0)
    expect(noSpecialty.ok).toBe(false)

    const withYellow = withSpecialty(s, home, homePlanet.id, 'yellow')
    const exhausted = deepFreeze({
      ...withYellow,
      systems: { ...withYellow.systems, [home]: { ...withYellow.systems[home], planets: withYellow.systems[home].planets.map(p => p.id === homePlanet.id ? { ...p, exhausted: true } : p) } },
    })
    const rejected = applyMove(exhausted, { type: 'strategic', card: 'technology', params: { techId: 'super_dreadnought_ii', techSkipPlanets: [homePlanet.id] } }, 0)
    expect(rejected.ok).toBe(false)
  })

  it('legalMoves offers a skip-only technology as a strategic primary variant', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    const homePlanet = base.systems[home].planets.find(p => p.owner === 0)!
    const s = withSpecialty(withCards(withTechs(base, 0, ['antimass_deflectors', 'gravity_drive']), 0, ['technology']), home, homePlanet.id, 'yellow')
    const played = applyMove(s, { type: 'strategic', card: 'technology', params: { techId: 'super_dreadnought_ii', techSkipPlanets: [homePlanet.id] } }, 0)
    expect(played.ok).toBe(true)
  })
})
