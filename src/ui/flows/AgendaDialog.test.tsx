// src/ui/flows/AgendaDialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, toAgendaPhase, withPlanetOwner } from '../../engine/testUtils'
import { homeSystemOf } from '../../engine/board'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

describe('R10 the agenda dialog', () => {
  it('shows the revealed agenda\'s printed text and For/Against outcomes, gated behind picking one', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('agenda-dialog').textContent).toContain('Mutiny')
    expect(screen.getByTestId('agenda-text').textContent).toContain('victory point')
    expect(screen.getByTestId('btn-agenda-confirm').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    expect(screen.getByTestId('btn-agenda-confirm').hasAttribute('disabled')).toBe(false)
  })

  it('advances to the next voter on the seat at the head of the order, speaker last', () => {
    const s = toAgendaPhase(toActionPhase(), 'mutiny')   // order [1, 0]: seat 1 (B) votes first
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('agenda-dialog').textContent).toContain('B')
    fireEvent.click(screen.getByTestId('agenda-outcome-Against'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))
    expect(screen.getByTestId('agenda-dialog').textContent).toContain('A')
  })

  it('committing a planet for influence exhausts it once the vote is cast', () => {
    const base = toActionPhase()
    const sysId = homeSystemOf(base, 1)
    const planetId = base.systems[sysId].planets.find(p => p.influence > 0)?.id ?? base.systems[sysId].planets[0].id
    const s = toAgendaPhase(withPlanetOwner(base, sysId, planetId, 1), 'mutiny')
    const { store } = renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId(`agenda-pay-${planetId}`))
    expect(screen.getByTestId('agenda-dialog').textContent).toContain('influence committed')
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))
    const after = store().session?.state
    expect(after?.systems[sysId].planets.find(p => p.id === planetId)?.exhausted).toBe(true)
  })

  it('an Elect Player agenda offers each player by name', () => {
    const s = toAgendaPhase(toActionPhase(), 'archived_secret')
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('agenda-outcome-0').textContent).toContain('A')
    expect(screen.getByTestId('agenda-outcome-1').textContent).toContain('B')
  })

  it('shows a dismissible overlay naming the resolved outcome once the round closes, and holds the board inert behind it', () => {
    const s = { ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] }   // one round only
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))         // seat 1 votes For
    fireEvent.click(screen.getByTestId('agenda-outcome-Against'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))         // seat 0 (speaker) votes Against, round resolves
    const overlay = screen.getByTestId('agenda-result')
    expect(overlay.textContent).toContain('Mutiny resolves: Against')   // a 0-0 tie goes to the speaker's own vote
    expect(screen.getByTestId('board-screen').getAttribute('inert')).not.toBeNull()
    fireEvent.click(screen.getByTestId('agenda-result-continue'))
    expect(screen.queryByTestId('agenda-result')).toBeNull()
  })

  it('R10 regression: the resolved-agenda overlay survives whatever move happens next, not just the instant it appears', () => {
    // the old log-scanning banner looked only at entries since the most recent move, so the very next move
    // (an AI's own, or the next player's) made the outcome invisible before anyone could read it
    const s = { ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] }
    const { store } = renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))
    fireEvent.click(screen.getByTestId('agenda-outcome-Against'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))
    expect(screen.getByTestId('agenda-result')).toBeTruthy()
    // force a further state change the way a background AI turn would, without going through the dialog
    const move = store().legal[0]
    expect(move).toBeTruthy()
    store().apply(move)
    expect(screen.getByTestId('agenda-result')).toBeTruthy()
  })
})
