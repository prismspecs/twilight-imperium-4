import { useState } from 'react'
import { isMovable, isShip, unitStats } from '../../data/units'
import { movableShips, movementObstacle, productionLimit } from '../../engine'
import type { MovementObstacle } from '../../engine'
import { spriteUrl } from '../art'
import { systemLabel, unitLabel } from '../format'
import { PANEL_SCALE, spriteSize } from '../sprites'
import { useModelStyle } from '../modelStyle'
import { Stepper } from './Stepper'
import { useGame } from '../store'
import type { GameState, Seat, Unit, UnitType } from '../../engine/types'

export interface GroundSource {
  id: string
  label: string
  units: Unit[]
}

export interface AvailableCargo {
  fighter: Unit[]
  infantrySources: GroundSource[]
  infantry: Unit[]
}

interface Cargo {
  fighter: number
  infantry: number
  infantryBySource?: Record<string, number>
}
type Picked = Record<string, Partial<Record<UnitType, number>>>

const SHIP_ORDER: UnitType[] = ['flagship', 'warsun', 'dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'floating_factory']

/** Undamaged ships first: moving a healthy hull into a fight is what a player means by "send two dreadnoughts". */
function byCondition(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => Number(a.damaged) - Number(b.damaged))
}

/** The ships of one origin that can reach the active system, grouped by type. */
function moversAt(state: GameState, options: { unitId: number; from: string }[], from: string): Map<UnitType, Unit[]> {
  const ids = new Set(options.filter(o => o.from === from).map(o => o.unitId))
  const out = new Map<UnitType, Unit[]>()
  for (const unit of state.systems[from].space) {
    if (!ids.has(unit.id)) continue
    out.set(unit.type, [...(out.get(unit.type) ?? []), unit])
  }
  return new Map([...out].map(([type, units]) => [type, byCondition(units)]))
}

/** Fighters and ground forces at an origin, minus the fighters that are already moving under their own power. */
function availableCargo(state: GameState, seat: Seat, from: string, moving: Unit[]): AvailableCargo {
  const sys = state.systems[from]
  const onTheirOwn = new Set(moving.map(u => u.id))
  const fighter = sys ? sys.space.filter(u => u.owner === seat && u.type === 'fighter' && !onTheirOwn.has(u.id)) : []
  const sources: GroundSource[] = []
  if (sys) {
    const inSpace = sys.space.filter(u => u.owner === seat && u.type === 'infantry')
    if (inSpace.length > 0) {
      sources.push({ id: 'space', label: 'Space', units: inSpace })
    }
    for (const p of sys.planets) {
      const onPlanet = p.ground.filter(u => u.owner === seat)
      if (onPlanet.length > 0) {
        sources.push({ id: p.id, label: p.name, units: onPlanet })
      }
    }
  }
  return {
    fighter,
    infantrySources: sources,
    infantry: sources.flatMap(s => s.units),
  }
}

function countFromSource(want: Cargo, sourceId: string, singleSource: boolean): number {
  if (want.infantryBySource && sourceId in want.infantryBySource) {
    return want.infantryBySource[sourceId] ?? 0
  }
  if (singleSource) return want.infantry
  return 0
}

const OBSTACLE_TEXT: Record<MovementObstacle, (target: string) => string> = {
  blocked: target => `A hostile fleet sits on the only path into ${target}. Ships cannot move through one, and the guardians of Mecatol Rex count.`,
  range: target => `No ship of yours is within range of ${target}. Move value 1 reaches the neighbouring systems only.`,
  none: () => 'You have no ship left that could move: they all sit in the active system or in an activated one.',
}

