import { useState } from 'react'
import { isSecretObjective, objectiveDef } from '../../data/objectives'
import { isAi, neighbours, scoreable, tokensGained } from '../../engine'
import { ownedPlanets } from '../format'
import { Stepper } from './Stepper'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { GameState, Player, Seat } from '../../engine/types'

function systemOfPlanet(state: GameState, planetId: string): string | null {
  for (const sys of Object.values(state.systems)) if (sys.planets.some(p => p.id === planetId)) return sys.id
  return null
}

/** Arborec's Bioplasmosis: every owned planet with an eligible destination (itself excluded, same or an
 * adjacent system, also owned) alongside how many of that planet's infantry are still unqueued in `plan`. */
function bioplasmosisSources(state: GameState, seat: Seat, plan: Record<string, number>) {
  const owned = ownedPlanets(state, seat)
  return owned.flatMap(from => {
    const readyInfantry = from.ground.filter(u => u.owner === seat && u.type === 'infantry').length
    const queued = Object.entries(plan).filter(([key]) => key.startsWith(`${from.id}::`)).reduce((sum, [, n]) => sum + n, 0)
    const available = readyInfantry - queued
    if (available <= 0) return []
    const fromSysId = systemOfPlanet(state, from.id)
    if (!fromSysId) return []
    const reachable = new Set([fromSysId, ...neighbours(state.systems, fromSysId, state.players[seat].faction)])
    const destinations = owned.filter(p => p.id !== from.id && reachable.has(systemOfPlanet(state, p.id) ?? ''))
    if (!destinations.length) return []
    return [{ from, available, destinations }]
  })
}

export function StatusDialog() {
  const { session, apply } = useGame()
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  const [plan, setPlan] = useState<Record<string, number>>({})
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
  const sources = player.techs.includes('bioplasmosis') ? bioplasmosisSources(state, seat, plan) : []

  function confirm() {
    const redistribute: { infantryId: number; to: string }[] = []
    for (const [key, count] of Object.entries(plan)) {
      if (count <= 0) continue
      const [from, to] = key.split('::')
      const planet = ownedPlanets(state, seat).find(p => p.id === from)
      const ids = (planet?.ground ?? []).filter(u => u.owner === seat && u.type === 'infantry').map(u => u.id)
      for (const infantryId of ids.slice(0, count)) redistribute.push({ infantryId, to })
    }
    apply({ type: 'status', params: { tokens: sheet, redistribute: redistribute.length ? redistribute : undefined } })
    setTokens(null)
    setPlan({})
  }

  return (
    <div className="dialog" data-testid="status-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Status phase, {player.name}</span>
          <span className="sub">You gain {gained} command tokens.</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-status-confirm" disabled={placed !== target}
              onClick={confirm}>Confirm</button>
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
        <TokenSheet current={player.tokens} gained={gained} redistribute value={sheet} onChange={setTokens} />
        {sources.length > 0 ? (
          <div data-testid="bioplasmosis-panel">
            <div className="rowline" style={{ marginTop: 12 }}>
              <span className="lbl">Bioplasmosis: relocate ground forces</span>
            </div>
            {sources.map(({ from, available, destinations }) => (
              <div className="rowline" key={from.id}>
                <span className="sub">{from.name} ({available} ready)</span>
                {destinations.map(to => {
                  const key = `${from.id}::${to.id}`
                  return (
                    <span className="pay" key={key}>
                      <span className="sub">→ {to.name}</span>
                      <Stepper
                        id={`bioplasmosis-${from.id}-${to.id}`}
                        value={plan[key] ?? 0}
                        max={(plan[key] ?? 0) + available}
                        onChange={n => setPlan({ ...plan, [key]: n })}
                      />
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
