import { describe, expect, it } from 'vitest'
import { homeSystemOf } from './board'
import { applyMove } from './index'
import { fulfils } from './objectives'
import { deepFreeze, SAAR_CONFIG, toActionPhase, withCards, withUnits } from './testUtils'
import type { GameState } from './types'

/**
 * Saar's space dock is a Floating Factory: a unique unit that lives in a system's space area (never on a
 * planet) and moves like a 1-move ship. docs/superpowers/plans/2026-09-08-saar-floating-factory.md.
 */
describe('Saar Floating Factory', () => {
  it('is placed in the home system\'s space area at setup, not on a planet', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    expect(s.systems[home].space.some(u => u.type === 'floating_factory' && u.owner === 0)).toBe(true)
    expect(s.systems[home].planets.every(p => !p.structures.some(u => u.type === 'floating_factory'))).toBe(true)
  })

  it('can move like a ship into an adjacent system', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    const dest = s.systems[home].neighbours[0]
    const ffId = s.systems[home].space.find(u => u.type === 'floating_factory')!.id
    const started = applyMove(s, { type: 'startTactical', systemId: dest }, 1)
    if (!started.ok) throw new Error(started.error)
    const moved = applyMove(started.value, { type: 'moveShips', moves: [{ unitId: ffId, from: home, carrying: [] }] }, 1)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.value.systems[dest].space.some(u => u.id === ffId)).toBe(true)
    expect(moved.value.systems[home].space.some(u => u.id === ffId)).toBe(false)
  })

  it('does not count toward the fleet pool: it can join ships already at the pool limit', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    const dest = s.systems[home].neighbours[0]
    // seat 0's fleet pool is 3 (printed command sheet); fill the destination with exactly 3 non-fighter ships.
    const withFleet = withUnits(withUnits(withUnits(s, dest, 0, ['cruiser']), dest, 0, ['cruiser']), dest, 0, ['cruiser'])
    const ffId = withFleet.systems[home].space.find(u => u.type === 'floating_factory')!.id
    const started = applyMove(withFleet, { type: 'startTactical', systemId: dest }, 1)
    if (!started.ok) throw new Error(started.error)
    const moved = applyMove(started.value, { type: 'moveShips', moves: [{ unitId: ffId, from: home, carrying: [] }] }, 1)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.value.systems[dest].space.filter(u => u.owner === 0 && u.type === 'floating_factory')).toHaveLength(1)
  })

  it('produces from the space area, and defaults produced ground forces to the space area too', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    const started = applyMove(s, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)
    const moved = applyMove(started.value, { type: 'endMovement' }, 1)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.value.tactical?.step).toBe('production')
    const homePlanet = moved.value.systems[home].planets.find(p => p.owner === 0)!
    const produced = applyMove(moved.value, { type: 'produce', units: { infantry: 1 }, planets: [homePlanet.id], tradeGoods: 0 }, 1)
    if (!produced.ok) throw new Error(produced.error)
    expect(produced.value.systems[home].space.some(u => u.type === 'infantry' && u.owner === 0)).toBe(true)
  })

  it('places produced ground forces on a named controlled planet instead, when asked', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    const started = applyMove(s, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)
    const moved = applyMove(started.value, { type: 'endMovement' }, 1)
    if (!moved.ok) throw new Error(moved.error)
    const homePlanet = moved.value.systems[home].planets.find(p => p.owner === 0)!
    const produced = applyMove(moved.value, { type: 'produce', units: { infantry: 1 }, planets: [homePlanet.id], tradeGoods: 0, groundTo: homePlanet.id }, 1)
    if (!produced.ok) throw new Error(produced.error)
    expect(produced.value.systems[home].planets.find(p => p.id === homePlanet.id)!.ground.some(u => u.type === 'infantry' && u.owner === 0)).toBe(true)
  })

  it('R6 Construction places it in the space area of a system the seat controls a planet in, at most once per system', () => {
    const s = withCards(toActionPhase(1, 0, SAAR_CONFIG), 0, ['construction'])
    const home = homeSystemOf(s, 0)
    // strip the starting Floating Factory so Construction has one free to place
    const stripped = deepFreeze({
      ...s,
      systems: { ...s.systems, [home]: { ...s.systems[home], space: s.systems[home].space.filter(u => u.type !== 'floating_factory') } },
      players: s.players.map((p, i) => i === 0 ? { ...p, reinforcements: { ...p.reinforcements, floating_factory: 3 } } : p) as GameState['players'],
    })
    const homePlanet = stripped.systems[home].planets.find(p => p.owner === 0)!
    const played = applyMove(stripped, { type: 'strategic', card: 'construction', params: { structures: [{ planetId: homePlanet.id, type: 'spacedock' }] } }, 1)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems[home].space.some(u => u.type === 'floating_factory' && u.owner === 0)).toBe(true)
    expect(played.value.systems[home].planets.every(p => !p.structures.some(u => u.type === 'floating_factory'))).toBe(true)
    // a second one in the same system is rejected
    const again = withCards(played.value, 0, ['construction'])
    const rejected = applyMove(again, { type: 'strategic', card: 'construction', params: { structures: [{ planetId: homePlanet.id, type: 'spacedock' }] } }, 1)
    expect(rejected.ok).toBe(false)
  })

  it('lrr-factions.md 2129/2131: is destroyed when another seat\'s ships arrive and it has no escort of its own', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    // strand the Floating Factory alone: remove Saar's other starting ships from home
    const alone = deepFreeze({
      ...s,
      systems: { ...s.systems, [home]: { ...s.systems[home], space: s.systems[home].space.filter(u => u.type === 'floating_factory') } },
    })
    const withEnemy = withUnits(alone, home, 1, ['cruiser'])
    const started = applyMove({ ...withEnemy, active: 1 }, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)
    const enemyShipId = started.value.systems[home].space.find(u => u.owner === 1 && u.type === 'cruiser')
    // move the enemy cruiser in from a neighbouring system it was never actually in — set up a fresh origin instead
    const origin = started.value.systems[home].neighbours[0]
    const relocated = deepFreeze({
      ...started.value,
      systems: {
        ...started.value.systems,
        [home]: { ...started.value.systems[home], space: started.value.systems[home].space.filter(u => u.id !== enemyShipId?.id) },
        [origin]: { ...started.value.systems[origin], space: [...started.value.systems[origin].space, ...(enemyShipId ? [enemyShipId] : [])] },
      },
    })
    const moved = applyMove(relocated, { type: 'moveShips', moves: enemyShipId ? [{ unitId: enemyShipId.id, from: origin, carrying: [] }] : [] }, 1)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.value.systems[home].space.some(u => u.type === 'floating_factory')).toBe(false)
  })

  it('lrr-factions.md 2112/2114: is destroyed when its owner loses every ship in a combat round', () => {
    const base = toActionPhase(1, 1, SAAR_CONFIG)
    const home = homeSystemOf(base, 0)
    // Saar (defender, seat 0) keeps only the Floating Factory and one lone cruiser; Letnev (attacker, seat 1)
    // brings a warsun — near-certain to land at least one hit, and its own sustain keeps it alive regardless.
    const stripped = deepFreeze({
      ...base,
      systems: { ...base.systems, [home]: { ...base.systems[home], space: base.systems[home].space.filter(u => u.type === 'floating_factory') } },
    })
    const withCruiser = withUnits(stripped, home, 0, ['cruiser'])
    const withAttacker = withUnits(withCruiser, home, 1, ['warsun'])
    const inCombat: GameState = {
      ...withAttacker,
      active: 1,
      tactical: {
        systemId: home, step: 'spaceCombat',
        combat: { round: 1, attacker: 1, defender: 0, retreating: null, retreatTo: null, lastRolls: [], pending: [] },
      },
    }
    let after: GameState | null = null
    for (let seed = 1; seed <= 40 && !after; seed++) {
      const r = applyMove(inCombat, { type: 'combatRound' }, seed)
      if (!r.ok) continue
      const cruiserGone = !r.value.systems[home].space.some(u => u.owner === 0 && u.type === 'cruiser')
      if (cruiserGone) after = r.value
    }
    expect(after).not.toBeNull()
    expect(after!.systems[home].space.some(u => u.owner === 0 && u.type === 'floating_factory')).toBe(false)
  })

  it('counts toward "Fuel the War Machine" and as a target for "Cut Supply Lines"', () => {
    const s = toActionPhase(1, 0, SAAR_CONFIG)
    const home = homeSystemOf(s, 0)
    // Fuel the War Machine: 3 space docks on the board, owned by the scoring seat
    const withMore = withUnits(withUnits(s, home, 0, ['floating_factory']), home, 0, ['floating_factory'])
    expect(fulfils(withMore, 0, 'fwm')).toBe(true)
    // Cut Supply Lines: a ship of the scoring seat alongside another seat's space dock
    const dest = s.systems[home].neighbours[0]
    const enemyFf = withUnits(s, dest, 1, ['floating_factory'])
    const withShip = withUnits(enemyFf, dest, 0, ['cruiser'])
    expect(fulfils(withShip, 0, 'csl')).toBe(true)
  })
})
