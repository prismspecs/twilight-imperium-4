import { useState } from 'react'
import { agendaDef } from '../../data/agendas'
import { isAi, legalOutcomes, readyInfluencePlanets } from '../../engine'
import type { GameState } from '../../engine/types'
import { ownedPlanets } from '../format'
import { useGame } from '../store'

/** R10: which label a legal outcome shows on its button. For/Against and abstain print as-is; an
 * "Elect Player" outcome is a seat number as a string, shown as the player's own name; an "Elect Planet"
 * outcome is a planet id, shown as the planet's name. */
function outcomeLabel(state: GameState, outcome: string): string {
  if (outcome === 'For' || outcome === 'Against' || outcome === 'abstain') return outcome === 'abstain' ? 'Pass (no legal target to elect yet)' : outcome
  const seat = Number.parseInt(outcome, 10)
  if (Number.isInteger(seat) && state.players[seat]) return `Elect ${state.players[seat].name}`
  const planet = Object.values(state.systems).flatMap(sys => sys.planets).find(p => p.id === outcome)
  if (planet) return `Elect ${planet.name}`
  return outcome
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
          <span className="sub">{committed} influence committed</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-agenda-confirm" disabled={outcome === null}
              onClick={cast}>Cast vote</button>
          </div>
        </div>
        <div className="rowline">
          <span className="lbl">{def.name}</span>
        </div>
        <div className="sub" data-testid="agenda-text">{def.text}</div>
        <div className="rowline">
          <span className="lbl">Vote</span>
          {outcomes.map(o => (
            <button key={o} type="button" className={`pay${outcome === o ? ' on' : ''}`} data-testid={`agenda-outcome-${o}`}
              onClick={() => setOutcome(o)}>
              {outcomeLabel(state, o)}
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
