import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyMove, createGame, deriveSeed, isAi, legalMoves, pendingFor, pendingReaction } from '../engine'
import type { GameConfig, GameState, LogEntry, Move, Seat } from '../engine/types'
import { aiStep } from '../ai'
import { moveCount, undoable } from './history'
import { deleteGame, hasGame, newGameCode, saveGame } from './persist'
import { gamePath, navigate } from './route'
import { logError, logInfo, logWarn } from './debugLogger'

export type { GameConfig } from '../engine/types'

/** The turn is spent and nothing free is left: only ending it remains, so the UI does not ask. */
function onlyEndTurn(state: GameState): boolean {
  const moves = legalMoves(state)
  return moves.length === 1 && moves[0].type === 'endTurn'
}

/** R3.2: an action ends the action, not the turn, so the player can still take a free move such as a trade
 * post sale. When nothing free is open, ending the turn is the only thing left and asking for a click (in
 * hot-seat: a device handoff) buys nothing, so the engine's own verdict decides it here. A free move is the
 * player's own detour, so it never ends the turn behind their back: after a trade they press End turn
 * themselves. Shared by the human path and the paced AI steps so both reproduce the same closes. */
function closeTurn(state: GameState, seed: number): GameState {
  let it = state
  while (it.winner === null && onlyEndTurn(it)) {
    const ended = applyMove(it, { type: 'endTurn' }, deriveSeed(seed, moveCount(it)))
    if (!ended.ok) break
    it = ended.value
  }
  return it
}

/** How many seats are played by a human in `config`. Someone is always holding the device, so switching to
 * another seat only needs a physical hand-off when both seats are human; with a single human the AI's turns
 * play themselves and the human is always already holding the tablet, so no "pass to X" screen is needed. */
function humanSeats(config: GameConfig | undefined): number {
  if (!config) return 2 // a legacy saved game with no config was always hot-seat, keep its handoffs
  return config.players.filter(p => p.playerType !== 'ai').length
}

/** The handoff (or its absence) for `next` shown after the active seat changed: a handoff only makes sense
 * when a human must hold the tablet next. A turn that lands on an AI seat shows no handoff, and with a single
 * human seat there is never anything to hand off. */
function handoffFor(config: GameConfig | undefined, prevState: GameState, next: GameState): Seat | null {
  if (humanSeats(config) < 2) return null
  return next.active !== prevState.active && next.winner === null && !isAi(config, next.active) ? next.active : null
}

/** R10: the log entries an agenda's resolution just added — reveal, outcome, any riders and effects — the
 * moment `castVote` closes it out. The dialog that showed the vote disappears in that same instant since
 * `state.agenda` is what keeps it open, so without this the player never sees what the vote actually
 * decided; held here until dismissed, it does. Note the close-out is not just `next.agenda` going null:
 * resolving the first agenda reveals the second in the same move, so the slot (or the card) changing is
 * the first agenda closing out — otherwise its result would never be shown at all. A fully unattended
 * (all-AI) game has nobody to dismiss it, so it never blocks there — same reasoning as `handoffFor`. */
function agendaResultFor(config: GameConfig | undefined, prevState: GameState, next: GameState): LogEntry[] | null {
  if (humanSeats(config) < 1 || prevState.agenda === null) return null
  const closedOut = next.agenda === null
    || next.agenda.slot !== prevState.agenda.slot
    || next.agenda.revealed !== prevState.agenda.revealed
  if (!closedOut) return null
  const added = next.log.slice(prevState.log.length)
  return added.length > 0 ? added : null
}

/** Which seat is expected to provide input/act next in this game state. */
export function seatToAct(state: GameState): Seat {
  const pending = pendingFor(state)
  if (pending) return pending.owner
  if (state.pendingSecondary !== null && state.pendingSecondary.queue.length > 0) {
    return state.pendingSecondary.queue[0]
  }
  if (state.phase === 'strategy' && state.draft.length > 0) {
    return state.draft[0]
  }
  return state.active
}

