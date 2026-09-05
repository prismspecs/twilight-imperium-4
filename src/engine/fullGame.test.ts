import { describe, expect, it } from 'vitest'
import { FACTIONS } from '../data/factions'
import { homeSystemId } from '../data/map'
import { PUBLIC_OBJECTIVES } from '../data/objectives'
import { otherSeat } from './actionPhase'
import { checkFleet } from './board'
import { applyMove, legalMoves, validateMove } from './index'
import { createGame, unitsOf } from './setup'
import { DUEL_CONFIG, fillTemplate, shuffle, toActionPhase, toStatusPhase, withCards, withExhausted, withPlanetOwner, withPlayer, withTechs } from './testUtils'
import type { GameState, Move, Seat, StrategyCardId } from './types'

const MAX_MOVES = 3000
const CLOSERS: readonly Move['type'][] = ['pass', 'status', 'endTactical', 'endTurn', 'endMovement', 'endInvasion', 'secondary']
// the only two kinds legalMoves still leaves as templates (docs/spec/engine-design.md, Contract); every other
// enumerated move is already concrete, so it must never be rejected by the handler that offered it
const TEMPLATE_TYPES: readonly Move['type'][] = ['moveShips', 'produce']

function invariants(state: GameState, landed: Map<string, Set<Seat>>): void {
  const units = [...unitsOf(state, 0), ...unitsOf(state, 1), ...unitsOf(state, 'guardian')]
  expect(new Set(units.map(u => u.id)).size).toBe(units.length)
  for (const u of units) expect(u.id).toBeLessThan(state.nextUnitId)
  expect(state.round).toBeLessThanOrEqual(8)
  // R3.3 step 2 reveals before the victory check, so a finished round may be one ahead; the pool of five
  // runs out before round 6 does, and nothing is revealed after that
  expect(state.publicObjectives.length).toBeGreaterThanOrEqual(Math.min(state.round, PUBLIC_OBJECTIVES.length))
  expect(state.publicObjectives.length).toBeLessThanOrEqual(PUBLIC_OBJECTIVES.length)
  expect(state.publicObjectives).toEqual(state.objectiveOrder.slice(0, state.publicObjectives.length))
  expect(state.phase === 'ended').toBe(state.winner !== null)
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat]
    expect(Math.min(p.vp, p.tradeGoods, p.commodities, p.tokens.tactic, p.tokens.fleet, p.tokens.strategy)).toBeGreaterThanOrEqual(0)
    for (const n of Object.values(p.reinforcements)) expect(n).toBeGreaterThanOrEqual(0)
    expect(p.vp).toBeGreaterThanOrEqual(p.scoredObjectives.length)
    for (const id of p.scoredObjectives) {
      expect(state.publicObjectives.includes(id) || p.secretObjectives.includes(id)).toBe(true)
    }
  }
  for (const sys of Object.values(state.systems)) {
    for (const seat of [0, 1] as Seat[]) {
      // a controlled planet outside your home system still holds your units, or you landed there earlier
      for (const planet of sys.planets) {
        if (planet.owner !== seat || sys.id === homeSystemId(seat)) continue
        const held = planet.ground.some(u => u.owner === seat) || planet.structures.some(u => u.owner === seat)
        expect(held || landed.get(planet.id)?.has(seat) === true).toBe(true)
      }
      if (state.tactical?.step === 'spaceCombat' && state.tactical.systemId === sys.id) continue   // cargo is trimmed when combat ends
      if (!sys.space.some(u => u.owner === seat)) continue
      // the engine's own capacity and fleet-pool rule (a dock's free slots, I or II, included), so the smoke
      // run can never drift from checkFleet
      expect(checkFleet(state, seat, sys.id).ok).toBe(true)
    }
  }
}

/**
 * What an applied move proves about coverage: the kind, plus the card for a strategic action or a secondary
 * answer (an accepted secondary is a different code path from a declined one) and the post for a trade.
 */
function signature(move: Move): string {
  if (move.type === 'strategic') return `strategic:${move.card}`
  if (move.type === 'secondary') return `secondary:${move.card}:${move.accept ? 'accept' : 'decline'}`
  if (move.type === 'tradePost') return `tradePost:${move.post}`
  if (move.type === 'postAbility') return `postAbility:${move.post}`
  return move.type
}

interface GameRun {
  state: GameState
  moves: number
  attempts: number
  rejectedTemplate: number
  rejectedConcrete: number
  signatures: Set<string>
  templateAttempts: number
  degradations: number
}

