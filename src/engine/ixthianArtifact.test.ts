import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { toActionPhase, toAgendaPhase, withUnits } from './testUtils'
import { researchable } from './research'
import { neighbours } from './adjacency'
import type { GameState, Move, Unit } from './types'

function apply(state: GameState, move: Move, seed = 0): GameState {
  const res = applyMove(state, move, seed)
  if (!res.ok) throw new Error(res.error)
  return res.value
}

describe('Ixthian Artifact agenda resolution', () => {
  it('Against outcome has no effect', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const withMecatolUnits = withUnits(base, mecatol, 0, ['dreadnought'])
    // toAgendaPhase sets up the agenda phase with ixthian_artifact revealed
    const s = toAgendaPhase(withMecatolUnits, 'ixthian_artifact')

    // Seat 1 votes Against (slot 1 order is [1, 0] because speaker 0 votes last)
    const v1 = apply(s, { type: 'castVote', outcome: 'Against', planets: [] }, 1)

    // Seat 0 (speaker) votes Against
    const v0 = apply(v1, { type: 'castVote', outcome: 'Against', planets: [] }, 1)

    // Mecatol units are preserved
    expect(v0.systems[mecatol].space.some((u: Unit) => u.owner === 0 && u.type === 'dreadnought')).toBe(true)
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('Ixthian Artifact: voted Against — no effect'))).toBe(true)
  })

  it('For outcome with roll 6-10 queues each player to pick up to 2 technologies, in speaker order', () => {
    const base = toActionPhase()
    const s = toAgendaPhase(base, 'ixthian_artifact')

    const p0TechsBefore = s.players[0].techs.length
    const p1TechsBefore = s.players[1].techs.length

    // Seed 2 produces roll = 10 (>= 6). The pick queue pauses the phase: no next agenda reveal.
    const v1 = apply(s, { type: 'castVote', outcome: 'For', planets: [] }, 2)
    const v0 = apply(v1, { type: 'castVote', outcome: 'For', planets: [] }, 2)

    expect(v0.pendingArtifactTechs).toBeDefined()
    expect(v0.pendingArtifactTechs?.order).toEqual([0, 1])
    expect(v0.phase).toBe('agenda')
    expect(v0.agenda).toBeNull()
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('Speaker rolls a'))).toBe(true)
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('may research 2 technologies'))).toBe(true)

    // Seat 0 picks nothing (may): the queue advances to seat 1
    const pass = apply(v0, { type: 'artifactTechs' }, 2)
    expect(pass.pendingArtifactTechs?.order).toEqual([1])
    expect(pass.active).toBe(1)
    // Seat 1 picks nothing either: the queue drains and the agenda phase resumes
    const done = apply(pass, { type: 'artifactTechs' }, 2)
    expect(done.pendingArtifactTechs).toBeUndefined()
    expect(done.players[0].techs.length).toBe(p0TechsBefore)
    expect(done.players[1].techs.length).toBe(p1TechsBefore)
  })

  it('the picks honour prerequisites sequentially: the first tech can unlock the second', () => {
    const base = toActionPhase()
    const s = toAgendaPhase(base, 'ixthian_artifact')
    const v1 = apply(s, { type: 'castVote', outcome: 'For', planets: [] }, 2)
    const v0 = apply(v1, { type: 'castVote', outcome: 'For', planets: [] }, 2)

    // Seat 0 (l1z1x) starts with neural_motivator (green) and plasma_scoring (red) — no blue yet.
    // An illegal first pick (Gravity Drive needs 1 blue) is rejected
    const bad = applyMove(v0, { type: 'artifactTechs', techId: 'gravity_drive' }, 2)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('cannot be researched')

    // A legal pair researches both — and the FIRST tech (antimass, blue) is what makes the second
    // (Gravity Drive, 1 blue) researchable at all: lrr-components.md IA 1.1
    expect(researchable(v0.players[0])).not.toContain('duranium_armor')
    const good = applyMove(v0, { type: 'artifactTechs', techId: 'antimass_deflectors', secondTechId: 'gravity_drive' }, 2)
    expect(good.ok).toBe(true)
    if (good.ok) {
      expect(good.value.players[0].techs).toContain('antimass_deflectors')
      expect(good.value.players[0].techs).toContain('gravity_drive')
      expect(good.value.pendingArtifactTechs?.order).toEqual([1])
    }
  })

  it('For outcome with roll 1-5 destroys all units on Mecatol and 3 units in adjacent systems', () => {
    const base = toActionPhase()
    const mecatol = 'mecatol'
    const adjIds = neighbours(base.systems, mecatol)
    const adjSysId = adjIds[0]

    // Put units on Mecatol Rex: 1 dreadnought in space, 1 infantry on Mecatol planet
    let s = withUnits(base, mecatol, 0, ['dreadnought'])
    s = withUnits(s, mecatol, 1, ['infantry'], 'mecatol')

    // Put 4 cruisers in adjacent system for seat 0
    s = withUnits(s, adjSysId, 0, ['cruiser', 'cruiser', 'cruiser', 'cruiser'])

    const staged = toAgendaPhase(s, 'ixthian_artifact')

    // Seed 1 produces roll = 2 (<= 5)
    const v1 = apply(staged, { type: 'castVote', outcome: 'For', planets: [] }, 1)
    const v0 = apply(v1, { type: 'castVote', outcome: 'For', planets: [] }, 1)

    // All units in Mecatol system should be destroyed
    expect(v0.systems[mecatol].space).toHaveLength(0)
    expect(v0.systems[mecatol].planets[0].ground).toHaveLength(0)

    // In adjacent system, 3 of 4 cruisers destroyed, 1 cruiser remaining
    const remainingCruisers = v0.systems[adjSysId].space.filter((u: Unit) => u.owner === 0 && u.type === 'cruiser')
    expect(remainingCruisers).toHaveLength(1)

    // Verify log
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('destroyed all'))).toBe(true)
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('destroys 3 units in'))).toBe(true)
  })
})
