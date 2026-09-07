// src/engine/movement.test.ts
import { describe, expect, it } from 'vitest'
import { pendingFor } from './combat'
import { applyMove, legalMoves } from './index'
import { movementObstacle, shipsThatCanReach } from './movement'
import { deepFreeze, groundIds, hitsIn, shipId, toActionPhase, withPlanetOwner, withTechs, withUnits } from './testUtils'
import type { GameState, Seat } from './types'

function activate(state: GameState, seat: Seat, systemId: string): GameState {
  const r = applyMove(deepFreeze({ ...state, active: seat }), { type: 'startTactical', systemId }, 0)
  if (!r.ok) throw new Error(r.error)
  return deepFreeze(r.value)
}

const move = (state: GameState, unitId: number, from: string, carrying: number[] = []) =>
  applyMove(deepFreeze(state), { type: 'moveShips', moves: [{ unitId, from, carrying }] }, 0)

describe('R3.2 movement', () => {
  it('R3.2 step 2: a carrier moves one system and carries infantry within its capacity', () => {
    const s = activate(toActionPhase(), 0, 'bereg')
    const carrier = shipId(s, 'home-n', 'carrier')
    const troops = groundIds(s, 'home-n', '000').slice(0, 4)
    const r = move(s, carrier, 'home-n', troops)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems.bereg.space.filter(u => u.owner === 0).map(u => u.type).sort())
      .toEqual(['carrier', 'infantry', 'infantry', 'infantry', 'infantry'])
    expect(r.value.systems['home-n'].planets[0].ground).toHaveLength(1)
    expect(r.value.systems['home-n'].space.some(u => u.id === carrier)).toBe(false)
  })
  it('R3.2 step 2: carrying more than the capacity is rejected', () => {
    const s = activate(toActionPhase(), 0, 'bereg')
    expect(move(s, shipId(s, 'home-n', 'carrier'), 'home-n', groundIds(s, 'home-n', '000')).ok).toBe(false)
  })
  it('R3.2 step 2: a fighter only moves on its own with Fighter II', () => {
    const plain = activate(toActionPhase(), 0, 'bereg')
    expect(move(plain, shipId(plain, 'home-n', 'fighter'), 'home-n').ok).toBe(false)
    const upgraded = activate(withTechs(toActionPhase(), 0, ['fighter_ii']), 0, 'bereg')
    const r = move(upgraded, shipId(upgraded, 'home-n', 'fighter'), 'home-n')
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems.bereg.space.filter(u => u.owner === 0 && u.type === 'fighter')).toHaveLength(1)
  })
  it('R3.2 step 2: Fighter II fighters above the capacity count against the fleet pool', () => {
    const base = withTechs(toActionPhase(), 0, ['fighter_ii'])
    const crowded = withUnits(base, 'bereg', 0, ['cruiser', 'cruiser', 'fighter'])   // 2 non-fighters plus one loose fighter
    const s = activate(crowded, 0, 'bereg')
    // the loose fighter and the arriving one have no capacity, so both count as non-fighter ships: 2 + 2 > fleet pool 3
    expect(move(s, shipId(s, 'home-n', 'fighter'), 'home-n').ok).toBe(false)
    const smaller = activate(withUnits(base, 'bereg', 0, ['cruiser', 'fighter']), 0, 'bereg')
    expect(move(smaller, shipId(smaller, 'home-n', 'fighter'), 'home-n').ok).toBe(true)   // 1 + 2 = 3
  })
  it('R3.2 step 2: fighters left behind by a departing carrier stay if the origin\'s dock covers them', () => {
    // home-n starts with an L1Z1X Super-Dreadnought (capacity 2), its own space dock and 3 fighters; the
    // carrier moving away alone leaves only capacity 2 behind, but the dock's 3 free fighter slots (R4.4,
    // Space Dock I or II) cover all 3 stranded fighters, so none are destroyed.
    const s = activate(toActionPhase(), 0, 'bereg')
    const before = s.players[0].reinforcements.fighter
    const r = move(s, shipId(s, 'home-n', 'carrier'), 'home-n')
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'fighter')).toHaveLength(3)
    expect(r.value.players[0].reinforcements.fighter).toBe(before)
  })
  it('R3.2 step 2: fighters left behind by a departing carrier are trimmed once they exceed the dock\'s cover too', () => {
    // 3 more fighters on top of the 3 that start at home-n: 6 total stranded once the carrier leaves, but the
    // remaining dreadnought's capacity (2) plus the dock's 3 free slots only cover 5, so 1 is destroyed.
    const s = activate(withUnits(toActionPhase(), 'home-n', 0, ['fighter', 'fighter', 'fighter']), 0, 'bereg')
    const before = s.players[0].reinforcements.fighter
    const r = move(s, shipId(s, 'home-n', 'carrier'), 'home-n')
    if (!r.ok) throw new Error(r.error)
    expect(r.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'fighter')).toHaveLength(5)
    expect(r.value.players[0].reinforcements.fighter).toBe(before + 1)
  })
  it('R1 wormholes: the alpha wormhole makes bereg and starpoint one step apart', () => {
    const s = activate(withUnits(toActionPhase(), 'bereg', 0, ['carrier']), 0, 'starpoint')
    expect(move(s, shipId(s, 'bereg', 'carrier'), 'bereg').ok).toBe(true)
  })
  it('R3.2 step 2: ships may not move through a system that contains enemy ships', () => {
    const open = activate(withUnits(toActionPhase(), 'home-n', 0, ['destroyer']), 0, 'quann')
    expect(move(open, shipId(open, 'home-n', 'destroyer'), 'home-n').ok).toBe(true)   // via bereg
    // all two-step routes have to be closed: quann sits behind bereg, sakulag and mecatol
    const fleets = withUnits(withUnits(withUnits(withUnits(toActionPhase(), 'home-n', 0, ['destroyer']), 'bereg', 1, ['destroyer']), 'sakulag', 1, ['destroyer']), 'mecatol', 1, ['destroyer'])
    const blocked = activate(fleets, 0, 'quann')
    expect(move(blocked, shipId(blocked, 'home-n', 'destroyer'), 'home-n').ok).toBe(false)
  })
  it('R3.2 step 2: ships in a system that contains your own command token cannot move', () => {
    const placed = withUnits(toActionPhase(), 'bereg', 0, ['carrier'])
    const tokened: GameState = { ...placed, systems: { ...placed.systems, bereg: { ...placed.systems.bereg, activatedBy: [0 as Seat] } } }
    const s = activate(tokened, 0, 'starpoint')
    expect(move(s, shipId(s, 'bereg', 'carrier'), 'bereg').ok).toBe(false)
  })
  it('R3.2 step 2: Gravity Drive gives +1 move to exactly one ship per activation', () => {
    const plain = activate(withUnits(toActionPhase(), 'home-n', 0, ['carrier']), 0, 'starpoint')
    expect(move(plain, shipId(plain, 'home-n', 'carrier'), 'home-n').ok).toBe(false)   // two steps with move 1
    const gd = activate(withUnits(withTechs(toActionPhase(), 0, ['gravity_drive']), 'home-n', 0, ['carrier', 'carrier']), 0, 'starpoint')
    const ids = gd.systems['home-n'].space.filter(u => u.type === 'carrier' && u.owner === 0).map(u => u.id)
    expect(move(gd, ids[0], 'home-n').ok).toBe(true)
    const both = applyMove(gd, { type: 'moveShips', moves: ids.map(id => ({ unitId: id, from: 'home-n', carrying: [] })) }, 0)
    expect(both.ok).toBe(false)
  })
  it('R4.4 fleet pool limits the arrivals, Armada gives Letnev two more', () => {
    const crowded = activate(withUnits(toActionPhase(), 'bereg', 0, ['cruiser', 'cruiser', 'cruiser']), 0, 'bereg')
    const from = withUnits(crowded, 'home-n', 0, ['destroyer'])
    expect(move(from, shipId(from, 'home-n', 'destroyer'), 'home-n').ok).toBe(false)   // fleet pool 3
    const letnev = activate(withUnits(toActionPhase(), 'starpoint', 1, ['cruiser', 'cruiser', 'cruiser', 'cruiser']), 1, 'starpoint')
    expect(move(letnev, shipId(letnev, 'home-s', 'destroyer', 1), 'home-s').ok).toBe(true)   // 5 with Armada
    const full = activate(withUnits(toActionPhase(), 'starpoint', 1, ['cruiser', 'cruiser', 'cruiser', 'cruiser', 'cruiser']), 1, 'starpoint')
    expect(move(full, shipId(full, 'home-s', 'destroyer', 1), 'home-s').ok).toBe(false)
  })
  it('endMovement goes to the space combat when enemy ships are present, otherwise past it', () => {
    const empty = activate(toActionPhase(), 0, 'bereg')
    const r = applyMove(empty, { type: 'endMovement' }, 0)
    if (!r.ok) throw new Error(r.error)
    // R4.3: nothing moved in, so there is neither an invasion nor a production to hold the turn open
    expect(r.value.tactical?.step).toBe('done')
    const withEnemy = withUnits(toActionPhase(), 'bereg', 1, ['destroyer'])
    const bereg = activate(withUnits(withEnemy, 'home-n', 0, ['destroyer']), 0, 'bereg')
    const moved = move(bereg, shipId(bereg, 'home-n', 'destroyer'), 'home-n')
    if (!moved.ok) throw new Error(moved.error)
    const combat = applyMove(moved.value, { type: 'endMovement' }, 0)
    if (!combat.ok) throw new Error(combat.error)
    expect(combat.value.tactical?.step).toBe('spaceCombat')
    expect(combat.value.tactical?.combat).toEqual({ round: 0, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] })
  })
  it('R4.1 step 1: endMovement resolves space cannon offense when only a PDS defends an otherwise empty system', () => {
    const withPds = withUnits(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 'bereg', 1, ['pds'], 'bereg')
    const s = activate(withUnits(withPds, 'home-n', 0, ['destroyer', 'destroyer']), 0, 'bereg')
    const ids = s.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'destroyer').map(u => u.id)
    const moved = applyMove(s, { type: 'moveShips', moves: ids.map(id => ({ unitId: id, from: 'home-n', carrying: [] })) }, 0)
    if (!moved.ok) throw new Error(moved.error)
    const after = applyMove(moved.value, { type: 'endMovement' }, 5)
    if (!after.ok) throw new Error(after.error)
    expect(after.value.tactical?.step).toBe('done')   // two destroyers and no infantry: nothing to invade with
    const entries = after.value.log.filter(e => e.t === 'roll' && e.context === 'space cannon offense')
    expect(entries).toHaveLength(1)
    expect(after.value.systems.bereg.space.filter(u => u.owner === 0)).toHaveLength(2 - hitsIn(after.value, 'space cannon offense'))
  })
  it('R4.1 step 1 and 4: a mixed fleet assigns the PDS hits itself before the action moves on', () => {
    const withPds = withUnits(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 'bereg', 1, ['pds'], 'bereg')
    const s = activate(withUnits(withPds, 'home-n', 0, ['destroyer']), 0, 'bereg')
    const carrier = shipId(s, 'home-n', 'carrier')
    const destroyer = shipId(s, 'home-n', 'destroyer')
    const moved = applyMove(s, { type: 'moveShips', moves: [carrier, destroyer].map(unitId => ({ unitId, from: 'home-n', carrying: [] })) }, 0)
    if (!moved.ok) throw new Error(moved.error)
    const stopped = applyMove(moved.value, { type: 'endMovement' }, 3)   // seed 3: the PDS hits
    if (!stopped.ok) throw new Error(stopped.error)
    expect(pendingFor(stopped.value)).toMatchObject({ owner: 0, context: 'space cannon offense' })
    expect(stopped.value.tactical?.step).toBe('movement')                // the movement step holds the queue
    expect(legalMoves(stopped.value).map(m => m.type)).toEqual(['assignHits'])
    expect(stopped.value.systems.bereg.space.filter(u => u.owner === 0)).toHaveLength(2)
    const after = applyMove(stopped.value, { type: 'assignHits', destroy: [destroyer], sustain: [] }, 3)
    if (!after.ok) throw new Error(after.error)
    expect(after.value.systems.bereg.space.filter(u => u.owner === 0).map(u => u.type)).toEqual(['carrier'])
    expect(after.value.tactical?.step).toBe('done')   // the carrier arrived empty, so there is nothing to land
    expect(after.value.tactical?.combat).toBeUndefined()
  })
  it('R4.1 step 1: cargo orphaned by the space cannon in the PDS-only branch is destroyed with its carrier', () => {
    // seat 1 activates [0.0.0], where the L1Z1X starting PDS defends an otherwise empty system: the cannon
    // destroys the arriving carrier, so the two infantry it carried have nothing left to ride in.
    const base = toActionPhase(1, 1)
    const emptied = deepFreeze({ ...base, systems: { ...base.systems, 'home-n': { ...base.systems['home-n'], space: [] } } })
    const s = activate(withUnits(emptied, 'bereg', 1, ['carrier', 'infantry', 'infantry']), 1, 'home-n')
    const troops = s.systems.bereg.space.filter(u => u.owner === 1 && u.type === 'infantry').map(u => u.id)
    const moved = move(s, shipId(s, 'bereg', 'carrier', 1), 'bereg', troops)
    if (!moved.ok) throw new Error(moved.error)
    const before = moved.value.players[1].reinforcements
    const after = applyMove(moved.value, { type: 'endMovement' }, 3)   // seed 3: the PDS hits
    if (!after.ok) throw new Error(after.error)
    expect(hitsIn(after.value, 'space cannon offense')).toBeGreaterThanOrEqual(1)
    expect(after.value.systems['home-n'].space.filter(u => u.owner === 1)).toHaveLength(0)
    expect(after.value.players[1].reinforcements.carrier).toBe(before.carrier + 1)
    expect(after.value.players[1].reinforcements.infantry).toBe(before.infantry + 2)
  })
})

