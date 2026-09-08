import { useState } from 'react'
import { navigate } from '../route'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import { MusicButton } from '../music'
import { isAi } from '../../engine'
import { FACTIONS } from '../../data/factions'
import type { Seat } from '../../engine/types'

export type ActionMode = 'tactical' | 'strategic' | 'component' | 'actionCard' | null

export interface ActionBarProps {
  mode: ActionMode
  onMode: (mode: ActionMode) => void
  hint: string
  onLog: () => void
  viewingSeat?: Seat
  isMyTurn?: boolean
}

export function ActionBar({ mode, onMode, hint, onLog, viewingSeat, isMyTurn: isMyTurnProp }: ActionBarProps) {
  const { session, legal, apply, canUndo, undo, error } = useGame()
  const [menu, setMenu] = useState(false)
  useEscape(() => { setMenu(false) })
  if (!session) return null
  const state = session.state
  const humanSeatIndex = session.config?.players.findIndex(p => p.playerType === 'human') ?? -1
  const humanSeat = humanSeatIndex !== -1 ? (humanSeatIndex as Seat) : undefined
  const mySeat = viewingSeat ?? humanSeat ?? state.active
  const myPlayer = state.players[mySeat] ?? state.players[state.active]
  const isMyTurn = isMyTurnProp ?? (humanSeat !== undefined ? state.active === humanSeat : !isAi(session.config, state.active))
  const activePlayer = state.players[state.active]

  const can = {
    tactical: legal.some(m => m.type === 'startTactical'),
    strategic: legal.some(m => m.type === 'strategic'),
    component: legal.some(m => m.type === 'research' || m.type === 'shipyard' || m.type === 'productionBiomes'),
    // R9: the hand is always worth opening when it holds something, even when nothing in it is playable
    actionCard: myPlayer.actionCards.length > 0,
    pass: legal.some(m => m.type === 'pass'),
    // R3.2: only offered once the action is spent, so the bar shows plainly that the turn is the last thing left
    endTurn: legal.some(m => m.type === 'endTurn'),
  }
  return (
    <div className="bottombar">
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn quiet" data-testid="btn-undo" disabled={!canUndo} onClick={undo}>Undo</button>
        <button type="button" className="btn quiet" data-testid="btn-log" onClick={onLog}>Log</button>
        <div className="menuwrap">
          <button type="button" className="btn quiet" data-testid="btn-menu" aria-expanded={menu}
            onClick={() => { setMenu(!menu) }}>Menu</button>
          {menu ? (
            // the game stays saved under its own code, so leaving is always a way back, never a loss
            <div className="menu-pop" data-testid="game-menu">
              <div className="in">
                <span className="lbl dim">Game {session.code}</span>
                <button type="button" className="btn quiet" data-testid="btn-menu-lobby"
                  onClick={() => { navigate('#/') }}>Back to the lobby</button>
                <MusicButton className="btn quiet" />
                <button type="button" className="btn quiet" data-testid="btn-menu-close"
                  onClick={() => { setMenu(false) }}>Close</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="actions">
        {isMyTurn ? (
          <>
            <button type="button" className={`btn${mode === 'tactical' ? ' gold' : ''}`} data-testid="btn-tactical"
              disabled={!can.tactical} onClick={() => onMode(mode === 'tactical' ? null : 'tactical')}>Tactical action</button>
            <button type="button" className={`btn${mode === 'strategic' ? ' gold' : ''}`} data-testid="btn-strategic"
              disabled={!can.strategic} onClick={() => onMode(mode === 'strategic' ? null : 'strategic')}>Strategic action</button>
            <button type="button" className={`btn${mode === 'component' ? ' gold' : ''}`} data-testid="btn-component"
              disabled={!can.component} onClick={() => onMode(mode === 'component' ? null : 'component')}>Component action</button>
            <button type="button" className={`btn${mode === 'actionCard' ? ' gold' : ''}`} data-testid="btn-action-card"
              disabled={!can.actionCard} onClick={() => onMode(mode === 'actionCard' ? null : 'actionCard')}>
              Action cards ({myPlayer.actionCards.length})
            </button>
            <button type="button" className="btn" data-testid="btn-pass"
              disabled={!can.pass} onClick={() => apply({ type: 'pass' })}>Pass</button>
            {can.endTurn ? (
              <button type="button" className="btn gold" data-testid="btn-end-turn"
                onClick={() => apply({ type: 'endTurn' })}>End turn</button>
            ) : null}
          </>
        ) : (
          <div className="action-bar-waiting" data-testid="action-bar-waiting">
            <span className="action-bar-waiting-indicator" />
            <span className="action-bar-waiting-text">
              Waiting for {activePlayer.name} ({FACTIONS[activePlayer.faction]?.name ?? activePlayer.faction})...
            </span>
            <button
              type="button"
              className={`btn quiet${mode === 'actionCard' ? ' gold' : ''}`}
              data-testid="btn-action-card"
              disabled={!can.actionCard}
              onClick={() => onMode(mode === 'actionCard' ? null : 'actionCard')}
            >
              Action cards ({myPlayer.actionCards.length})
            </button>
          </div>
        )}
      </div>
      <div className="hintbox">
        {/* the engine's own rejection text; `apply` clears it again on the next move it accepts */}
        {error === null
          ? <div className="h" data-testid="hint">{hint}</div>
          : <div className="h err" role="alert" data-testid="engine-error">{error}</div>}
        <div className="r" data-testid="round">Round {state.round} of 8, {state.phase} phase</div>
      </div>
    </div>
  )
}
