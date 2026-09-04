import { describe, expect, it } from 'vitest'
import { POSTS, POST_IDS } from '../data/posts'
import { unitStats } from '../data/units'
import { ALL_STRATEGY_CARDS, GUARDIAN_FLEETS, createGame, rollGuardianFleet, unitsOf } from './setup'
import { deepFreeze } from './testUtils'
import type { GameConfig, UnitType } from './types'

const config: GameConfig = {
  players: [{ faction: 'l1z1x', color: 'blue', name: 'Despot' }, { faction: 'letnev', color: 'red', name: 'Kael' }],
  speaker: 0,
}

const count = (units: { type: UnitType }[], type: UnitType) => units.filter(u => u.type === type).length

describe('R2 setup', () => {
  const g = createGame(config, 1)
  it('starts in round 1 strategy phase with the speaker to pick and all six cards in the pool', () => {
    expect(g.round).toBe(1); expect(g.phase).toBe('strategy'); expect(g.active).toBe(0)
    expect(g.draft).toEqual([0, 1, 1, 0])
    expect(g.strategyPool.map(c => c.id)).toEqual(ALL_STRATEGY_CARDS)
    expect(g.publicObjectives).toEqual([g.objectiveOrder[0]])   // R7: the pool is shuffled per game
  })
  it('places the printed starting units', () => {
    const north = g.systems['home-n'], south = g.systems['home-s']
    expect(count(north.space, 'dreadnought')).toBe(1); expect(count(north.space, 'carrier')).toBe(1); expect(count(north.space, 'fighter')).toBe(3)
    expect(count(north.planets[0].ground, 'infantry')).toBe(5)
    expect(north.planets[0].structures.map(u => u.type).sort()).toEqual(['pds', 'spacedock'])
    expect(count(south.space, 'dreadnought')).toBe(1); expect(count(south.space, 'carrier')).toBe(1); expect(count(south.space, 'destroyer')).toBe(1); expect(count(south.space, 'fighter')).toBe(1)
    expect(count(south.planets[0].ground, 'infantry')).toBe(2); expect(count(south.planets[1].ground, 'infantry')).toBe(1)
    expect(south.planets[0].structures.map(u => u.type)).toEqual(['spacedock'])
    expect(north.planets[0].owner).toBe(0); expect(south.planets[1].owner).toBe(1)
  })
  it('gives starting techs, tokens, commodities and reinforcements', () => {
    expect(g.players[0].techs).toEqual(['neural_motivator', 'plasma_scoring'])
    expect(g.players[1].techs).toEqual(['antimass_deflectors', 'plasma_scoring'])
    expect(g.players[0].tokens).toEqual({ tactic: 3, fleet: 3, strategy: 2 })
    expect(g.players[0].commodities).toBe(2); expect(g.players[0].tradeGoods).toBe(0)
    expect(g.players[0].reinforcements.infantry).toBe(7); expect(g.players[0].reinforcements.pds).toBe(5); expect(g.players[1].reinforcements.pds).toBe(6)
  })
  it('unit ids are unique across the map', () => {
    const ids = [...unitsOf(g, 0), ...unitsOf(g, 1), ...unitsOf(g, 'guardian')].map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(g.nextUnitId).toBe(Math.max(...ids) + 1)
  })
})

describe('R8 trade posts', () => {
  it('rolls two different posts, the same pair for the same seed', () => {
    const a = createGame(config, 7)
    const b = createGame(config, 7)
    expect(POST_IDS).toContain(a.posts.west)
    expect(POST_IDS).toContain(a.posts.east)
    expect(a.posts.west).not.toBe(a.posts.east)
    expect(b.posts).toEqual(a.posts)
    expect(a.postAbilityUsed).toEqual({ west: false, east: false })
  })
  it('different seeds produce different pairs, and the roll is logged', () => {
    const pairs = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame(config, seed)
      expect(g.posts.west).not.toBe(g.posts.east)
      pairs.add(`${g.posts.west}/${g.posts.east}`)
      expect(g.log.some(e => e.t === 'info' && e.text.includes(POSTS[g.posts.west].name))).toBe(true)
    }
    expect(pairs.size).toBeGreaterThan(1)
  })
  it('every one of the six posts is reachable on both sides', () => {
    const west = new Set<string>()
    const east = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      const g = createGame(config, seed)
      west.add(g.posts.west)
      east.add(g.posts.east)
    }
    expect(west.size).toBe(POST_IDS.length)
    expect(east.size).toBe(POST_IDS.length)
  })
})

