import { describe, expect, it } from 'vitest'
import { SYSTEMS, TRADE_POSTS, systemDef } from '../data/map'
import { adjacent, distance, neighbours } from './adjacency'
import type { System } from './types'

/** A systems map built from the static duel map, matching what createGame now stores (with neighbours). */
const systems: Record<string, System> = Object.fromEntries(
  SYSTEMS.map(def => [def.id, { id: def.id, name: def.name, planets: [], wormhole: def.wormhole, neighbours: def.neighbours, home: def.home, space: [], activatedBy: [] }]),
)

describe('R1 map Bereg Standoff', () => {
  it('has seven systems with the printed planet values', () => {
    expect(SYSTEMS).toHaveLength(7)
    expect(systemDef('home-n').planets).toEqual([{ id: '000', name: '[0.0.0]', resources: 5, influence: 0 }])
    expect(systemDef('home-s').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Arc Prime', 4, 0], ['Wren Terra', 2, 1]])
    expect(systemDef('bereg').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Bereg', 3, 1], ['Lirta IV', 2, 3]])
    expect(systemDef('starpoint').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Starpoint', 3, 1], ['Centauri', 2, 3]])
    expect(systemDef('sakulag').planets[0]).toMatchObject({ resources: 2, influence: 1 })
    expect(systemDef('quann').planets[0]).toMatchObject({ resources: 2, influence: 1 })
    expect(systemDef('mecatol').planets[0]).toMatchObject({ name: 'Mecatol Rex', resources: 1, influence: 6 })
  })
  it('marks wormholes and homes', () => {
    expect(systemDef('bereg').wormhole).toBe('alpha')
    expect(systemDef('starpoint').wormhole).toBe('alpha')
    expect(systemDef('sakulag').wormhole).toBe('beta')
    expect(systemDef('quann').wormhole).toBe('beta')
    expect(systemDef('home-n').home).toBe(0)
    expect(systemDef('home-s').home).toBe(1)
  })
  it('R1 adjacency: the centre touches all six ring systems', () => {
    for (const id of ['home-n', 'bereg', 'sakulag', 'quann', 'starpoint', 'home-s']) expect(adjacent(systems, 'mecatol', id)).toBe(true)
  })
  it('R1 adjacency: ring neighbours and non-neighbours', () => {
    expect(adjacent(systems, 'home-n', 'bereg')).toBe(true)
    expect(adjacent(systems, 'home-n', 'sakulag')).toBe(true)
    expect(adjacent(systems, 'home-n', 'home-s')).toBe(false)
    expect(adjacent(systems, 'bereg', 'quann')).toBe(true)
    expect(adjacent(systems, 'quann', 'home-s')).toBe(true)
    expect(adjacent(systems, 'home-s', 'starpoint')).toBe(true)
    expect(adjacent(systems, 'starpoint', 'sakulag')).toBe(true)
    expect(adjacent(systems, 'bereg', 'sakulag')).toBe(false)
  })
  it('R1 adjacency: alpha wormhole links bereg and starpoint, beta links sakulag and quann', () => {
    expect(adjacent(systems, 'bereg', 'starpoint')).toBe(true)
    expect(adjacent(systems, 'sakulag', 'quann')).toBe(true)
    expect(neighbours(systems, 'bereg').sort()).toEqual(['home-n', 'mecatol', 'quann', 'starpoint'])
  })
  it('distance uses wormholes', () => {
    expect(distance(systems, 'home-n', 'home-s')).toBe(2)
    expect(distance(systems, 'bereg', 'starpoint')).toBe(1)
    expect(distance(systems, 'home-n', 'home-n')).toBe(0)
  })
  it('R8 trade posts link the flank systems', () => {
    expect(TRADE_POSTS).toEqual({ west: ['sakulag', 'starpoint'], east: ['bereg', 'quann'] })
  })
})
