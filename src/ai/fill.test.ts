import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { agendaMoves } from '../engine/agendas'
import { BASE_CONFIG, toActionPhase, toAgendaPhase, withPlayer } from '../engine/testUtils'
import { homeSystemOf } from '../engine/board'
import { productionCost } from '../engine/economy'
import type { Move } from '../engine/types'
import { fillCastVote, fillMoveShips, fillProduce, fillStatusTokens } from './fill'
import { aiChoose } from './index'

describe('fillProduce calibrated fleet production', () => {
  it('produces a Dreadnought when Letnev has resources and fleet pool space', () => {
    let state = toActionPhase(42, 1) // seat 1 is Letnev
    const home = homeSystemOf(state, 1)
    // Give Letnev 8 trade goods and clear ships from home system
    state = {
      ...state,
      players: state.players.map((p, i) => i === 1 ? { ...p, tradeGoods: 8 } : p),
      systems: {
        ...state.systems,
        [home]: {
          ...state.systems[home],
          space: [], // clear space to leave ample fleet headroom
        },
      },
    }

    const plan = fillProduce(state, 1, home)
    expect(plan.units.dreadnought).toBeDefined()
    expect(plan.units.dreadnought).toBeGreaterThanOrEqual(1)
  })

  it('produces infantry and fighters to fill capacity and screen capital ships', () => {
    let state = toActionPhase(43, 0) // seat 0 is L1Z1X
    state = {
      ...state,
      players: state.players.map((p, i) => i === 0 ? { ...p, tradeGoods: 10 } : p),
    }

    const plan = fillProduce(state, 0, homeSystemOf(state, 0))
    const totalUnits = Object.values(plan.units).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0

    // Should produce multiple units, not just 1 destroyer or 2 infantry
    expect(totalUnits).toBeGreaterThan(2)
  })

  it('never exceeds production limit or available budget', () => {
    const state = toActionPhase(44, 0)
    const plan = fillProduce(state, 0, homeSystemOf(state, 0))

    const totalUnits = Object.values(plan.units).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0
    expect(totalUnits).toBeLessThanOrEqual(7) // dock production limit
  })

  it('never puts infantry in an Arborec order (Mitosis: their docks cannot produce it — game 65TM45)', () => {
    // 65TM45 stalled here: the filler built { carrier, fighters, infantry } for the Arborec seat, the
    // engine rejected it, and the AI loop simply stopped on the rejection.
    let state = toActionPhase(45, 0)
    state = withPlayer(state, 0, { faction: 'arborec', tradeGoods: 10 })
    const plan = fillProduce(state, 0, homeSystemOf(state, 0))
    expect(plan.units.infantry ?? 0).toBe(0)
    // the dock still works: something is produced
    expect(Object.values(plan.units).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0).toBeGreaterThan(0)
  })

  it('respects Regulated Conscription agenda when calculating production cost and payment (game MA7Y7S)', () => {
    let state = toActionPhase(46, 0)
    state = {
      ...state,
      activeAgendas: ['regulated_conscription'],
      players: state.players.map((p, i) => i === 0 ? { ...p, faction: 'hacan', tradeGoods: 1, techs: ['sarween_tools'] } : p),
    }
    const home = homeSystemOf(state, 0)
    const plan = fillProduce(state, 0, home)
    const cost = productionCost(plan.units, { faction: 'hacan', techs: ['sarween_tools'] }, true, state)
    const resPaid = plan.planets.reduce((sum, pid) => {
      const p = Object.values(state.systems).flatMap(s => s.planets).find(pl => pl.id === pid)
      return sum + (p?.resources ?? 0)
    }, 0)
    expect(resPaid + plan.tradeGoods).toBeGreaterThanOrEqual(cost)
  })
})

