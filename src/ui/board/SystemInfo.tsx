import { BADGE, MISC, planetTrait } from '../art'
import { groupUnits } from './UnitStack'
import { UnitStack } from './UnitStack'
import { useEscape } from '../useEscape'
import type { GameState } from '../../engine/types'

const WORMHOLE_ICON: Record<'alpha' | 'beta' | 'delta', string> = {
  alpha: MISC.alpha, beta: MISC.beta, delta: MISC.delta,
}
const TRAIT_LABEL: Record<string, string> = {
  cultural: 'Cultural', hazardous: 'Hazardous', industrial: 'Industrial', none: '',
}

/** Click any tile that is not currently selectable for an action, and this shows what is on it: every
 * planet's resources, influence and trait, the wormhole if any, and who has ships or forces there.
 * AsyncTI4/ti4_web_new's own click-a-tile info popup, done in our own layout. */
export function SystemInfo({ state, systemId, onClose }: { state: GameState; systemId: string; onClose: () => void }) {
  useEscape(onClose)
  const system = state.systems[systemId]
  if (!system) return null
  const fleet = groupUnits(system.space)
  return (
    <div className="dialog" data-testid="system-info">
      <div className="in">
        <div className="dhead">
          <span className="tab">{system.name}</span>
          <div className="right">
            <button type="button" className="btn quiet" data-testid="btn-system-info-close" onClick={onClose}>Close</button>
          </div>
        </div>
        {system.wormhole ? (
          <div className="sub" data-testid="system-info-wormhole">
            <img src={WORMHOLE_ICON[system.wormhole]} alt="" width={16} height={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {system.wormhole[0].toUpperCase()}{system.wormhole.slice(1)} wormhole
          </div>
        ) : null}
        {system.planets.length === 0 ? <div className="sub">No planets in this system.</div> : (
          <div className="sysinfo-planets">
            {system.planets.map(planet => {
              const trait = planetTrait(planet.id, planet.trait)
              return (
                <div className="sysinfo-planet" key={planet.id} data-testid={`system-info-planet-${planet.id}`}>
                  <div className="sysinfo-planet-name">{planet.name}</div>
                  <div className="sysinfo-vals">
                    <img src={planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady} alt="Resources" />
                    <span>{planet.resources}</span>
                    <img src={planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady} alt="Influence" />
                    <span>{planet.influence}</span>
                    {trait !== 'none' ? <span className="sysinfo-trait">{TRAIT_LABEL[trait]}</span> : null}
                    {planet.techSkip ? <span className="sysinfo-trait">{planet.techSkip} tech skip</span> : null}
                  </div>
                  <div className="sub">
                    {planet.owner !== null ? `Controlled by ${state.players[planet.owner].name}` : 'Uncontrolled'}
                    {planet.exhausted ? ', exhausted' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="sub" data-testid="system-info-fleet">
          {fleet.length === 0 ? 'No ships in this system.' : fleet.map(group => (
            <span key={`${group.owner}-${group.type}`} style={{ marginRight: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <UnitStack group={group} colour={group.owner === 'guardian' ? 'grey' : state.players[group.owner].color} testId={`system-info-fleet-${group.owner}-${group.type}`} alwaysCount />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
