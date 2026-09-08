import { useState } from 'react'
import { inheritanceTechIds, productionBiomesTargets } from '../moveOptions'
import { TechDrawer } from './TechDrawer'
import { useGame } from '../store'
import { useEscape } from '../useEscape'

export function ComponentPanel({ onClose }: { onClose: () => void }) {
  const { session, legal, apply } = useGame()
  const [techId, setTechId] = useState<string | null>(null)
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  const techs = inheritanceTechIds(legal)
  const biomeTargets = productionBiomesTargets(legal)
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
          {biomeTargets.map(target => (
            <button key={target} type="button" className="btn quiet" data-testid={`btn-production-biomes-${target}`}
              onClick={() => { if (apply({ type: 'productionBiomes', target })) onClose() }}>
              Production Biomes: gain 4 trade goods, give {state.players[target].name} 2
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
