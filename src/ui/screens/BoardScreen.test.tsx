// src/ui/screens/BoardScreen.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, withPlanetOwner } from '../../engine/testUtils'
import { renderWithSession } from '../test/harness'
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

  it('previews a hovered tile\'s owner in the side panel, and reverts once the mouse leaves', () => {
    renderWithSession(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), <BoardScreen />)
    expect(screen.getByTestId('panel-0')).toBeTruthy()   // seat 0 (active) shows by default
    fireEvent.mouseEnter(screen.getByTestId('tile-bereg'))
    expect(screen.getByTestId('panel-1')).toBeTruthy()
    expect(screen.queryByTestId('panel-0')).toBeNull()
    fireEvent.mouseLeave(screen.getByTestId('tile-bereg'))
    expect(screen.getByTestId('panel-0')).toBeTruthy()
    expect(screen.queryByTestId('panel-1')).toBeNull()
  })

  it('hovering an unowned tile leaves the side panel exactly as it was', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    fireEvent.mouseEnter(screen.getByTestId('tile-bereg'))   // bereg is neutral by default
    expect(screen.getByTestId('panel-0')).toBeTruthy()
  })
})
