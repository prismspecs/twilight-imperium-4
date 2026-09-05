import { useEffect, useRef, useState } from 'react'
import { lastRolls } from '../history'
import { munitionsOptions, retreatTargetsOf } from '../moveOptions'
import { systemLabel, unitLabel } from '../format'
import { assignmentComplete, assignmentTargets, pendingFor } from '../../engine'
import { useGame } from '../store'
import type { Owner, Seat } from '../../engine/types'

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
          <span className="tab">Space combat in {systemLabel(state.tactical?.systemId ?? '', state)}</span>
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
        <div className="combat-rolls-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '6px 0' }}>
          {lastRolls(state).map((entry, i) => {
            const hits = entry.rolls.filter(r => r.hit).length
            const rollParts = entry.rolls.map(r => {
              const p = entry.owner === 'guardian' ? null : state.players[entry.owner as Seat]
              const uName = p ? unitLabel(r.unit, p) : (r.unit.charAt(0).toUpperCase() + r.unit.slice(1))
              return `${uName}: [${r.value}]${r.hit ? ' ★ HIT' : ' miss'}`
            })
            return (
              <div
                className="logline roll"
                key={i}
                data-testid={`combat-rolls-${i}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '8px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '4px',
                  borderLeft: hits > 0 ? '3px solid #eab308' : '3px solid #64748b',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                  <span style={{ color: hits > 0 ? '#fbbf24' : '#e2e8f0' }}>
                    {name(entry.owner)}: {hits} hit{hits === 1 ? '' : 's'}
                  </span>
                  <span className="sub" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                    {entry.context}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {rollParts.length > 0 ? rollParts.join('  •  ') : 'no dice rolled'}
                </div>
              </div>
            )
          })}
        </div>
        {state.log
          .filter((e): e is Extract<typeof e, { t: 'info' }> => e.t === 'info' && (
            e.text.includes('loses:') ||
            e.text.includes('fighter') ||
            e.text.includes('hits assigned') ||
            e.text.includes('assigns') ||
            e.text.includes('retreats') ||
            e.text.includes('Assault Cannon')
          ))
          .slice(-4)
          .length > 0 ? (
          <div
            className="combat-events-box"
            style={{
              marginTop: '6px',
              padding: '6px 10px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>
              Casualties & Hit Assignments
            </div>
            {state.log
              .filter((e): e is Extract<typeof e, { t: 'info' }> => e.t === 'info' && (
                e.text.includes('loses:') ||
                e.text.includes('fighter') ||
                e.text.includes('hits assigned') ||
                e.text.includes('assigns') ||
                e.text.includes('retreats') ||
                e.text.includes('Assault Cannon')
              ))
              .slice(-4)
              .map((evt, idx) => {
                let text = evt.text
                for (const player of state.players) {
                  text = text.replaceAll(`seat ${player.seat}`, player.name)
                }
                for (const sys of Object.values(state.systems)) {
                  text = text.replaceAll(`in ${sys.id}`, `in ${systemLabel(sys.id, state)}`)
                }
                return (
                  <div key={idx} style={{ color: '#f1f5f9', marginBottom: '2px', lineHeight: 1.4 }}>
                    • {text}
                  </div>
                )
              })}
          </div>
        ) : null}
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
          <div className="rowline" data-testid="retreat-announced">Retreat announced to {systemLabel(combat.retreatTo ?? '', state)}</div>
        ) : (
          <div className="rowline">
            {retreats.map(to => (
              <button key={to} type="button" className="btn quiet" data-testid={`btn-retreat-${to}`} onClick={() => apply({ type: 'retreat', to })}>
                Retreat to {systemLabel(to, state)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
