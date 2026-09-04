import { FACTIONS } from '../../data/factions'
import { MANDATES, objectiveDef } from '../../data/objectives'
import { cardOwner } from '../../engine'
import { MISC, PORTRAIT, SIGIL, strategyCardUrl, tokenUrl } from '../art'
import { CARD_NAME, formatClock } from '../format'
import type { GameState, Seat, StrategyCardId } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'trade', 'warfare', 'technology', 'imperial']

function PlayerBlock({ state, seat, clockMs, clockMaxMs, clockRunning }: { state: GameState; seat: Seat; clockMs: number; clockMaxMs: number; clockRunning: boolean }) {
  const player = state.players[seat]
  const active = state.active === seat && state.winner === null
  const running = active && clockRunning
  return (
    <div className={`pblock${seat === 1 ? ' right' : ''}`} data-testid={`player-${seat}`}>
      <div className="portrait">
        <div className="face" style={{ backgroundImage: `url(${PORTRAIT[player.faction]})` }} />
        <div className="sym"><img src={SIGIL[player.faction]} alt="" /></div>
      </div>
      <div className="pinfo">
        <div className="namerow">
          <span className="pname goldtext">{FACTIONS[player.faction].name}</span>
          {state.speaker === seat ? <img className="speaker" src={MISC.speaker} alt="Speaker" data-testid={`speaker-${seat}`} /> : null}
        </div>
        <div className="pnick">{player.name}</div>
        <div className="clock">
          <span data-testid={`clock-${seat}`}>{formatClock(clockMs)}</span>
          <small>{running ? 'running' : 'paused'}</small>
        </div>
        <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / clockMaxMs) * 100)}%` }} /></div>
        <div>
          <span className={`chip ${seat === 0 ? 'blue' : 'red'}`} data-testid={`turn-${seat}`}>{active ? 'Your turn' : 'Waiting'}</span>
        </div>
      </div>
    </div>
  )
}

function StrategyStrip({ state, onPick }: { state: GameState; onPick?: (card: StrategyCardId) => void }) {
  return (
    <div className="strats">
      {/* R3.1: the draft is the one moment nothing on the board tells the player what to do, so the strip
          says it and the cards that can still be taken pulse until the last one is gone */}
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
            onClick={pickable ? () => onPick(card) : undefined}
          >
            {/* a played card is turned face down, exactly as it is on the table */}
            <span className="card">
              <img className="face" src={used ? MISC.strategyBack : strategyCardUrl(card)} alt={CARD_NAME[card]} />
              {/* the trade goods ride on the card itself, as the tokens they are */}
              {bonus > 0 ? (
                <span className="tgfan" data-testid={`strategy-bonus-${card}`}>
                  {Array.from({ length: bonus }, (_, i) => <img key={i} src={MISC.tradeGood} alt="" width={16} height={16} />)}
                </span>
              ) : null}
              {owner !== null ? (
                <img className="held" src={tokenUrl(state.players[owner].faction, 'command')} alt="" width={20} />
              ) : null}
            </span>
            <span className="vis" data-testid={`strategy-state-${card}`}>{label}</span>
            <span className="big" aria-hidden="true"><img src={strategyCardUrl(card)} alt="" /></span>
          </button>
        )
      })}
    </div>
  )
}

function CompactPlayerBlock({ state, seat, clockMs, clockMaxMs, clockRunning }: { state: GameState; seat: Seat; clockMs: number; clockMaxMs: number; clockRunning: boolean }) {
  const player = state.players[seat]
  const active = state.active === seat && state.winner === null
  const running = active && clockRunning
  return (
    <div className="pblock compact" data-testid={`player-${seat}`}>
      <div className="portrait mini">
        <div className="face" style={{ backgroundImage: `url(${PORTRAIT[player.faction]})` }} />
        <div className="sym"><img src={SIGIL[player.faction]} alt="" /></div>
      </div>
      <div className="pinfo">
        <div className="namerow">
          <span className="pname goldtext">{FACTIONS[player.faction].name}</span>
          {state.speaker === seat ? <img className="speaker" src={MISC.speaker} alt="Speaker" data-testid={`speaker-${seat}`} /> : null}
        </div>
        <div className="subrow">
          <span className="pnick">{player.name}</span>
          <span className="vp-chip">{player.vp} VP</span>
        </div>
        <div className="clock mini">
          <span data-testid={`clock-${seat}`}>{formatClock(clockMs)}</span>
          <small>{running ? 'running' : 'paused'}</small>
        </div>
        <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / clockMaxMs) * 100)}%` }} /></div>
        <div>
          <span className={`chip ${player.color}`} data-testid={`turn-${seat}`}>{active ? 'Your turn' : 'Waiting'}</span>
        </div>
      </div>
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
              <div className="tier">Round {index + 1}</div>
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
            <div className="tier">{def.id === 'first_strike' ? 'Race' : 'Secret'}</div>
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
        <PlayerBlock state={state} seat={0} clockMs={clockMs[0] ?? 0} clockMaxMs={clockMaxMs} clockRunning={clockRunning} />
        <StrategyStrip state={state} onPick={onPick} />
        <Objectives state={state} />
        <PlayerBlock state={state} seat={1} clockMs={clockMs[1] ?? 0} clockMaxMs={clockMaxMs} clockRunning={clockRunning} />
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
          <CompactPlayerBlock
            key={seat}
            state={state}
            seat={seat}
            clockMs={clockMs[seat] ?? 0}
            clockMaxMs={clockMaxMs}
            clockRunning={clockRunning}
          />
        ))}
      </div>
      <StrategyStrip state={state} onPick={onPick} />
      <Objectives state={state} />
      <div className="players-group right">
        {rightSeats.map(seat => (
          <CompactPlayerBlock
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
