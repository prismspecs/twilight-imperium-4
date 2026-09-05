// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { toActionPhase } from '../engine/testUtils'
import {
  CODE_ALPHABET, INDEX_KEY, LEGACY_KEY, MAX_GAMES,
  deleteGame, gameKey, hasGame, latestGameCode, listGames, loadGame, newGameCode, saveGame,
} from './persist'
import type { Session } from './store'

function session(code: string, clockMs: [number, number] = [123456, 654321]): Session {
  return { code, seed: 7, minutes: 15, state: toActionPhase(), history: [], clockMs, handoff: null }
}

describe('the saved games of one browser', () => {
  it('round-trips seed, clocks, state and history under the game code', () => {
    saveGame(session('ABC234'))
    const loaded = loadGame('ABC234')
    expect(loaded?.code).toBe('ABC234')
    expect(loaded?.seed).toBe(7)
    expect(loaded?.clockMs).toEqual([123456, 654321])
    expect(loaded?.state.phase).toBe('action')
    expect(loaded?.state.systems['home-n'].space).toHaveLength(5)
    expect(loaded?.handoff).toBeNull()
  })

  it('keeps two games side by side, each under its own key', () => {
    saveGame(session('AAA222'))
    saveGame(session('BBB333', [1000, 2000]))
    expect(loadGame('AAA222')?.clockMs).toEqual([123456, 654321])
    expect(loadGame('BBB333')?.clockMs).toEqual([1000, 2000])
    expect(hasGame('AAA222')).toBe(true)
    expect(hasGame('CCC444')).toBe(false)
  })

  it('indexes the games newest first, with the names and the round', () => {
    saveGame(session('AAA222'))
    saveGame(session('BBB333'))
    const listed = listGames()
    expect(listed.map(g => g.code)).toEqual(['BBB333', 'AAA222'])
    expect(listed[0].names).toEqual(['A', 'B'])
    expect(listed[0].round).toBe(1)
    expect(listed[0].updatedAt).toBeGreaterThan(0)
    expect(latestGameCode()).toBe('BBB333')
    // saving the older game again moves it back to the front
    saveGame(session('AAA222'))
    expect(latestGameCode()).toBe('AAA222')
  })

  it(`keeps at most ${String(MAX_GAMES)} games and drops the payloads it prunes`, () => {
    const codes = Array.from({ length: MAX_GAMES + 2 }, (_, i) => `G${String(i).padStart(5, '0')}`)
    for (const code of codes) saveGame(session(code))
    const listed = listGames().map(g => g.code)
    expect(listed).toHaveLength(MAX_GAMES)
    expect(listed[0]).toBe(codes[codes.length - 1])
    expect(listed).not.toContain(codes[0])
    expect(listed).not.toContain(codes[1])
    expect(window.localStorage.getItem(gameKey(codes[0]))).toBeNull()
    expect(window.localStorage.getItem(gameKey(codes[codes.length - 1]))).not.toBeNull()
  })

  it('deletes one game without touching the others', () => {
    saveGame(session('KEE222'))
    saveGame(session('DEL222'))
    deleteGame('DEL222')
    expect(loadGame('DEL222')).toBeNull()
    expect(loadGame('KEE222')?.seed).toBe(7)
    expect(listGames().map(g => g.code)).toEqual(['KEE222'])
  })

  it('R8: a game saved before the trade posts had names loads with a pair, not a crash', () => {
    saveGame(session('OLD333'))
    const raw = JSON.parse(window.localStorage.getItem(gameKey('OLD333')) ?? '') as { state: Record<string, unknown> }
    delete raw.state.posts
    delete raw.state.postAbilityUsed
    raw.state.version = 2
    window.localStorage.setItem(gameKey('OLD333'), JSON.stringify(raw))
    const loaded = loadGame('OLD333')
    expect(loaded).not.toBeNull()
    expect(loaded?.state.posts.west).not.toBe(loaded?.state.posts.east)
    expect(loaded?.state.postAbilityUsed).toEqual({ west: false, east: false })
    expect(loaded?.state.version).toBe(4)
  })

  it('R3.2: a game saved before turnDone existed loads with the flag cleared, not rejected', () => {
    // exactly what a deployed payload from before that change looks like: no `turnDone`, in the state and in
    // every history entry the undo stack still holds
    saveGame({ ...session('OLD222'), history: [session('OLD222').state] })
    const raw = JSON.parse(window.localStorage.getItem(gameKey('OLD222')) ?? '') as {
      state: Record<string, unknown>; history: Record<string, unknown>[]
    }
    delete raw.state.turnDone
    delete raw.history[0].turnDone
    window.localStorage.setItem(gameKey('OLD222'), JSON.stringify(raw))
    const loaded = loadGame('OLD222')
    expect(loaded).not.toBeNull()
    expect(loaded?.state.turnDone).toBe(false)
    expect(loaded?.history[0].turnDone).toBe(false)
  })

  it('migrates the single game of the first version to a coded game', () => {
    const legacy = { version: 1, seed: 42, minutes: 20, clockMs: [1000, 2000], state: toActionPhase(), history: [] }
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy))
    const listed = listGames()
    expect(listed).toHaveLength(1)
    expect(listed[0].code).toHaveLength(6)
    expect([...listed[0].code].every(c => CODE_ALPHABET.includes(c))).toBe(true)
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    const migrated = loadGame(listed[0].code)
    expect(migrated?.seed).toBe(42)
    expect(migrated?.minutes).toBe(20)
    expect(migrated?.clockMs).toEqual([1000, 2000])
    expect(migrated?.state.phase).toBe('action')
  })

  it('ignores an empty, broken or foreign payload instead of throwing', () => {
    expect(loadGame('NOPE22')).toBeNull()
    window.localStorage.setItem(gameKey('BAD222'), 'not json')
    expect(loadGame('BAD222')).toBeNull()
    window.localStorage.setItem(gameKey('OLD222'), JSON.stringify({ version: 99, state: {} }))
    expect(loadGame('OLD222')).toBeNull()
    window.localStorage.setItem(INDEX_KEY, 'not json')
    expect(listGames()).toEqual([])
    window.localStorage.setItem(LEGACY_KEY, 'not json')
    expect(listGames()).toEqual([])
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('survives a blocked or full storage', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => { saveGame(session('FUL222')) }).not.toThrow()
    blocked.mockRestore()
    expect(loadGame('FUL222')).toBeNull()
  })
})

