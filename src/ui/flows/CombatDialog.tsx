import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { lastRolls } from '../history'
import { munitionsOptions, retreatTargetsOf } from '../moveOptions'
import { systemLabel, unitLabel } from '../format'
import { assignmentComplete, assignmentTargets, pendingFor } from '../../engine'
import { useGame } from '../store'
import { findActionCard } from '../../data/actionCards'
import { COLOUR_INK, SIGIL, tokenUrl } from '../art'
import { isAi } from '../../engine'
import { isShip } from '../../data/units'
import type { Owner, Seat } from '../../engine/types'

export function CombatDialog() {
  const { session, legal, apply } = useGame()
  const [attacker, setAttacker] = useState(false)
  const [defender, setDefender] = useState(false)
  const [showCards, setShowCards] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const rollTimerRef = useRef<number | null>(null)
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

  useEffect(() => {
    return () => {
      if (rollTimerRef.current !== null) {
        clearTimeout(rollTimerRef.current)
      }
    }
  }, [])

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

  const handleRollDice = () => {
    setIsRolling(true)
    if (rollTimerRef.current !== null) clearTimeout(rollTimerRef.current)
    rollTimerRef.current = window.setTimeout(() => {
      setIsRolling(false)
      rollTimerRef.current = null
    }, 300)
    apply({ type: 'combatRound', munitions })
    setAttacker(false)
    setDefender(false)
  }

  const complete = head && assigning && assignmentComplete(state, picks.destroy, picks.sustain)

  // Identify human player to show their action cards
  const humanSeat = state.players.findIndex(p => !isAi(session.config, p.seat))
  const humanPlayer = humanSeat >= 0 ? state.players[humanSeat as Seat] : state.players[0]

  const attackerPlayer = state.players[combat.attacker]
  const defenderPlayer = combat.defender === 'guardian' ? null : state.players[combat.defender]
  const attackerInk = attackerPlayer ? COLOUR_INK[attackerPlayer.color] : { accent: '#ef4444', tint: '#fca5a5', glow: 'rgba(239,68,68,0.4)' }
  const defenderInk = defenderPlayer ? COLOUR_INK[defenderPlayer.color] : { accent: '#94a3b8', tint: '#cbd5e1', glow: 'rgba(148,163,184,0.4)' }

  const currentSystemId = state.tactical?.systemId ?? ''
  const defenderShips = currentSystemId && state.systems[currentSystemId]
    ? state.systems[currentSystemId].space.filter(u => u.owner === combat.defender && isShip(u.type)).length
    : 0
  const attackerShips = currentSystemId && state.systems[currentSystemId]
    ? state.systems[currentSystemId].space.filter(u => u.owner === combat.attacker && isShip(u.type)).length
    : 0
  const isPdsDefense = combat.round <= 1 && defenderShips === 0

  const rollBtnLabel = isPdsDefense
    ? (combat.round === 0
        ? 'Fire Space Cannon (PDS)'
        : (attackerShips === 0 ? 'Fleet Destroyed (Done)' : 'Proceed to Invasion'))
    : combat.round === 0
      ? 'Open fire'
      : `Roll combat dice (Round ${combat.round})`

  const headerTitle = isPdsDefense
    ? `Space cannon defense in ${systemLabel(currentSystemId, state)}`
    : `Space combat in ${systemLabel(currentSystemId, state)}`

  const subRound = isPdsDefense
    ? (combat.round === 0 ? 'Defense Cannon Fire' : 'Defense Resolved')
    : `Round ${combat.round}`

  const combatEvents = (() => {
    // If round is 0 and no rolls or pending hits exist, combat just started: no events have occurred yet
    if (combat.round === 0 && combat.lastRolls.length === 0 && combat.pending.length === 0) {
      return []
    }
    let startIndex = -1
    for (let i = state.log.length - 1; i >= 0; i--) {
      const entry = state.log[i]
      if (entry.t === 'move' && (entry.move.type === 'endMovement' || (entry.move.type === 'startTactical' && entry.move.systemId === currentSystemId))) {
        startIndex = i
        break
      }
    }
    const pool = startIndex >= 0 ? state.log.slice(startIndex) : state.log
    return pool
      .filter((e): e is Extract<typeof e, { t: 'info' }> => {
        if (e.t !== 'info') return false
        const text = e.text
        const isCombatInfo =
          text.includes('loses:') ||
          text.includes('fighter') ||
          text.includes('hits assigned') ||
          text.includes('assigns') ||
          text.includes('retreats') ||
          text.includes('Assault Cannon') ||
          text.includes('Ambush') ||
          text.includes('Mentak') ||
          text.toLowerCase().includes('space cannon')
        if (!isCombatInfo) return false
        // Exclude events explicitly mentioning another system
        for (const sys of Object.values(state.systems)) {
          if (sys.id !== currentSystemId && text.includes(`in ${sys.id}`)) return false
        }
        // Exclude events explicitly naming third-party players not involved in this battle
        for (const p of state.players) {
          if (p.seat !== combat.attacker && p.seat !== combat.defender) {
            if (text.includes(`seat ${p.seat}`) || text.includes(p.name)) return false
          }
        }
        return true
      })
      .slice(-6)
  })()

  return (
    <div className="combat-modal-overlay" data-testid="combat-modal-overlay">
      <div className="dialog combat-dialog-modal" data-testid="combat-dialog">
        <div className="in">
          {/* Modal Header */}
          <div className="dhead">
            <span className="tab">{headerTitle}</span>
            <span className="sub" data-testid="combat-round">{subRound}</span>
            <div className="right">
              <button
                type="button"
                className="btn gold"
                data-testid="btn-combat-round"
                disabled={!legal.some(m => m.type === 'combatRound') || isRolling}
                onClick={handleRollDice}
              >
                {rollBtnLabel}
              </button>
            </div>
          </div>

          {/* Attacker vs Defender Visual Banner */}
          <div className="combat-matchup-bar">
            <div className="combat-matchup-player attacker" style={{ '--faction-color': attackerInk.accent } as CSSProperties}>
              <img
                className="combat-matchup-sigil"
                src={attackerPlayer ? (SIGIL[attackerPlayer.faction] || tokenUrl(attackerPlayer.faction, 'control')) : ''}
                alt={name(combat.attacker)}
                onError={e => {
                  if (attackerPlayer) (e.currentTarget as HTMLImageElement).src = tokenUrl(attackerPlayer.faction, 'control')
                }}
              />
              <div className="combat-matchup-info">
                <span className="combat-matchup-name" style={{ color: attackerInk.accent }}>{name(combat.attacker)}</span>
                <span className="combat-matchup-role">Attacker</span>
              </div>
            </div>

            <div className="combat-matchup-vs">VS</div>

            <div className="combat-matchup-player defender" style={{ '--faction-color': defenderInk.accent } as CSSProperties}>
              <img
                className="combat-matchup-sigil"
                src={defenderPlayer ? (SIGIL[defenderPlayer.faction] || tokenUrl(defenderPlayer.faction, 'control')) : tokenUrl('sol', 'control')}
                alt={name(combat.defender)}
                onError={e => {
                  if (defenderPlayer) (e.currentTarget as HTMLImageElement).src = tokenUrl(defenderPlayer.faction, 'control')
                }}
              />
              <div className="combat-matchup-info">
                <span className="combat-matchup-name" style={{ color: defenderInk.accent }}>{name(combat.defender)}</span>
                <span className="combat-matchup-role">{isPdsDefense ? 'Defender (PDS)' : 'Defender'}</span>
              </div>
            </div>
          </div>

          {isPdsDefense && combat.round === 1 && attackerShips === 0 ? (
            <div className="info-callout good" data-testid="pds-defense-destroyed-notice">
              <strong>Defense successful:</strong> all invading ships were destroyed by space cannon fire. The tactical action has been repelled.
            </div>
          ) : isPdsDefense && combat.round === 1 ? (
            <div className="info-callout" data-testid="pds-defense-resolved-notice">
              <strong>Space cannon resolved:</strong> defense fire is complete. Click &quot;Proceed to Invasion&quot; to continue.
            </div>
          ) : null}

          {/* Munitions Reserves & Matchup Info */}
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

          {/* Visual D10 Dice Tray & Combat Rolls */}
          <div className="combat-rolls-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
            {lastRolls(state).map((entry, i) => {
              const hits = entry.rolls.filter(r => r.hit).length
              const rollParts = entry.rolls.map(r => {
                const p = entry.owner === 'guardian' ? null : state.players[entry.owner as Seat]
                const uName = p ? unitLabel(r.unit, p) : (r.unit.charAt(0).toUpperCase() + r.unit.slice(1))
                return `${uName}: [${r.value}]${r.hit ? ' ★ HIT' : ' miss'}`
              })
              const ownerColor = entry.owner === 'guardian' ? '#94a3b8' : COLOUR_INK[state.players[entry.owner as Seat].color].accent

              return (
                <div
                  className="logline roll combat-roll-group"
                  key={i}
                  data-testid={`combat-rolls-${i}`}
                  style={{
                    borderLeft: hits > 0 ? '3px solid #eab308' : '3px solid #64748b',
                  }}
                >
                  <div className="roll-group-header">
                    <span className="roll-owner" style={{ color: hits > 0 ? '#fbbf24' : '#e2e8f0' }}>
                      <span className="roll-owner-dot" style={{ background: ownerColor }} />
                      {name(entry.owner)}: {hits} hit{hits === 1 ? '' : 's'}
                    </span>
                    <span className="sub roll-context">
                      {entry.context}
                    </span>
                  </div>

                  {/* Visual D10 Dice Card Tray */}
                  {entry.rolls.length > 0 ? (
                    <div className="combat-dice-tray">
                      {entry.rolls.map((r, rIdx) => {
                        const p = entry.owner === 'guardian' ? null : state.players[entry.owner as Seat]
                        const uName = p ? unitLabel(r.unit, p) : (r.unit.charAt(0).toUpperCase() + r.unit.slice(1))
                        return (
                          <div key={rIdx} className={`d10-die-card${r.hit ? ' is-hit' : ' is-miss'}`}>
                            <div className="d10-face">
                              <span className="d10-value">{r.value}</span>
                              {r.hit ? <span className="d10-star" aria-hidden="true">★</span> : null}
                            </div>
                            <div className="d10-unit-label" title={uName}>{uName}</div>
                            <div className={`d10-result-badge${r.hit ? ' hit' : ''}`}>
                              {r.hit ? '★ HIT' : 'miss'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {/* Text representation for screen readers and test compatibility */}
                  <div className="roll-text-summary" style={{ fontSize: '11px', color: '#cbd5e1', wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {rollParts.length > 0 ? rollParts.join('  •  ') : 'no dice rolled'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Casualties & Events History */}
          {combatEvents.length > 0 ? (
            <div className="combat-events-box">
              <div className="events-title">
                Casualties & Hit Assignments
              </div>
              {combatEvents.map((evt, idx) => {
                let text = evt.text
                for (const player of state.players) {
                  text = text.replaceAll(`seat ${player.seat}`, player.name)
                }
                for (const sys of Object.values(state.systems)) {
                  text = text.replaceAll(`in ${sys.id}`, `in ${systemLabel(sys.id, state)}`)
                }
                return (
                  <div key={idx} className="event-line">
                    • {text}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Pending Hit Assignment (Human Agency) */}
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
                  Assign hits
                </button>
                <button type="button" className="btn quiet" data-testid="btn-auto-assign"
                  onClick={() => { if (defaultPicks?.type === 'assignHits') { apply({ type: 'assignHits', destroy: defaultPicks.destroy, sustain: defaultPicks.sustain }) } }}>
                  Accept suggested
                </button>
              </div>
            </div>
          ) : null}

          {/* Action Cards in Hand viewer */}
          {humanPlayer ? (
            <>
              <div className="combat-action-cards-bar">
                <button
                  type="button"
                  className="btn quiet combat-cards-toggle"
                  onClick={() => setShowCards(!showCards)}
                >
                  {showCards ? '▲ Hide Action Cards' : `▼ Action Cards (${humanPlayer.actionCards.length})`}
                </button>
              </div>
              {showCards ? (
                <div className="combat-cards-drawer" data-testid="combat-action-cards">
                  {humanPlayer.actionCards.length === 0 ? (
                    <div className="no-cards-note">No action cards in hand</div>
                  ) : (
                    humanPlayer.actionCards.map(cardId => {
                      const def = findActionCard(cardId)
                      if (!def) return null
                      return (
                        <div key={cardId} className="combat-card-item">
                          <div className="card-header">
                            <span className="card-name">{def.name}</span>
                            <span className="card-phase">{def.phase}</span>
                          </div>
                          <div className="card-window">{def.window}</div>
                          <div className="card-text">{def.text}</div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Retreat Announcements */}
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
    </div>
  )
}