export function MovementPanel() {
  const { session, legal, apply, error } = useGame()
  const { style } = useModelStyle()
  const [picked, setPicked] = useState<Picked>({})
  const [cargo, setCargo] = useState<Record<string, Cargo>>({})
  if (!session) return null
  const state = session.state
  const seat = state.active
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  const target = state.tactical?.systemId ?? ''
  const options = movableShips(state, seat)
  const origins = [...new Set(options.map(o => o.from))]
  const capacityOf = (type: UnitType) => unitStats(type, stats).capacity

  const pickedAt = (from: string) => picked[from] ?? {}
  const cargoOf = (from: string): Cargo => cargo[from] ?? { fighter: 0, infantry: 0 }
  /** The ships actually leaving `from`, in the order the counts pick them. */
  const chosenAt = (from: string, movers: Map<UnitType, Unit[]>): Unit[] =>
    SHIP_ORDER.flatMap(type => (movers.get(type) ?? []).slice(0, pickedAt(from)[type] ?? 0))
  const roomAt = (chosen: Unit[]) => chosen.reduce((sum, u) => sum + capacityOf(u.type), 0)

  function updateSourceInfantry(from: string, sourceId: string, count: number, sources: GroundSource[]) {
    setCargo(prev => {
      const cur = prev[from] ?? { fighter: 0, infantry: 0 }
      const curSources: Record<string, number> = { ...(cur.infantryBySource ?? {}) }
      if (sources.length === 1) {
        curSources[sources[0].id] = count
      } else {
        curSources[sourceId] = count
      }
      const totalInfantry = sources.reduce((sum, s) => sum + (curSources[s.id] ?? 0), 0)
      return {
        ...prev,
        [from]: {
          ...cur,
          infantry: totalInfantry,
          infantryBySource: curSources,
        },
      }
    })
  }

  function updateSingleInfantry(from: string, count: number, sourceId?: string) {
    setCargo(prev => {
      const cur = prev[from] ?? { fighter: 0, infantry: 0 }
      return {
        ...prev,
        [from]: {
          ...cur,
          infantry: count,
          infantryBySource: sourceId ? { [sourceId]: count } : undefined,
        },
      }
    })
  }

  function updateFighter(from: string, count: number) {
    setCargo(prev => {
      const cur = prev[from] ?? { fighter: 0, infantry: 0 }
      return {
        ...prev,
        [from]: {
          ...cur,
          fighter: count,
        },
      }
    })
  }

  function submit() {
    const moves = origins.flatMap(from => {
      const movers = moversAt(state, options, from)
      const chosen = chosenAt(from, movers)
      const want = cargoOf(from)
      const pool = availableCargo(state, seat, from, chosen)
      const fightersToLoad = pool.fighter.slice(0, want.fighter).map(u => u.id)
      const infantryToLoad: number[] = []
      if (pool.infantrySources.length > 0) {
        for (const source of pool.infantrySources) {
          const count = countFromSource(want, source.id, pool.infantrySources.length === 1)
          infantryToLoad.push(...source.units.slice(0, count).map(u => u.id))
        }
      }
      if (infantryToLoad.length < want.infantry) {
        const alreadyLoaded = new Set(infantryToLoad)
        for (const u of pool.infantry) {
          if (infantryToLoad.length >= want.infantry) break
          if (!alreadyLoaded.has(u.id)) infantryToLoad.push(u.id)
        }
      }
      const queue = [...fightersToLoad, ...infantryToLoad]
      return chosen.map(ship => ({ unitId: ship.id, from, carrying: queue.splice(0, capacityOf(ship.type)) }))
    })
    if (moves.length === 0) return
    if (apply({ type: 'moveShips', moves })) {
      setPicked({})
      setCargo({})
    }
  }

  const totalPicked = origins.reduce((sum, from) => sum + Object.values(pickedAt(from)).reduce((a, b) => a + b, 0), 0)
  const canProduceHere = productionLimit(state, seat, target) > 0
  const targetSys = state.systems[target]
  const hasEnemyShips = targetSys?.space.some(u => u.owner !== seat && isShip(u.type)) ?? false
  const hasEnemyPlanets = targetSys?.planets.some(p => p.owner !== null && p.owner !== seat) ?? false
  const hasEnemyGround = targetSys?.planets.some(p => p.ground.some(u => u.owner !== seat)) ?? false
  const hasNeutralPlanets = targetSys?.planets.some(p => p.owner === null) ?? false
  const hasFriendlyBombardment = targetSys?.space.some(
    u => u.owner === seat && unitStats(u.type, stats).bombardment !== null
  ) ?? false
  const hasBombardmentTarget = hasFriendlyBombardment && (hasEnemyGround || hasEnemyPlanets)
  const hasInvasion = hasEnemyPlanets || hasEnemyGround || hasNeutralPlanets

  let zeroMoveLabel = 'Done moving'
  let isZeroMoveGold = false
  if (canProduceHere && !hasInvasion && !hasEnemyShips) {
    zeroMoveLabel = 'Proceed to production'
    isZeroMoveGold = true
  } else if (hasEnemyShips) {
    zeroMoveLabel = 'Proceed to space combat'
    isZeroMoveGold = true
  } else if (hasBombardmentTarget) {
    zeroMoveLabel = 'Proceed to bombardment & invasion'
    isZeroMoveGold = true
  } else if (hasInvasion) {
    zeroMoveLabel = 'Proceed to invasion'
    isZeroMoveGold = true
  } else if (canProduceHere) {
    zeroMoveLabel = 'Proceed to production'
    isZeroMoveGold = true
  }

  let skipLabel = 'Done moving'
  if (canProduceHere && !hasInvasion && !hasEnemyShips) {
    skipLabel = 'Skip to production'
  } else if (hasEnemyShips) {
    skipLabel = 'Skip to space combat'
  } else if (hasBombardmentTarget) {
    skipLabel = 'Skip to bombardment & invasion'
  } else if (hasInvasion) {
    skipLabel = 'Skip to invasion'
  } else if (canProduceHere) {
    skipLabel = 'Skip to production'
  }

  const obstacle = origins.length === 0 && !canProduceHere ? movementObstacle(state, seat, target) : null
  const lockedSystemsWithShips = origins.length === 0
    ? Object.values(state.systems).filter(sys =>
        sys.id !== target &&
        sys.activatedBy.includes(seat) &&
        sys.space.some(u => u.owner === seat && isMovable(u.type))
      )
    : []

  return (
    <div className="drawer bottom" data-testid="movement-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Movement into {systemLabel(target, state)}</span>
          <span className="sub">
            {canProduceHere && !hasInvasion && !hasEnemyShips
              ? (origins.length === 0
                  ? 'No ships to move. Proceed directly to production at your space dock.'
                  : 'Move ships into this system, or proceed directly to production at your space dock.')
              : hasBombardmentTarget
                ? 'Move additional ships, or proceed to bombardment and invasion.'
                : hasEnemyShips
                  ? 'Move ships in to engage the enemy fleet.'
                  : 'Pick the ships that move, then the units they carry.'}
          </span>
          <div className="right">
            {legal.some(m => m.type === 'exhaustSpatialConduit') ? (
              <button
                type="button"
                className="btn quiet"
                data-testid="btn-exhaust-spatial-conduit"
                title="Treat this system as adjacent to every system holding your ships, for this tactical action"
                onClick={() => apply({ type: 'exhaustSpatialConduit' })}
              >
                Exhaust Spatial Conduit Cylinder
              </button>
            ) : null}
            {totalPicked === 0 ? (
              <>
                {origins.length > 0 ? (
                  <button type="button" className="btn quiet" data-testid="btn-move-ships" disabled={true} onClick={submit}>
                    Move ships
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`btn ${isZeroMoveGold ? 'gold' : 'quiet'}`}
                  data-testid="btn-end-movement"
                  disabled={!legal.some(m => m.type === 'endMovement')}
                  onClick={() => apply({ type: 'endMovement' })}
                >
                  {zeroMoveLabel}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn gold" data-testid="btn-move-ships" onClick={submit}>
                  Move ships
                </button>
                <button
                  type="button"
                  className="btn quiet"
                  data-testid="btn-end-movement"
                  disabled={!legal.some(m => m.type === 'endMovement')}
                  onClick={() => apply({ type: 'endMovement' })}
                >
                  {skipLabel}
                </button>
              </>
            )}
          </div>
        </div>
        {error ? (
          <div className="sub err" role="alert" data-testid="movement-error">
            {error}
          </div>
        ) : null}
        {hasBombardmentTarget ? (
          <div
            className="info-callout"
            data-testid="bombardment-ready-notice"
            style={{
              margin: '8px 0',
              padding: '10px 14px',
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '6px',
              color: '#fde047',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🎯</span>
            <span>
              <strong>Ready for Bombardment:</strong> You have bombardment ships in{' '}
              {systemLabel(target, state)}. Under TI4 rules (LRR 83), Bombardment is Step 4.1 of the
              Tactical Action (during Invasion, immediately following Movement). Moving additional ships is
              optional — click &quot;Proceed to bombardment &amp; invasion&quot; to begin.
            </span>
          </div>
        ) : null}
        {canProduceHere ? (
          <div
            className="info-callout"
            data-testid="produce-ready-notice"
            style={{
              margin: '8px 0',
              padding: '10px 14px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: '6px',
              color: '#93c5fd',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🏭</span>
            <span>
              <strong>Ready to produce:</strong> You have a space dock in{' '}
              {systemLabel(target, state)} ready to produce up to {productionLimit(state, seat, target)} units.{' '}
              {origins.length === 0
                ? 'No ships to move. Click "Proceed to production" to build.'
                : 'Moving ships is optional — choose ships to move in, or click "Proceed to production" to build immediately.'}
            </span>
          </div>
        ) : obstacle ? (
          <div className="warn" data-testid="movement-obstacle">{OBSTACLE_TEXT[obstacle](systemLabel(target, state))}</div>
        ) : null}
        {lockedSystemsWithShips.map(sys => {
          const lockedShips = sys.space.filter(u => u.owner === seat && isMovable(u.type))
          const counts: Record<string, number> = {}
          for (const s of lockedShips) {
            const label = unitLabel(s.type, player)
            counts[label] = (counts[label] ?? 0) + 1
          }
          const summary = Object.entries(counts).map(([name, count]) => `${count} ${name}`).join(', ')
          return (
            <div
              key={sys.id}
              className="info-callout warn"
              data-testid={`locked-system-${sys.id}`}
              style={{
                margin: '8px 0',
                padding: '8px 14px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '15px' }}>🔒</span>
              <span>
                <strong>{systemLabel(sys.id, state)}:</strong> {summary} cannot move because this system already contains your command token (from activation or Construction secondary). Under TI4 rules (LRR 49.5), ships cannot move out of a system containing your command token.
              </span>
            </div>
          )
        })}
        {origins.map(from => {
          const movers = moversAt(state, options, from)
          const chosen = chosenAt(from, movers)
          const room = roomAt(chosen)
          const want = cargoOf(from)
          const carried = want.fighter + want.infantry
          const pool = availableCargo(state, seat, from, chosen)
          const setShips = (type: UnitType, n: number) => setPicked({ ...picked, [from]: { ...pickedAt(from), [type]: n } })
          const allMovers = SHIP_ORDER.filter(type => movers.has(type))
          const isAllSelected = allMovers.length > 0 && allMovers.every(type => (pickedAt(from)[type] ?? 0) === (movers.get(type)?.length ?? 0))
          const toggleBringAll = () => {
            if (isAllSelected) {
              setPicked(prev => {
                const next = { ...prev }
                delete next[from]
                return next
              })
              setCargo(prev => {
                const next = { ...prev }
                delete next[from]
                return next
              })
            } else {
              const allShips: Partial<Record<UnitType, number>> = {}
              const allChosen: Unit[] = []
              for (const type of allMovers) {
                const units = movers.get(type) ?? []
                allShips[type] = units.length
                allChosen.push(...units)
              }
              setPicked(prev => ({
                ...prev,
                [from]: allShips,
              }))
              // Bring every fighter and infantry the fleet has room for too, not just the ships themselves.
              const allRoom = roomAt(allChosen)
              const allPool = availableCargo(state, seat, from, allChosen)
              const wantFighter = Math.min(allPool.fighter.length, allRoom)
              let remainingRoom = allRoom - wantFighter
              const sourceCounts: Record<string, number> = {}
              let totalInf = 0
              for (const src of allPool.infantrySources) {
                const take = Math.min(src.units.length, remainingRoom)
                sourceCounts[src.id] = take
                remainingRoom -= take
                totalInf += take
              }
              setCargo(prev => ({
                ...prev,
                [from]: {
                  fighter: wantFighter,
                  infantry: totalInf,
                  infantryBySource: sourceCounts,
                },
              }))
            }
          }
          return (
            <div className="mvorigin" key={from} data-testid={`origin-${from}`}>
              <div className="mvhead">
                <span className="lbl bul">Ships in {systemLabel(from, state)}</span>
                <span className="sub" data-testid={`capacity-${from}`}>Capacity {room}, carrying {carried}</span>
                <button
                  type="button"
                  className="btn quiet btn-bring-all"
                  data-testid={`btn-bring-all-${from}`}
                  onClick={toggleBringAll}
                >
                  {isAllSelected ? 'Clear all' : 'Bring all'}
                </button>
              </div>
              <div className="mvunits">
                {SHIP_ORDER.filter(type => movers.has(type)).map(type => {
                  const units = movers.get(type) ?? []
                  const size = spriteSize(type, PANEL_SCALE, style)
                  const capacity = capacityOf(type)
                  const count = pickedAt(from)[type] ?? 0
                  return (
                    <div className={`mvu${count > 0 ? ' on' : ''}`} key={type} data-testid={`ship-card-${from}-${type}`}>
                      <span className="ico"><img src={spriteUrl(player.color, type, style)} alt="" width={size.width} height={size.height} /></span>
                      <div className="n">{unitLabel(type, player)}</div>
                      <div className="s">{capacity > 0 ? `Carries ${capacity} each` : 'No capacity'}</div>
                      <Stepper id={`ship-${from}-${type}`} value={count} max={units.length} onChange={n => setShips(type, n)} />
                      <div className="s">of {units.length}</div>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const hasFighters = pool.fighter.length > 0
                const availableSources = pool.infantrySources.filter(s => s.units.length > 0)
                const hasCarried = hasFighters || availableSources.length > 0
                if (!hasCarried) return null

                return (
                  <>
                    <div className="mvhead">
                      <span className="lbl bul">Carried units</span>
                      <span className="sub">
                        {room === 0 ? 'Pick a ship with capacity first.' : `${room - carried} of ${room} places free.`}
                      </span>
                    </div>
                    <div className="mvunits">
                      {/* Fighter card */}
                      {hasFighters ? (() => {
                        const size = spriteSize('fighter', PANEL_SCALE, style)
                        const available = pool.fighter.length
                        const value = want.fighter
                        return (
                          <div className={`mvu cargo${value > 0 ? ' on' : ''}`} key="fighter" data-testid={`cargo-card-${from}-fighter`}>
                            <span className="ico"><img src={spriteUrl(player.color, 'fighter', style)} alt="" width={size.width} height={size.height} /></span>
                            <div className="n">{unitLabel('fighter', player)}</div>
                            <div className="s">Needs a ride</div>
                            <Stepper id={`cargo-${from}-fighter`} value={value} max={Math.min(available, room - want.infantry)}
                              onChange={n => updateFighter(from, n)} />
                            <div className="s">of {available}</div>
                          </div>
                        )
                      })() : null}

                      {/* Infantry cards: single source vs multiple sources */}
                      {availableSources.length === 1 && pool.infantrySources.length <= 1 ? (
                        (() => {
                          const source = availableSources[0]
                          const available = source.units.length
                          const value = want.infantry
                          const size = spriteSize('infantry', PANEL_SCALE, style)
                          return (
                            <div className={`mvu cargo${value > 0 ? ' on' : ''}`} key="infantry" data-testid={`cargo-card-${from}-infantry`}>
                              <span className="ico"><img src={spriteUrl(player.color, 'infantry', style)} alt="" width={size.width} height={size.height} /></span>
                              <div className="n">{unitLabel('infantry', player)}</div>
                              <div className="s">{source.id === 'space' ? 'In space' : `On ${source.label}`}</div>
                              <Stepper id={`cargo-${from}-infantry`} value={value} max={Math.min(available, room - want.fighter)}
                                onChange={n => updateSingleInfantry(from, n, source.id)} />
                              <div className="s">of {available}</div>
                            </div>
                          )
                        })()
                      ) : (
                        availableSources.map(source => {
                          const value = countFromSource(want, source.id, false)
                          const otherCarried = carried - value
                          const size = spriteSize('infantry', PANEL_SCALE, style)
                          return (
                            <div
                              className={`mvu cargo${value > 0 ? ' on' : ''}`}
                              key={`infantry-${source.id}`}
                              data-testid={`cargo-card-${from}-infantry-${source.id}`}
                            >
                              <span className="ico"><img src={spriteUrl(player.color, 'infantry', style)} alt="" width={size.width} height={size.height} /></span>
                              <div className="n">{unitLabel('infantry', player)}</div>
                              <div className="s" style={{ color: 'var(--accent-blue-light)', fontWeight: 600 }}>
                                {source.id === 'space' ? 'In space' : `On ${source.label}`}
                              </div>
                              <Stepper
                                id={`cargo-${from}-infantry-${source.id}`}
                                value={value}
                                max={Math.min(source.units.length, room - otherCarried)}
                                onChange={n => updateSourceInfantry(from, source.id, n, pool.infantrySources)}
                              />
                              <div className="s">of {source.units.length}</div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