describe('the game code', () => {
  it('is six characters that cannot be misread aloud', () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/)
    for (let i = 0; i < 200; i += 1) {
      const code = newGameCode(() => false)
      expect(code).toHaveLength(6)
      expect([...code].every(c => CODE_ALPHABET.includes(c))).toBe(true)
    }
  })

  it('is drawn again when it collides with a game this browser already holds', () => {
    const values = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let i = 0
    const random = vi.spyOn(Math, 'random').mockImplementation(() => values[i++] ?? 0.5)
    expect(newGameCode(code => code === 'AAAAAA')).toBe('SSSSSS')
    random.mockRestore()

  })
})

describe('a game saved by an older version of the rules', () => {
  it('is dropped instead of loaded, and disappears from the list', () => {
    saveGame(session('OLDONE'))
    expect(loadGame('OLDONE')).toBeTruthy()
    // the shape of version 1: the objectives and the player fields it carried are gone
    const raw = JSON.parse(window.localStorage.getItem('md:game:OLDONE') ?? '{}') as { state: { version: number } }
    raw.state.version = 1
    window.localStorage.setItem('md:game:OLDONE', JSON.stringify(raw))
    expect(loadGame('OLDONE')).toBeNull()
    expect(listGames().map(g => g.code)).not.toContain('OLDONE')
  })
})
