// src/ui/screens/GameOverScreen.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine'
import { BASE_CONFIG } from '../../engine/testUtils'
import type { GameState } from '../../engine/types'
import { renderWithSession } from '../test/harness'
import { GameOverScreen } from './GameOverScreen'

function makeGameOverState(): GameState {
  const base = createGame(BASE_CONFIG, 1)
  return {
    ...base,
    phase: 'ended',
    winner: 0,
    players: base.players.map((p, i) => i === 0 ? { ...p, vp: 10 } : p),
  }
}

describe('GameOverScreen', () => {
  it('renders winner and allows minimizing and reopening the game log', () => {
    const state = makeGameOverState()
    renderWithSession(state, <GameOverScreen />)

    expect(screen.getByTestId('game-over')).toBeTruthy()
    expect(screen.getByTestId('winner').textContent).toContain('wins')

    // Initially LogPanel is shown
    expect(screen.getByTestId('log-panel')).toBeTruthy()

    // Clicking the Close button in the LogPanel minimizes it
    const closeBtn = screen.getByTestId('btn-log-close')
    fireEvent.click(closeBtn)

    // Log panel is now minimized
    expect(screen.queryByTestId('log-panel')).toBeNull()
    const toggleBtn = screen.getByTestId('btn-toggle-log')
    expect(toggleBtn.textContent).toBe('📜 Show Game Log')

    // Clicking Show Game Log reopens it
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('log-panel')).toBeTruthy()
    expect(toggleBtn.textContent).toBe('Minimize Game Log')

    // Clicking toggle button again minimizes it
    fireEvent.click(toggleBtn)
    expect(screen.queryByTestId('log-panel')).toBeNull()
    expect(toggleBtn.textContent).toBe('📜 Show Game Log')
  })

  it('renders ranked standings and structured objective cards for multi-player games', () => {
    const base = createGame({
      players: [
        { faction: 'l1z1x', color: 'blue', name: 'Commander Alpha' },
        { faction: 'sol', color: 'red', name: 'General Beta' },
        { faction: 'saar', color: 'yellow', name: 'Nomad Gamma' },
      ],
      speaker: 0,
    }, 1)

    const state: GameState = {
      ...base,
      phase: 'ended',
      winner: 2,
      players: [
        { ...base.players[0], vp: 4, scoredObjectives: ['corner_the_market'] },
        { ...base.players[1], vp: 1, scoredObjectives: [] },
        { ...base.players[2], vp: 10, scoredObjectives: ['expand_borders', 'subdue_the_galaxy'] },
      ],
    }

    renderWithSession(state, <GameOverScreen />)

    // Champion banner
    expect(screen.getByTestId('winner').textContent).toContain('Nomad Gamma')
    expect(screen.getByTestId('winner').textContent).toContain('wins')

    // Champion card renders winner faction and score
    expect(screen.getByTestId('champion-card')).toBeTruthy()
    expect(screen.getByTestId('champion-card').textContent).toContain('Clan of Saar')
    expect(screen.getByTestId('champion-card').textContent).toContain('10')

    // Standings cards in ranked order: Nomad Gamma (1st), Commander Alpha (2nd), General Beta (3rd)
    const cards = screen.getAllByTestId(/standings-card-/)
    expect(cards).toHaveLength(3)
    expect(cards[0].textContent).toContain('Nomad Gamma')
    expect(cards[0].textContent).toContain('1ST')
    expect(cards[0].textContent).toContain('10')

    expect(cards[1].textContent).toContain('Commander Alpha')
    expect(cards[1].textContent).toContain('2ND')
    expect(cards[1].textContent).toContain('4')

    expect(cards[2].textContent).toContain('General Beta')
    expect(cards[2].textContent).toContain('3RD')
    expect(cards[2].textContent).toContain('1')

    // Structured objective items (not just raw joined text)
    const saarScored = screen.getByTestId('scored-list-2')
    expect(saarScored.textContent).toContain('Expand Borders')
    expect(saarScored.textContent).toContain('Subdue the Galaxy')
    expect(saarScored.textContent).toContain('STAGE I')
    expect(saarScored.textContent).toContain('STAGE II')

    // Empty state for General Beta
    const solScored = screen.getByTestId('scored-list-1')
    expect(solScored.textContent).toContain('No public objective scored')
  })

  it('renders 6-player game with secret objectives and handles new game click', () => {
    const base = createGame({
      players: [
        { faction: 'saar', color: 'yellow', name: 'Player' },
        { faction: 'yssaril', color: 'green', name: 'Yssaril Tribes' },
        { faction: 'jolnar', color: 'purple', name: 'Universities of Jol-Nar' },
        { faction: 'sol', color: 'blue', name: 'Federation of Sol' },
        { faction: 'hacan', color: 'orange', name: 'Emirates of Hacan' },
        { faction: 'letnev', color: 'red', name: 'Barony of Letnev' },
      ],
      speaker: 0,
    }, 1)

    const state: GameState = {
      ...base,
      phase: 'ended',
      winner: 0,
      round: 6,
      players: [
        {
          ...base.players[0],
          vp: 10,
          scoredObjectives: ['develop_weaponry', 'uf'], // uf is secret objective Unveil Flagship
        },
        { ...base.players[1], vp: 1, scoredObjectives: [] },
        { ...base.players[2], vp: 1, scoredObjectives: [] },
        { ...base.players[3], vp: 1, scoredObjectives: [] },
        { ...base.players[4], vp: 1, scoredObjectives: [] },
        { ...base.players[5], vp: 1, scoredObjectives: [] },
      ],
    }

    renderWithSession(state, <GameOverScreen />)

    // Check all 6 cards are rendered
    const cards = screen.getAllByTestId(/standings-card-/)
    expect(cards).toHaveLength(6)

    // Winner has 1ST rank and secret objective badge
    expect(cards[0].textContent).toContain('Player')
    expect(cards[0].textContent).toContain('1ST')
    expect(cards[0].textContent).toContain('10')
    expect(cards[0].textContent).toContain('SECRET')
    expect(cards[0].textContent).toContain('Unveil Flagship')

    // Click new game button
    const newGameBtn = screen.getByTestId('btn-new-game')
    fireEvent.click(newGameBtn)
  })
})


