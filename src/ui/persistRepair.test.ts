// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { toActionPhase } from '../engine/testUtils'
import { gameKey, loadGame, saveGame } from './persist'
import type { GameState } from '../engine/types'
import type { Session } from './store'

/**
 * Builds between the faction-ability wiring (Sep 2026) spread the players array into a plain object in
 * Scavenge, Guild Ships and Mitosis, so a game saved by one of them carries `players` as
 * `{ "0": ..., "1": ... }` and crashed on load. `normalise` rebuilds the array; this pins that rescue.
 */
function session(code: string): Session {
  return { code, seed: 7, minutes: 15, state: toActionPhase(), history: [toActionPhase(2)], clockMs: [123456, 654321], handoff: null, agendaResult: null }
}

function corruptPlayers(code: string): void {
  const raw = window.localStorage.getItem(gameKey(code))
  if (raw === null) throw new Error('nothing saved')
  const payload = JSON.parse(raw) as { state: GameState; history: GameState[] }
  payload.state.players = { ...payload.state.players } as unknown as GameState['players']
  payload.history = payload.history.map(h => ({ ...h, players: { ...h.players } as unknown as GameState['players'] }))
  window.localStorage.setItem(gameKey(code), JSON.stringify(payload))
}

describe('loadGame repair of array-corrupted players', () => {
  it('rebuilds the players array in the state and every history snapshot', () => {
    saveGame(session('RPAIR1'))
    corruptPlayers('RPAIR1')
    const saved = window.localStorage.getItem(gameKey('RPAIR1'))
    if (saved === null) throw new Error('nothing saved')
    expect(Array.isArray(JSON.parse(saved).state.players)).toBe(false)   // the corruption is real

    const loaded = loadGame('RPAIR1')
    if (loaded === null) throw new Error('game did not load')
    expect(Array.isArray(loaded.state.players)).toBe(true)
    expect(loaded.state.players.map(p => p.name)).toEqual(['A', 'B'])
    expect(loaded.history.length).toBe(1)
    expect(Array.isArray(loaded.history[0].players)).toBe(true)
  })

  it('drops the Nekro seat from a saved agenda vote order (the 6C6RRJ deadlock rescue)', () => {
    const s = session('RPAIR2')
    const base = s.state
    const nekroPlayers = base.players.map((p, i) => i === 1 ? { ...p, faction: 'nekro' as const } : p)
    s.state = {
      ...base, players: nekroPlayers, phase: 'agenda' as const, custodiansToken: false,
      agenda: { revealed: 'mutiny', slot: 1 as const, votes: {}, order: [1, 0], barredFromVoting: [] },
      active: 1,
    }
    saveGame(s)
    const loaded = loadGame('RPAIR2')
    if (loaded === null) throw new Error('game did not load')
    expect(loaded.state.agenda?.order).toEqual([0])
    expect(loaded.state.active).toBe(0)
  })
})
