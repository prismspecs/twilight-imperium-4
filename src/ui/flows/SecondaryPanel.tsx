import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { homeSystemId } from '../../data/map'
import { cardOwner, productionLimit, secondaryTokenCost } from '../../engine'
import { BADGE, MISC, strategyCardUrl, techArtUrl, tokenUrl } from '../art'
import { CARD_NAME, ownedPlanets, systemLabel, techLabel } from '../format'
import { secondaryOffer } from '../moveOptions'
import { PayRow } from './PayRow'
import { ProductionPicker, costOf, unitTotal } from './ProductionPicker'
import { Rewards } from './Rewards'
import { TechDrawer } from './TechDrawer'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { Player, StrategicParams, UnitType } from '../../engine/types'

export function SecondaryPanel() {
  const { session, legal, apply } = useGame()
  const [planets, setPlanets] = useState<string[] | null>(null)
  const [tradeGoods, setTradeGoods] = useState(0)
  const [techId, setTechId] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  const [units, setUnits] = useState<Partial<Record<UnitType, number>>>({})
  if (!session) return null
  const state = session.state
  const window = state.pendingSecondary
  if (window === null) return null
  const card = window.card
  const seat = state.active
  const player = state.players[seat]
  const owner = cardOwner(state, card)
  const offer = secondaryOffer(legal)
  const template: StrategicParams = offer.accept ?? {}
  const pay = planets ?? template.planets ?? []
  const influence = pay.reduce((sum, id) => {
    const planet = ownedPlanets(state, seat).find(p => p.id === id)
    return sum + (planet ? planet.influence : 0)
  }, 0) + tradeGoods
  const gained = card === 'leadership' ? Math.floor(influence / 3) : 0
  // the new tokens start unplaced: the player adds them pool by pool
  const sheet = tokens ?? { ...player.tokens }
  const techOptions = legal.flatMap(m => m.type === 'secondary' && m.accept && m.params?.techId ? [m.params.techId] : [])

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets: pay, tradeGoods, tokens: sheet }
      case 'diplomacy': return { planets: pay }
      case 'technology': return { techId: techId ?? template.techId, planets: pay, tradeGoods }
      case 'warfare': return { units, planets: pay, tradeGoods }
      default: return {}
    }
  }

  // R6 warfare secondary: the space dock in the home system produces up to its full limit, so the responder
  // picks the units and pays for them exactly like a tactical production, not a fixed single infantry.
  const home = homeSystemId(seat)
  const warfareLimit = productionLimit(state, seat, home)
  const warfareCount = unitTotal(units)
  const warfareCost = costOf(state, seat, units)
  const needed = card === 'technology' ? 4 : card === 'warfare' ? warfareCost : 0
  const paidResources = pay.reduce((sum, id) => sum + (ownedPlanets(state, seat).find(p => p.id === id)?.resources ?? 0), 0) + tradeGoods
  const warfareBlocked = card === 'warfare' && (warfareCount === 0 || warfareCount > warfareLimit || paidResources < warfareCost)
  // the Leadership secondary also hands out tokens, and they must all be placed before it can be accepted
  const tokenTarget = player.tokens.tactic + player.tokens.fleet + player.tokens.strategy + gained
  const tokensPending = card === 'leadership' && sheet.tactic + sheet.fleet + sheet.strategy !== tokenTarget
  return (
    <div className={card === 'technology' ? 'drawer full cut' : 'dialog cut'} data-testid="secondary-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, secondary</span>
          <span className="sub">
            {owner === null ? 'Your opponent' : state.players[owner].name} played {CARD_NAME[card]}.
          </span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-secondary-accept" disabled={offer.accept === null || warfareBlocked || tokensPending}
              onClick={() => apply({ type: 'secondary', card, accept: true, params: params() })}>Use the secondary</button>
            <button type="button" className="btn quiet" data-testid="btn-secondary-decline"
              onClick={() => apply({ type: 'secondary', card, accept: false })}>Decline</button>
          </div>
        </div>
        {card === 'leadership' ? (
          <>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'command'), alt: 'Command token', count: gained, label: 'Command tokens' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
            <PayRow state={state} seat={seat} unit="influence" needed={0} planets={pay} onPlanets={ids => { setPlanets(ids); setTokens(null) }}
              tradeGoods={tradeGoods} onTradeGoods={n => { setTradeGoods(n); setTokens(null) }} />
            <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
          </>
        ) : null}
        {card === 'diplomacy' ? (
          <>
            <Rewards items={[
              { icon: BADGE.influenceReady, alt: 'Ready planet', count: pay.length > 0 ? pay.length : 2, label: 'Ready planet' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
            <div className="rowline">
              {ownedPlanets(state, seat).filter(p => p.exhausted).map(planet => (
                <button key={planet.id} type="button" className={`pay${pay.includes(planet.id) ? ' on' : ''}`} data-testid={`ready-${planet.id}`}
                  disabled={!pay.includes(planet.id) && pay.length >= 2}
                  onClick={() => setPlanets(pay.includes(planet.id) ? pay.filter(id => id !== planet.id) : [...pay, planet.id])}>
                  Ready {planet.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {card === 'technology' ? (
          <>
            <Rewards items={[
              {
                icon: (techId ?? template.techId) ? techArtUrl(techId ?? template.techId ?? '') : strategyCardUrl('technology'),
                alt: (techId ?? template.techId) ? techLabel(techId ?? template.techId ?? '') : 'Technology',
                count: 1,
                label: (techId ?? template.techId) ? techLabel(techId ?? template.techId ?? '') : 'Technology',
              },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
            <PayRow state={state} seat={seat} needed={needed} planets={pay} onPlanets={setPlanets} tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
            <TechDrawer state={state} seat={seat} allowed={techOptions} selected={techId ?? template.techId ?? null} onSelect={setTechId} />
          </>
        ) : null}
        {card === 'warfare' ? (
          <>
            <div className="sub" data-testid="secondary-units">
              Produce at {systemLabel(home)}: {warfareLimit} units at most, {warfareCount} chosen, cost {warfareCost}.
            </div>
            <ProductionPicker state={state} seat={seat} limit={warfareLimit} units={units} onUnits={setUnits} />
            <PayRow state={state} seat={seat} needed={warfareCost} planets={pay} onPlanets={setPlanets} tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
          </>
        ) : null}
        {card === 'trade' ? (
          <>
            <div className="sub">Your commodities come back.</div>
            <Rewards items={[
              { icon: MISC.commodity, alt: 'Commodity', count: Math.max(0, FACTIONS[player.faction].commodityValue - player.commodities), label: 'Commodities' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
          </>
        ) : null}
        {card === 'imperial' ? (
          <>
            <div className="sub">You get trade goods.</div>
            <Rewards items={[
              { icon: MISC.tradeGood, alt: 'Trade good', count: 2, label: 'Trade goods' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
          </>
        ) : null}
      </div>
    </div>
  )
}
