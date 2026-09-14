import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { toActionPhase, withUnits, withTechs, withTactical } from './testUtils'
import { neighbours } from './adjacency'
import type { Seat } from './types'

describe('Space Cannon Offense & PDS II', () => {
  it('attacker with PDS II in adjacent system fires Space Cannon Offense at defender ships', () => {
    const base = toActionPhase()
    // Find a system adjacent to mecatol
    const mecatol = 'mecatol'
    const adjIds = neighbours(base.systems, mecatol)
    const adjSysId = adjIds.find(id => base.systems[id]?.planets?.length > 0)!
    const adjPlanet = base.systems[adjSysId].planets[0].id

    // Attacker (seat 0) has PDS II and PDS on adjPlanet
    let s = withTechs(base, 0, ['pds_ii'])
    s = withUnits(s, adjSysId, 0, ['pds'], adjPlanet)

    // Defender (seat 1) has 1 cruiser on mecatol
    s = withUnits(s, mecatol, 1, ['cruiser'])

    // Attacker moves 1 cruiser from home to mecatol
    // For test simplicity, put 1 cruiser in adjSysId and move to mecatol
    s = withUnits(s, adjSysId, 0, ['cruiser'])
    const cruiser = s.systems[adjSysId].space.find(u => u.owner === 0 && u.type === 'cruiser')!

    const start = applyMove(s, { type: 'startTactical', systemId: mecatol }, 0)
    expect(start.ok).toBe(true)

    const move = applyMove(start.value, { type: 'moveShips', moves: [{ unitId: cruiser.id, from: adjSysId, carrying: [] }] }, 0)
    expect(move.ok).toBe(true)

    const endMove = applyMove(move.value, { type: 'endMovement' }, 0)
    expect(endMove.ok).toBe(true)
    expect(endMove.value.tactical?.step).toBe('spaceCombat')
    expect(endMove.value.tactical?.combat?.round).toBe(0)

    // Attacker fights round 0 (space cannon offense)
    const round0 = applyMove(endMove.value, { type: 'combatRound' }, 0)
    expect(round0.ok).toBe(true)

    // Check log: attacker (seat 0) rolled for space cannon offense!
    const pdsRoll = round0.value.log.find(e => e.t === 'roll' && e.owner === 0 && e.context === 'space cannon offense')
    expect(pdsRoll).toBeDefined()
  })

  it('attacker with PDS II fires into adjacent active system even when moving NO ships', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const adjIds = neighbours(base.systems, mecatol)
    const adjSysId = adjIds.find(id => base.systems[id]?.planets?.length > 0)!
    const adjPlanet = base.systems[adjSysId].planets[0].id

    // Attacker (seat 0) has PDS II and PDS on adjPlanet
    let s = withTechs(base, 0, ['pds_ii'])
    s = withUnits(s, adjSysId, 0, ['pds'], adjPlanet)

    // Defender (seat 1) has 1 cruiser on mecatol
    s = withUnits(s, mecatol, 1, ['cruiser'])

    // Attacker activates mecatol
    const start = applyMove(s, { type: 'startTactical', systemId: mecatol }, 0)
    expect(start.ok).toBe(true)

    // Attacker moves NO ships
    const endMove = applyMove(start.value, { type: 'endMovement' }, 0)
    expect(endMove.ok).toBe(true)
    // Should enter spaceCombat round 0 because attacker can fire Space Cannon!
    expect(endMove.value.tactical?.step).toBe('spaceCombat')
    expect(endMove.value.tactical?.combat?.round).toBe(0)

    const round0 = applyMove(endMove.value, { type: 'combatRound' }, 0)
    expect(round0.ok).toBe(true)

    const pdsRoll = round0.value.log.find(e => e.t === 'roll' && e.owner === 0 && e.context === 'space cannon offense')
    expect(pdsRoll).toBeDefined()
  })

  it('defender with PDS II in adjacent system fires at attacker moving into empty system', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const adjIds = neighbours(base.systems, mecatol)
    const adjSysId = adjIds.find(id => base.systems[id]?.planets?.length > 0)!
    const adjPlanet = base.systems[adjSysId].planets[0].id

    // Defender (seat 1) has PDS II and PDS on adjPlanet
    let s = withTechs(base, 1, ['pds_ii'])
    s = withUnits(s, adjSysId, 1, ['pds'], adjPlanet)

    // Mecatol has NO defender ships and NO defender PDS
    // Attacker has 1 cruiser in another adjacent system
    const anotherAdjId = adjIds[1] || adjIds[0]
    s = withUnits(s, anotherAdjId, 0, ['cruiser'])
    const cruiser = s.systems[anotherAdjId].space.find(u => u.owner === 0 && u.type === 'cruiser')!

    const start = applyMove(s, { type: 'startTactical', systemId: mecatol }, 0)
    expect(start.ok).toBe(true)

    const move = applyMove(start.value, { type: 'moveShips', moves: [{ unitId: cruiser.id, from: anotherAdjId, carrying: [] }] }, 0)
    expect(move.ok).toBe(true)

    const endMove = applyMove(move.value, { type: 'endMovement' }, 0)
    expect(endMove.ok).toBe(true)
    // Defender has PDS II in range: should enter spaceCombat round 0!
    expect(endMove.value.tactical?.step).toBe('spaceCombat')
    expect(endMove.value.tactical?.combat?.round).toBe(0)

    const round0 = applyMove(endMove.value, { type: 'combatRound' }, 0)
    expect(round0.ok).toBe(true)

    const pdsRoll = round0.value.log.find(e => e.t === 'roll' && e.owner === 1 && e.context === 'space cannon offense')
    expect(pdsRoll).toBeDefined()
  })

  it('Creuss with PDS II fires through wormholes into active system', () => {
    // Creuss seat has Quantum Entanglement: alpha and beta wormholes are adjacent to Creuss
    // Setup a game where seat 0 is Creuss
    const config = {
      players: [{ faction: 'creuss' as const, color: 'blue' as const, name: 'Creuss' }, { faction: 'letnev' as const, color: 'red' as const, name: 'Letnev' }],
      speaker: 0 as Seat,
    }
    const base = toActionPhase(1, 0, config)

    // Find alpha wormhole system and beta wormhole system
    const alphaSys = Object.values(base.systems).find(sys => sys.wormhole === 'alpha')!
    const betaSys = Object.values(base.systems).find(sys => sys.wormhole === 'beta')!

    // Creuss (seat 0) has PDS II on a planet in alphaSys
    let s = withTechs(base, 0, ['pds_ii'])
    const alphaPlanet = alphaSys.planets[0].id
    s = withUnits(s, alphaSys.id, 0, ['pds'], alphaPlanet)

    // Defender (seat 1) has 1 cruiser in betaSys
    s = withUnits(s, betaSys.id, 1, ['cruiser'])

    // Creuss activates betaSys without moving ships
    const start = applyMove(s, { type: 'startTactical', systemId: betaSys.id }, 0)
    expect(start.ok).toBe(true)

    const endMove = applyMove(start.value, { type: 'endMovement' }, 0)
    expect(endMove.ok).toBe(true)
    expect(endMove.value.tactical?.step).toBe('spaceCombat')

    const round0 = applyMove(endMove.value, { type: 'combatRound' }, 0)
    expect(round0.ok).toBe(true)

    const pdsRoll = round0.value.log.find(e => e.t === 'roll' && e.owner === 0 && e.context === 'space cannon offense')
    expect(pdsRoll).toBeDefined()
  })

  it('War Sun bypasses Planetary Shield during bombardment', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const planetId = base.systems[mecatol].planets[0].id

    // Defender (seat 1) has 2 infantry and 1 PDS on mecatol
    let s = withUnits(base, mecatol, 1, ['infantry', 'infantry', 'pds'], planetId)
    // Attacker (seat 0) has 1 dreadnought in space
    s = withUnits(s, mecatol, 0, ['dreadnought'])
    s = withTactical(s, {
      systemId: mecatol,
      step: 'invasion',
      invasion: { planetId: null, landed: [], bombarded: [], round: 0 },
    })

    // Dreadnought alone cannot bombard because PDS gives planetary shield
    const dreadBombard = applyMove(s, { type: 'bombard', planetId }, 0)
    expect(dreadBombard.ok).toBe(false)
    if (!dreadBombard.ok) {
      expect(dreadBombard.error).toContain('planetary shield')
    }

    // Attacker also has a War Sun in space
    const sWithWarSun = withUnits(s, mecatol, 0, ['warsun'])
    const warSunBombard = applyMove(sWithWarSun, { type: 'bombard', planetId }, 0)
    expect(warSunBombard.ok).toBe(true)
  })
})

