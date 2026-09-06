// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MiltyDraftScreen } from './MiltyDraftScreen'
import type { DraftPlayer } from '../../engine/draft/miltyDraft'

describe('MiltyDraftScreen', () => {
  const players: DraftPlayer[] = [
    { name: 'Alice', color: 'blue', playerType: 'human' },
    { name: 'Bob', color: 'red', playerType: 'human' },
    { name: 'Charlie', color: 'green', playerType: 'human' },
  ]

  it('renders draft pools for factions, slices, and positions', () => {
    render(
      <MiltyDraftScreen
        playerCount={3}
        players={players}
        seed={42}
        minutes={15}
        onBackToSetup={() => {}}
        onStartGame={() => {}}
      />,
    )

    expect(screen.getByTestId('milty-draft-screen')).toBeTruthy()
    expect(screen.getByTestId('draft-factions-pool')).toBeTruthy()
    expect(screen.getByTestId('draft-slices-pool')).toBeTruthy()
    expect(screen.getByTestId('draft-positions-pool')).toBeTruthy()
    expect(screen.getByTestId('draft-roster')).toBeTruthy()
  })

  it('allows human player to draft an available option on their turn', () => {
    render(
      <MiltyDraftScreen
        playerCount={3}
        players={players}
        seed={42}
        minutes={15}
        onBackToSetup={() => {}}
        onStartGame={() => {}}
      />,
    )

    // Player 0 (Alice) starts. Draft a position (Position 1 / Speaker)
    const pos1Btn = screen.getByTestId('draft-pick-position-1')
    fireEvent.click(pos1Btn)

    // Position 1 should now be claimed by Alice
    expect(screen.getByTestId('claimed-position-1').textContent).toBe('Alice')

    // Turn moves to Player 1 (Bob). Player 1 drafts a faction.
    const factionBtns = screen.getAllByTestId(/^draft-pick-faction-/)
    expect(factionBtns.length).toBeGreaterThan(0)
    const firstFactionBtn = factionBtns[0]
    fireEvent.click(firstFactionBtn)

    // Faction is claimed
    expect(screen.getByTestId('draft-roster').textContent).toContain('Bob')
  })

  it('provides a launch button once draft is complete', async () => {
    const onStartGame = vi.fn()
    render(
      <MiltyDraftScreen
        playerCount={3}
        players={[
          { name: 'AI 1', color: 'blue', playerType: 'ai' },
          { name: 'AI 2', color: 'red', playerType: 'ai' },
          { name: 'AI 3', color: 'green', playerType: 'ai' },
        ]}
        seed={42}
        minutes={15}
        autoDraftAi={true}
        onBackToSetup={() => {}}
        onStartGame={onStartGame}
      />,
    )

    // When all players are AI with autoDraftAi enabled, draft completes
    const launchBtn = await screen.findByTestId('btn-launch-drafted-game')
    expect(launchBtn).toBeTruthy()

    fireEvent.click(launchBtn)
    expect(onStartGame).toHaveBeenCalledTimes(1)
    const [config] = onStartGame.mock.calls[0]
    expect(config.players).toHaveLength(3)
    expect(config.systems).toBeDefined()
    expect(config.speaker).toBe(0)
  })
})
