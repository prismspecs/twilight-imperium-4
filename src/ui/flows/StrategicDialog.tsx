import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { agendaDef } from '../../data/agendas'
import { objectiveDef } from '../../data/objectives'
import { cheapestPayment, constructionPlanets, controlsMecatol, isAi, readyResources, researchable } from '../../engine'
import { BADGE, MISC, spriteUrl, strategyCardUrl, techArtUrl, tokenUrl } from '../art'
import { CARD_NAME, ownedPlanets, planetLabel, systemLabel, techLabel } from '../format'
import { strategicVariants } from '../moveOptions'
import { PayRow } from './PayRow'
import { Rewards } from './Rewards'
import { TechDrawer } from './TechDrawer'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import type { Player, Seat, StrategicParams, StrategyCardId } from '../../engine/types'

export interface StrategicDialogProps {
  card: StrategyCardId
  onClose: () => void
}

export function StrategicDialog({ card, onClose }: StrategicDialogProps) {
  const { session, legal, apply } = useGame()
  const [planets, setPlanets] = useState<string[]>([])
  const [tradeGoods, setTradeGoods] = useState(0)
  const [systemId, setSystemId] = useState<string | null>(null)
  const [techId, setTechId] = useState<string | null>(null)
  const [secondTechEnabled, setSecondTechEnabled] = useState(false)
  const [secondTechId, setSecondTechId] = useState<string | null>(null)
  const [secondPlanets, setSecondPlanets] = useState<string[]>([])
  const [secondTradeGoods, setSecondTradeGoods] = useState(0)
  const [activeSlot, setActiveSlot] = useState<'first' | 'second'>('first')
  const [objectiveId, setObjectiveId] = useState<string | null>(null)
  const [shared, setShared] = useState<Seat[]>([])
  const [speakerTo, setSpeakerTo] = useState<Seat | null>(null)
  const [agendaOrder, setAgendaOrder] = useState<string[] | null>(null)
  const [agendaBottom, setAgendaBottom] = useState<string[]>([])
  const [dock, setDock] = useState<string | null>(null)
  const [firstPds, setFirstPds] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  if (isAi(session.config, state.active)) return null
  const seat = state.active
  const player = state.players[seat]
  const others = state.players.filter((_, i) => i !== seat)
  const opponent = others[0] || player   // 2-player fallback for diplomacy UI
  const variants = strategicVariants(legal, card)
  const systems = [...new Set(variants.flatMap(v => v.systemId ? [v.systemId] : []))]
  const techOptions = variants.flatMap(v => v.techId ? [v.techId] : [])
  const objectives = variants.flatMap(v => v.objectiveId ? [v.objectiveId] : [])
  const influence = planets.reduce((sum, id) => {
    const planet = ownedPlanets(state, seat).find(p => p.id === id)
    return sum + (planet ? planet.influence : 0)
  }, 0) + tradeGoods
  const gained = card === 'leadership' ? 3 + Math.floor(influence / 3) : card === 'warfare' ? (systemId ? 1 : 0) : 0
  // the new tokens start unplaced: the player adds them pool by pool
  const sheet = tokens ?? { ...player.tokens }

  // R6 Politics: the two cards you look at go back on top or on the bottom, in the order shown
  const peek = state.agendaDeck.slice(0, 2)
  const peekOrder = agendaOrder ?? peek
  // R6 Construction: a space dock (at most one per planet, or for Saar's Floating Factory, at most one per
  // system) and a PDS (at most two per planet)
  const controlled = ownedPlanets(state, seat)
  const isSaar = player.faction === 'saar'
  const dockablePlanetIds = new Set(constructionPlanets(state, seat, 'spacedock'))
  const dockable = controlled.filter(p => dockablePlanetIds.has(p.id))
  const systemOf = (planetId: string): string => Object.keys(state.systems).find(id => state.systems[id].planets.some(p => p.id === planetId)) ?? ''
  const pdsable = controlled.filter(p => p.structures.filter(u => u.type === 'pds' && u.owner === seat).length < 2)
  const structures: { planetId: string; type: 'pds' | 'spacedock' }[] = [
    ...(dock ? [{ planetId: dock, type: 'spacedock' as const }] : []),
    ...(firstPds ? [{ planetId: firstPds, type: 'pds' as const }] : []),
  ]

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets, tradeGoods, tokens: sheet }
      case 'diplomacy': return systemId ? { systemId, planets } : { planets }
      case 'politics': return {
        speakerTo: speakerTo ?? undefined,
        agendaTop: peekOrder.filter(id => !agendaBottom.includes(id)),
        agendaBottom: peekOrder.filter(id => agendaBottom.includes(id)),
      }
      case 'construction': return { structures }
      case 'trade': return { shareWith: shared }
      case 'warfare': return systemId ? { systemId, tokens: sheet } : { tokens: sheet }
      case 'technology':
        if (secondTechEnabled && secondTechId) {
          return { techId: techId ?? undefined, secondTechId, planets: secondPlanets, tradeGoods: secondTradeGoods }
        }
        return techId ? { techId } : {}
      case 'imperial': return objectiveId ? { objectiveId } : {}
    }
  }

  // A parameter is required exactly when the enumerator offers values for it: Technology needs a
  // technology, Imperial a fulfilled objective, Diplomacy and Warfare a system. Confirming without one
  // is a move the engine rejects, so the button stays dead until the choice is made.
  // Leadership and Warfare hand out tokens the player has to place; the engine rejects a sheet that does
  // not add up, so the button waits until every new token has a pool.
  const tokenTarget = player.tokens.tactic + player.tokens.fleet + player.tokens.strategy + gained
  const tokensPlaced = sheet.tactic + sheet.fleet + sheet.strategy
  const tokensPending = (card === 'leadership' || card === 'warfare') && tokensPlaced !== tokenTarget

  const secondPaidResources = secondPlanets.reduce((sum, id) => sum + (ownedPlanets(state, seat).find(p => p.id === id)?.resources ?? 0), 0) + secondTradeGoods
  const secondTechBlocked = card === 'technology' && secondTechEnabled && (secondTechId === null || secondPaidResources < 6)

  const totalResourcesAvailable = readyResources(state, seat) + player.tradeGoods
  const canAffordSecondTech = totalResourcesAvailable >= 6

  const playerWithFirstTech: Player = techId
    ? { ...player, techs: [...player.techs, techId] }
    : player
  const secondAllowedTechs = researchable(playerWithFirstTech).filter(id => id !== techId)

  function handleToggleSecondTech(checked: boolean) {
    setSecondTechEnabled(checked)
    if (checked) {
      if (secondPaidResources < 6) {
        const autoPay = cheapestPayment(state, seat, 6)
        if (autoPay) {
          setSecondPlanets(autoPay.planets)
          setSecondTradeGoods(autoPay.tradeGoods)
        }
      }
      if (techId) {
        setActiveSlot('second')
      }
    } else {
      setActiveSlot('first')
      setSecondTechId(null)
    }
  }

  const missing =
    card === 'technology' ? techOptions.length > 0 && techId === null
      : card === 'imperial' ? objectives.length > 0 && objectiveId === null
        : card === 'politics' ? speakerTo === null
          : (card === 'diplomacy' || card === 'warfare') ? systems.length > 0 && systemId === null
            : false

  return (
    <div className={card === 'technology' ? 'drawer full wide tech-dialog' : 'dialog'} data-testid="strategic-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, primary</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-strategic-confirm" disabled={missing || tokensPending || secondTechBlocked}
              onClick={() => { if (apply({ type: 'strategic', card, params: params() })) onClose() }}>Play the card</button>
            <button type="button" className="btn quiet" data-testid="btn-strategic-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>

        {card === 'leadership' ? (
          <>
            <div className="sub">You get command tokens.</div>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'command'), alt: 'Command token', count: gained, label: 'Command tokens' },
            ]} />
            <PayRow state={state} seat={seat} unit="influence" needed={0} planets={planets} onPlanets={ids => { setPlanets(ids); setTokens(null) }}
              tradeGoods={tradeGoods} onTradeGoods={n => { setTradeGoods(n); setTokens(null) }} />
            <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
          </>
        ) : null}

        {card === 'diplomacy' ? (
          <>
            <div className="sub">Your opponent locks the chosen system. You ready up to two planets.</div>
            <Rewards items={[
              { icon: BADGE.influenceReady, alt: 'Ready planet', count: planets.length > 0 ? planets.length : 2, label: 'Ready planet' },
              { icon: tokenUrl(opponent.faction, 'command'), alt: 'Opponent command token', count: 1, label: 'Opponent token' },
            ]} />
            <div className="rowline">
              {systems.map(id => (
                <button key={id} type="button" className={`pay${systemId === id ? ' on' : ''}`} data-testid={`system-pick-${id}`} onClick={() => setSystemId(id)}>
                  {systemLabel(id, state)}
                </button>
              ))}
            </div>
            <div className="rowline">
              {ownedPlanets(state, seat).filter(p => p.exhausted).map(planet => (
                <button key={planet.id} type="button" className={`pay${planets.includes(planet.id) ? ' on' : ''}`}
                  data-testid={`ready-${planet.id}`} disabled={!planets.includes(planet.id) && planets.length >= 2}
                  onClick={() => setPlanets(planets.includes(planet.id) ? planets.filter(id => id !== planet.id) : [...planets, planet.id])}>
                  Ready {planet.name}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {card === 'politics' ? (
          <>
            <div className="sub">
              Choose a new speaker (anyone but {state.players[state.speaker].name}), draw 2 action cards, then
              put the top 2 agenda cards back in any order.
            </div>
            <Rewards items={[
              { icon: MISC.mandateBack, alt: 'Action card', count: 2, label: 'Action cards' },
            ]} />
            <div className="rowline">
              {state.players.filter(p => p.seat !== state.speaker).map(p => (
                <button key={p.seat} type="button" className={`pay${speakerTo === p.seat ? ' on' : ''}`}
                  data-testid={`speaker-pick-${p.seat}`} onClick={() => setSpeakerTo(p.seat)}>
                  {p.seat === seat ? 'Take the speaker token yourself' : `${p.name} becomes speaker`}
                </button>
              ))}
            </div>
            {peek.length > 0 ? (
              <>
                <div className="tab" style={{ margin: '12px 0 8px' }}>
                  Top {peek.length} Agenda Cards (Peek & Order)
                </div>
                <div className="sub" style={{ marginBottom: 12 }}>
                  Read the cards below and decide where each goes. Cards kept on top will be revealed and voted on in the upcoming agenda phase.
                </div>
                <div className="agenda-peek-cards" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {peekOrder.map((id, idx) => {
                    const def = agendaDef(id)
                    const isBottom = agendaBottom.includes(id)
                    return (
                      <div
                        key={id}
                        className={`agenda-card-container${isBottom ? ' is-bottom' : ' is-top'}`}
                        data-testid={`agenda-preview-${id}`}
                        style={{
                          background: isBottom ? 'rgba(15, 23, 42, 0.6)' : 'rgba(30, 41, 59, 0.85)',
                          border: isBottom ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(234, 179, 8, 0.45)',
                          borderRadius: 8,
                          padding: '12px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: isBottom ? '#94a3b8' : '#f8fafc' }}>
                              {def.name}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 8px',
                                borderRadius: 4,
                                letterSpacing: '0.05em',
                                background: def.kind === 'law' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                color: def.kind === 'law' ? '#fde047' : '#7dd3fc',
                                border: def.kind === 'law' ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(56, 189, 248, 0.4)',
                              }}
                            >
                              {def.kind}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Target: <strong style={{ color: '#e2e8f0' }}>{def.target}</strong>
                          </span>
                        </div>

                        <div style={{ fontSize: 13, lineHeight: 1.5, color: isBottom ? '#64748b' : '#cbd5e1', padding: '6px 0' }}>
                          {def.text}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}>
                          <button
                            type="button"
                            className={`pay${isBottom ? '' : ' on'}`}
                            data-testid={`agenda-place-${id}`}
                            onClick={() => setAgendaBottom(isBottom ? agendaBottom.filter(x => x !== id) : [...agendaBottom, id])}
                          >
                            {isBottom ? '⬇ Put on bottom of deck' : `⬆ Keep on top (${idx + 1} of ${peekOrder.length})`}
                          </button>
                          <span style={{ fontSize: 12, color: isBottom ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                            {isBottom ? 'Moving to bottom of deck' : 'Drawn first in Agenda Phase'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {peekOrder.length > 1 ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                      <button
                        type="button"
                        className="pay"
                        data-testid="agenda-swap"
                        onClick={() => setAgendaOrder([...peekOrder].reverse())}
                      >
                        ⇄ Swap top two cards order
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : <div className="sub">The agenda deck is empty.</div>}
          </>
        ) : null}

        {card === 'construction' ? (
          <>
            <div className="sub">
              Place 1 PDS or 1 {isSaar ? 'Floating Factory' : 'space dock'} on a planet you control, then 1 PDS on a planet you control.
            </div>
            <Rewards items={[
              { icon: spriteUrl(player.color, isSaar ? 'floating_factory' : 'spacedock'), alt: isSaar ? 'Floating Factory' : 'Space dock', count: dock ? 1 : 0, label: isSaar ? 'Floating Factory' : 'Space dock' },
              { icon: spriteUrl(player.color, 'pds'), alt: 'PDS', count: firstPds ? 1 : 0, label: 'PDS' },
            ]} />
            <div className="tab" style={{ margin: '12px 0 6px' }}>{isSaar ? 'Floating Factory' : 'Space dock'}</div>
            <div className="rowline">
              {dockable.map(planet => (
                <button key={planet.id} type="button" className={`pay${dock === planet.id ? ' on' : ''}`}
                  data-testid={`dock-${planet.id}`}
                  disabled={player.reinforcements[isSaar ? 'floating_factory' : 'spacedock'] < 1 && dock !== planet.id}
                  onClick={() => setDock(dock === planet.id ? null : planet.id)}>
                  {isSaar ? `Floating Factory in ${systemLabel(systemOf(planet.id), state)}` : `Dock on ${planet.name}`}
                </button>
              ))}
              {dockable.length === 0
                ? <span className="sub">{isSaar ? 'Every system you have a planet in already has your Floating Factory.' : 'Every planet you control already has a space dock.'}</span>
                : null}
            </div>
            <div className="tab" style={{ margin: '12px 0 6px' }}>PDS</div>
            <div className="rowline">
              {pdsable.map(planet => (
                <button key={planet.id} type="button" className={`pay${firstPds === planet.id ? ' on' : ''}`}
                  data-testid={`pds-${planet.id}`}
                  disabled={player.reinforcements.pds < 1 && firstPds !== planet.id}
                  onClick={() => setFirstPds(firstPds === planet.id ? null : planet.id)}>
                  PDS on {planet.name}
                </button>
              ))}
              {pdsable.length === 0 ? <span className="sub">Every planet you control already carries two PDS.</span> : null}
            </div>
            {player.reinforcements.spacedock < 1 ? (
              <div className="sub warn" style={{ color: '#fca5a5', marginTop: 4 }}>
                No space docks remaining in supply (TI4 component limit: 3 space docks per player).
              </div>
            ) : null}
            {player.reinforcements.pds < 1 ? (
              <div className="sub warn" style={{ color: '#fca5a5', marginTop: 4 }}>
                No PDS remaining in supply (TI4 component limit: 6 PDS per player).
              </div>
            ) : null}
          </>
        ) : null}

        {card === 'trade' ? (
          <>
            <div className="sub">You get trade goods and your commodities back.</div>
            <Rewards items={[
              { icon: MISC.tradeGood, alt: 'Trade good', count: 3, label: 'Trade goods' },
              { icon: MISC.commodity, alt: 'Commodity', count: Math.max(0, FACTIONS[player.faction].commodityValue - player.commodities), label: 'Commodities' },
            ]} />
            <div className="rowline">
              {others.map((p) => {
                const i = state.players.indexOf(p) // actual seat index
                return (
                  <label key={i} className="pay">
                    <input type="checkbox" data-testid={`share-${i}`} checked={shared.includes(i)}
                      onChange={e => setShared(e.target.checked ? [...shared, i] : shared.filter(s => s !== i))} />
                    Let {p.name} replenish too
                  </label>
                )
              })}
            </div>
          </>
        ) : null}

        {card === 'warfare' ? (
          <>
            <div className="sub">Take one command token off the board and rearrange your sheet.</div>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'command'), alt: 'Command token', count: 1, label: 'Command token' },
            ]} />
            <div className="rowline">
              {systems.map(id => (
                <button key={id} type="button" className={`pay${systemId === id ? ' on' : ''}`} data-testid={`system-pick-${id}`}
                  onClick={() => { setSystemId(id); setTokens(null) }}>
                  Token from {systemLabel(id, state)}
                </button>
              ))}
            </div>
            <TokenSheet current={player.tokens} gained={gained} redistribute value={sheet} onChange={setTokens} />
          </>
        ) : null}

        {card === 'technology' ? (
          <>
            <div className="sub">Research 1 technology. Optionally spend 6 resources to research 1 additional technology.</div>
            <Rewards items={[
              { icon: techId ? techArtUrl(techId) : strategyCardUrl('technology'), alt: techId ? techLabel(techId) : 'Technology', count: 1, label: techId ? techLabel(techId) : 'Tech #1' },
              ...(secondTechEnabled && secondTechId ? [{ icon: techArtUrl(secondTechId), alt: techLabel(secondTechId), count: 1, label: techLabel(secondTechId) }] : []),
            ]} />

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', margin: '10px 0 8px' }}>
              <label className="pay" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  data-testid="chk-second-tech"
                  checked={secondTechEnabled}
                  disabled={!canAffordSecondTech && !secondTechEnabled}
                  onChange={e => handleToggleSecondTech(e.target.checked)}
                />
                <span>Research 2nd technology (Costs 6 resources)</span>
                {!canAffordSecondTech && !secondTechEnabled && (
                  <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>— need 6 resources; have {totalResourcesAvailable}</span>
                )}
              </label>

              {secondTechEnabled ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className={`btn ${activeSlot === 'first' ? 'gold' : 'quiet'}`}
                    data-testid="tab-tech-1"
                    onClick={() => setActiveSlot('first')}
                  >
                    1. Free: <b>{techId ? techLabel(techId) : '(choose)'}</b>
                  </button>
                  <button
                    type="button"
                    className={`btn ${activeSlot === 'second' ? 'gold' : 'quiet'}`}
                    data-testid="tab-tech-2"
                    onClick={() => setActiveSlot('second')}
                  >
                    2. Cost 6: <b>{secondTechId ? techLabel(secondTechId) : '(choose)'}</b>
                  </button>
                </div>
              ) : null}
            </div>

            {secondTechEnabled ? (
              <div style={{ margin: '6px 0 10px', padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid var(--alpha-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Pay 6 resources ({secondPaidResources} / 6 paid)
                </div>
                <PayRow
                  state={state}
                  seat={seat}
                  needed={6}
                  planets={secondPlanets}
                  onPlanets={setSecondPlanets}
                  tradeGoods={secondTradeGoods}
                  onTradeGoods={setSecondTradeGoods}
                />
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px' }}>
              <span className="tab" style={{ fontSize: '12px' }}>
                {activeSlot === 'first' ? 'Choose Technology #1 (Free)' : 'Choose Technology #2 (Costs 6 resources)'}
              </span>
              {secondTechEnabled && (
                <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                  {activeSlot === 'first' ? 'Click "2. Cost 6" tab above to choose second tech' : 'Prerequisites include Tech #1'}
                </span>
              )}
            </div>

            <TechDrawer
              state={state}
              seat={seat}
              allowed={activeSlot === 'first' ? techOptions : secondAllowedTechs}
              selected={activeSlot === 'first' ? techId : secondTechId}
              onSelect={id => {
                if (activeSlot === 'first') {
                  setTechId(id)
                  if (secondTechEnabled && !secondTechId) {
                    setActiveSlot('second')
                  }
                } else {
                  setSecondTechId(id)
                }
              }}
            />
          </>
        ) : null}

        {card === 'imperial' ? (
          <>
            <div className="sub">
              {controlsMecatol(state, seat)
                ? 'Score one fulfilled public objective. Gain 1 VP for controlling Mecatol Rex.'
                : 'Score one fulfilled public objective. Draw 1 secret objective.'}
            </div>
            <Rewards items={[
              ...(objectiveId ? [{ icon: tokenUrl(player.faction, 'control'), alt: 'Victory point', count: 1, label: 'Objective VP' }] : []),
              ...(controlsMecatol(state, seat)
                ? [{ icon: tokenUrl(player.faction, 'control'), alt: 'Victory point, Mecatol Rex', count: 1, label: 'Mecatol Rex (+1 VP)' }]
                : [{ icon: MISC.mandateBack, alt: 'Secret objective', count: 1, label: 'Secret objective' }]),
            ]} />
            <div className="rowline">
              {objectives.map(id => (
                <button key={id} type="button" className={`pay${objectiveId === id ? ' on' : ''}`} data-testid={`objective-pick-${id}`} onClick={() => setObjectiveId(id)}>
                  {objectiveDef(id)?.text ?? id}
                </button>
              ))}
              {objectives.length === 0 ? <span className="sub">No objective is fulfilled right now.</span> : null}
            </div>
          </>
        ) : null}

        {card === 'diplomacy' && systems.length === 0 ? <div className="sub">You control no planet outside {planetLabel(state, 'mecatol-rex')}.</div> : null}
      </div>
    </div>
  )
}
