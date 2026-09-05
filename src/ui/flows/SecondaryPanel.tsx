import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { cardOwner, homeSystemOf, isAi, productionLimit, secondaryTokenCost } from '../../engine'
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
  const [buildSystem, setBuildSystem] = useState<string | null>(null)
  const [build, setBuild] = useState<{ planetId: string; type: 'pds' | 'spacedock' } | null>(null)
  if (!session) return null
  const state = session.state
  if (isAi(session.config, state.active)) return null
  const window = state.pendingSecondary
  if (window === null) return null
  const card = window.card
  const seat = state.active
  const player = state.players[seat]
  const owner = cardOwner(state, card)
  const isFree = window.freeSeats?.includes(seat) ?? false
  const offer = secondaryOffer(legal)
  const template: StrategicParams = offer.accept ?? {}
  const pay = planets ?? template.planets ?? []
  const influence = pay.reduce((sum, id) => {
    const planet = ownedPlanets(state, seat).find(p => p.id === id)
    return sum + (planet ? planet.influence : 0)
  }, 0) + tradeGoods
  const gained = card === 'leadership' ? Math.floor(influence / 3) : 0
  // auto-allocate newly gained tokens so the user doesn't hit a blocking tokensPending error by default
  const sheet = tokens ?? { ...player.tokens, tactic: player.tokens.tactic + gained }
  const techOptions = legal.flatMap(m => m.type === 'secondary' && m.accept && m.params?.techId ? [m.params.techId] : [])
  // R6 Construction secondary: the enumerator offers one entry per placement the seat can actually make
  const buildOffers = legal.flatMap(m => {
    if (m.type !== 'secondary' || !m.accept) return []
    const systemId = m.params?.systemId
    const spec = m.params?.structures?.[0]
    if (systemId === undefined || spec === undefined) return []
    const planet = state.systems[systemId].planets.find(p => p.id === spec.planetId)
    return planet ? [{ systemId, planetId: spec.planetId, planetName: planet.name, type: spec.type }] : []
  })

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets: pay, tradeGoods, tokens: sheet }
      case 'diplomacy': return { planets: pay }
      case 'construction': return {
        systemId: buildSystem ?? template.systemId,
        structures: build ? [build] : [],
      }
      case 'technology': return { techId: techId ?? template.techId, planets: pay, tradeGoods }
      case 'warfare': return { units, planets: pay, tradeGoods }
      default: return {}
    }
  }

  // R6 warfare secondary: the space dock in the home system produces up to its full limit, so the responder
  // picks the units and pays for them exactly like a tactical production, not a fixed single infantry.
  const home = homeSystemOf(state, seat)
  const warfareLimit = productionLimit(state, seat, home)
  const warfareCount = unitTotal(units)
  const warfareCost = costOf(state, seat, units)
  const needed = card === 'technology' ? 4 : card === 'warfare' ? warfareCost : 0
  const paidResources = pay.reduce((sum, id) => sum + (ownedPlanets(state, seat).find(p => p.id === id)?.resources ?? 0), 0) + tradeGoods
  const warfareBlocked = card === 'warfare' && (warfareCount === 0 || warfareCount > warfareLimit || paidResources < warfareCost)
  // the Leadership secondary also hands out tokens, and they must all be placed before it can be accepted
  const tokenTarget = player.tokens.tactic + player.tokens.fleet + player.tokens.strategy + gained
  const tokensPending = card === 'leadership' && sheet.tactic + sheet.fleet + sheet.strategy !== tokenTarget
  const cannotAcceptLeadership = card === 'leadership' && gained < 1
  // R3.2 / CLAUDE.md: when there is nothing to spend, the enumerator only offers the decline, and the panel
  // has to say why out loud rather than presenting a mute greyed-out accept. Each reason names the input.
  // A missing strategy token is the most common reason and applies to every card alike, so it is checked
  // first; only when tokens are not the problem do the card-specific dead ends below get a look-in.
  const tokenCost = secondaryTokenCost(card, isFree)
  const unavailableReason = offer.accept === null && player.tokens.strategy < tokenCost
    ? `You have no strategy token to spend (this secondary costs ${tokenCost}).`
    : offer.accept === null
      ? card === 'trade'
        ? `You are already at your commodity limit (${player.commodities} of ${FACTIONS[player.faction].commodityValue}), so there is nothing to replenish.`
        : card === 'leadership'
          ? 'You have no influence to spend and no trade goods, so the secondary would hand out 0 command tokens.'
          : card === 'diplomacy'
            ? 'You have no exhausted planet to ready.'
            : card === 'politics'
              ? 'The action card deck and the discard pile are both empty, so there is nothing to draw.'
              : card === 'construction'
                ? 'You control no planet with room for another structure, or your reinforcements hold no PDS and no space dock.'
                : undefined
      : card === 'leadership' && gained < 1
        ? 'You have not spent any influence yet: spend 3 influence per command token gained, or trade goods 1 for 1.'
        : undefined
  return (
    <div className={card === 'technology' ? 'drawer full' : 'dialog'} data-testid="secondary-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, secondary</span>
          <span className="sub">
            {owner === seat
              ? `You played ${CARD_NAME[card]}.`
              : `${owner === null ? 'Your opponent' : state.players[owner].name} played ${CARD_NAME[card]}.`}
          </span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-secondary-accept"
              disabled={offer.accept === null || cannotAcceptLeadership || warfareBlocked || tokensPending}
              onClick={() => apply({ type: 'secondary', card, accept: true, params: params() })}>Use the secondary</button>
            <button type="button" className="btn quiet" data-testid="btn-secondary-decline"
              onClick={() => apply({ type: 'secondary', card, accept: false })}>Decline</button>
          </div>
        </div>
        {unavailableReason ? (
          <div className="sub err" role="alert" data-testid="secondary-unavailable">{unavailableReason}</div>
        ) : null}
        {card === 'leadership' ? (
          <>
            <div className="sub" style={{ marginBottom: 6 }}>
              Spend 3 influence (planets or trade goods) per command token gained. Costs 0 strategy tokens.
            </div>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'command'), alt: 'Command token', count: gained, label: 'Command tokens' },
            ]} note={`${influence} influence spent → ${gained} command token(s) gained.`} />
            <PayRow state={state} seat={seat} unit="influence" needed={Math.max(3, (gained + 1) * 3)} planets={pay} onPlanets={ids => { setPlanets(ids); setTokens(null) }}
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
        {card === 'politics' ? (
          <>
            <div className="sub">Draw 2 action cards.</div>
            <Rewards items={[
              { icon: MISC.mandateBack, alt: 'Action card', count: 2, label: 'Action cards' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
          </>
        ) : null}
        {card === 'construction' ? (
          <>
            <div className="sub">
              Your command token goes into the system you choose; you may place 1 space dock or 1 PDS on a
              planet you control there.
            </div>
            <Rewards items={[
              { icon: tokenUrl(player.faction, 'command'), alt: 'Command token', count: 1, label: 'Command token' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
            <div className="rowline">
              {buildOffers.map(offer => {
                const chosen = buildSystem === offer.systemId && build?.planetId === offer.planetId && build.type === offer.type
                return (
                  <button key={`${offer.systemId}-${offer.planetId}-${offer.type}`} type="button" className={`pay${chosen ? ' on' : ''}`}
                    data-testid={`build-${offer.planetId}-${offer.type}`}
                    onClick={() => { setBuildSystem(offer.systemId); setBuild({ planetId: offer.planetId, type: offer.type }) }}>
                    {offer.type === 'spacedock' ? 'Space dock' : 'PDS'} on {offer.planetName} ({systemLabel(offer.systemId)})
                  </button>
                )
              })}
              {buildOffers.length === 0 ? <span className="sub">You control no planet with room for another structure.</span> : null}
            </div>
          </>
        ) : null}
        {card === 'trade' ? (
          <>
            <div className="sub">Replenish commodities.</div>
            <Rewards items={[
              { icon: MISC.commodity, alt: 'Commodity', count: Math.max(0, FACTIONS[player.faction].commodityValue - player.commodities), label: 'Commodities' },
            ]} note={isFree ? 'Free replenishment (chosen by active player) — costs 0 strategy tokens.' : `Costs you ${secondaryTokenCost(card, isFree)} strategy token.`} />
          </>
        ) : null}
        {card === 'imperial' ? (
          <>
            <div className="sub">Draw 1 secret objective.</div>
            <Rewards items={[
              { icon: MISC.mandateBack, alt: 'Secret objective', count: 1, label: 'Secret objective' },
            ]} note={`Costs you ${secondaryTokenCost(card)} strategy token.`} />
          </>
        ) : null}
      </div>
    </div>
  )
}
