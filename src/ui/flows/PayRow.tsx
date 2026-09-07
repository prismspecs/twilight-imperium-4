import { MISC } from '../art'
import { ownedPlanets } from '../format'
import { Stepper } from './Stepper'
import type { GameState, Seat } from '../../engine/types'

export interface PayRowProps {
  state: GameState
  seat: Seat
  unit?: 'resources' | 'influence'
  needed: number
  planets: string[]
  onPlanets: (planets: string[]) => void
  tradeGoods: number
  onTradeGoods: (n: number) => void
}

/** R4.4 and R5: exhaust ready planets and spend trade goods; overpay is lost, which the line spells out. */
export function PayRow({ state, seat, unit = 'resources', needed, planets, onPlanets, tradeGoods, onTradeGoods }: PayRowProps) {
  const owned = ownedPlanets(state, seat)
  const value = (planetId: string) => {
    const planet = owned.find(p => p.id === planetId)
    if (!planet) return 0
    return unit === 'resources' ? planet.resources : planet.influence
  }
  const paid = planets.reduce((sum, id) => sum + value(id), 0) + tradeGoods
  return (
    <div className="payrow" data-testid="payrow">
      <span className="lbl">Pay with</span>
      {owned.map(planet => (
        <button
          key={planet.id} type="button" disabled={planet.exhausted}
          className={`pay${planets.includes(planet.id) ? ' on' : ''}`} data-testid={`pay-${planet.id}`}
          onClick={() => onPlanets(planets.includes(planet.id) ? planets.filter(id => id !== planet.id) : [...planets, planet.id])}
          title={`${planet.name}: ${planet.resources} Resources / ${planet.influence} Influence${planet.exhausted ? ' (Exhausted)' : ''}`}
        >
          <span className="pay-pname">{planet.name}</span>
          <span className="pay-stats">
            <span className={`pay-val pay-res${unit === 'resources' ? ' active-unit' : ' alt-unit'}`}>{planet.resources}R</span>
            <span className="pay-sep">/</span>
            <span className={`pay-val pay-inf${unit === 'influence' ? ' active-unit' : ' alt-unit'}`}>{planet.influence}I</span>
          </span>
        </button>
      ))}
      <span className="pay">
        <img src={MISC.tradeGood} alt="" width={16} height={16} />
        <Stepper id="pay-tradegoods" value={tradeGoods} max={state.players[seat].tradeGoods} onChange={onTradeGoods} />
      </span>
      <span className="sub" data-testid="pay-total">{paid} of {needed}</span>
    </div>
  )
}
