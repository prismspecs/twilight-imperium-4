import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { objectiveDef } from '../../data/objectives'
import { controlsMecatol } from '../../engine'
import { BADGE, MISC, strategyCardUrl, techArtUrl, tokenUrl } from '../art'
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
  const [objectiveId, setObjectiveId] = useState<string | null>(null)
  const [shared, setShared] = useState<Seat[]>([])
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  useEscape(onClose)
  if (!session) return null
  const state = session.state
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

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets, tradeGoods, tokens: sheet }
      case 'diplomacy': return systemId ? { systemId, planets } : { planets }
      case 'trade': return { shareWith: shared }
      case 'warfare': return systemId ? { systemId, tokens: sheet } : { tokens: sheet }
      case 'technology': return techId ? { techId } : {}
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

  const missing =
    card === 'technology' ? techOptions.length > 0 && techId === null
      : card === 'imperial' ? objectives.length > 0 && objectiveId === null
        : (card === 'diplomacy' || card === 'warfare') ? systems.length > 0 && systemId === null
          : false

  return (
    <div className={card === 'technology' ? 'drawer full cut' : 'dialog cut'} data-testid="strategic-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, primary</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-strategic-confirm" disabled={missing || tokensPending}
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
                  {systemLabel(id)}
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
                  Token from {systemLabel(id)}
                </button>
              ))}
            </div>
            <TokenSheet current={player.tokens} gained={gained} redistribute value={sheet} onChange={setTokens} />
          </>
        ) : null}

        {card === 'technology' ? (
          <>
            <div className="sub">Research one technology.</div>
            <Rewards items={[
              { icon: techId ? techArtUrl(techId) : strategyCardUrl('technology'), alt: techId ? techLabel(techId) : 'Technology', count: 1, label: techId ? techLabel(techId) : 'Technology' },
            ]} />
            <TechDrawer state={state} seat={seat} allowed={techOptions} selected={techId} onSelect={setTechId} />
          </>
        ) : null}

        {card === 'imperial' ? (
          <>
            <div className="sub">Score one fulfilled objective.</div>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'control'), alt: 'Victory point', count: 1, label: 'Victory point' },
              ...(controlsMecatol(state, seat) ? [{ icon: tokenUrl(player.faction, 'control'), alt: 'Victory point, Mecatol Rex', count: 1, label: 'Mecatol Rex' }] : []),
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