/** Whether the AI loop should automatically take a move in this state. */
export function shouldAiStep(config: GameConfig | undefined, state: GameState): boolean {
  if (state.winner !== null || state.phase === 'ended') return false

  // 1. Pending hits: only the owner of the fleet taking hits may assign them
  const pending = pendingFor(state)
  if (pending) {
    return isAi(config, pending.owner)
  }

  // 2. Pending secondary window: only the seat currently answering secondary acts
  if (state.pendingSecondary !== null) {
    const queueSeat = state.pendingSecondary.queue[0]
    return queueSeat !== undefined && isAi(config, queueSeat)
  }

  // 3. Pending reaction window: only the seat at the head of its queue may answer it. This must be checked
  // before the "any human combatant blocks auto-roll" rule below - an AI's own reaction (declining, or
  // playing a card like Morale Boost) has to resolve on its own even when the opponent across the table is
  // human, otherwise the window sits open forever waiting on a seat that was never asked (R9).
  const reaction = pendingReaction(state)
  if (reaction) {
    const queueSeat = reaction.queue[0]
    return queueSeat !== undefined && isAi(config, queueSeat)
  }

  // 4. Space combat round rolls: if ANY human is a combatant, do NOT auto-roll!
  // The human player clicks the roll button and chooses cards/tactics interactively.
  if (state.tactical?.step === 'spaceCombat' && state.tactical.combat) {
    const combat = state.tactical.combat
    const attackerHuman = !isAi(config, combat.attacker)
    const defenderHuman = combat.defender !== 'guardian' && !isAi(config, combat.defender)
    if (attackerHuman || defenderHuman) {
      return false
    }
  }

  // 5. Strategy phase draft: check the drafting seat
  if (state.phase === 'strategy') {
    const draftSeat = state.draft[0]
    return draftSeat !== undefined && isAi(config, draftSeat)
  }

  // 6. Default action phase: check the active seat
  return isAi(config, state.active)
}

const TICK_MS = 100
// R6: a player whose clock ran out gets three more minutes at the start of every later round
const ROUND_BONUS_MS = 180000
// An AI seat waits this long between its own moves so a human can watch the game unfold instead of a blur.
const AI_MOVE_DELAY_MS = 450

export interface Session {
  /** The six-character code this game is stored and addressed under; it never changes. */
  code: string
  seed: number
  minutes: number
  state: GameState
  history: GameState[]
  clockMs: number[]
  handoff: Seat | null
  /** Set the instant an agenda vote resolves it, cleared only by `dismissAgendaResult` — the outcome stays
   * on screen until a player acknowledges it, the same way a handoff holds the board until dismissed. */
  agendaResult: LogEntry[] | null
  /** Which seat is an AI. Absent (an old saved game) means both seats are human. */
  config?: GameConfig
  autoPassOnZero?: boolean
}

export interface GameStore {
  session: Session | null
  legal: Move[]
  error: string | null
  canUndo: boolean
  /** Whether the active seat's clock is ticking right now; the top bar labels the clocks from it. */
  clockRunning: boolean
  start(config: GameConfig, seed: number, minutes: number): void
  resume(session: Session): void
  apply(move: Move): boolean
  undo(): void
  dismissHandoff(): void
  dismissAgendaResult(): void
  abandon(): void
}

const GameContext = createContext<GameStore | null>(null)

export function useGame(): GameStore {
  const store = useContext(GameContext)
  if (!store) throw new Error('useGame must be used inside a GameProvider')
  return store
}

