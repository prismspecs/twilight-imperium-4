import { describe, expect, it } from 'vitest'
import { adjacent, distance, neighbours } from './adjacency'
import type { System } from './types'

/** A synthetic hex map (radius 2, Mecatol at the centre) exercising the same adjacency code the generated
 * galaxy uses. No duel-only flower map here: the base game generates its own map from the tile catalogue. */
const systems: Record<string, System> = {
  mecatol: { id: 'mecatol', name: 'Mecatol Rex', planets: [], wormhole: null, neighbours: ['a', 'b', 'c', 'd', 'e', 'f'], home: null, space: [], activatedBy: [] },
  a: { id: 'a', name: 'A', planets: [], wormhole: null, neighbours: ['mecatol', 'b', 'f'], home: null, space: [], activatedBy: [] },
  b: { id: 'b', name: 'B', planets: [], wormhole: null, neighbours: ['mecatol', 'a', 'c'], home: null, space: [], activatedBy: [] },
  c: { id: 'c', name: 'C', planets: [], wormhole: null, neighbours: ['mecatol', 'b', 'd'], home: null, space: [], activatedBy: [] },
  d: { id: 'd', name: 'D', planets: [], wormhole: null, neighbours: ['mecatol', 'c', 'e'], home: null, space: [], activatedBy: [] },
  e: { id: 'e', name: 'E', planets: [], wormhole: null, neighbours: ['mecatol', 'd', 'f'], home: null, space: [], activatedBy: [] },
  f: { id: 'f', name: 'F', planets: [], wormhole: null, neighbours: ['mecatol', 'a', 'e'], home: null, space: [], activatedBy: [] },
  alphaA: { id: 'alphaA', name: 'AlphaA', planets: [], wormhole: 'alpha', neighbours: ['alphaB'], home: null, space: [], activatedBy: [] },
  alphaB: { id: 'alphaB', name: 'AlphaB', planets: [], wormhole: 'alpha', neighbours: ['alphaA'], home: null, space: [], activatedBy: [] },
}

describe('R1 adjacency: the centre touches every ring system', () => {
  it('is adjacent to all six ring systems', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(adjacent(systems, 'mecatol', id)).toBe(true)
  })
  it('ring neighbours are adjacent, non-neighbours are not', () => {
    expect(adjacent(systems, 'a', 'b')).toBe(true)
    expect(adjacent(systems, 'a', 'f')).toBe(true)
    expect(adjacent(systems, 'a', 'c')).toBe(false)
    expect(adjacent(systems, 'a', 'd')).toBe(false)
    expect(adjacent(systems, 'a', 'e')).toBe(false)
  })
  it('distance uses wormholes', () => {
    expect(distance(systems, 'a', 'd')).toBe(2)
    expect(distance(systems, 'a', 'a')).toBe(0)
  })
  it('alpha wormholes link the two alpha systems', () => {
    expect(adjacent(systems, 'alphaA', 'alphaB')).toBe(true)
    expect(neighbours(systems, 'alphaA').sort()).toEqual(['alphaB'])
  })
  it('Quantum Entanglement: Ghosts of Creuss connects delta wormholes to alpha and beta wormholes', () => {
    const creussSystems: Record<string, System> = {
      ...systems,
      'creuss-gate': { id: 'creuss-gate', name: 'Creuss Gate', planets: [], wormhole: 'delta', neighbours: ['alphaA'], home: null, space: [], activatedBy: [] },
      'creuss-home': { id: 'creuss-home', name: 'Creuss', planets: [], wormhole: 'delta', neighbours: [], home: 0, space: [], activatedBy: [] },
    }
    // For non-Creuss: delta only connects to delta
    expect(adjacent(creussSystems, 'creuss-gate', 'creuss-home')).toBe(true)
    expect(adjacent(creussSystems, 'creuss-gate', 'alphaA')).toBe(false)
    expect(adjacent(creussSystems, 'creuss-gate', 'alphaB')).toBe(false)
    // For Creuss: delta connects to alpha
    expect(adjacent(creussSystems, 'creuss-gate', 'alphaA', 'creuss')).toBe(true)
    expect(adjacent(creussSystems, 'creuss-gate', 'alphaB', 'creuss')).toBe(true)
    expect(adjacent(creussSystems, 'creuss-home', 'alphaA', 'creuss')).toBe(true)
    // And vice-versa: alpha systems connect to delta systems for Creuss
    expect(adjacent(creussSystems, 'alphaA', 'creuss-home', 'creuss')).toBe(true)
    expect(adjacent(creussSystems, 'alphaB', 'creuss-home', 'creuss')).toBe(true)
    expect(adjacent(creussSystems, 'alphaA', 'creuss-home', 'letnev')).toBe(false)
  })
})