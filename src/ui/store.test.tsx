// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import * as engine from '../engine'
import { applyMove, createGame, deriveSeed } from '../engine'
import { cardsUsed, toActionPhase, toStatusPhase } from '../engine/testUtils'
import { GameProvider, useGame } from './store'
import type { GameConfig, Session } from './store'
import type { StrategyCardId } from '../engine/types'

const CONFIG: GameConfig = {
  players: [
    { faction: 'l1z1x', color: 'blue', name: 'North' },
    { faction: 'letnev', color: 'red', name: 'South' },
  ],
  speaker: 0,
}

const AI_V_AI: GameConfig = {
  players: [
    { faction: 'l1z1x', color: 'blue', name: 'North', playerType: 'ai' },
    { faction: 'letnev', color: 'red', name: 'South', playerType: 'ai' },
  ],
  speaker: 0,
}

const HUMAN_V_AI: GameConfig = {
  players: [
    { faction: 'l1z1x', color: 'blue', name: 'North', playerType: 'human' },
    { faction: 'letnev', color: 'red', name: 'South', playerType: 'ai' },
  ],
  speaker: 0,
}

function wrapper(ticking: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <GameProvider ticking={ticking}>{children}</GameProvider>
  }
}

function session(state: Session['state'], clockMs: [number, number]): Session {
  return { code: 'TESTAA', seed: 7, minutes: 15, state, history: [], clockMs, handoff: null }
}

