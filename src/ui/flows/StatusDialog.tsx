import { useState } from 'react'
import { isSecretObjective, objectiveDef } from '../../data/objectives'
import { isAi, scoreable, tokensGained } from '../../engine'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { Player } from '../../engine/types'

export function StatusDialog() {
  const { session, apply } = useGame()
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  if (!session) return null
  const state = session.state
  if (isAi(session.config, state.active)) return null
  const seat = state.active
  const player = state.players[seat]
  const gained = tokensGained(state, seat)
  // the new tokens start unplaced: the player adds them pool by pool
  const sheet = tokens ?? { ...player.tokens }
  const scoring = scoreable(state, seat)
  // Mirrors TokenSheet's own target/placed math: the confirm move needs the sheet to land on exactly
  // `target`, so block the click while it doesn't rather than let distributeTokens reject it after the fact.
  const target = player.tokens.tactic + player.tokens.fleet + player.tokens.strategy + gained
  const placed = sheet.tactic + sheet.fleet + sheet.strategy
  return (
    <div className="dialog" data-testid="status-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Status phase, {player.name}</span>
          <span className="sub">You gain {gained} command tokens.</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-status-confirm" disabled={placed !== target}
              onClick={() => { apply({ type: 'status', params: { tokens: sheet } }); setTokens(null) }}>Confirm</button>
          </div>
        </div>
        <div className="rowline" data-testid="status-scoring">
          <span className="lbl">Scoring</span>
          {scoring.length === 0 ? <span className="sub">Nothing to score.</span> : null}
          {scoring.map(id => (
            <span className={`chip ${isSecretObjective(id) ? 'purple' : 'gold'}`} key={id}>
              {isSecretObjective(id) ? 'Secret: ' : ''}{objectiveDef(id)?.text ?? id}
            </span>
          ))}
        </div>
        <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
      </div>
    </div>
  )
}