describe('R4.2 guardian fleet', () => {
  it('every table entry costs exactly 8', () => {
    for (const fleet of GUARDIAN_FLEETS) {
      const cost = (Object.entries(fleet) as [UnitType, number][]).reduce((sum, [type, n]) => {
        const s = unitStats(type, 'guardian'); return sum + (n / s.producedPerCost) * s.cost
      }, 0)
      expect(cost).toBe(8)
    }
    expect(GUARDIAN_FLEETS).toHaveLength(6)
  })
  it('createGame places no units on Mecatol Rex and sets custodiansToken to true', () => {
    const g = createGame(config, 5)
    const space = g.systems.mecatol.space
    expect(space).toHaveLength(0)
    expect(g.systems.mecatol.planets[0].ground).toHaveLength(0)
    expect(g.systems.mecatol.planets[0].owner).toBeNull()
    expect(g.custodiansToken).toBe(true)
  })
  it('rolling is seeded and replaces the previous fleet', () => {
    const a = createGame(config, 11)
    const rolled = rollGuardianFleet(a, 99)
    expect(rolled.guardianRolls).toBe(1)
    expect(rolled.systems.mecatol.space.every(u => u.owner === 'guardian')).toBe(true)
    expect(count(rolled.systems.mecatol.planets[0].ground, 'infantry')).toBe(2)
    expect(a.guardianRolls).toBe(0)   // input not mutated
  })
  it('R4.2 keeps non-guardian ships and ground forces on Mecatol Rex when the fleet is rerolled', () => {
    const g = createGame(config, 5)
    const mecatol = g.systems.mecatol
    const seatDestroyer = { id: g.nextUnitId, type: 'destroyer' as UnitType, owner: 0 as const, damaged: false }
    const seatInfantry = { id: g.nextUnitId + 1, type: 'infantry' as UnitType, owner: 0 as const, damaged: false }
    const withIntruders = {
      ...g,
      systems: {
        ...g.systems,
        mecatol: {
          ...mecatol,
          space: [...mecatol.space, seatDestroyer],
          planets: [{ ...mecatol.planets[0], ground: [...mecatol.planets[0].ground, seatInfantry] }],
        },
      },
    }
    const rerolled = rollGuardianFleet(withIntruders, 42)
    expect(rerolled.systems.mecatol.space).toContainEqual(seatDestroyer)
    expect(rerolled.systems.mecatol.planets[0].ground).toContainEqual(seatInfantry)
    const oldGuardianIds = new Set(mecatol.space.map(u => u.id))
    expect(rerolled.systems.mecatol.space.filter(u => u.owner === 'guardian').some(u => oldGuardianIds.has(u.id))).toBe(false)
    expect(count(rerolled.systems.mecatol.planets[0].ground, 'infantry')).toBe(3)   // 2 new guardians + the seat-0 infantry
  })
  it('rollGuardianFleet succeeds on a deep-frozen state', () => {
    const g = deepFreeze(createGame(config, 1))
    const rerolled = rollGuardianFleet(g, 2)
    expect(rerolled.systems.mecatol.space.length).toBeGreaterThan(0)
    expect(rerolled.systems.mecatol.space.every(u => u.owner === 'guardian')).toBe(true)
  })
})

describe('N-player galaxy setup', () => {
  const three: GameConfig = {
    players: [
      { faction: 'l1z1x', color: 'blue', name: 'A' },
      { faction: 'sol', color: 'red', name: 'B' },
      { faction: 'hacan', color: 'yellow', name: 'C' },
    ],
    speaker: 0,
  }
  const six: GameConfig = {
    players: [
      { faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' },
      { faction: 'sol', color: 'yellow', name: 'C' }, { faction: 'saar', color: 'green', name: 'D' },
      { faction: 'hacan', color: 'purple', name: 'E' }, { faction: 'mentak', color: 'black', name: 'F' },
    ],
    speaker: 0,
  }

  it('builds a generated galaxy with one home system per seat for 3 and 6 players', () => {
    const g3 = createGame(three, 1)
    expect(Object.keys(g3.systems)).toHaveLength(34)   // radius-3 hex minus the three empty corners
    expect(g3.players).toHaveLength(3)
    for (const seat of [0, 1, 2]) expect(g3.systems[`home-${seat}`], `home-${seat}`).toBeDefined()

    const g6 = createGame(six, 1)
    expect(Object.keys(g6.systems)).toHaveLength(37)
    expect(g6.players).toHaveLength(6)
    for (const seat of [0, 1, 2, 3, 4, 5]) expect(g6.systems[`home-${seat}`]).toBeDefined()
  })

  it('places each faction printed starting units on its generated home', () => {
    const g = createGame(three, 1)
    const sol = g.systems['home-1']   // seat 1 is the Federation of Sol
    expect(sol.planets.map(p => p.id)).toEqual(['jord'])
    expect(count(sol.space, 'carrier')).toBe(2)
    expect(count(sol.space, 'destroyer')).toBe(1)
    expect(count(sol.space, 'fighter')).toBe(3)
    expect(count(sol.planets[0].ground, 'infantry')).toBe(5)
    expect(sol.planets[0].structures.map(u => u.type)).toEqual(['spacedock'])
    expect(sol.planets[0].owner).toBe(1)
    // l1z1x home (seat 0) uses the canonical catalogue planet id, not the duel map '000'
    const l1z1xHome = g.systems['home-0']
    expect(l1z1xHome.planets.map(p => p.id)).toEqual(['0.0.0'])
    expect(count(l1z1xHome.planets[0].ground, 'infantry')).toBe(5)
  })

  it('is deterministic in the seed and starts in the strategy phase with a snake draft', () => {
    expect(createGame(three, 7).systems).toEqual(createGame(three, 7).systems)
    const g = createGame(three, 7)
    expect(g.phase).toBe('strategy')
    expect(g.draft).toEqual([0, 1, 2, 2, 1, 0])   // snake draft over three seats, two picks each
  })
})
