// tools/ti4dataset/ti4dataset.test.ts
// Self-contained unit tests for the AsyncTI4 decoder + replay, using a synthetic
// fixture so the suite runs fast and without the (large, optional) real data files.
// Run: npx vitest run tools/ti4dataset/ti4dataset.test.ts
import { describe, expect, it } from 'vitest'
import { decodeBoard, decodeUnitStack, decodeTile, hasBoard } from './decoder'
import { mapEvent, CLONE_ARCHETYPES } from './map'
import { normalizeFaction, normalizeTech, TECH_CODES } from './normalize'
import { Replay } from './replay'
import type { RawEvent } from './types'

// A minimal mapState: index0 = round, then one rich tile (home 101) and one empty.
const MINI_BOARD = JSON.stringify([
  3, // round
  // tile 101: home of saar with a carrier + warsun (idx3 secondary count) and a planet
  ['101', 1, // activated
    [['saar', [['u', 'cv', 1, 0, 0, 0], ['u', 'ws', 1, 1, 0, 0]]]], // space
    [['mr', 'saar', null, 0, 0, 0, 3, [['saar', [['u', 'gf', 2, 0, 0, 0]]]]]], // planet mr
    ['saar'], // command tokens
    [], // pds
    [], // control
  ],
  // tile 202: empty, neutral
  ['202', 0, [], [], [], [], []],
])

describe('decodeUnitStack', () => {
  it('counts idx2 + idx3 for units (secondary count is a real unit)', () => {
    expect(decodeUnitStack(['u', 'cv', 1, 0, 0, 0]).count).toBe(1)
    // warsun: count field 1 + secondary 1 = 2 physical warsuns
    expect(decodeUnitStack(['u', 'ws', 1, 1, 0, 0]).count).toBe(2)
  })
  it('classifies tokens and attachments', () => {
    expect(decodeUnitStack(['t', 'frontier', 1]).kind).toBe('token')
    expect(decodeUnitStack(['a', 'cybernetic', 1]).kind).toBe('attachment')
  })
})

describe('decodeTile / decodeBoard', () => {
  const board = decodeBoard(MINI_BOARD)
  it('parses round and tiles', () => {
    expect(board).not.toBeNull()
    expect(board!.round).toBe(3)
    expect(Object.keys(board!.tiles)).toContain('101')
    expect(Object.keys(board!.tiles)).toContain('202')
  })
  it('captures activation, space units, planet control and ground', () => {
    const t = decodeTile(['101', 1, [['saar', [['u', 'cv', 1, 0, 0, 0]]]], [['mr', 'saar', null, 0, 0, 0, 3, [['saar', [['u', 'gf', 1, 0, 0, 0]]]]]], [], [], []])
    expect(t.activated).toBe(true)
    expect(t.space['saar'][0].code).toBe('cv')
    expect(t.planets[0].name).toBe('mr')
    expect(t.planets[0].controller).toBe('saar')
    expect(t.planets[0].ground[0].code).toBe('gf')
  })
  it('handles malformed input', () => {
    expect(decodeBoard('not json')).toBeNull()
    expect(decodeTile([]).id).toBe('?')
  })
})

describe('Replay', () => {
  const events: RawEvent[] = [
    { seq: 1, archetype: 'ROUND_STARTED', round: 1, phase: 'strategy', faction: null, timestamp: 0, payload: { round: 1 } },
    { seq: 2, archetype: 'SC_PICKED', round: 1, phase: 'strategy', faction: 'saar', timestamp: 0, payload: { scNumber: 4 } },
    { seq: 3, archetype: 'TECH_RESEARCHED', round: 1, phase: 'playerSetup', faction: 'saar', timestamp: 0, payload: { techId: 'gd', paymentType: 'noPay' } },
    { seq: 4, archetype: 'OBJECTIVE_SCORED', round: 2, phase: 'action', faction: 'saar', timestamp: 0, payload: { objectiveId: 'expand_borders', category: 'PUBLIC' } },
    { seq: 5, archetype: 'STATUS_SCORING', round: 2, phase: 'statusScoring', faction: null, timestamp: 0, payload: { subEvents: [{ type: 'OBJECTIVE_SCORED', faction: 'saar', objectiveId: 'gamf', category: 'SECRET' }] } },
  ]

  const replay = new Replay(events)
  replay.run()
  const saar = replay.player('saar')

  it('accumulates techs in order', () => {
    expect(saar.techs).toEqual(['gd'])
  })
  it('tracks strategy cards', () => {
    expect(saar.strategyCards).toEqual([4])
  })
  it('adds points for scored objectives', () => {
    // expand_borders (public stage I) = 1, gamf secret = 1
    expect(saar.vp).toBe(2)
    expect(saar.scoredObjectives).toEqual(['expand_borders', 'gamf'])
  })
})

