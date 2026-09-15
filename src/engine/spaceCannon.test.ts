import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { toActionPhase, withUnits, withTechs, withTactical } from './testUtils'
import { neighbours } from './adjacency'
import type { GameState, LogEntry, Move, Owner, Seat } from './types'

function apply(state: GameState, move: Move, seed = 0): GameState {
  const res = applyMove(state, move, seed)
  if (!res.ok) throw new Error(res.error)
  return res.value
}

function rollsIn(log: GameState['log'], owner: Owner, context: string): LogEntry | undefined {
  return log.find(e => e.t === 'roll' && e.owner === owner && e.context === context)
}

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

    const start = apply(s, { type: 'startTactical', systemId: mecatol })
    const move = apply(start, { type: 'moveShips', moves: [{ unitId: cruiser.id, from: adjSysId, carrying: [] }] })
    const endMove = apply(move, { type: 'endMovement' })

    expect(endMove.tactical?.step).toBe('spaceCombat')
    expect(endMove.tactical?.combat?.round).toBe(0)

    // Attacker fights round 0 (space cannon offense)
    const round0 = apply(endMove, { type: 'combatRound' })

    // Check log: attacker (seat 0) rolled for space cannon offense!
    const pdsRoll = rollsIn(round0.log, 0, 'space cannon offense')
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
    const start = apply(s, { type: 'startTactical', systemId: mecatol })

    // Attacker moves NO ships
    const endMove = apply(start, { type: 'endMovement' })
    // Should enter spaceCombat round 0 because attacker can fire Space Cannon!
    expect(endMove.tactical?.step).toBe('spaceCombat')
    expect(endMove.tactical?.combat?.round).toBe(0)

    const round0 = apply(endMove, { type: 'combatRound' })

    const pdsRoll = rollsIn(round0.log, 0, 'space cannon offense')
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

    const start = apply(s, { type: 'startTactical', systemId: mecatol })
    const move = apply(start, { type: 'moveShips', moves: [{ unitId: cruiser.id, from: anotherAdjId, carrying: [] }] })
    const endMove = apply(move, { type: 'endMovement' })
    // Defender has PDS II in range: should enter spaceCombat round 0!
    expect(endMove.tactical?.step).toBe('spaceCombat')
    expect(endMove.tactical?.combat?.round).toBe(0)

    const round0 = apply(endMove, { type: 'combatRound' })

    const pdsRoll = rollsIn(round0.log, 1, 'space cannon offense')
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
    const start = apply(s, { type: 'startTactical', systemId: betaSys.id })
    const endMove = apply(start, { type: 'endMovement' })
    expect(endMove.tactical?.step).toBe('spaceCombat')

    const round0 = apply(endMove, { type: 'combatRound' })

    const pdsRoll = rollsIn(round0.log, 0, 'space cannon offense')
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
  it('a PDS-only volley that destroys a defender carrier trims the defenders uncarried fighters (R4.1 step 4)', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const adjIds = neighbours(base.systems, mecatol)
    const adjSysId = adjIds.find(id => base.systems[id]?.planets?.length > 0)!
    const adjPlanet = base.systems[adjSysId].planets[0].id

    // Attacker (seat 0) has PDS II and a PDS adjacent to mecatol; they activate mecatol and move NOTHING.
    let s = withTechs(base, 0, ['pds_ii'])
    s = withUnits(s, adjSysId, 0, ['pds'], adjPlanet)
    // Defender (seat 1) holds a carrier with four fighters on mecatol.
    s = withUnits(s, mecatol, 1, ['carrier'])
    const carrier = s.systems[mecatol].space.find(u => u.owner === 1 && u.type === 'carrier')!
    s = withUnits(s, mecatol, 1, ['fighter', 'fighter', 'fighter', 'fighter'])

    const start = apply(s, { type: 'startTactical', systemId: mecatol })
    const endMove = apply(start, { type: 'endMovement' })
    expect(endMove.tactical?.step).toBe('spaceCombat')

    // Find a seed whose volley actually hits, then assign both hits to the carrier.
    for (let seed = 0; seed < 40; seed++) {
      const volley = applyMove(endMove, { type: 'combatRound' }, seed)
      if (!volley.ok) throw new Error(volley.error)
      const roll = rollsIn(volley.value.log, 0, 'space cannon offense')
      if (!roll || roll.t !== 'roll' || !roll.rolls.some(r => r.hit)) continue
      const hits = roll.rolls.filter(r => r.hit).length
      // hits against seat 1's fleet; sink them all into the carrier (sustain is not available to a carrier)
      const extra = Math.max(0, hits - 1)
      const fighters = endMove.systems[mecatol].space.filter(u => u.owner === 1 && u.type === 'fighter').slice(0, extra)
      const assigned = applyMove(volley.value, { type: 'assignHits', destroy: [carrier.id, ...fighters.map(f => f.id)], sustain: [] }, seed)
      if (!assigned.ok) throw new Error(assigned.error)
      // the volley is over: advancing out of it must destroy the now-uncarried fighters too
      const done = apply(assigned.value, { type: 'combatRound' }, seed)
      const survivors = done.systems[mecatol].space.filter(u => u.owner === 1)
      expect(survivors).toHaveLength(0)
      return
    }
    throw new Error('no seed in 0..39 produced a space cannon hit — the fixture is broken')
  })
})
