import { describe, expect, it } from 'vitest'
import { objectiveDef } from '../data/objectives'
import { createGame, shuffledObjectives } from './setup'
import { controlsMecatol, fulfils, scoreObjective, scoreable } from './objectives'
import {
  DUEL_CONFIG,
  deepFreeze,
  toActionPhase,
  withPlanetOwner,
  withPlayer,
  withUnits,
} from './testUtils'
import type { GameState, PlanetTrait } from './types'

/** Helper to set planet trait and tech skip in a system. */
function withPlanetProps(
  state: GameState,
  systemId: string,
  planetId: string,
  owner: number | null,
  trait: PlanetTrait | null,
  techSkip: 'red' | 'blue' | 'green' | 'yellow' | null = null,
): GameState {
  const sys = state.systems[systemId]
  if (!sys) throw new Error(`unknown system ${systemId}`)
  const planets = sys.planets.map(p =>
    p.id === planetId ? { ...p, owner, trait, techSkip } : p,
  )
  return {
    ...state,
    systems: {
      ...state.systems,
      [systemId]: { ...sys, planets },
    },
  }
}

describe('Stage I public objectives (1 VP)', () => {
  it('corner_the_market: control 4 planets that each have the same planet trait', () => {
    let s = toActionPhase()
    expect(fulfils(s, 0, 'corner_the_market')).toBe(false)

    // Give seat 0 three industrial planets
    s = withPlanetProps(s, 'bereg', 'bereg', 0, 'industrial')
    s = withPlanetProps(s, 'bereg', 'lirta-iv', 0, 'industrial')
    s = withPlanetProps(s, 'quann', 'quann', 0, 'industrial')
    expect(fulfils(s, 0, 'corner_the_market')).toBe(false)

    // Give a fourth industrial planet -> fulfilled
    s = withPlanetProps(s, 'sakulag', 'sakulag', 0, 'industrial')
    expect(fulfils(s, 0, 'corner_the_market')).toBe(true)

    // If one is hazardous instead (3 industrial, 1 hazardous) -> not fulfilled
    const mixed = withPlanetProps(s, 'sakulag', 'sakulag', 0, 'hazardous')
    expect(fulfils(mixed, 0, 'corner_the_market')).toBe(false)
  })

  it('develop_weaponry: own 2 unit upgrade technologies', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'develop_weaponry')).toBe(false)

    // 1 unit upgrade
    const one = withPlayer(s, 0, { techs: ['cruiser_ii'] })
    expect(fulfils(one, 0, 'develop_weaponry')).toBe(false)

    // 2 unit upgrades -> fulfilled
    const two = withPlayer(s, 0, { techs: ['cruiser_ii', 'dreadnought_ii'] })
    expect(fulfils(two, 0, 'develop_weaponry')).toBe(true)

    // Faction unit upgrade (super_dreadnought_ii) also counts
    const factionUpgrade = withPlayer(s, 0, { techs: ['infantry_ii', 'super_dreadnought_ii'] })
    expect(fulfils(factionUpgrade, 0, 'develop_weaponry')).toBe(true)
  })

  it('diversify_research: own 2 technologies in each of 2 colors', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'diversify_research')).toBe(false)

    // 2 blue, 1 red -> not fulfilled
    const partial = withPlayer(s, 0, { techs: ['antimass_deflectors', 'gravity_drive', 'plasma_scoring'] })
    expect(fulfils(partial, 0, 'diversify_research')).toBe(false)

    // 2 blue, 2 red -> fulfilled
    const fulfilled = withPlayer(s, 0, {
      techs: [
        'antimass_deflectors',
        'gravity_drive',
        'plasma_scoring',
        'magen_defense_grid',
      ],
    })
    expect(fulfils(fulfilled, 0, 'diversify_research')).toBe(true)
  })

  it('erect_a_monument: spend 8 resources in the round', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 7 }), 0, 'erect_a_monument')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 8 }), 0, 'erect_a_monument')).toBe(true)
  })

  it('expand_borders: control 6 planets in non-home systems', () => {
    let s = toActionPhase()
    expect(fulfils(s, 0, 'expand_borders')).toBe(false)

    // On the duel map, bereg has 2 planets, quann has 1, sakulag has 1 (total 4 non-home)
    s = withPlanetOwner(s, 'bereg', 'bereg', 0)
    s = withPlanetOwner(s, 'bereg', 'lirta-iv', 0)
    s = withPlanetOwner(s, 'quann', 'quann', 0)
    s = withPlanetOwner(s, 'sakulag', 'sakulag', 0)
    s = withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0) // 5th non-home
    expect(fulfils(s, 0, 'expand_borders')).toBe(false)

    // Add a 6th non-home planet by creating a test system
    const withSix: GameState = {
      ...s,
      systems: {
        ...s.systems,
        extra: {
          id: 'extra',
          name: 'Extra',
          home: null,
          neighbours: [],
          space: [],
          activatedBy: [],
          wormhole: null,
          planets: [{
            id: 'extra-1',
            name: 'Extra 1',
            resources: 1,
            influence: 1,
            trait: null,
            techSkip: null,
            owner: 0,
            exhausted: false,
            ground: [],
            structures: [],
          }],
        },
      },
    }
    expect(fulfils(withSix, 0, 'expand_borders')).toBe(true)
  })

  it('found_research_outposts: control 3 planets that have technology specialties', () => {
    let s = toActionPhase()
    expect(fulfils(s, 0, 'found_research_outposts')).toBe(false)

    s = withPlanetProps(s, 'bereg', 'bereg', 0, null, 'blue')
    s = withPlanetProps(s, 'bereg', 'lirta-iv', 0, null, 'red')
    expect(fulfils(s, 0, 'found_research_outposts')).toBe(false)

    s = withPlanetProps(s, 'quann', 'quann', 0, null, 'yellow')
    expect(fulfils(s, 0, 'found_research_outposts')).toBe(true)
  })

  it('intimidate_council: have ships in 2 systems adjacent to Mecatol Rex', () => {
    let s = toActionPhase()
    // At setup, seat 0 has ships in home-n only (1 adjacent system to Mecatol) -> false
    expect(fulfils(s, 0, 'intimidate_council')).toBe(false)

    // Add ships to Bereg (2nd system adjacent to Mecatol) -> true
    const withTwo = withUnits(s, 'bereg', 0, ['cruiser'])
    expect(fulfils(withTwo, 0, 'intimidate_council')).toBe(true)

    // If home-n space is cleared, only Bereg remains -> false
    const oneOnly: GameState = {
      ...withTwo,
      systems: {
        ...withTwo.systems,
        'home-n': { ...withTwo.systems['home-n'], space: [] },
      },
    }
    expect(fulfils(oneOnly, 0, 'intimidate_council')).toBe(false)
  })

  it('lead_from_the_front: spend 3 tokens from tactic and/or strategy pools', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { tokensSpentThisRound: 2 }), 0, 'lead_from_the_front')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { tokensSpentThisRound: 3 }), 0, 'lead_from_the_front')).toBe(true)
  })

  it('negotiate_trade_routes: spend 5 trade goods', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { tradeGoodsSpentThisRound: 4 }), 0, 'negotiate_trade_routes')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { tradeGoodsSpentThisRound: 5 }), 0, 'negotiate_trade_routes')).toBe(true)
  })

  it('sway_the_council: spend 8 influence', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { influenceSpentThisRound: 7 }), 0, 'sway_the_council')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { influenceSpentThisRound: 8 }), 0, 'sway_the_council')).toBe(true)
  })
})

