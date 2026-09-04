import { useState } from 'react'
import { productionLimit } from '../../engine'
import { systemLabel } from '../format'
import { PayRow } from './PayRow'
import { ProductionPicker, costOf, unitTotal } from './ProductionPicker'
import { useGame } from '../store'
import type { UnitType } from '../../engine/types'

export function ProduceDrawer() {
  const { session, legal, apply } = useGame()
  const [units, setUnits] = useState<Partial<Record<UnitType, number>>>({})
  const [planets, setPlanets] = useState<string[]>([])
  const [tradeGoods, setTradeGoods] = useState(0)
  if (!session) return null
  const state = session.state
  const seat = state.active
  const systemId = state.tactical?.systemId ?? ''
  const limit = productionLimit(state, seat, systemId)
  const total = unitTotal(units)
  const cost = costOf(state, seat, units)
  const paid = planets.reduce((sum, id) => {
    const planet = Object.values(state.systems).flatMap(s => s.planets).find(p => p.id === id)
    return sum + (planet ? planet.resources : 0)
  }, 0) + tradeGoods
  return (
    <div className="drawer bottom wide" data-testid="produce-drawer">
      <div className="in">
        <div className="dhead">
          <span className="tab">Production at {systemLabel(systemId)}</span>
          <span className="sub">
            Production <b data-testid="produce-limit">{limit}</b>, used <b>{total}</b>, cost <b data-testid="produce-cost">{cost}</b>
          </span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-produce"
              disabled={total === 0 || total > limit || paid < cost}
              onClick={() => { if (apply({ type: 'produce', units, planets, tradeGoods })) { setUnits({}); setPlanets([]); setTradeGoods(0) } }}>
              Confirm production
            </button>
            <button type="button" className="btn quiet" data-testid="btn-end-tactical"
              disabled={!legal.some(m => m.type === 'endTactical')} onClick={() => apply({ type: 'endTactical' })}>End tactical action</button>
          </div>
        </div>
        <ProductionPicker state={state} seat={seat} limit={limit} units={units} onUnits={setUnits} />
        <PayRow state={state} seat={seat} needed={cost} planets={planets} onPlanets={setPlanets}
          tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
      </div>
    </div>
  )
}
