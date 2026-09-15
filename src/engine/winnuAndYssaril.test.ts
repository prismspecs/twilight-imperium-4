import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { drawActionCards, discardActionCard, stallTactics } from './actionCards'
import { land } from './invasion'
import { legalMoves } from './legalMoves'
import { createGame } from './setup'
import type { GameConfig, GameState } from './types'

function makeTestGame(p0Faction: 'winnu' | 'yssaril' | 'sol', p1Faction: 'letnev' | 'winnu' = 'letnev'): GameState {
  const cfg: GameConfig = {
    players: [
      { faction: p0Faction, color: 'blue', name: 'Player 0' },
      { faction: p1Faction, color: 'red', name: 'Player 1' },
    ],
    speaker: 0,
  }
  return createGame(cfg, 42)
}

describe('Winnu: Blood Ties and Reclamation', () => {
  it('Blood Ties: Winnu can remove Custodians token from Mecatol Rex for 0 influence (LRR Winnu Blood Ties)', () => {
    const s = makeTestGame('winnu')
    // Set up Mecatol Rex tactical invasion step with 1 infantry in space
    const mecatolSysId = Object.keys(s.systems).find(id => {
      const sys = s.systems[id]
      return sys.planets.some(p => p.id === 'mecatol-rex' || p.id === 'mecatolrex' || p.id === 'mr' || p.name === 'Mecatol Rex')
    })!

    const withInfantry: GameState = {
      ...s,
      custodiansToken: true,
      active: 0,
      phase: 'action',
      players: [
        { ...s.players[0], tradeGoods: 0, vp: 0 }, // 0 trade goods
        s.players[1],
      ],
      // Exhaust all planets so Winnu has 0 ready influence
      systems: {
        ...s.systems,
        [mecatolSysId]: {
          ...s.systems[mecatolSysId],
          space: [{ id: 999, owner: 0, type: 'infantry', damaged: false }],
        },
      },
      tactical: {
        systemId: mecatolSysId,
        step: 'invasion',
        invasion: { planetId: null, landed: [], bombarded: [], round: 0 },
      },
    }

    // Exhaust all player 0 planets
    for (const [id, sys] of Object.entries(withInfantry.systems)) {
      withInfantry.systems[id] = {
        ...sys,
        planets: sys.planets.map(p => p.owner === 0 ? { ...p, exhausted: true } : p),
      }
    }

    // Check legal moves: removeCustodians is legal for Winnu even with 0 influence
    const moves = legalMoves(withInfantry)
    expect(moves.some(m => m.type === 'removeCustodians')).toBe(true)

    // Remove custodians
    const res = applyMove(withInfantry, { type: 'removeCustodians' }, 1)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.custodiansToken).toBe(false)
    expect(res.value.players[0].vp).toBe(1)
    expect(res.value.log.some(l => 'text' in l && l.text.includes('Blood Ties'))).toBe(true)
  })

  it('Blood Ties: Non-Winnu player without 6 influence cannot remove Custodians', () => {
    const s = makeTestGame('sol')
    const mecatolSysId = Object.keys(s.systems).find(id => {
      const sys = s.systems[id]
      return sys.planets.some(p => p.id === 'mecatol-rex' || p.id === 'mecatolrex' || p.id === 'mr' || p.name === 'Mecatol Rex')
    })!

    const withInfantry: GameState = {
      ...s,
      custodiansToken: true,
      active: 0,
      phase: 'action',
      players: [
        { ...s.players[0], tradeGoods: 0, vp: 0 },
        s.players[1],
      ],
      systems: {
        ...s.systems,
        [mecatolSysId]: {
          ...s.systems[mecatolSysId],
          space: [{ id: 999, owner: 0, type: 'infantry', damaged: false }],
        },
      },
      tactical: {
        systemId: mecatolSysId,
        step: 'invasion',
        invasion: { planetId: null, landed: [], bombarded: [], round: 0 },
      },
    }
    // Exhaust all planets
    for (const [id, sys] of Object.entries(withInfantry.systems)) {
      withInfantry.systems[id] = {
        ...sys,
        planets: sys.planets.map(p => p.owner === 0 ? { ...p, exhausted: true } : p),
      }
    }

    const moves = legalMoves(withInfantry)
    expect(moves.some(m => m.type === 'removeCustodians')).toBe(false)
  })

  it('Reclamation: Winnu landing and gaining control of Mecatol Rex places a PDS and a Space Dock from reinforcements', () => {
    const s = makeTestGame('winnu')
    const mecatolSysId = Object.keys(s.systems).find(id => {
      const sys = s.systems[id]
      return sys.planets.some(p => p.id === 'mecatol-rex' || p.id === 'mecatolrex' || p.id === 'mr' || p.name === 'Mecatol Rex')
    })!
    const mecatolPlanet = s.systems[mecatolSysId].planets.find(p => p.name === 'Mecatol Rex')!

    const pdsBefore = s.players[0].reinforcements.pds
    const dockBefore = s.players[0].reinforcements.spacedock

    const landingState: GameState = {
      ...s,
      custodiansToken: false, // Custodians already removed
      active: 0,
      phase: 'action',
      systems: {
        ...s.systems,
        [mecatolSysId]: {
          ...s.systems[mecatolSysId],
          space: [{ id: 999, owner: 0, type: 'infantry', damaged: false }],
        },
      },
      tactical: {
        systemId: mecatolSysId,
        step: 'invasion',
        invasion: { planetId: null, landed: [], bombarded: [], round: 0 },
      },
    }

    const landed = land(landingState, mecatolPlanet.id, [999], 1)
    expect(landed.ok).toBe(true)
    if (!landed.ok) return

    const updatedMecatol = landed.value.systems[mecatolSysId].planets.find(p => p.id === mecatolPlanet.id)!
    expect(updatedMecatol.owner).toBe(0)

    // Check that PDS and Space Dock were placed on Mecatol Rex
    const pds = updatedMecatol.structures.find(str => str.type === 'pds' && str.owner === 0)
    const dock = updatedMecatol.structures.find(str => str.type === 'spacedock' && str.owner === 0)
    expect(pds).toBeDefined()
    expect(dock).toBeDefined()

    // Check reinforcements decremented
    expect(landed.value.players[0].reinforcements.pds).toBe(pdsBefore - 1)
    expect(landed.value.players[0].reinforcements.spacedock).toBe(dockBefore - 1)

    // Check log
    expect(landed.value.log.some(l => 'text' in l && l.text.includes('Reclamation'))).toBe(true)
  })
})