describe('Stage II public objectives (2 VP)', () => {
  it('centralize_galactic_trade: spend 10 trade goods', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { tradeGoodsSpentThisRound: 9 }), 0, 'centralize_galactic_trade')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { tradeGoodsSpentThisRound: 10 }), 0, 'centralize_galactic_trade')).toBe(true)
  })

  it("conquer_the_weak: control 1 planet in another player's home system", () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'conquer_the_weak')).toBe(false)

    // Seat 0 controls their own home planets -> not fulfilled
    expect(fulfils(withPlanetOwner(s, 'home-n', '000', 0), 0, 'conquer_the_weak')).toBe(false)

    // Seat 0 takes seat 1's home planet (wren-terra in home-s) -> fulfilled
    expect(fulfils(withPlanetOwner(s, 'home-s', 'wren-terra', 0), 0, 'conquer_the_weak')).toBe(true)
  })

  it('form_galactic_brain_trust: control 5 planets that have technology specialties', () => {
    let s = toActionPhase()
    expect(fulfils(s, 0, 'form_galactic_brain_trust')).toBe(false)

    s = withPlanetProps(s, 'bereg', 'bereg', 0, null, 'blue')
    s = withPlanetProps(s, 'bereg', 'lirta-iv', 0, null, 'red')
    s = withPlanetProps(s, 'quann', 'quann', 0, null, 'yellow')
    s = withPlanetProps(s, 'sakulag', 'sakulag', 0, null, 'green')
    expect(fulfils(s, 0, 'form_galactic_brain_trust')).toBe(false)

    s = withPlanetProps(s, 'home-n', '000', 0, null, 'blue')
    expect(fulfils(s, 0, 'form_galactic_brain_trust')).toBe(true)
  })

  it('found_a_golden_age: spend 16 resources', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 15 }), 0, 'found_a_golden_age')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { resourcesSpentThisRound: 16 }), 0, 'found_a_golden_age')).toBe(true)
  })

  it('galvanize_the_people: spend 6 tokens from tactic and/or strategy pools', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { tokensSpentThisRound: 5 }), 0, 'galvanize_the_people')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { tokensSpentThisRound: 6 }), 0, 'galvanize_the_people')).toBe(true)
  })

  it('manipulate_galactic_law: spend 16 influence', () => {
    const s = toActionPhase()
    expect(fulfils(withPlayer(s, 0, { influenceSpentThisRound: 15 }), 0, 'manipulate_galactic_law')).toBe(false)
    expect(fulfils(withPlayer(s, 0, { influenceSpentThisRound: 16 }), 0, 'manipulate_galactic_law')).toBe(true)
  })

  it('master_the_sciences: own 2 technologies in each of 4 colors', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'master_the_sciences')).toBe(false)

    // 2 in blue, red, green, but only 1 yellow
    const partial = withPlayer(s, 0, {
      techs: [
        'antimass_deflectors', 'gravity_drive',
        'plasma_scoring', 'magen_defense_grid',
        'neural_motivator', 'dacxive_animators',
        'sarween_tools',
      ],
    })
    expect(fulfils(partial, 0, 'master_the_sciences')).toBe(false)

    // Add 2nd yellow -> 2 in all 4 colors -> fulfilled
    const fulfilled = withPlayer(partial, 0, {
      techs: [
        'antimass_deflectors', 'gravity_drive',
        'plasma_scoring', 'magen_defense_grid',
        'neural_motivator', 'dacxive_animators',
        'sarween_tools', 'graviton_laser_system',
      ],
    })
    expect(fulfils(fulfilled, 0, 'master_the_sciences')).toBe(true)
  })

  it('revolutionize_warfare: own 3 unit upgrade technologies', () => {
    const s = toActionPhase()
    const two = withPlayer(s, 0, { techs: ['cruiser_ii', 'dreadnought_ii'] })
    expect(fulfils(two, 0, 'revolutionize_warfare')).toBe(false)

    const three = withPlayer(s, 0, { techs: ['cruiser_ii', 'dreadnought_ii', 'carrier_ii'] })
    expect(fulfils(three, 0, 'revolutionize_warfare')).toBe(true)
  })

  it('subdue_the_galaxy: control 11 planets in non-home systems', () => {
    const s = toActionPhase()
    expect(fulfils(s, 0, 'subdue_the_galaxy')).toBe(false)

    // Build state with 11 non-home controlled planets
    const dummyPlanets = Array.from({ length: 11 }, (_, i) => ({
      id: `nh-${i}`,
      name: `NonHome ${i}`,
      resources: 1,
      influence: 0,
      trait: null,
      techSkip: null,
      owner: 0,
      exhausted: false,
      ground: [],
      structures: [],
    }))
    const with11: GameState = {
      ...s,
      systems: {
        ...s.systems,
        nhSystem: {
          id: 'nhSystem',
          name: 'NH System',
          home: null,
          neighbours: [],
          space: [],
          activatedBy: [],
          wormhole: null,
          planets: dummyPlanets,
        },
      },
    }
    expect(fulfils(with11, 0, 'subdue_the_galaxy')).toBe(true)
  })

  it('unify_the_colonies: control 6 planets that each have the same planet trait', () => {
    let s = toActionPhase()
    expect(fulfils(s, 0, 'unify_the_colonies')).toBe(false)

    // 5 cultural planets
    const culturalPlanets = Array.from({ length: 5 }, (_, i) => ({
      id: `cult-${i}`,
      name: `Cultural ${i}`,
      resources: 1,
      influence: 1,
      trait: 'cultural' as PlanetTrait,
      techSkip: null,
      owner: 0,
      exhausted: false,
      ground: [],
      structures: [],
    }))
    let cultState: GameState = {
      ...s,
      systems: {
        ...s.systems,
        cultSys: {
          id: 'cultSys',
          name: 'Cultural Sys',
          home: null,
          neighbours: [],
          space: [],
          activatedBy: [],
          wormhole: null,
          planets: culturalPlanets,
        },
      },
    }
    expect(fulfils(cultState, 0, 'unify_the_colonies')).toBe(false)

    // Add 6th cultural planet
    cultState = {
      ...cultState,
      systems: {
        ...cultState.systems,
        cultSys: {
          ...cultState.systems.cultSys,
          planets: [
            ...culturalPlanets,
            {
              id: 'cult-5',
              name: 'Cultural 5',
              resources: 1,
              influence: 1,
              trait: 'cultural',
              techSkip: null,
              owner: 0,
              exhausted: false,
              ground: [],
              structures: [],
            },
          ],
        },
      },
    }
    expect(fulfils(cultState, 0, 'unify_the_colonies')).toBe(true)
  })
})

