// src/ui/flows/ReactionPanel.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openCombatWindows } from '../../engine/reactions'
import { toActionPhase, withPlayer, withTactical, withUnits } from '../../engine/testUtils'
import type { GameConfig, GameState } from '../../engine/types'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function combatWithReaction(): GameState {
  let s = withUnits(toActionPhase(1, 0), 'bereg', 0, ['cruiser', 'fighter'])
  s = withUnits(s, 'bereg', 1, ['destroyer'])
  s = withPlayer(s, 1, { actionCards: ['morale_boost_1'] })
  s = withTactical(s, {
    systemId: 'bereg',
    step: 'spaceCombat',
    combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] },
  })
  return openCombatWindows(s)
}

describe('R9 the reaction panel', () => {
  it('shows the window and the eligible card, blocking the combat roll until it is answered', () => {
    const s = combatWithReaction()
    expect(s.pendingReactions).toHaveLength(1)
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('reaction-panel').textContent).toContain('B')
    expect(screen.getByTestId('reaction-panel').textContent).toContain('space combat round 1')
    expect(screen.getByTestId('reaction-card-morale_boost_1')).toBeTruthy()
    expect(screen.getByTestId('btn-combat-round').hasAttribute('disabled')).toBe(true)   // blocked until answered
  })
  it('Decline closes the window and hands control back to the combat dialog', () => {
    const { store } = renderWithSession(combatWithReaction(), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-reaction-decline'))
    expect(screen.queryByTestId('reaction-panel')).toBeNull()
    expect(screen.getByTestId('btn-combat-round').hasAttribute('disabled')).toBe(false)
    expect(store().session?.state.pendingReactions).toEqual([])
  })
  it('playing the card resolves it and closes the window the same way', () => {
    const { store } = renderWithSession(combatWithReaction(), <BoardScreen />)
    fireEvent.click(screen.getByTestId('reaction-play-morale_boost_1-0'))
    expect(screen.queryByTestId('reaction-panel')).toBeNull()
    const after = store().session?.state
    expect(after?.pendingReactions).toEqual([])
    expect(after?.players[1].actionCards).toEqual([])   // the card left the hand
  })
  it('does not render for an AI seat\'s own reaction window', () => {
    const config: GameConfig = {
      speaker: 0,
      players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B', playerType: 'ai' }],
    }
    renderWithSession(combatWithReaction(), <BoardScreen />, { config })
    expect(screen.queryByTestId('reaction-panel')).toBeNull()
  })
})
