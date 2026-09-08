// src/ui/flows/AgendaDialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, toAgendaPhase, withPlanetOwner } from '../../engine/testUtils'
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
    const s = toAgendaPhase(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 'mutiny')
    const { store } = renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('agenda-pay-bereg'))
    expect(screen.getByTestId('agenda-dialog').textContent).toContain('influence committed')
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))
    const after = store().session?.state
    expect(after?.systems.bereg.planets.find(p => p.id === 'bereg')?.exhausted).toBe(true)
  })

  it('an Elect Player agenda offers each player by name', () => {
    const s = toAgendaPhase(toActionPhase(), 'archived_secret')
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('agenda-outcome-0').textContent).toContain('A')
    expect(screen.getByTestId('agenda-outcome-1').textContent).toContain('B')
  })

  it('shows a dismissible banner naming the resolved outcome once the round closes', () => {
    const s = { ...toAgendaPhase(toActionPhase(), 'mutiny'), agendaDeck: [] as string[] }   // one round only
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('agenda-outcome-For'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))         // seat 1 votes For
    fireEvent.click(screen.getByTestId('agenda-outcome-Against'))
    fireEvent.click(screen.getByTestId('btn-agenda-confirm'))         // seat 0 (speaker) votes Against, round resolves
    const banner = screen.getByTestId('agenda-outcome-banner')
    expect(banner.textContent).toContain('Mutiny resolves: Against')   // a 0-0 tie goes to the speaker's own vote
    fireEvent.click(screen.getByTestId('btn-dismiss-agenda-outcome'))
    expect(screen.queryByTestId('agenda-outcome-banner')).toBeNull()
  })
})
