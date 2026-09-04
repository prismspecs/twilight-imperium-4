import { useEffect, useRef, useState } from 'react'
import { lastRolls } from '../history'
import { munitionsOptions, retreatTargetsOf } from '../moveOptions'
import { systemLabel, unitLabel } from '../format'
import { assignmentComplete, assignmentTargets, pendingFor } from '../../engine'
import { useGame } from '../store'
import type { Owner } from '../../engine/types'

export function CombatDialog() {
  const { session, legal, apply } = useGame()
  const [attacker, setAttacker] = useState(false)
  const [defender, setDefender] = useState(false)
  const head = session?.state ? pendingFor(session.state) : null
  // remembers which hit batch (owner + groups) the current `picks` describe
  const sigRef = useRef<string>('')
  // The human's picks for the current pending hit queue, seeded from the engine's default assignment so the
  // seat is never stranded: accepting the suggestion is one click, editing it is a genuine choice.
  const [picks, setPicks] = useState<{ destroy: number[]; sustain: number[] }>({ destroy: [], sustain: [] })
  const defaultPicks = legal.find(m => m.type === 'assignHits')
  useEffect(() => {
    // reset the picks whenever a different head is queued (owner and batch), so the previous round's choices
    // never leak into the next one's
    const sig = head ? `${head.owner}:${head.groups.map(g => `${g.count}${g.mode}`).join(',')}` : 'none'
    if (sigRef.current === sig) return
    sigRef.current = sig
    if (defaultPicks?.type === 'assignHits') setPicks({ destroy: defaultPicks.destroy, sustain: defaultPicks.sustain })
    else setPicks({ destroy: [], sustain: [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head])
  if (!session) return null
  const state = session.state
  const combat = state.tactical?.combat
  if (!combat) return null
  const allowed = munitionsOptions(legal)
  const retreats = retreatTargetsOf(legal)
  const name = (owner: Owner) => owner === 'guardian' ? 'Guardian fleet' : state.players[owner].name
  const munitions = (attacker && allowed.attacker) || (defender && allowed.defender)
    ? { attacker: attacker && allowed.attacker, defender: defender && allowed.defender }
    : undefined
  const assigning = head ? assignmentTargets(state) : null
  const assign = () => {
    if (picks.destroy.length === 0 && picks.sustain.length === 0) return
    apply({ type: 'assignHits', destroy: picks.destroy, sustain: picks.sustain })
  }
  const toggleSustain = (id: number) => {
    setPicks(p => {
      const destroy = p.destroy.filter(x => x !== id)
      const sustain = p.sustain.includes(id) ? p.sustain.filter(x => x !== id) : [...p.sustain, id]
      return { destroy, sustain }
    })
  }
  const toggleDestroy = (id: number) => {
    setPicks(p => {
      const sustain = p.sustain.filter(x => x !== id)
      const destroy = p.destroy.includes(id) ? p.destroy.filter(x => x !== id) : [...p.destroy, id]
      return { destroy, sustain }
    })
  }
  const complete = head && assigning && assignmentComplete(state, picks.destroy, picks.sustain)
  return (
    <div className="dialog" data-testid="combat-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Space combat in {systemLabel(state.tactical?.systemId ?? '')}</span>
          <span className="sub" data-testid="combat-round">Round {combat.round}</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-combat-round"
              disabled={!legal.some(m => m.type === 'combatRound')}
              onClick={() => { apply({ type: 'combatRound', munitions }); setAttacker(false); setDefender(false) }}>
              {combat.round === 0 ? 'Open fire' : `Fight round ${combat.round}`}
            </button>
          </div>
        </div>
        <div className="rowline">
          <span className="lbl">{name(combat.attacker)} attacks {name(combat.defender)}</span>
          {allowed.attacker ? (
            <label className="pay">
              <input type="checkbox" data-testid="munitions-attacker" checked={attacker} onChange={e => setAttacker(e.target.checked)} />
              Munitions Reserves, attacker
            </label>
          ) : null}
          {allowed.defender ? (
            <label className="pay">
              <input type="checkbox" data-testid="munitions-defender" checked={defender} onChange={e => setDefender(e.target.checked)} />
              Munitions Reserves, defender
            </label>
          ) : null}
        </div>
        {lastRolls(state).map((entry, i) => (
          <div className="logline roll" key={i} data-testid={`combat-rolls-${i}`}>
            {name(entry.owner)}: {entry.rolls.map(r => `${r.value}${r.hit ? ' hit' : ''}`).join(', ') || 'no dice'} ({entry.context})
          </div>
        ))}
        {head && assigning ? (
          <div className="assign" data-testid="hits-assignment">
            <div className="rowline lbl" data-testid="hits-to-assign">
              {name(head.owner)} must absorb {head.groups.reduce((n, g) => n + g.count, 0)} hit{head.groups.reduce((n, g) => n + g.count, 0) === 1 ? '' : 's'}
            </div>
            <div className="assignfleet">
              {assigning.sustain.map(u => {
                const destroying = picks.destroy.includes(u.id)
                const sustaining = picks.sustain.includes(u.id)
                return (
                  <div className="shiprow" key={u.id}>
                    <span className="unit">{unitLabel(u.type, state.players[head.owner])}</span>
                    <button type="button" className={`chipbtn${destroying ? ' on' : ''}`} data-testid={`assign-destroy-${u.id}`} onClick={() => toggleDestroy(u.id)}>Destroy</button>
                    <button type="button" className={`chipbtn${sustaining ? ' on' : ''}`} data-testid={`assign-sustain-${u.id}`} onClick={() => toggleSustain(u.id)}>Sustain</button>
                  </div>
                )
              })}
              {assigning.destroy.map(u => (
                <div className="shiprow" key={u.id}>
                  <span className="unit">{unitLabel(u.type, state.players[head.owner])}</span>
                  <button type="button" className={`chipbtn${picks.destroy.includes(u.id) ? ' on' : ''}`} data-testid={`assign-destroy-${u.id}`} onClick={() => toggleDestroy(u.id)}>Destroy</button>
                </div>
              ))}
            </div>
            <div className="rowline">
              <button type="button" className="btn gold" data-testid="btn-assign-hits" disabled={!complete} onClick={assign}>
                {complete ? 'Assign hits' : 'Assign hits'}
              </button>
              <button type="button" className="btn quiet" data-testid="btn-auto-assign"
                onClick={() => { if (defaultPicks?.type === 'assignHits') { apply({ type: 'assignHits', destroy: defaultPicks.destroy, sustain: defaultPicks.sustain }) } }}>
                Accept suggested
              </button>
            </div>
          </div>
        ) : null}
        {combat.retreating !== null ? (
          <div className="rowline" data-testid="retreat-announced">Retreat announced to {systemLabel(combat.retreatTo ?? '')}</div>
        ) : (
          <div className="rowline">
            {retreats.map(to => (
              <button key={to} type="button" className="btn quiet" data-testid={`btn-retreat-${to}`} onClick={() => apply({ type: 'retreat', to })}>
                Retreat to {systemLabel(to)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
