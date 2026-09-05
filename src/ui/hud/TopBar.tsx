import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FACTIONS } from '../../data/factions'
import { MANDATES, objectiveDef } from '../../data/objectives'
import { cardOwner } from '../../engine'
import { INITIATIVE } from '../../engine/strategyPhase'
import { MISC, PORTRAIT, SIGIL, strategyCardUrl, tokenUrl } from '../art'
import { CARD_NAME, formatClock } from '../format'
import type { GameState, Seat, StrategyCardId } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial']

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
        <div
          className="face"
          style={{ backgroundImage: `url(${SIGIL[player.faction] || PORTRAIT[player.faction]})` }}
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
        </div>
      </div>

      {player.strategyCards.length > 0 ? (
        <div className="player-scs">
          {player.strategyCards.map(sc => (
            <span
              key={sc.id}
              className={`sc-mini-badge sc-init-${INITIATIVE[sc.id]}${sc.used ? ' spent' : ''}`}
              title={`${CARD_NAME[sc.id]} (${sc.used ? 'played' : 'ready'})`}
            >
              <span className="sc-mini-num">{INITIATIVE[sc.id]}</span>
              <span className="sc-mini-name">{CARD_NAME[sc.id]}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="clock mini">
        <span data-testid={`clock-${seat}`}>{formatClock(clockMs)}</span>
        <small>{running ? 'running' : 'paused'}</small>
      </div>

      <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / clockMaxMs) * 100)}%` }} /></div>

      <span className={`chip ${player.color}${active ? ' is-active' : ''}`} data-testid={`turn-${seat}`}>
        {active ? 'Your turn' : 'Waiting'}
      </span>
    </div>
  )
}

function StrategyCards({ state, onPick }: { state: GameState; onPick?: (card: StrategyCardId) => void }) {
  // the enlarged card is hung on the document rather than inside the top bar, so no bar/board container
  // clips it: the top bar's own stacking context would otherwise trap the popup behind the board
  const [hovered, setHovered] = useState<StrategyCardId | null>(null)
  useEffect(() => { return () => { setHovered(null) } }, [])

  return (
    <div className="strats">
      {onPick ? <div className="pickprompt" data-testid="pick-prompt">Pick a strategy card</div> : null}
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
            disabled={!pickable}
            className={`sc${owner === null ? ' free' : ` own-${owner}`}${used ? ' played' : ''}${pickable ? ' pick' : ''}`}
            data-testid={`strategy-card-${card}`}
            title={`${CARD_NAME[card]}, ${label}`}
            aria-label={`${CARD_NAME[card]}, ${label}`}
            onMouseEnter={() => setHovered(card)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(card)}
            onBlur={() => setHovered(null)}
            onClick={pickable ? () => onPick(card) : undefined}
          >
            <span className="card">
              <div className="sc-top">
                <span className={`sc-disc sc-init-${initiative}`}>{initiative}</span>
                <span className="sc-name">{CARD_NAME[card]}</span>
              </div>
              <div className="sc-bottom">
                {owner !== null ? (
                  <span className="sc-owner-tag">
                    <img className="held" src={tokenUrl(state.players[owner].faction, 'command')} alt="" width={14} height={14} />
                    <span className="sc-owner-nick">{state.players[owner].name}</span>
                  </span>
                ) : (
                  <span className="sc-unpicked-tag">UNPICKED</span>
                )}
                {bonus > 0 ? (
                  <span className="tgfan" data-testid={`strategy-bonus-${card}`}>
                    {Array.from({ length: bonus }, (_, i) => (
                      <img key={i} src={MISC.tradeGood} alt="" width={13} height={13} />
                    ))}
                    <span className="tgfan-num">+{bonus}</span>
                  </span>
                ) : null}
              </div>
              <img className="face sc-art-hidden" src={used ? MISC.strategyBack : strategyCardUrl(card)} alt={CARD_NAME[card]} />
            </span>
            <span className="vis" data-testid={`strategy-state-${card}`}>{label}</span>
          </button>
        )
      })}
      {hovered !== null && typeof document !== 'undefined' ? createPortal(
        <div className="strat-hover" data-testid={`strategy-hover-${hovered}`} aria-hidden="true">
          <div className="strat-hover-card">
            <img src={strategyCardUrl(hovered)} alt={CARD_NAME[hovered]} />
          </div>
          <div className="strat-hover-label">{CARD_NAME[hovered]}</div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function Objectives({ state }: { state: GameState }) {
  const scoredBy = (test: (seat: Seat) => boolean) => state.players.map((_, i) => i as Seat).filter(test)
  return (
    <div className="objs">
      <div className="objrow">
        {state.publicObjectives.map((id, index) => {
          const def = objectiveDef(id)
          if (!def) return null
          const isStage2 = def.points === 2
          return (
            <div
              className={`obj ${isStage2 ? 'stage-2' : 'stage-1'}`}
              key={id}
              data-testid={`objective-${id}`}
              title={def.text}
              style={{ ['--bg' as string]: `url(${MISC.objectiveBack})` }}
            >
              <div className="obj-top">
                <span className="tier">{isStage2 ? 'STAGE II' : `STAGE I · R${index + 1}`}</span>
                <span className="obj-pts">{def.points} VP</span>
              </div>
              <div className="txt">{def.short}</div>
              <div className="obj-scorers">
                {scoredBy(seat => state.players[seat].scoredObjectives.includes(id)).map(seat => (
                  <img
                    key={seat}
                    className={`tok s${seat}`}
                    src={tokenUrl(state.players[seat].faction, 'control')}
                    alt="scored"
                    data-testid={`scored-${id}-${seat}`}
                  />
                ))}
              </div>
              <span className="full" aria-hidden="true">{def.text}</span>
            </div>
          )
        })}
        {MANDATES.map(def => (
          <div
            className="obj mandate"
            key={def.id}
            data-testid={`mandate-${def.id}`}
            title={def.text}
            style={{ ['--bg' as string]: `url(${MISC.mandateBack})` }}
          >
            <div className="obj-top">
              <span className="tier">{def.id === 'first_strike' ? 'RACE' : 'SEC'}</span>
              <span className="obj-pts">1 VP</span>
            </div>
            <div className="txt">{def.short}</div>
            <div className="obj-scorers">
              {scoredBy(seat => state.players[seat].scoredMandates.includes(def.id)).map(seat => (
                <img
                  key={seat}
                  className={`tok s${seat}`}
                  src={tokenUrl(state.players[seat].faction, 'control')}
                  alt="scored"
                  data-testid={`scored-${def.id}-${seat}`}
                />
              ))}
            </div>
            <span className="full" aria-hidden="true">{def.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface TopBarProps {
  state: GameState
  clockMs: number[]
  clockMinutes: number
  clockRunning: boolean
  onPick?: (card: StrategyCardId) => void
  selectedSeat?: Seat
  onSelectSeat?: (seat: Seat) => void
}

export function TopBar({
  state,
  clockMs,
  clockMinutes,
  clockRunning,
  onPick,
  selectedSeat,
  onSelectSeat,
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
    <div className="topbar">
      {/* Tier 1: Game Status & Initiative-Ordered Factions Ribbon */}
      <div className="topbar-tier-players">
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
      </div>

      {/* Tier 2: Strategy Deck Console & Objectives Console */}
      <div className="topbar-tier-console">
        <StrategyCards state={state} onPick={onPick} />
        <Objectives state={state} />
      </div>
    </div>
  )
}
