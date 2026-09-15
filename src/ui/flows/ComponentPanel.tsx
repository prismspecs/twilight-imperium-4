import { useState } from 'react'
import { inheritanceTechIds, productionBiomesTargets } from '../moveOptions'
import { relocatableGroundForces } from '../../engine'
import { planetLabel } from '../format'
import { TechDrawer } from './TechDrawer'
import { useGame } from '../store'
import { useEscape } from '../useEscape'

export function ComponentPanel({ onClose }: { onClose: () => void }) {
  const { session, legal, apply } = useGame()
  const [techId, setTechId] = useState<string | null>(null)
  // Transit Diodes: the ground forces picked for relocation and the planet each is placed on
  const [diodes, setDiodes] = useState<{ infantryId: number; from: string; to: string }[]>([])
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  const techs = inheritanceTechIds(legal)
  const biomeTargets = productionBiomesTargets(legal)
  const diodesOffer = legal.find(m => m.type === 'transitDiodes')
  const seat = state.active
  const sources = relocatableGroundForces(state, seat)
  const destinations: { planetId: string; name: string }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat) destinations.push({ planetId: p.id, name: planetLabel(state, p.id) })
  }
  const pickSource = (infantryId: number, from: string) => {
    if (diodes.length >= 4) return
    const fallback = destinations.find(d => d.planetId !== from) ?? destinations[0]
    setDiodes([...diodes, { infantryId, from, to: fallback?.planetId ?? from }])
  }
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
        {diodesOffer ? (
          <>
            <div className="sub">Transit Diodes: relocate up to 4 ground forces from systems holding your command token to planets you control.</div>
            <div className="rowline">
              {sources.filter(s => !diodes.some(d => d.infantryId === s.unit.id)).map(s => (
                <button key={s.unit.id} type="button" className="btn quiet" data-testid={`diodes-source-${s.unit.id}`}
                  onClick={() => pickSource(s.unit.id, s.planetId ?? s.systemId)}>
                  {planetLabel(state, s.planetId ?? s.systemId)}: 1 infantry
                </button>
              ))}
            </div>
            {diodes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diodes.map(d => (
                  <div key={d.infantryId} className="rowline" data-testid={`diodes-move-${String(d.infantryId)}`}>
                    <span className="sub">Infantry from {planetLabel(state, d.from)} →</span>
                    <select className="pf-select" value={d.to} data-testid={`diodes-dest-${String(d.infantryId)}`}
                      onChange={e => setDiodes(diodes.map(x => x.infantryId === d.infantryId ? { ...x, to: e.target.value } : x))}>
                      {destinations.map(d2 => <option key={d2.planetId} value={d2.planetId}>{d2.name}</option>)}
                    </select>
                    <button type="button" className="btn quiet" data-testid={`diodes-drop-${String(d.infantryId)}`}
                      onClick={() => setDiodes(diodes.filter(x => x.infantryId !== d.infantryId))}>Remove</button>
                  </div>
                ))}
                <button type="button" className="btn gold" data-testid="btn-transit-diodes"
                  onClick={() => { if (apply({ type: 'transitDiodes', moves: diodes.map(d => ({ infantryId: d.infantryId, to: d.to })) })) onClose() }}>
                  Relocate {String(diodes.length)} ground force{diodes.length === 1 ? '' : 's'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
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