describe('Yssaril: Crafty, Scheming, and Stall Tactics', () => {
  it('Crafty: Yssaril player has no hand limit and is not queued for discard above 7 cards', () => {
    const s = makeTestGame('yssaril')
    // Give Yssaril 7 cards initially
    const initialHand = ['direct_hit', 'sabotage', 'flank_speed', 'morale_boost', 'shields_holding', 'infiltrate', 'bunker']
    const fullState: GameState = {
      ...s,
      players: [
        { ...s.players[0], actionCards: initialHand },
        s.players[1],
      ],
    }

    // Draw 1 card (count 0 draw won't trigger, count 1 triggers +1 from Scheming)
    // Non-Yssaril drawing with 9 cards would have pendingActionCardDiscards
    const nonYssaril = makeTestGame('sol')
    const drawnSol = drawActionCards({
      ...nonYssaril,
      players: [{ ...nonYssaril.players[0], actionCards: initialHand }, nonYssaril.players[1]],
    }, 0, 2, 10)
    expect(drawnSol.pendingActionCardDiscards).toContain(0)

    // Yssaril drawing has NO pendingActionCardDiscards (only pendingSchemingDiscards)
    const drawnYssaril = drawActionCards(fullState, 0, 1, 10)
    expect(drawnYssaril.pendingActionCardDiscards).toBeUndefined()
    expect(drawnYssaril.players[0].actionCards.length).toBe(9) // 7 + 2 drawn (1 requested + 1 Scheming)
    expect(drawnYssaril.pendingSchemingDiscards).toContain(0)
  })

  it('Scheming: Yssaril draws +1 card and must choose and discard 1 card', () => {
    const s = makeTestGame('yssaril')
    const drawn = drawActionCards(s, 0, 2, 10)
    // Requested 2 cards -> draws 3 cards
    expect(drawn.players[0].actionCards.length).toBe(3)
    expect(drawn.pendingSchemingDiscards).toContain(0)

    // Must discard 1 card
    const cardToDiscard = drawn.players[0].actionCards[0]
    const discarded = discardActionCard(drawn, cardToDiscard, 0)
    expect(discarded.ok).toBe(true)
    if (!discarded.ok) return

    expect(discarded.value.players[0].actionCards.length).toBe(2)
    expect(discarded.value.pendingSchemingDiscards).toBeUndefined()
    expect(discarded.value.actionCardDiscard).toContain(cardToDiscard)
  })

  it('Stall Tactics: Yssaril can discard 1 action card as an action to spend their turn', () => {
    const s = makeTestGame('yssaril')
    const withCards: GameState = {
      ...s,
      phase: 'action',
      active: 0,
      turnDone: false,
      players: [
        { ...s.players[0], actionCards: ['sabotage_1', 'flank_speed_1'] },
        s.players[1],
      ],
    }

    const moves = legalMoves(withCards)
    const stallMoves = moves.filter(m => m.type === 'stallTactics')
    expect(stallMoves).toHaveLength(2)

    // Execute Stall Tactics
    const res = applyMove(withCards, { type: 'stallTactics', cardId: 'sabotage_1' }, 1)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.turnDone).toBe(true)
    expect(res.value.players[0].actionCards).toEqual(['flank_speed_1'])
    expect(res.value.actionCardDiscard).toContain('sabotage_1')
    expect(res.value.log.some(l => 'text' in l && l.text.includes('Stall Tactics'))).toBe(true)
  })

  it('Stall Tactics: Non-Yssaril cannot use Stall Tactics', () => {
    const s = makeTestGame('sol')
    const withCards: GameState = {
      ...s,
      phase: 'action',
      active: 0,
      turnDone: false,
      players: [
        { ...s.players[0], actionCards: ['sabotage'] },
        s.players[1],
      ],
    }

    const res = stallTactics(withCards, 'sabotage', 0)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('only Yssaril')
  })
})
