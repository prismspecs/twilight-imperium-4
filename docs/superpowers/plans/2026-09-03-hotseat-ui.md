# Hot-Seat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a playable hot-seat client on top of the finished rules engine. Two people share one browser: they name themselves on a setup screen, then play a whole game of Mecatol Online on a board that reproduces the approved mockups, with every control derived from `legalMoves`, a chess clock, undo inside your own turn, a pass-the-device interstitial, a readable game log and a game that survives a page reload. Prove it with component tests and one scripted end-to-end game driven entirely through the rendered UI.

**Architecture:** Everything new lives under `src/ui/`. The engine stays exactly as it is: the UI imports `applyMove`, `createGame`, `legalMoves` and a set of read-only query helpers, and it never decides legality itself. One store (`src/ui/store.tsx`, a React context plus the `useGame` hook) owns the whole client state: the `GameState`, the game seed, an undo stack of previous states, the two clocks and the handoff flag. Every move goes through `apply(move)`, which calls `applyMove(state, move, deriveSeed(gameSeed, moveIndex))`, so a game is fully replayable from `(seed, move list)` and every test is deterministic. Screens are chosen by a twelve-line hash router (`#/` setup, `#/play` board, plus the game-over screen which is picked from `state.winner`). Presentational components (`src/ui/board/*`, `src/ui/hud/*`) take a `GameState` and props and render; interactive components (`src/ui/flows/*`) read the store, offer parameters for one move kind and submit it. A single stylesheet `src/ui/theme.css` carries the mockups' tokens (gold, navy, cut corners, Cinzel / Barlow Condensed / Barlow); there are no CSS-in-JS and no UI libraries.

**Tech Stack:** React 19 and Vite exactly as scaffolded, TypeScript strict, Vitest with `@testing-library/react` and `jsdom` (added in task 1), no runtime dependencies beyond `react` and `react-dom`.

**Spec:** `docs/spec/game-rules.md` (rules v0.2, referenced as R1..R8), `docs/spec/engine-design.md` (the engine contract), `docs/spec/lobby-architecture.md` section 2.8 (client state machine, hot-seat specifics, undo policy). The visual target is `/Users/despot_b/Assistant/notes/game-mockups/mecatol-duel-v2.html` (board, plus its `?panel=produce` and `?panel=tech` states), `/Users/despot_b/Assistant/notes/game-mockups/mecatol-duel-lobby.html` (setup screen) and the brief `/Users/despot_b/Assistant/notes/game-mockups/mockup-v2-brief.md`. Assets are already in `public/assets/`.

**Task order:** task 1 builds the shell (tooling, store, router, setup screen) because every later task tests through it. Task 2 is the board, task 3 the HUD around it, so that tasks 4a and 4b have something to attach controls to. Task 4 is split: 4a covers the tactical action (activation, movement, combat, invasion, production), 4b the strategic action, the secondary window, component actions, the status phase and the game-over screen. Task 5 adds the hot-seat courtesies (handoff, log, persistence). Task 6 plays one scripted game through the finished UI.

## Global Constraints

- React 19 and Vite exactly as scaffolded (`npm run dev`, `npm run build`); no router library, no state library, no component library, no CSS framework.
- `tsconfig.app.json` is strict with `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` and `verbatimModuleSyntax`: no `any`, no non-null assertions, no enums, no parameter properties, and every type-only import written as `import type`.
- **No engine changes except one additive block**: task 1 step 3 appends a re-export list to `src/engine/index.ts` (read-only query helpers, no new logic, no behaviour change). `src/engine/*.ts` and `src/data/*.ts` are otherwise not edited by this plan. UI code never imports an engine module in order to reimplement a rule.
- **The engine is the only source of legality.** Every enabled control comes from `legalMoves(state)`: a button exists because a move of that kind is in the list, a system is clickable because a `startTactical` for it is in the list, a technology is researchable because a move naming it is in the list. The UI fills in parameters (`moveShips`, `produce`, the `params` of `strategic`/`secondary`/`status`, the infantry subset of `land`, the payment of `shipyard`) and lets `applyMove` judge them; a rejection is shown as a message, never worked around.
- **Parameter editors start from the enumerated move.** Where `legalMoves` already carries usable parameters (`land`, `strategic`, `secondary`, `shipyard`, `status`), the panel pre-fills its controls from that move and submits the edited copy, so "accept the default" always produces a legal move.
- All randomness comes from the store: `deriveSeed(session.seed, moveIndex)` where `moveIndex` is the number of `move` entries already in `state.log`. Components never call `Math.random()` or `Date.now()`.
- Component tests run with Vitest under jsdom; every UI test file starts with the docblock `// @vitest-environment jsdom` (the project default environment stays `node` so the engine suite is unaffected).
- Tests query by `data-testid` and by visible text, never by class name. Testid convention: `tile-<systemId>`, `stack-<systemId>-<owner>-<unitType>`, `ground-<planetId>-<owner>-<type>`, `structure-<planetId>-<owner>-<type>`, `control-<planetId>`, `player-<seat>`, `clock-<seat>`, `vp-<seat>`, `tokens-<seat>-<pool>`, `forces-<seat>-<type>`, `strategy-card-<card>`, `btn-<action>`.
- Deterministic tests only: every test either builds its fixture with `src/engine/testUtils.ts` or starts a game with a fixed seed (`#/?seed=7`). No test asserts a dice result it did not derive from a fixed seed.
- All UI copy is English, sentence case except the gold uppercase labels. No em dashes and no middle dots in copy or comments.
- Never mutate a `GameState`. The store replaces it; components read it.
- **Commit after every logical step: the failing test, the implementation and each fix are separate commits.** Conventional messages (`test:` for a failing test, `feat:`/`fix:`/`chore:` for the rest). Never squash a test and its implementation into one commit.

---

### Task 1: Tooling, game store, hash router and the setup screen

**Files:**
- Modify: `package.json` (dev dependencies, no script changes)
- Modify: `vite.config.ts` (Vitest configuration)
- Modify: `src/engine/index.ts` (additive re-export block, the only engine edit in this plan)
- Modify: `src/main.tsx`, `src/index.css`
- Delete: `src/App.tsx`, `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`
- Create: `src/ui/test/setup.ts`, `src/ui/route.ts`, `src/ui/history.ts`, `src/ui/store.tsx`, `src/ui/App.tsx`, `src/ui/screens/SetupScreen.tsx`, `src/ui/screens/BoardScreen.tsx`, `src/ui/screens/GameOverScreen.tsx`
- Test: `src/ui/history.test.ts`, `src/ui/store.test.tsx`, `src/ui/screens/SetupScreen.test.tsx`

**Interfaces:**
- `src/ui/history.ts`
  ```ts
  export function moveCount(state: GameState): number
  export function rollCount(state: GameState): number
  export function undoable(previous: GameState, next: GameState): boolean
  ```
  `undoable` is the undo rule of `lobby-architecture.md` section 2.8 in one function: a move may be taken back while the same seat is still to act and no dice were rolled by it.
- `src/ui/store.tsx`
  ```ts
  export interface Session {
    seed: number
    minutes: number
    state: GameState
    history: GameState[]
    clockMs: [number, number]
    handoff: Seat | null
  }
  export interface GameStore {
    session: Session | null
    legal: Move[]
    error: string | null
    canUndo: boolean
    start(config: GameConfig, seed: number, minutes: number): void
    resume(session: Session): void
    apply(move: Move): boolean
    undo(): void
    dismissHandoff(): void
    abandon(): void
  }
  export function GameProvider(props: { children: ReactNode; ticking?: boolean }): JSX.Element
  export function useGame(): GameStore
  ```
  `ticking` exists so component tests can switch the clock interval off; only `src/main.tsx` leaves it on.
- `src/ui/route.ts`
  ```ts
  export function useHashRoute(): string
  export function navigate(hash: string): void
  export function seedFromRoute(route: string, fallback: number): number
  ```

- [ ] **Step 1: Add the test dependencies**

Run:

```bash
npm install --save-dev @testing-library/react jsdom
```

Expected: `package.json` gains the two entries in `devDependencies` (caret ranges, at the time of writing `"@testing-library/react": "^16.3.0"` and `"jsdom": "^27.0.0"`; whatever npm resolves is fine as long as the suite runs). No `dependencies` change.

```bash
git add package.json package-lock.json
git commit -m "chore(ui): add testing-library and jsdom for component tests"
```

- [ ] **Step 2: Configure Vitest for component tests**

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // the engine suite runs in node; UI test files opt into jsdom with a `@vitest-environment` docblock
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/ui/test/setup.ts'],
  },
})
```

```ts
// src/ui/test/setup.ts
import { afterEach } from 'vitest'

// Runs for every test file. Under node (the engine suite) there is nothing to clean up, so the
// testing-library import stays inside the jsdom branch and never loads react-dom in a DOM-less run.
afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  window.localStorage.clear()
  window.location.hash = ''
})
```

Run: `npm test`
Expected: PASS, the whole engine suite unchanged.

```bash
git add vite.config.ts src/ui/test/setup.ts
git commit -m "chore(ui): vitest setup for jsdom component tests"
```

- [ ] **Step 3: Re-export the engine's read-only queries**

Append to `src/engine/index.ts`, below the existing exports:

```ts
// Read-only queries the UI derives its controls from. Re-exports only: no new logic, no behaviour change.
export { activatableSystems, canPass, otherSeat } from './actionPhase'
export { canMunitions, retreatTargets } from './combat'
export { canInheritance, canShipyard, inheritanceTechs, shipyardPlanets, tradePostOptions } from './componentActions'
export { capacity, cheapestPlanets, fleetPoolLimit, productionCost, productionLimit, readyResources } from './economy'
export { bombardablePlanets, groundCombatPending, landablePlanets } from './invasion'
export { movableShips } from './movement'
export { controlledPlanets, controlsMecatol, scoreable } from './objectives'
export { PRODUCIBLE } from './production'
export { researchable } from './research'
export { deriveSeed } from './rng'
export { unitsOf } from './setup'
export { tokensGained } from './statusPhase'
export { cardOwner, diplomacySystems, secondaryTokenCost, unusedCards, warfareTokenSystems } from './strategicActions'
export { INITIATIVE } from './strategyPhase'
```

Then add one line to the module table in `docs/spec/engine-design.md`, under the `src/engine/index.ts` row:

```md
| `src/engine/index.ts` | `applyMove` dispatcher, re-exports, and the read-only query helpers the UI builds its controls from |
```

Run: `npx tsc -p tsconfig.app.json --noEmit && npm test`
Expected: PASS, nothing behavioural changed.

```bash
git add src/engine/index.ts docs/spec/engine-design.md
git commit -m "feat(engine): re-export the read-only queries the UI needs"
```

- [ ] **Step 4: Write the failing tests for the history rule and the store**

```ts
// src/ui/history.test.ts
import { describe, expect, it } from 'vitest'
import { toActionPhase } from '../engine/testUtils'
import { moveCount, rollCount, undoable } from './history'
import type { GameState } from '../engine/types'

const base = toActionPhase()

function withRoll(state: GameState): GameState {
  return { ...state, log: [...state.log, { t: 'roll', owner: 0, rolls: [], context: 'space combat round 1' }] }
}

describe('undo inside your own turn', () => {
  it('counts the move and roll entries in the log', () => {
    expect(moveCount(base)).toBe(4)          // the four picks of the strategy phase
    expect(rollCount(base)).toBe(0)
    expect(rollCount(withRoll(base))).toBe(1)
  })
  it('lobby-architecture 2.8: a move is undoable while the same seat acts and nothing was rolled', () => {
    expect(undoable(base, base)).toBe(true)
    expect(undoable(base, { ...base, active: 1 })).toBe(false)
    expect(undoable(base, withRoll(base))).toBe(false)
  })
})
```

```tsx
// src/ui/store.test.tsx
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { applyMove, createGame, deriveSeed } from '../engine'
import { cardsUsed, toActionPhase } from '../engine/testUtils'
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

function wrapper(ticking: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <GameProvider ticking={ticking}>{children}</GameProvider>
  }
}

function session(state: Session['state'], clockMs: [number, number]): Session {
  return { seed: 7, minutes: 15, state, history: [], clockMs, handoff: null }
}

describe('the hot-seat store', () => {
  it('starts a game and enumerates the legal picks', () => {
    const { result } = renderHook(() => useGame(), { wrapper: wrapper(false) })
    act(() => { result.current.start(CONFIG, 7, 15) })
    expect(result.current.session?.state.phase).toBe('strategy')
    expect(result.current.legal).toHaveLength(6)
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
    }
    expect(result.current.session?.state.phase).toBe('action')
    expect(result.current.session?.state.active).toBe(0)      // leadership is initiative 1
    expect(result.current.canUndo).toBe(false)                // the draft changed seats every pick
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
})
```

- [ ] **Step 5: Run the tests to verify they fail, then commit them**

Run: `npm test -- src/ui`
Expected: FAIL, `src/ui/history.ts` and `src/ui/store.tsx` do not exist.

```bash
git add src/ui/history.test.ts src/ui/store.test.tsx
git commit -m "test(ui): undo rule, seeded move application and the chess clock"
```

- [ ] **Step 6: Implement the history helpers and the store**

```ts
// src/ui/history.ts
import type { GameState } from '../engine/types'

export function moveCount(state: GameState): number {
  return state.log.reduce((n, e) => e.t === 'move' ? n + 1 : n, 0)
}

export function rollCount(state: GameState): number {
  return state.log.reduce((n, e) => e.t === 'roll' ? n + 1 : n, 0)
}

/**
 * lobby-architecture.md 2.8: hot-seat may take a move back by truncating the local log, but dice are final
 * and a turn that has already passed to the other seat is closed.
 */
export function undoable(previous: GameState, next: GameState): boolean {
  return next.active === previous.active && rollCount(next) === rollCount(previous)
}
```

```tsx
// src/ui/store.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyMove, createGame, deriveSeed, legalMoves } from '../engine'
import type { GameConfig, GameState, Move, Seat } from '../engine/types'
import { moveCount, undoable } from './history'

export type { GameConfig } from '../engine/types'

const TICK_MS = 100
// R6: a player whose clock ran out gets three more minutes at the start of every later round
const ROUND_BONUS_MS = 180000

export interface Session {
  seed: number
  minutes: number
  state: GameState
  history: GameState[]
  clockMs: [number, number]
  handoff: Seat | null
}

export interface GameStore {
  session: Session | null
  legal: Move[]
  error: string | null
  canUndo: boolean
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

  const legal = useMemo(() => session ? legalMoves(session.state) : [], [session])

  const start = useCallback((config: GameConfig, seed: number, minutes: number) => {
    const ms = minutes * 60000
    roundRef.current = 1
    setError(null)
    setSession({ seed, minutes, state: createGame(config, seed), history: [], clockMs: [ms, ms], handoff: null })
  }, [])

  const resume = useCallback((next: Session) => {
    roundRef.current = next.state.round
    setError(null)
    setSession(next)
  }, [])

  const apply = useCallback((move: Move): boolean => {
    if (!session) return false
    const result = applyMove(session.state, move, deriveSeed(session.seed, moveCount(session.state)))
    if (!result.ok) {
      setError(result.error)
      return false
    }
    const next = result.value
    const keep = undoable(session.state, next)
    setError(null)
    setSession({
      ...session,
      state: next,
      history: keep ? [...session.history, session.state] : [],
      handoff: next.active !== session.state.active && next.winner === null ? next.active : null,
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

  const abandon = useCallback(() => {
    roundRef.current = null
    setError(null)
    setSession(null)
  }, [])

  // R6: the clock runs only for the seat to act, and only during the action phase
  const running = session !== null && session.state.phase === 'action' && session.state.winner === null && session.handoff === null
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

  // R6: at zero the player passes automatically; while passing is illegal (an unused strategy card, an open
  // secondary window, a running tactical action) the clock simply stays at zero until it becomes legal
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
    session, legal, error, canUndo: session !== null && session.history.length > 0,
    start, resume, apply, undo, dismissHandoff, abandon,
  }), [session, legal, error, start, resume, apply, undo, dismissHandoff, abandon])

  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}
```

- [ ] **Step 7: Run the store tests**

Run: `npm test -- src/ui`
Expected: PASS, 8 tests.

```bash
git add src/ui/history.ts src/ui/store.tsx
git commit -m "feat(ui): hot-seat game store with seeded moves, undo and the chess clock"
```

- [ ] **Step 8: Write the failing setup-screen test**

```tsx
// src/ui/screens/SetupScreen.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'

function renderApp(hash = '#/?seed=7') {
  window.location.hash = hash
  return render(<App ticking={false} />)
}

describe('the setup screen', () => {
  it('offers two seats with the v1 factions and the eight TI colours', () => {
    renderApp()
    expect(screen.getByTestId('seat-faction-0').textContent).toBe('L1Z1X Mindnet')
    expect(screen.getByTestId('seat-faction-1').textContent).toBe('Barony of Letnev')
    expect(screen.getByTestId('seat-position-0').textContent).toBe('North')
    expect(screen.getByTestId('seat-position-1').textContent).toBe('South')
    expect(screen.getAllByTestId(/^colour-0-/)).toHaveLength(8)
  })

  it('swaps the factions between the seats', () => {
    renderApp()
    fireEvent.click(screen.getByTestId('btn-swap-factions'))
    expect(screen.getByTestId('seat-faction-0').textContent).toBe('Barony of Letnev')
    expect(screen.getByTestId('seat-faction-1').textContent).toBe('L1Z1X Mindnet')
  })

  it('R2: keeps the two colours distinct', () => {
    renderApp()
    expect(screen.getByTestId('colour-1-blue').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('colour-1-green'))
    expect(screen.getByTestId('chosen-colour-1').textContent).toBe('Green')
    expect(screen.getByTestId('colour-0-green').hasAttribute('disabled')).toBe(true)
  })

  it('starts the game and shows the board', () => {
    renderApp()
    fireEvent.change(screen.getByTestId('seat-name-0'), { target: { value: 'Despot' } })
    fireEvent.change(screen.getByTestId('seat-name-1'), { target: { value: 'Kael' } })
    fireEvent.click(screen.getByTestId('btn-start'))
    expect(screen.getByTestId('board-screen')).toBeTruthy()
    expect(screen.getByTestId('round').textContent).toBe('Round 1 of 6, strategy phase')
  })
})
```

- [ ] **Step 9: Run the test to verify it fails, then commit it**

Run: `npm test -- src/ui/screens`
Expected: FAIL, `src/ui/App.tsx` does not exist.

```bash
git add src/ui/screens/SetupScreen.test.tsx
git commit -m "test(ui): setup screen seats, colours and starting a game"
```

- [ ] **Step 10: Implement the router, the app shell and the three screens**

```ts
// src/ui/route.ts
import { useEffect, useState } from 'react'

function current(): string {
  return window.location.hash || '#/'
}

// `hashchange` is queued rather than dispatched inline, so `navigate` also notifies the mounted hooks
// directly; a route change is then visible in the same tick, in the browser and in the tests alike.
const listeners = new Set<() => void>()

export function useHashRoute(): string {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => setRoute(current())
    window.addEventListener('hashchange', onChange)
    listeners.add(onChange)
    onChange()
    return () => {
      window.removeEventListener('hashchange', onChange)
      listeners.delete(onChange)
    }
  }, [])
  return route
}

export function navigate(hash: string): void {
  window.location.hash = hash
  for (const listener of [...listeners]) listener()
}

/** `#/?seed=7` fixes the game seed, which is what the tests use; without it the caller's fallback wins. */
export function seedFromRoute(route: string, fallback: number): number {
  const query = route.indexOf('?')
  if (query < 0) return fallback
  const value = new URLSearchParams(route.slice(query + 1)).get('seed')
  if (value === null) return fallback
  const seed = Number.parseInt(value, 10)
  return Number.isFinite(seed) ? seed : fallback
}
```

```tsx
// src/ui/App.tsx
import { GameProvider, useGame } from './store'
import { useHashRoute } from './route'
import { BoardScreen } from './screens/BoardScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import { SetupScreen } from './screens/SetupScreen'

function Screens() {
  const { session } = useGame()
  const route = useHashRoute()
  if (session && session.state.winner !== null) return <GameOverScreen />
  if (session && route.startsWith('#/play')) return <BoardScreen />
  return <SetupScreen />
}

export default function App({ ticking = true }: { ticking?: boolean }) {
  return (
    <GameProvider ticking={ticking}>
      <Screens />
    </GameProvider>
  )
}
```

```tsx
// src/ui/screens/SetupScreen.tsx
import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { navigate, seedFromRoute, useHashRoute } from '../route'
import { useGame } from '../store'
import type { Color, FactionId, Seat } from '../../engine/types'

const COLOURS: Color[] = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'orange', 'pink']
const COLOUR_NAMES: Record<Color, string> = {
  red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow',
  purple: 'Purple', black: 'Black', orange: 'Orange', pink: 'Pink',
}
const POSITION: [string, string] = ['North', 'South']

