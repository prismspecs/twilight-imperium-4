import { useState } from 'react'
import { planetLabel } from '../format'
import { inheritanceTechIds, shipyardOffers, tradePostOffers } from '../moveOptions'
import { TechDrawer } from './TechDrawer'
import { useGame } from '../store'
import { useEscape } from '../useEscape'

const POST_NAME = { west: 'Kasda Exchange', east: 'Vorhal Freeport' } as const

export function ComponentPanel({ onClose }: { onClose: () => void }) {
  const { session, legal, apply } = useGame()
  const [techId, setTechId] = useState<string | null>(null)
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  const techs = inheritanceTechIds(legal)
  const yards = shipyardOffers(legal)
  const posts = tradePostOffers(legal)
  return (
    <div className="dialog" data-testid="component-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Component actions</span>
          <div className="right">
            <button type="button" className="btn quiet" data-testid="btn-component-cancel" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="rowline">
          {posts.map(({ post, commodities }) => (
            <button key={post} type="button" className="btn quiet" data-testid={`btn-tradepost-${post}`}
              onClick={() => apply({ type: 'tradePost', post, commodities })}>
              Sell {commodities} commodities at {POST_NAME[post]}
            </button>
          ))}
          {yards.map(offer => (
            <button key={offer.planetId} type="button" className="btn quiet" data-testid={`btn-shipyard-${offer.planetId}`}
              onClick={() => { if (apply({ type: 'shipyard', planetId: offer.planetId, planets: offer.planets, tradeGoods: offer.tradeGoods })) onClose() }}>
              Emergency shipyard on {planetLabel(state, offer.planetId)}
            </button>
          ))}
        </div>
        {techs.length > 0 ? (
          <>
            <div className="rowline">
              <span className="sub">Inheritance Systems: exhaust the card and spend 2 resources to research one technology, prerequisites ignored.</span>
              <button type="button" className="btn gold" data-testid="btn-inheritance" disabled={techId === null}
                onClick={() => { if (techId && apply({ type: 'research', techId, via: 'inheritance' })) onClose() }}>Research</button>
            </div>
            <TechDrawer state={state} seat={state.active} allowed={techs} selected={techId} onSelect={setTechId} />
          </>
        ) : null}
      </div>
    </div>
  )
}
