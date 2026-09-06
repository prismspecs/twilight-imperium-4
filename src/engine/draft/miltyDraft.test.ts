import { describe, expect, it } from 'vitest'
import {
  createDraftState,
  applyDraftPick,
  availablePicksFor,
  aiDraftPick,
} from './miltyDraft'

describe('Milty Draft State Machine', () => {
  const samplePlayers = [
    { name: 'Alice', color: 'blue' as const, playerType: 'human' as const },
    { name: 'Bob (AI)', color: 'red' as const, playerType: 'ai' as const },
    { name: 'Charlie (AI)', color: 'green' as const, playerType: 'ai' as const },
  ]

  it('initializes draft state with correct snake sequence for 3 players', () => {
    const draft = createDraftState({
      playerCount: 3,
      players: samplePlayers,
      seed: 42,
    })

    expect(draft.playerCount).toBe(3)
    expect(draft.turnIndex).toBe(0)
    expect(draft.isComplete).toBe(false)
    // 3 players * 3 rounds = 9 picks
    expect(draft.pickSequence).toHaveLength(9)

    // Round 1: 0, 1, 2
    // Round 2: 2, 1, 0
    // Round 3: 0, 1, 2
    expect(draft.pickSequence).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2])

    expect(draft.factionsPool.length).toBeGreaterThanOrEqual(6)
    expect(draft.slicesPool.length).toBeGreaterThanOrEqual(4)
    expect(draft.positionsPool).toHaveLength(3)
  })

  it('allows active player to draft a faction and claims it', () => {
    let draft = createDraftState({
      playerCount: 3,
      players: samplePlayers,
      seed: 42,
    })

    const initialFactions = [...draft.factionsPool]
    const chosenFaction = initialFactions[0]

    const res = applyDraftPick(draft, {
      playerIndex: 0,
      kind: 'faction',
      value: chosenFaction,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.error)
    draft = res.value
    expect(draft.picks[0].faction).toBe(chosenFaction)
    expect(draft.claimedFactions).toContain(chosenFaction)
    expect(draft.turnIndex).toBe(1)

    // Player 0 cannot draft another faction
    const picksP0 = availablePicksFor(draft, 0)
    expect(picksP0.canPickFaction).toBe(false)
  })

  it('rejects illegal picks (wrong turn, already claimed, already picked category)', () => {
    let draft = createDraftState({
      playerCount: 3,
      players: samplePlayers,
      seed: 42,
    })

    // Wrong player turn
    const wrongTurn = applyDraftPick(draft, {
      playerIndex: 1,
      kind: 'faction',
      value: draft.factionsPool[0],
    })
    expect(wrongTurn.ok).toBe(false)

    // Valid pick for Player 0
    const p0Pick = applyDraftPick(draft, {
      playerIndex: 0,
      kind: 'position',
      value: 1, // Speaker
    })
    expect(p0Pick.ok).toBe(true)
    if (!p0Pick.ok) throw new Error(p0Pick.error)
    draft = p0Pick.value

    // Player 1 tries to pick already claimed Position 1
    const claimedPick = applyDraftPick(draft, {
      playerIndex: 1,
      kind: 'position',
      value: 1,
    })
    expect(claimedPick.ok).toBe(false)
  })

  it('runs an entire automated draft with AI and verifies completion invariants', () => {
    let draft = createDraftState({
      playerCount: 3,
      players: samplePlayers,
      seed: 777,
    })

    while (!draft.isComplete) {
      const activePlayerIndex = draft.pickSequence[draft.turnIndex]
      const pick = aiDraftPick(draft, activePlayerIndex)
      const res = applyDraftPick(draft, pick)
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error(res.error)
      draft = res.value
    }

    expect(draft.isComplete).toBe(true)
    expect(draft.turnIndex).toBe(9)

    // Every player has 1 faction, 1 slice, and 1 position
    for (let p = 0; p < 3; p++) {
      expect(draft.picks[p].faction).toBeDefined()
      expect(draft.picks[p].sliceId).toBeDefined()
      expect(draft.picks[p].position).toBeDefined()
    }

    // Every picked faction, slice, and position is unique
    const factions = Object.values(draft.picks).map(p => p.faction)
    const slices = Object.values(draft.picks).map(p => p.sliceId)
    const positions = Object.values(draft.picks).map(p => p.position)

    expect(new Set(factions).size).toBe(3)
    expect(new Set(slices).size).toBe(3)
    expect(new Set(positions).size).toBe(3)
  })
})
