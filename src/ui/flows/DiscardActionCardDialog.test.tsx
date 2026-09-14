// src/ui/flows/DiscardActionCardDialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HAND_LIMIT } from '../../engine'
import { toActionPhase, withPlayer } from '../../engine/testUtils'
import type { GameConfig, GameState } from '../../engine/types'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function stateWithExcessCards(): GameState {
  const cards = [
    'industrial_initiative',
    'economic_initiative',
    'mining_initiative',
    'frontline_deployment_1',
    'rise_of_a_messiah',
    'focused_research_1',
    'war_effort',
    'unstable_planet',
    'cripple_defenses',
  ] // 9 cards > 7 limit
  let s = toActionPhase()
  s = withPlayer(s, 0, { actionCards: cards })
  return {
    ...s,
    pendingActionCardDiscards: [0],
  }
}

describe('LRR 112 & 140 DiscardActionCardDialog', () => {
  it('does not render when pendingActionCardDiscards is not set', () => {
    const s = toActionPhase()
    renderWithSession(s, <BoardScreen />)
    expect(screen.queryByTestId('discard-action-card-dialog')).toBeNull()
  })

  it('does not render for an AI seat with pending discards', () => {
    const config: GameConfig = {
      speaker: 0,
      players: [
        { faction: 'l1z1x', color: 'blue', name: 'A', playerType: 'ai' },
        { faction: 'letnev', color: 'red', name: 'B' },
      ],
    }
    const s = {
      ...stateWithExcessCards(),
      pendingActionCardDiscards: [0 as const],
    }
    renderWithSession(s, <BoardScreen />, { config })
    expect(screen.queryByTestId('discard-action-card-dialog')).toBeNull()
  })

  it('renders for a human player with excess action cards and allows discarding', () => {
    const s = stateWithExcessCards()
    const { store } = renderWithSession(s, <BoardScreen />)

    const dialog = screen.getByTestId('discard-action-card-dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Hand Limit Exceeded')
    expect(dialog.textContent).toContain('You hold 9 cards (limit is 7). Discard 2 cards.')
    expect(screen.getByTestId('discard-card-row-industrial_initiative')).toBeTruthy()
    expect(screen.getByTestId('discard-card-row-economic_initiative')).toBeTruthy()

    // Discard the first card
    fireEvent.click(screen.getByTestId('btn-discard-industrial_initiative'))

    // State updated: hand length is now 8, still pending discard
    expect(store().session?.state.players[0].actionCards.length).toBe(8)
    expect(store().session?.state.players[0].actionCards).not.toContain('industrial_initiative')
    expect(store().session?.state.actionCardDiscard).toContain('industrial_initiative')
    expect(store().session?.state.pendingActionCardDiscards).toEqual([0])

    // Dialog is still visible asking to discard 1 more
    expect(screen.getByTestId('discard-action-card-dialog').textContent).toContain('Discard 1 card.')

    // Discard second card
    fireEvent.click(screen.getByTestId('btn-discard-economic_initiative'))

    // Now hand length is 7 (HAND_LIMIT), pending discards cleared
    expect(store().session?.state.players[0].actionCards.length).toBe(HAND_LIMIT)
    expect(store().session?.state.pendingActionCardDiscards).toBeUndefined()

    // Dialog has disappeared
    expect(screen.queryByTestId('discard-action-card-dialog')).toBeNull()
  })

  it('renders for Yssaril Scheming discard and dismisses after discarding 1 card', () => {
    const base = stateWithExcessCards()
    const s: GameState = {
      ...base,
      pendingActionCardDiscards: undefined,
      pendingSchemingDiscards: [0],
      players: [
        { ...base.players[0], faction: 'yssaril', actionCards: ['industrial_initiative', 'economic_initiative'] },
        base.players[1],
      ],
    }
    const { store } = renderWithSession(s, <BoardScreen />)

    const dialog = screen.getByTestId('discard-action-card-dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Scheming')
    expect(dialog.textContent).toContain('You drew 1 additional card via Scheming')

    // Discard 1 card
    fireEvent.click(screen.getByTestId('btn-discard-industrial_initiative'))

    expect(store().session?.state.pendingSchemingDiscards).toBeUndefined()
    expect(store().session?.state.players[0].actionCards).toEqual(['economic_initiative'])
    expect(screen.queryByTestId('discard-action-card-dialog')).toBeNull()
  })
})
