import { useState } from 'react'
import { deriveSeed } from '../../engine'
import { bombardTargets, landTargets } from '../moveOptions'
import { planetLabel } from '../format'
import { moveCount } from '../history'
import { Stepper } from './Stepper'
import { useGame } from '../store'

/**
 * R4.3: landing everything on the first planet is almost never what the player wants when the system has
 * two of them, so the panel proposes an even split: four infantry become 2 and 2, two become 1 and 1, and
 * an odd one goes to one of the planets. Which one is drawn from the game's own seed rather than
 * `Math.random`, so a replay proposes the same split. It is a suggestion: the steppers still go from 0 to
 * everything the player has.
 */
export function suggestedSplit(total: number, planets: number, seed: number): number[] {
  if (planets <= 0) return []
  const base = Math.floor(total / planets)
  const extra = total - base * planets
  const offset = planets > 0 ? Math.abs(seed) % planets : 0
  return Array.from({ length: planets }, (_, i) => base + ((i - offset + planets) % planets < extra ? 1 : 0))
}

export function InvasionPanel() {
  const { session, legal, apply } = useGame()
  const [counts, setCounts] = useState<Record<string, number>>({})
  if (!session) return null
  const state = session.state
  const landings = landTargets(legal)
  const bombards = bombardTargets(legal)
  // every landing offers the same carried infantry, so the pool is what the first one lists
  const pool = landings.length > 0 ? landings[0].infantryIds.length : 0
  const split = suggestedSplit(pool, landings.length, deriveSeed(session.seed, moveCount(state)))
  const countOf = (planetId: string, index: number) => counts[planetId] ?? split[index] ?? 0
  return (
    <div className="drawer bottom" data-testid="invasion-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Invasion</span>
          <span className="sub">Bombard, then land your infantry and fight it out.</span>
          <div className="right">
            {legal.some(m => m.type === 'groundCombatRound') ? (
              <button type="button" className="btn gold" data-testid="btn-ground-round" onClick={() => apply({ type: 'groundCombatRound' })}>
                Ground combat round
              </button>
            ) : null}
            <button type="button" className="btn quiet" data-testid="btn-end-invasion"
              disabled={!legal.some(m => m.type === 'endInvasion')} onClick={() => apply({ type: 'endInvasion' })}>Done invading</button>
          </div>
        </div>
        <div className="rowline">
          {bombards.map(planetId => (
            <button key={planetId} type="button" className="btn quiet" data-testid={`btn-bombard-${planetId}`} onClick={() => apply({ type: 'bombard', planetId })}>
              Bombard {planetLabel(state, planetId)}
            </button>
          ))}
        </div>
        {legal.some(m => m.type === 'removeCustodians') ? (
          <div className="rowline" data-testid="custodians-block" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="lbl" style={{ color: 'var(--gold)' }}>Custodians</span>
            <span className="sub" style={{ flex: 1, margin: '0 12px' }}>
              The Custodians of Mecatol Rex demand 6 influence before ground forces may land (+1 VP).
            </span>
            <button
              type="button"
              className="btn gold"
              data-testid="btn-remove-custodians"
              onClick={() => apply({ type: 'removeCustodians' })}
            >
              Remove Custodians (6 Influence · +1 VP)
            </button>
          </div>
        ) : (state.custodiansToken && state.tactical?.systemId === 'mecatol' ? (
          <div className="rowline" data-testid="custodians-notice" style={{ padding: '6px 0', color: 'var(--muted)' }}>
            <span className="lbl">Custodians</span>
            <span className="sub">
              The Custodians token remains on Mecatol Rex. Ground forces cannot land without spending 6 influence.
            </span>
          </div>
        ) : null)}
        {landings.map(({ planetId, infantryIds }, index) => {
          const count = countOf(planetId, index)
          return (
            <div className="rowline" key={planetId}>
              <span className="lbl">{planetLabel(state, planetId)}</span>
              <Stepper id={`land-count-${planetId}`} value={count} min={0} max={infantryIds.length}
                onChange={n => setCounts({ ...counts, [planetId]: n })} />
              <button type="button" className="btn gold" data-testid={`btn-land-${planetId}`} disabled={count === 0}
                onClick={() => { if (apply({ type: 'land', planetId, infantryIds: infantryIds.slice(0, count) })) setCounts({}) }}>
                {count === 0 ? 'Land none' : `Land ${String(count)} infantry`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
