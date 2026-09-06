import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FACTIONS } from '../../data/factions'
import { MANDATES, objectiveDef } from '../../data/objectives'
import { HAND_LIMIT, cardOwner, fleetPoolLimit, readyResources, unitsOf } from '../../engine'
import { INITIATIVE } from '../../engine/strategyPhase'
import { techDef } from '../../data/techs'
import { BADGE, MISC, SIGIL, spriteUrl, strategyCardUrl, tokenUrl, unitCardUrl } from '../art'
import { CARD_NAME, ownedPlanets, readyInfluence, unitLabel } from '../format'
import { TechIcon } from '../TechIcon'
import { PANEL_SCALE, spriteSize } from '../sprites'
import { useModelStyle } from '../modelStyle'
import type { GameState, Seat, StrategyCardId, UnitType } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial']
const POOLS = ['tactic', 'fleet', 'strategy'] as const
const FORCE_ORDER: UnitType[] = ['flagship', 'warsun', 'dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'pds', 'spacedock']

export interface FloatingRightDeckProps {
  state: GameState
  activeTab: 'objectives' | 'strategy' | 'faction'
  onTabChange: (tab: 'objectives' | 'strategy' | 'faction') => void
  isOpen: boolean
  onToggleOpen: () => void
  onPick?: (card: StrategyCardId) => void
  humanSeat?: Seat
}

export function FloatingRightDeck({
  state,
  activeTab,
  onTabChange,
  isOpen,
  onToggleOpen,
  onPick,
  humanSeat,
}: FloatingRightDeckProps) {
  const [hoveredCard, setHoveredCard] = useState<StrategyCardId | null>(null)
  const [shownForce, setShownForce] = useState<UnitType | null>(null)
  const { style } = useModelStyle()

  const safeSeat = (humanSeat !== undefined && humanSeat < state.players.length
    ? humanSeat
    : state.active < state.players.length ? state.active : 0) as Seat
  const myPlayer = state.players[safeSeat]
  const myFaction = FACTIONS[myPlayer.faction]
  const myPlanets = ownedPlanets(state, safeSeat)
  const counts = new Map<UnitType, number>()
  for (const unit of unitsOf(state, safeSeat)) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
  const targetVp = state.players.length <= 2 ? 7 : 10

  const scoredBy = (test: (seat: Seat) => boolean) =>
    state.players.map((_, i) => i as Seat).filter(test)

  return (
    <aside
      className={`floating-right-deck${isOpen ? ' is-open' : ' is-collapsed'}`}
      data-testid="floating-right-deck"
      aria-label="Game Objectives and Strategy Cards"
      inert={!isOpen ? true : undefined}
      aria-hidden={!isOpen}
    >
      {/* Header with tabs and collapse toggle */}
      <div className="frd-header">
        <div className="frd-tabs" role="tablist">
          <button
            id="tab-faction"
            type="button"
            role="tab"
            aria-selected={isOpen && activeTab === 'faction'}
            aria-controls="panel-faction"
            className={`frd-tab-btn${activeTab === 'faction' ? ' active' : ''}`}
            data-testid="tab-btn-faction"
            onClick={() => onTabChange('faction')}
          >
            <span className="frd-tab-icon" aria-hidden="true">🛡️</span>
            <span className="frd-tab-title">My Faction</span>
          </button>
          <button
            id="tab-objectives"
            type="button"
            role="tab"
            aria-selected={isOpen && activeTab === 'objectives'}
            aria-controls="panel-objectives"
            className={`frd-tab-btn${activeTab === 'objectives' ? ' active' : ''}`}
            data-testid="tab-btn-objectives"
            onClick={() => onTabChange('objectives')}
          >
            <span className="frd-tab-icon" aria-hidden="true">🎯</span>
            <span className="frd-tab-title">Objectives</span>
            <span className="frd-tab-count">{state.publicObjectives.length + MANDATES.length}</span>
          </button>
          <button
            id="tab-strategy"
            type="button"
            role="tab"
            aria-selected={isOpen && activeTab === 'strategy'}
            aria-controls="panel-strategy"
            className={`frd-tab-btn${activeTab === 'strategy' ? ' active' : ''}`}
            data-testid="tab-btn-strategy"
            onClick={() => onTabChange('strategy')}
          >
            <span className="frd-tab-icon" aria-hidden="true">👑</span>
            <span className="frd-tab-title">Strategy</span>
            <span className="frd-tab-count">8</span>
          </button>
        </div>
        <button
          type="button"
          className="frd-close-btn"
          data-testid="frd-close-btn"
          onClick={onToggleOpen}
          aria-label="Collapse side deck"
          title="Collapse side deck"
        >
          ✕
        </button>
      </div>

      {/* Main Body */}
      <div className="frd-body">
        {/* My Faction Tab Panel */}
        <div
          id="panel-faction"
          className={`frd-pane${activeTab === 'faction' ? ' active' : ''}`}
          role="tabpanel"
          aria-labelledby="tab-faction"
          data-testid="panel-faction"
          style={{ display: activeTab === 'faction' ? 'flex' : 'none' }}
        >
          {/* Faction Header Hero */}
          <div className="frd-faction-hero" data-testid={`frd-hero-${safeSeat}`}>
            <img
              src={SIGIL[myPlayer.faction] || tokenUrl(myPlayer.faction, 'control')}
              alt={myFaction.name}
              className="frd-faction-sigil"
              onError={e => { (e.currentTarget as HTMLImageElement).src = tokenUrl(myPlayer.faction, 'control') }}
            />
            <div className="frd-faction-info">
              <div className="frd-faction-name">{myFaction.name}</div>
              <div className="frd-player-name">
                {myPlayer.name} {state.speaker === safeSeat ? '⭐ Speaker' : ''}
              </div>
            </div>
            <div className="frd-vp-chip" data-testid={`frd-vp-${safeSeat}`}>
              {myPlayer.vp} of {targetVp} VP
            </div>
          </div>

          {/* Command Tokens */}
          <div className="frd-section-title">Command Tokens</div>
          <div className="slots frd-slots">
            {POOLS.map(pool => (
              <div className="slot" key={pool}>
                <div className="stack">
                  {Array.from({ length: Math.min(3, myPlayer.tokens[pool]) }, (_, i) => (
                    <img key={i} src={tokenUrl(myPlayer.faction, pool === 'fleet' ? 'command-fleet' : 'command')} alt="" style={{ top: i * 5 }} />
                  ))}
                </div>
                <div className="cap">{pool}<b data-testid={`frd-tokens-${safeSeat}-${pool}`}>{myPlayer.tokens[pool]}</b></div>
              </div>
            ))}
          </div>
          <div className="tot frd-tot"><span className="k">Fleet pool:</span>{fleetPoolLimit(myPlayer)} ships / system</div>

          {/* Economy & Resources */}
          <div className="frd-section-title">Economy & Resources</div>
          <div className="tot frd-tot">
            <span className="k">Ready:</span>
            <span className="econ-badge-val" title="Ready Resources" aria-label={`Ready Resources: ${readyResources(state, safeSeat)}`}>
              <span className="badge res" aria-hidden="true" style={{ backgroundImage: `url(${BADGE.resourceReady})` }} />
              <b data-testid={`frd-economy-${safeSeat}-resources`}>{readyResources(state, safeSeat)}</b>
            </span>
            <span className="econ-badge-val" title="Ready Influence" aria-label={`Ready Influence: ${readyInfluence(state, safeSeat)}`}>
              <span className="badge inf" aria-hidden="true" style={{ backgroundImage: `url(${BADGE.influenceReady})` }} />
              <b data-testid={`frd-economy-${safeSeat}-influence`}>{readyInfluence(state, safeSeat)}</b>
            </span>
          </div>
          <div className="econ-row frd-econ-row">
            <span className="econ"><img src={MISC.tradeGood} alt="Trade goods" /> <b data-testid={`frd-economy-${safeSeat}-tradegoods`}>{myPlayer.tradeGoods}</b></span>
            <span className="econ"><img src={MISC.commodity} alt="Commodities" /> <b data-testid={`frd-economy-${safeSeat}-commodities`}>{myPlayer.commodities} of {myFaction.commodityValue}</b></span>
            <span className="econ"><img src={MISC.mandateBack} alt="Action cards" /> <b data-testid={`frd-action-cards-${safeSeat}`}>{myPlayer.actionCards.length} of {HAND_LIMIT}</b></span>
          </div>

          {/* Secret Objectives */}
          <div className="frd-section-title">Secret Objectives ({myPlayer.secretObjectives.length})</div>
          <div className="frd-secrets-list" data-testid={`frd-secret-objectives-${safeSeat}`}>
            {myPlayer.secretObjectives.length === 0 ? (
              <div className="frd-empty-hint">No secret objectives held</div>
            ) : (
              myPlayer.secretObjectives.map(id => {
                const def = objectiveDef(id)
                const scored = myPlayer.scoredObjectives.includes(id)
                return (
                  <div
                    key={id}
                    className={`frd-obj-card secret-card${scored ? ' scored' : ''}`}
                    data-testid={`frd-secret-${safeSeat}-${id}`}
                  >
                    <div className="frd-obj-top">
                      <span className="frd-tier-badge">SECRET</span>
                      <span className="frd-vp-badge">{scored ? 'SCORED · 1 VP' : '1 VP'}</span>
                    </div>
                    <div className="frd-obj-name">{def?.name ?? id}</div>
                    {def?.text && <div className="frd-obj-desc">{def.text}</div>}
                  </div>
                )
              })
            )}
          </div>

          {/* Technologies */}
          <div className="frd-section-title">Technologies ({myPlayer.techs.length})</div>
          <div className="tech-list frd-tech-list">
            {myPlayer.techs.length === 0 ? (
              <div className="frd-empty-hint">No technologies researched</div>
            ) : (
              myPlayer.techs.map(id => (
                <div className="techrow" key={id} data-testid={`frd-tech-${safeSeat}-${id}`}>
                  <TechIcon techId={id} colour={myPlayer.color} />
                  <span>{techDef(id).name}</span>
                </div>
              ))
            )}
          </div>

          {/* Controlled Planets */}
          <div className="frd-section-title">Controlled Planets ({myPlanets.length})</div>
          <div className="planets frd-planets">
            {myPlanets.length === 0 ? (
              <div className="frd-empty-hint">No planets controlled</div>
            ) : (
              myPlanets.map(planet => (
                <div className={`pl${planet.exhausted ? ' exh' : ''}`} key={planet.id} data-testid={`frd-planet-${safeSeat}-${planet.id}`}>
                  <div className="n">{planet.name}</div>
                  <div className="v">
                    <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
                    <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Forces */}
          <div className="frd-section-title">Forces in Play</div>
          <div className="forces frd-forces">
            {FORCE_ORDER.filter(type => counts.has(type)).map(type => {
              const size = spriteSize(type, PANEL_SCALE, style)
              return (
                <div
                  className={`fc${type === 'dreadnought' ? ' wide' : ''}`}
                  key={type}
                  data-testid={`frd-forces-${safeSeat}-${type}`}
                  onMouseEnter={() => setShownForce(type)}
                  onMouseLeave={() => setShownForce(null)}
                  onFocus={() => setShownForce(type)}
                  onBlur={() => setShownForce(null)}
                  tabIndex={0}
                >
                  <img src={spriteUrl(myPlayer.color, type, style)} alt="" width={size.width} height={size.height} />
                  <b>{counts.get(type)}</b>{' '}<span className="n">{unitLabel(type, myPlayer)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Objectives Tab Panel */}
        <div
          id="panel-objectives"
          className={`frd-pane${activeTab === 'objectives' ? ' active' : ''}`}
          role="tabpanel"
          aria-labelledby="tab-objectives"
          style={{ display: activeTab === 'objectives' ? 'flex' : 'none' }}
        >
          <div className="frd-section-title">Public Objectives</div>
          <div className="frd-objs-list">
            {state.publicObjectives.map((id, index) => {
              const def = objectiveDef(id)
              if (!def) return null
              const isStage2 = def.points === 2
              const scorers = scoredBy(seat => state.players[seat].scoredObjectives.includes(id))
              return (
                <div
                  key={id}
                  className={`frd-obj-card ${isStage2 ? 'stage-2' : 'stage-1'}`}
                  data-testid={`objective-${id}`}
                >
                  <div className="frd-obj-top">
                    <span className="frd-tier-badge">
                      {isStage2 ? 'STAGE II' : `STAGE I · R${index + 1}`}
                    </span>
                    <span className="frd-vp-badge">{def.points} VP</span>
                  </div>
                  <div className="frd-obj-name">{def.short}</div>
                  <div className="frd-obj-desc">{def.text}</div>
                  {scorers.length > 0 ? (
                    <div className="frd-obj-scorers">
                      <span className="frd-scorers-label">Claimed by:</span>
                      {scorers.map(seat => (
                        <div
                          key={seat}
                          className="frd-scorer-token"
                          title={`${state.players[seat].name} (${FACTIONS[state.players[seat].faction].name})`}
                        >
                          <img
                            src={tokenUrl(state.players[seat].faction, 'control')}
                            alt={state.players[seat].name}
                            data-testid={`scored-${id}-${seat}`}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="frd-obj-unclaimed">Unclaimed</div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="frd-section-title" style={{ marginTop: '16px' }}>Mandates & Race Objectives</div>
          <div className="frd-objs-list">
            {MANDATES.map(def => {
              const scorers = scoredBy(seat => state.players[seat].scoredMandates.includes(def.id))
              return (
                <div
                  key={def.id}
                  className="frd-obj-card mandate"
                  data-testid={`mandate-${def.id}`}
                >
                  <div className="frd-obj-top">
                    <span className="frd-tier-badge">
                      {def.id === 'first_strike' ? 'RACE' : 'MANDATE'}
                    </span>
                    <span className="frd-vp-badge">1 VP</span>
                  </div>
                  <div className="frd-obj-name">{def.short}</div>
                  <div className="frd-obj-desc">{def.text}</div>
                  {scorers.length > 0 ? (
                    <div className="frd-obj-scorers">
                      <span className="frd-scorers-label">Claimed by:</span>
                      {scorers.map(seat => (
                        <div
                          key={seat}
                          className="frd-scorer-token"
                          title={`${state.players[seat].name} (${FACTIONS[state.players[seat].faction].name})`}
                        >
                          <img
                            src={tokenUrl(state.players[seat].faction, 'control')}
                            alt={state.players[seat].name}
                            data-testid={`scored-${def.id}-${seat}`}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="frd-obj-unclaimed">Unclaimed</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Strategy Cards Tab Panel */}
        <div
          id="panel-strategy"
          className={`frd-pane${activeTab === 'strategy' ? ' active' : ''}`}
          role="tabpanel"
          aria-labelledby="tab-strategy"
          style={{ display: activeTab === 'strategy' ? 'flex' : 'none' }}
        >
          {onPick ? (
            <div className="frd-pick-prompt" data-testid="pick-prompt">
              Pick a strategy card
            </div>
          ) : null}
          <div className="frd-sc-list">
            {ALL_CARDS.map(card => {
              const pool = state.strategyPool.find(c => c.id === card)
              const owner = cardOwner(state, card)
              const entry = owner === null ? undefined : state.players[owner].strategyCards.find(c => c.id === card)
              const bonus = pool?.bonus ?? 0
              const used = entry?.used ?? false
              const label = pool
                ? bonus > 0 ? `unpicked, ${bonus} trade good${bonus > 1 ? 's' : ''} on it` : 'unpicked'
                : owner === null ? 'returned' : `${state.players[owner].name}, ${used ? 'played' : 'ready'}`
              const pickable = pool !== undefined && onPick !== undefined
              const initiative = INITIATIVE[card]

              return (
                <button
                  key={card}
                  type="button"
                  aria-disabled={!pickable}
                  className={`frd-sc-item sc${owner === null ? ' free' : ` own-${owner}`}${used ? ' played' : ''}${pickable ? ' pick' : ' readonly'}`}
                  data-testid={`strategy-card-${card}`}
                  title={`${CARD_NAME[card]}, ${label}`}
                  aria-label={`${CARD_NAME[card]}, ${label}`}
                  onMouseEnter={() => setHoveredCard(card)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onFocus={() => setHoveredCard(card)}
                  onBlur={() => setHoveredCard(null)}
                  onClick={pickable ? () => onPick(card) : undefined}
                >
                  <div className="frd-sc-left">
                    <span className={`sc-disc sc-init-${initiative}`}>{initiative}</span>
                    <div className="frd-sc-text">
                      <span className="frd-sc-name">{CARD_NAME[card]}</span>
                      <span className="frd-sc-status-label">
                        {owner !== null ? (
                          <span className="frd-sc-owner">
                            <img src={tokenUrl(state.players[owner].faction, 'command')} alt="" width={12} height={12} />
                            <span>{state.players[owner].name} · {used ? 'Played' : 'Ready'}</span>
                          </span>
                        ) : (
                          <span className="frd-sc-free">Available</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="frd-sc-right">
                    {bonus > 0 ? (
                      <span className="tgfan" data-testid={`strategy-bonus-${card}`}>
                        {Array.from({ length: bonus }, (_, i) => (
                          <img key={i} src={MISC.tradeGood} alt="" width={13} height={13} />
                        ))}
                        <span className="tgfan-num">+{bonus}</span>
                      </span>
                    ) : null}
                    {pickable ? (
                      <span className="frd-sc-pick-cta">Draft</span>
                    ) : null}
                  </div>
                  <span className="vis" data-testid={`strategy-state-${card}`}>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Floating Hover Card Preview */}
      {isOpen && hoveredCard !== null && typeof document !== 'undefined' ? createPortal(
        <div className="strat-hover" data-testid={`strategy-hover-${hoveredCard}`} aria-hidden="true">
          <div className="strat-hover-card">
            <img src={strategyCardUrl(hoveredCard)} alt={CARD_NAME[hoveredCard]} />
          </div>
          <div className="strat-hover-label">{CARD_NAME[hoveredCard]}</div>
        </div>,
        document.body,
      ) : null}

      {/* Floating Hover Unit Card Preview */}
      {isOpen && shownForce !== null && typeof document !== 'undefined' ? createPortal(
        <div className="unitcard" data-testid={`frd-unitcard-${safeSeat}-${shownForce}`}>
          <img src={unitCardUrl(shownForce, myPlayer.faction)} alt={unitLabel(shownForce, myPlayer)} />
        </div>,
        document.body,
      ) : null}
    </aside>
  )
}
