import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyMove, createGame, deriveSeed, isAi, legalMoves } from '../engine'
import type { GameConfig, GameState, Move, Seat } from '../engine/types'
import { aiChoose } from '../ai'
import { DEFAULT_WEIGHTS } from '../ai/score'
import { moveCount, undoable } from './history'
import { deleteGame, hasGame, newGameCode, saveGame } from './persist'
import { gamePath, navigate } from './route'

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

/** The handoff (or its absence) for `next` shown after the active seat changed: a handoff only makes sense
 * when a human must hold the tablet next, so a turn that lands on an AI seat shows no handoff. */
function handoffFor(config: GameConfig | undefined, prevState: GameState, next: GameState): Seat | null {
  return next.active !== prevState.active && next.winner === null && !isAi(config, next.active) ? next.active : null
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
  clockMs: [number, number]
  handoff: Seat | null
  /** Which seat is an AI. Absent (an old saved game) means both seats are human. */
  config?: GameConfig
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
  // always acts on the current session, never a stale closure. `stepAiRef` breaks the circular dependency
  // between the two callbacks so `stepAi` (which re-pumps) does not need `pumpAi` declared up-front.
  const stepAiRef = useRef<(seed: number) => void>(() => undefined)
  const stepAi = useCallback((seed: number) => {
    const cur = sessionRef.current
    if (!cur || cur.state.winner !== null || cur.state.phase === 'ended') return
    if (!isAi(cur.config, cur.state.active)) return
    const moves = legalMoves(cur.state)
    if (moves.length === 0) return
    const chosen = aiChoose(cur.state, moves, cur.state.active, DEFAULT_WEIGHTS)
    const r = applyMove(cur.state, chosen, deriveSeed(seed, moveCount(cur.state)))
    if (!r.ok) { setError(r.error); return }
    const next = closeTurn(r.value, seed)
    const keep = undoable(cur.state, next)
    setError(null)
    const handoff = handoffFor(cur.config, cur.state, next)
    const updated: Session = { ...cur, state: next, history: keep ? [...cur.history, cur.state] : [], handoff }
    sessionRef.current = updated
    setSession(updated)
    if (next.winner === null && isAi(cur.config, next.active)) pumpAi(seed)
  }, [])
  stepAiRef.current = stepAi

  const pumpAi = useCallback((seed: number) => {
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current)
    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null
      stepAiRef.current(seed)
    }, AI_MOVE_DELAY_MS)
  }, [])

  const start = useCallback((config: GameConfig, seed: number, minutes: number) => {
    const ms = minutes * 60000
    const code = newGameCode(hasGame)
    roundRef.current = 1
    setError(null)
    if (aiTimerRef.current !== null) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null }
    const fresh: Session = { code, seed, minutes, state: createGame(config, seed), history: [], clockMs: [ms, ms], handoff: null, config }
    sessionRef.current = fresh
    setSession(fresh)
    // the URL names the game from the first move on, so the code and the address cannot drift apart
    navigate(gamePath(code))
    // both-seats-AI (or a lone AI sitting on seat 0) has to get the game going with no human to nudge it
    if (fresh.state.winner === null && isAi(config, fresh.state.active)) pumpAi(seed)
  }, [pumpAi])

  const resume = useCallback((next: Session) => {
    roundRef.current = next.state.round
    setError(null)
    sessionRef.current = next
    setSession(next)
    // a restored game may come back in the middle of an AI seat's turn: pick the loop back up
    if (next.state.winner === null && isAi(next.config, next.state.active)) pumpAi(next.seed)
  }, [pumpAi])

  const apply = useCallback((move: Move): boolean => {
    if (!session) return false
    const seed = session.seed
    const config = session.config
    const result = applyMove(session.state, move, deriveSeed(seed, moveCount(session.state)))
    if (!result.ok) {
      setError(result.error)
      return false
    }
    const next = closeTurn(result.value, seed)
    const keep = undoable(session.state, next)
    setError(null)
    const handoff = handoffFor(config, session.state, next)
    setSession({
      ...session,
      state: next,
      history: keep ? [...session.history, session.state] : [],
      handoff,
    })
    // the AI is not burst: it plays each of its moves one at a time, a beat apart, so the game is watchable
    if (next.winner === null && isAi(config, next.active)) pumpAi(seed)
    return true
  }, [session, pumpAi])

  const undo = useCallback(() => {
    if (!session || session.history.length === 0) return
    const previous = session.history[session.history.length - 1] as GameState
    if (aiTimerRef.current !== null) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null }
    setError(null)
    const reverted: Session = { ...session, state: previous, history: session.history.slice(0, -1), handoff: null }
    sessionRef.current = reverted
    setSession(reverted)
  }, [session])

  const dismissHandoff = useCallback(() => {
    setSession(prev => prev ? { ...prev, handoff: null } : prev)
  }, [])

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
  const running = session !== null && !activeSeatIsAi && session.state.winner === null && session.handoff === null && legal.length > 0
  const seat = session ? session.state.active : 0
  useEffect(() => {
    if (!ticking || !running) return
    const id = setInterval(() => {
      setSession(prev => {
        if (!prev) return prev
        const clockMs: [number, number] = [prev.clockMs[0], prev.clockMs[1]]
        clockMs[seat] = Math.max(0, clockMs[seat] - TICK_MS)
        return { ...prev, clockMs }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [ticking, running, seat])

  // R6: at zero the player passes automatically; while passing is illegal (another phase, an unused strategy
  // card, an open secondary window, a running tactical action) the clock stays at zero until it becomes legal
  useEffect(() => {
    if (!session || !running) return
    if (session.clockMs[session.state.active] > 0) return
    if (legal.some(m => m.type === 'pass')) apply({ type: 'pass' })
  }, [session, running, legal, apply])

  // R6: three extra minutes for a flagged player at the start of every later round
  useEffect(() => {
    if (!session) return
    if (roundRef.current === session.state.round) return
    roundRef.current = session.state.round
    setSession(prev => prev ? {
      ...prev,
      clockMs: [prev.clockMs[0] || ROUND_BONUS_MS, prev.clockMs[1] || ROUND_BONUS_MS],
    } : prev)
  }, [session])

  const store: GameStore = useMemo(() => ({
    session, legal, error, canUndo: session !== null && session.history.length > 0, clockRunning: running,
    start, resume, apply, undo, dismissHandoff, abandon,
  }), [session, legal, error, running, start, resume, apply, undo, dismissHandoff, abandon])

  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}