export function SetupScreen() {
  const { start } = useGame()
  const route = useHashRoute()
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])
  const [factions, setFactions] = useState<[FactionId, FactionId]>(['l1z1x', 'letnev'])
  const [colours, setColours] = useState<[Color, Color]>(['blue', 'red'])
  const [minutes, setMinutes] = useState(15)

  function setName(seat: Seat, value: string) {
    setNames(seat === 0 ? [value, names[1]] : [names[0], value])
  }
  function setColour(seat: Seat, value: Color) {
    setColours(seat === 0 ? [value, colours[1]] : [colours[0], value])
  }
  function onStart() {
    const seed = seedFromRoute(route, Math.floor(Math.random() * 0x7fffffff))
    start({
      players: [
        { faction: factions[0], color: colours[0], name: names[0].trim() || 'Player 1' },
        { faction: factions[1], color: colours[1], name: names[1].trim() || 'Player 2' },
      ],
      speaker: 0,
    }, seed, minutes)
    navigate('#/play')
  }

  return (
    <div className="setup" data-testid="setup-screen">
      <div className="space"><div className="stars" /><div className="neb" /><div className="limb" /><div className="dust" /></div>
      <header className="hero">
        <h1 className="title goldtext">Mecatol Online</h1>
        <p className="tagline">Twilight Imperium for two players, thirty minutes</p>
      </header>
      <div className="seats">
        {([0, 1] as Seat[]).map(seat => (
          <div className="cut seat" key={seat}>
            <div className="in">
              <div className="seat-top">
                <span className="lbl">Seat {seat + 1}</span>
                <span className="lbl dim" data-testid={`seat-position-${seat}`}>{POSITION[seat]}</span>
              </div>
              <input
                className="field" data-testid={`seat-name-${seat}`} value={names[seat]}
                aria-label={`Name of seat ${seat + 1}`} onChange={e => setName(seat, e.target.value)}
              />
              <div className="faction goldtext" data-testid={`seat-faction-${seat}`}>{FACTIONS[factions[seat]].name}</div>
              <div className="row colour">
                <span className="lbl">Colour</span>
                <div className="swatches">
                  {COLOURS.map(colour => (
                    <button
                      key={colour} type="button"
                      className={`sw ${colour}${colours[seat] === colour ? ' sel' : ''}`}
                      data-testid={`colour-${seat}-${colour}`}
                      title={COLOUR_NAMES[colour]}
                      disabled={colours[seat === 0 ? 1 : 0] === colour}
                      onClick={() => setColour(seat, colour)}
                    />
                  ))}
                </div>
                <span className="chosen" data-testid={`chosen-colour-${seat}`}>{COLOUR_NAMES[colours[seat]]}</span>
              </div>
              <div className="row">
                <span className="lbl">Starting techs</span>
                <span>{FACTIONS[factions[seat]].startingTechs.map(id => id.replace(/_/g, ' ')).join(', ')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="setup-foot">
        <button type="button" className="btn quiet" data-testid="btn-swap-factions" onClick={() => setFactions([factions[1], factions[0]])}>
          Swap factions
        </button>
        <label className="clockfield">
          <span className="lbl">Minutes each</span>
          <input
            type="number" min={1} max={60} className="field small" data-testid="minutes"
            value={minutes} onChange={e => setMinutes(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
          />
        </label>
        <button type="button" className="btn gold" data-testid="btn-start" onClick={onStart}>Play hot-seat</button>
      </div>
    </div>
  )
}
```

```tsx
// src/ui/screens/BoardScreen.tsx
import { useGame } from '../store'

const PHASE_LABEL: Record<string, string> = {
  strategy: 'strategy phase', action: 'action phase', status: 'status phase', ended: 'game over',
}

export function BoardScreen() {
  const { session } = useGame()
  if (!session) return null
  const state = session.state
  return (
    <div className="app" data-testid="board-screen">
      <div className="space"><div className="stars" /><div className="neb" /><div className="swirl" /><div className="limb" /><div className="dust" /></div>
      <div className="r" data-testid="round">Round {state.round} of 6, {PHASE_LABEL[state.phase]}</div>
    </div>
  )
}
```

```tsx
// src/ui/screens/GameOverScreen.tsx
import { navigate } from '../route'
import { useGame } from '../store'

export function GameOverScreen() {
  const { session, abandon } = useGame()
  if (!session || session.state.winner === null) return null
  const state = session.state
  const winner = state.players[state.winner]
  return (
    <div className="setup" data-testid="game-over">
      <div className="space"><div className="stars" /><div className="neb" /><div className="limb" /><div className="dust" /></div>
      <header className="hero">
        <h1 className="title goldtext" data-testid="winner">{winner.name} wins</h1>
        <p className="tagline" data-testid="final-score">
          {state.players[0].name} {state.players[0].vp} victory points, {state.players[1].name} {state.players[1].vp}
        </p>
      </header>
      <div className="setup-foot">
        <button type="button" className="btn gold" data-testid="btn-new-game" onClick={() => { abandon(); navigate('#/') }}>
          New game
        </button>
      </div>
    </div>
  )
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```css
/* src/index.css */
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; background: #05070f; }
```

Remove the scaffold:

```bash
git rm src/App.tsx src/App.css src/assets/hero.png src/assets/react.svg src/assets/vite.svg
```

- [ ] **Step 11: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, the engine suite plus 12 UI tests.

```bash
git add src/ui/route.ts src/ui/App.tsx src/ui/screens src/main.tsx src/index.css
git commit -m "feat(ui): app shell, hash router, setup screen and screen routing"
```

---

### Task 2: Theme, asset map and the board

**Files:**
- Create: `src/ui/theme.css`, `src/ui/sprites.ts`, `src/ui/art.ts`, `src/ui/layout.ts`
- Create: `src/ui/board/BoardMap.tsx`, `src/ui/board/Tile.tsx`, `src/ui/board/UnitStack.tsx`, `src/ui/board/TradePosts.tsx`
- Create: `src/ui/test/harness.tsx`
- Modify: `src/ui/screens/BoardScreen.tsx`, `src/main.tsx` (import the theme)
- Test: `src/ui/sprites.test.ts`, `src/ui/board/BoardMap.test.tsx`

**Interfaces:**
- `src/ui/sprites.ts`
  ```ts
  export interface SpriteDef { pxPerModelUnit: number; spriteW: number; spriteH: number }
  export const SPRITES: Record<UnitType, SpriteDef>
  export const BOARD_SCALE: number
  export function spriteSize(type: UnitType, scale?: number): { width: number; height: number }
  ```
  `SPRITES` is a checked-in copy of `public/assets/sprites/manifest.json` (a test compares the two), so no component fetches a JSON file. `spriteSize` is the manifest's world scale: `round(spriteW / pxPerModelUnit * scale)`. At `BOARD_SCALE = 11.6` it reproduces the mockup's pixel sizes exactly (dreadnought 44x40, carrier 36x36, cruiser 33x33, destroyer 29x23, fighter 27x17, infantry 25x30, PDS 22x18, space dock 26x32), so relative ship sizes on the board are physically correct instead of hand-tuned.
- `src/ui/layout.ts`: `TILE_W`, `TILE_H`, `TILE_POS`, `FLEET_ANCHOR`, `PLANET_SPOTS`, `WORMHOLE_SPOTS`, `POST_POS`, all in the mockup's pixel coordinates inside the 940x698 map box.
- `src/ui/art.ts`: every asset path plus `CARD_NUMBER` and `TECH_ART`, so no component builds a URL by hand. The tech art file names do not follow the technology ids (`light_wave_deflector` is `tech_lightwave_deflector.png`, the unit upgrades are `tech_<unit>_2.jpg`, the faction technologies are `tech_faction_*.jpg`), which is exactly why the map exists.
- `src/ui/board/BoardMap.tsx`
  ```ts
  export interface BoardMapProps {
    state: GameState
    activeSystemId?: string | null
    selectable?: string[]
    onSelect?: (systemId: string) => void
  }
  ```
  Purely presentational: it renders what the state says and calls `onSelect` for a system the caller listed as selectable. It never reads the store.

- [ ] **Step 1: Write the failing sprite and board tests**

```ts
// src/ui/sprites.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPRITES, spriteSize } from './sprites'

describe('unit sprites', () => {
  it('the sprite table is a faithful copy of the shipped manifest', () => {
    const raw = readFileSync(new URL('../../public/assets/sprites/manifest.json', import.meta.url), 'utf8')
    const manifest = JSON.parse(raw) as { units: Record<string, { pxPerModelUnit: number; spriteW: number; spriteH: number }> }
    for (const [type, def] of Object.entries(SPRITES)) {
      expect(manifest.units[type]).toBeDefined()
      expect(manifest.units[type].pxPerModelUnit).toBe(def.pxPerModelUnit)
      expect(manifest.units[type].spriteW).toBe(def.spriteW)
      expect(manifest.units[type].spriteH).toBe(def.spriteH)
    }
  })
  it('the world scale reproduces the mockup sizes', () => {
    expect(spriteSize('dreadnought')).toEqual({ width: 44, height: 40 })
    expect(spriteSize('carrier')).toEqual({ width: 36, height: 36 })
    expect(spriteSize('cruiser')).toEqual({ width: 33, height: 33 })
    expect(spriteSize('destroyer')).toEqual({ width: 29, height: 23 })
    expect(spriteSize('fighter')).toEqual({ width: 27, height: 17 })
    expect(spriteSize('infantry')).toEqual({ width: 25, height: 30 })
    expect(spriteSize('pds')).toEqual({ width: 22, height: 18 })
    expect(spriteSize('spacedock')).toEqual({ width: 26, height: 32 })
  })
  it('a smaller scale keeps the proportions', () => {
    const big = spriteSize('dreadnought')
    const small = spriteSize('dreadnought', 5.8)
    expect(small.width).toBe(Math.round(big.width / 2))
  })
})
```

```tsx
// src/ui/board/BoardMap.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toActionPhase } from '../../engine/testUtils'
import { BoardMap } from './BoardMap'

const state = toActionPhase()

describe('the board', () => {
  it('draws all seven systems with their tile art', () => {
    render(<BoardMap state={state} />)
    for (const id of ['home-n', 'bereg', 'sakulag', 'mecatol', 'quann', 'starpoint', 'home-s']) {
      expect(screen.getByTestId(`tile-${id}`)).toBeTruthy()
    }
    expect(screen.getByTestId('hex-mecatol').getAttribute('src')).toContain('18_MR.png')
  })

  it('stacks the units of a system with a count badge', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('stack-home-n-0-fighter').textContent).toBe('3')
    expect(screen.getByTestId('stack-home-n-0-carrier').textContent).toBe('')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('src')).toContain('blue_dreadnought.png')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('width')).toBe('44')
    expect(screen.getByTestId('stack-home-s-1-destroyer')).toBeTruthy()
  })

  it('shows ground forces, structures and control tokens on the planets', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('ground-000-0-infantry').textContent).toBe('5')
    expect(screen.getByTestId('structure-000-0-spacedock')).toBeTruthy()
    expect(screen.getByTestId('structure-000-0-pds')).toBeTruthy()
    expect(screen.getByTestId('control-000').getAttribute('src')).toContain('l1z1x_control.png')
    expect(screen.getByTestId('ground-arc-prime-1-infantry').textContent).toBe('2')
    expect(screen.getByTestId('ground-wren-terra-1-infantry').textContent).toBe('1')
    expect(screen.queryByTestId('control-sakulag')).toBeNull()
  })

  it('R4.2: the guardian fleet is grey and carries two infantry on Mecatol Rex', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('guardian-label').textContent).toBe('Guardian fleet, worth 8')
    expect(screen.getByTestId('ground-mecatol-rex-guardian-infantry').textContent).toBe('2')
    const ships = screen.getAllByTestId(/^sprite-mecatol-guardian-/)
    expect(ships.length).toBeGreaterThan(0)
    for (const ship of ships) expect(ship.getAttribute('src')).toContain('/grey_')
  })

  it('R1: composed tiles carry a planet plate, printed tiles do not, and wormholes show their glyph', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('plate-sakulag').textContent).toBe('21Sakulag')
    expect(screen.getByTestId('plate-centauri').textContent).toBe('13Centauri')
    expect(screen.queryByTestId('plate-bereg')).toBeNull()
    expect(screen.getByTestId('wormhole-bereg').getAttribute('src')).toContain('WHalpha')
    expect(screen.getByTestId('wormhole-quann').getAttribute('src')).toContain('WHbeta')
    expect(screen.getByTestId('anomaly-sakulag')).toBeTruthy()
  })

  it('only calls back for a system the caller marked selectable', () => {
    const onSelect = vi.fn()
    render(<BoardMap state={state} selectable={['bereg']} activeSystemId="quann" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('tile-bereg'))
    fireEvent.click(screen.getByTestId('tile-sakulag'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('bereg')
    expect(screen.getByTestId('tile-quann').className).toContain('active')
    expect(screen.getByTestId('tile-bereg').className).toContain('selectable')
  })

  it('R8: both trade posts sit outside the map with their state', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('post-west').textContent).toContain('Kasda Exchange')
    expect(screen.getByTestId('post-east').textContent).toContain('Vorhal Freeport')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail, then commit them**

Run: `npm test -- src/ui/sprites src/ui/board`
Expected: FAIL, `src/ui/sprites.ts` and `src/ui/board/BoardMap.tsx` do not exist.

```bash
git add src/ui/sprites.test.ts src/ui/board/BoardMap.test.tsx
git commit -m "test(ui): sprite world scale and the seven-hex board"
```

- [ ] **Step 3: Write the sprite table, the asset map and the layout**

```ts
// src/ui/sprites.ts
import type { UnitType } from '../engine/types'

export interface SpriteDef { pxPerModelUnit: number; spriteW: number; spriteH: number }

/** Copy of public/assets/sprites/manifest.json (`units`); src/ui/sprites.test.ts keeps the two in step. */
export const SPRITES: Record<UnitType, SpriteDef> = {
  dreadnought: { pxPerModelUnit: 144.4, spriteW: 548, spriteH: 503 },
  carrier: { pxPerModelUnit: 188.59, spriteW: 593, spriteH: 587 },
  cruiser: { pxPerModelUnit: 198.59, spriteW: 563, spriteH: 566 },
  destroyer: { pxPerModelUnit: 222.68, spriteW: 555, spriteH: 451 },
  fighter: { pxPerModelUnit: 357.26, spriteW: 826, spriteH: 517 },
  flagship: { pxPerModelUnit: 130.02, spriteW: 559, spriteH: 496 },
  warsun: { pxPerModelUnit: 156.33, spriteW: 505, spriteH: 606 },
  infantry: { pxPerModelUnit: 255.99, spriteW: 552, spriteH: 660 },
  spacedock: { pxPerModelUnit: 238.5, spriteW: 528, spriteH: 651 },
  pds: { pxPerModelUnit: 304.84, spriteW: 590, spriteH: 465 },
}

/** Board pixels per model unit. The manifest's scale is what makes a fighter small next to a dreadnought. */
export const BOARD_SCALE = 11.6
/** The side panels and the production drawer show the same models smaller. */
export const PANEL_SCALE = 10.4

export function spriteSize(type: UnitType, scale: number = BOARD_SCALE): { width: number; height: number } {
  const def = SPRITES[type]
  return {
    width: Math.round(def.spriteW / def.pxPerModelUnit * scale),
    height: Math.round(def.spriteH / def.pxPerModelUnit * scale),
  }
}
```

```ts
// src/ui/art.ts
import type { Color, FactionId, Owner, StrategyCardId, UnitType } from '../engine/types'

export const CARD_NUMBER: Record<StrategyCardId, number> = {
  leadership: 1, diplomacy: 2, trade: 5, warfare: 6, technology: 7, imperial: 8,
}

const TILE_FILE: Record<string, string> = {
  'home-n': '06_000.png', bereg: '35_Bereg.png', sakulag: '44_Asteroids.png', mecatol: '18_MR.png',
  quann: '42_Nebula.png', starpoint: '00_blue.png', 'home-s': '10_ArcPime.png',
}

/** Planet art for the systems whose tile does not print the planet (R1: composed tiles). */
const PLANET_FILE: Record<string, string> = {
  sakulag: 'planet_Sakulag.png', quann: 'planet_Quann.png',
  starpoint: 'planet_Starpoint.png', centauri: 'planet_Vefut.png',
}

/** The card file names do not follow the technology ids, so the mapping is explicit. */
const TECH_FILE: Record<string, string> = {
  antimass_deflectors: 'tech_antimass_deflectors.png', gravity_drive: 'tech_gravity_drive.png',
  fleet_logistics: 'tech_fleet_logistics.png', light_wave_deflector: 'tech_lightwave_deflector.png',
  plasma_scoring: 'tech_plasma_scoring.png', magen_defense_grid: 'tech_magen_defense_grid.png',
  duranium_armor: 'tech_duranium_armor.png', assault_cannon: 'tech_assault_cannon.png',
  neural_motivator: 'tech_neural_motivator.png', dacxive_animators: 'tech_dacxive_animators.png',
  hyper_metabolism: 'tech_hyper_metabolism.png', x89_bacterial_weapon: 'tech_x89_bacterial_weapon.png',
  sarween_tools: 'tech_sarween_tools.png', graviton_laser_system: 'tech_graviton_laser_system.png',
  transit_diodes: 'tech_transit_diodes.png', integrated_economy: 'tech_integrated_economy.png',
  infantry_ii: 'tech_infantry_2.jpg', fighter_ii: 'tech_fighter_2.jpg', destroyer_ii: 'tech_destroyer_2.jpg',
  cruiser_ii: 'tech_cruiser_2.jpg', carrier_ii: 'tech_carrier_2.jpg', dreadnought_ii: 'tech_dreadnought_2.jpg',
  space_dock_ii: 'tech_spacedock_2.jpg', war_sun: 'tech_warsun.jpg',
  inheritance_systems: 'tech_faction_inheritance_systems.jpg',
  super_dreadnought_ii: 'tech_faction_superdreadnought_2.jpg',
  l4_disruptors: 'tech_faction_l4_disruptors.jpg',
  non_euclidean_shielding: 'tech_faction_noneuclidean_shielding.jpg',
}

/** Reference cards for the production drawer; `flagship` is resolved by faction before this lookup. */
const UNIT_CARD: Record<UnitType, string> = {
  infantry: 'unit_generic_infantry.png', fighter: 'unit_generic_fighter.png',
  destroyer: 'unit_generic_destroyer.png', cruiser: 'unit_generic_cruiser.png',
  carrier: 'unit_generic_carrier.png', dreadnought: 'unit_generic_dreadnought.png',
  warsun: 'unit_generic_warsun_0.png', flagship: 'unit_generic_dreadnought.png',
  pds: 'unit_generic_pds.png', spacedock: 'unit_generic_spacedock.png',
}

export const MISC = {
  starfield: '/assets/misc/starfield.png',
  tradeGood: '/assets/misc/emoji_tg.png',
  commodity: '/assets/misc/emoji_comm.png',
  speaker: '/assets/misc/emoji_SpeakerToken.png',
  alpha: '/assets/misc/emoji_WHalpha.png',
  beta: '/assets/misc/emoji_WHbeta.png',
  anomaly: '/assets/tiles/tile_anomaly_chevron.png',
  objectiveBack: '/assets/cards/cardback_public1.png',
  mandateBack: '/assets/cards/cardback_secret.jpg',
}

export const BADGE = {
  resourceReady: '/assets/cards/pc_res_rdy.png',
  resourceExhausted: '/assets/cards/pc_res_exh.png',
  influenceReady: '/assets/cards/pc_inf_rdy.png',
  influenceExhausted: '/assets/cards/pc_inf_exh.png',
}

export const PORTRAIT: Record<FactionId, string> = {
  l1z1x: '/assets/factions/leader_l1z1x_commander.png',
  letnev: '/assets/factions/leader_letnev_commander.png',
}
export const SIGIL: Record<FactionId, string> = {
  l1z1x: '/assets/factions/l1z1x.png',
  letnev: '/assets/factions/letnev.png',
}

export function tileUrl(systemId: string): string {
  return `/assets/tiles/${TILE_FILE[systemId]}`
}
export function planetArtUrl(planetId: string): string | null {
  const file = PLANET_FILE[planetId]
  return file ? `/assets/tiles/${file}` : null
}
export function spriteUrl(colour: Color | 'grey', type: UnitType): string {
  return `/assets/sprites/${colour}_${type}.png`
}
export function tokenUrl(faction: FactionId, kind: 'command' | 'command-fleet' | 'control'): string {
  return `/assets/tokens/${faction}_${kind}.png`
}
export function strategyCardUrl(card: StrategyCardId): string {
  return `/assets/cards/strat_base_game_${CARD_NUMBER[card]}.png`
}
export function techArtUrl(techId: string): string {
  return `/assets/cards/${TECH_FILE[techId] ?? 'cardback_public2.png'}`
}
export function unitCardUrl(type: UnitType, faction: FactionId): string {
  if (type === 'flagship') {
    return faction === 'l1z1x'
      ? '/assets/factions/unit_l1z1x_flagship_001.png'
      : '/assets/factions/unit_letnev_flagship_arc_secundus.png'
  }
  if (type === 'dreadnought' && faction === 'l1z1x') return '/assets/factions/unit_l1z1x_superdreadnought.jpg'
  return `/assets/cards/${UNIT_CARD[type]}`
}
export function ownerKey(owner: Owner): string {
  return owner === 'guardian' ? 'guardian' : String(owner)
}
```

```ts
// src/ui/layout.ts
export const TILE_W = 232
export const TILE_H = 201
export interface Point { left: number; top: number }

/** Flower positions inside the 940x698 map box, taken from the approved mockup. */
export const TILE_POS: Record<string, Point> = {
  'home-n': { left: 354, top: 47 },
  bereg: { left: 528, top: 148 },
  sakulag: { left: 180, top: 148 },
  mecatol: { left: 354, top: 248 },
  quann: { left: 528, top: 349 },
  starpoint: { left: 180, top: 349 },
  'home-s': { left: 354, top: 449 },
}

/** Where the ships of a system start; the fleet flows to the right and wraps inside 200px. */
export const FLEET_ANCHOR: Record<string, Point> = {
  'home-n': { left: 16, top: 26 },
  bereg: { left: 14, top: 96 },
  sakulag: { left: 14, top: 26 },
  mecatol: { left: 14, top: 34 },
  quann: { left: 122, top: 24 },
  starpoint: { left: 16, top: 24 },
  'home-s': { left: 16, top: 96 },
}

export interface PlanetSpot {
  ground: Point                 // control token, then the ground forces to its right
  structures: Point             // space dock and PDS
  art?: { left: number; top: number; width: number; height: number }
  plate?: Point                 // only for planets the tile art does not print
}

export const PLANET_SPOTS: Record<string, PlanetSpot> = {
  '000': { ground: { left: 60, top: 100 }, structures: { left: 120, top: 56 } },
  bereg: { ground: { left: 64, top: 40 }, structures: { left: 64, top: 8 } },
  'lirta-iv': { ground: { left: 128, top: 124 }, structures: { left: 128, top: 160 } },
  sakulag: {
    ground: { left: 62, top: 98 }, structures: { left: 118, top: 98 },
    art: { left: 72, top: 52, width: 86, height: 86 }, plate: { left: 70, top: 136 },
  },
  'mecatol-rex': { ground: { left: 88, top: 62 }, structures: { left: 88, top: 96 } },
  quann: {
    ground: { left: 60, top: 102 }, structures: { left: 116, top: 102 },
    art: { left: 74, top: 56, width: 82, height: 82 }, plate: { left: 78, top: 138 },
  },
  starpoint: {
    ground: { left: 136, top: 50 }, structures: { left: 136, top: 84 },
    art: { left: 102, top: 24, width: 90, height: 80 }, plate: { left: 98, top: 108 },
  },
  centauri: {
    ground: { left: 42, top: 118 }, structures: { left: 42, top: 152 },
    art: { left: 40, top: 100, width: 64, height: 64 }, plate: { left: 52, top: 168 },
  },
  'arc-prime': { ground: { left: 68, top: 50 }, structures: { left: 118, top: 36 } },
  'wren-terra': { ground: { left: 134, top: 118 }, structures: { left: 134, top: 152 } },
}

export const WORMHOLE_SPOTS: Record<string, Point> = {
  bereg: { left: 176, top: 36 },
  sakulag: { left: 30, top: 36 },
  quann: { left: 178, top: 140 },
  starpoint: { left: 194, top: 88 },
}

export const ANOMALY_SPOT: Point = { left: 84, top: 8 }

export const POST_POS: Record<'west' | 'east', Point> = {
  west: { left: 16, top: 254 },
  east: { left: 776, top: 254 },
}
```

```bash
git add src/ui/sprites.ts src/ui/art.ts src/ui/layout.ts
git commit -m "feat(ui): sprite world scale, asset map and board layout constants"
```

- [ ] **Step 4: Implement the board components**

```tsx
// src/ui/board/UnitStack.tsx
import { ownerKey, spriteUrl } from '../art'
import { spriteSize } from '../sprites'
import type { Color, Owner, UnitType } from '../../engine/types'

export interface UnitGroup { owner: Owner; type: UnitType; count: number }

const ORDER: UnitType[] = ['flagship', 'warsun', 'dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'spacedock', 'pds']

/** Groups units by owner and type in a stable order, so the board never reshuffles between renders. */
export function groupUnits(units: { owner: Owner; type: UnitType }[]): UnitGroup[] {
  const counts = new Map<string, UnitGroup>()
  for (const unit of units) {
    const key = `${ownerKey(unit.owner)}:${unit.type}`
    const found = counts.get(key)
    if (found) found.count += 1
    else counts.set(key, { owner: unit.owner, type: unit.type, count: 1 })
  }
  return [...counts.values()].sort((a, b) => {
    const owners = ownerKey(a.owner).localeCompare(ownerKey(b.owner))
    return owners !== 0 ? owners : ORDER.indexOf(a.type) - ORDER.indexOf(b.type)
  })
}

export function UnitStack({ group, colour, testId, scale }: { group: UnitGroup; colour: Color | 'grey'; testId: string; scale?: number }) {
  const size = spriteSize(group.type, scale)
  return (
    <span className="stk" data-testid={`stack-${testId}`}>
      <img
        src={spriteUrl(colour, group.type)} alt={group.type}
        width={size.width} height={size.height} data-testid={`sprite-${testId}`}
      />
      {group.count > 1 ? <span className="cnt">{group.count}</span> : null}
    </span>
  )
}
```

```tsx
// src/ui/board/Tile.tsx
import { systemDef } from '../../data/map'
import { BADGE, MISC, ownerKey, planetArtUrl, tileUrl, tokenUrl } from '../art'
import { ANOMALY_SPOT, FLEET_ANCHOR, PLANET_SPOTS, TILE_H, TILE_POS, TILE_W, WORMHOLE_SPOTS } from '../layout'
import { UnitStack, groupUnits } from './UnitStack'
import type { Color, GameState, Owner, Planet, System } from '../../engine/types'

const HEX = '58,1 174,1 231,100.5 174,200 58,200 1,100.5'

function colourOf(state: GameState, owner: Owner): Color | 'grey' {
  return owner === 'guardian' ? 'grey' : state.players[owner].color
}

function PlanetMarkers({ state, planet }: { state: GameState; planet: Planet }) {
  const spot = PLANET_SPOTS[planet.id]
  const art = planetArtUrl(planet.id)
  const ground = groupUnits(planet.ground)
  const structures = groupUnits(planet.structures)
  return (
    <>
      {art && spot.art ? (
        <img className="planet" src={art} alt={planet.name} data-testid={`planet-art-${planet.id}`}
          style={{ left: spot.art.left, top: spot.art.top, width: spot.art.width, height: spot.art.height }} />
      ) : null}
      {spot.plate ? (
        <span className="plate" data-testid={`plate-${planet.id}`} style={{ left: spot.plate.left, top: spot.plate.top }}>
          <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
          <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
          <span className="nm">{planet.name}</span>
        </span>
      ) : null}
      <span className="row-ground" style={{ left: spot.ground.left, top: spot.ground.top }}>
        {planet.owner !== null ? (
          <img className="ctl" src={tokenUrl(state.players[planet.owner].faction, 'control')} alt="control"
            data-testid={`control-${planet.id}`} width={26} />
        ) : null}
        {ground.map(group => (
          <UnitStack key={`${ownerKey(group.owner)}-${group.type}`} group={group} colour={colourOf(state, group.owner)}
            testId={`${planet.id}-${ownerKey(group.owner)}-${group.type}`} />
        ))}
      </span>
      <span className="row-structures" style={{ left: spot.structures.left, top: spot.structures.top }}>
        {structures.map(group => (
          <span key={`${ownerKey(group.owner)}-${group.type}`} data-testid={`structure-${planet.id}-${ownerKey(group.owner)}-${group.type}`}>
            <UnitStack group={group} colour={colourOf(state, group.owner)}
              testId={`s-${planet.id}-${ownerKey(group.owner)}-${group.type}`} />
          </span>
        ))}
      </span>
    </>
  )
}

export interface TileProps {
  state: GameState
  system: System
  active: boolean
  selectable: boolean
  onSelect?: (systemId: string) => void
}

export function Tile({ state, system, active, selectable, onSelect }: TileProps) {
  const def = systemDef(system.id)
  const pos = TILE_POS[system.id]
  const anchor = FLEET_ANCHOR[system.id]
  const home = def.home === null ? '' : def.home === 0 ? ' home-0' : ' home-1'
  const classes = `tile${home}${active ? ' active' : ''}${selectable ? ' selectable' : ''}`
  const guardians = system.space.some(u => u.owner === 'guardian')
  return (
    <div
      className={classes} data-testid={`tile-${system.id}`}
      style={{ left: pos.left, top: pos.top, width: TILE_W, height: TILE_H }}
      onClick={selectable && onSelect ? () => onSelect(system.id) : undefined}
    >
      <img className="hex" src={tileUrl(system.id)} alt={system.name} width={TILE_W} height={TILE_H} data-testid={`hex-${system.id}`} />
      <svg className="line" viewBox={`0 0 ${TILE_W} ${TILE_H}`}><polygon points={HEX} /></svg>
      {system.planets.map(planet => <PlanetMarkers key={planet.id} state={state} planet={planet} />)}
      <span className="fleet" style={{ left: anchor.left, top: anchor.top }} data-testid={`fleet-${system.id}`}>
        {groupUnits(system.space).map(group => (
          <UnitStack key={`${ownerKey(group.owner)}-${group.type}`} group={group} colour={colourOf(state, group.owner)}
            testId={`${system.id}-${ownerKey(group.owner)}-${group.type}`} />
        ))}
      </span>
      {def.wormhole ? (
        <img className="wh" src={def.wormhole === 'alpha' ? MISC.alpha : MISC.beta} alt={`${def.wormhole} wormhole`}
          data-testid={`wormhole-${system.id}`} style={WORMHOLE_SPOTS[system.id]} width={26} height={26} />
      ) : null}
      {def.anomaly === 'asteroid' ? (
        <img className="chev" src={MISC.anomaly} alt="asteroid field" data-testid={`anomaly-${system.id}`} style={ANOMALY_SPOT} width={64} />
      ) : null}
      {guardians ? <span className="guard" data-testid="guardian-label">Guardian fleet, worth 8</span> : null}
    </div>
  )
}
```

```tsx
// src/ui/board/TradePosts.tsx
import { TRADE_POSTS } from '../../data/map'
import { POST_POS } from '../layout'
import type { GameState, Seat } from '../../engine/types'

const NAMES = { west: 'Kasda Exchange', east: 'Vorhal Freeport' } as const

function stateLine(state: GameState, seat: Seat, post: 'west' | 'east'): string {
  const linked = TRADE_POSTS[post].some(id => state.systems[id].planets.some(p => p.owner === seat))
  if (!linked) return `Locked for you: hold a planet in the ${post}`
  return state.players[seat].tradedThisRound[post] ? 'Used this round' : 'Open: 1 trade left'
}

/** R8: two neutral posts outside the map; not systems, so they are drawn as panels, not hexes. */
export function TradePosts({ state, seat }: { state: GameState; seat: Seat }) {
  return (
    <>
      {(['west', 'east'] as const).map(post => (
        <div key={post} className={`post cut ${post}`} style={POST_POS[post]} data-testid={`post-${post}`}>
          <div className="in">
            <span className="tab">{NAMES[post]}</span>
            <div className={`station ${post}`} aria-hidden="true" />
            <div className="desc">2 commodities for 2 trade goods, once per round</div>
            <span className="chip gold" data-testid={`post-state-${post}`}>{stateLine(state, seat, post)}</span>
          </div>
        </div>
      ))}
    </>
  )
}
```

```tsx
// src/ui/board/BoardMap.tsx
import { SYSTEMS } from '../../data/map'
import { Tile } from './Tile'
import { TradePosts } from './TradePosts'
import type { GameState } from '../../engine/types'

export interface BoardMapProps {
  state: GameState
  activeSystemId?: string | null
  selectable?: string[]
  onSelect?: (systemId: string) => void
}

export function BoardMap({ state, activeSystemId = null, selectable = [], onSelect }: BoardMapProps) {
  return (
    <div className="map" data-testid="board-map">
      {SYSTEMS.map(def => (
        <Tile
          key={def.id} state={state} system={state.systems[def.id]}
          active={activeSystemId === def.id} selectable={selectable.includes(def.id)} onSelect={onSelect}
        />
      ))}
      <TradePosts state={state} seat={state.active} />
    </div>
  )
}
```

- [ ] **Step 5: Write the stylesheet**

```css
/* src/ui/theme.css */
:root{
  --gold:#c9a24d; --gold-hi:#e8cf8a; --gold-sh:#7a5c1e;
  --blue:#3d7be8; --red:#d63b3b;
  --panel:rgba(8,14,32,.78); --hair:rgba(201,162,77,.55);
  --text:#e9e4d6; --muted:#9a9483;
  --hud:"Barlow Condensed","Avenir Next Condensed","Avenir Next",sans-serif;
  --body:"Barlow","Avenir Next",sans-serif;
  --display:"Cinzel","Copperplate",serif;
}
body{background:#05070f;color:var(--text);font:400 13px/1.3 var(--body);-webkit-font-smoothing:antialiased}
img{display:block}
button{font-family:inherit}

/* space */
.space{position:fixed;inset:0;overflow:hidden;background:#05070f;z-index:0}
.space .stars{position:absolute;inset:-40px;background:url(/assets/misc/starfield.png) center/cover no-repeat;opacity:.95;filter:saturate(.8) brightness(.95)}
.space .neb{position:absolute;inset:0;background:
  radial-gradient(900px 520px at 22% 78%,rgba(56,84,190,.26),transparent 65%),
  radial-gradient(700px 480px at 78% 26%,rgba(110,70,170,.24),transparent 65%),
  linear-gradient(180deg,#05070f 0%,#070c1e 45%,#0b1430 100%)}
.space .swirl{position:absolute;left:-420px;top:120px;width:1300px;height:700px;border-radius:50%;
  background:conic-gradient(from 20deg,transparent 0 40%,rgba(120,150,255,.14) 48%,transparent 56%,transparent 80%,rgba(180,140,255,.11) 88%,transparent 96%);
  filter:blur(28px);transform:rotate(-18deg) scaleY(.45)}
.space .limb{position:absolute;left:-520px;top:560px;width:1100px;height:1100px;border-radius:50%;
  background:radial-gradient(circle at 70% 22%,#414a66 0%,#232a42 18%,#111729 38%,#070a1a 60%);
  box-shadow:14px -14px 70px rgba(130,150,215,.22),inset -18px 18px 90px rgba(150,170,235,.22)}
.space .dust{position:absolute;inset:0;background-image:
  radial-gradient(1px 1px at 12% 33%,rgba(255,255,255,.7),transparent 60%),
  radial-gradient(1.5px 1.5px at 61% 22%,rgba(255,255,255,.7),transparent 60%),
  radial-gradient(1px 1px at 84% 64%,rgba(255,255,255,.6),transparent 60%),
  radial-gradient(1px 1px at 47% 88%,rgba(255,255,255,.55),transparent 60%);opacity:.8}

/* gold primitives */
.cut{--c:10px;position:relative;padding:1px;
  background:linear-gradient(160deg,var(--gold-hi) 0%,var(--gold) 38%,var(--gold-sh) 100%);
  clip-path:polygon(var(--c) 0,calc(100% - var(--c)) 0,100% var(--c),100% calc(100% - var(--c)),calc(100% - var(--c)) 100%,var(--c) 100%,0 calc(100% - var(--c)),0 var(--c))}
.cut>.in{--ci:calc(var(--c) - .6px);height:100%;background:var(--panel);
  clip-path:polygon(var(--ci) 0,calc(100% - var(--ci)) 0,100% var(--ci),100% calc(100% - var(--ci)),calc(100% - var(--ci)) 100%,var(--ci) 100%,0 calc(100% - var(--ci)),0 var(--ci));
  box-shadow:inset 0 0 34px rgba(0,0,0,.55)}
.tab{display:inline-block;background:linear-gradient(180deg,var(--gold-hi) 0%,var(--gold) 55%,#a37f2f 100%);color:#15110a;
  font:600 11px/18px var(--hud);letter-spacing:.08em;text-transform:uppercase;padding:0 16px 0 10px;
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 100%,0 100%);white-space:nowrap}
.lbl{font:600 11px/1 var(--hud);letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.lbl.dim{color:var(--muted)}
.bul::before{content:"";display:inline-block;width:5px;height:5px;background:var(--gold);transform:rotate(45deg);margin:0 7px 2px 0}
.goldtext{background:linear-gradient(180deg,#f6e7b4 0%,#d9b55e 42%,#9a7428 56%,#e8cf8a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.chip{display:inline-block;font:600 11px/18px var(--hud);letter-spacing:.06em;text-transform:uppercase;padding:0 9px;border:1px solid;border-radius:2px}
.chip.blue{color:#9dbcf5;border-color:rgba(61,123,232,.7);background:rgba(61,123,232,.16)}
.chip.red{color:#f1a3a3;border-color:rgba(214,59,59,.7);background:rgba(214,59,59,.16)}
.chip.gold{color:var(--gold-hi);border-color:var(--hair);background:rgba(201,162,77,.10)}
.chip.lock{color:#b9b3a2;border-color:rgba(160,150,120,.45);background:rgba(120,110,80,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 18px;border:1px solid var(--gold);color:var(--gold-hi);
  font:600 13px/1 var(--hud);letter-spacing:.08em;text-transform:uppercase;background:rgba(201,162,77,.06);cursor:pointer;
  clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}
.btn.quiet{border-color:rgba(201,162,77,.55);color:var(--gold);background:transparent}
.btn.gold{background:linear-gradient(180deg,var(--gold-hi) 0%,var(--gold) 55%,#a8842f 100%);color:#15110a;border-color:var(--gold-hi)}
.btn:disabled{opacity:.42;cursor:default}
.btn.small{height:26px;padding:0 10px;font-size:12px}
.field{height:32px;padding:0 10px;border:1px solid var(--hair);background:rgba(0,0,0,.35);color:var(--text);font:500 14px var(--body)}
.field.small{width:72px}
.badge{position:relative;display:inline-block;width:20px;height:20px;background:center/contain no-repeat;font:600 11px/20px var(--body);text-align:center}
.badge.res{color:#f6e3a1}
.badge.inf{color:#fff}

/* layout */
.app{position:relative;width:1440px;height:900px;margin:0 auto}
.topbar{position:absolute;left:0;top:0;width:1440px;height:118px;display:flex;align-items:center;padding:0 12px;gap:16px;
  background:linear-gradient(180deg,rgba(6,10,24,.92),rgba(6,10,24,.72));border-bottom:1px solid var(--hair);z-index:3}
.bottombar{position:absolute;left:0;top:816px;width:1440px;height:84px;display:flex;align-items:center;padding:0 20px;gap:16px;
  background:linear-gradient(180deg,rgba(6,10,24,.72),rgba(6,10,24,.94));border-top:1px solid var(--hair);z-index:3}
.colL{position:absolute;left:8px;top:126px;width:234px;height:684px;z-index:2}
.colR{position:absolute;left:1198px;top:126px;width:234px;height:684px;z-index:2}
.map{position:absolute;left:250px;top:118px;width:940px;height:698px;z-index:1}
.actions{display:flex;gap:10px;margin:0 auto}
.hintbox{width:390px;text-align:right}
.hintbox .h{font:500 13px/1.25 var(--body);color:#d8d2c2}
.hintbox .r{margin-top:4px;font:600 11px/1 var(--hud);letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}

/* player blocks */
.pblock{display:flex;align-items:center;gap:12px;width:258px;flex:none}
.pblock.right{flex-direction:row-reverse;text-align:right;margin-left:auto}
.portrait{position:relative;width:72px;height:72px;flex:none;padding:2px;background:linear-gradient(160deg,var(--gold-hi),var(--gold) 45%,var(--gold-sh))}
.portrait .face{width:68px;height:68px;background-repeat:no-repeat;background-size:204px 136px;background-position:-8px -38px;background-color:#0b1020}
.portrait .sym{position:absolute;right:-8px;bottom:-8px;width:28px;height:28px;padding:2px;background:#0b1020;border:1px solid var(--gold)}
.portrait .sym img{width:100%;height:100%;object-fit:contain}
.pname{font:900 15px/1.15 var(--display);letter-spacing:.02em;white-space:nowrap}
.pnick{font:600 11px/1 var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.clock{display:flex;align-items:baseline;gap:8px;font:600 34px/1 var(--hud);color:#f1ead8;margin-top:2px}
.clock small{font:500 11px/1 var(--hud);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.runbar{position:relative;height:2px;width:118px;background:rgba(201,162,77,.25);margin:3px 0 4px}
.runbar i{position:absolute;left:0;top:-1px;height:4px;background:linear-gradient(90deg,transparent,var(--gold-hi))}
.speaker{width:34px;height:22px;object-fit:contain}

/* strategy cards and objectives */
.strats{display:flex;gap:7px;flex:none}
.sc{width:66px;display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:0;padding:0;cursor:default}
.sc.pick{cursor:pointer}
.sc .card{position:relative;width:62px;height:78px;border:1px solid rgba(255,255,255,.12);background:#000}
.sc .card img{width:100%;height:100%;object-fit:cover}
.sc.own-0 .card{border-color:var(--blue)}
.sc.own-1 .card{border-color:var(--red)}
.sc.played .card::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.42)}
.sc .st{font:600 11px/1 var(--hud);letter-spacing:.04em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.objs{display:flex;flex-direction:column;gap:5px;flex:none}
.objrow{display:flex;gap:6px;align-items:flex-start}
.obj{position:relative;width:70px;height:80px;padding:4px 5px;background:#0a1020;border:1px solid rgba(201,162,77,.45);overflow:hidden}
.obj::before{content:"";position:absolute;inset:0;background:var(--bg) center/cover;opacity:.28}
.obj .tier{position:relative;font:700 11px/1 var(--hud);letter-spacing:.06em;color:var(--gold);text-transform:uppercase}
.obj .txt{position:relative;margin-top:3px;font:600 11px/1.05 var(--hud);color:#e9e4d6}
.obj .tok{position:absolute;right:4px;width:22px}
.obj .tok.s0{bottom:19px}
.obj .tok.s1{bottom:4px}
.obj.mandate{width:54px;border-color:var(--gold)}
.mtext{width:122px;font:500 11px/1.15 var(--body);color:#d8d2c2}

/* side panels */
.pcontent{padding:8px 8px 6px}
.sec{margin-bottom:7px}
.sec>.lbl{display:block;margin-bottom:5px}
.vp{position:relative;height:30px;display:flex;border:1px solid var(--hair);background:rgba(0,0,0,.35)}
.vp i{flex:1;border-right:1px solid rgba(201,162,77,.35);position:relative}
.vp i:last-child{border-right:0}
.vp i::after{content:attr(data-n);position:absolute;right:4px;bottom:2px;font:600 11px/1 var(--hud);color:rgba(201,162,77,.85)}
.vp i.on{background:rgba(201,162,77,.10)}
.slots{display:flex;gap:6px}
.slot{flex:1;height:62px;border:1px solid var(--hair);position:relative;background:rgba(0,0,0,.3)}
.slot .cap{position:absolute;left:0;right:0;bottom:2px;text-align:center;font:600 11px/1 var(--hud);letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.slot .cap b{color:#f1ead8;margin-left:4px}
.slot .stack{position:absolute;left:50%;top:3px;width:40px;height:44px;transform:translateX(-50%)}
.slot .stack img{position:absolute;left:0;width:40px}
.planets{display:flex;flex-wrap:wrap;gap:7px}
.pl{width:64px;height:44px;border:1px solid var(--hair);background:rgba(10,16,34,.9);padding:4px 5px;position:relative}
.pl.exh{filter:grayscale(.85) brightness(.72)}
.pl .n{font:600 11px/1 var(--hud);color:#e9e4d6;white-space:nowrap;overflow:hidden}
.pl .v{position:absolute;left:5px;bottom:4px;display:flex;gap:4px}
.tot{margin-top:6px;display:flex;align-items:center;gap:6px;font:500 12px/1 var(--body);color:#d8d2c2;flex-wrap:wrap}
.tot .k{font:600 11px/1 var(--hud);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.tot img{width:18px;height:18px}
.techrow{display:flex;align-items:center;gap:7px;font:500 12px/1 var(--body);color:#e0dbcc;margin-bottom:4px}
.tdot{width:9px;height:9px;transform:rotate(45deg);flex:none}
.tdot.blue{background:#4f8ae8}.tdot.red{background:#d64a4a}.tdot.green{background:#49b06a}.tdot.yellow{background:#e0c04a}.tdot.none{background:#8d8877}
.forces{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 5px}
.fc{display:flex;align-items:center;gap:6px;min-height:38px;border:1px solid rgba(201,162,77,.25);background:rgba(0,0,0,.28);padding:2px 4px}
.fc b{font:600 13px/1 var(--hud);color:#f1ead8}
.fc span.n{font:500 11px/1.05 var(--hud);color:var(--muted);text-transform:uppercase}

/* map pieces */
.tile{position:absolute}
.tile>img.hex{filter:drop-shadow(0 8px 12px rgba(0,0,0,.7))}
.tile svg.line{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.tile svg.line polygon{fill:none;stroke-width:1.4;stroke:transparent}
.tile.home-0 svg.line polygon{stroke:var(--blue)}
.tile.home-1 svg.line polygon{stroke:var(--red)}
.tile.active svg.line polygon{stroke:var(--gold-hi);stroke-width:1.6}
.tile.selectable{cursor:pointer}
.tile.selectable svg.line polygon{stroke:rgba(232,207,138,.55);stroke-dasharray:6 5}
.fleet{position:absolute;display:flex;flex-wrap:wrap;align-items:flex-end;gap:4px;width:200px}
.row-ground,.row-structures{position:absolute;display:flex;align-items:flex-end;gap:3px}
.stk{position:relative;display:inline-block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.85))}
.stk .cnt{position:absolute;right:-9px;bottom:-5px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#0b1020;border:1px solid var(--gold);color:#f1ead8;font:700 10px/14px var(--hud);text-align:center}
.planet{position:absolute;object-fit:contain}
.ctl{width:26px}
.plate{position:absolute;display:flex;align-items:center;gap:3px;height:22px;padding:0 9px 0 2px;background:rgba(6,9,20,.85);border:1px solid rgba(120,150,220,.55);border-radius:10px}
.plate .nm{font:700 11px/1 var(--hud);letter-spacing:.06em;color:#fff;text-transform:uppercase}
.wh{position:absolute}
.chev{position:absolute;opacity:.9}
.guard{position:absolute;left:50%;top:4px;transform:translateX(-50%);white-space:nowrap;font:600 11px/18px var(--hud);text-transform:uppercase;color:var(--gold-hi);padding:0 7px;background:rgba(6,9,20,.82);border:1px solid var(--hair)}
.post{position:absolute;width:148px;height:190px}
.post .in{display:flex;flex-direction:column;align-items:center;padding:8px 6px 6px;gap:5px}
.post .desc{font:500 11px/1.15 var(--body);color:#cfc9b8;text-align:center}
.post .station{width:120px;height:70px}
.post .station.west{background:linear-gradient(120deg,#3a475f,#9fb0c8 50%,#2d3850);clip-path:polygon(10% 50%,28% 22%,72% 22%,90% 50%,72% 78%,28% 78%)}
.post .station.east{background:radial-gradient(circle at 40% 35%,#e8cf8a,#6b4a17 70%);border-radius:50%;clip-path:polygon(0 30%,100% 30%,100% 70%,0 70%)}

/* drawers and dialogs */
.scrim{position:absolute;left:0;top:118px;width:1440px;height:698px;background:rgba(3,5,12,.52);z-index:15}
.drawer{position:absolute;left:250px;width:940px;z-index:20}
.drawer .in{padding:12px 16px 14px}
.drawer.bottom{top:466px}
.drawer.full{top:126px}
.dhead{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.dhead .sub{font:500 12px/1 var(--body);color:#d8d2c2}
.dhead .sub b{color:var(--gold-hi);font-weight:600}
.dhead .right{margin-left:auto;display:flex;gap:8px}
.ucards{display:flex;gap:8px}
.uc{flex:1;border:1px solid var(--hair);background:rgba(4,8,20,.8);padding:5px 6px 6px}
.uc img{width:100%;height:78px;object-fit:cover;object-position:left top;background:#000}
.uc .n{margin-top:5px;font:600 12px/1 var(--hud);text-transform:uppercase;color:#f1ead8}
.uc .s{margin-top:3px;font:500 11px/1 var(--hud);color:var(--muted);text-transform:uppercase}
.uc.off{opacity:.5}
.step{margin-top:6px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(201,162,77,.4);height:24px}
.step button{width:24px;background:none;border:0;color:var(--gold);font:600 15px/22px var(--hud);cursor:pointer}
.step button:disabled{opacity:.35;cursor:default}
.step b{font:600 14px/22px var(--hud);color:#f1ead8}
.payrow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.pay{display:flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 6px;border:1px solid var(--hair);background:rgba(0,0,0,.35);font:600 12px/1 var(--hud);color:#e9e4d6;cursor:pointer}
.pay.on{border-color:var(--gold);background:rgba(201,162,77,.16);color:var(--gold-hi)}
.pay:disabled{opacity:.45;cursor:default}
.tcols{display:flex;gap:8px}
.tcol{width:166px;flex:none}
.tcol.units{width:210px}
.tcol h4{margin:0 0 6px;display:flex;align-items:center;gap:6px;font:600 11px/1 var(--hud);letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.tc{position:relative;margin-bottom:6px;border:1px solid rgba(255,255,255,.10);background:#000;overflow:hidden;width:100%;padding:0;cursor:pointer}
.tc img.art{width:100%;height:64px;object-fit:cover}
.tc .cap{display:flex;align-items:center;gap:4px;height:20px;padding:0 6px;background:rgba(6,10,24,.95);font:600 11px/1 var(--hud);text-transform:uppercase;color:#d8d2c2}
.tc:disabled{opacity:.5;cursor:default}
.tc.now{border-color:var(--gold)}
.tc.sel{border-color:var(--gold-hi);box-shadow:0 0 0 2px rgba(232,207,138,.55)}
.tc.owned .cap{color:var(--gold-hi)}
.dialog{position:absolute;left:370px;top:220px;width:700px;z-index:25}
.dialog .in{padding:14px 16px 16px}
.rowline{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.overlay{position:fixed;inset:0;background:rgba(3,5,12,.94);z-index:40;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px}
.logpanel{position:absolute;left:250px;top:126px;width:520px;height:640px;overflow:auto;z-index:30}
.logpanel .in{padding:12px 14px}
.logline{font:500 12px/1.5 var(--body);color:#d8d2c2;border-bottom:1px solid rgba(201,162,77,.14);padding:2px 0}
.logline.roll{color:var(--gold-hi)}

/* setup and game over */
.setup{position:relative;width:1440px;min-height:900px;margin:0 auto;padding:60px 80px;z-index:1}
.hero{text-align:center;margin-bottom:30px}
.title{font:900 64px/1 var(--display);letter-spacing:.04em;margin:0}
.tagline{font:600 13px/1 var(--hud);letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:14px}
.seats{display:flex;gap:24px;justify-content:center}
.seat{width:520px}
.seat .in{padding:18px 20px;display:flex;flex-direction:column;gap:10px}
.seat-top{display:flex;align-items:center;gap:10px}
.faction{font:700 22px/1.2 var(--display)}
.row{display:flex;align-items:center;gap:12px}
.swatches{display:flex;align-items:center;gap:9px}
.sw{position:relative;width:20px;height:20px;border-radius:50%;border:0;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.55)}
.sw:disabled{opacity:.35;cursor:default}
.sw.sel{outline:2px solid var(--gold-hi);outline-offset:2px}
.sw.red{background:#d63b3b}.sw.blue{background:#3d7be8}.sw.green{background:#3aa655}.sw.yellow{background:#e5c531}
.sw.purple{background:#8a47c9}.sw.black{background:#2a2e36}.sw.orange{background:#e8842a}.sw.pink{background:#e067b0}
.chosen{font:600 12px var(--hud);letter-spacing:.08em;text-transform:uppercase;color:#8fb4ff}
.setup-foot{display:flex;align-items:center;justify-content:center;gap:20px;margin-top:34px}
.clockfield{display:flex;align-items:center;gap:10px}
```

Import it once, in `src/main.tsx`, above `./index.css`:

```tsx
import './ui/theme.css'
```

- [ ] **Step 6: Add the test harness and put the map on the board screen**

```tsx
// src/ui/test/harness.tsx
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GameProvider, useGame } from '../store'
import type { GameStore, Session } from '../store'
import type { GameState } from '../../engine/types'

let current: GameStore | null = null

function Probe() {
  current = useGame()
  return null
}

/** Renders `node` inside a provider whose session is the given state; the clock is off unless asked for. */
export function renderWithSession(state: GameState, node: ReactNode, options?: { seed?: number; clockMs?: [number, number] }) {
  const view = render(<GameProvider ticking={false}><Probe />{node}</GameProvider>)
  act(() => {
    current?.resume({
      seed: options?.seed ?? 7, minutes: 15, state, history: [],
      clockMs: options?.clockMs ?? [900000, 900000], handoff: null,
    })
  })
  return {
    ...view,
    store(): GameStore {
      if (!current) throw new Error('the probe never saw the store')
      return current
    },
  }
}
```

```tsx
// src/ui/screens/BoardScreen.tsx
import { BoardMap } from '../board/BoardMap'
import { useGame } from '../store'

const PHASE_LABEL: Record<string, string> = {
  strategy: 'strategy phase', action: 'action phase', status: 'status phase', ended: 'game over',
}

export function BoardScreen() {
  const { session } = useGame()
  if (!session) return null
  const state = session.state
  return (
    <div className="app" data-testid="board-screen">
      <div className="space"><div className="stars" /><div className="neb" /><div className="swirl" /><div className="limb" /><div className="dust" /></div>
      <BoardMap state={state} activeSystemId={state.tactical?.systemId ?? null} />
      <div className="bottombar">
        <div className="hintbox">
          <div className="r" data-testid="round">Round {state.round} of 6, {PHASE_LABEL[state.phase]}</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 10 new tests.

```bash
git add src/ui/theme.css src/ui/board src/ui/test/harness.tsx src/ui/screens/BoardScreen.tsx src/main.tsx
git commit -m "feat(ui): board with tile art, unit sprites at world scale and the trade posts"
```

---

### Task 3: HUD, player panels, action bar and the chess clock display

**Files:**
- Create: `src/ui/format.ts`
- Create: `src/ui/hud/TopBar.tsx`, `src/ui/hud/SidePanel.tsx`, `src/ui/hud/ActionBar.tsx`
- Modify: `src/ui/screens/BoardScreen.tsx`
- Test: `src/ui/hud/Hud.test.tsx`

**Interfaces:**
- `src/ui/format.ts`
  ```ts
  export function formatClock(ms: number): string                    // 900000 -> '15:00'
  export const CARD_NAME: Record<StrategyCardId, string>
  export function unitLabel(type: UnitType, player: Player): string  // 'Super-Dreadnought I', 'Carrier II', 'Flagship [0.0.1]'
  export function techLabel(techId: string): string
  export function planetLabel(state: GameState, planetId: string): string
  export function systemLabel(systemId: string): string
  export function ownedPlanets(state: GameState, seat: Seat): Planet[]
  export function readyInfluence(state: GameState, seat: Seat): number
  ```
- `src/ui/hud/ActionBar.tsx`
  ```ts
  export type ActionMode = 'tactical' | 'strategic' | 'component' | null
  export interface ActionBarProps { mode: ActionMode; onMode: (mode: ActionMode) => void; hint: string; onLog: () => void }
  ```
  Every button's `disabled` comes from `legalMoves`: `startTactical` for "Tactical action", `strategic` for "Strategic action", `research`/`shipyard`/`tradePost` for "Component action", `pass` for "Pass", `canUndo` for "Undo".

- [ ] **Step 1: Write the failing HUD test**

```tsx
// src/ui/hud/Hud.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, withPlayer } from '../../engine/testUtils'
import { renderWithSession } from '../test/harness'
import { BoardScreen } from '../screens/BoardScreen'

describe('the HUD', () => {
  it('shows both players with their faction, clock and turn state', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('player-0').textContent).toContain('L1Z1X Mindnet')
    expect(screen.getByTestId('player-1').textContent).toContain('Barony of Letnev')
    expect(screen.getByTestId('clock-0').textContent).toBe('15:00')
    expect(screen.getByTestId('turn-0').textContent).toBe('Your turn')
    expect(screen.getByTestId('turn-1').textContent).toBe('Waiting')
    expect(screen.getByTestId('speaker-0')).toBeTruthy()
    expect(screen.queryByTestId('speaker-1')).toBeNull()
  })

  it('R3.1: the strategy strip shows who holds each card and what it is worth', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('strategy-state-warfare').textContent).toBe('A, ready')
    expect(screen.getByTestId('strategy-state-leadership').textContent).toBe('B, ready')
    expect(screen.getByTestId('strategy-state-trade').textContent).toBe('+1 trade good')
    expect(screen.getByTestId('strategy-card-technology').className).toContain('own-0')
  })

  it('R7: the objectives strip lists the revealed objectives and the Mandate', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('objective-own_3_techs').textContent).toContain('Own 3 technologies')
    expect(screen.queryByTestId('objective-control_5_planets')).toBeNull()
    expect(screen.getByTestId('mandate').textContent).toContain('First Strike')
  })

  it('shows victory points, command tokens, planets, economy, technologies and forces', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('vp-0').textContent).toBe('0 of 7')
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('3')
    expect(screen.getByTestId('tokens-0-fleet').textContent).toBe('3')
    expect(screen.getByTestId('tokens-0-strategy').textContent).toBe('2')
    expect(screen.getByTestId('planet-0-000').textContent).toContain('[0.0.0]')
    expect(screen.getByTestId('economy-0-resources').textContent).toBe('5')
    expect(screen.getByTestId('economy-0-influence').textContent).toBe('0')
    expect(screen.getByTestId('economy-0-commodities').textContent).toBe('2 of 2')
    expect(screen.getByTestId('tech-0-neural_motivator').textContent).toBe('Neural Motivator')
    expect(screen.getByTestId('forces-0-dreadnought').textContent).toBe('1 Super-Dreadnought I')
    expect(screen.getByTestId('forces-0-infantry').textContent).toBe('5 Infantry I')
    expect(screen.getByTestId('forces-1-destroyer').textContent).toBe('1 Destroyer I')
  })

  it('R3.2: the action bar enables exactly the actions the engine offers', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('btn-tactical').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('btn-strategic').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('btn-component').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('btn-pass').hasAttribute('disabled')).toBe(true)   // two unused cards
    expect(screen.getByTestId('btn-undo').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('btn-tactical'))
    expect(screen.getByTestId('hint').textContent).toBe('Tactical action. Choose a system to activate.')
  })

  it('R3.2: a player without a tactic token cannot start a tactical action', () => {
    const broke = withPlayer(toActionPhase(), 0, { tokens: { tactic: 0, fleet: 3, strategy: 2 } })
    renderWithSession(broke, <BoardScreen />)
    expect(screen.getByTestId('btn-tactical').hasAttribute('disabled')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails, then commit it**

Run: `npm test -- src/ui/hud`
Expected: FAIL, `src/ui/hud/Hud.test.tsx` imports components that do not exist.

```bash
git add src/ui/hud/Hud.test.tsx
git commit -m "test(ui): top bar, side panels and the action bar"
```

- [ ] **Step 3: Implement the formatting helpers**

```ts
// src/ui/format.ts
import { systemDef } from '../data/map'
import { techDef } from '../data/techs'
import { UPGRADE_TECH } from '../data/units'
import type { GameState, Planet, Player, Seat, StrategyCardId, UnitType } from '../engine/types'

export const CARD_NAME: Record<StrategyCardId, string> = {
  leadership: 'Leadership', diplomacy: 'Diplomacy', trade: 'Trade',
  warfare: 'Warfare', technology: 'Technology', imperial: 'Imperial',
}

const UNIT_NAME: Record<UnitType, string> = {
  infantry: 'Infantry', fighter: 'Fighter', destroyer: 'Destroyer', cruiser: 'Cruiser',
  carrier: 'Carrier', dreadnought: 'Dreadnought', warsun: 'War Sun', flagship: 'Flagship',
  pds: 'PDS', spacedock: 'Space dock',
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** R5: the label follows the owner's technologies, so an upgraded unit reads II. */
export function unitLabel(type: UnitType, player: Player): string {
  if (type === 'flagship') return player.faction === 'l1z1x' ? 'Flagship [0.0.1]' : 'Flagship Arc Secundus'
  if (type === 'dreadnought' && player.faction === 'l1z1x') {
    return player.techs.includes('super_dreadnought_ii') ? 'Super-Dreadnought II' : 'Super-Dreadnought I'
  }
  const upgrade = UPGRADE_TECH[type]
  const two = upgrade !== undefined && player.techs.includes(upgrade)
  if (type === 'pds') return 'PDS'
  if (type === 'spacedock') return two ? 'Space dock II' : 'Space dock'
  return two ? `${UNIT_NAME[type]} II` : `${UNIT_NAME[type]} I`
}

export function techLabel(techId: string): string {
  return techDef(techId).name
}

export function planetLabel(state: GameState, planetId: string): string {
  for (const sys of Object.values(state.systems)) {
    const planet = sys.planets.find(p => p.id === planetId)
    if (planet) return planet.name
  }
  return planetId
}

export function systemLabel(systemId: string): string {
  return systemDef(systemId).name
}

export function ownedPlanets(state: GameState, seat: Seat): Planet[] {
  return Object.values(state.systems).flatMap(sys => sys.planets.filter(p => p.owner === seat))
}

export function readyInfluence(state: GameState, seat: Seat): number {
  return ownedPlanets(state, seat).reduce((sum, p) => p.exhausted ? sum : sum + p.influence, 0)
}
```

- [ ] **Step 4: Implement the top bar**

```tsx
// src/ui/hud/TopBar.tsx
import { FACTIONS } from '../../data/factions'
import { MANDATE, PUBLIC_OBJECTIVES } from '../../data/objectives'
import { cardOwner } from '../../engine'
import { MISC, PORTRAIT, SIGIL, strategyCardUrl, tokenUrl } from '../art'
import { CARD_NAME, formatClock } from '../format'
import type { GameState, Seat, StrategyCardId } from '../../engine/types'

const ALL_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'trade', 'warfare', 'technology', 'imperial']

function PlayerBlock({ state, seat, clockMs }: { state: GameState; seat: Seat; clockMs: number }) {
  const player = state.players[seat]
  const active = state.active === seat && state.winner === null
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
          <small>{active && state.phase === 'action' ? 'running' : 'paused'}</small>
        </div>
        <div className="runbar"><i style={{ width: `${Math.round(Math.min(1, clockMs / 900000) * 100)}%` }} /></div>
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
      {ALL_CARDS.map(card => {
        const pool = state.strategyPool.find(c => c.id === card)
        const owner = cardOwner(state, card)
        const entry = owner === null ? undefined : state.players[owner].strategyCards.find(c => c.id === card)
        const label = pool
          ? pool.bonus > 0 ? `+${pool.bonus} trade good${pool.bonus > 1 ? 's' : ''}` : 'Unpicked'
          : owner === null ? 'Returned' : `${state.players[owner].name}, ${entry?.used ? 'played' : 'ready'}`
        const pickable = pool !== undefined && onPick !== undefined
        return (
          <button
            key={card} type="button" disabled={!pickable}
            className={`sc${owner === null ? '' : ` own-${owner}`}${entry?.used ? ' played' : ''}${pickable ? ' pick' : ''}`}
            data-testid={`strategy-card-${card}`}
            onClick={pickable ? () => onPick(card) : undefined}
          >
            <span className="card"><img src={strategyCardUrl(card)} alt={CARD_NAME[card]} /></span>
            <span className="st" data-testid={`strategy-state-${card}`}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Objectives({ state }: { state: GameState }) {
  return (
    <div className="objs">
      <div><span className="tab">Objectives</span></div>
      <div className="objrow">
        {state.publicObjectives.map(id => {
          const def = PUBLIC_OBJECTIVES.find(o => o.id === id)
          if (!def) return null
          return (
            <div className="obj" key={id} data-testid={`objective-${id}`} style={{ ['--bg' as string]: `url(${MISC.objectiveBack})` }}>
              <div className="tier">Round {def.round}</div>
              <div className="txt">{def.text}</div>
              {([0, 1] as Seat[]).filter(seat => state.players[seat].scoredObjectives.includes(id)).map(seat => (
                <img key={seat} className={`tok s${seat}`} src={tokenUrl(state.players[seat].faction, 'control')} alt="scored"
                  data-testid={`scored-${id}-${seat}`} />
              ))}
            </div>
          )
        })}
        <div className="obj mandate" data-testid="mandate" style={{ ['--bg' as string]: `url(${MISC.mandateBack})` }}>
          <div className="tier">Mandate</div>
          <div className="txt">First Strike</div>
          {([0, 1] as Seat[]).filter(seat => state.players[seat].mandateScored).map(seat => (
            <img key={seat} className={`tok s${seat}`} src={tokenUrl(state.players[seat].faction, 'control')} alt="scored" />
          ))}
        </div>
        <div className="mtext">{MANDATE.text}</div>
      </div>
    </div>
  )
}

export function TopBar({ state, clockMs, onPick }: { state: GameState; clockMs: [number, number]; onPick?: (card: StrategyCardId) => void }) {
  return (
    <div className="topbar">
      <PlayerBlock state={state} seat={0} clockMs={clockMs[0]} />
      <StrategyStrip state={state} onPick={onPick} />
      <Objectives state={state} />
      <PlayerBlock state={state} seat={1} clockMs={clockMs[1]} />
    </div>
  )
}
```

- [ ] **Step 5: Implement the side panels and the action bar**

```tsx
// src/ui/hud/SidePanel.tsx
import { techDef } from '../../data/techs'
import { fleetPoolLimit, readyResources, unitsOf } from '../../engine'
import { BADGE, MISC, spriteUrl, tokenUrl } from '../art'
import { ownedPlanets, readyInfluence, unitLabel } from '../format'
import { PANEL_SCALE, spriteSize } from '../sprites'
import type { GameState, Seat, UnitType } from '../../engine/types'

const POOLS = ['tactic', 'fleet', 'strategy'] as const
const FORCE_ORDER: UnitType[] = ['flagship', 'warsun', 'dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'pds', 'spacedock']

export function SidePanel({ state, seat }: { state: GameState; seat: Seat }) {
  const player = state.players[seat]
  const planets = ownedPlanets(state, seat)
  const counts = new Map<UnitType, number>()
  for (const unit of unitsOf(state, seat)) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
  return (
    <div className={`${seat === 0 ? 'colL' : 'colR'} cut`} data-testid={`panel-${seat}`}>
      <div className="in pcontent">
        <div className="sec">
          <span className="lbl bul">Victory points <span data-testid={`vp-${seat}`}>{player.vp} of 7</span></span>
          <div className="vp">
            {[1, 2, 3, 4, 5, 6, 7].map(n => <i key={n} className={n <= player.vp ? 'on' : ''} data-n={n} />)}
          </div>
        </div>
        <div className="sec">
          <span className="lbl bul">Command tokens</span>
          <div className="slots">
            {POOLS.map(pool => (
              <div className="slot" key={pool}>
                <div className="stack">
                  {Array.from({ length: Math.min(3, player.tokens[pool]) }, (_, i) => (
                    <img key={i} src={tokenUrl(player.faction, pool === 'fleet' ? 'command-fleet' : 'command')} alt="" style={{ top: i * 5 }} />
                  ))}
                </div>
                <div className="cap">{pool}<b data-testid={`tokens-${seat}-${pool}`}>{player.tokens[pool]}</b></div>
              </div>
            ))}
          </div>
          <div className="tot"><span className="k">Fleet pool</span>{fleetPoolLimit(player)} ships per system</div>
        </div>
        <div className="sec">
          <span className="lbl bul">Planets</span>
          <div className="planets">
            {planets.map(planet => (
              <div className={`pl${planet.exhausted ? ' exh' : ''}`} key={planet.id} data-testid={`planet-${seat}-${planet.id}`}>
                <div className="n">{planet.name}</div>
                <div className="v">
                  <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
                  <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="tot">
            <span className="k">Ready</span>
            <span data-testid={`economy-${seat}-resources`}>{readyResources(state, seat)}</span> resources
            <span data-testid={`economy-${seat}-influence`}>{readyInfluence(state, seat)}</span> influence
          </div>
          <div className="tot">
            <span className="k">Trade goods</span><img src={MISC.tradeGood} alt="" />
            <b data-testid={`economy-${seat}-tradegoods`}>{player.tradeGoods}</b>
          </div>
          <div className="tot">
            <span className="k">Commodities</span><img src={MISC.commodity} alt="" />
            <b data-testid={`economy-${seat}-commodities`}>{player.commodities} of 2</b>
          </div>
        </div>
        <div className="sec">
          <span className="lbl bul">Technologies</span>
          {player.techs.map(id => (
            <div className="techrow" key={id}>
              <span className={`tdot ${techDef(id).colour ?? 'none'}`} />
              <span data-testid={`tech-${seat}-${id}`}>{techDef(id).name}</span>
            </div>
          ))}
        </div>
        <div className="sec">
          <span className="lbl bul">Forces</span>
          <div className="forces">
            {FORCE_ORDER.filter(type => counts.has(type)).map(type => {
              const size = spriteSize(type, PANEL_SCALE)
              return (
                <div className="fc" key={type} data-testid={`forces-${seat}-${type}`}>
                  <img src={spriteUrl(player.color, type)} alt="" width={size.width} height={size.height} />
                  <b>{counts.get(type)}</b>
                  <span className="n">{unitLabel(type, player)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
```

```tsx
// src/ui/hud/ActionBar.tsx
import { useGame } from '../store'

export type ActionMode = 'tactical' | 'strategic' | 'component' | null

export interface ActionBarProps {
  mode: ActionMode
  onMode: (mode: ActionMode) => void
  hint: string
  onLog: () => void
}

export function ActionBar({ mode, onMode, hint, onLog }: ActionBarProps) {
  const { session, legal, apply, canUndo, undo } = useGame()
  if (!session) return null
  const state = session.state
  const can = {
    tactical: legal.some(m => m.type === 'startTactical'),
    strategic: legal.some(m => m.type === 'strategic'),
    component: legal.some(m => m.type === 'research' || m.type === 'shipyard' || m.type === 'tradePost'),
    pass: legal.some(m => m.type === 'pass'),
  }
  return (
    <div className="bottombar">
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn quiet" data-testid="btn-undo" disabled={!canUndo} onClick={undo}>Undo</button>
        <button type="button" className="btn quiet" data-testid="btn-log" onClick={onLog}>Log</button>
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
      </div>
      <div className="hintbox">
        <div className="h" data-testid="hint">{hint}</div>
        <div className="r" data-testid="round">Round {state.round} of 6, {state.phase} phase</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Compose the board screen**

```tsx
// src/ui/screens/BoardScreen.tsx
import { useState } from 'react'
import { BoardMap } from '../board/BoardMap'
import { ActionBar } from '../hud/ActionBar'
import type { ActionMode } from '../hud/ActionBar'
import { SidePanel } from '../hud/SidePanel'
import { TopBar } from '../hud/TopBar'
import { useGame } from '../store'
import type { StrategyCardId } from '../../engine/types'

const HINTS: Record<string, string> = {
  tactical: 'Tactical action. Choose a system to activate.',
  strategic: 'Strategic action. Choose one of your ready strategy cards.',
  component: 'Component action. Choose one of the offered actions.',
  strategy: 'Strategy phase. Choose a strategy card.',
  status: 'Status phase. Distribute your new command tokens.',
  idle: 'Choose an action.',
}

export function BoardScreen() {
  const { session, legal, apply } = useGame()
  const [mode, setMode] = useState<ActionMode>(null)
  const [showLog, setShowLog] = useState(false)
  if (!session) return null
  const state = session.state
  const drafting = state.phase === 'strategy'
  const onPick = drafting ? (card: StrategyCardId) => { apply({ type: 'pickStrategyCard', card }) } : undefined
  const selectable = mode === 'tactical'
    ? legal.flatMap(m => m.type === 'startTactical' ? [m.systemId] : [])
    : []
  const hint = drafting ? HINTS.strategy : state.phase === 'status' ? HINTS.status : HINTS[mode ?? 'idle']
  return (
    <div className="app" data-testid="board-screen">
      <div className="space"><div className="stars" /><div className="neb" /><div className="swirl" /><div className="limb" /><div className="dust" /></div>
      <TopBar state={state} clockMs={session.clockMs} onPick={onPick} />
      <SidePanel state={state} seat={0} />
      <SidePanel state={state} seat={1} />
      <BoardMap
        state={state}
        activeSystemId={state.tactical?.systemId ?? null}
        selectable={selectable}
        onSelect={systemId => { if (apply({ type: 'startTactical', systemId })) setMode(null) }}
      />
      <ActionBar mode={mode} onMode={setMode} hint={hint} onLog={() => setShowLog(!showLog)} />
    </div>
  )
}
```

- [ ] **Step 7: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 6 new tests.

```bash
git add src/ui/format.ts src/ui/hud src/ui/screens/BoardScreen.tsx
git commit -m "feat(ui): top bar, player panels and an action bar driven by legalMoves"
```

---

### Task 4a: Tactical flows, activation to production

**Files:**
- Create: `src/ui/moveOptions.ts`
- Create: `src/ui/flows/Stepper.tsx`, `src/ui/flows/PayRow.tsx`
- Create: `src/ui/flows/MovementPanel.tsx`, `src/ui/flows/CombatDialog.tsx`, `src/ui/flows/InvasionPanel.tsx`, `src/ui/flows/ProduceDrawer.tsx`
- Modify: `src/ui/history.ts` (add `lastRolls`), `src/ui/screens/BoardScreen.tsx`
- Test: `src/ui/flows/Tactical.test.tsx`

**Interfaces:**
- `src/ui/moveOptions.ts` reads the enumerated moves and nothing else:
  ```ts
  export function hasMove(legal: Move[], type: Move['type']): boolean
  export function activatable(legal: Move[]): string[]
  export function retreatTargetsOf(legal: Move[]): string[]
  export function bombardTargets(legal: Move[]): string[]
  export function landTargets(legal: Move[]): { planetId: string; infantryIds: number[] }[]
  export function munitionsOptions(legal: Move[]): { attacker: boolean; defender: boolean }
  export function strategicCards(legal: Move[]): StrategyCardId[]
  export function strategicVariants(legal: Move[], card: StrategyCardId): StrategicParams[]
  export function secondaryOffer(legal: Move[]): { accept: StrategicParams | null; card: StrategyCardId | null }
  export function inheritanceTechIds(legal: Move[]): string[]
  export function shipyardOffers(legal: Move[]): { planetId: string; planets: string[]; tradeGoods: number }[]
  export function tradePostOffers(legal: Move[]): { post: 'west' | 'east'; commodities: number }[]
  export function statusTemplate(legal: Move[]): StatusParams | null
  ```
- Cargo is chosen per origin system, not per ship: the panel collects "how many fighters and infantry leave [0.0.0]" and fills the selected ships of that origin up to their printed capacity in order. That keeps the control readable and the resulting `moveShips` legal, and the engine still has the last word.

- [ ] **Step 1: Write the failing tactical test**

```tsx
// src/ui/flows/Tactical.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, withPlayer, withTactical, withUnits } from '../../engine/testUtils'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function activate(systemId: string) {
  fireEvent.click(screen.getByTestId('btn-tactical'))
  fireEvent.click(screen.getByTestId(`tile-${systemId}`))
}

describe('the tactical action', () => {
  it('R3.2 step 1: activation spends a tactic token and opens the movement step', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    activate('bereg')
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('2')
    expect(screen.getByTestId('tile-bereg').className).toContain('active')
    expect(screen.getByTestId('movement-panel')).toBeTruthy()
  })

  it('R3.2 step 2: moves a carrier with fighters and infantry into the active system', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    activate('bereg')
    fireEvent.click(screen.getByLabelText('Carrier I from [0.0.0]'))
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('cargo-home-n-fighter-plus'))
    fireEvent.click(screen.getByTestId('cargo-home-n-infantry-plus'))
    expect(screen.getByTestId('cargo-home-n-fighter').textContent).toBe('3')
    expect(screen.getByTestId('cargo-home-n-infantry-plus').hasAttribute('disabled')).toBe(true)  // capacity 4 is full
    fireEvent.click(screen.getByTestId('btn-move-ships'))
    expect(screen.getByTestId('stack-bereg-0-carrier')).toBeTruthy()
    expect(screen.getByTestId('stack-bereg-0-fighter').textContent).toBe('3')
    expect(screen.queryByTestId('stack-home-n-0-fighter')).toBeNull()
  })

  it('R4.3: lands infantry on an empty planet and takes control of it', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    activate('bereg')
    fireEvent.click(screen.getByLabelText('Carrier I from [0.0.0]'))
    fireEvent.click(screen.getByTestId('cargo-home-n-infantry-plus'))
    fireEvent.click(screen.getByTestId('btn-move-ships'))
    fireEvent.click(screen.getByTestId('btn-end-movement'))
    expect(screen.getByTestId('invasion-panel')).toBeTruthy()
    expect(screen.getByTestId('land-count-bereg').textContent).toBe('1')
    fireEvent.click(screen.getByTestId('btn-land-bereg'))
    expect(screen.getByTestId('control-bereg')).toBeTruthy()
    expect(screen.getByTestId('planet-0-bereg')).toBeTruthy()
    fireEvent.click(screen.getByTestId('btn-end-invasion'))
    expect(screen.getByTestId('btn-end-tactical')).toBeTruthy()
  })

  it('R4.4: produces at the space dock, pays with a planet and exhausts it', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    activate('home-n')
    fireEvent.click(screen.getByTestId('btn-end-movement'))
    fireEvent.click(screen.getByTestId('btn-end-invasion'))
    expect(screen.getByTestId('produce-drawer')).toBeTruthy()
    expect(screen.getByTestId('produce-limit').textContent).toBe('7')
    fireEvent.click(screen.getByTestId('step-infantry-plus'))
    fireEvent.click(screen.getByTestId('step-infantry-plus'))
    expect(screen.getByTestId('step-infantry').textContent).toBe('2')
    expect(screen.getByTestId('produce-cost').textContent).toBe('1')
    expect(screen.getByTestId('btn-produce').hasAttribute('disabled')).toBe(true)   // nothing paid yet
    fireEvent.click(screen.getByTestId('pay-000'))
    fireEvent.click(screen.getByTestId('btn-produce'))
    expect(screen.getByTestId('forces-0-infantry').textContent).toBe('7 Infantry I')
    expect(screen.getByTestId('planet-0-000').className).toContain('exh')
  })

  it('R4.1: the combat dialog fights rounds and offers Munitions Reserves from round 1', () => {
    let s = withUnits(toActionPhase(), 'bereg', 0, ['cruiser'])
    s = withUnits(s, 'bereg', 1, ['cruiser'])
    s = withPlayer(s, 1, { tradeGoods: 2 })
    s = withTactical(s, {
      systemId: 'bereg', step: 'spaceCombat',
      combat: { round: 0, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [] },
    })
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('combat-round').textContent).toBe('Round 0')
    expect(screen.queryByTestId('munitions-defender')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-combat-round'))
    expect(screen.getByTestId('combat-round').textContent).toBe('Round 1')
    expect(screen.getByTestId('munitions-defender')).toBeTruthy()
    expect(screen.queryByTestId('munitions-attacker')).toBeNull()               // L1Z1X has no Munitions Reserves
  })

  it('R4.3: bombardment is offered against a defended planet', () => {
    let s = withUnits(toActionPhase(), 'bereg', 0, ['dreadnought'])
    s = withUnits(s, 'bereg', 1, ['infantry'], 'bereg')
    s = withTactical(s, { systemId: 'bereg', step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 } })
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('btn-bombard-bereg')).toBeTruthy()
    expect(screen.queryByTestId('btn-land-bereg')).toBeNull()                   // no infantry in space
  })
})
```

- [ ] **Step 2: Run the test to verify it fails, then commit it**

Run: `npm test -- src/ui/flows`
Expected: FAIL, the flow components do not exist.

```bash
git add src/ui/flows/Tactical.test.tsx
git commit -m "test(ui): tactical action flows from activation to production"
```

- [ ] **Step 3: Read the enumerated moves**

```ts
// src/ui/moveOptions.ts
import type { Move, StatusParams, StrategicParams, StrategyCardId } from '../engine/types'

export function hasMove(legal: Move[], type: Move['type']): boolean {
  return legal.some(m => m.type === type)
}

export function activatable(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'startTactical' ? [m.systemId] : [])
}

export function retreatTargetsOf(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'retreat' ? [m.to] : [])
}

export function bombardTargets(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'bombard' ? [m.planetId] : [])
}

export function landTargets(legal: Move[]): { planetId: string; infantryIds: number[] }[] {
  return legal.flatMap(m => m.type === 'land' ? [{ planetId: m.planetId, infantryIds: m.infantryIds }] : [])
}

/** R4.1 step 6: the enumerator offers one variant per side, so the checkboxes follow it exactly. */
export function munitionsOptions(legal: Move[]): { attacker: boolean; defender: boolean } {
  let attacker = false
  let defender = false
  for (const move of legal) {
    if (move.type !== 'combatRound' || !move.munitions) continue
    if (move.munitions.attacker) attacker = true
    if (move.munitions.defender) defender = true
  }
  return { attacker, defender }
}

export function strategicCards(legal: Move[]): StrategyCardId[] {
  const cards: StrategyCardId[] = []
  for (const move of legal) {
    if (move.type === 'strategic' && !cards.includes(move.card)) cards.push(move.card)
  }
  return cards
}

/** Every parameter set the enumerator offers for one card; the dialog edits one of them. */
export function strategicVariants(legal: Move[], card: StrategyCardId): StrategicParams[] {
  return legal.flatMap(m => m.type === 'strategic' && m.card === card ? [m.params ?? {}] : [])
}

export function secondaryOffer(legal: Move[]): { accept: StrategicParams | null; card: StrategyCardId | null } {
  let card: StrategyCardId | null = null
  let accept: StrategicParams | null = null
  for (const move of legal) {
    if (move.type !== 'secondary') continue
    card = move.card
    if (move.accept) accept = move.params ?? {}
  }
  return { accept, card }
}

export function inheritanceTechIds(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'research' ? [m.techId] : [])
}

export function shipyardOffers(legal: Move[]): { planetId: string; planets: string[]; tradeGoods: number }[] {
  return legal.flatMap(m => m.type === 'shipyard' ? [{ planetId: m.planetId, planets: m.planets, tradeGoods: m.tradeGoods }] : [])
}

export function tradePostOffers(legal: Move[]): { post: 'west' | 'east'; commodities: number }[] {
  return legal.flatMap(m => m.type === 'tradePost' ? [{ post: m.post, commodities: m.commodities }] : [])
}

export function statusTemplate(legal: Move[]): StatusParams | null {
  for (const move of legal) if (move.type === 'status') return move.params
  return null
}
```

Add to `src/ui/history.ts`:

```ts
import type { LogEntry } from '../engine/types'

/** The dice of the last move: the trailing run of roll entries in the log. */
export function lastRolls(state: GameState): Extract<LogEntry, { t: 'roll' }>[] {
  const out: Extract<LogEntry, { t: 'roll' }>[] = []
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i]
    if (entry.t === 'roll') out.unshift(entry)
    else if (entry.t === 'move') break
  }
  return out
}
```

```bash
git add src/ui/moveOptions.ts src/ui/history.ts
git commit -m "feat(ui): readers for the enumerated moves and the dice of the last move"
```

- [ ] **Step 4: Implement the shared stepper and payment row**

```tsx
// src/ui/flows/Stepper.tsx
export interface StepperProps {
  id: string
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
}

export function Stepper({ id, value, min = 0, max, onChange }: StepperProps) {
  return (
    <div className="step">
      <button type="button" data-testid={`${id}-minus`} disabled={value <= min} onClick={() => onChange(value - 1)}>-</button>
      <b data-testid={id}>{value}</b>
      <button type="button" data-testid={`${id}-plus`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}
```

```tsx
// src/ui/flows/PayRow.tsx
import { MISC } from '../art'
import { ownedPlanets } from '../format'
import { Stepper } from './Stepper'
import type { GameState, Seat } from '../../engine/types'

export interface PayRowProps {
  state: GameState
  seat: Seat
  unit?: 'resources' | 'influence'
  needed: number
  planets: string[]
  onPlanets: (planets: string[]) => void
  tradeGoods: number
  onTradeGoods: (n: number) => void
}

/** R4.4 and R5: exhaust ready planets and spend trade goods; overpay is lost, which the line spells out. */
export function PayRow({ state, seat, unit = 'resources', needed, planets, onPlanets, tradeGoods, onTradeGoods }: PayRowProps) {
  const owned = ownedPlanets(state, seat)
  const value = (planetId: string) => {
    const planet = owned.find(p => p.id === planetId)
    if (!planet) return 0
    return unit === 'resources' ? planet.resources : planet.influence
  }
  const paid = planets.reduce((sum, id) => sum + value(id), 0) + tradeGoods
  return (
    <div className="payrow" data-testid="payrow">
      <span className="lbl">Pay with</span>
      {owned.map(planet => (
        <button
          key={planet.id} type="button" disabled={planet.exhausted}
          className={`pay${planets.includes(planet.id) ? ' on' : ''}`} data-testid={`pay-${planet.id}`}
          onClick={() => onPlanets(planets.includes(planet.id) ? planets.filter(id => id !== planet.id) : [...planets, planet.id])}
        >
          {planet.name} {unit === 'resources' ? planet.resources : planet.influence}
        </button>
      ))}
      <span className="pay">
        <img src={MISC.tradeGood} alt="" width={16} height={16} />
        <Stepper id="pay-tradegoods" value={tradeGoods} max={state.players[seat].tradeGoods} onChange={onTradeGoods} />
      </span>
      <span className="sub" data-testid="pay-total">{paid} of {needed}</span>
    </div>
  )
}
```

- [ ] **Step 5: Implement the movement panel**

```tsx
// src/ui/flows/MovementPanel.tsx
import { useState } from 'react'
import { unitStats } from '../../data/units'
import { movableShips } from '../../engine'
import { systemLabel, unitLabel } from '../format'
import { Stepper } from './Stepper'
import { useGame } from '../store'
import type { GameState, Seat, Unit } from '../../engine/types'

interface Cargo { fighter: number; infantry: number }

function shipsAt(state: GameState, from: string, ids: number[]): Unit[] {
  return state.systems[from].space.filter(u => ids.includes(u.id))
}

function availableCargo(state: GameState, seat: Seat, from: string): { fighter: Unit[]; infantry: Unit[] } {
  const sys = state.systems[from]
  return {
    fighter: sys.space.filter(u => u.owner === seat && u.type === 'fighter'),
    infantry: [
      ...sys.space.filter(u => u.owner === seat && u.type === 'infantry'),
      ...sys.planets.flatMap(p => p.ground.filter(u => u.owner === seat)),
    ],
  }
}

export function MovementPanel() {
  const { session, legal, apply } = useGame()
  const [picked, setPicked] = useState<number[]>([])
  const [cargo, setCargo] = useState<Record<string, Cargo>>({})
  if (!session) return null
  const state = session.state
  const seat = state.active
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  const options = movableShips(state, seat)
  const origins = [...new Set(options.map(o => o.from))]
  const capacityOf = (from: string) => shipsAt(state, from, picked).reduce((sum, u) => sum + unitStats(u.type, stats).capacity, 0)
  const cargoOf = (from: string) => cargo[from] ?? { fighter: 0, infantry: 0 }

  function toggle(unitId: number) {
    setPicked(picked.includes(unitId) ? picked.filter(id => id !== unitId) : [...picked, unitId])
  }

  function submit() {
    const used = new Set<number>()
    const moves = origins.flatMap(from => {
      const here = shipsAt(state, from, picked)
      const want = cargoOf(from)
      const pool = availableCargo(state, seat, from)
      const queue = [
        ...pool.fighter.slice(0, want.fighter).map(u => u.id),
        ...pool.infantry.slice(0, want.infantry).map(u => u.id),
      ]
      return here.map(ship => {
        const room = unitStats(ship.type, stats).capacity
        const carrying: number[] = []
        while (carrying.length < room && queue.length > 0) {
          const id = queue.shift()
          if (id !== undefined && !used.has(id)) {
            used.add(id)
            carrying.push(id)
          }
        }
        return { unitId: ship.id, from, carrying }
      })
    })
    if (moves.length === 0) return
    if (apply({ type: 'moveShips', moves })) {
      setPicked([])
      setCargo({})
    }
  }

  return (
    <div className="drawer bottom cut" data-testid="movement-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Movement into {systemLabel(state.tactical?.systemId ?? '')}</span>
          <span className="sub">Pick the ships that move, then how much they carry.</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-move-ships" disabled={picked.length === 0} onClick={submit}>Move ships</button>
            <button type="button" className="btn quiet" data-testid="btn-end-movement"
              disabled={!legal.some(m => m.type === 'endMovement')} onClick={() => apply({ type: 'endMovement' })}>Done moving</button>
          </div>
        </div>
        {origins.length === 0 ? <div className="sub">No ships can reach this system.</div> : null}
        {origins.map(from => {
          const pool = availableCargo(state, seat, from)
          const want = cargoOf(from)
          const room = capacityOf(from)
          return (
            <div className="rowline" key={from} data-testid={`origin-${from}`}>
              <span className="lbl">{systemLabel(from)}</span>
              {options.filter(o => o.from === from).map(option => {
                const ship = state.systems[from].space.find(u => u.id === option.unitId)
                if (!ship) return null
                const label = `${unitLabel(ship.type, player)} from ${systemLabel(from)}`
                return (
                  <label key={option.unitId} className="pay">
                    <input type="checkbox" aria-label={label} checked={picked.includes(option.unitId)} onChange={() => toggle(option.unitId)} />
                    {unitLabel(ship.type, player)}
                  </label>
                )
              })}
              <span className="lbl">Fighters</span>
              <Stepper id={`cargo-${from}-fighter`} value={want.fighter}
                max={Math.min(pool.fighter.length, room - want.infantry)}
                onChange={n => setCargo({ ...cargo, [from]: { ...want, fighter: n } })} />
              <span className="lbl">Infantry</span>
              <Stepper id={`cargo-${from}-infantry`} value={want.infantry}
                max={Math.min(pool.infantry.length, room - want.fighter)}
                onChange={n => setCargo({ ...cargo, [from]: { ...want, infantry: n } })} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement the combat dialog and the invasion panel**

```tsx
// src/ui/flows/CombatDialog.tsx
import { useState } from 'react'
import { lastRolls } from '../history'
import { munitionsOptions, retreatTargetsOf } from '../moveOptions'
import { systemLabel } from '../format'
import { useGame } from '../store'
import type { Owner } from '../../engine/types'

export function CombatDialog() {
  const { session, legal, apply } = useGame()
  const [attacker, setAttacker] = useState(false)
  const [defender, setDefender] = useState(false)
  if (!session) return null
  const state = session.state
  const combat = state.tactical?.combat
  if (!combat) return null
  const allowed = munitionsOptions(legal)
  const retreats = retreatTargetsOf(legal)
  const name = (owner: Owner) => owner === 'guardian' ? 'Guardian fleet' : state.players[owner].name
  const munitions = (attacker && allowed.attacker) || (defender && allowed.defender)
    ? { attacker: attacker && allowed.attacker, defender: defender && allowed.defender }
    : undefined
  return (
    <div className="dialog cut" data-testid="combat-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Space combat in {systemLabel(state.tactical?.systemId ?? '')}</span>
          <span className="sub" data-testid="combat-round">Round {combat.round}</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-combat-round"
              disabled={!legal.some(m => m.type === 'combatRound')}
              onClick={() => { apply({ type: 'combatRound', munitions }); setAttacker(false); setDefender(false) }}>
              {combat.round === 0 ? 'Open fire' : `Fight round ${combat.round}`}
            </button>
          </div>
        </div>
        <div className="rowline">
          <span className="lbl">{name(combat.attacker)} attacks {name(combat.defender)}</span>
          {allowed.attacker ? (
            <label className="pay">
              <input type="checkbox" data-testid="munitions-attacker" checked={attacker} onChange={e => setAttacker(e.target.checked)} />
              Munitions Reserves, attacker
            </label>
          ) : null}
          {allowed.defender ? (
            <label className="pay">
              <input type="checkbox" data-testid="munitions-defender" checked={defender} onChange={e => setDefender(e.target.checked)} />
              Munitions Reserves, defender
            </label>
          ) : null}
        </div>
        {lastRolls(state).map((entry, i) => (
          <div className="logline roll" key={i} data-testid={`combat-rolls-${i}`}>
            {name(entry.owner)}: {entry.rolls.map(r => `${r.value}${r.hit ? ' hit' : ''}`).join(', ') || 'no dice'} ({entry.context})
          </div>
        ))}
        {combat.retreating !== null ? (
          <div className="rowline" data-testid="retreat-announced">Retreat announced to {systemLabel(combat.retreatTo ?? '')}</div>
        ) : (
          <div className="rowline">
            {retreats.map(to => (
              <button key={to} type="button" className="btn quiet" data-testid={`btn-retreat-${to}`} onClick={() => apply({ type: 'retreat', to })}>
                Retreat to {systemLabel(to)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

```tsx
// src/ui/flows/InvasionPanel.tsx
import { useState } from 'react'
import { bombardTargets, landTargets } from '../moveOptions'
import { planetLabel } from '../format'
import { Stepper } from './Stepper'
import { useGame } from '../store'

export function InvasionPanel() {
  const { session, legal, apply } = useGame()
  const [counts, setCounts] = useState<Record<string, number>>({})
  if (!session) return null
  const state = session.state
  const landings = landTargets(legal)
  const bombards = bombardTargets(legal)
  const countOf = (planetId: string, max: number) => counts[planetId] ?? max
  return (
    <div className="drawer bottom cut" data-testid="invasion-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Invasion</span>
          <span className="sub">Bombard, then land your infantry and fight it out.</span>
          <div className="right">
            {legal.some(m => m.type === 'groundCombatRound') ? (
              <button type="button" className="btn gold" data-testid="btn-ground-round" onClick={() => apply({ type: 'groundCombatRound' })}>
                Ground combat round
              </button>
            ) : null}
            <button type="button" className="btn quiet" data-testid="btn-end-invasion"
              disabled={!legal.some(m => m.type === 'endInvasion')} onClick={() => apply({ type: 'endInvasion' })}>Done invading</button>
          </div>
        </div>
        <div className="rowline">
          {bombards.map(planetId => (
            <button key={planetId} type="button" className="btn quiet" data-testid={`btn-bombard-${planetId}`} onClick={() => apply({ type: 'bombard', planetId })}>
              Bombard {planetLabel(state, planetId)}
            </button>
          ))}
        </div>
        {landings.map(({ planetId, infantryIds }) => {
          const count = countOf(planetId, infantryIds.length)
          return (
            <div className="rowline" key={planetId}>
              <span className="lbl">{planetLabel(state, planetId)}</span>
              <Stepper id={`land-count-${planetId}`} value={count} min={1} max={infantryIds.length}
                onChange={n => setCounts({ ...counts, [planetId]: n })} />
              <button type="button" className="btn gold" data-testid={`btn-land-${planetId}`}
                onClick={() => apply({ type: 'land', planetId, infantryIds: infantryIds.slice(0, count) })}>
                Land {count} infantry
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Implement the production drawer**

```tsx
// src/ui/flows/ProduceDrawer.tsx
import { useState } from 'react'
import { unitStats } from '../../data/units'
import { PRODUCIBLE, productionCost, productionLimit } from '../../engine'
import { unitCardUrl } from '../art'
import { systemLabel, unitLabel } from '../format'
import { PayRow } from './PayRow'
import { Stepper } from './Stepper'
import { useGame } from '../store'
import type { UnitType } from '../../engine/types'

const DISPLAY_ORDER: UnitType[] = ['dreadnought', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'warsun', 'flagship']

export function ProduceDrawer() {
  const { session, legal, apply } = useGame()
  const [units, setUnits] = useState<Partial<Record<UnitType, number>>>({})
  const [planets, setPlanets] = useState<string[]>([])
  const [tradeGoods, setTradeGoods] = useState(0)
  if (!session) return null
  const state = session.state
  const seat = state.active
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  const systemId = state.tactical?.systemId ?? ''
  const limit = productionLimit(state, seat, systemId)
  const total = DISPLAY_ORDER.reduce((sum, type) => sum + (units[type] ?? 0), 0)
  const cost = productionCost(units, stats, player.techs.includes('sarween_tools'))
  const paid = planets.reduce((sum, id) => {
    const planet = Object.values(state.systems).flatMap(s => s.planets).find(p => p.id === id)
    return sum + (planet ? planet.resources : 0)
  }, 0) + tradeGoods
  const order = DISPLAY_ORDER.filter(type => PRODUCIBLE.includes(type))
  return (
    <div className="drawer bottom cut" data-testid="produce-drawer">
      <div className="in">
        <div className="dhead">
          <span className="tab">Production at {systemLabel(systemId)}</span>
          <span className="sub">
            Production <b data-testid="produce-limit">{limit}</b>, used <b>{total}</b>, cost <b data-testid="produce-cost">{cost}</b>
          </span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-produce"
              disabled={total === 0 || total > limit || paid < cost}
              onClick={() => { if (apply({ type: 'produce', units, planets, tradeGoods })) { setUnits({}); setPlanets([]); setTradeGoods(0) } }}>
              Confirm production
            </button>
            <button type="button" className="btn quiet" data-testid="btn-end-tactical"
              disabled={!legal.some(m => m.type === 'endTactical')} onClick={() => apply({ type: 'endTactical' })}>End turn</button>
          </div>
        </div>
        <div className="ucards">
          {order.map(type => {
            const printed = unitStats(type, stats)
            const count = units[type] ?? 0
            const room = Math.min(limit - total + count, player.reinforcements[type])
            return (
              <div className={`uc${room === 0 ? ' off' : ''}`} key={type}>
                <img src={unitCardUrl(type, player.faction)} alt="" />
                <div className="n">{unitLabel(type, player)}</div>
                <div className="s">Cost {printed.producedPerCost > 1 ? `${printed.cost} for ${printed.producedPerCost}` : printed.cost}</div>
                <Stepper id={`step-${type}`} value={count} max={Math.max(count, room)}
                  onChange={n => setUnits({ ...units, [type]: n })} />
              </div>
            )
          })}
        </div>
        <PayRow state={state} seat={seat} needed={cost} planets={planets} onPlanets={setPlanets}
          tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Wire the steps into the board screen**

Replace the body of `src/ui/screens/BoardScreen.tsx` between `<BoardMap .../>` and `<ActionBar .../>` with the step panels, adding the imports:

```tsx
import { CombatDialog } from '../flows/CombatDialog'
import { InvasionPanel } from '../flows/InvasionPanel'
import { MovementPanel } from '../flows/MovementPanel'
import { ProduceDrawer } from '../flows/ProduceDrawer'
```

```tsx
      {state.tactical?.step === 'movement' ? <MovementPanel /> : null}
      {state.tactical?.step === 'spaceCombat' ? <CombatDialog /> : null}
      {state.tactical?.step === 'invasion' ? <InvasionPanel /> : null}
      {state.tactical && (state.tactical.step === 'production' || state.tactical.step === 'done') ? <ProduceDrawer /> : null}
```

The `done` step reuses the production drawer because it holds the "End turn" button; with the step at `done` every stepper is capped at zero by `productionLimit`, so the only live control is that button.

- [ ] **Step 9: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 6 new tests.

```bash
git add src/ui/flows src/ui/screens/BoardScreen.tsx
git commit -m "feat(ui): movement, combat, invasion and production flows"
```

---

### Task 4b: Strategic actions, the secondary window, component actions and the status phase

**Files:**
- Create: `src/ui/flows/TokenSheet.tsx`, `src/ui/flows/TechDrawer.tsx`, `src/ui/flows/StrategicDialog.tsx`, `src/ui/flows/SecondaryPanel.tsx`, `src/ui/flows/ComponentPanel.tsx`, `src/ui/flows/StatusDialog.tsx`
- Modify: `src/ui/screens/BoardScreen.tsx`, `src/ui/screens/GameOverScreen.tsx`
- Test: `src/ui/flows/Strategic.test.tsx`

**Interfaces:**
- `TokenSheet`: `{ current: Player['tokens']; gained: number; redistribute: boolean; value: Player['tokens']; onChange(next): void }`. It edits the **resulting** command sheet, which is what `StrategicParams.tokens` and `StatusParams.tokens` mean, and it enforces what `economy.distributeTokens` would: the three pools sum to `current + gained`, and without `redistribute` no pool may shrink.
- `TechDrawer`: `{ state; seat; allowed: string[]; selected: string | null; onSelect(techId): void }`. `allowed` always comes from the enumerated moves, so the engine decides what is researchable and the drawer only paints it. Layout follows the mockup's `?panel=tech`: four colour columns in tier order plus a fifth column for unit upgrades and faction technologies.
- Each dialog submits exactly one move kind and closes itself through the `onClose` the board screen passes in.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/flows/Strategic.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cardsUsed, toActionPhase, toStatusPhase, withCards, withPlanetOwner, withTechs } from '../../engine/testUtils'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function playCard(card: string) {
  fireEvent.click(screen.getByTestId('btn-strategic'))
  fireEvent.click(screen.getByTestId(`strategic-pick-${card}`))
}

describe('strategic actions', () => {
  it('R3.2: only ready cards of the active seat are offered', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, ['imperial'])
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-strategic'))
    expect(screen.getByTestId('strategic-pick-leadership')).toBeTruthy()
    expect(screen.queryByTestId('strategic-pick-imperial')).toBeNull()
  })

  it('R6 Leadership: the primary gives three command tokens and opens the secondary window', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('leadership')
    expect(screen.getByTestId('token-tactic').textContent).toBe('6')
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('6')
    expect(screen.getByTestId('secondary-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('btn-secondary-decline'))
    expect(screen.queryByTestId('secondary-panel')).toBeNull()
    expect(screen.getByTestId('turn-1').textContent).toBe('Your turn')
  })

  it('R5: the Technology primary researches the technology chosen in the drawer', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['technology']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('technology')
    expect(screen.getByTestId('tech-card-plasma_scoring').className).toContain('owned')
    expect(screen.getByTestId('tech-card-assault_cannon').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('tech-card-sarween_tools'))
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('tech-0-sarween_tools').textContent).toBe('Sarween Tools')
  })

  it('R7: the Imperial primary scores a fulfilled public objective', () => {
    let s = withCards(withCards(toActionPhase(), 0, ['imperial']), 1, [])
    s = withTechs(s, 0, ['sarween_tools'])
    renderWithSession(s, <BoardScreen />)
    playCard('imperial')
    fireEvent.click(screen.getByTestId('objective-pick-own_3_techs'))
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('vp-0').textContent).toBe('1 of 7')
    expect(screen.getByTestId('scored-own_3_techs-0')).toBeTruthy()
  })

  it('R8: a trade post sells two commodities for two trade goods without ending the turn', () => {
    const s = withPlanetOwner(cardsUsed(toActionPhase()), 'bereg', 'bereg', 0)
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-component'))
    expect(screen.queryByTestId('btn-tradepost-west')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-tradepost-east'))
    expect(screen.getByTestId('economy-0-tradegoods').textContent).toBe('2')
    expect(screen.getByTestId('economy-0-commodities').textContent).toBe('0 of 2')
    expect(screen.getByTestId('turn-0').textContent).toBe('Your turn')
  })

  it('R3.3: the status dialog distributes the new command tokens, speaker first', () => {
    renderWithSession(toStatusPhase(toActionPhase()), <BoardScreen />)
    expect(screen.getByTestId('status-dialog').textContent).toContain('2 command tokens')
    expect(screen.getByTestId('token-tactic').textContent).toBe('5')
    fireEvent.click(screen.getByTestId('token-tactic-minus'))
    fireEvent.click(screen.getByTestId('token-fleet-plus'))
    fireEvent.click(screen.getByTestId('btn-status-confirm'))
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('4')
    expect(screen.getByTestId('tokens-0-fleet').textContent).toBe('4')
    expect(screen.getByTestId('turn-1').textContent).toBe('Your turn')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails, then commit it**

Run: `npm test -- src/ui/flows/Strategic`
Expected: FAIL, the dialogs do not exist.

```bash
git add src/ui/flows/Strategic.test.tsx
git commit -m "test(ui): strategic primaries, the secondary window, trade posts and the status phase"
```

- [ ] **Step 3: Implement the token sheet and the technology drawer**

```tsx
// src/ui/flows/TokenSheet.tsx
import type { Player } from '../../engine/types'

const POOLS = ['tactic', 'fleet', 'strategy'] as const

export interface TokenSheetProps {
  current: Player['tokens']
  gained: number
  redistribute?: boolean
  value: Player['tokens']
  onChange: (next: Player['tokens']) => void
}

/** Edits the resulting command sheet, exactly as economy.distributeTokens reads it. */
export function TokenSheet({ current, gained, redistribute = false, value, onChange }: TokenSheetProps) {
  const target = current.tactic + current.fleet + current.strategy + gained
  const placed = value.tactic + value.fleet + value.strategy
  return (
    <div className="rowline" data-testid="token-sheet">
      <span className="lbl">Command tokens, {gained} new</span>
      {POOLS.map(pool => (
        <span className="pay" key={pool}>
          {pool}
          <button type="button" data-testid={`token-${pool}-minus`}
            disabled={value[pool] <= (redistribute ? 0 : current[pool])}
            onClick={() => onChange({ ...value, [pool]: value[pool] - 1 })}>-</button>
          <b data-testid={`token-${pool}`}>{value[pool]}</b>
          <button type="button" data-testid={`token-${pool}-plus`}
            disabled={placed >= target}
            onClick={() => onChange({ ...value, [pool]: value[pool] + 1 })}>+</button>
        </span>
      ))}
      <span className="sub" data-testid="token-total">{placed} of {target}</span>
    </div>
  )
}
```

```tsx
// src/ui/flows/TechDrawer.tsx
import { TECHS } from '../../data/techs'
import { techArtUrl } from '../art'
import type { GameState, Seat, TechColor } from '../../engine/types'

const COLOURS: TechColor[] = ['blue', 'red', 'green', 'yellow']
const COLUMN_NAME: Record<TechColor, string> = { blue: 'Propulsion', red: 'Warfare', green: 'Biotic', yellow: 'Cybernetic' }

function tier(prereq: Partial<Record<TechColor, number>>): number {
  return Object.values(prereq).reduce((sum, n) => sum + (n ?? 0), 0)
}

export interface TechDrawerProps {
  state: GameState
  seat: Seat
  allowed: string[]
  selected: string | null
  onSelect: (techId: string) => void
}

/** R5 and R8 of the mockup: four colour columns in tier order plus unit upgrades and faction technologies. */
export function TechDrawer({ state, seat, allowed, selected, onSelect }: TechDrawerProps) {
  const owned = state.players[seat].techs
  const columns = COLOURS.map(colour => ({
    colour,
    techs: TECHS.filter(t => t.kind === 'general' && t.colour === colour).sort((a, b) => tier(a.prereq) - tier(b.prereq)),
  }))
  const extras = TECHS.filter(t => t.kind !== 'general' && (t.faction === undefined || t.faction === state.players[seat].faction))
  const card = (techId: string, name: string) => {
    const isOwned = owned.includes(techId)
    const open = allowed.includes(techId)
    const state2 = isOwned ? 'owned' : selected === techId ? 'sel' : open ? 'now' : 'dim'
    return (
      <button key={techId} type="button" className={`tc ${state2}`} data-testid={`tech-card-${techId}`}
        disabled={!open} onClick={() => onSelect(techId)}>
        <img className="art" src={techArtUrl(techId)} alt="" />
        <span className="cap">{name}{isOwned ? ', owned' : open ? '' : ', needs prerequisites'}</span>
      </button>
    )
  }
  return (
    <div className="tcols" data-testid="tech-drawer">
      {columns.map(column => (
        <div className="tcol" key={column.colour}>
          <h4><span className={`tdot ${column.colour}`} />{COLUMN_NAME[column.colour]}</h4>
          {column.techs.map(t => card(t.id, t.name))}
        </div>
      ))}
      <div className="tcol units">
        <h4>Unit upgrades and faction</h4>
        {extras.map(t => card(t.id, t.name))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the strategic dialog**

```tsx
// src/ui/flows/StrategicDialog.tsx
import { useState } from 'react'
import { PUBLIC_OBJECTIVES } from '../../data/objectives'
import { CARD_NAME, ownedPlanets, planetLabel, systemLabel } from '../format'
import { strategicVariants } from '../moveOptions'
import { PayRow } from './PayRow'
import { TechDrawer } from './TechDrawer'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { Player, StrategicParams, StrategyCardId } from '../../engine/types'

export interface StrategicDialogProps {
  card: StrategyCardId
  onClose: () => void
}

export function StrategicDialog({ card, onClose }: StrategicDialogProps) {
  const { session, legal, apply } = useGame()
  const [planets, setPlanets] = useState<string[]>([])
  const [tradeGoods, setTradeGoods] = useState(0)
  const [systemId, setSystemId] = useState<string | null>(null)
  const [techId, setTechId] = useState<string | null>(null)
  const [objectiveId, setObjectiveId] = useState<string | null>(null)
  const [share, setShare] = useState(false)
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  if (!session) return null
  const state = session.state
  const seat = state.active
  const player = state.players[seat]
  const variants = strategicVariants(legal, card)
  const systems = [...new Set(variants.flatMap(v => v.systemId ? [v.systemId] : []))]
  const techOptions = variants.flatMap(v => v.techId ? [v.techId] : [])
  const objectives = variants.flatMap(v => v.objectiveId ? [v.objectiveId] : [])
  const influence = planets.reduce((sum, id) => {
    const planet = ownedPlanets(state, seat).find(p => p.id === id)
    return sum + (planet ? planet.influence : 0)
  }, 0) + tradeGoods
  const gained = card === 'leadership' ? 3 + Math.floor(influence / 3) : card === 'warfare' ? (systemId ? 1 : 0) : 0
  const sheet = tokens ?? { ...player.tokens, tactic: player.tokens.tactic + gained }

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets, tradeGoods, tokens: sheet }
      case 'diplomacy': return systemId ? { systemId, planets } : { planets }
      case 'trade': return share ? { shareWithOpponent: true } : {}
      case 'warfare': return systemId ? { systemId, tokens: sheet } : { tokens: sheet }
      case 'technology': return techId ? { techId } : {}
      case 'imperial': return objectiveId ? { objectiveId } : {}
    }
  }

  return (
    <div className={card === 'technology' ? 'drawer full cut' : 'dialog cut'} data-testid="strategic-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, primary</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-strategic-confirm"
              onClick={() => { if (apply({ type: 'strategic', card, params: params() })) onClose() }}>Play the card</button>
            <button type="button" className="btn quiet" data-testid="btn-strategic-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>

        {card === 'leadership' ? (
          <>
            <div className="sub">Three command tokens, and one more for every 3 influence you spend.</div>
            <PayRow state={state} seat={seat} unit="influence" needed={0} planets={planets} onPlanets={ids => { setPlanets(ids); setTokens(null) }}
              tradeGoods={tradeGoods} onTradeGoods={n => { setTradeGoods(n); setTokens(null) }} />
            <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
          </>
        ) : null}

        {card === 'diplomacy' ? (
          <>
            <div className="sub">Your opponent places a command token in the chosen system. Then ready up to two of your planets.</div>
            <div className="rowline">
              {systems.map(id => (
                <button key={id} type="button" className={`pay${systemId === id ? ' on' : ''}`} data-testid={`system-pick-${id}`} onClick={() => setSystemId(id)}>
                  {systemLabel(id)}
                </button>
              ))}
            </div>
            <div className="rowline">
              {ownedPlanets(state, seat).filter(p => p.exhausted).map(planet => (
                <button key={planet.id} type="button" className={`pay${planets.includes(planet.id) ? ' on' : ''}`}
                  data-testid={`ready-${planet.id}`} disabled={!planets.includes(planet.id) && planets.length >= 2}
                  onClick={() => setPlanets(planets.includes(planet.id) ? planets.filter(id => id !== planet.id) : [...planets, planet.id])}>
                  Ready {planet.name}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {card === 'trade' ? (
          <div className="rowline">
            <span className="sub">Three trade goods and your commodities back.</span>
            <label className="pay">
              <input type="checkbox" data-testid="share-toggle" checked={share} onChange={e => setShare(e.target.checked)} />
              Let {state.players[seat === 0 ? 1 : 0].name} replenish too
            </label>
          </div>
        ) : null}

        {card === 'warfare' ? (
          <>
            <div className="sub">Take one command token off the board, gain one, then rearrange your sheet.</div>
            <div className="rowline">
              {systems.map(id => (
                <button key={id} type="button" className={`pay${systemId === id ? ' on' : ''}`} data-testid={`system-pick-${id}`}
                  onClick={() => { setSystemId(id); setTokens(null) }}>
                  Token from {systemLabel(id)}
                </button>
              ))}
            </div>
            <TokenSheet current={player.tokens} gained={gained} redistribute value={sheet} onChange={setTokens} />
          </>
        ) : null}

        {card === 'technology' ? (
          <>
            <div className="sub">Research one technology.</div>
            <TechDrawer state={state} seat={seat} allowed={techOptions} selected={techId} onSelect={setTechId} />
          </>
        ) : null}

        {card === 'imperial' ? (
          <>
            <div className="sub">Score one fulfilled public objective, plus a victory point if you hold Mecatol Rex.</div>
            <div className="rowline">
              {objectives.map(id => (
                <button key={id} type="button" className={`pay${objectiveId === id ? ' on' : ''}`} data-testid={`objective-pick-${id}`} onClick={() => setObjectiveId(id)}>
                  {PUBLIC_OBJECTIVES.find(o => o.id === id)?.text ?? id}
                </button>
              ))}
              {objectives.length === 0 ? <span className="sub">No objective is fulfilled right now.</span> : null}
            </div>
          </>
        ) : null}

        {card === 'diplomacy' && systems.length === 0 ? <div className="sub">You control no planet outside {planetLabel(state, 'mecatol-rex')}.</div> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement the secondary window, the component panel and the status dialog**

```tsx
// src/ui/flows/SecondaryPanel.tsx
import { useState } from 'react'
import { cardOwner, secondaryTokenCost } from '../../engine'
import { CARD_NAME, ownedPlanets, unitLabel } from '../format'
import { secondaryOffer } from '../moveOptions'
import { PayRow } from './PayRow'
import { TechDrawer } from './TechDrawer'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { Player, StrategicParams, UnitType } from '../../engine/types'

export function SecondaryPanel() {
  const { session, legal, apply } = useGame()
  const [planets, setPlanets] = useState<string[] | null>(null)
  const [tradeGoods, setTradeGoods] = useState(0)
  const [techId, setTechId] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  if (!session) return null
  const state = session.state
  const card = state.pendingSecondary
  if (card === null) return null
  const seat = state.active
  const player = state.players[seat]
  const owner = cardOwner(state, card)
  const offer = secondaryOffer(legal)
  const template: StrategicParams = offer.accept ?? {}
  const pay = planets ?? template.planets ?? []
  const influence = pay.reduce((sum, id) => {
    const planet = ownedPlanets(state, seat).find(p => p.id === id)
    return sum + (planet ? planet.influence : 0)
  }, 0) + tradeGoods
  const gained = card === 'leadership' ? Math.floor(influence / 3) : 0
  const sheet = tokens ?? { ...player.tokens, tactic: player.tokens.tactic + gained }
  const techOptions = legal.flatMap(m => m.type === 'secondary' && m.accept && m.params?.techId ? [m.params.techId] : [])

  function params(): StrategicParams {
    switch (card) {
      case 'leadership': return { planets: pay, tradeGoods, tokens: sheet }
      case 'diplomacy': return { planets: pay }
      case 'technology': return { techId: techId ?? template.techId, planets: pay, tradeGoods }
      case 'warfare': return { units: template.units, planets: pay, tradeGoods }
      default: return {}
    }
  }

  const needed = card === 'technology' ? 4 : 0
  const units = template.units ?? {}
  return (
    <div className="dialog cut" data-testid="secondary-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">{CARD_NAME[card]}, secondary</span>
          <span className="sub">
            {owner === null ? 'Your opponent' : state.players[owner].name} played {CARD_NAME[card]}.
            It costs you {secondaryTokenCost(card)} strategy token.
          </span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-secondary-accept" disabled={offer.accept === null}
              onClick={() => apply({ type: 'secondary', card, accept: true, params: params() })}>Use the secondary</button>
            <button type="button" className="btn quiet" data-testid="btn-secondary-decline"
              onClick={() => apply({ type: 'secondary', card, accept: false })}>Decline</button>
          </div>
        </div>
        {card === 'leadership' ? (
          <>
            <PayRow state={state} seat={seat} unit="influence" needed={0} planets={pay} onPlanets={ids => { setPlanets(ids); setTokens(null) }}
              tradeGoods={tradeGoods} onTradeGoods={n => { setTradeGoods(n); setTokens(null) }} />
            <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
          </>
        ) : null}
        {card === 'diplomacy' ? (
          <div className="rowline">
            {ownedPlanets(state, seat).filter(p => p.exhausted).map(planet => (
              <button key={planet.id} type="button" className={`pay${pay.includes(planet.id) ? ' on' : ''}`} data-testid={`ready-${planet.id}`}
                disabled={!pay.includes(planet.id) && pay.length >= 2}
                onClick={() => setPlanets(pay.includes(planet.id) ? pay.filter(id => id !== planet.id) : [...pay, planet.id])}>
                Ready {planet.name}
              </button>
            ))}
          </div>
        ) : null}
        {card === 'technology' ? (
          <>
            <PayRow state={state} seat={seat} needed={needed} planets={pay} onPlanets={setPlanets} tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
            <TechDrawer state={state} seat={seat} allowed={techOptions} selected={techId ?? template.techId ?? null} onSelect={setTechId} />
          </>
        ) : null}
        {card === 'warfare' ? (
          <>
            <div className="sub" data-testid="secondary-units">
              Produce {(Object.entries(units) as [UnitType, number][]).map(([type, n]) => `${n} ${unitLabel(type, player)}`).join(', ')} at your home system.
            </div>
            <PayRow state={state} seat={seat} needed={1} planets={pay} onPlanets={setPlanets} tradeGoods={tradeGoods} onTradeGoods={setTradeGoods} />
          </>
        ) : null}
        {card === 'trade' ? <div className="sub">Replenish your commodities.</div> : null}
        {card === 'imperial' ? <div className="sub">Gain two trade goods.</div> : null}
      </div>
    </div>
  )
}
```

```tsx
// src/ui/flows/ComponentPanel.tsx
import { useState } from 'react'
import { planetLabel } from '../format'
import { inheritanceTechIds, shipyardOffers, tradePostOffers } from '../moveOptions'
import { TechDrawer } from './TechDrawer'
import { useGame } from '../store'

const POST_NAME = { west: 'Kasda Exchange', east: 'Vorhal Freeport' } as const

export function ComponentPanel({ onClose }: { onClose: () => void }) {
  const { session, legal, apply } = useGame()
  const [techId, setTechId] = useState<string | null>(null)
  if (!session) return null
  const state = session.state
  const techs = inheritanceTechIds(legal)
  const yards = shipyardOffers(legal)
  const posts = tradePostOffers(legal)
  return (
    <div className="dialog cut" data-testid="component-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Component actions</span>
          <div className="right">
            <button type="button" className="btn quiet" data-testid="btn-component-cancel" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="rowline">
          {posts.map(({ post, commodities }) => (
            <button key={post} type="button" className="btn quiet" data-testid={`btn-tradepost-${post}`}
              onClick={() => apply({ type: 'tradePost', post, commodities })}>
              Sell {commodities} commodities at {POST_NAME[post]}
            </button>
          ))}
          {yards.map(offer => (
            <button key={offer.planetId} type="button" className="btn quiet" data-testid={`btn-shipyard-${offer.planetId}`}
              onClick={() => { if (apply({ type: 'shipyard', planetId: offer.planetId, planets: offer.planets, tradeGoods: offer.tradeGoods })) onClose() }}>
              Emergency shipyard on {planetLabel(state, offer.planetId)}
            </button>
          ))}
        </div>
        {techs.length > 0 ? (
          <>
            <div className="rowline">
              <span className="sub">Inheritance Systems: exhaust the card and spend 2 resources to research one technology, prerequisites ignored.</span>
              <button type="button" className="btn gold" data-testid="btn-inheritance" disabled={techId === null}
                onClick={() => { if (techId && apply({ type: 'research', techId, via: 'inheritance' })) onClose() }}>Research</button>
            </div>
            <TechDrawer state={state} seat={state.active} allowed={techs} selected={techId} onSelect={setTechId} />
          </>
        ) : null}
      </div>
    </div>
  )
}
```

```tsx
// src/ui/flows/StatusDialog.tsx
import { useState } from 'react'
import { PUBLIC_OBJECTIVES } from '../../data/objectives'
import { scoreable, tokensGained } from '../../engine'
import { statusTemplate } from '../moveOptions'
import { TokenSheet } from './TokenSheet'
import { useGame } from '../store'
import type { Player } from '../../engine/types'

export function StatusDialog() {
  const { session, legal, apply } = useGame()
  const [tokens, setTokens] = useState<Player['tokens'] | null>(null)
  if (!session) return null
  const state = session.state
  const seat = state.active
  const player = state.players[seat]
  const template = statusTemplate(legal)
  const gained = tokensGained(state, seat)
  const sheet = tokens ?? template?.tokens ?? { ...player.tokens, tactic: player.tokens.tactic + gained }
  const scoring = scoreable(state, seat)
  return (
    <div className="dialog cut" data-testid="status-dialog">
      <div className="in">
        <div className="dhead">
          <span className="tab">Status phase, {player.name}</span>
          <span className="sub">You gain {gained} command tokens.</span>
          <div className="right">
            <button type="button" className="btn gold" data-testid="btn-status-confirm"
              onClick={() => { apply({ type: 'status', params: { tokens: sheet } }); setTokens(null) }}>Confirm</button>
          </div>
        </div>
        <div className="rowline" data-testid="status-scoring">
          <span className="lbl">Scoring</span>
          {scoring.length === 0 ? <span className="sub">Nothing to score.</span> : null}
          {scoring.map(id => (
            <span className="chip gold" key={id}>{PUBLIC_OBJECTIVES.find(o => o.id === id)?.text ?? 'Mandate, First Strike'}</span>
          ))}
        </div>
        <TokenSheet current={player.tokens} gained={gained} value={sheet} onChange={setTokens} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Wire the dialogs into the board screen**

Add to `src/ui/screens/BoardScreen.tsx` a `card` state and the panels; the strategic picker lists the cards the enumerator offers:

```tsx
  const [card, setCard] = useState<StrategyCardId | null>(null)
```

```tsx
      {mode === 'strategic' && card === null ? (
        <div className="dialog cut" data-testid="strategic-picker">
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
      {mode === 'strategic' && card !== null ? <StrategicDialog card={card} onClose={() => { setCard(null); setMode(null) }} /> : null}
      {mode === 'component' ? <ComponentPanel onClose={() => setMode(null)} /> : null}
      {state.pendingSecondary !== null ? <SecondaryPanel /> : null}
      {state.phase === 'status' ? <StatusDialog /> : null}
```

- [ ] **Step 7: Show what was scored on the game-over screen**

Add to `src/ui/screens/GameOverScreen.tsx`, below the score line:

```tsx
      <div className="seats">
        {([0, 1] as Seat[]).map(seat => (
          <div className="cut seat" key={seat}>
            <div className="in">
              <div className="lbl">{state.players[seat].name}</div>
              <div data-testid={`scored-list-${seat}`}>
                {state.players[seat].scoredObjectives.map(id => PUBLIC_OBJECTIVES.find(o => o.id === id)?.text ?? id).join(', ') || 'No public objective scored'}
              </div>
              {state.players[seat].mandateScored ? <div>Mandate, First Strike</div> : null}
            </div>
          </div>
        ))}
      </div>
```

with the imports `import { PUBLIC_OBJECTIVES } from '../../data/objectives'` and `import type { Seat } from '../../engine/types'`.

- [ ] **Step 8: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 6 new tests.

```bash
git add src/ui/flows src/ui/screens
git commit -m "feat(ui): strategy card dialogs, the secondary window, component actions and the status phase"
```

---

### Task 5: Pass the device, the game log and localStorage persistence

**Files:**
- Create: `src/ui/persist.ts`, `src/ui/HandoffOverlay.tsx`, `src/ui/LogPanel.tsx`, `src/ui/logText.ts`
- Modify: `src/ui/store.tsx` (load on mount, save on change), `src/ui/screens/BoardScreen.tsx`, `src/ui/screens/GameOverScreen.tsx`, `src/ui/screens/SetupScreen.tsx` (resume button)
- Test: `src/ui/persist.test.ts`, `src/ui/Handoff.test.tsx`

**Interfaces:**
- `src/ui/persist.ts`
  ```ts
  export const STORAGE_KEY = 'md:local'
  export function saveSession(session: Session): void
  export function loadSession(): Session | null
  export function clearSession(): void
  ```
  The payload is `{ version: 1, seed, minutes, clockMs, state, history }`. `loadSession` returns `null` for anything it does not recognise (missing key, broken JSON, wrong payload version, wrong `state.version`), so a stale or foreign entry can never crash the app.
- `src/ui/logText.ts`
  ```ts
  export function describeMove(state: GameState, seat: Seat | null, move: Move): string
  export function describeEntry(state: GameState, entry: LogEntry): { text: string; kind: 'move' | 'roll' | 'info' }
  ```
  `describeMove` has one branch per `Move` kind, so the exhaustiveness check in the switch is the guarantee that no move kind is unreadable in the log.

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui/persist.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { toActionPhase } from '../engine/testUtils'
import { STORAGE_KEY, clearSession, loadSession, saveSession } from './persist'
import type { Session } from './store'

const session: Session = {
  seed: 7, minutes: 15, state: toActionPhase(), history: [], clockMs: [123456, 654321], handoff: null,
}

describe('hot-seat persistence', () => {
  it('round-trips seed, clocks, state and history', () => {
    saveSession(session)
    const loaded = loadSession()
    expect(loaded?.seed).toBe(7)
    expect(loaded?.clockMs).toEqual([123456, 654321])
    expect(loaded?.state.phase).toBe('action')
    expect(loaded?.state.systems['home-n'].space).toHaveLength(5)
    expect(loaded?.handoff).toBeNull()
  })
  it('ignores an empty, broken or foreign payload', () => {
    expect(loadSession()).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, 'not json')
    expect(loadSession()).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, state: {} }))
    expect(loadSession()).toBeNull()
    saveSession(session)
    clearSession()
    expect(loadSession()).toBeNull()
  })
})
```

```tsx
// src/ui/Handoff.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cardsUsed, toActionPhase } from '../engine/testUtils'
import { BoardScreen } from './screens/BoardScreen'
import { renderWithSession } from './test/harness'

describe('hot-seat courtesies', () => {
  it('asks to pass the device when the seat to act changes', () => {
    renderWithSession(cardsUsed(toActionPhase()), <BoardScreen />)
    expect(screen.queryByTestId('handoff')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-pass'))
    expect(screen.getByTestId('handoff').textContent).toContain('Pass the device to B')
    fireEvent.click(screen.getByTestId('handoff-continue'))
    expect(screen.queryByTestId('handoff')).toBeNull()
  })

  it('renders the log with moves, dice and engine notes', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-log'))
    const log = screen.getByTestId('log-panel')
    expect(log.textContent).toContain('A takes Warfare')
    expect(log.textContent).toContain('B takes Leadership')
    fireEvent.click(screen.getByTestId('btn-log'))
    expect(screen.queryByTestId('log-panel')).toBeNull()
  })

  it('writes the session to localStorage after every move', () => {
    const { store } = renderWithSession(cardsUsed(toActionPhase()), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-pass'))
    const raw = window.localStorage.getItem('md:local')
    expect(raw).not.toBeNull()
    expect(raw).toContain('"seed":7')
    expect(store().session?.state.players[0].passed).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail, then commit them**

Run: `npm test -- src/ui/persist src/ui/Handoff`
Expected: FAIL, `src/ui/persist.ts` does not exist.

```bash
git add src/ui/persist.test.ts src/ui/Handoff.test.tsx
git commit -m "test(ui): pass the device, the game log and localStorage persistence"
```

- [ ] **Step 3: Implement persistence**

```ts
// src/ui/persist.ts
import type { GameState } from '../engine/types'
import type { Session } from './store'

export const STORAGE_KEY = 'md:local'

interface Payload {
  version: 1
  seed: number
  minutes: number
  clockMs: [number, number]
  state: GameState
  history: GameState[]
}

function isPayload(value: unknown): value is Payload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<Payload>
  return p.version === 1 && typeof p.seed === 'number' && typeof p.minutes === 'number'
    && Array.isArray(p.clockMs) && p.clockMs.length === 2
    && Array.isArray(p.history)
    && typeof p.state === 'object' && p.state !== null && p.state.version === 1
}

export function saveSession(session: Session): void {
  const payload: Payload = {
    version: 1, seed: session.seed, minutes: session.minutes,
    clockMs: session.clockMs, state: session.state, history: session.history,
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // a full or blocked storage must never break the game in progress
  }
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isPayload(parsed)) return null
    return {
      seed: parsed.seed, minutes: parsed.minutes, state: parsed.state,
      history: parsed.history, clockMs: parsed.clockMs, handoff: null,
    }
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing to do
  }
}
```

Add to `src/ui/store.tsx`, inside `GameProvider` next to the other effects, with `import { clearSession, loadSession, saveSession } from './persist'`:

```tsx
  // resume the game in progress after a reload; a broken payload is simply ignored
  useEffect(() => {
    const saved = loadSession()
    if (!saved) return
    roundRef.current = saved.state.round
    setSession(saved)
  }, [])

  useEffect(() => {
    if (session) saveSession(session)
    else clearSession()
  }, [session])
```

- [ ] **Step 4: Implement the log text**

```ts
// src/ui/logText.ts
import { CARD_NAME, planetLabel, systemLabel, techLabel } from './format'
import type { GameState, LogEntry, Move, Owner, Seat, UnitType } from '../engine/types'

function who(state: GameState, seat: Seat | null): string {
  return seat === null ? 'The game' : state.players[seat].name
}

function ownerName(state: GameState, owner: Owner): string {
  return owner === 'guardian' ? 'The guardian fleet' : state.players[owner].name
}

function unitSummary(units: Partial<Record<UnitType, number>>): string {
  const parts = (Object.entries(units) as [UnitType, number][]).filter(([, n]) => n > 0).map(([type, n]) => `${n} ${type}`)
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

export function describeMove(state: GameState, seat: Seat | null, move: Move): string {
  const name = who(state, seat)
  switch (move.type) {
    case 'pickStrategyCard': return `${name} takes ${CARD_NAME[move.card]}`
    case 'startTactical': return `${name} activates ${systemLabel(move.systemId)}`
    case 'moveShips': return `${name} moves ${move.moves.length} ships in`
    case 'endMovement': return `${name} finishes moving`
    case 'combatRound': {
      const sides = [move.munitions?.attacker ? 'attacker' : null, move.munitions?.defender ? 'defender' : null].filter(s => s !== null)
      return sides.length > 0 ? `${name} fights a combat round, Munitions Reserves for the ${sides.join(' and ')}` : `${name} fights a combat round`
    }
    case 'retreat': return `${name} announces a retreat to ${systemLabel(move.to)}`
    case 'bombard': return `${name} bombards ${planetLabel(state, move.planetId)}`
    case 'land': return `${name} lands ${move.infantryIds.length} infantry on ${planetLabel(state, move.planetId)}`
    case 'groundCombatRound': return `${name} fights a ground combat round`
    case 'endInvasion': return `${name} ends the invasion`
    case 'produce': return `${name} produces ${unitSummary(move.units)}`
    case 'endTactical': return `${name} ends the tactical action`
    case 'strategic': return `${name} plays ${CARD_NAME[move.card]}`
    case 'secondary': return `${name} ${move.accept ? 'uses' : 'declines'} the ${CARD_NAME[move.card]} secondary`
    case 'research': return `${name} researches ${techLabel(move.techId)} with Inheritance Systems`
    case 'shipyard': return `${name} builds an emergency shipyard on ${planetLabel(state, move.planetId)}`
    case 'tradePost': return `${name} sells ${move.commodities} commodities at the ${move.post} trade post`
    case 'pass': return `${name} passes`
    case 'status': return `${name} distributes command tokens`
  }
}

export function describeEntry(state: GameState, entry: LogEntry): { text: string; kind: 'move' | 'roll' | 'info' } {
  if (entry.t === 'move') return { text: describeMove(state, entry.seat, entry.move), kind: 'move' }
  if (entry.t === 'roll') {
    const hits = entry.rolls.filter(r => r.hit).length
    const dice = entry.rolls.map(r => r.value).join(', ')
    return { text: `${ownerName(state, entry.owner)} rolls ${dice || 'no dice'} for ${entry.context}, ${hits} hits`, kind: 'roll' }
  }
  // engine notes name the seat; the log shows the player instead
  const text = entry.text
    .replace(/seat 0/g, state.players[0].name)
    .replace(/seat 1/g, state.players[1].name)
  return { text, kind: 'info' }
}
```

- [ ] **Step 5: Implement the overlay and the log panel**

```tsx
// src/ui/HandoffOverlay.tsx
import { useGame } from './store'

/** lobby-architecture 2.8: the hot-seat courtesy between two people sharing one screen. */
export function HandoffOverlay() {
  const { session, dismissHandoff } = useGame()
  if (!session || session.handoff === null) return null
  const player = session.state.players[session.handoff]
  return (
    <div className="overlay" data-testid="handoff">
      <h2 className="title goldtext">Pass the device to {player.name}</h2>
      <p className="tagline">{player.name} is next to act</p>
      <button type="button" className="btn gold" data-testid="handoff-continue" onClick={dismissHandoff}>
        I am {player.name}
      </button>
    </div>
  )
}
```

```tsx
// src/ui/LogPanel.tsx
import { describeEntry } from './logText'
import type { GameState } from '../engine/types'

export function LogPanel({ state, onClose }: { state: GameState; onClose?: () => void }) {
  return (
    <div className="logpanel cut" data-testid="log-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Game log</span>
          {onClose ? <div className="right"><button type="button" className="btn quiet" data-testid="btn-log-close" onClick={onClose}>Close</button></div> : null}
        </div>
        {state.log.map((entry, i) => {
          const line = describeEntry(state, entry)
          return <div className={`logline ${line.kind}`} key={i} data-testid={`log-entry-${i}`}>{line.text}</div>
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Put them on the screens**

In `src/ui/screens/BoardScreen.tsx` add the imports and render both, the overlay last so it covers everything:

```tsx
import { HandoffOverlay } from '../HandoffOverlay'
import { LogPanel } from '../LogPanel'
```

```tsx
      {showLog ? <LogPanel state={state} onClose={() => setShowLog(false)} /> : null}
      <HandoffOverlay />
```

In `src/ui/screens/GameOverScreen.tsx` add `<LogPanel state={state} />` below the scored lists, and in `src/ui/screens/SetupScreen.tsx` offer to resume:

```tsx
  const { start, session } = useGame()
```

```tsx
        {session ? (
          <button type="button" className="btn quiet" data-testid="btn-resume" onClick={() => navigate('#/play')}>Resume the saved game</button>
        ) : null}
```

- [ ] **Step 7: Run the tests, type-check, lint and commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 5 new tests.

```bash
git add src/ui/persist.ts src/ui/logText.ts src/ui/HandoffOverlay.tsx src/ui/LogPanel.tsx src/ui/store.tsx src/ui/screens
git commit -m "feat(ui): pass the device interstitial, game log and a resumable local game"
```

---

### Task 6: One scripted hot-seat game through the finished UI

**Files:**
- Test: `src/ui/hotseat.e2e.test.tsx`

**Interfaces:** none. This task adds no implementation code; if it fails, the fix belongs in the task that owns the component.

**What the script plays** (game seed 7, so every step is reproducible; no dice are rolled until the guardian fleet is rerolled at the very end, which the test does not assert):

| Turn | Seat | Action |
| --- | --- | --- |
| draft | 0, 1, 1, 0 | Leadership, Trade, Technology, Warfare |
| 1 | 0 | tactical action on Bereg: carrier plus three fighters and one infantry move in, the infantry lands and takes Bereg |
| 2 | 1 | Technology primary, researches Sarween Tools; seat 0 declines the secondary |
| 3 | 0 | Leadership primary, three command tokens; seat 1 declines the secondary |
| 4 | 1 | Trade primary; seat 0 may only decline, it is already at full commodities |
| 5 | 0 | Warfare primary, takes the token back off Bereg; seat 1 accepts the secondary and produces one infantry |
| 6 | 1 | passes, both cards are used |
| 7 | 0 | tactical action on the home system, produces two infantry at the space dock |
| 8 | 0 | passes, the status phase begins |
| status | 0 then 1 | both distribute their two command tokens; seat 1 scores "Own 3 technologies" |

Round 1 cannot show movement and production inside a single activation: every ship of a seat starts in the only system that holds its space dock, so the first activation is the one that moves and the second is the one that produces. That is a property of the map, not of the UI.

- [ ] **Step 1: Write the end-to-end test**

```tsx
// src/ui/hotseat.e2e.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

function click(testId: string): void {
  fireEvent.click(screen.getByTestId(testId))
}
function text(testId: string): string {
  return screen.getByTestId(testId).textContent ?? ''
}
/** The hot-seat interstitial appears whenever the seat to act changes; clicking through it is part of playing. */
function handoff(): void {
  const button = screen.queryByTestId('handoff-continue')
  if (button) fireEvent.click(button)
}

describe('a scripted hot-seat game', () => {
  it('R3.1 to R3.3: plays a full first round through the rendered UI', () => {
    window.location.hash = '#/?seed=7'
    render(<App ticking={false} />)

    // setup
    fireEvent.change(screen.getByTestId('seat-name-0'), { target: { value: 'Despot' } })
    fireEvent.change(screen.getByTestId('seat-name-1'), { target: { value: 'Kael' } })
    click('btn-start')
    expect(text('round')).toBe('Round 1 of 6, strategy phase')
    expect(text('clock-0')).toBe('15:00')

    // R3.1 snake draft: speaker, other, other, speaker
    click('strategy-card-leadership')
    handoff()
    click('strategy-card-trade')
    click('strategy-card-technology')
    handoff()
    click('strategy-card-warfare')
    expect(text('round')).toBe('Round 1 of 6, action phase')
    expect(text('strategy-state-leadership')).toBe('Despot, ready')
    expect(text('strategy-state-diplomacy')).toBe('+1 trade good')
    expect(text('turn-0')).toBe('Your turn')                       // Leadership is initiative 1

    // turn 1: R3.2 tactical action with movement and an invasion
    click('btn-tactical')
    click('tile-bereg')
    expect(text('tokens-0-tactic')).toBe('2')
    fireEvent.click(screen.getByLabelText('Carrier I from [0.0.0]'))
    for (let i = 0; i < 3; i++) click('cargo-home-n-fighter-plus')
    click('cargo-home-n-infantry-plus')
    click('btn-move-ships')
    expect(text('stack-bereg-0-fighter')).toBe('3')
    expect(screen.queryByTestId('stack-home-n-0-carrier')).toBeNull()
    click('btn-end-movement')
    expect(text('land-count-bereg')).toBe('1')
    click('btn-land-bereg')
    expect(screen.getByTestId('control-bereg')).toBeTruthy()
    expect(screen.getByTestId('planet-0-bereg')).toBeTruthy()
    click('btn-end-invasion')
    click('btn-end-tactical')
    handoff()
    expect(text('turn-1')).toBe('Your turn')

    // turn 2: R5 Technology primary, the opponent declines the secondary
    click('btn-strategic')
    click('strategic-pick-technology')
    fireEvent.click(screen.getByTestId('tech-card-sarween_tools'))
    click('btn-strategic-confirm')
    handoff()
    expect(screen.getByTestId('secondary-panel')).toBeTruthy()
    click('btn-secondary-decline')
    expect(screen.queryByTestId('secondary-panel')).toBeNull()
    expect(text('tech-1-sarween_tools')).toBe('Sarween Tools')
    expect(text('turn-0')).toBe('Your turn')

    // turn 3: R6 Leadership primary
    click('btn-strategic')
    click('strategic-pick-leadership')
    expect(text('token-tactic')).toBe('5')
    click('btn-strategic-confirm')
    expect(text('tokens-0-tactic')).toBe('5')
    handoff()
    click('btn-secondary-decline')
    expect(text('turn-1')).toBe('Your turn')

    // turn 4: R6 Trade primary; the responder is already replenished, so only declining is offered
    click('btn-strategic')
    click('strategic-pick-trade')
    click('btn-strategic-confirm')
    expect(text('economy-1-tradegoods')).toBe('3')
    handoff()
    expect(screen.getByTestId('btn-secondary-accept').hasAttribute('disabled')).toBe(true)
    click('btn-secondary-decline')
    expect(text('turn-0')).toBe('Your turn')

    // turn 5: R6 Warfare primary, and an accepted secondary that produces one infantry
    click('btn-strategic')
    click('strategic-pick-warfare')
    click('system-pick-bereg')
    click('btn-strategic-confirm')
    expect(text('tokens-0-tactic')).toBe('6')
    handoff()
    expect(text('secondary-units')).toContain('1 Infantry I')
    click('btn-secondary-accept')
    expect(text('forces-1-infantry')).toBe('4 Infantry I')
    expect(text('tokens-1-strategy')).toBe('1')
    expect(text('turn-1')).toBe('Your turn')

    // turn 6: R3.2 passing is legal once both cards are used
    expect(screen.getByTestId('btn-pass').hasAttribute('disabled')).toBe(false)
    click('btn-pass')
    handoff()
    expect(text('turn-0')).toBe('Your turn')

    // turn 7: R4.4 production at the home space dock
    click('btn-tactical')
    click('tile-home-n')
    click('btn-end-movement')
    click('btn-end-invasion')
    expect(text('produce-limit')).toBe('7')
    click('step-infantry-plus')
    click('step-infantry-plus')
    expect(text('produce-cost')).toBe('1')
    click('pay-000')
    click('btn-produce')
    expect(text('forces-0-infantry')).toBe('7 Infantry I')
    click('btn-end-tactical')

    // turn 8: both have passed, the status phase begins with the speaker
    click('btn-pass')
    expect(text('round')).toBe('Round 1 of 6, status phase')
    expect(screen.getByTestId('status-dialog').textContent).toContain('2 command tokens')
    click('btn-status-confirm')
    handoff()
    expect(screen.getByTestId('status-scoring').textContent).toContain('Own 3 technologies')
    click('btn-status-confirm')

    // R3.3: scoring, the reveal and the next round
    expect(text('vp-1')).toBe('1 of 7')
    expect(text('vp-0')).toBe('0 of 7')
    expect(screen.getByTestId('scored-own_3_techs-1')).toBeTruthy()
    expect(screen.getByTestId('objective-control_4_outside_home')).toBeTruthy()
    expect(text('round')).toBe('Round 2 of 6, strategy phase')
    expect(text('strategy-state-leadership')).toBe('Unpicked')
    expect(text('strategy-state-diplomacy')).toBe('+1 trade good')

    // the log carries the whole round
    click('btn-log')
    const log = screen.getByTestId('log-panel').textContent ?? ''
    expect(log).toContain('Despot activates Bereg')
    expect(log).toContain('Despot lands 1 infantry on Bereg')
    expect(log).toContain('Kael plays Technology')
    expect(log).toContain('Despot declines the Technology secondary')
    expect(log).toContain('Kael uses the Warfare secondary')
    expect(log).toContain('Despot produces 2 infantry')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm test -- src/ui/hotseat`
Expected: PASS. If a step fails, fix the component that owns it, never the assertion, unless the assertion contradicts `docs/spec/game-rules.md`.

```bash
git add src/ui/hotseat.e2e.test.tsx
git commit -m "test(ui): scripted hot-seat game through draft, tactical, strategic and status phase"
```

- [ ] **Step 3: Full check and final commit**

Run: `npm test && npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm run build`
Expected: PASS, the engine suite plus roughly 40 UI tests, a clean type-check, a clean lint and a production build.

```bash
git commit --allow-empty -m "chore(ui): hot-seat client complete, engine unchanged"
```

---

## Self-review notes

### Move coverage: every move kind has a UI path

| Move | Where the player triggers it | Parameters the UI supplies |
| --- | --- | --- |
| `pickStrategyCard` | strategy strip in the top bar (task 3) | the card, from the enumerated picks |
| `startTactical` | clicking a highlighted tile after "Tactical action" (4a) | the system, from `activatable(legal)` |
| `moveShips` | movement panel: ship checkboxes plus cargo steppers per origin (4a) | ships and their cargo ids, filled up to printed capacity |
| `endMovement` | "Done moving" (4a) | none |
| `combatRound` | "Open fire" / "Fight round N" with the two Munitions Reserves checkboxes (4a) | `munitions`, only for the sides the enumerator offers |
| `retreat` | one button per offered retreat target (4a) | the destination |
| `bombard` | one button per bombardable planet (4a) | the planet |
| `land` | stepper plus "Land N infantry" per landable planet (4a) | the first N of the offered `infantryIds` |
| `groundCombatRound` | "Ground combat round", shown only while one is pending (4a) | none |
| `endInvasion` | "Done invading" (4a) | none |
| `produce` | production drawer: steppers, planet chips, trade goods (4a) | units, planets, trade goods |
| `endTactical` | "End turn" in the production drawer, also in the `done` step (4a) | none |
| `strategic` | action bar, card picker, then the card's dialog (4b) | per card: planets, trade goods, tokens, system, technology, objective, share |
| `secondary` | secondary panel with Accept and Decline (4b) | the enumerated template, edited |
| `research` | component panel, Inheritance Systems tech drawer (4b) | the technology |
| `shipyard` | component panel, one button per eligible planet (4b) | the planet plus the offered payment |
| `tradePost` | component panel, one button per open post (4b) | post and commodities from the offer |
| `pass` | action bar, and the clock at zero (task 1 and 3) | none |
| `status` | status dialog, token sheet (4b) | the resulting command sheet |

Phases: `strategy` is the top strip, `action` is the action bar plus the step panels, `status` is the status dialog, `ended` is the game-over screen. The secondary window is its own panel because `legalMoves` returns only `secondary` moves while `pendingSecondary` is set.

### Type consistency with the engine

- No engine type changes. The UI imports `GameState`, `Move`, `StrategicParams`, `StatusParams`, `Player`, `Planet`, `Seat`, `Owner`, `Color`, `FactionId`, `StrategyCardId`, `TechColor`, `UnitType`, `LogEntry` and uses them as they are.
- The only engine edit is the re-export block in `src/engine/index.ts` (task 1 step 3): value re-exports of functions that already existed, so `verbatimModuleSyntax` and the engine tests are unaffected.
- `Owner` is handled everywhere a seat could be the guardian: `ownerKey`, `colourOf` (grey sprites), `ownerName` in the log and the combat dialog. The UI never indexes `state.players` with an `Owner` without narrowing it first.
- `Session.clockMs` is a fixed two-tuple, so `clockMs[seat]` type-checks against `Seat`. `TokenSheet` and the status dialog both use `Player['tokens']` rather than a private copy of the shape, which is what `economy.distributeTokens` validates.
- `describeMove` switches over the whole `Move` union with no `default`, so a new move kind in the engine becomes a compile error in the log, not a silent blank line.
- `spriteSize` is typed `Record<UnitType, SpriteDef>`: a new unit type would fail to compile until its manifest entry exists.
- Timers are `ReturnType<typeof setInterval>` through `clearInterval` in the effect's cleanup only, so no Node typings leak into the app code.

### Resolved ambiguities and v1 rulings

1. **The hot-seat seed is derived, not random** (controller ruling). `lobby-architecture.md` 2.8 lets the local transport pull `rng_seed` from `crypto.getRandomValues`. This plan uses `deriveSeed(gameSeed, moveIndex)` instead: the whole client becomes replayable from `(seed, moves)`, every test is deterministic, and persistence needs no separate seed log. The precomputation risk that motivates the secret seed only exists in online play, where plan 5 keeps the server-side HMAC seed; the two players here share a screen.
2. **Undo is exactly `undoable`**: same seat still to act, no dice rolled by the move being taken back. The history stack is cleared the moment either condition breaks, which also keeps at most one turn of states in memory and in localStorage.
3. **The clock runs for `state.active` during the action phase**, which includes the seat answering a secondary. Answering is not a turn under R3.2, but it is that player's decision time, and the alternative (a stopped clock during the response) would let a player think for free.
4. **At zero the store passes only when passing is legal.** R3.2 forbids passing while holding an unused strategy card, and the engine also refuses inside a running tactical action or an open secondary window. The clock stays at zero and the pass fires as soon as the engine offers it, instead of the UI inventing a forced move.
5. **The three extra minutes go only to a player at zero** (R6), granted when `state.round` changes, so a player who never flagged keeps their remaining time.
6. **The handoff appears on every change of the acting seat**, the draft and the secondary window included. It is a courtesy today and the hook for hidden information later. It never appears when the game has just ended, because the game-over screen replaces the board.
7. **Cargo is chosen per origin system, not per ship.** The engine wants cargo attached to a named ship; the panel collects "how many fighters and infantry leave this system" and fills the selected ships in order up to their printed capacity. Fewer controls, and `moveShips` still validates the result.
8. **Every parameter editor starts from the enumerated move.** `land`, `secondary`, `shipyard` and `status` come out of `legalMoves` already playable, so their panels pre-fill from that move: pressing the primary button without touching anything always submits a legal move.
9. **Munitions Reserves are two checkboxes, not two buttons.** They are shown only for the sides `legalMoves` offers a variant for, and the request is folded into the one `combatRound` move, matching the engine's per-side flags.
10. **Command and control tokens are faction art, ship sprites are colour art.** `public/assets/tokens/` only holds `l1z1x_*` and `letnev_*`, so the colour a player picks in the setup screen paints their ships and nothing else. Colour-matched token art would be a second asset run and is deferred.
11. **Technology colour icons are drawn in CSS.** The mockup used `pa_tech_techicons_*` files that are not in this repository, so the tech drawer and the technology list use small gold-framed diamonds in the colour instead. The real card art, which is present, still carries the colour.
12. **The production drawer also owns the `done` step**, because that is where "End turn" lives. With the step at `done` the production limit reads zero and every stepper is capped, so only the closing button is live.
13. **A card that can be played bare is played bare.** Diplomacy without an eligible system, Technology without a chosen technology and Imperial without a fulfilled objective all submit `params: {}`, exactly the variant the enumerator offers, so no card can ever be stuck and block R3.2's "you may not pass while holding an unused card".
14. **Seats are fixed to the map**: seat 0 is north, seat 1 is south, and the swap button swaps the factions rather than the positions. The speaker of round 1 is always seat 0; R2 allows randomising it, and the setup screen deliberately does not, so a game is fully described by `(seed, names, factions, colours, minutes)`.
15. **One fixed 1440x900 layout**, as in the mockups. No responsive breakpoints, no mobile layout; the page centres itself and scrolls if the window is smaller.
16. **The trade post stations are CSS shapes**, not the mockup's inline SVG drawings. They keep the gold-framed panel, the name tab, the price line and the state chip, which is what the player reads; porting the two hand-drawn stations is a cosmetic follow-up.
17. **Tile art positions come from the mockup, fleets are laid out programmatically.** The mockup places every ship by hand, which a live game cannot: units are grouped by owner and type and flow inside a 200px box anchored per tile, with a count badge above one sprite for a stack.
18. **The board takes the world scale from the sprite manifest.** `round(spriteW / pxPerModelUnit * 11.6)` reproduces the mockup's sizes to the pixel, which is the evidence that the scale, not a table of hand-tuned widths, is the right source.
19. **A seed can be fixed from the URL** (`#/?seed=7`). That is how the end-to-end test gets a reproducible game, and it doubles as a debugging aid.
20. **Round 1 cannot show movement and production in one activation.** Every ship starts in the only system with a space dock, so the scripted game moves in the first activation and produces in the second. Found while writing task 6; it is a property of the Bereg Standoff setup, not a UI limitation.

### Deferred

- **The online lobby, seat tokens, Supabase transport, spectators and rematch**: plan 5, per `docs/spec/lobby-architecture.md`. The store's `Session` and `apply` are the seam: an online transport replaces the seed source and the move sink, nothing else.
- **A Playwright smoke test**: deliberately out of scope. The end-to-end test of task 6 runs the real components under jsdom; a browser run would add the asset loading and the CSS, which is a separate piece of tooling.
- **Unit style choice in the settings** (the sprite render style of `public/assets/sprites`): the manifest already carries the style name, so a second style is a directory swap plus a setting.
- **Sound**, and **animations beyond CSS transitions**: no dice roll animation, no ship movement tween, no combat flash.
- **Colour-matched command and control tokens** (ruling 10) and **the hand-drawn trade post stations** (ruling 16).
- **Responsive and touch layout**, including a tablet-sized board, which the hot-seat pitch ("pass the tablet") eventually wants.
- **Undo across a dice roll or a turn boundary**, and any undo in online play, which needs the opponent's approval.
- **Declining a score in the status phase**: the engine scores everything automatically (engine plan 3, ruling 13), so the status dialog only shows what will be scored.
