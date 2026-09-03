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

const TICK_MS = 100
// R6: a player whose clock ran out gets three more minutes at the start of every later round
const ROUND_BONUS_MS = 180000

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

  // keyed on the game state alone: the clock ticks ten times a second and must not re-enumerate the moves
  const state = session?.state ?? null
  const legal = useMemo(() => state ? legalMoves(state) : [], [state])

  const start = useCallback((config: GameConfig, seed: number, minutes: number) => {
    const ms = minutes * 60000
    const code = newGameCode(hasGame)
    roundRef.current = 1
    setError(null)
    setSession({ code, seed, minutes, state: createGame(config, seed), history: [], clockMs: [ms, ms], handoff: null, config })
    // the URL names the game from the first move on, so the code and the address cannot drift apart
    navigate(gamePath(code))
  }, [])

  const resume = useCallback((next: Session) => {
    roundRef.current = next.state.round
    setError(null)
    setSession(next)
  }, [])

  const apply = useCallback((move: Move): boolean => {
    if (!session) return false
    // R3.2: an action ends the action, not the turn, so the player can still take a free move such as a
    // trade post sale. When nothing free is open, ending the turn is the only thing left and asking for a
    // click (in hot-seat: a device handoff) buys nothing, so the engine's own verdict decides it here.
    // A free move is the player's own detour, so it never ends the turn behind their back: after a trade
    // they press End turn themselves.
    const closeTurn = (from: GameState): GameState => {
      let it = from
      while (it.winner === null && onlyEndTurn(it)) {
        const ended = applyMove(it, { type: 'endTurn' }, deriveSeed(session.seed, moveCount(it)))
        if (!ended.ok) break
        it = ended.value
      }
      return it
    }
    // An AI seat plays its whole turn in one burst, the same pure `aiChoose` the engine tests use, applied
    // with the same seeded seeds as a human move so the game log and dice stay reproducible.
    const aiTurn = (from: GameState): GameState => {
      let it = from
      while (it.winner === null && it.phase !== 'ended' && isAi(session.config, it.active)) {
        const moves = legalMoves(it)
        if (moves.length === 0) break
        const chosen = aiChoose(it, moves, it.active, DEFAULT_WEIGHTS)
        const r = applyMove(it, chosen, deriveSeed(session.seed, moveCount(it)))
        if (!r.ok) break
        it = closeTurn(r.value)
      }
      return it
    }

    const result = applyMove(session.state, move, deriveSeed(session.seed, moveCount(session.state)))
    if (!result.ok) {
      setError(result.error)
      return false
    }
    let next = closeTurn(result.value)
    if (session.config) next = aiTurn(next)
    const keep = undoable(session.state, next)
    setError(null)
    // a handoff only makes sense when a human must hold the tablet next; the AI takes its turn here, so
    // a turn that lands on an AI seat shows no handoff
    const handoff = next.active !== session.state.active && next.winner === null && !isAi(session.config, next.active)
      ? next.active : null
    setSession({
      ...session,
      state: next,
      history: keep ? [...session.history, session.state] : [],
      handoff,
    })
    return true
  }, [session])

  const undo = useCallback(() => {
    if (!session || session.history.length === 0) return
    const previous = session.history[session.history.length - 1]
    setError(null)
    setSession({ ...session, state: previous, history: session.history.slice(0, -1), handoff: null })
  }, [session])

  const dismissHandoff = useCallback(() => {
    setSession(prev => prev ? { ...prev, handoff: null } : prev)
  }, [])

  // R7: abandoning drops this one game, never the other games the browser holds
  const abandon = useCallback(() => {
    if (session) deleteGame(session.code)
    roundRef.current = null
    setError(null)
    setSession(null)
  }, [session])

  // Keyed on the game itself, not on the session object: a clock tick makes a new session every 100ms and
  // must not serialise the whole state into localStorage ten times a second. The callback that runs is the
  // one from the render whose state or history changed, so the clock it writes is current.
  const history = session?.history ?? null
  useEffect(() => {
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
