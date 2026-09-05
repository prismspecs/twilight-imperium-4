import { describe, expect, it } from 'vitest'
import { AGENDAS, agendaDef, findAgenda } from './agendas'

describe('the base agenda catalogue', () => {
  it('holds the 50 base-game agendas, every id unique', () => {
    expect(AGENDAS.length).toBe(50)
    expect(new Set(AGENDAS.map(a => a.id)).size).toBe(50)
  })

  it('splits them into 34 laws and 16 directives', () => {
    expect(AGENDAS.filter(a => a.kind === 'law').length).toBe(34)
    expect(AGENDAS.filter(a => a.kind === 'directive').length).toBe(16)
  })

  it('gives every agenda an election target and printed outcomes', () => {
    for (const agenda of AGENDAS) {
      expect(agenda.name.length).toBeGreaterThan(0)
      expect(agenda.target.length).toBeGreaterThan(0)
      expect(agenda.text.length).toBeGreaterThan(0)
      // the catalogue's reveal reminder is not part of the election target
      expect(agenda.target).not.toContain('When this agenda is revealed')
    }
  })

  it('joins the For and the Against outcome of a For/Against agenda', () => {
    const arms = agendaDef('arms_reduction')
    expect(arms.target).toBe('For/Against')
    expect(arms.text).toContain('For:')
    expect(arms.text).toContain('Against:')
  })

  it('looks an agenda up by id and refuses an unknown one', () => {
    expect(findAgenda('archived_secret')?.kind).toBe('directive')
    expect(() => agendaDef('no_such_agenda')).toThrow(/unknown agenda/)
  })
})