describe('the hot-seat store', () => {
  it('starts a game and enumerates the legal picks', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    expect(result.current.session?.state.phase).toBe('strategy')
    expect(result.current.legal).toHaveLength(8)
    expect(result.current.legal.every(m => m.type === 'pickStrategyCard')).toBe(true)
    expect(result.current.session?.clockMs).toEqual([900000, 900000])
  })

  it('applies moves with a seed derived from the game seed and the move index', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    act(() => { result.current.apply({ type: 'pickStrategyCard', card: 'leadership' }) })
    const expected = applyMove(createGame(CONFIG, 7), { type: 'pickStrategyCard', card: 'leadership' }, deriveSeed(7, 0))
    expect(expected.ok).toBe(true)
    if (!expected.ok) return
    expect(result.current.session?.state).toEqual(expected.value)
  })

  it('reports the engine error and keeps the state on an illegal move', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    const before = result.current.session?.state
    act(() => { result.current.apply({ type: 'pass' }) })
    expect(result.current.session?.state).toBe(before)
    expect(result.current.error).toContain('not in the action phase')
  })

  it('undoes a move inside the same turn and clears the stack when the turn passes', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    for (const card of ['leadership', 'trade', 'technology', 'warfare'] as StrategyCardId[]) {
      act(() => { result.current.apply({ type: 'pickStrategyCard', card }) })
      // the snake draft has seat 1 pick twice in a row (trade, right after leadership); same seat, still
      // the strategy phase, so that pick alone is still undoable
      if (card === 'trade') expect(result.current.canUndo).toBe(true)
    }
    expect(result.current.session?.state.phase).toBe('action')
    expect(result.current.session?.state.active).toBe(0)      // leadership is initiative 1
    expect(result.current.canUndo).toBe(false)                // warfare closed the strategy phase: undo never crosses a phase boundary
    act(() => { result.current.apply({ type: 'startTactical', systemId: 'bereg' }) })
    expect(result.current.session?.state.players[0].tokens.tactic).toBe(2)
    expect(result.current.canUndo).toBe(true)
    act(() => { result.current.undo() })
    expect(result.current.session?.state.players[0].tokens.tactic).toBe(3)
    expect(result.current.session?.state.tactical).toBeNull()
    expect(result.current.canUndo).toBe(false)
  })

  it('flags the handoff when the seat to act changes', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    act(() => { result.current.apply({ type: 'pickStrategyCard', card: 'leadership' }) })
    expect(result.current.session?.handoff).toBe(1)
    act(() => { result.current.dismissHandoff() })
    expect(result.current.session?.handoff).toBeNull()
  })

  it('never shows a handoff when only one seat is a human: there is nothing to pass', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(HUMAN_V_AI, 7, 15) })
    // the human seat 0 acts; the AI seat 1 answers on its own beat. No "pass to / I am" screen either way.
    act(() => { result.current.apply({ type: 'pickStrategyCard', card: 'leadership' }) })
    expect(result.current.session?.handoff).toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.handoff).toBeNull()
    expect(result.current.session?.state.active).not.toBe(1)
    vi.useRealTimers()
  })

  it('R6: the clock runs for the active seat and passes automatically at zero', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    act(() => { result.current.resume(session(cardsUsed(toActionPhase()), [1000, 60000])) })
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.session?.clockMs[0]).toBe(500)
    expect(result.current.session?.clockMs[1]).toBe(60000)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.session?.clockMs[0]).toBe(0)
    expect(result.current.session?.state.players[0].passed).toBe(true)
    expect(result.current.session?.state.active).toBe(1)
    vi.useRealTimers()
  })

  it('R6: the clock runs in the strategy phase as well, so nobody can stall the draft', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    expect(result.current.session?.state.phase).toBe('strategy')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.clockMs[0]).toBe(899000)
    expect(result.current.session?.clockMs[1]).toBe(900000)
    vi.useRealTimers()
  })

  it('R6: the clock runs in the status phase for the seat that has to submit', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    act(() => { result.current.resume(session(toStatusPhase(toActionPhase()), [60000, 60000])) })
    expect(result.current.session?.state.phase).toBe('status')
    const seat = result.current.session?.state.active ?? 0
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.clockMs[seat]).toBe(59000)
    expect(result.current.session?.clockMs[seat === 0 ? 1 : 0]).toBe(60000)
    vi.useRealTimers()
  })

  it('R6: the clock stops while the handoff overlay is up and once the game is over', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    act(() => { result.current.apply({ type: 'pickStrategyCard', card: 'leadership' }) })
    expect(result.current.session?.handoff).toBe(1)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.clockMs[1]).toBe(900000)
    act(() => { result.current.dismissHandoff() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.clockMs[1]).toBe(899000)
    vi.useRealTimers()
  })

  it('R6: a clock at zero holds while passing is illegal', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    // two unused strategy cards, so `pass` is not among the legal moves
    act(() => { result.current.resume(session(toActionPhase(), [0, 60000])) })
    expect(result.current.legal.some(m => m.type === 'pass')).toBe(false)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.session?.clockMs[0]).toBe(0)
    expect(result.current.session?.state.players[0].passed).toBe(false)
    expect(result.current.session?.state.active).toBe(0)
    vi.useRealTimers()
  })

  it('R6: a player at zero gets three more minutes at the start of the next round', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.resume(session(toStatusPhase(toActionPhase()), [0, 60000])) })
    expect(result.current.session?.state.round).toBe(1)
    for (let seat = 0; seat < 2; seat += 1) {
      const move = result.current.legal.find(m => m.type === 'status')
      expect(move).toBeTruthy()
      if (move) act(() => { result.current.apply(move) })
    }
    expect(result.current.session?.state.round).toBe(2)
    expect(result.current.session?.clockMs[0]).toBe(180000)   // the flagged player is topped up
    expect(result.current.session?.clockMs[1]).toBe(60000)    // the other clock is untouched
  })

  it('R6: a clock tick neither re-enumerates the moves nor rewrites the saved game', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(true) })
    act(() => { result.current.resume(session(cardsUsed(toActionPhase()), [60000, 60000])) })
    const enumerate = vi.spyOn(engine, 'legalMoves')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.clockMs[0]).toBe(59000)      // the clock still runs
    expect(enumerate).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    // a real move still enumerates and still saves
    act(() => { result.current.apply({ type: 'pass' }) })
    expect(enumerate).toHaveBeenCalled()
    expect(write).toHaveBeenCalled()
    enumerate.mockRestore()
    write.mockRestore()
    vi.useRealTimers()
  })

  it('AI vs AI: the paced loop runs every seat with no handoff until someone wins', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(AI_V_AI, 7, 15) })
    expect(result.current.session?.state.phase).toBe('strategy')
    // both seats are AI, so `start` already kicks off the paced loop; let it play until the duel ends
    let guard = 0
    while ((result.current.session?.state.winner ?? null) === null
      && (result.current.session?.state.phase !== 'ended') && guard < 3000) {
      act(() => { vi.advanceTimersByTime(500) })
      guard++
    }
    const end = result.current.session?.state
    expect(end?.winner !== null || end?.phase === 'ended').toBe(true)
    expect(result.current.session?.handoff).toBeNull()
    vi.useRealTimers()
  })

  it('human vs AI: the game hands off to the human seat and never to the AI seat', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(HUMAN_V_AI, 7, 15) })
    // North is the human seat 0 and opens the draft, so the first legal move is the human's
    act(() => { result.current.apply({ type: 'pickStrategyCard', card: 'leadership' }) })
    // the AI seat 1 plays paced, a beat after the human's move; it is not handed the device
    expect(result.current.session?.handoff).toBeNull()
    // let the AI's response land, then the device is back on the human seat 0
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.session?.state.active).not.toBe(1)
    expect(result.current.session?.handoff ?? result.current.session?.state.active).toBe(0)
    vi.useRealTimers()
  })
})