/** Plays one complete game with seeded random legal moves and checks the invariants after every move. */
function playGame(seed: number): GameRun {
  let bits = (seed * 2654435761) >>> 0
  const rng = () => { bits = (Math.imul(bits, 1664525) + 1013904223) >>> 0; return bits / 4294967296 }
  let state = createGame(DUEL_CONFIG, seed)
  const landed = new Map<string, Set<Seat>>()
  let moves = 0
  let attempts = 0
  let rejectedTemplate = 0
  let rejectedConcrete = 0
  let templateAttempts = 0
  let degradations = 0
  const signatures = new Set<string>()
  while (state.phase !== 'ended' && moves < MAX_MOVES) {
    const options = legalMoves(state)
    expect(options.length).toBeGreaterThan(0)
    // after half the budget the driver prefers the moves that close a turn, so every game terminates
    const closer = moves > MAX_MOVES / 2 ? options.find(m => CLOSERS.includes(m.type)) : undefined
    const order = closer ? [closer, ...shuffle(options, rng)] : shuffle(options, rng)
    let next: GameState | null = null
    for (const option of order) {
      const move = fillTemplate(state, option, rng)
      // a template that cannot be filled in degrades to the closing move of its step; too many of those and the
      // smoke run would only look like it exercises movement and production
      if (TEMPLATE_TYPES.includes(option.type)) {
        templateAttempts++
        if (move.type !== option.type) degradations++
      }
      attempts++
      const r = applyMove(state, move, 1000 + moves)
      if (!r.ok) {
        if (r.internal) throw new Error(`internal error on ${move.type}: ${r.error}`)   // a bug, not an illegal move
        // every concrete kind is offered by legalMoves already playable, so only a template fill-in may miss
        if (TEMPLATE_TYPES.includes(move.type)) rejectedTemplate++
        else rejectedConcrete++
        continue
      }
      // a planet that changes hands stops counting as "landed"; whoever now owns it took control this move
      // (`resolveControl` is the sole place that sets `owner`, from a `land`, `bombard` or `groundCombatRound`
      // move that clears the last defender while an earlier landing already stands alone on the planet)
      for (const sys of Object.values(r.value.systems)) {
        for (const planet of sys.planets) {
          if (planet.owner === state.systems[sys.id].planets.find(p => p.id === planet.id)?.owner) continue
          landed.delete(planet.id)
          if (planet.owner !== null) landed.set(planet.id, new Set([planet.owner]))
        }
      }
      signatures.add(signature(move))
      next = r.value
      break
    }
    expect(next).not.toBeNull()
    if (!next) break
    state = next
    moves++
    invariants(state, landed)
  }
  return { state, moves, attempts, rejectedTemplate, rejectedConcrete, signatures, templateAttempts, degradations }
}