export function GameProvider({ children, ticking = true }: { children: ReactNode; ticking?: boolean }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const roundRef = useRef<number | null>(null)
  // the latest session, mirrored for the paced AI loop so a timeout always reads the current state, and a
  // handle on that loop's pending timeout so undo/abandon/start can cancel it
  const sessionRef = useRef<Session | null>(null)
  const aiTimerRef = useRef<number | null>(null)

  // keyed on the game state alone: the clock ticks ten times a second and must not re-enumerate the moves
  const state = session?.state ?? null
  const legal = useMemo(() => state ? legalMoves(state) : [], [state])

  // Pacing: instead of an AI seat playing its whole turn in one burst, each move lands on its own beat so a
  // human can watch. `pumpAi` schedules a step; `stepAi` applies exactly one move and — if the active seat is
  // still an AI, or the AI hands to another AI — schedules the one after. Both read `sessionRef` so a timeout
  // always acts on the current session, never a stale closure. `stepAiRef` and `pumpAiRef` break the circular
  // dependency between the two callbacks.
  const stepAiRef = useRef<(seed: number) => void>(() => undefined)
  const pumpAiRef = useRef<(seed: number) => void>(() => undefined)
  const stepAi = useCallback((seed: number) => {
    const cur = sessionRef.current
    if (!cur || !shouldAiStep(cur.config, cur.state)) return
    // An engine bug here must not kill the loop without a word (game MTMF8A: a ReferenceError only tsc
    // would have caught froze the Creuss AI mid-game). Log it with the context that reproduces it and
    // surface it; the loop stops either way, but now it says why.
    try {
      const actor = seatToAct(cur.state)
      const moves = legalMoves(cur.state)
      if (moves.length === 0) {
        // A seat the game waits on with zero legal moves is a deadlock (game 6C6RRJ: the Nekro seat sat at
        // the head of the agenda vote order with no legal outcome). Nothing throws, so without this log
        // the loop simply never runs again and the game looks like an AI that will not move.
        logError('AI', `no legal moves for seat ${actor} — the game is stuck`, {
          phase: cur.state.phase, step: cur.state.tactical?.step ?? null,
          faction: cur.state.players[actor]?.faction ?? null,
        })
        setError(`the game is stuck: ${cur.state.players[actor]?.name ?? `seat ${actor}`} has no legal moves`)
        return
      }
      const step = aiStep(cur.state, moves, actor, seed)
      for (const r of step?.rejected ?? []) {
        // an AI/engine drift is a bug worth seeing, but not worth freezing the game over: the next-best
        // move was tried instead
        logWarn('AI', `AI move rejected, trying the next-best: ${r.type}`, r)
      }
      if (!step) {
        logError('AI', `seat ${actor} had no engine-acceptable move after several attempts`, {
          phase: cur.state.phase, step: cur.state.tactical?.step ?? null,
          faction: cur.state.players[actor]?.faction ?? null,
        })
        setError(`the AI could not find a legal move the engine accepts`)
        return
      }
      logInfo('AI', `Seat ${actor} chose move: ${step.chosen.type}`, step.chosen)
      const next = closeTurn(step.state, seed)
      const keep = undoable(cur.state, next)
      setError(null)
      const handoff = handoffFor(cur.config, cur.state, next)
      const agendaResult = agendaResultFor(cur.config, cur.state, next)
      const updated: Session = { ...cur, state: next, history: keep ? [...cur.history, cur.state] : [], handoff, agendaResult }
      sessionRef.current = updated
      setSession(updated)
      if (agendaResult === null && shouldAiStep(cur.config, next)) pumpAiRef.current(seed)
    } catch (err) {
      logError('AI', `AI step crashed: ${err instanceof Error ? err.message : String(err)}`, {
        seat: cur.state.active, phase: cur.state.phase, step: cur.state.tactical?.step ?? null,
        faction: cur.state.players[cur.state.active]?.faction ?? null,
        stack: err instanceof Error ? err.stack : undefined,
      })
      setError(`the AI could not move: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])
  stepAiRef.current = stepAi

  const pumpAi = useCallback((seed: number) => {
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current)
    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null
      stepAiRef.current(seed)
    }, AI_MOVE_DELAY_MS)
  }, [])
  pumpAiRef.current = pumpAi

  const start = useCallback((config: GameConfig, seed: number, minutes: number) => {
    const ms = minutes * 60000
    const code = newGameCode(hasGame)
    roundRef.current = 1
    setError(null)
    logInfo('Game', `Started new game: code=${code}, seed=${seed}, players=${config.players.length}`, {
      players: config.players.map((p, seat) => ({ seat, faction: p.faction, playerType: p.playerType })),
    })
    if (aiTimerRef.current !== null) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null }
    const fresh: Session = { code, seed, minutes, state: createGame(config, seed), history: [], clockMs: config.players.map(() => ms), handoff: null, agendaResult: null, config, autoPassOnZero: false }
    sessionRef.current = fresh
    setSession(fresh)
    // the URL names the game from the first move on, so the code and the address cannot drift apart
    navigate(gamePath(code))
    // both-seats-AI (or a lone AI sitting on seat 0) has to get the game going with no human to nudge it
    if (shouldAiStep(config, fresh.state)) pumpAi(seed)
  }, [pumpAi])

  const resume = useCallback((next: Session) => {
    roundRef.current = next.state.round
    setError(null)
    logInfo('Game', `Resumed game: code=${next.code}, round=${next.state.round}, phase=${next.state.phase}, active=${next.state.active}`)
    sessionRef.current = next
    setSession(next)
    // a restored game may come back in the middle of an AI seat's turn: pick the loop back up
    if (shouldAiStep(next.config, next.state)) pumpAi(next.seed)
  }, [pumpAi])

  const apply = useCallback((move: Move): boolean => {
    if (!session) return false
    const seed = session.seed
    const config = session.config
    logInfo('Action', `Seat ${session.state.active} applying move: ${move.type}`, move)
    const result = applyMove(session.state, move, deriveSeed(seed, moveCount(session.state)))
    if (!result.ok) {
      logWarn('Action', `Move rejected for seat ${session.state.active}: ${result.error}`, { move, error: result.error })
      setError(result.error)
      return false
    }
    logInfo('Action', `Move applied successfully: ${move.type}`)
    const next = closeTurn(result.value, seed)
    const keep = undoable(session.state, next)
    setError(null)
    const handoff = handoffFor(config, session.state, next)
    const agendaResult = agendaResultFor(config, session.state, next)
    const updated: Session = {
      ...session,
      state: next,
      history: keep ? [...session.history, session.state] : [],
      handoff,
      agendaResult,
    }
    sessionRef.current = updated
    setSession(updated)
    // the AI is not burst: it plays each of its moves one at a time, a beat apart, so the game is watchable
    if (agendaResult === null && shouldAiStep(config, next)) pumpAi(seed)
    return true
  }, [session, pumpAi])

  const undo = useCallback(() => {
    if (!session || session.history.length === 0) return
    const previous = session.history[session.history.length - 1] as GameState
    if (aiTimerRef.current !== null) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null }
    setError(null)
    const reverted: Session = { ...session, state: previous, history: session.history.slice(0, -1), handoff: null, agendaResult: null }
    sessionRef.current = reverted
    setSession(reverted)
  }, [session])

  const dismissHandoff = useCallback(() => {
    setSession(prev => prev ? { ...prev, handoff: null } : prev)
  }, [])

  const dismissAgendaResult = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev
      const cleared: Session = { ...prev, agendaResult: null }
      sessionRef.current = cleared
      // the AI loop was held back while the result was on screen; pick it back up now that it is dismissed
      if (shouldAiStep(cleared.config, cleared.state)) pumpAi(cleared.seed)
      return cleared
    })
  }, [pumpAi])

  // R7: abandoning drops this one game, never the other games the browser holds
  const abandon = useCallback(() => {
    if (aiTimerRef.current !== null) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null }
    if (session) deleteGame(session.code)
    roundRef.current = null
    sessionRef.current = null
    setError(null)
    setSession(null)
  }, [session])

  // Keyed on the game itself, not on the session object: a clock tick makes a new session every 100ms and
  // must not serialise the whole state into localStorage ten times a second. The callback that runs is the
  // one from the render whose state or history changed, so the clock it writes is current.
  const history = session?.history ?? null
  useEffect(() => {
    sessionRef.current = session
    if (session) saveGame(session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, history])

  // R6: the clock runs for whichever seat has something to decide, in every phase. Picking a strategy card
  // or distributing status tokens is a turn like any other, so a player cannot hold the other one hostage
  // by sitting on a draft pick. `legal` is memoised on the state, so this costs no enumeration per tick.
  // An AI seat takes its turn inside `apply`, never against the clock, so a seat that is AI does not tick.
  const activeSeatIsAi = session !== null && isAi(session.config, session.state.active)
  const running = session !== null && session.minutes > 0 && !activeSeatIsAi && session.state.winner === null && session.handoff === null && session.agendaResult === null && legal.length > 0
  const seat = session ? session.state.active : 0
  useEffect(() => {
    if (!ticking || !running) return
    const id = setInterval(() => {
      setSession(prev => {
        if (!prev) return prev
        const clockMs = [...prev.clockMs]
        if (clockMs[seat] !== undefined) clockMs[seat] = Math.max(0, clockMs[seat] - TICK_MS)
        return { ...prev, clockMs }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [ticking, running, seat])

  // R6: at zero the player passes automatically; while passing is illegal (another phase, an unused strategy
  // card, an open secondary window, a running tactical action) the clock stays at zero until it becomes legal
  useEffect(() => {
    if (!session || !running || session.minutes <= 0 || !session.autoPassOnZero) return
    if ((session.clockMs[session.state.active] ?? 0) > 0) return
    if (legal.some(m => m.type === 'pass')) apply({ type: 'pass' })
  }, [session, running, legal, apply])

  // R6: three extra minutes for a flagged player at the start of every later round
  useEffect(() => {
    if (!session || session.minutes <= 0) return
    if (roundRef.current === session.state.round) return
    roundRef.current = session.state.round
    setSession(prev => prev ? {
      ...prev,
      clockMs: prev.clockMs.map(c => c || ROUND_BONUS_MS),
    } : prev)
  }, [session])

  const store: GameStore = useMemo(() => ({
    session, legal, error, canUndo: session !== null && session.history.length > 0, clockRunning: running,
    start, resume, apply, undo, dismissHandoff, dismissAgendaResult, abandon,
  }), [session, legal, error, running, start, resume, apply, undo, dismissHandoff, dismissAgendaResult, abandon])

  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}
