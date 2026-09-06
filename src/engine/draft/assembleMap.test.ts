import { describe, expect, it } from 'vitest'
import { createDraftState, applyDraftPick, aiDraftPick } from './miltyDraft'
import { assembleDraftedGame } from './assembleMap'
import { createGame } from '../setup'
import { legalMoves } from '../legalMoves'

describe('Milty Draft assembleMap', () => {
  const players = [
    { name: 'Player 1', color: 'blue' as const, playerType: 'human' as const },
    { name: 'Player 2', color: 'red' as const, playerType: 'ai' as const },
    { name: 'Player 3', color: 'green' as const, playerType: 'ai' as const },
  ]

  it('assembles a playable game from a completed draft for 3 players', () => {
    let draft = createDraftState({
      playerCount: 3,
      players,
      seed: 1234,
    })

    while (!draft.isComplete) {
      const active = draft.pickSequence[draft.turnIndex]
      const pick = aiDraftPick(draft, active)
      const res = applyDraftPick(draft, pick)
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error(res.error)
      draft = res.value
    }

    const assembled = assembleDraftedGame(draft, 1234)
    expect(assembled.players).toHaveLength(3)
    expect(assembled.speaker).toBe(0)

    // The player who drafted Position 1 is at Seat 0
    const p1Index = Object.entries(draft.picks).find(([, p]) => p.position === 1)![0]
    expect(assembled.players[0].faction).toBe(draft.picks[Number(p1Index)].faction)

    // Every home system is present with correct seat
    const home0 = assembled.systems.find(s => s.home === 0)
    const home1 = assembled.systems.find(s => s.home === 1)
    const home2 = assembled.systems.find(s => s.home === 2)
    expect(home0).toBeDefined()
    expect(home1).toBeDefined()
    expect(home2).toBeDefined()

    // Mecatol Rex is at 0, 0
    const mecatol = assembled.systems.find(s => s.id === 'mecatol')
    expect(mecatol).toBeDefined()
    expect(mecatol?.q).toBe(0)
    expect(mecatol?.r).toBe(0)

    // Verify game engine initializes cleanly and has legal moves
    const gameState = createGame({
      players: assembled.players,
      speaker: assembled.speaker,
      systems: assembled.systems,
    }, 1234)

    expect(gameState.phase).toBe('strategy')
    const moves = legalMoves(gameState)
    expect(moves.length).toBeGreaterThan(0)
  })

  it('assembles a full 6-player board with all 37 hexes placed', () => {
    const sixPlayers = [
      { name: 'P1', color: 'blue' as const, playerType: 'human' as const },
      { name: 'P2', color: 'red' as const, playerType: 'ai' as const },
      { name: 'P3', color: 'green' as const, playerType: 'ai' as const },
      { name: 'P4', color: 'yellow' as const, playerType: 'ai' as const },
      { name: 'P5', color: 'purple' as const, playerType: 'ai' as const },
      { name: 'P6', color: 'black' as const, playerType: 'ai' as const },
    ]

    let draft = createDraftState({
      playerCount: 6,
      players: sixPlayers,
      seed: 8888,
    })

    while (!draft.isComplete) {
      const active = draft.pickSequence[draft.turnIndex]
      const pick = aiDraftPick(draft, active)
      const res = applyDraftPick(draft, pick)
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error(res.error)
      draft = res.value
    }

    const assembled = assembleDraftedGame(draft, 8888)
    expect(assembled.players).toHaveLength(6)
    // In 6p, full radius-3 hex is 37 cells
    expect(assembled.systems).toHaveLength(37)

    // Check that every system has neighbours
    for (const sys of assembled.systems) {
      expect(sys.neighbours.length).toBeGreaterThanOrEqual(2)
      expect(sys.neighbours.length).toBeLessThanOrEqual(6)
    }

    // Verify game starts without errors
    const gameState = createGame({
      players: assembled.players,
      speaker: assembled.speaker,
      systems: assembled.systems,
    }, 8888)

    expect(gameState.phase).toBe('strategy')
    expect(Object.keys(gameState.systems)).toHaveLength(37)
  })

  it('assembles a playable map for 4 and 5 players with filler tiles', () => {
    for (const count of [4, 5]) {
      const pList = Array.from({ length: count }, (_, i) => ({
        name: `P${i + 1}`,
        color: ['blue', 'red', 'green', 'yellow', 'purple'][i] as any,
        playerType: 'ai' as const,
      }))

      let draft = createDraftState({
        playerCount: count,
        players: pList,
        seed: 5000 + count,
      })

      while (!draft.isComplete) {
        const active = draft.pickSequence[draft.turnIndex]
        const pick = aiDraftPick(draft, active)
        const res = applyDraftPick(draft, pick)
        expect(res.ok).toBe(true)
        if (!res.ok) throw new Error(res.error)
        draft = res.value
      }

      const assembled = assembleDraftedGame(draft, 5000 + count)
      expect(assembled.players).toHaveLength(count)
      expect(assembled.systems).toHaveLength(37)

      const state = createGame({
        players: assembled.players,
        speaker: assembled.speaker,
        systems: assembled.systems,
      }, 5000 + count)
      expect(state.phase).toBe('strategy')
    }
  })
})
