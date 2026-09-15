// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase } from '../engine/testUtils'
import type { AgendaResultData } from '../store'
import { BoardScreen } from './screens/BoardScreen'
import { renderWithSession } from './test/harness'

const base: AgendaResultData = {
  agendaId: 'ixthian_artifact',
  slot: 1,
  agendaName: 'Ixthian Artifact',
  agendaKind: 'directive',
  agendaText: 'The Ixthian Artifact crumbles to dust.',
  outcome: 'For',
  formattedOutcome: 'For',
  tieBreak: false,
  speaker: 0,
  speakerName: 'P0',
  tally: { For: 5 },
  votes: [],
  logs: [{ t: 'info', text: 'Ixthian Artifact: Speaker rolls a 7 on 1d10' }],
}

describe('the Ixthian Artifact ceremony', () => {
  it('surfaces the Speaker\'s die roll front and centre, with what it means', () => {
    renderWithSession(toActionPhase(), <BoardScreen />, { agendaResult: { ...base, artifactRoll: 7 } })
    const block = screen.getByTestId('artifact-roll')
    expect(block.textContent).toContain('7')
    expect(block.textContent).toContain('researches 2 technologies')
  })
  it('a failed roll says the Artifact is silent', () => {
    renderWithSession(toActionPhase(), <BoardScreen />, { agendaResult: { ...base, artifactRoll: 3 } })
    const block = screen.getByTestId('artifact-roll')
    expect(block.textContent).toContain('3')
    expect(block.textContent).toContain('silent')
  })
  it('other agendas show no die ceremony', () => {
    renderWithSession(toActionPhase(), <BoardScreen />, { agendaResult: { ...base, agendaId: 'arms_reduction', agendaName: 'Arms Reduction', artifactRoll: undefined } })
    expect(screen.queryByTestId('artifact-roll')).toBeNull()
  })
})
