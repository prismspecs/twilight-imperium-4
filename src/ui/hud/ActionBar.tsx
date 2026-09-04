import { useState } from 'react'
import { navigate } from '../route'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import { MusicButton } from '../music'

export type ActionMode = 'tactical' | 'strategic' | 'component' | null

export interface ActionBarProps {
  mode: ActionMode
  onMode: (mode: ActionMode) => void
  hint: string
  onLog: () => void
}

export function ActionBar({ mode, onMode, hint, onLog }: ActionBarProps) {
  const { session, legal, apply, canUndo, undo, error } = useGame()
  const [menu, setMenu] = useState(false)
  useEscape(() => { setMenu(false) })
  if (!session) return null
  const state = session.state
  const can = {
    tactical: legal.some(m => m.type === 'startTactical'),
    strategic: legal.some(m => m.type === 'strategic'),
    component: legal.some(m => m.type === 'research' || m.type === 'shipyard' || m.type === 'tradePost'),
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
        <button type="button" className={`btn${mode === 'tactical' ? ' gold' : ''}`} data-testid="btn-tactical"
          disabled={!can.tactical} onClick={() => onMode(mode === 'tactical' ? null : 'tactical')}>Tactical action</button>
        <button type="button" className={`btn${mode === 'strategic' ? ' gold' : ''}`} data-testid="btn-strategic"
          disabled={!can.strategic} onClick={() => onMode(mode === 'strategic' ? null : 'strategic')}>Strategic action</button>
        <button type="button" className={`btn${mode === 'component' ? ' gold' : ''}`} data-testid="btn-component"
          disabled={!can.component} onClick={() => onMode(mode === 'component' ? null : 'component')}>Component action</button>
        <button type="button" className="btn" data-testid="btn-pass"
          disabled={!can.pass} onClick={() => apply({ type: 'pass' })}>Pass</button>
        {can.endTurn ? (
          <button type="button" className="btn gold" data-testid="btn-end-turn"
            onClick={() => apply({ type: 'endTurn' })}>End turn</button>
        ) : null}
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
