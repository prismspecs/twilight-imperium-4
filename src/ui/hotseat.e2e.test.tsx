// src/ui/hotseat.e2e.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

function click(testId: string): void {
  fireEvent.click(screen.getByTestId(testId))
}
function text(testId: string): string {
  return screen.getByTestId(testId).textContent ?? ''
}
/**
 * R3.2: a spent turn ends by itself when nothing free is left, and waits for a click when a trade post is
 * still open. Both are correct, so the script ends the turn only when the button is actually offered.
 */
function endTurn(): void {
  const button = screen.queryByTestId('btn-end-turn')
  if (button) fireEvent.click(button)
}
/** The hot-seat interstitial appears whenever the seat to act changes; clicking through it is part of playing. */
function handoff(): void {
  const button = screen.queryByTestId('handoff-continue')
  if (button) fireEvent.click(button)
}

describe('a scripted hot-seat game', () => {
  it('R3.1 to R3.3: plays a full first round through the rendered UI', () => {
    window.location.hash = '#/?seed=7'
    render(<App ticking={false} />)

    // setup (seat 0 is the human by default; seats 1 and 2 default to AI, so switch them back for this hot-seat script)
    fireEvent.change(screen.getByTestId('seat-name-0'), { target: { value: 'Despot' } })
    fireEvent.change(screen.getByTestId('seat-name-1'), { target: { value: 'Kael' } })
    fireEvent.change(screen.getByTestId('seat-name-2'), { target: { value: 'Soran' } })
    click('controller-1-human')
    click('controller-2-human')
    click('btn-start')
    expect(text('round')).toBe('Round 1 of 8, strategy phase')
    expect(text('clock-0')).toBe('15:00')

    // 3-player snake draft: [0, 1, 2, 2, 1, 0]
    expect(screen.getByTestId('pick-prompt').textContent).toBe('Pick a strategy card')
    click('strategy-card-leadership') // seat 0
    handoff()
    click('strategy-card-trade')      // seat 1
    handoff()
    click('strategy-card-technology') // seat 2 (pick 1)
    click('strategy-card-warfare')    // seat 2 (pick 2)
    handoff()
    click('strategy-card-diplomacy')  // seat 1
    handoff()
    click('strategy-card-imperial')   // seat 0

    // Enters action phase
    expect(text('round')).toBe('Round 1 of 8, action phase')
    expect(text('strategy-state-leadership')).toBe('Despot, ready')
    expect(text('turn-0')).toBe('Your turn') // Leadership has initiative 1

    // Board elements verified
    expect(screen.getByTestId('board-screen')).toBeTruthy()
    expect(screen.getByTestId('custodians-token')).toBeTruthy()
    expect(screen.getByTestId('map-controls')).toBeTruthy()

    // Turn 1: Despot plays Leadership primary
    click('btn-strategic')
    click('strategic-pick-leadership')
    expect(text('token-tactic')).toBe('3')
    for (let i = 0; i < 3; i++) click('token-tactic-plus')
    expect(text('token-tactic')).toBe('6')
    click('btn-strategic-confirm')
    // the panel follows the active seat (the secondary resolver), so flip to seat 0 to see the primary's result
    click('tab-side-0')
    expect(text('tokens-0-tactic')).toBe('6')

    // Secondary resolved for seat 1 and seat 2
    handoff()
    click('btn-secondary-decline')
    handoff()
    click('btn-secondary-decline')
    handoff()

    // Turn finished and passed
    endTurn()
    handoff()

    // Next player's turn
    expect(text('turn-1')).toBe('Your turn')

    // Verify action log
    click('btn-log')
    const log = screen.getByTestId('log-panel').textContent ?? ''
    expect(log).toContain('Game started with Custodians token on Mecatol Rex')
    expect(log).toContain('Despot plays Leadership')
  })
})
