import { FACTIONS } from '../../data/factions'
import { objectiveDef } from '../../data/objectives'
import { techDef } from '../../data/techs'
import { fleetPoolLimit, readyResources, unitsOf } from '../../engine'
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
  side?: 'left' | 'right'
  onSelectSeat?: (seat: Seat) => void
}

export function SidePanel({ state, seat, side, onSelectSeat }: SidePanelProps) {
  // hovering a force opens its reference card next to the column; the column itself does not scroll, so the
  // card is rendered here rather than inside the scrolling content, where it would be clipped away
  const [shown, setShown] = useState<UnitType | null>(null)
  const { style } = useModelStyle()
  const safeSeat = (seat < state.players.length ? seat : 0) as Seat
  const player = state.players[safeSeat]
  const planets = ownedPlanets(state, safeSeat)
  const counts = new Map<UnitType, number>()
  for (const unit of unitsOf(state, safeSeat)) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
  const panelSide = side ?? (safeSeat === 0 ? 'left' : 'right')
  const targetVp = state.players.length <= 2 ? 7 : 10

  return (
    <div className={`${panelSide === 'left' ? 'colL' : 'colR'}`} data-testid={`panel-${seat}`}>
      {state.players.length > 2 && (
        <div className="seat-tabs" data-testid={`seat-tabs-${panelSide}`}>
          {state.players.map((p, idx) => (
            <button
              key={p.seat}
              type="button"
              className={`seat-tab ${p.seat === seat ? 'active' : ''}`}
              onClick={() => onSelectSeat?.(p.seat as Seat)}
              data-testid={`tab-${panelSide}-${p.seat}`}
            >
              P{idx + 1}
            </button>
          ))}
        </div>
      )}
      <div className="in pcontent">
        <div className="sec">
          <span className="lbl bul">Victory points <span data-testid={`vp-${seat}`}>{player.vp} of {targetVp}</span></span>
          <div className="vp">
            {Array.from({ length: targetVp }, (_, i) => i + 1).map(n => (
              <i key={n} className={n <= player.vp ? 'on' : ''} data-n={n} />
            ))}
          </div>
        </div>
        <div className="sec">
          <span className="lbl bul">Command tokens</span>
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
          <div className="tot"><span className="k">Fleet pool</span>{fleetPoolLimit(player)} ships per system</div>
        </div>
        <div className="sec">
          <span className="lbl bul">Planets</span>
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
            <span data-testid={`economy-${seat}-resources`}>{readyResources(state, seat)}</span> resources
            <span data-testid={`economy-${seat}-influence`}>{readyInfluence(state, seat)}</span> influence
          </div>
          <div className="tot">
            <span className="k">Trade goods</span><img src={MISC.tradeGood} alt="" />
            <b data-testid={`economy-${seat}-tradegoods`}>{player.tradeGoods}</b>
          </div>
          <div className="tot">
            <span className="k">Commodities</span><img src={MISC.commodity} alt="" />
            <b data-testid={`economy-${seat}-commodities`}>{player.commodities} of {FACTIONS[player.faction].commodityValue}</b>
          </div>
        </div>
        <div className="sec">
          <span className="lbl bul">Technologies</span>
          {player.techs.map(id => (
            <div className="techrow" key={id}>
              <TechIcon techId={id} colour={player.color} />
              <span data-testid={`tech-${seat}-${id}`}>{techDef(id).name}</span>
            </div>
          ))}
        </div>
        <div className="sec">
          <span className="lbl bul">Forces</span>
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
        </div>
        {player.secretObjectives && player.secretObjectives.length > 0 && (
          <div className="sec" data-testid={`secret-objectives-${seat}`}>
            <span className="lbl bul">Secret Objectives</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {player.secretObjectives.map(id => {
                const def = objectiveDef(id)
                const scored = player.scoredObjectives.includes(id)
                return (
                  <div
                    key={id}
                    className={`secret-item${scored ? ' scored' : ''}`}
                    data-testid={`secret-${seat}-${id}`}
                    style={{
                      padding: '5px 8px',
                      background: scored ? 'rgba(34,197,94,0.10)' : 'var(--socket-bg)',
                      border: `1px solid ${scored ? 'rgba(34,197,94,0.30)' : 'var(--alpha-frame)'}`,
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-label)', fontWeight: 600, color: scored ? '#86efac' : 'var(--ink)' }}>{def?.name ?? id}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', padding: '1px 4px', borderRadius: 'var(--radius-sm)', background: scored ? 'rgba(34,197,94,0.20)' : 'var(--graphite-socket)', color: scored ? '#86efac' : 'var(--ink-muted)' }}>
                        {scored ? 'Scored (1 VP)' : 'Secret'}
                      </span>
                    </div>
                    {def?.text && <div style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--text-micro)', color: 'var(--ink-muted)', lineHeight: '1.2' }}>{def.text}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {/* the panel is clipped by its container, so the card is hung on the document instead */}
      {shown && typeof document !== 'undefined' ? createPortal(
        <div className="unitcard" data-testid={`unitcard-${seat}-${shown}`}>
          <img src={unitCardUrl(shown, player.faction)} alt={unitLabel(shown, player)} />
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
