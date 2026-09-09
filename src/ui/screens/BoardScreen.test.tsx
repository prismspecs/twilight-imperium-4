// src/ui/screens/BoardScreen.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, withPlanetOwner } from '../../engine/testUtils'
import { renderWithSession } from '../test/harness'
import type { GameState } from '../../engine/types'
import { BoardScreen } from './BoardScreen'

describe('the board screen layout', () => {
  it('publishes the viewport scale on the app element', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    const app = screen.getByTestId('board-screen')
    expect(app.style.getPropertyValue('--k')).not.toBe('')
    expect(app.style.getPropertyValue('--s')).not.toBe('')
  })

  it('holds the board and its overlays in the stage, and the bars outside it', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    const stage = screen.getByTestId('stage')
    expect(stage.contains(screen.getByTestId('board-map'))).toBe(true)
    expect(stage.contains(screen.getByTestId('tile-mecatol'))).toBe(true)
    // the docked regions are siblings of the stage, never children: they follow the viewport, not the board
    expect(stage.contains(screen.getByTestId('player-0'))).toBe(false)
    expect(stage.contains(screen.getByTestId('panel-0'))).toBe(false)
    // a single side panel; the second player has no separate right-hand column
    expect(stage.contains(screen.queryByTestId('panel-1'))).toBe(false)
    expect(stage.contains(screen.getByTestId('btn-tactical'))).toBe(false)
  })

  it('marks the stage as modal-with-deck while a secondary is open, so the right deck stays clickable above it', () => {
    // The modal stage (z-index 85) used to swallow every click aimed at the right deck (z-index 80) while
    // a dialog like the Politics secondary was open. The deck now floats at 86 and the stage pads itself
    // out of its way; these two classes are the contract.
    const state: GameState = { ...toActionPhase(), pendingSecondary: { card: 'politics', owner: 1, queue: [0] } }
    renderWithSession(state, <BoardScreen />)
    const stage = screen.getByTestId('stage')
    expect(stage.className).toContain('has-modal')
    expect(stage.className).toContain('right-deck-open')
    expect(screen.getByTestId('secondary-panel')).toBeTruthy()
  })

  it('previews a hovered tile\'s owner in the side panel, and reverts once the mouse leaves', () => {
    const state = toActionPhase()
    // Pick a non-home system to test with
    const systemId = Object.keys(state.systems).find(id => !id.startsWith('home-') && id !== 'mecatol') || Object.keys(state.systems)[0]
    const planetId = state.systems[systemId].planets[0]?.id
    if (planetId) {
      renderWithSession(withPlanetOwner(state, systemId, planetId, 1), <BoardScreen />)
      expect(screen.getByTestId('panel-0')).toBeTruthy()   // seat 0 (active) shows by default
      fireEvent.mouseEnter(screen.getByTestId(`tile-${systemId}`))
      expect(screen.getByTestId('panel-1')).toBeTruthy()
      expect(screen.queryByTestId('panel-0')).toBeNull()
      fireEvent.mouseLeave(screen.getByTestId(`tile-${systemId}`))
      expect(screen.getByTestId('panel-0')).toBeTruthy()
      expect(screen.queryByTestId('panel-1')).toBeNull()
    }
  })

  it('hovering an unowned tile leaves the side panel exactly as it was', () => {
    const state = toActionPhase()
    const systemId = Object.keys(state.systems).find(id => !id.startsWith('home-') && id !== 'mecatol') || Object.keys(state.systems)[0]
    renderWithSession(state, <BoardScreen />)
    fireEvent.mouseEnter(screen.getByTestId(`tile-${systemId}`))
    expect(screen.getByTestId('panel-0')).toBeTruthy()
  })
})
