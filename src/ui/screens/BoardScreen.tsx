import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { BoardMap } from '../board/BoardMap'
import { SystemInfo } from '../board/SystemInfo'
import { ActionBar } from '../hud/ActionBar'
import type { ActionMode } from '../hud/ActionBar'
import { SidePanel } from '../hud/SidePanel'
import { TopBar } from '../hud/TopBar'
import { productionLimit, shipsThatCanReach } from '../../engine'
import { useGame } from '../store'
import { useViewportScale } from '../useViewportScale'
import { FLOWER_MAP_SIZE, GALAXY_MAP_SIZE } from '../layout'
import { isAi } from '../../engine/types'
import type { Seat, StrategyCardId } from '../../engine/types'
import { diagnoseMovement, logInfo, logWarn } from '../debugLogger'
// tactical flows (Task 4a)
import { CombatDialog } from '../flows/CombatDialog'
import { InvasionPanel } from '../flows/InvasionPanel'
import { MovementPanel } from '../flows/MovementPanel'
import { ProduceDrawer } from '../flows/ProduceDrawer'
// strategic, component and status flows (Task 4b)
import { ActionCardPanel } from '../flows/ActionCardPanel'
import { ComponentPanel } from '../flows/ComponentPanel'
import { SecondaryPanel } from '../flows/SecondaryPanel'
import { StatusDialog } from '../flows/StatusDialog'
import { StrategicDialog } from '../flows/StrategicDialog'
import { CARD_NAME } from '../format'
import { strategicCards } from '../moveOptions'
import { systemLabel } from '../format'
import { HandoffOverlay } from '../HandoffOverlay'
import { LogPanel } from '../LogPanel'
import { SpaceBackdrop } from '../SpaceBackdrop'

const HINTS: Record<string, string> = {
  tactical: 'Tactical action. Choose a system to activate.',
  strategic: 'Strategic action. Choose one of your ready strategy cards.',
  component: 'Component action. Choose one of the offered actions.',
  strategy: 'Strategy phase. Choose a strategy card.',
  status: 'Status phase. Distribute your new command tokens.',
  idle: 'Choose an action.',
  spent: 'Your action is spent. Trade at a post or end your turn.',
}

