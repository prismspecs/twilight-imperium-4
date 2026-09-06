import { useMemo } from 'react'
import { FACTIONS } from '../../data/factions'
import { MANDATES } from '../../data/objectives'
import { INITIATIVE } from '../../engine/strategyPhase'
import { MISC, tokenUrl } from '../art'
import { CARD_NAME, formatClock } from '../format'
import type { GameState, Seat } from '../../engine/types'

function CompactPlayer({
  state,
  seat,
  clockMs,
  clockMaxMs,
  clockRunning,
  isSelected,
  onSelect,
}: {
  state: GameState
  seat: Seat
  clockMs: number
  clockMaxMs: number
  clockRunning: boolean
  isSelected?: boolean
  onSelect?: (seat: Seat) => void
}) {
  const player = state.players[seat]
  const active = state.active === seat && state.winner === null
  const running = active && clockRunning

  return (
    <div
      className={`player-strip${active ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
      data-testid={`player-${seat}`}
      onClick={onSelect ? () => onSelect(seat) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isSelected : undefined}
      onKeyDown={onSelect ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(seat)
        }
      } : undefined}
      title={`${player.name} (${FACTIONS[player.faction].name})`}
    >
      <div className="portrait mini" style={{ borderColor: `var(--player-${seat})` }}>
        <img
          className="face"
          src={tokenUrl(player.faction, 'control')}
          alt={FACTIONS[player.faction].name}
        />
        {active ? <span className="active-dot" aria-hidden="true" /> : null}
      </div>

      <div className="pinfo">
        <div className="namerow">
          <span className="pname">{FACTIONS[player.faction].name}</span>
          {state.speaker === seat ? (
            <img className="speaker" src={MISC.speaker} alt="Speaker" data-testid={`speaker-${seat}`} />
          ) : null}
        </div>
        <div className="subrow">
          <span className="pnick">{player.name}</span>
          <span className="vp-chip">{player.vp} VP</span>
          {player.strategyCards.map(sc => (
            <span
              key={sc.id}
              className={`sc-mini-badge sc-init-${INITIATIVE[sc.id]}${sc.used ? ' spent' : ''}`}
              title={`${CARD_NAME[sc.id]} (${sc.used ? 'played' : 'ready'})`}
            >
              <span className="sc-mini-num">{INITIATIVE[sc.id]}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="clock mini">
        <span data-testid={`clock-${seat}`}>{formatClock(clockMs)}</span>
        <small>{running ? 'running' : 'paused'}</small>
      </div>

      <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / clockMaxMs) * 100)}%` }} /></div>

      <span className={`chip ${player.color}${active ? ' is-active' : ''} vis`} data-testid={`turn-${seat}`}>
        {active ? 'Your turn' : 'Waiting'}
      </span>
    </div>
  )
}

export interface TopBarProps {
  state: GameState
  clockMs: number[]
  clockMinutes: number
  clockRunning: boolean
  selectedSeat?: Seat
  onSelectSeat?: (seat: Seat) => void
  activeDeckTab?: 'objectives' | 'strategy'
  isDeckOpen?: boolean
  onToggleDeck?: (tab?: 'objectives' | 'strategy') => void
}

export function TopBar({
  state,
  clockMs,
  clockMinutes,
  clockRunning,
  selectedSeat,
  onSelectSeat,
  activeDeckTab,
  isDeckOpen,
  onToggleDeck,
}: TopBarProps) {
  const clockMaxMs = clockMinutes * 60000

  // Order players by initiative order (lowest SC initiative), or draft order
  const initiativeOrderedSeats = useMemo(() => {
    const seats = state.players.map((_, i) => i as Seat)
    return seats.sort((a, b) => {
      const initA = state.players[a].strategyCards.length > 0
        ? Math.min(...state.players[a].strategyCards.map(c => INITIATIVE[c.id]))
        : 100 + ((a - state.speaker + state.players.length) % state.players.length)
      const initB = state.players[b].strategyCards.length > 0
        ? Math.min(...state.players[b].strategyCards.map(c => INITIATIVE[c.id]))
        : 100 + ((b - state.speaker + state.players.length) % state.players.length)
      return initA - initB
    })
  }, [state.players, state.speaker])

  return (
    <header className="topbar">
      <div className="topbar-main-row">
        <div className="game-status-capsule">
          <span className="game-round-pill">R{state.round}</span>
          <span className="game-phase-pill">{state.phase.toUpperCase()}</span>
        </div>

        <div className="factions-ribbon">
          {initiativeOrderedSeats.map(seat => (
            <CompactPlayer
              key={seat}
              state={state}
              seat={seat}
              clockMs={clockMs[seat] ?? 0}
              clockMaxMs={clockMaxMs}
              clockRunning={clockRunning}
              isSelected={selectedSeat === seat}
              onSelect={onSelectSeat}
            />
          ))}
        </div>

        <div className="topbar-deck-toggles">
          <button
            type="button"
            className={`topbar-deck-btn${isDeckOpen && activeDeckTab === 'objectives' ? ' active' : ''}`}
            data-testid="topbar-btn-objectives"
            onClick={() => onToggleDeck?.('objectives')}
            title="Toggle Objectives Deck"
          >
            <span className="deck-icon" aria-hidden="true">🎯</span>
            <span className="deck-label">Objectives</span>
            <span className="deck-count">{state.publicObjectives.length + MANDATES.length}</span>
          </button>
          <button
            type="button"
            className={`topbar-deck-btn${isDeckOpen && activeDeckTab === 'strategy' ? ' active' : ''}`}
            data-testid="topbar-btn-strategy"
            onClick={() => onToggleDeck?.('strategy')}
            title="Toggle Strategy Cards Deck"
          >
            <span className="deck-icon" aria-hidden="true">👑</span>
            <span className="deck-label">Strategy</span>
            <span className="deck-count">8</span>
          </button>
          <button
            type="button"
            className={`topbar-deck-btn toggle-deck${isDeckOpen ? ' open' : ''}`}
            data-testid="topbar-btn-toggle-deck"
            onClick={() => onToggleDeck?.()}
            title={isDeckOpen ? 'Collapse side deck' : 'Expand side deck'}
            aria-label={isDeckOpen ? 'Collapse side deck' : 'Expand side deck'}
          >
            <span className="deck-icon" aria-hidden="true">{isDeckOpen ? '⇥' : '⇤'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
