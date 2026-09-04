import { useEffect, useMemo, useRef } from 'react'
import { GameProvider, useGame } from './store'
import { latestGameCode, loadGame } from './persist'
import { codeFromRoute, gamePath, navigate, playRedirect, useHashRoute } from './route'
import { BoardScreen } from './screens/BoardScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import { SetupScreen } from './screens/SetupScreen'
import { UnknownGameScreen } from './screens/UnknownGameScreen'
import type { GameConfig } from './store'
import type { Move, StrategyCardId } from '../engine/types'
import { MusicProvider } from './music'

// Manual/visual QA only (e.g. a headless screenshot of the board): `?demo=1` skips setup and starts
// a fixed hot-seat game straight into the action phase draft, seeded for a reproducible board.
const DEMO_CODE = 'DEMOAA'
const DEMO_CONFIG: GameConfig = {
  players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }],
  speaker: 0,
}

function useDemoBootstrap() {
  const { session, start, resume } = useGame()
  useEffect(() => {
    // The whole hook is dev-only: `import.meta.env.DEV` folds to `false` in a production build, so this
    // body and the dynamic `../engine/testUtils` import below are dropped from the shipped bundle.
    if (!import.meta.env.DEV) return
    if (session || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') !== '1') return
    const panel = params.get('panel')
    // `&panel=handoff` / `&panel=log` are manual/visual QA hooks: they resume straight into a state
    // that already shows the overlay or has log entries, so a headless screenshot needs no clicks.
    if (panel === 'handoff' || panel === 'log') {
      void import('../engine/testUtils').then(({ cardsUsed, toActionPhase }) => {
        const state = toActionPhase(1, 0)
        resume(panel === 'handoff'
          ? { code: DEMO_CODE, seed: 1, minutes: 15, state: cardsUsed(state), history: [], clockMs: [900000, 900000], handoff: 1 }
          : { code: DEMO_CODE, seed: 1, minutes: 15, state, history: [], clockMs: [900000, 900000], handoff: null })
        navigate(gamePath(DEMO_CODE))
      })
      return
    }
    // `&panel=crowded` is the placement check: Bereg holds a big mixed fleet with the infantry its
    // carriers are still carrying (all of it belongs in space), Quann has a seat's infantry landed on the
    // planet under a dock and a PDS, Starpoint is activated by both seats, and Mecatol keeps its guardians.
    if (panel === 'crowded') {
      void import('../engine/testUtils').then(({ toActionPhase, withPlanetOwner, withUnits }) => {
        let state = toActionPhase(1, 0)
        state = withUnits(state, 'bereg', 0,
          ['flagship', 'warsun', 'dreadnought', 'dreadnought', 'carrier', 'carrier', 'cruiser', 'destroyer',
            'fighter', 'fighter', 'fighter', 'fighter', 'infantry', 'infantry', 'infantry'])
        state = withUnits(state, 'quann', 1, ['infantry', 'infantry', 'infantry', 'spacedock', 'pds'], 'quann')
        state = withPlanetOwner(state, 'quann', 'quann', 1)
        state = withUnits(state, 'quann', 1, ['carrier', 'destroyer', 'fighter'])
        state = { ...state, systems: { ...state.systems, starpoint: { ...state.systems.starpoint, activatedBy: [0, 1] } } }
        resume({ code: DEMO_CODE, seed: 1, minutes: 15, state, history: [], clockMs: [900000, 900000], handoff: null })
        navigate(gamePath(DEMO_CODE))
      })
      return
    }
    // `start` puts the new game's code in the URL itself
    start(DEMO_CONFIG, 1, 15)
    // Runs once on mount; `start`, `resume` and `session` come from a stable context store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Manual/visual QA only: `?demo=1&panel=movement` or `?panel=produce` drives the draft and one
// tactical activation through real `apply()` moves, purely so a headless screenshot can land on
// the movement panel or the production drawer without a human at the keyboard.
const DRAFT: Move[] = (['warfare', 'leadership', 'imperial', 'technology'] as StrategyCardId[])
  .map(card => ({ type: 'pickStrategyCard', card }))
const DEMO_SCRIPTS: Record<string, Move[]> = {
  movement: [...DRAFT, { type: 'startTactical', systemId: 'bereg' }],
  // this draft's initiative order hands the first action-phase turn to seat 1, so the produce demo
  // activates seat 1's own home system (home-s) to get a real, non-zero production limit.
  produce: [...DRAFT, { type: 'startTactical', systemId: 'home-s' }, { type: 'endMovement' }, { type: 'endInvasion' }],
}

function movesMatch(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'pickStrategyCard' && b.type === 'pickStrategyCard') return a.card === b.card
  if (a.type === 'startTactical' && b.type === 'startTactical') return a.systemId === b.systemId
  return true
}

function useDemoScript() {
  const { session, legal, apply } = useGame()
  const step = useRef(0)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (typeof window === 'undefined' || !session) return
    const panel = new URLSearchParams(window.location.search).get('panel')
    const script = panel ? DEMO_SCRIPTS[panel] : undefined
    if (!script || step.current >= script.length) return
    const next = script[step.current]
    if (legal.some(m => movesMatch(m, next))) {
      apply(next)
      step.current += 1
    }
  }, [session, legal, apply])
}

/**
 * One saved game, addressed by its code. The store may already hold it (it was just started, or the
 * player came from the lobby); otherwise it is read from this browser's storage on the spot. The read is
 * synchronous, so the "not on this device" panel is only ever shown for a game that really is absent.
 */
function GameRoute({ code }: { code: string }) {
  const { session, resume } = useGame()
  const open = session !== null && session.code === code
  const stored = useMemo(() => open ? null : loadGame(code), [open, code])
  useEffect(() => {
    if (stored) resume(stored)
  }, [stored, resume])
  if (session !== null && session.code === code) {
    return session.state.winner !== null ? <GameOverScreen /> : <BoardScreen />
  }
  // one frame while the store adopts the game the line above just read
  return stored ? null : <UnknownGameScreen code={code} />
}

function Screens() {
  const route = useHashRoute()
  useDemoBootstrap()
  useDemoScript()
  // `#/play` was the board's address before games had codes; a bookmark from that version still lands
  // somewhere sensible, on the newest saved game or in the lobby.
  useEffect(() => {
    const target = playRedirect(route, latestGameCode())
    if (target !== null) navigate(target)
  }, [route])
  const code = codeFromRoute(route)
  if (code !== null) return <GameRoute code={code} />
  return <SetupScreen />
}

export default function App({ ticking = true }: { ticking?: boolean }) {
  return (
    <MusicProvider>
      <GameProvider ticking={ticking}>
        <Screens />
      </GameProvider>
    </MusicProvider>
  )
}
