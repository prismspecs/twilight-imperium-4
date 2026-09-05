// src/ui/flows/ActionCard.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { deepFreeze, toActionPhase, withCards } from '../../engine/testUtils'
import type { GameState } from '../../engine/types'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function withHand(state: GameState, cards: string[]): GameState {
  const players = [...state.players] as GameState['players']
  players[0] = { ...players[0], actionCards: cards }
  return deepFreeze({ ...state, players })
}

const base = () => withCards(withCards(toActionPhase(), 0, ['imperial']), 1, [])

describe('R9 the action card hand', () => {
  it('the bar counts the hand and the panel plays a card, which spends the action', () => {
    renderWithSession(withHand(base(), ['industrial_initiative']), <BoardScreen />)
    expect(screen.getByTestId('btn-action-card').textContent).toContain('(1)')
    fireEvent.click(screen.getByTestId('btn-action-card'))
    expect(screen.getByTestId('action-card-industrial_initiative')).toBeTruthy()
    fireEvent.click(screen.getByTestId('play-industrial_initiative-0'))
    // the card is gone and the action is spent, so the turn is over
    fireEvent.click(screen.getByTestId('tab-side-0'))
    expect(screen.getByTestId('action-cards-0').textContent).toBe('0 of 7')
    expect(screen.getByTestId('turn-1').textContent).toBe('Your turn')
  })

  it('offers one play per legal target, named by the target', () => {
    renderWithSession(withHand(base(), ['mining_initiative']), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-action-card'))
    // seat 0 controls its home planet [0.0.0], and nothing else at the start
    expect(screen.getByTestId('play-mining_initiative-0').textContent).toContain('[0.0.0]')
    expect(screen.queryByTestId('play-mining_initiative-1')).toBeNull()
  })

  it('says in words why a card cannot be played instead of showing a mute dead card', () => {
    renderWithSession(withHand(base(), ['direct_hit_1', 'focused_research_1']), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-action-card'))
    // Direct Hit waits for a reaction window the game has no place for yet
    expect(screen.getByTestId('action-card-direct_hit_1').textContent).toContain('waits for a moment')
    // Focused Research is implemented, but 4 trade goods are needed and seat 0 has none
    expect(screen.getByTestId('action-card-focused_research_1').textContent).toContain('is a legal target for this card right now')
  })

  it('does not offer the hand at all when it is empty', () => {
    renderWithSession(base(), <BoardScreen />)
    expect(screen.getByTestId('btn-action-card').hasAttribute('disabled')).toBe(true)
  })
})
