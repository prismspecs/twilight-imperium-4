import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { canTransitDiodes, relocatableGroundForces, transitDiodes } from './componentActions'
import { deepFreeze, toActionPhase, withPlanetOwner, withTechs, withUnits } from './testUtils'
import type { GameState, Move, Planet } from './types'

/** Xxcha seat 0 with Transit Diodes; home-0 activated (a command token there) with infantry on the planet. */
function fixture(): GameState {
  const base = withTechs(toActionPhase(), 0, ['transit_diodes'])
  const s = withUnits(base, 'home-0', 0, ['infantry', 'infantry'])
  return deepFreeze({
    ...s,
    systems: { ...s.systems, 'home-0': { ...s.systems['home-0'], activatedBy: [0 as const] } },
  })
}

/** A planet seat 0 does not control yet, outside their home system, plus its system id. */
function grabbablePlanet(s: GameState): { planetId: string; systemId: string } {
  for (const [sysId, sys] of Object.entries(s.systems)) {
    if (sysId === 'home-0') continue
    for (const p of sys.planets) if (p.owner === null && !p.id.includes('mecatol')) return { planetId: p.id, systemId: sysId }
  }
  throw new Error('no grabbable planet in the fixture')
}

const play = (s: GameState, moves: { infantryId: number; to: string }[]) =>
  applyMove(deepFreeze(s), { type: 'transitDiodes', moves }, 0)

function value(r: { ok: boolean; value?: GameState; error?: string }): GameState {
  if (!r.ok) throw new Error(r.error)
  return r.value as GameState
}
void (null as unknown as Move)
void (null as unknown as Planet)

describe('Xxcha Transit Diodes', () => {
  it('relocates a ground force from a tokened system to another controlled planet, exhausting the card', () => {
    const grab = grabbablePlanet(fixture())
    const s = withPlanetOwner(fixture(), grab.systemId, grab.planetId, 0)
    const targets = relocatableGroundForces(s, 0)
    expect(targets.length).toBeGreaterThan(0)
    const r = play(s, [{ infantryId: targets[0].unit.id, to: grab.planetId }])
    expect(r.ok).toBe(true)
    const done = value(r)
    expect(done.players[0].transitDiodesExhausted).toBe(true)
    expect(done.turnDone).toBe(true)
    expect(done.systems[grab.systemId].planets.find(p => p.id === grab.planetId)?.ground.some(u => u.id === targets[0].unit.id)).toBe(true)
    expect(done.log.some(e => e.t === 'info' && e.text.includes('Transit Diodes'))).toBe(true)
  })

  it('cannot remove a ground force from a system without your command token', () => {
    const far = grabbablePlanet(fixture())
    let s = withPlanetOwner(fixture(), far.systemId, far.planetId, 0)
    s = withUnits(s, far.systemId, 0, ['infantry'])
    const seeded = deepFreeze({
      ...s,
      systems: { ...s.systems, [far.systemId]: { ...s.systems[far.systemId], activatedBy: [] } },
    })
    // withUnits without a planetId places the infantry in the system's space area
    const farInfantry = seeded.systems[far.systemId].space.find(u => u.owner === 0 && u.type === 'infantry')
    if (!farInfantry) throw new Error('no infantry in the far system space')
    const r = play(seeded, [{ infantryId: farInfantry.id, to: far.planetId }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('command token')
  })

  it('cannot place on a planet you do not control', () => {
    const s = fixture()
    const targets = relocatableGroundForces(s, 0)
    const enemyPlanet = Object.values(s.systems).flatMap(sys => sys.planets).find(p => p.owner === 1)
    if (!enemyPlanet) throw new Error('no enemy planet in the fixture')
    const r = play(s, [{ infantryId: targets[0].unit.id, to: enemyPlanet.id }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('do not control')
  })

  it('caps at 4 relocations and refuses an empty plan', () => {
    const s = fixture()
    expect(play(s, []).ok).toBe(false)
    const tooMany = Array.from({ length: 5 }, (_, i) => ({ infantryId: 1000 + i, to: '0.0.0' }))
    expect(play(s, tooMany).ok).toBe(false)
  })

  it('exhausts after use and readies in the next status phase', () => {
    const grab = grabbablePlanet(fixture())
    const s = withPlanetOwner(fixture(), grab.systemId, grab.planetId, 0)
    const targets = relocatableGroundForces(s, 0)
    const done = value(play(s, [{ infantryId: targets[0].unit.id, to: grab.planetId }]))
    const again = play({ ...done, phase: 'action', turnDone: false }, [{ infantryId: targets[1]?.unit.id ?? targets[0].unit.id, to: grab.planetId }])
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error).toContain('exhausted')
  })

  it('is enumerated with a playable default plan when owned and ready', () => {
    const grab = grabbablePlanet(fixture())
    const s = withPlanetOwner(fixture(), grab.systemId, grab.planetId, 0)
    expect(canTransitDiodes(s, 0)).toBe(true)
    const plan = relocatableGroundForces(s, 0).slice(0, 1).map(t => ({ infantryId: t.unit.id, to: grab.planetId }))
    expect(play(s, plan).ok).toBe(true)
  })
})