describe('hasBoard', () => {
  it('detects mapState presence', () => {
    expect(hasBoard({ mapState: MINI_BOARD } as RawEvent)).toBe(true)
    expect(hasBoard({} as RawEvent)).toBe(false)
  })
})

describe('normalizeFaction', () => {
  it('maps base factions through unchanged', () => {
    expect(normalizeFaction('saar')).toBe('saar')
    expect(normalizeFaction('yssaril')).toBe('yssaril')
  })
  it('aliases known AsyncTI4 casing variants', () => {
    expect(normalizeFaction('sardakk_norr')).toBe('sardakk')
  })
  it('returns null for homebrew factions not in the base 17', () => {
    expect(normalizeFaction('keleresm')).toBeNull()
    expect(normalizeFaction('cabal')).toBeNull()
    expect(normalizeFaction(null)).toBeNull()
  })
})

describe('normalizeTech', () => {
  it('maps base and PoK tech codes to canonical ids', () => {
    expect(normalizeTech('gd')).toBe('gravity_drive')
    expect(normalizeTech('pa')).toBe('psychoarchaeology')
    expect(normalizeTech('inf2')).toBe('infantry_ii')
  })
  it('returns null for faction/homebrew tech codes', () => {
    expect(normalizeTech('iihq')).toBeNull()
    expect(normalizeTech('ers')).toBeNull()
    expect(normalizeTech(null)).toBeNull()
  })
  it('every entry maps to a snake_case canonical id', () => {
    for (const [code, id] of Object.entries(TECH_CODES)) {
      expect(code).toMatch(/^[a-z0-9_]+$/)
      expect(id).toMatch(/^[a-z0-9_]+$/)
      expect(normalizeTech(code)).toBe(id)
    }
  })
})

describe('mapEvent', () => {
  it('maps tech research', () => {
    const m = mapEvent({ seq: 1, archetype: 'TECH_RESEARCHED', round: 1, phase: 'playerSetup', faction: 'saar', timestamp: 0, payload: { techId: 'gd' } })
    expect(m.mapped).toBe(true)
    expect(m.action.kind).toBe('research')
    expect(m.action.detail).toBe('gravity_drive')
  })
  it('flags unmapped tech', () => {
    const m = mapEvent({ seq: 1, archetype: 'TECH_RESEARCHED', round: 1, phase: 'playerSetup', faction: 'saar', timestamp: 0, payload: { techId: 'iihq' } })
    expect(m.mapped).toBe(false)
    expect(m.action.detail).toBeNull()
  })
  it('maps strategy pick and tactical action', () => {
    const pick = mapEvent({ seq: 1, archetype: 'SC_PICKED', round: 1, phase: 'strategy', faction: 'saar', timestamp: 0, payload: { scNumber: 4 } })
    expect(pick.mapped).toBe(true)
    expect(pick.action.detail).toBe('4')
    const tac = mapEvent({ seq: 2, archetype: 'TACTICAL_ACTION', round: 1, phase: 'action', faction: 'saar', timestamp: 0, payload: { activeSystem: '101', subEvents: [] } })
    expect(tac.mapped).toBe(true)
    expect(tac.action.kind).toBe('tactical_action')
    expect(tac.action.detail).toBe('expand:101')
  })
  it('classifies a tactical attack when combat sub-events exist', () => {
    const tac = mapEvent({ seq: 2, archetype: 'TACTICAL_ACTION', round: 1, phase: 'action', faction: 'saar', timestamp: 0, payload: { activeSystem: '207', subEvents: [{ type: 'COMBAT_SPACE' }] } })
    expect(tac.action.detail).toBe('attack:207')
  })
  it('marks bookkeeping as mapped=false, and it is not a clone archetype', () => {
    const m = mapEvent({ seq: 3, archetype: 'AGENDA_RESOLVED', round: 2, phase: 'agenda', faction: null, timestamp: 0, payload: {} })
    expect(m.mapped).toBe(false)
    expect(CLONE_ARCHETYPES.has('AGENDA_RESOLVED')).toBe(false)
  })
})