describe('R3.2 reachability, so the interface can say why nothing moves', () => {
  it('reports which ships could reach a system that is not activated yet', () => {
    const s = toActionPhase()
    expect(shipsThatCanReach(s, 0, 'mecatol').length).toBeGreaterThan(0)
    expect(shipsThatCanReach(s, 0, 'sakulag').length).toBeGreaterThan(0)
    expect(shipsThatCanReach(s, 0, 'starpoint')).toHaveLength(0)   // two systems away, every starting ship moves 1
  })
  it('names the range as the obstacle for a system two steps away', () => {
    expect(movementObstacle(toActionPhase(), 0, 'starpoint')).toBe('range')
  })
  it('names the enemy fleet that blocks the only path', () => {
    const s = withUnits(withTechs(toActionPhase(), 0, ['gravity_drive']), 'mecatol', 1, ['cruiser'])
    expect(movementObstacle(s, 0, 'home-s')).toBe('blocked')
  })
  it('reports no obstacle for a system the ships can reach', () => {
    expect(movementObstacle(toActionPhase(), 0, 'bereg')).toBeNull()
  })
  it('reports that there are no ships left to move when they all sit in the target', () => {
    const s = toActionPhase()
    expect(movementObstacle(s, 0, 'home-n')).toBe('none')
  })
})

