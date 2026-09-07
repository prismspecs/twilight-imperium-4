import { describe, expect, it } from 'vitest'
import { capacity, cheapestPayment, fleetPoolLimit, nonFighterShips, payCost, productionCost, productionLimit, readyResources } from './economy'
import { applyMove } from './index'
import { createGame } from './setup'
import { deepFreeze, toActionPhase, withCards, withPlanetOwner, withPlayer, withTactical } from './testUtils'
import type { GameConfig, GameState, Result } from './types'

const config: GameConfig = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 }

describe('R4.4 economy helpers', () => {
  const g = createGame(config, 1)
  it('ready resources sum controlled ready planets', () => {
    expect(readyResources(g, 0)).toBe(5)
    expect(readyResources(g, 1)).toBe(6)
  })
  it('payCost exhausts planets and spends trade goods, overpay is lost', () => {
    const s = { ...g, players: [g.players[0], { ...g.players[1], tradeGoods: 3 }] as typeof g.players }
    const r = payCost(s, 1, 5, ['arc-prime'], 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.systems['home-s'].planets[0].exhausted).toBe(true)
    expect(r.value.players[1].tradeGoods).toBe(1)
    expect(g.systems['home-s'].planets[0].exhausted).toBe(false)
  })
  it('payCost fails when the payment is short or a planet is not ready', () => {
    expect(payCost(g, 1, 5, ['arc-prime'], 0).ok).toBe(false)
    const exhausted = payCost(g, 1, 4, ['arc-prime'], 0)
    if (!exhausted.ok) throw new Error(exhausted.error)
    expect(payCost(exhausted.value, 1, 1, ['arc-prime'], 0).ok).toBe(false)
    expect(payCost(g, 0, 1, ['arc-prime'], 0).ok).toBe(false)   // not controlled by seat 0
  })
  it('cheapestPayment finds combinations of planets and trade goods', () => {
    // Seat 0 starts with '000' (5 resources). Cost 6 is not coverable by planets alone.
    expect(cheapestPayment(g, 0, 6)).toBeNull()
    // With 1 trade good, 5 + 1 = 6 resources:
    const withTg = withPlayer(g, 0, { tradeGoods: 1 })
    const pay = cheapestPayment(withTg, 0, 6)
    expect(pay).not.toBeNull()
    expect(pay?.planets).toEqual(['000'])
    expect(pay?.tradeGoods).toBe(1)

    // With 6 trade goods and exhausted planet, covers purely with trade goods:
    const exhausted000 = {
      ...g,
      systems: {
        ...g.systems,
        'home-n': {
          ...g.systems['home-n'],
          planets: g.systems['home-n'].planets.map(p => ({ ...p, exhausted: true })),
        },
      },
    }
    const with6Tg = withPlayer(exhausted000, 0, { tradeGoods: 6 })
    const payTgOnly = cheapestPayment(with6Tg, 0, 6)
    expect(payTgOnly).not.toBeNull()
    expect(payTgOnly?.planets).toEqual([])
    expect(payTgOnly?.tradeGoods).toBe(6)
  })
  it('productionCost pairs fighters and infantry and applies Sarween Tools', () => {
    const owner = { faction: 'letnev' as const, techs: [] as string[] }
    expect(productionCost({ fighter: 2, infantry: 2, dreadnought: 1 }, owner, false)).toBe(6)
    expect(productionCost({ fighter: 3 }, owner, false)).toBe(2)
    expect(productionCost({ fighter: 1, cruiser: 1 }, owner, true)).toBe(2)
    expect(productionCost({}, owner, true)).toBe(0)
  })
  it('productionLimit is planet resources plus the dock bonus', () => {
    expect(productionLimit(g, 0, 'home-n')).toBe(7)
    expect(productionLimit(g, 1, 'home-s')).toBe(6)
    expect(productionLimit(g, 0, 'home-s')).toBe(0)
    const dock2 = { ...g, players: [{ ...g.players[0], techs: [...g.players[0].techs, 'space_dock_ii'] }, g.players[1]] as typeof g.players }
    expect(productionLimit(dock2, 0, 'home-n')).toBe(9)
  })
  it('fleet pool, non-fighter count and capacity', () => {
    expect(fleetPoolLimit(g.players[0])).toBe(3)
    expect(fleetPoolLimit(g.players[1])).toBe(5)
    expect(nonFighterShips(g.systems['home-n'].space, 0)).toBe(2)
    expect(capacity(g.systems['home-n'].space, 0, { faction: 'l1z1x', techs: [] })).toBe(6)   // super-dreadnought 2 + carrier 4
    expect(capacity(g.systems['home-s'].space, 1, { faction: 'letnev', techs: [] })).toBe(5)   // dreadnought 1 + carrier 4
  })
  it('nonFighterShips and capacity only count the requested owner in a mixed-owner array', () => {
    const mixed = [...g.systems['home-n'].space, ...g.systems['home-s'].space]
    expect(nonFighterShips(mixed, 0)).toBe(2)
    expect(nonFighterShips(mixed, 1)).toBe(3)
    expect(capacity(mixed, 0, { faction: 'l1z1x', techs: [] })).toBe(6)
    expect(capacity(mixed, 1, { faction: 'letnev', techs: [] })).toBe(5)
  })
  it('payCost fails for an unknown planet id', () => {
    expect(payCost(g, 0, 1, ['not-a-planet'], 0).ok).toBe(false)
  })
})

