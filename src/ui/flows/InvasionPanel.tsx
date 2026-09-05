import { useState } from 'react'
import { deriveSeed, readyInfluence } from '../../engine'
import { MECATOL_ID } from '../../data/map'
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

  const isMecatolSystem = state.tactical?.systemId === 'mecatol' || state.tactical?.systemId === MECATOL_ID
  const seat = state.active
  const readyInf = readyInfluence(state, seat)
  const tradeGoods = state.players[seat]?.tradeGoods ?? 0
  const totalInf = readyInf + tradeGoods
  const canRemoveCustodians = legal.some(m => m.type === 'removeCustodians')
  const exhaustedInfPlanets = Object.values(state.systems)
    .flatMap(sys => sys.planets)
    .filter(p => p.owner === seat && p.exhausted && p.influence > 0)
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
        {state.custodiansToken && isMecatolSystem ? (
          <div
            className="rowline"
            data-testid="custodians-block"
            style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <span className="lbl" style={{ color: 'var(--gold)' }}>Custodians</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="sub">
                The Custodians of Mecatol Rex demand 6 influence before ground forces may land (+1 VP).
              </span>
              <span className="sub" data-testid="custodians-breakdown" style={{ color: totalInf >= 6 ? 'var(--gold)' : 'var(--muted)' }}>
                Influence available: <strong>{totalInf} / 6</strong> ({readyInf} ready + {tradeGoods} TG)
                {exhaustedInfPlanets.length > 0 ? (
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>
                    · Exhausted: {exhaustedInfPlanets.map(p => `${planetLabel(state, p.id)} (${p.influence}i)`).join(', ')}
                  </span>
                ) : null}
              </span>
            </div>
            {canRemoveCustodians ? (
              <button
                type="button"
                className="btn gold"
                data-testid="btn-remove-custodians"
                onClick={() => apply({ type: 'removeCustodians' })}
              >
                Remove Custodians (6 Influence · +1 VP)
              </button>
            ) : (
              <button
                type="button"
                className="btn quiet"
                data-testid="btn-remove-custodians-disabled"
                disabled
                title="Requires 6 influence from ready planets and/or trade goods"
              >
                Cannot Remove (Need 6 Influence)
              </button>
            )}
          </div>
        ) : null}
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
