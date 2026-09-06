import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FACTIONS } from '../../data/factions'
import { MANDATES, objectiveDef } from '../../data/objectives'
import { cardOwner } from '../../engine'
import { INITIATIVE } from '../../engine/strategyPhase'
import { MISC, strategyCardUrl, tokenUrl } from '../art'
import { CARD_NAME } from '../format'
import type { GameState, Seat, StrategyCardId } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial']

export interface FloatingRightDeckProps {
  state: GameState
  activeTab: 'objectives' | 'strategy'
  onTabChange: (tab: 'objectives' | 'strategy') => void
  isOpen: boolean
  onToggleOpen: () => void
  onPick?: (card: StrategyCardId) => void
}

export function FloatingRightDeck({
  state,
  activeTab,
  onTabChange,
  isOpen,
  onToggleOpen,
  onPick,
}: FloatingRightDeckProps) {
  const [hoveredCard, setHoveredCard] = useState<StrategyCardId | null>(null)

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
    </aside>
  )
}