// a move carries its trade good count from outside the engine. `NaN` passes every `<` and `>` comparison and a
// numeric string turns the payment sums into string concatenation, so both must be rejected on shape.
describe('a caller-supplied trade good count must be a non-negative integer', () => {
  const BAD: [string, number][] = [['NaN', NaN], ["the string '1'", '1' as unknown as number]]
  const value = (r: Result<GameState>): GameState => {
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
  /** The emergency shipyard is only legal without a space dock, so the seat's docks come off the board first. */
  const withoutDocks = (state: GameState, seat: 0 | 1): GameState => deepFreeze({
    ...state,
    systems: Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
      ...sys, planets: sys.planets.map(p => ({ ...p, structures: p.structures.filter(u => !(u.type === 'spacedock' && u.owner === seat)) })),
    }])),
  })

  it('payCost rejects them before it compares', () => {
    const fresh = createGame(config, 1)
    for (const [, bad] of BAD) expect(payCost(fresh, 0, 1, ['000'], bad).ok).toBe(false)
    expect(payCost(fresh, 0, 1, ['000'], 1.5).ok).toBe(false)
    expect(payCost(fresh, 0, 1, ['000'], 0).ok).toBe(true)
  })

  for (const [label, bad] of BAD) {
    it(`R4.4: produce rejects ${label} as trade goods`, () => {
      const s = withTactical(toActionPhase(), { systemId: 'home-n', step: 'production' })
      expect(applyMove(s, { type: 'produce', units: { infantry: 2 }, planets: [], tradeGoods: bad }, 0).ok).toBe(false)
    })
    it(`R6: the emergency shipyard rejects ${label} as trade goods`, () => {
      const s = withoutDocks(toActionPhase(), 0)
      expect(applyMove(s, { type: 'shipyard', planetId: '000', planets: [], tradeGoods: bad }, 0).ok).toBe(false)
    })
    it(`R5/R6: the Technology primary and secondary reject ${label} as trade goods`, () => {
      const s = withPlayer(withCards(withCards(toActionPhase(), 1, []), 0, ['technology']), 0, { tradeGoods: 1 })
      const primary = { techId: 'antimass_deflectors', secondTechId: 'gravity_drive', planets: [], tradeGoods: bad }
      expect(applyMove(s, { type: 'strategic', card: 'technology', params: primary }, 0).ok).toBe(false)
      const played = value(applyMove(s, { type: 'strategic', card: 'technology' }, 0))
      const answer = { techId: 'sarween_tools', planets: [], tradeGoods: bad }
      expect(applyMove(played, { type: 'secondary', card: 'technology', accept: true, params: answer }, 0).ok).toBe(false)
    })
    it(`R6: the Leadership primary rejects ${label} as trade goods`, () => {
      let s = withCards(withCards(toActionPhase(), 1, []), 0, ['leadership'])
      s = withPlanetOwner(s, 'bereg', 'lirta-iv', 0)      // 3 influence, so a string count would concatenate to 31
      s = withPlayer(s, 0, { tradeGoods: 1 })
      expect(applyMove(s, { type: 'strategic', card: 'leadership', params: { planets: ['lirta-iv'], tradeGoods: bad } }, 0).ok).toBe(false)
    })
  }
})