describe('Anomalies & Gravity Drive legality (JVBR8F regression)', () => {
  it('Gravity Drive cannot be used by a second ship in a subsequent moveShips call in the same activation', () => {
    const gd = activate(withUnits(withTechs(toActionPhase(), 0, ['gravity_drive']), 'home-n', 0, ['carrier', 'carrier']), 0, 'starpoint')
    const ids = gd.systems['home-n'].space.filter(u => u.type === 'carrier' && u.owner === 0).map(u => u.id)
    // First ship uses Gravity Drive to reach starpoint (distance 2)
    const first = move(gd, ids[0], 'home-n')
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.error)
    expect(first.value.tactical?.gravityDriveUsed).toBe(true)

    // Second ship attempts to also use Gravity Drive in the same activation
    const second = move(first.value, ids[1], 'home-n')
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error('expected second move to fail')
    expect(second.error).toContain('cannot reach starpoint')
  })

  it('ships cannot move into or through an asteroid field without Antimass Deflectors', () => {
    const base = toActionPhase()
    const withAsteroid: GameState = {
      ...base,
      systems: {
        ...base.systems,
        bereg: { ...base.systems.bereg, anomalies: ['asteroid_field'] },
      },
    }
    // Attempt to enter asteroid field without Antimass Deflectors
    const activated = activate(withAsteroid, 0, 'bereg')
    const carrier = shipId(activated, 'home-n', 'carrier')
    const enterRes = move(activated, carrier, 'home-n')
    expect(enterRes.ok).toBe(false)

    // Attempt to pass through asteroid field to quann when it is the only path
    const gdState = withUnits(withUnits(withTechs(withAsteroid, 0, ['gravity_drive']), 'sakulag', 1, ['cruiser']), 'mecatol', 1, ['cruiser'])
    const toQuann = activate(gdState, 0, 'quann')
    const passRes = move(toQuann, carrier, 'home-n')
    expect(passRes.ok).toBe(false)

    // With Antimass Deflectors, both succeed
    const withTech = withTechs(withAsteroid, 0, ['antimass_deflectors'])
    const allowed = activate(withTech, 0, 'bereg')
    const allowedRes = move(allowed, carrier, 'home-n')
    expect(allowedRes.ok).toBe(true)
  })

  it('ships cannot move into or through a supernova under any circumstances', () => {
    const base = toActionPhase()
    const withSupernova: GameState = {
      ...base,
      systems: {
        ...base.systems,
        bereg: { ...base.systems.bereg, anomalies: ['supernova'] },
      },
    }
    const withAllTechs = withTechs(withSupernova, 0, ['antimass_deflectors', 'gravity_drive'])
    const activated = activate(withAllTechs, 0, 'bereg')
    const carrier = shipId(activated, 'home-n', 'carrier')
    expect(move(activated, carrier, 'home-n').ok).toBe(false)
  })

  it('ships can enter a nebula as destination, but cannot pass through it as a waypoint', () => {
    const base = toActionPhase()
    const withNebula: GameState = {
      ...base,
      systems: {
        ...base.systems,
        bereg: { ...base.systems.bereg, anomalies: ['nebula'] },
      },
    }
    const gdState = withUnits(withUnits(withTechs(withNebula, 0, ['gravity_drive']), 'sakulag', 1, ['cruiser']), 'mecatol', 1, ['cruiser'])
    const carrier = shipId(gdState, 'home-n', 'carrier')

    // Entering nebula as destination: allowed
    const destActive = activate(gdState, 0, 'bereg')
    expect(move(destActive, carrier, 'home-n').ok).toBe(true)

    // Passing through nebula to quann: blocked
    const throughActive = activate(gdState, 0, 'quann')
    expect(move(throughActive, carrier, 'home-n').ok).toBe(false)
  })

  it('prevents Creuss from illegally reaching home-4 in game JVBR8F through tile-45 asteroid field', async () => {
    const { createGame } = await import('./setup')
    const config = {
      players: [
        { faction: 'xxcha' as const, color: 'green' as const, name: 'P1', playerType: 'human' as const },
        { faction: 'yin' as const, color: 'red' as const, name: 'P2', playerType: 'ai' as const },
        { faction: 'yssaril' as const, color: 'yellow' as const, name: 'P3', playerType: 'ai' as const },
        { faction: 'creuss' as const, color: 'purple' as const, name: 'P4', playerType: 'ai' as const },
        { faction: 'naalu' as const, color: 'blue' as const, name: 'P5', playerType: 'ai' as const },
        { faction: 'jolnar' as const, color: 'orange' as const, name: 'P6', playerType: 'ai' as const },
      ],
      speaker: 0,
    }
    const state = createGame(config, 776489084)
    expect(shipsThatCanReach(state, 3, 'home-4')).toHaveLength(0)
  })

  it('Fighter I cannot move on its own even when player has gravity_drive (baseMove < 1)', () => {
    // Only fighters in home-n, with gravity drive
    let s = toActionPhase()
    s = {
      ...s,
      systems: {
        ...s.systems,
        'home-n': {
          ...s.systems['home-n'],
          space: s.systems['home-n'].space.filter(u => u.type === 'fighter'),
        },
      },
    }
    s = withTechs(s, 0, ['gravity_drive'])

    // Fighter I has baseMove 0, cannot move on its own even with gravity drive bonus
    const reachable = shipsThatCanReach(s, 0, 'bereg')
    expect(reachable).toHaveLength(0)

    // With fighter_ii, baseMove is 2, so it CAN move on its own
    const withFighter2 = withTechs(s, 0, ['fighter_ii'])
    const reachableWithFighter2 = shipsThatCanReach(withFighter2, 0, 'bereg')
    expect(reachableWithFighter2.length).toBeGreaterThan(0)
  })
})
