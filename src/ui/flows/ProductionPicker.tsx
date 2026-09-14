import { FLAGSHIP_INFO } from '../../data/flagships'
import { unitStats } from '../../data/units'
import { canProduceUnit, productionCost } from '../../engine'
import { COLOUR_INK, spriteUrl, unitCardUrl } from '../art'
import { unitLabel } from '../format'
import { Stepper } from './Stepper'
import type { GameState, Seat, UnitType } from '../../engine/types'

const DISPLAY_ORDER: UnitType[] = ['dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'warsun', 'flagship']

export function unitTotal(units: Partial<Record<UnitType, number>>): number {
  return DISPLAY_ORDER.reduce((sum, type) => sum + (units[type] ?? 0), 0)
}

export function costOf(state: GameState, seat: Seat, units: Partial<Record<UnitType, number>>): number {
  const player = state.players[seat]
  return productionCost(units, { faction: player.faction, techs: player.techs }, player.techs.includes('sarween_tools'), state)
}

export interface ProductionPickerProps {
  state: GameState
  seat: Seat
  /** How many units the space dock may still make; the steppers cap themselves on it. */
  limit: number
  units: Partial<Record<UnitType, number>>
  onUnits: (units: Partial<Record<UnitType, number>>) => void
}

/** R4.4: the unit reference cards with a count under each, shared by the tactical production and Warfare. */
export function ProductionPicker({ state, seat, limit, units, onUnits }: ProductionPickerProps) {
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  const total = unitTotal(units)
  const ink = COLOUR_INK[player.color]
  return (
    <div className="ucards" data-testid="production-picker">
      {DISPLAY_ORDER.filter(type => canProduceUnit(player, type)).map(type => {
        const printed = unitStats(type, stats)
        const count = units[type] ?? 0
        const room = Math.min(limit - total + count, player.reinforcements[type])
        const cardUrl = unitCardUrl(type, player.faction)
        return (
          <div className={`uc${room === 0 ? ' off' : ''}`} key={type}>
            {cardUrl ? (
              <img src={cardUrl} alt={unitLabel(type, player)} />
            ) : type === 'flagship' ? (
              <div className="uc-flagship-card" style={{ borderColor: ink.accent }} data-testid={`uc-flagship-${player.faction}`}>
                <div className="uc-fc-head" style={{ borderBottomColor: ink.accent }}>
                  <span>{FLAGSHIP_INFO[player.faction]?.name ?? 'FLAGSHIP'}</span>
                </div>
                <div className="uc-fc-body">
                  <img src={spriteUrl(player.color, 'flagship', 'models')} alt="" className="uc-fc-sprite" />
                  <div className="uc-fc-traits">
                    <span>SUSTAIN</span>
                    {printed.afb ? <span>AFB {printed.afb.value} (x{printed.afb.dice})</span> : null}
                    {printed.bombardment ? <span>BOMBARD {printed.bombardment.value}</span> : null}
                    {printed.spaceCannon ? <span>CANNON {printed.spaceCannon.value}</span> : null}
                  </div>
                </div>
                <div className="uc-fc-stats">
                  <div className="uc-fc-stat"><span>CST</span><b>{printed.cost}</b></div>
                  <div className="uc-fc-stat"><span>BAT</span><b>{printed.combat}{printed.combatDice > 1 ? `x${printed.combatDice}` : ''}</b></div>
                  <div className="uc-fc-stat"><span>MOV</span><b>{printed.move}</b></div>
                  <div className="uc-fc-stat"><span>CAP</span><b>{printed.capacity}</b></div>
                </div>
              </div>
            ) : (
              <img src="" alt={unitLabel(type, player)} />
            )}
            <div className="n">{unitLabel(type, player)}</div>
            <div className="s">Cost {printed.producedPerCost > 1 ? `${printed.cost} for ${printed.producedPerCost}` : printed.cost}</div>
            <Stepper id={`step-${type}`} value={count} max={Math.max(count, room)} onChange={n => onUnits({ ...units, [type]: n })} />
          </div>
        )
      })}
    </div>
  )
}