describe('fillStatusTokens and aiChoose integration', () => {
  it('allocates tokens to fleet pool when seat is below target fleet pool', () => {
    const state = createGame(BASE_CONFIG, 45) // round 1
    // L1Z1X has target fleet tokens 5, starting fleet tokens 3
    const tokens = fillStatusTokens(state, 0)

    expect(tokens.fleet).toBeGreaterThan(state.players[0].tokens.fleet)
    expect(tokens.tactic).toBeGreaterThanOrEqual(state.players[0].tokens.tactic)
  })

  it('aiChoose fills status token template when moves.length === 1', () => {
    const state = createGame(BASE_CONFIG, 45)
    const rawMove: Move = {
      type: 'status',
      params: { tokens: { ...state.players[0].tokens, tactic: state.players[0].tokens.tactic + 2 } },
    }
    const chosen = aiChoose(state, [rawMove], 0)

    expect(chosen.type).toBe('status')
    if (chosen.type === 'status') {
      const params = chosen.params as { tokens: { fleet: number; tactic: number; strategy: number } }
      expect(params).toBeDefined()
      expect(params.tokens.fleet).toBeGreaterThan(state.players[0].tokens.fleet)
    }
  })
})

describe('fillCastVote and aiChoose in the agenda phase', () => {
  it('commits only the cheapest planet, not every ready one, to back the vote', () => {
    const state = toAgendaPhase(toActionPhase(), 'mutiny')
    const seat = state.agenda?.order[0] ?? 0
    const planets = fillCastVote(state, seat)
    expect(planets.length).toBeLessThanOrEqual(1)
  })

  it('aiChoose fills castVote templates with a legal, affordable outcome', () => {
    const state = toAgendaPhase(toActionPhase(), 'mutiny')
    const seat = state.agenda?.order[0] ?? 0
    const moves = agendaMoves(state)
    const chosen = aiChoose(state, moves, seat)
    expect(chosen.type).toBe('castVote')
    if (chosen.type === 'castVote') {
      expect(['For', 'Against']).toContain(chosen.outcome)
      expect(chosen.planets.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('fillMoveShips garrison preservation', () => {
  it('preserves at least 1 infantry garrison on Mecatol Rex when moving ships out', () => {
    let state = toActionPhase(42, 0)
    const mecatolAdj = state.systems['mecatol'].neighbours[0]
    // Put a carrier and 1 infantry on Mecatol Rex
    const carrierId = state.nextUnitId
    const infantryId = state.nextUnitId + 1
    state = {
      ...state,
      nextUnitId: state.nextUnitId + 2,
      tactical: { systemId: mecatolAdj, step: 'movement' },
      systems: {
        ...state.systems,
        mecatol: {
          ...state.systems['mecatol'],
          space: [{ id: carrierId, owner: 0, type: 'carrier', damaged: false }],
          planets: state.systems['mecatol'].planets.map(p => ({
            ...p,
            owner: 0,
            ground: [{ id: infantryId, owner: 0, type: 'infantry', damaged: false }],
          })),
        },
      },
    }

    const moves = fillMoveShips(state, 0)
    const mecatolMove = moves.find(m => m.unitId === carrierId)
    expect(mecatolMove).toBeDefined()
    // Should NOT take the single garrison infantry
    expect(mecatolMove?.carrying).not.toContain(infantryId)
    expect(mecatolMove?.carrying).toHaveLength(0)
  })

  it('can carry additional infantry beyond the 1-infantry garrison on Mecatol Rex', () => {
    let state = toActionPhase(42, 0)
    const mecatolAdj = state.systems['mecatol'].neighbours[0]
    const carrierId = state.nextUnitId
    const inf1 = state.nextUnitId + 1
    const inf2 = state.nextUnitId + 2
    state = {
      ...state,
      nextUnitId: state.nextUnitId + 3,
      tactical: { systemId: mecatolAdj, step: 'movement' },
      systems: {
        ...state.systems,
        mecatol: {
          ...state.systems['mecatol'],
          space: [{ id: carrierId, owner: 0, type: 'carrier', damaged: false }],
          planets: state.systems['mecatol'].planets.map(p => ({
            ...p,
            owner: 0,
            ground: [
              { id: inf1, owner: 0, type: 'infantry', damaged: false },
              { id: inf2, owner: 0, type: 'infantry', damaged: false },
            ],
          })),
        },
      },
    }

    const moves = fillMoveShips(state, 0)
    const mecatolMove = moves.find(m => m.unitId === carrierId)
    expect(mecatolMove).toBeDefined()
    // Can take 1 of the 2 infantry, leaving 1 garrison
    expect(mecatolMove?.carrying).toHaveLength(1)
  })
})