export function BoardScreen() {
  const { session, legal, apply, clockRunning } = useGame()
  // the single side panel follows the active player by default; the seat tabs override it during the turn
  const [sideSeat, setSideSeat] = useState<Seat | null>(null)
  const [mode, setMode] = useState<ActionMode>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  // `?panel=log` is a dev-only manual/visual QA hook (see App.tsx's demo bootstrap) so a headless
  // screenshot can land on the open log panel without a click.
  const [showLog, setShowLog] = useState(() => import.meta.env.DEV
    && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('panel') === 'log')
  const [card, setCard] = useState<StrategyCardId | null>(null)
  const isGalaxy = (session?.state.players.length ?? 2) > 2
  const mapSize = isGalaxy ? GALAXY_MAP_SIZE : FLOWER_MAP_SIZE
  // the side panel tracks whoever has the turn: when the active seat changes (turn passes, draft, status)
  // it snaps back to following that player, so a manual seat pick only lasts for the current turn
  const lastActive = useRef<number | null>(session?.state.active ?? null)
  const activeSeat = session?.state.active ?? 0
  useEffect(() => {
    if (session && lastActive.current !== session.state.active) {
      lastActive.current = session.state.active
      setSideSeat(null)
    }
  }, [session, activeSeat])
  // the docked regions scale their contents with --k, the board inside the stage with --s (see theme.css)
  const { k, s } = useViewportScale(mapSize.width, mapSize.height)
  if (!session) return null
  const state = session.state
  const panelSeat = (sideSeat ?? state.active) as Seat
  const drafting = state.phase === 'strategy'
  const onPick = drafting ? (card: StrategyCardId) => { apply({ type: 'pickStrategyCard', card }) } : undefined
  const selectable = mode === 'tactical'
    ? legal.flatMap(m => m.type === 'startTactical' ? [m.systemId] : [])
    : []
  // R3.2: activating a system your ships cannot enter is legal but usually a mistake, so the board says so
  // before the click rather than the movement panel saying it afterwards
  const outOfReach = selectable.filter(id => shipsThatCanReach(state, state.active, id).length === 0)
  // R3.2: with the action spent the bar has only two things left to say, whichever panel happens to be open
  const hint = drafting ? HINTS.strategy
    : state.phase === 'status' ? HINTS.status
      : state.turnDone ? (isGalaxy ? 'Your action is spent. End your turn.' : HINTS.spent)
        : HINTS[mode ?? 'idle']
  // R4.4: production needs a space dock of your own in the activated system, so `productionLimit` is 0
  // everywhere else. Without one there is nothing to decide at the end of the action, and the drawer would
  // only ask the player to confirm an empty production, so the turn simply ends.
  const producing = state.tactical !== null
    && (state.tactical.step === 'production' || state.tactical.step === 'done')
    && productionLimit(state, state.active, state.tactical.systemId) > 0
  // the same step without a dock: nothing to produce, so a slim bar closes the action instead of the drawer
  const idleTactical = state.tactical !== null
    && (state.tactical.step === 'production' || state.tactical.step === 'done')
    && !producing
  const isAiTurn = isAi(session.config, state.active)
  return (
    <>
      <div
        className="app" data-testid="board-screen" inert={session.handoff !== null}
        style={{ '--k': k, '--s': s } as CSSProperties}
      >
        <SpaceBackdrop dim />
        <TopBar state={state} clockMs={session.clockMs} clockMinutes={session.minutes} clockRunning={clockRunning} onPick={onPick} />
        <SidePanel state={state} seat={panelSeat} onSelectSeat={setSideSeat} />
        {/* the board and everything that overlays it, docked between the bars and the two columns */}
        <div className="stage" data-testid="stage">
          <BoardMap
            state={state}
            activeSystemId={state.tactical?.systemId ?? null}
            selectable={selectable}
            outOfReach={outOfReach}
            onSelect={systemId => {
              const diag = diagnoseMovement(state, state.active, systemId)
              logInfo('Tactical', `Tile clicked: ${systemId} in mode=${mode ?? 'idle'} (seat ${state.active})`, {
                outOfReach: outOfReach.includes(systemId),
                diagnostics: diag,
              })
              if (outOfReach.includes(systemId)) {
                logWarn('Tactical', `System ${systemId} has 0 reachable ships for seat ${state.active}`, diag)
              }
              if (apply({ type: 'startTactical', systemId })) setMode(null)
            }}
            onInspect={setInspecting}
          />
          {inspecting ? <SystemInfo state={state} systemId={inspecting} onClose={() => setInspecting(null)} /> : null}
          {/* tactical flows (Task 4a) */}
          {!isAiTurn ? (
            <>
              {state.tactical?.step === 'movement' ? <MovementPanel /> : null}
              {state.tactical?.step === 'spaceCombat' ? <CombatDialog /> : null}
              {state.tactical?.step === 'invasion' ? <InvasionPanel /> : null}
              {producing ? <ProduceDrawer /> : null}
              {idleTactical ? (
                <div className="drawer bottom" data-testid="end-tactical-bar">
                  <div className="in">
                    <div className="dhead">
                      <span className="tab">{systemLabel(state.tactical?.systemId ?? '')}</span>
                      <span className="sub">No space dock here, so there is nothing to produce.</span>
                      <div className="right">
                        <button
                          type="button" className="btn gold" data-testid="btn-end-tactical"
                          disabled={!legal.some(m => m.type === 'endTactical')}
                          onClick={() => apply({ type: 'endTactical' })}
                        >
                          End tactical action
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {/* strategic, component and status flows (Task 4b) */}
          <div className="flows-4b">
            {!isAiTurn && mode === 'strategic' && card === null ? (
              <div className="dialog" data-testid="strategic-picker">
                <div className="in">
                  <div className="dhead"><span className="tab">Strategic action</span></div>
                  <div className="rowline">
                    {strategicCards(legal).map(id => (
                      <button key={id} type="button" className="btn" data-testid={`strategic-pick-${id}`} onClick={() => setCard(id)}>{CARD_NAME[id]}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {!isAiTurn && mode === 'strategic' && card !== null ? <StrategicDialog card={card} onClose={() => { setCard(null); setMode(null) }} /> : null}
            {!isAiTurn && mode === 'component' ? <ComponentPanel onClose={() => setMode(null)} /> : null}
            {!isAiTurn && mode === 'actionCard' ? <ActionCardPanel onClose={() => setMode(null)} /> : null}
            {!isAiTurn && state.pendingSecondary !== null ? <SecondaryPanel /> : null}
            {!isAiTurn && state.phase === 'status' ? <StatusDialog /> : null}
          </div>
          {showLog ? <LogPanel state={state} onClose={() => setShowLog(false)} /> : null}
        </div>
        <ActionBar mode={mode} onMode={setMode} hint={hint} onLog={() => setShowLog(!showLog)} />
      </div>
      <HandoffOverlay />
    </>
  )
}
