import { describe, expect, it } from 'vitest'
import { homeSystemOf } from './board'
import { applyMove } from './index'
import { pathLength, shortestPath } from './movement'
import { deepFreeze, toActionPhase, withUnits } from './testUtils'
import type { GameState } from './types'

/** docs/spec/lrr.md "Gravity Rift": +1 move value for a ship exiting or passing through one, and a die roll
 * per crossing (1-3 removes the ship) taken immediately before it exits the rift system. */
describe('Gravity Rift', () => {
  it('removes a ship on a 1-3 and returns it to reinforcements, off the board entirely', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    const rift = base.systems[home].neighbours[0]
    const withRift: GameState = deepFreeze({
      ...base,
      systems: { ...base.systems, [rift]: { ...base.systems[rift], anomalies: ['gravity_rift'] } },
    })
    const withShip = withUnits(withRift, rift, 0, ['dreadnought'])
    const shipId = withShip.systems[rift].space.find(u => u.type === 'dreadnought' && u.owner === 0)!.id
    const startingReinforcements = withShip.players[0].reinforcements.dreadnought
    const started = applyMove(withShip, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)

    let after: GameState | null = null
    for (let seed = 1; seed <= 60 && !after; seed++) {
      const r = applyMove(started.value, { type: 'moveShips', moves: [{ unitId: shipId, from: rift, carrying: [] }] }, seed)
      if (!r.ok) continue
      const stillOnBoard = r.value.systems[home].space.some(u => u.id === shipId) || r.value.systems[rift].space.some(u => u.id === shipId)
      if (!stillOnBoard) after = r.value
    }
    expect(after).not.toBeNull()
    expect(after!.players[0].reinforcements.dreadnought).toBe(startingReinforcements + 1)
    expect(after!.log.some(e => e.t === 'info' && e.text.includes('removed from the board'))).toBe(true)
  })

  it('a surviving roll (4-10) delivers the ship normally', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    const rift = base.systems[home].neighbours[0]
    const withRift: GameState = deepFreeze({
      ...base,
      systems: { ...base.systems, [rift]: { ...base.systems[rift], anomalies: ['gravity_rift'] } },
    })
    const withShip = withUnits(withRift, rift, 0, ['dreadnought'])
    const shipId = withShip.systems[rift].space.find(u => u.type === 'dreadnought' && u.owner === 0)!.id
    const started = applyMove(withShip, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)

    let after: GameState | null = null
    for (let seed = 1; seed <= 60 && !after; seed++) {
      const r = applyMove(started.value, { type: 'moveShips', moves: [{ unitId: shipId, from: rift, carrying: [] }] }, seed)
      if (!r.ok) continue
      if (r.value.systems[home].space.some(u => u.id === shipId)) after = r.value
    }
    expect(after).not.toBeNull()
  })

  it('removes carried cargo along with a removed carrier', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    const rift = base.systems[home].neighbours[0]
    const withRift: GameState = deepFreeze({
      ...base,
      systems: { ...base.systems, [rift]: { ...base.systems[rift], anomalies: ['gravity_rift'] } },
    })
    const withCarrier = withUnits(withRift, rift, 0, ['carrier'])
    const withCargo = withUnits(withCarrier, rift, 0, ['infantry'])
    const carrierId = withCargo.systems[rift].space.find(u => u.type === 'carrier' && u.owner === 0)!.id
    const infantryId = withCargo.systems[rift].space.find(u => u.type === 'infantry' && u.owner === 0)!.id
    const started = applyMove(withCargo, { type: 'startTactical', systemId: home }, 1)
    if (!started.ok) throw new Error(started.error)

    let after: GameState | null = null
    for (let seed = 1; seed <= 60 && !after; seed++) {
      const r = applyMove(started.value, { type: 'moveShips', moves: [{ unitId: carrierId, from: rift, carrying: [infantryId] }] }, seed)
      if (!r.ok) continue
      const carrierGone = !r.value.systems[home].space.some(u => u.id === carrierId) && !r.value.systems[rift].space.some(u => u.id === carrierId)
      if (carrierGone) after = r.value
    }
    expect(after).not.toBeNull()
    const stillOnBoard = (id: number) => Object.values(after!.systems).some(s => s.space.some(u => u.id === id) || s.planets.some(p => p.ground.some(u => u.id === id)))
    expect(stillOnBoard(infantryId)).toBe(false)
  })

  it('grants +1 move value, reaching a system otherwise out of range', () => {
    const base = toActionPhase(1, 0)
    const home = homeSystemOf(base, 0)
    // find a system one hop from home (candidate rift) with a neighbour two hops from home (the target)
    let riftId: string | null = null
    let targetId: string | null = null
    for (const mid of base.systems[home].neighbours) {
      const midSys = base.systems[mid]
      if (!midSys) continue
      const beyond = midSys.neighbours.find(n => n !== home && !base.systems[home].neighbours.includes(n))
      if (beyond) { riftId = mid; targetId = beyond; break }
    }
    expect(riftId).not.toBeNull()
    expect(targetId).not.toBeNull()
    // without the rift, a move-1 ship two hops away cannot reach
    expect(pathLength(base, 0, home, targetId!, 1)).toBeNull()
    const withRift: GameState = deepFreeze({
      ...base,
      systems: { ...base.systems, [riftId!]: { ...base.systems[riftId!], anomalies: ['gravity_rift'] } },
    })
    const found = shortestPath(withRift, 0, home, targetId!, 1)
    expect(found).not.toBeNull()
    expect(found!.path).toEqual([home, riftId, targetId])
  })
})
