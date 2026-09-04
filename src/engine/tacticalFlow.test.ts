import { describe, expect, it } from 'vitest'
import { unitStats } from '../data/units'
import { checkFleet } from './board'
import { capacity, fleetPoolLimit, nonFighterShips, productionCost } from './economy'
import { applyMove, legalMoves, validateMove } from './index'
import { movableShips } from './movement'
import { createGame, unitsOf } from './setup'
import { DUEL_CONFIG, cardsUsed, deepFreeze, toActionPhase, withPlayer, withTactical, withUnits } from './testUtils'
import type { GameState, Move, Seat } from './types'

function draft(state: GameState): GameState {
  let s = state
  while (s.phase === 'strategy') {
    const r = applyMove(s, legalMoves(s)[0], 0)
    if (!r.ok) throw new Error(r.error)
    s = r.value
  }
  return s
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** Starts the next action round: tokens back, planets ready, command tokens off the map. */
function nextRound(state: GameState): GameState {
  const systems = Object.fromEntries(Object.entries(state.systems).map(([id, sys]) => [id, {
    ...sys, activatedBy: [], planets: sys.planets.map(p => ({ ...p, exhausted: false })),
  }]))
  const players = state.players.map(p => ({
    ...p, passed: false, tokens: { ...p.tokens, tactic: 3 }, strategyCards: p.strategyCards.map(c => ({ ...c, used: true })),
  })) as GameState['players']
  return deepFreeze({ ...state, phase: 'action', round: state.round + 1, players, systems, tactical: null, turnDone: false, active: state.speaker })
}

function invariants(state: GameState): void {
  const units = [...unitsOf(state, 0), ...unitsOf(state, 1), ...unitsOf(state, 'guardian')]
  expect(new Set(units.map(u => u.id)).size).toBe(units.length)
  for (const u of units) expect([0, 1, 'guardian']).toContain(u.owner)
  for (const p of state.players) {
    expect(p.tradeGoods).toBeGreaterThanOrEqual(0)
    expect(Math.min(p.tokens.tactic, p.tokens.fleet, p.tokens.strategy)).toBeGreaterThanOrEqual(0)
    for (const n of Object.values(p.reinforcements)) expect(n).toBeGreaterThanOrEqual(0)
  }
  // the engine's own capacity and fleet-pool rule, so the smoke run can never drift from checkFleet
  for (const sys of Object.values(state.systems)) {
    if (state.tactical?.step === 'spaceCombat' && state.tactical.systemId === sys.id) continue   // cargo is trimmed when the combat ends
    for (const seat of [0, 1] as Seat[]) {
      if (!sys.space.some(u => u.owner === seat)) continue
      const fleet = checkFleet(state, seat, sys.id)
      expect(fleet.ok || fleet.error).toBe(true)
    }
  }
}

/** Turns a template move into a concrete one; falls back to the step's closing move. */
function fill(state: GameState, move: Move, rng: () => number): Move {
  const tac = state.tactical
  const seat = state.active
  const player = state.players[seat]
  const stats = { faction: player.faction, techs: player.techs }
  if (move.type === 'moveShips') {
    if (!tac) return { type: 'endMovement' }
    const dest = state.systems[tac.systemId]
    const mineThere = dest.space.filter(u => u.owner === seat)
    const room = fleetPoolLimit(player) - nonFighterShips(dest.space, seat)
    for (const option of shuffle(movableShips(state, seat), rng)) {
      const ship = state.systems[option.from].space.find(u => u.id === option.unitId)
      if (!ship || ship.type === 'fighter' || room < 1) continue
      const free = capacity([...mineThere, ship], seat, stats) - mineThere.filter(u => u.type === 'infantry' || u.type === 'fighter').length
      const slots = Math.max(0, Math.min(free, unitStats(ship.type, stats).capacity))
      const cargo = state.systems[option.from].planets.flatMap(p => p.ground.filter(u => u.owner === seat)).slice(0, slots).map(u => u.id)
      return { type: 'moveShips', moves: [{ unitId: option.unitId, from: option.from, carrying: cargo }] }
    }
    return { type: 'endMovement' }
  }
  if (move.type === 'produce') {
    if (player.reinforcements.infantry < 1) return { type: 'endTactical' }
    const cost = productionCost({ infantry: 1 }, stats, player.techs.includes('sarween_tools'))
    const planets: string[] = []
    let paid = 0
    for (const sys of Object.values(state.systems)) for (const p of sys.planets) {
      if (paid >= cost) continue
      if (p.owner === seat && !p.exhausted) { planets.push(p.id); paid += p.resources }
    }
    if (paid < cost) return { type: 'endTactical' }
    return { type: 'produce', units: { infantry: 1 }, planets, tradeGoods: 0 }
  }
  return move
}

describe('tactical legal moves', () => {
  it('enumerates every tactical step', () => {
    const base = withUnits(toActionPhase(3), 'mecatol', 1, ['destroyer'])
    const start = applyMove(base, { type: 'startTactical', systemId: 'mecatol' }, 1)
    if (!start.ok) throw new Error(start.error)
    const rng = () => 0.5
    const movement = legalMoves(start.value)
    expect(movement.some(m => m.type === 'moveShips')).toBe(true)
    expect(movement.some(m => m.type === 'endMovement')).toBe(true)
    expect(validateMove(start.value, { type: 'moveShips', moves: [{ unitId: 1, from: 'home-n', carrying: [] }] }).ok).toBe(true)
    const moved = applyMove(start.value, fill(start.value, { type: 'moveShips', moves: [] }, rng), 1)
    if (!moved.ok) throw new Error(moved.error)
    const combat = applyMove(moved.value, { type: 'endMovement' }, 1)
    if (!combat.ok) throw new Error(combat.error)
    expect(combat.value.tactical?.step).toBe('spaceCombat')
    expect(legalMoves(combat.value).some(m => m.type === 'combatRound')).toBe(true)
    const invading = withTactical(combat.value, { systemId: 'mecatol', step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 } })
    expect(legalMoves(invading).some(m => m.type === 'endInvasion')).toBe(true)
    const producing = withTactical(combat.value, { systemId: 'home-n', step: 'production' })
    expect(legalMoves(producing).some(m => m.type === 'produce')).toBe(true)
    expect(legalMoves(producing).some(m => m.type === 'endTactical')).toBe(true)
  })
  it('R4.1 step 6: Munitions Reserves is enumerated only from round 1, per side and for both sides at once', () => {
    const base = toActionPhase(3)
    const cleared: GameState = { ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, space: [] } } }
    const staged = withUnits(withUnits(cleared, 'bereg', 0, ['cruiser']), 'bereg', 1, ['cruiser'])
    const bothLetnev = withPlayer(withPlayer(staged, 0, { faction: 'letnev', tradeGoods: 2 }), 1, { tradeGoods: 2 })
    const atRound = (round: number) => withTactical(bothLetnev, {
      systemId: 'bereg', step: 'spaceCombat',
      combat: { round, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] },
    })
    expect(legalMoves(atRound(0)).every(m => m.type !== 'combatRound' || m.munitions === undefined)).toBe(true)
    const variants = legalMoves(atRound(1)).filter(m => m.type === 'combatRound' && m.munitions !== undefined)
    expect(variants).toHaveLength(3)   // attacker only, defender only, both sides
    for (const move of variants) expect(applyMove(atRound(1), move, 7).ok).toBe(true)
  })
  it('R4.1 step 4: a queued assignment is the only enumerated move, and playing it carries the round on', () => {
    const base = toActionPhase(3)
    const cleared: GameState = { ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, space: [] } } }
    const staged = withUnits(withUnits(cleared, 'bereg', 0, ['cruiser', 'cruiser']), 'bereg', 1, ['dreadnought', 'fighter', 'fighter'])
    const s = withTactical(staged, {
      systemId: 'bereg', step: 'spaceCombat',
      combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] },
    })
    const fought = applyMove(s, { type: 'combatRound' }, 3)   // seed 3: one hit for the attacker, none for the defender
    if (!fought.ok) throw new Error(fought.error)
    const moves = legalMoves(fought.value)
    expect(moves.map(m => m.type)).toEqual(['assignHits'])
    expect(validateMove(fought.value, { type: 'combatRound' }).ok).toBe(false)
    const assigned = applyMove(fought.value, moves[0], 3)
    if (!assigned.ok) throw new Error(assigned.error)
    expect(assigned.value.tactical?.combat?.pending).toEqual([])
    expect(assigned.value.tactical?.combat?.round).toBe(2)
    expect(legalMoves(assigned.value).some(m => m.type === 'combatRound')).toBe(true)
  })
  it('R4.3: endInvasion is not enumerated while a ground combat is pending', () => {
    const base = toActionPhase(3)
    const mecatol = base.systems.mecatol
    const landed = deepFreeze({
      ...base,
      systems: { ...base.systems, mecatol: { ...mecatol, planets: mecatol.planets.map(p => ({ ...p, ground: [{ id: 899, type: 'infantry' as const, owner: 1 as Seat, damaged: false }, { id: 900, type: 'infantry' as const, owner: 0 as Seat, damaged: false }] })) } },
      tactical: { systemId: 'mecatol', step: 'invasion' as const, invasion: { planetId: 'mecatol-rex', landed: [900], bombarded: [], round: 0 } },
    })
    const moves = legalMoves(landed)
    expect(moves.some(m => m.type === 'groundCombatRound')).toBe(true)
    expect(moves.some(m => m.type === 'endInvasion')).toBe(false)
    for (const move of moves) expect(applyMove(landed, move, 1).ok).toBe(true)
  })
  it('a whole tactical action can be played from the enumerator alone', () => {
    const rng = () => 0.5
    let s = cardsUsed(toActionPhase(4))
    const start = applyMove(s, { type: 'startTactical', systemId: 'bereg' }, 1)
    if (!start.ok) throw new Error(start.error)
    s = start.value
    for (let i = 0; i < 30 && s.tactical; i++) {
      const moves = legalMoves(s)
      expect(moves.length).toBeGreaterThan(0)
      const r = applyMove(s, fill(s, moves[moves.length - 1], rng), 50 + i)
      if (!r.ok) throw new Error(r.error)
      s = r.value
      invariants(s)
    }
    expect(s.tactical).toBeNull()
    // R3.2: the action is over, the turn is not; the enumerator now offers the handover instead
    expect(s.active).toBe(0)
    expect(s.turnDone).toBe(true)
    expect(legalMoves(s)).toContainEqual({ type: 'endTurn' })
    const ended = applyMove(s, { type: 'endTurn' }, 99)
    if (!ended.ok) throw new Error(ended.error)
    expect(ended.value.active).toBe(1)
  })
  it('a seeded 200-move run keeps every invariant', () => {
    let s = cardsUsed(draft(createGame(DUEL_CONFIG, 9)))
    let seedState = 12345
    const rng = () => { seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0; return seedState / 4294967296 }
    let applied = 0
    let attempts = 0
    let rejected = 0
    for (let i = 0; i < 200; i++) {
      if (s.phase !== 'action') { s = nextRound(s); continue }
      const moves = shuffle(legalMoves(s), rng)
      if (!moves.length) { s = nextRound(s); continue }
      let next: GameState | null = null
      for (const move of moves) {
        attempts++
        const r = applyMove(s, fill(s, move, rng), 1000 + i)
        if (r.ok) { next = r.value; break }
        // a thrown error is an engine bug, not a rules rejection: fail loudly instead of counting it as soft
        if (r.internal) throw new Error(`internal engine error on ${move.type}: ${r.error}`)
        rejected++
      }
      expect(next).not.toBeNull()
      if (!next) break
      s = next
      applied++
      invariants(s)
    }
    expect(applied).toBeGreaterThan(120)
    expect(rejected).toBeLessThanOrEqual(Math.ceil(attempts * 0.05))
    expect(s.log.filter(e => e.t === 'roll').length).toBeGreaterThan(0)
    expect(s.round).toBeGreaterThan(1)
  })
})
