import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FACTIONS } from '../../data/factions'
import { MANDATES, objectiveDef } from '../../data/objectives'
import { cardOwner } from '../../engine'
import { MISC, PORTRAIT, strategyCardUrl, tokenUrl } from '../art'
import { CARD_NAME, formatClock } from '../format'
import type { GameState, Seat, StrategyCardId } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'trade', 'warfare', 'technology', 'imperial']

function CompactPlayer({ state, seat, clockMs, clockMaxMs, clockRunning }: { state: GameState; seat: Seat; clockMs: number; clockMaxMs: number; clockRunning: boolean }) {
  const player = state.players[seat]
  const active = state.active === seat && state.winner === null
  const running = active && clockRunning
  return (
    <div className="player-strip" data-testid={`player-${seat}`}>
      <div className="portrait mini">
        <div className="face" style={{ backgroundImage: `url(${PORTRAIT[player.faction]})` }} />
      </div>
      <div className="pinfo">
        <div className="namerow">
          <span className="pname">{FACTIONS[player.faction].name}</span>
          {state.speaker === seat ? <img className="speaker" src={MISC.speaker} alt="Speaker" data-testid={`speaker-${seat}`} /> : null}
        </div>
        <div className="subrow">
          <span className="pnick">{player.name}</span>
          <span className="vp-chip">{player.vp} VP</span>
        </div>
      </div>
      <div className="clock mini">
        <span data-testid={`clock-${seat}`}>{formatClock(clockMs)}</span>
        <small>{running ? 'running' : 'paused'}</small>
      </div>
      <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / clockMaxMs) * 100)}%` }} /></div>
      <span className={`chip ${player.color}`} data-testid={`turn-${seat}`}>{active ? 'Your turn' : 'Waiting'}</span>
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
        return (
          <button
            key={card} type="button" disabled={!pickable}
            className={`sc${owner === null ? ' free' : ` own-${owner}`}${used ? ' played' : ''}${pickable ? ' pick' : ''}`}
            data-testid={`strategy-card-${card}`} title={`${CARD_NAME[card]}, ${label}`}
            aria-label={`${CARD_NAME[card]}, ${label}`}
            onMouseEnter={() => setHovered(card)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(card)}
            onBlur={() => setHovered(null)}
            onClick={pickable ? () => onPick(card) : undefined}
          >
            <span className="card">
              <img className="face" src={used ? MISC.strategyBack : strategyCardUrl(card)} alt={CARD_NAME[card]} />
              {bonus > 0 ? (
                <span className="tgfan" data-testid={`strategy-bonus-${card}`}>
                  {Array.from({ length: bonus }, (_, i) => <img key={i} src={MISC.tradeGood} alt="" width={14} height={14} />)}
                </span>
              ) : null}
              {owner !== null ? (
                <img className="held" src={tokenUrl(state.players[owner].faction, 'command')} alt="" width={16} />
              ) : null}
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
          return (
            <div className="obj" key={id} data-testid={`objective-${id}`} title={def.text}
              style={{ ['--bg' as string]: `url(${MISC.objectiveBack})` }}>
              <div className="tier">R{index + 1}</div>
              <div className="txt">{def.short}</div>
              {scoredBy(seat => state.players[seat].scoredObjectives.includes(id)).map(seat => (
                <img key={seat} className={`tok s${seat}`} src={tokenUrl(state.players[seat].faction, 'control')} alt="scored"
                  data-testid={`scored-${id}-${seat}`} />
              ))}
              <span className="full" aria-hidden="true">{def.text}</span>
            </div>
          )
        })}
        {MANDATES.map(def => (
          <div className="obj mandate" key={def.id} data-testid={`mandate-${def.id}`} title={def.text}
            style={{ ['--bg' as string]: `url(${MISC.mandateBack})` }}>
            <div className="tier">{def.id === 'first_strike' ? 'Race' : 'Sec'}</div>
            <div className="txt">{def.short}</div>
            {scoredBy(seat => state.players[seat].scoredMandates.includes(def.id)).map(seat => (
              <img key={seat} className={`tok s${seat}`} src={tokenUrl(state.players[seat].faction, 'control')} alt="scored"
                data-testid={`scored-${def.id}-${seat}`} />
            ))}
            <span className="full" aria-hidden="true">{def.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TopBar(
  { state, clockMs, clockMinutes, clockRunning, onPick }:
  { state: GameState; clockMs: number[]; clockMinutes: number; clockRunning: boolean; onPick?: (card: StrategyCardId) => void },
) {
  const clockMaxMs = clockMinutes * 60000
  if (state.players.length === 2) {
    return (
      <div className="topbar">
        <CompactPlayer state={state} seat={0} clockMs={clockMs[0] ?? 0} clockMaxMs={clockMaxMs} clockRunning={clockRunning} />
        <StrategyCards state={state} onPick={onPick} />
        <Objectives state={state} />
        <CompactPlayer state={state} seat={1} clockMs={clockMs[1] ?? 0} clockMaxMs={clockMaxMs} clockRunning={clockRunning} />
      </div>
    )
  }

  const n = state.players.length
  const half = Math.ceil(n / 2)
  const leftSeats = Array.from({ length: half }, (_, i) => i as Seat)
  const rightSeats = Array.from({ length: n - half }, (_, i) => (half + i) as Seat)

  return (
    <div className="topbar multi">
      <div className="players-group left">
        {leftSeats.map(seat => (
          <CompactPlayer
            key={seat}
            state={state}
            seat={seat}
            clockMs={clockMs[seat] ?? 0}
            clockMaxMs={clockMaxMs}
            clockRunning={clockRunning}
          />
        ))}
      </div>
      <StrategyCards state={state} onPick={onPick} />
      <Objectives state={state} />
      <div className="players-group right">
        {rightSeats.map(seat => (
          <CompactPlayer
            key={seat}
            state={state}
            seat={seat}
            clockMs={clockMs[seat] ?? 0}
            clockMaxMs={clockMaxMs}
            clockRunning={clockRunning}
          />
        ))}
      </div>
    </div>
  )
}
