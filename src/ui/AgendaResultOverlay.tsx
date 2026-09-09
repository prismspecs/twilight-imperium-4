import { useEffect, useRef } from 'react'
import { describeEntry } from './logText'
import { useGame } from './store'

/** R10: the vote that just closed an agenda also closes the dialog that showed it (state.agenda goes null
 * the same instant), so without this the outcome flashes past unseen. Holds the board — and the chess
 * clock, same as a handoff — until a player acknowledges what was just decided. */
export function AgendaResultOverlay() {
  const { session, dismissAgendaResult } = useGame()
  const continueRef = useRef<HTMLButtonElement | null>(null)
  const shown = session !== null && session.agendaResult !== null
  useEffect(() => {
    if (shown) continueRef.current?.focus()
  }, [shown])
  if (!session || session.agendaResult === null) return null
  const state = session.state
  return (
    <div className="overlay" data-testid="agenda-result" role="dialog" aria-modal="true" aria-label="Agenda resolved">
      <h2 className="title goldtext">Agenda resolved</h2>
      <div className="tagline" data-testid="agenda-result-lines" style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', maxWidth: '520px' }}>
        {session.agendaResult.map((entry, i) => (
          <span key={i}>{describeEntry(state, entry).text}</span>
        ))}
      </div>
      <button ref={continueRef} type="button" className="btn gold" data-testid="agenda-result-continue" onClick={dismissAgendaResult}>
        OK
      </button>
    </div>
  )
}