describe('legal moves in every phase', () => {
  it('R3.2: the action phase offers activations, strategy cards, component actions and passing', () => {
    let s = withCards(withCards(toActionPhase(), 1, []), 0, ['technology', 'imperial'])
    s = withTechs(s, 0, ['inheritance_systems'])
    s = withPlanetOwner(s, 'bereg', 'bereg', 0)
    const moves = legalMoves(s)
    expect(moves.filter(m => m.type === 'startTactical')).toHaveLength(7)
    expect(moves.some(m => m.type === 'strategic' && m.card === 'technology')).toBe(true)
    expect(moves.some(m => m.type === 'strategic' && m.card === 'imperial')).toBe(true)
    expect(moves.some(m => m.type === 'research')).toBe(true)
    expect(moves.some(m => m.type === 'tradePost' && m.post === 'east')).toBe(true)
    expect(moves.some(m => m.type === 'pass')).toBe(false)          // two unused cards
    for (const move of moves) expect(applyMove(s, move, 5).ok).toBe(true)
  })
  it('R3.2: the secondary window offers exactly the two answers, even after passing', () => {
    // spent down first: a responder already at full commodities would only see accept: false (see the
    // Trade-specific test below), so this generic test needs accept: true to actually do something
    const base = withPlayer(withCards(withCards(toActionPhase(), 0, ['trade']), 1, []), 1, { commodities: 0 })
    const played = applyMove(base, { type: 'strategic', card: 'trade' }, 0)
    if (!played.ok) throw new Error(played.error)
    const moves = legalMoves(played.value)
    expect(moves).toHaveLength(2)
    expect(moves.every(m => m.type === 'secondary')).toBe(true)
    expect(legalMoves(withPlayer(played.value, 1, { passed: true }))).toHaveLength(2)
    for (const move of moves) expect(applyMove(played.value, move, 5).ok).toBe(true)
    expect(validateMove(played.value, { type: 'pass' }).ok).toBe(false)
  })
  it('R3.3: the status phase offers one status template per player', () => {
    const s = toStatusPhase(toActionPhase())
    const moves = legalMoves(s)
    expect(moves).toEqual([{ type: 'status', params: { tokens: { tactic: 5, fleet: 3, strategy: 2 } } }])
    expect(applyMove(s, moves[0], 5).ok).toBe(true)
    expect(validateMove(s, { type: 'status', params: { tokens: { tactic: 3, fleet: 4, strategy: 3 } } }).ok).toBe(true)
  })
  it('R3.2: the responder to Trade is not offered accept when shareWithOpponent already replenished them', () => {
    const base = withCards(withCards(toActionPhase(), 0, ['trade']), 1, [])
    const played = applyMove(base, { type: 'strategic', card: 'trade', params: { shareWith: [1] } }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.players[1].commodities).toBe(FACTIONS[played.value.players[1].faction].commodityValue)
    const moves = legalMoves(played.value)
    expect(moves).toEqual([{ type: 'secondary', card: 'trade', accept: false }])
  })
  it('R3.2: the Leadership secondary is not offered when there is no influence and no trade good to spend', () => {
    const base = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, [])
    const broke = withExhausted(base, ['arc-prime', 'wren-terra'])          // seat 1 has 0 ready influence
    const played = applyMove(broke, { type: 'strategic', card: 'leadership' }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(legalMoves(played.value)).toEqual([{ type: 'secondary', card: 'leadership', accept: false }])
    // one trade good is one influence, so accepting is worth offering again
    const rich = applyMove(withPlayer(broke, 1, { tradeGoods: 1 }), { type: 'strategic', card: 'leadership' }, 0)
    if (!rich.ok) throw new Error(rich.error)
    expect(legalMoves(rich.value)).toHaveLength(2)
  })
  it('R3.2: a window whose card holder is the active seat still offers the decline that closes it', () => {
    const played = applyMove(withCards(withCards(toActionPhase(), 0, ['trade']), 1, []), { type: 'strategic', card: 'trade' }, 0)
    if (!played.ok) throw new Error(played.error)
    expect(legalMoves({ ...played.value, active: 0 })).toEqual([{ type: 'secondary', card: 'trade', accept: false }])
  })
  it('engine-design contract: validateMove matches structurally, not by JSON', () => {
    const s = withCards(toActionPhase(), 0, ['technology'])
    expect(validateMove(s, { type: 'strategic', card: 'technology', params: { techId: 'sarween_tools', planets: [] } }).ok).toBe(true)
    expect(validateMove(s, { type: 'strategic', card: 'imperial' }).ok).toBe(false)
    expect(validateMove(s, { type: 'startTactical', systemId: 'bereg' }).ok).toBe(true)
    expect(validateMove(s, { type: 'startTactical', systemId: 'nowhere' }).ok).toBe(false)
    expect(validateMove(s, { type: 'tradePost', post: 'west', commodities: 1 }).ok).toBe(false)
    expect(validateMove({ ...s, phase: 'ended', winner: 0 }, { type: 'pass' }).ok).toBe(false)
  })
})

// The seeds past the Fibonacci run are coverage ballast: every rules or flow change reshuffles these
// deterministic playthroughs, so the tail is retuned whenever one of them stops reaching a rare move kind.
// Two sessions have retuned it on the same day, which is why the list is longer than it looks it should be.
// 203 came in with the 20 base public objectives: shuffling 10 base objectives reshuffled
// the deterministic paths, and seed 203 exercises both `bombard` and `groundCombatRound`.
// 238 came in when Technology stopped offering the card holder a secondary on their own card: that extra
// legal move had been nudging the RNG draw onto a path that reached `bombard`; none of the other seeds did.
// 24 and 27 came in with the action card deck: an "ACTION:" card in hand is one more legal move on every
// turn, which reshuffled the paths again and left no seed reaching `bombard` or accepting the Trade
// secondary. 24 reaches `bombard`, `groundCombatRound` and `retreat`; 27 accepts the Trade secondary.
// 19 came in with Politics and Construction: eight cards in the pool means a different draft and a
// different path again, and 19 is the seed that still reaches `groundCombatRound` and an accepted Trade
// secondary.
const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 8, 13, 21, 34, 40, 55, 71, 89, 203, 238, 24, 27, 19]
const RUNS = new Map<number, GameRun>()

/** The smoke games are shared by the tests below, so each seed is actually played only once. */
function runGame(seed: number): GameRun {
  const cached = RUNS.get(seed)
  if (cached) return cached
  const run = playGame(seed)
  RUNS.set(seed, run)
  return run
}

const ALL_MOVE_TYPES: readonly Move['type'][] = [
  'pickStrategyCard', 'startTactical', 'moveShips', 'endMovement', 'combatRound', 'assignHits', 'retreat', 'bombard',
  'land', 'groundCombatRound', 'endInvasion', 'produce', 'endTactical', 'endTurn', 'strategic', 'secondary', 'research',
  'shipyard', 'tradePost', 'postAbility', 'playActionCard', 'pass', 'status',
]
const ALL_CARDS: readonly StrategyCardId[] = ['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial']