describe('scoring and deck setup', () => {
  it('shuffledObjectives builds a deck of 5 Stage I followed by 5 Stage II objectives', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const order = shuffledObjectives(seed)
      expect(order).toHaveLength(10)
      const stage1Part = order.slice(0, 5)
      const stage2Part = order.slice(5, 10)

      // All 5 first are Stage 1
      for (const id of stage1Part) {
        expect(objectiveDef(id)?.stage).toBe('stage1')
      }
      // All 5 second are Stage 2
      for (const id of stage2Part) {
        expect(objectiveDef(id)?.stage).toBe('stage2')
      }
      // All 10 are unique
      expect(new Set(order).size).toBe(10)
    }
  })

  it('different seeds produce different deck orders', () => {
    const order1 = shuffledObjectives(10)
    const order2 = shuffledObjectives(20)
    expect(order1).not.toEqual(order2)
  })

  it('createGame reveals 1 Stage I objective at setup', () => {
    const game = createGame(DUEL_CONFIG, 7)
    expect(game.objectiveOrder).toHaveLength(10)
    expect(game.publicObjectives).toEqual([game.objectiveOrder[0]])
    expect(objectiveDef(game.publicObjectives[0])?.stage).toBe('stage1')
  })

  it('scoreObjective adds 1 VP for Stage I and 2 VP for Stage II', () => {
    const s = deepFreeze({
      ...toActionPhase(),
      publicObjectives: ['erect_a_monument', 'found_a_golden_age'],
    })

    // Stage I gives 1 VP
    const scored1 = scoreObjective(s, 0, 'erect_a_monument')
    expect(scored1.players[0].vp).toBe(1)
    expect(scored1.players[0].scoredObjectives).toEqual(['erect_a_monument'])

    // Stage II gives 2 VP
    const scored2 = scoreObjective(scored1, 0, 'found_a_golden_age')
    expect(scored2.players[0].vp).toBe(3) // 1 + 2 = 3
    expect(scored2.players[0].scoredObjectives).toEqual(['erect_a_monument', 'found_a_golden_age'])
    expect(s.players[0].vp).toBe(0) // pure, unmutated
  })

  it('scoreable filters fulfilled, revealed, and unscored objectives', () => {
    const base = toActionPhase()
    const s = deepFreeze({
      ...withPlayer(base, 0, {
        resourcesSpentThisRound: 8,
        influenceSpentThisRound: 8,
      }),
      publicObjectives: ['erect_a_monument', 'sway_the_council', 'negotiate_trade_routes'],
    })

    // 0 has spent 8 resources and 8 influence, but 0 trade goods
    expect(scoreable(s, 0)).toEqual(['erect_a_monument', 'sway_the_council'])

    // Once erect_a_monument is scored, only sway_the_council remains
    const scored = withPlayer(s, 0, { scoredObjectives: ['erect_a_monument'] })
    expect(scoreable(scored, 0)).toEqual(['sway_the_council'])
  })

  it('controlsMecatol is true only when controlling a planet on Mecatol Rex', () => {
    const s = toActionPhase()
    expect(controlsMecatol(s, 0)).toBe(false)
    expect(controlsMecatol(withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0), 0)).toBe(true)
    expect(controlsMecatol(withPlanetOwner(s, 'mecatol', 'mecatol-rex', 0), 1)).toBe(false)
  })
})
