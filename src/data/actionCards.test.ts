import { describe, expect, it } from 'vitest'
import { ACTION_CARDS, actionCardDef, findActionCard } from './actionCards'

describe('the base action card catalogue', () => {
  it('holds the 101 base-game printings, every id unique', () => {
    expect(ACTION_CARDS.length).toBe(101)
    expect(new Set(ACTION_CARDS.map(c => c.id)).size).toBe(101)
  })

  it('numbers duplicate printings instead of collapsing them', () => {
    const sabotage = ACTION_CARDS.filter(c => c.name === 'Sabotage')
    expect(sabotage.map(c => c.id)).toEqual(['sabotage_1', 'sabotage_2', 'sabotage_3', 'sabotage_4'])
    // a card printed once keeps a bare id
    expect(findActionCard('rise_of_a_messiah')?.name).toBe('Rise of a Messiah')
  })

  it('gives every card a phase, a timing window and printed text', () => {
    for (const card of ACTION_CARDS) {
      expect(card.name.length).toBeGreaterThan(0)
      expect(card.window.length).toBeGreaterThan(0)
      expect(card.text.length).toBeGreaterThan(0)
      expect(['action', 'agenda', 'strategy', 'status', 'any']).toContain(card.phase)
    }
  })

  it('keeps the printed text free of the catalogue\'s editorial notes', () => {
    for (const card of ACTION_CARDS) expect(card.text).not.toContain('[Note')
  })

  it('marks the cards that are played as a whole action with the window "Action"', () => {
    const asAction = ACTION_CARDS.filter(c => c.window === 'Action')
    expect(asAction.length).toBe(26)
    expect(asAction.every(c => c.phase === 'action')).toBe(true)
  })

  it('looks a card up by id and refuses an unknown one', () => {
    expect(actionCardDef('focused_research_1').text).toBe('Spend 4 trade goods to research 1 technology')
    expect(() => actionCardDef('no_such_card')).toThrow(/unknown action card/)
  })
})
