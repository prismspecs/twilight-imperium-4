import { useState } from 'react'
import { agendaDef } from '../../data/agendas'
import { formatOutcome, isAi, legalOutcomes, readyInfluencePlanets } from '../../engine'
import type { GameState, Seat } from '../../engine/types'
import { ownedPlanets } from '../format'
import { useGame } from '../store'

/** R10: which label a legal outcome shows on its button. For/Against and abstain print as-is;
 * other outcomes format according to the agenda's target (player, planet, law, or objective). */
function outcomeLabel(state: GameState, agendaId: string, outcome: string): string {
  if (outcome === 'For' || outcome === 'Against' || outcome === 'abstain') {
    return outcome === 'abstain' ? 'Pass (no legal target to elect yet)' : outcome
  }
  return `Elect ${formatOutcome(state, agendaId, outcome)}`
}

export function AgendaDialog() {
  const { session, apply } = useGame()
  const [outcome, setOutcome] = useState<string | null>(null)
  const [planets, setPlanets] = useState<string[]>([])
  if (!session) return null
  const state = session.state
  if (isAi(session.config, state.active) || state.phase !== 'agenda' || !state.agenda) return null
  const agenda = state.agenda
  const seat = state.active
  const player = state.players[seat]
  const def = agendaDef(agenda.revealed)
  const outcomes = legalOutcomes(state, agenda.revealed)
  const ready = readyInfluencePlanets(state, seat).map(id => ownedPlanets(state, seat).find(p => p.id === id)).filter(p => p !== undefined)
  const committed = planets.reduce((sum, id) => sum + (ready.find(p => p.id === id)?.influence ?? 0), 0)

  const votesCast = Object.entries(agenda.votes).flatMap(([seatStr, v]) => {
    if (!v) return []
    const s = Number.parseInt(seatStr, 10) as Seat
    const voter = state.players[s]
    const targetLabel = formatOutcome(state, agenda.revealed, v.outcome)
    return [{
      seat: s,
      name: voter?.name ?? `Seat ${s}`,
      outcome: v.outcome,
      targetLabel,
      influence: v.influence,
      abstained: v.influence === 0 || v.outcome === 'abstain',
    }]
  })

  function cast() {
    if (outcome === null) return
    if (apply({ type: 'castVote', outcome, planets })) {
      setOutcome(null)
      setPlanets([])
    }
  }

  return (
    <div className="dialog" data-testid="agenda-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Agenda {agenda.slot} of 2, {player.name}</span>
          <span className="sub">{committed} influence committed{committed === 0 ? ' (Abstaining)' : ''}</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-agenda-confirm" disabled={outcome === null}
              onClick={cast}>{committed === 0 ? 'Cast 0 votes (Abstain)' : `Cast vote (${committed})`}</button>
          </div>
        </div>
        <div className="rowline">
          <span className="lbl">{def.name}</span>
        </div>
        <div className="sub" data-testid="agenda-text">{def.text}</div>
        {votesCast.length > 0 && (
          <div className="rowline" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className="lbl" style={{ fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>Votes cast:</span>
            {votesCast.map(v => (
              <span
                key={v.seat}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <strong>{v.name}:</strong> {v.abstained ? 'Abstained' : `${v.targetLabel} (${v.influence})`}
              </span>
            ))}
          </div>
        )}
        <div className="rowline">
          <span className="lbl">Vote</span>
          {outcomes.map(o => (
            <button key={o} type="button" className={`pay${outcome === o ? ' on' : ''}`} data-testid={`agenda-outcome-${o}`}
              onClick={() => setOutcome(o)}>
              {outcomeLabel(state, agenda.revealed, o)}
            </button>
          ))}
        </div>
        {ready.length > 0 ? (
          <div className="payrow" data-testid="agenda-payrow">
            <span className="lbl">Commit influence</span>
            {ready.map(planet => (
              <button
                key={planet.id} type="button" className={`pay${planets.includes(planet.id) ? ' on' : ''}`}
                data-testid={`agenda-pay-${planet.id}`}
                onClick={() => setPlanets(planets.includes(planet.id) ? planets.filter(id => id !== planet.id) : [...planets, planet.id])}
                title={`${planet.name}: ${planet.influence} Influence`}
              >
                {planet.name} ({planet.influence})
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
