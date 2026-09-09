import { useState, useEffect, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { BoardMap } from '../board/BoardMap'
import { SystemInfo } from '../board/SystemInfo'
import { ActionBar } from '../hud/ActionBar'
import type { ActionMode } from '../hud/ActionBar'
import { SidePanel } from '../hud/SidePanel'
import { TopBar } from '../hud/TopBar'
import { FloatingRightDeck } from '../hud/FloatingRightDeck'
import { pendingReaction, productionLimit, shipsThatCanReach } from '../../engine'
import { useGame } from '../store'
import { useViewportScale } from '../useViewportScale'
import { FLOWER_MAP_SIZE, GALAXY_MAP_SIZE } from '../layout'
import { isAi } from '../../engine/types'
import type { GameConfig, GameState, Seat, StrategyCardId } from '../../engine/types'
import { agendaDef } from '../../data/agendas'
import { FACTIONS } from '../../data/factions'
import { COLOUR_INK, SIGIL, tokenUrl } from '../art'
import { diagnoseMovement, logInfo, logWarn } from '../debugLogger'
// tactical flows (Task 4a)
import { CombatDialog } from '../flows/CombatDialog'
import { InvasionPanel } from '../flows/InvasionPanel'
import { MovementPanel } from '../flows/MovementPanel'
import { ProduceDrawer } from '../flows/ProduceDrawer'
// strategic, component and status flows (Task 4b)
import { ActionCardPanel } from '../flows/ActionCardPanel'
import { AgendaDialog } from '../flows/AgendaDialog'
import { ComponentPanel } from '../flows/ComponentPanel'
import { ReactionPanel } from '../flows/ReactionPanel'
import { SecondaryPanel } from '../flows/SecondaryPanel'
import { StatusDialog } from '../flows/StatusDialog'
import { StrategicDialog } from '../flows/StrategicDialog'
import { CARD_NAME } from '../format'
import { strategicCards } from '../moveOptions'
import { systemLabel } from '../format'
import { AgendaResultOverlay } from '../AgendaResultOverlay'
import { HandoffOverlay } from '../HandoffOverlay'
import { LogPanel } from '../LogPanel'
import { SpaceBackdrop } from '../SpaceBackdrop'

const HINTS: Record<string, string> = {
  tactical: 'Tactical action. Choose a system to activate.',
  strategic: 'Strategic action. Choose one of your ready strategy cards.',
  component: 'Component action. Choose one of the offered actions.',
  strategy: 'Strategy phase. Choose a strategy card.',
  status: 'Status phase. Distribute your new command tokens.',
  agenda: 'Agenda phase. Cast your vote.',
  idle: 'Choose an action.',
  spent: 'Your action is spent. Trade at a post or end your turn.',
}

function ActiveTurnBanner({ state, config }: { state: GameState; config?: GameConfig }) {
  const activePlayer = state.players[state.active]
  if (!activePlayer || state.winner !== null) return null
  const isAiPlayer = isAi(config, state.active)
  const faction = FACTIONS[activePlayer.faction]
  const ink = COLOUR_INK[activePlayer.color]

  let actionText = 'Taking turn'
  if (state.phase === 'strategy') {
    actionText = 'Strategy Phase: Drafting Strategy Card'
  } else if (state.phase === 'agenda' && state.agenda) {
    actionText = `🗳️ Voting on ${agendaDef(state.agenda.revealed).name}`
  } else if (state.pendingSecondary !== null) {
    const secSeat = state.pendingSecondary.queue[0]
    const secPlayer = secSeat !== undefined ? state.players[secSeat] : null
    actionText = secPlayer
      ? `${secPlayer.name} deciding ${CARD_NAME[state.pendingSecondary.card]} secondary`
      : 'Resolving secondary'
  } else if (state.tactical) {
    const sysName = systemLabel(state.tactical.systemId, state)
    switch (state.tactical.step) {
      case 'movement':
        actionText = `Tactical: Moving fleet to ${sysName}`
        break
      case 'spaceCombat':
        actionText = `⚔️ Space Combat in ${sysName} (Round ${state.tactical.combat?.round ?? 1})`
        break
      case 'invasion':
        actionText = `🪖 Planetary Invasion in ${sysName}`
        break
      case 'production':
        actionText = `🛠️ Production at Space Dock in ${sysName}`
        break
      case 'done':
        actionText = `Completing tactical action in ${sysName}`
        break
    }
  } else if (state.turnDone) {
    actionText = 'Action complete — ready to end turn'
  } else if (isAiPlayer) {
    actionText = 'AI is deliberating action...'
  } else {
    actionText = 'Select an action (Tactical, Strategic, or Component)'
  }

  return (
    <div
      className="turn-action-hud"
      data-testid="turn-action-hud"
      style={{
        '--turn-accent': ink.accent,
        '--turn-glow': ink.glow,
        '--turn-tint': ink.tint,
      } as CSSProperties}
    >
      <div className="turn-hud-sigil">
        <img
          src={SIGIL[activePlayer.faction] || tokenUrl(activePlayer.faction, 'control')}
          alt={faction.name}
          onError={e => { (e.currentTarget as HTMLImageElement).src = tokenUrl(activePlayer.faction, 'control') }}
        />
      </div>
      <div className="turn-hud-content">
        <div className="turn-hud-player">
          <span className="turn-hud-name" style={{ color: ink.accent }}>
            {activePlayer.name}
          </span>
          <span className="turn-hud-faction">
            ({faction.name})
          </span>
          <span className={`turn-hud-type-badge ${isAiPlayer ? 'ai' : 'human'}`}>
            {isAiPlayer ? 'AI' : 'YOU'}
          </span>
        </div>
        <div className="turn-hud-action">
          {actionText}
        </div>
      </div>
    </div>
  )
}

export function BoardScreen() {
  const { session, legal, apply, clockRunning } = useGame()
  // the single side panel follows the active player by default; the seat tabs override it during the turn
  const [sideSeat, setSideSeat] = useState<Seat | null>(null)
  const [hoveredSystemId, setHoveredSystemId] = useState<string | null>(null)
  const [mode, setMode] = useState<ActionMode>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [highlightedSystemId, setHighlightedSystemId] = useState<string | null>(null)
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

  const [dismissedWinIndex, setDismissedWinIndex] = useState<number>(-1)
  const combatOutcome = useMemo<{ winIndex: number; systemId: string; winner: Seat | 'guardian'; notes: string[] } | null>(() => {
    if (!session?.state) return null
    const s = session.state
    let winIndex = -1
    for (let i = s.log.length - 1; i >= 0; i--) {
      const e = s.log[i]
      if (e.t === 'info' && e.text.includes('space combat in ') && e.text.includes(' won by ')) {
        winIndex = i
        break
      }
    }
    if (winIndex <= dismissedWinIndex || winIndex < 0) return null
    const entry = s.log[winIndex]
    if (entry.t !== 'info') return null
    const match = /space combat in (.*) won by seat (\d+)/.exec(entry.text)
    if (!match) return null
    const sysId = match[1]
    const winnerSeat = parseInt(match[2], 10) as Seat
    const casualties = s.log
      .slice(Math.max(0, winIndex - 6), winIndex + 1)
      .filter((e): e is Extract<typeof e, { t: 'info' }> => e.t === 'info' && (e.text.includes('loses:') || e.text.includes('fighter') || e.text.includes('assigns')))
      .map(e => {
        let text = e.text
        for (const p of s.players) text = text.replaceAll(`seat ${p.seat}`, p.name)
        for (const sys of Object.values(s.systems)) text = text.replaceAll(`in ${sys.id}`, `in ${systemLabel(sys.id, s)}`)
        return text
      })
    return {
      winIndex,
      systemId: sysId,
      winner: winnerSeat,
      notes: casualties,
    }
  }, [session?.state, dismissedWinIndex])
  // the docked regions scale their contents with --k, the board inside the stage with --s (see theme.css)
  const { k, s } = useViewportScale(mapSize.width, mapSize.height)
  const [userRightDeckTab, setUserRightDeckTab] = useState<'objectives' | 'strategy' | 'faction' | null>(null)
  const [userIsRightDeckOpen, setUserIsRightDeckOpen] = useState<boolean | null>(null)
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true)
  const [prevPhase, setPrevPhase] = useState(session?.state.phase)
  if (session && session.state.phase !== prevPhase) {
    setPrevPhase(session.state.phase)
    if (session.state.phase === 'strategy') {
      setUserRightDeckTab('strategy')
      setUserIsRightDeckOpen(true)
    }
  }
  const isStrategyPhase = session?.state.phase === 'strategy'
  const rightDeckTab = userRightDeckTab ?? (isStrategyPhase ? 'strategy' : 'objectives')
  const isRightDeckOpen = userIsRightDeckOpen ?? true

  if (!session) return null
  const state = session.state
  const humanSeatIndex = session.config?.players.findIndex(p => p.playerType === 'human') ?? -1
  const humanSeat: Seat | undefined = humanSeatIndex !== -1 ? (humanSeatIndex as Seat) : undefined
  const viewingSeat: Seat = humanSeat !== undefined ? humanSeat : (state.active as Seat)
  // Hovering a tile previews whichever faction owns a planet there in the side panel, without disturbing
  // whatever seat the player had pinned there by clicking a tab - it reverts the moment the mouse leaves.
  const hoveredSystem = hoveredSystemId ? state.systems[hoveredSystemId] : undefined
  const hoveredOwner = hoveredSystem?.planets.find(p => p.owner !== null)?.owner ?? null
  const panelSeat = (hoveredOwner ?? sideSeat ?? state.active) as Seat
  const drafting = state.phase === 'strategy'
  const onPick = drafting ? (card: StrategyCardId) => { apply({ type: 'pickStrategyCard', card }) } : undefined

  const selectable = mode === 'tactical'
    ? legal.flatMap(m => m.type === 'startTactical' ? [m.systemId] : [])
    : []
  // R3.2: activating a system your ships cannot enter and where you have no space dock to produce is
  // legal but usually a mistake, so the board says so before the click
  const outOfReach = selectable.filter(id => {
    const canReach = shipsThatCanReach(state, state.active, id).length > 0
    const canProduce = productionLimit(state, state.active, id) > 0
    return !canReach && !canProduce
  })
  const isAiTurn = isAi(session.config, state.active)
  const isMyTurn = humanSeat !== undefined ? state.active === humanSeat : !isAiTurn
  const activePlayer = state.players[state.active]
  // R3.2: with the action spent the bar has only two things left to say, whichever panel happens to be open
  const hint = !isMyTurn && state.phase === 'action'
    ? `${activePlayer.name} (${FACTIONS[activePlayer.faction]?.name ?? activePlayer.faction}) is taking their turn...`
    : drafting ? HINTS.strategy
      : state.phase === 'status' ? HINTS.status
        : state.phase === 'agenda' ? HINTS.agenda
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
  const hasActiveModal = Boolean(
    (state.tactical && state.tactical.step !== 'done') ||
    combatOutcome ||
    session.agendaResult !== null ||
    state.phase === 'status' ||
    state.phase === 'agenda' ||
    pendingReaction(state) !== null ||
    mode === 'strategic' ||
    mode === 'component' ||
    mode === 'actionCard' ||
    state.pendingSecondary !== null ||
    inspecting !== null ||
    showLog
  )

  return (
    <>
      <div
        className="app" data-testid="board-screen" inert={session.handoff !== null || session.agendaResult !== null}
        style={{ '--k': k, '--s': s } as CSSProperties}
      >
        <SpaceBackdrop dim />
        <TopBar
          state={state}
          clockMs={session.clockMs}
          clockMinutes={session.minutes}
          clockRunning={clockRunning}
          selectedSeat={panelSeat}
          onSelectSeat={setSideSeat}
          activeDeckTab={rightDeckTab}
          isDeckOpen={isRightDeckOpen}
          onToggleDeck={(tab) => {
            if (tab) {
              if (rightDeckTab === tab && isRightDeckOpen) {
                setUserIsRightDeckOpen(false)
              } else {
                setUserRightDeckTab(tab)
                setUserIsRightDeckOpen(true)
              }
            } else {
              setUserIsRightDeckOpen(prev => !(prev ?? true))
            }
          }}
          config={session.config}
        />
        <SidePanel
          state={state}
          seat={panelSeat}
          onSelectSeat={setSideSeat}
          isOpen={isSidePanelOpen}
          onToggleCollapse={() => setIsSidePanelOpen(false)}
          viewingSeat={viewingSeat}
        />
        {!isSidePanelOpen && (
          <button
            type="button"
            className="side-panel-open-tab"
            data-testid="btn-open-side-panel"
            onClick={() => setIsSidePanelOpen(true)}
            title="Expand player panel"
            aria-label="Expand player panel"
          >
            <span>▶ Players</span>
          </button>
        )}
        <FloatingRightDeck
          state={state}
          activeTab={rightDeckTab}
          onTabChange={(tab) => {
            setUserRightDeckTab(tab)
            setUserIsRightDeckOpen(true)
          }}
          isOpen={isRightDeckOpen}
          onToggleOpen={() => setUserIsRightDeckOpen(prev => !(prev ?? true))}
          onPick={onPick}
          humanSeat={humanSeat}
        />
        {/* the board and everything that overlays it, docked between the bars and the two columns */}
        <div className={`stage${hasActiveModal ? ' has-modal' : ''}${!isSidePanelOpen ? ' side-collapsed' : ''}`} data-testid="stage">
          <ActiveTurnBanner state={state} config={session.config} />
          <BoardMap
            state={state}
            activeSystemId={state.tactical?.systemId ?? null}
            selectable={selectable}
            outOfReach={outOfReach}
            humanSeat={humanSeat}
            highlightedSystemId={highlightedSystemId}
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
            onHover={setHoveredSystemId}
          />
          {inspecting ? <SystemInfo state={state} systemId={inspecting} onClose={() => setInspecting(null)} /> : null}
          {!isAiTurn ? (
            <>
              {state.tactical?.step === 'movement' ? <MovementPanel /> : null}
              {state.tactical?.step === 'invasion' ? <InvasionPanel /> : null}
              {producing ? <ProduceDrawer /> : null}
              {idleTactical ? (
                <div className="drawer bottom" data-testid="end-tactical-bar">
                  <div className="in">
                    <div className="dhead">
                      <span className="tab">{systemLabel(state.tactical?.systemId ?? '', state)}</span>
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
            {mode === 'actionCard' ? (
              <ActionCardPanel
                viewingSeat={viewingSeat}
                onClose={() => { setMode(null); setHighlightedSystemId(null) }}
                onHighlight={setHighlightedSystemId}
              />
            ) : null}
            {!isAiTurn && state.pendingSecondary !== null ? <SecondaryPanel /> : null}
            {!isAiTurn && state.phase === 'status' ? <StatusDialog /> : null}
            {!isAiTurn && state.phase === 'agenda' ? <AgendaDialog /> : null}
          </div>
          {showLog ? <LogPanel state={state} onClose={() => setShowLog(false)} /> : null}
        </div>
        <ActionBar
          mode={mode}
          onMode={setMode}
          hint={hint}
          onLog={() => setShowLog(!showLog)}
          viewingSeat={viewingSeat}
          isMyTurn={isMyTurn}
        />
      </div>
      {/* Tactical space combat modal (rendered at screen root above side decks) */}
      {state.tactical?.step === 'spaceCombat' ? <CombatDialog /> : null}
      {combatOutcome && state.tactical?.step !== 'spaceCombat' ? (
        <div className="combat-modal-overlay" style={{ zIndex: 950 }}>
          <div className="dialog combat-outcome-modal" data-testid="combat-outcome-banner" style={{ maxWidth: 460, margin: 'auto' }}>
            <div className="in">
              <div className="dhead">
                <span className="tab" style={{ color: 'var(--gold)' }}>Space Combat Decided</span>
                <div className="right">
                  <button type="button" className="btn gold" data-testid="btn-dismiss-combat-outcome" onClick={() => setDismissedWinIndex(combatOutcome.winIndex)}>
                    Continue
                  </button>
                </div>
              </div>
              <div className="rowline" style={{ fontWeight: 600, fontSize: '13px' }}>
                {combatOutcome.winner === 'guardian' ? 'The guardian fleet' : state.players[combatOutcome.winner].name} victorious in {systemLabel(combatOutcome.systemId, state)}!
              </div>
              {combatOutcome.notes.length > 0 ? (
                <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(0,0,0,0.35)', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>Casualties</div>
                  {combatOutcome.notes.map((note, idx) => (
                    <div key={idx} style={{ color: '#e2e8f0' }}>• {note}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <ReactionPanel />
      <HandoffOverlay />
      <AgendaResultOverlay />
    </>
  )
}