/**
 * Two move kinds random legal play never reaches in these seeds, left out rather than faked:
 * `research` needs Inheritance Systems, itself two yellow technologies deep, which no seeded game buys inside
 * six rounds; `shipyard` is legal only while the seat controls no space dock, and the printed home dock is only
 * lost when the home planet is invaded, which never happens either. Both have their own unit tests.
 */
const UNREACHABLE: readonly Move['type'][] = ['research', 'shipyard']

/** Log events whose code paths the smoke run must have taken at least once across the seeds. */
const COUNTERS: readonly [string, RegExp][] = [
  ['commodities sold at a post', /sells \d+ commodities at the (west|east) post/],
  ['custodians token started', /^Game started with Custodians token/],
  ['technology researched', /^seat \d researches /],
  ['trade posts rolled', /^Trade posts: /],
  ['a post ability used', /^seat \d uses .+ at the (west|east) post/],
]

describe('R3.1 to R3.3 full game', () => {
  // this first test pays for every seed's full playthrough (the rest reuse RUNS); the appended coverage seeds
  // (see SEEDS above) push it close to the default 5s timeout under parallel load, so it gets its own.
  it('plays every seeded game to the end and keeps every invariant', { timeout: 30000 }, () => {
    let byPoints = 0
    let byRound8 = 0
    for (const seed of SEEDS) {
      const { state, moves, attempts, rejectedTemplate, rejectedConcrete } = runGame(seed)
      expect(state.phase).toBe('ended')
      // proves the turn-closing bias past MAX_MOVES / 2 never actually has to engage
      expect(moves).toBeLessThan(MAX_MOVES / 2)
      expect(state.round).toBeLessThanOrEqual(8)
      // a concrete move is offered already playable, so the handler that offered it may never refuse it
      expect(rejectedConcrete).toBe(0)
      expect(rejectedTemplate).toBeLessThanOrEqual(Math.ceil(attempts * 0.05))
      expect(state.log.filter(e => e.t === 'move').length).toBe(moves)
      const winner = state.winner
      expect(winner).not.toBeNull()
      if (winner === null) continue
      // A game ends either because someone reached 10 VP or because the round 8 status phase decided it
      if (state.players[winner].vp >= 10) byPoints++
      else {
        expect(state.round).toBe(8)
        expect(state.players[winner].vp).toBeGreaterThanOrEqual(state.players[otherSeat(winner)].vp)
        byRound8++
      }
    }
    expect(byPoints + byRound8).toBe(SEEDS.length)
  })
  it('the seeds exercise every reachable move kind, every card and the log events behind them', () => {
    const union = new Set<string>()
    const counters = new Map<string, number>()
    let templateAttempts = 0
    let degradations = 0
    for (const seed of SEEDS) {
      const run = runGame(seed)
      for (const s of run.signatures) union.add(s)
      templateAttempts += run.templateAttempts
      degradations += run.degradations
      for (const [name, re] of COUNTERS) {
        counters.set(name, (counters.get(name) ?? 0) + run.state.log.filter(e => e.t === 'info' && re.test(e.text)).length)
      }
    }
    const kinds = [...union].map(s => s.split(':')[0])
    for (const type of ALL_MOVE_TYPES) {
      if (UNREACHABLE.includes(type)) continue
      expect(kinds, `move kind ${type} was never applied`).toContain(type)
    }
    for (const card of ALL_CARDS) {
      expect([...union], `${card} was never played as a primary`).toContain(`strategic:${card}`)
      expect([...union], `${card} was never accepted as a secondary`).toContain(`secondary:${card}:accept`)
    }
    for (const [name] of COUNTERS) expect(counters.get(name) ?? 0, `${name} never happened`).toBeGreaterThanOrEqual(1)
    // the two template kinds must mostly fill in, otherwise the run only looks like it moves ships and produces
    expect(templateAttempts).toBeGreaterThan(0)
    expect(degradations * 2).toBeLessThan(templateAttempts)
  })
  it('the log replays: the logged moves and their logged seeds rebuild the final state', () => {
    for (const seed of [1, 13, 89]) {
      const { state } = runGame(seed)
      let replayed = createGame(DUEL_CONFIG, seed)
      // the log carries the seed of every move, so a replay needs nothing the engine did not record
      for (const entry of state.log) {
        if (entry.t !== 'move') continue
        const r = applyMove(replayed, entry.move, entry.seed)
        if (!r.ok) throw new Error(`replay rejected ${entry.move.type}: ${r.error}`)
        replayed = r.value
      }
      expect(replayed).toEqual(state)
    }
  })
})

