import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { toActionPhase, toAgendaPhase, withUnits } from './testUtils'
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

  it('For outcome with roll 6-10 grants each player up to 2 technologies', () => {
    const base = toActionPhase()
    const s = toAgendaPhase(base, 'ixthian_artifact')

    const p0TechsBefore = s.players[0].techs.length
    const p1TechsBefore = s.players[1].techs.length

    // Seed 2 produces roll = 10 (>= 6)
    const v1 = apply(s, { type: 'castVote', outcome: 'For', planets: [] }, 2)
    const v0 = apply(v1, { type: 'castVote', outcome: 'For', planets: [] }, 2)

    // Both players should have researched 2 technologies
    expect(v0.players[0].techs.length).toBe(p0TechsBefore + 2)
    expect(v0.players[1].techs.length).toBe(p1TechsBefore + 2)

    // Verify log has the roll and research entries
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('Speaker rolls a'))).toBe(true)
    expect(v0.log.some(e => e.t === 'info' && e.text.includes('researches 2 technologies'))).toBe(true)
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
