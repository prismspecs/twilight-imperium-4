import { FACTIONS } from '../../data/factions'
import { objectiveDef } from '../../data/objectives'
import { techDef } from '../../data/techs'
import { HAND_LIMIT, fleetPoolLimit, readyResources, unitsOf } from '../../engine'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BADGE, MISC, spriteUrl, tokenUrl, unitCardUrl } from '../art'
import { TechIcon } from '../TechIcon'
import { ownedPlanets, readyInfluence, unitLabel } from '../format'
import { PANEL_SCALE, spriteSize } from '../sprites'
import { useModelStyle } from '../modelStyle'
import type { GameState, Seat, UnitType } from '../../engine/types'

const POOLS = ['tactic', 'fleet', 'strategy'] as const
const FORCE_ORDER: UnitType[] = ['flagship', 'warsun', 'dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'pds', 'spacedock']

export interface SidePanelProps {
  state: GameState
  seat: Seat
  onSelectSeat?: (seat: Seat) => void
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`sec${open ? '' : ' collapsed'}`}>
      <button type="button" className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`section-${id}`}>
        <span className="sec-arrow">{open ? '▾' : '▸'}</span>
        <span className="sec-title">{title}</span>
      </button>
      {open ? <div className="sec-body">{children}</div> : null}
    </div>
  )
}

export function SidePanel({ state, seat, onSelectSeat }: SidePanelProps) {
  const [shown, setShown] = useState<UnitType | null>(null)
  const { style } = useModelStyle()
  const safeSeat = (seat < state.players.length ? seat : 0) as Seat
  const player = state.players[safeSeat]
  const planets = ownedPlanets(state, safeSeat)
  const counts = new Map<UnitType, number>()
  for (const unit of unitsOf(state, safeSeat)) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
  const targetVp = state.players.length <= 2 ? 7 : 10
  return (
    <div className="side-panel" data-testid={`panel-${seat}`}>
      <div className="seat-tabs" data-testid="seat-tabs-side">
        {state.players.map((p, idx) => (
          <button
            key={p.seat}
            type="button"
            className={`seat-tab ${p.seat === seat ? 'active' : ''}`}
            onClick={() => onSelectSeat?.(p.seat as Seat)}
            data-testid={`tab-side-${p.seat}`}
            title={p.name}
          >
            {state.players.length > 2 ? `P${idx + 1}` : FACTIONS[p.faction].name}
          </button>
        ))}
      </div>
      <div className="pcontent">
        <Section title="Victory points" id="vp">
          <div className="vp">
            <span data-testid={`vp-${seat}`}>{player.vp} of {targetVp}</span>
            <div className="vp-track">
              {Array.from({ length: targetVp }, (_, i) => i + 1).map(n => (
                <i key={n} className={n <= player.vp ? 'on' : ''} data-n={n} />
              ))}
            </div>
          </div>
        </Section>
        <Section title="Command tokens" id="tokens">
          <div className="slots">
            {POOLS.map(pool => (
              <div className="slot" key={pool}>
                <div className="stack">
                  {Array.from({ length: Math.min(3, player.tokens[pool]) }, (_, i) => (
                    <img key={i} src={tokenUrl(player.faction, pool === 'fleet' ? 'command-fleet' : 'command')} alt="" style={{ top: i * 5 }} />
                  ))}
                </div>
                <div className="cap">{pool}<b data-testid={`tokens-${seat}-${pool}`}>{player.tokens[pool]}</b></div>
              </div>
            ))}
          </div>
          <div className="tot"><span className="k">Fleet pool</span>{fleetPoolLimit(player)} ships/system</div>
        </Section>
        <Section title="Planets" id="planets">
          <div className="planets">
            {planets.map(planet => (
              <div className={`pl${planet.exhausted ? ' exh' : ''}`} key={planet.id} data-testid={`planet-${seat}-${planet.id}`}>
                <div className="n">{planet.name}</div>
                <div className="v">
                  <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
                  <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="tot">
            <span className="k">Ready</span>
            <span data-testid={`economy-${seat}-resources`}>{readyResources(state, seat)}</span>r
            {' '}
            <span data-testid={`economy-${seat}-influence`}>{readyInfluence(state, seat)}</span>i
          </div>
          <div className="econ-row">
            <span className="econ"><img src={MISC.tradeGood} alt="" /> <b data-testid={`economy-${seat}-tradegoods`}>{player.tradeGoods}</b></span>
            <span className="econ"><img src={MISC.commodity} alt="" /> <b data-testid={`economy-${seat}-commodities`}>{player.commodities} of {FACTIONS[player.faction].commodityValue}</b></span>
            {/* R9: how many action cards a player holds is public; what they are is not */}
            <span className="econ"><img src={MISC.mandateBack} alt="Action cards" /> <b data-testid={`action-cards-${seat}`}>{player.actionCards.length} of {HAND_LIMIT}</b></span>
          </div>
        </Section>
        <Section title="Technologies" id="tech">
          <div className="tech-list">
            {player.techs.map(id => (
              <div className="techrow" key={id}>
                <TechIcon techId={id} colour={player.color} />
                <span data-testid={`tech-${seat}-${id}`}>{techDef(id).name}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Forces" id="forces">
          <div className="forces">
            {FORCE_ORDER.filter(type => counts.has(type)).map(type => {
              const size = spriteSize(type, PANEL_SCALE, style)
              return (
                <div className={`fc${type === 'dreadnought' ? ' wide' : ''}`} key={type} data-testid={`forces-${seat}-${type}`}
                  onMouseEnter={() => setShown(type)} onMouseLeave={() => setShown(null)}
                  onFocus={() => setShown(type)} onBlur={() => setShown(null)} tabIndex={0}>
                  <img src={spriteUrl(player.color, type, style)} alt="" width={size.width} height={size.height} />
                  <b>{counts.get(type)}</b>{' '}<span className="n">{unitLabel(type, player)}</span>
                </div>
              )
            })}
          </div>
        </Section>
        {player.secretObjectives && player.secretObjectives.length > 0 && (
          <Section title="Secret Objectives" id="secrets">
            <div className="secret-list" data-testid={`secret-objectives-${seat}`}>
              {player.secretObjectives.map(id => {
                const def = objectiveDef(id)
                const scored = player.scoredObjectives.includes(id)
                return (
                  <div
                    key={id}
                    className={`secret-item${scored ? ' scored' : ''}`}
                    data-testid={`secret-${seat}-${id}`}
                  >
                    <div className="secret-head">
                      <span className="secret-name">{def?.name ?? id}</span>
                      <span className="secret-badge">{scored ? 'Scored' : 'Secret'}</span>
                    </div>
                    {def?.text && <div className="secret-text">{def.text}</div>}
                  </div>
                )
              })}
            </div>
          </Section>
        )}
      </div>
      {shown && typeof document !== 'undefined' ? createPortal(
        <div className="unitcard" data-testid={`unitcard-${seat}-${shown}`}>
          <img src={unitCardUrl(shown, player.faction)} alt={unitLabel(shown, player)} />
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
