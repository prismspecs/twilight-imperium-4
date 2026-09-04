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
export const TEST_CODE = 'TESTAA'

export function renderWithSession(state: GameState, node: ReactNode, options?: { seed?: number; clockMs?: number[] }) {
  const view = render(<GameProvider ticking={false}><Probe />{node}</GameProvider>)
  act(() => {
    const session: Session = {
      code: TEST_CODE, seed: options?.seed ?? 7, minutes: 15, state, history: [],
      clockMs: options?.clockMs ?? state.players.map(() => 900000), handoff: null,
    }
    current?.resume(session)
  })
  return {
    ...view,
    store(): GameStore {
      if (!current) throw new Error('the probe never saw the store')
      return current
    },
  }
}
