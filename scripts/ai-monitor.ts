/**
 * Six AI seats play full games; every move is checked against the LRR and against cross-move state
 * invariants, and every discrepancy lands in docs/ai-monitor-report.md.
 *
 * This is the "watch a whole game closely" harness the debug log cannot give: it re-verifies movement
 * paths with an independent search (LRR 58 move value, LRR 10/57/81 anomalies, LRR 1659.2 no moving
 * through enemy ships), tracks the R3.2 secondary protocol seat by seat, the R10 agenda vote order and
 * outcome application, R9 action-card bookkeeping, and the physical invariants (units never vanish,
 * fleet pool, hand limit, duplicate techs).
 *
 * Usage:
 *   npm run ai:monitor              # seeds 1..3
 *   npm run ai:monitor -- 10        # seeds 1..10
 */
import { writeFileSync } from 'node:fs'
import { aiChoose } from '../src/ai'
import { PERSONALITIES } from '../src/ai/score'
import { applyMove, checkFleet, createGame, fleetPoolLimit, legalMoves, winningOutcome } from '../src/engine'
import { neighbours } from '../src/engine/adjacency'
import { anomaliesOf } from '../src/engine/movement'
import { wormholesLinked } from '../src/engine/effects'
import { nonFighterShips } from '../src/engine/economy'
import { deriveSeed } from '../src/engine/rng'
import { isShip, unitStats } from '../src/data/units'
import { AGENDAS } from '../src/data/agendas'
import type { FactionId, GameConfig, GameState, Move, Seat, System, Unit, UnitType } from '../src/engine/types'

const WEIGHTS = Object.values(PERSONALITIES)
const MAX_MOVES = 4000
const FACTION_SETS: FactionId[][] = [
  ['l1z1x', 'letnev', 'sol', 'hacan', 'jolnar', 'xxcha'],
  ['naalu', 'arborec', 'saar', 'creuss', 'nekro', 'yssaril'],
  ['muaat', 'mentak', 'sardakk', 'winnu', 'yin', 'letnev'],
]
const COLOURS = ['blue', 'red', 'green', 'yellow', 'purple', 'black'] as const
const STOCK_TYPES: UnitType[] = ['infantry', 'fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship', 'pds', 'spacedock', 'floating_factory']

interface Problem {
  seed: number
  round: number
  moveIndex: number
  seat: Seat | null
  phase: GameState['phase']
  move: string
  category: string
  rule: string
  description: string
  trail: string[]
}

interface GameStats {
  seed: number
  factions: string
  finished: boolean
  winner: Seat | null
  rounds: number
  moves: number
  lawsPassed: number
  actionCardsPlayed: number
  techsResearched: number
  combats: number
  notEnforced: number
}

interface GameResult { stats: GameStats; problems: Problem[] }

function config(factions: FactionId[]): GameConfig {
  return {
    speaker: 0,
    players: factions.map((faction, seat) => ({ faction, color: COLOURS[seat], name: `P${seat}`, playerType: 'ai' })),
  }
}

function moveJson(move: Move): string {
  try {
    return JSON.stringify(move)
  } catch {
    return move.type
  }
}

function stateHash(state: GameState): string {
  return JSON.stringify(state, (key, value) => (key === 'log' ? undefined : value))
}

function shortState(state: GameState): string {
  return `round ${state.round}, phase ${state.phase}, active seat ${state.active}`
    + (state.tactical ? `, tactical/${state.tactical.step}` : '')
    + (state.pendingSecondary ? `, secondary(${state.pendingSecondary.card}, queue ${state.pendingSecondary.queue.length})` : '')
    + (state.agenda ? `, agenda(${state.agenda.revealed})` : '')
}

/** Everything the seat owns — board and reinforcements — per unit type. */
function stockOf(state: GameState, seat: Seat): Partial<Record<UnitType, number>> {
  const out: Partial<Record<UnitType, number>> = {}
  const add = (type: UnitType, n: number) => { out[type] = (out[type] ?? 0) + n }
  for (const sys of Object.values(state.systems)) {
    for (const u of sys.space) if (u.owner === seat) add(u.type, 1)
    for (const p of sys.planets) {
      for (const u of p.ground) if (u.owner === seat) add(u.type, 1)
      for (const u of p.structures) if (u.owner === seat) add(u.type, 1)
    }
  }
  const player = state.players[seat]
  if (player) for (const [type, n] of Object.entries(player.reinforcements)) add(type as UnitType, n)
  return out
}

/**
 * Independent re-verification of reachability. Deliberately does NOT call the engine's
 * shortestPath/passable: it re-derives the rules from the LRR so a bug in the engine's search shows up
 * as a disagreement.
 * - LRR 58: a ship moves up to its move value; one step per system entered.
 * - LRR 10/57/81: supernovas impassable (Muaat units excepted — Nova Seed), asteroid fields need
 *   Antimass Deflectors, nebulae cannot be passed through as waypoints (Shared Research allows it).
 * - LRR 1659.2: a ship may not move through a system containing another player's ships.
 * - Gravity Rift notes: a rift exited or passed through (never the destination) refunds its own step.
 * - Enforced Travel Ban: wormhole adjacency off; Lost Star Chart: alpha/beta count as one class.
 */
function independentReach(state: GameState, seat: Seat, fromId: string, toId: string, moveValue: number): boolean {
  if (fromId === toId || moveValue < 1) return false
  const player = state.players[seat]
  if (!player) return false
  const faction = player.faction
  const linkAlphaBeta = wormholesLinked(state, seat)
  const enforcedTravelBan = (state.activeAgendas ?? []).includes('enforced_travel_ban') && !(state.activeAgendas ?? []).includes('wormhole_reconstruction')
  const sharedResearch = (state.activeAgendas ?? []).includes('shared_research')
  const antimass = player.techs.includes('antimass_deflectors')

  const enterable = (id: string, destination: boolean): boolean => {
    const sys = state.systems[id]
    if (!sys) return false
    const anoms = anomaliesOf(sys)
    if (anoms.includes('supernova') && faction !== 'muaat') return false
    if (anoms.includes('asteroid_field') && !antimass) return false
    if (!destination && anoms.includes('nebula') && !sharedResearch) return false
    // R9 In The Silence Of Space: the seat's ships starting in the system the card named ignore fleets on
    // the whole path, so the waypoint block does not apply to this move (effects.ts ignoresFleets).
    const silence = state.effects.some(e => e.seat === seat && e.effect === 'in_the_silence_of_space' && e.scope === 'tactical' && e.systemId === fromId)
    if (!destination && !enforcedTravelBan && !silence && sys.space.some(u => u.owner !== seat && isShip(u.type))) return false
    return true
  }

  // Dijkstra: edge cost 1, but a gravity rift exited or passed through costs 0 (LRR Gravity Rift 1).
  const ids = Object.keys(state.systems)
  const dist = new Map<string, number>(ids.map(id => [id, Infinity]))
  dist.set(fromId, 0)
  const done = new Set<string>()
  for (;;) {
    let cur: string | null = null
    let best = Infinity
    for (const id of ids) {
      if (done.has(id)) continue
      const d = dist.get(id) ?? Infinity
      if (d < best) { best = d; cur = id }
    }
    if (cur === null || cur === toId) break
    done.add(cur)
    const du = dist.get(cur) ?? Infinity
    if (!Number.isFinite(du)) continue
    const sys = state.systems[cur]
    const edge = sys && anomaliesOf(sys).includes('gravity_rift') ? 0 : 1
    for (const n of neighbours(state.systems, cur, faction, linkAlphaBeta && !enforcedTravelBan, state)) {
      if (n === fromId) continue
      if (!enterable(n, n === toId)) continue
      const nd = du + edge
      if (nd < (dist.get(n) ?? Infinity)) dist.set(n, nd)
    }
  }
  return (dist.get(toId) ?? Infinity) <= moveValue
}

/** Move value for one ship, re-derived from unit stats + the effects that modify it (LRR 58, R9 Flank Speed, Creuss Slipstream, Gravity Drive). */
function moveValueOf(state: GameState, seat: Seat, unit: Unit, gravityDriveAvailable: boolean): number {
  const player = state.players[seat]
  if (!player) return 0
  const base = unitStats(unit.type, { faction: player.faction, techs: player.techs }).move
  if (base <= 0) return 0
  let value = base
  if (state.effects.some(e => e.seat === seat && e.effect === 'flank_speed' && e.scope === 'tactical')) value += 1
  const sysId = Object.entries(state.systems).find(([, s]) => s.space.some(u => u.id === unit.id))?.[0]
  if (player.faction === 'creuss' && sysId !== undefined) {
    const home = Object.values(state.systems).find(s => s.home === seat)?.id
    if (sysId === home || state.systems[sysId].wormhole !== null) value += 1
  }
  if (gravityDriveAvailable && player.techs.includes('gravity_drive')) value += 1
  return value
}

interface WindowTrack { card: string; owner: Seat; queue: Seat[]; answered: Seat[] }

class GameMonitor {
  readonly problems: Problem[] = []
  initialStock: Partial<Record<UnitType, number>>[] = []
  private trail: string[] = []
  private roundNum = 0
  private moveNum = 0
  private lawCount = 0
  private actionCardCount = 0
  private techCount = 0
  private combatCount = 0
  private notEnforcedCount = 0

  constructor(readonly seed: number) {}

  record(seat: Seat | null, phase: GameState['phase'], move: string, category: string, rule: string, description: string) {
    this.problems.push({
      seed: this.seed, round: this.roundNum, moveIndex: this.moveNum, seat, phase, move,
      category, rule, description, trail: [...this.trail.slice(-6)],
    })
  }

  note(state: GameState, moveIndex: number, text: string) {
    this.roundNum = state.round
    this.moveNum = moveIndex
    this.trail.push(`r${state.round} m${moveIndex} seat${state.active} ${text}`)
    if (this.trail.length > 8) this.trail.shift()
  }

  counts() {
    return { laws: this.lawCount, cards: this.actionCardCount, techs: this.techCount, combats: this.combatCount, notEnforced: this.notEnforcedCount }
  }

  /** Invariants that must hold after EVERY move, whatever the move was. */
  checkInvariants(before: GameState, after: GameState, move: Move) {
    const mj = moveJson(move)
    // A player owns each gained technology exactly once (LRR 2611.1 "Researching Technology").
    for (const p of after.players) {
      const dupes = p.techs.filter((t, i) => p.techs.indexOf(t) !== i)
      if (dupes.length) {
        this.record(p.seat, after.phase, mj, 'duplicate-tech', 'LRR 2611.1 (a player owns each technology card once)',
          `seat ${p.seat} (${p.faction}) holds duplicates: ${[...new Set(dupes)].join(', ')} — techs list has ${p.techs.length} entries`)
      }
    }
    // VP never drops (LRR 25) — except the 1 VP a Shard of the Throne / Crown of Emphidia transfer takes
    // from the previous owner (game-rules.md 9.3; the log line names the transfer).
    for (const p of after.players) {
      const b = before.players[p.seat]
      if (b && p.vp < b.vp) {
        const newLog = after.log.slice(before.log.length)
        const transferred = newLog.some(e => e.t === 'info' && (/transfers to /.test(e.text) || /Holy Planet of Ixth: .* loses 1 VP/.test(e.text)))
        if (!(transferred && b.vp - p.vp === 1)) {
          this.record(p.seat, after.phase, mj, 'vp-decreased', 'LRR 25 (victory points)',
            `seat ${p.seat} VP went ${b.vp} → ${p.vp}`)
        }
      }
    }
    // Unit identities unique; nextUnitId beyond all of them.
    const seen = new Map<number, string>()
    for (const [id, sys] of Object.entries(after.systems)) {
      const units: Unit[] = [...sys.space]
      for (const p of sys.planets) units.push(...p.ground, ...p.structures)
      for (const u of units) {
        const prev = seen.get(u.id)
        if (prev !== undefined) {
          const owner = u.owner === 'guardian' ? null : u.owner
          this.record(owner, after.phase, mj, 'unit-id-duplicate', 'LRR 17 (each unit is one physical object)',
            `unit ${u.id} (${u.type}) sits in both ${prev} and ${id}`)
        } else {
          seen.set(u.id, id)
        }
      }
    }
    for (const [id] of seen) {
      if (id >= after.nextUnitId) {
        this.record(null, after.phase, mj, 'unit-id-range', 'LRR 17',
          `unit ${id} on the board is not below nextUnitId ${after.nextUnitId}`)
      }
    }
    // Units never appear from nothing nor vanish: destroyed units go back to the reinforcements (LRR 17.6)
    // and produced units come out of them (LRR 75), so a seat's per-type total (board + reinforcements) is
    // constant for the whole game.
    for (const p of after.players) {
      const now = stockOf(after, p.seat)
      const was = stockOf(before, p.seat)
      const init = this.initialStock[p.seat]
      for (const type of STOCK_TYPES) {
        const a = now[type] ?? 0
        const b = was[type] ?? 0
        const i = init?.[type]
        if (a > b) {
          this.record(p.seat, after.phase, mj, 'unit-count-increase', 'LRR 17.6 / LRR 75 (production takes units from the reinforcements)',
            `seat ${p.seat} (${p.faction}) went from ${b} to ${a} ${type}${a - b > 1 ? ` (+${a - b})` : ''} in one move without producing`)
        }
        if (i !== undefined && a !== i) {
          this.record(p.seat, after.phase, mj, 'unit-stock-drift', 'LRR 17.6 (destroyed units return to the reinforcements; production draws from them)',
            `seat ${p.seat} (${p.faction}) owns ${a} ${type} but started the game with ${i} — units were created from nothing or lost`)
        }
      }
    }
    // Fleet pool per system (LRR 27.2).
    for (const [id, sys] of Object.entries(after.systems)) {
      for (const p of after.players) {
        const ships = nonFighterShips(sys.space, p.seat)
        if (ships > fleetPoolLimit(p)) {
          this.record(p.seat, after.phase, mj, 'fleet-pool-exceeded', 'LRR 27.2 (fleet pool)',
            `seat ${p.seat} has ${ships} non-fighter ships in ${id} but a fleet pool of ${fleetPoolLimit(p)}`)
        }
        // The engine's own capacity/pool arithmetic, applied to every system after every move: the board
        // should never REST holding a fleet that checkFleet rejects (LRR 27.2, LRR 91 capacity). Mid-combat
        // states are exempt: a destroyed carrier's fighters stay until the combat ends, which is when the
        // engine trims them (R4.1 step 4).
        const midCombat = after.tactical !== null && (after.tactical.combat !== undefined || after.tactical.invasion !== undefined)
        if (!midCombat && sys.space.some(u => u.owner === p.seat) && (p.reinforcements !== undefined)) {
          const fleet = checkFleet(after, p.seat, id)
          if (!fleet.ok) {
            this.record(p.seat, after.phase, mj, 'fleet-invalid', `LRR 27.2/91 (${fleet.error})`,
              `seat ${p.seat}'s fleet in ${id} fails checkFleet: ${fleet.error} — some earlier move left it over capacity or pool and nothing trimmed it`)
          }
        }
      }
    }
    // Hand limit (LRR 112). Yssaril Crafty: "You have no hand limit for action cards." — exempt.
    for (const p of after.players) {
      const pending = (after.pendingActionCardDiscards?.length ?? 0) + (after.pendingSchemingDiscards?.length ?? 0)
      if (p.actionCards.length > 7 && pending === 0 && p.faction !== 'yssaril') {
        this.record(p.seat, after.phase, mj, 'hand-limit', 'LRR 112 (hand limit 7, excess discarded immediately)',
          `seat ${p.seat} holds ${p.actionCards.length} action cards with no pending discard obligation`)
      }
    }
    // A system carries at most one token per seat (LRR 57.3).
    for (const [id, sys] of Object.entries(after.systems)) {
      const dupes = sys.activatedBy.filter((s, i) => sys.activatedBy.indexOf(s) !== i)
      if (dupes.length) {
        this.record(dupes[0] as Seat, after.phase, mj, 'double-activation', 'LRR 57.3',
          `system ${id} carries seat(s) ${[...new Set(dupes)].join(',')} more than once in activatedBy`)
      }
    }
    // Pools never go negative (LRR 20).
    for (const p of after.players) {
      const negatives: string[] = []
      if (p.tokens.tactic < 0) negatives.push(`tactic ${p.tokens.tactic}`)
      if (p.tokens.fleet < 0) negatives.push(`fleet ${p.tokens.fleet}`)
      if (p.tokens.strategy < 0) negatives.push(`strategy ${p.tokens.strategy}`)
      if (p.tradeGoods < 0) negatives.push(`tradeGoods ${p.tradeGoods}`)
      if (p.commodities < 0) negatives.push(`commodities ${p.commodities}`)
      if (negatives.length) {
        this.record(p.seat, after.phase, mj, 'negative-pool', 'LRR 20 (pools are finite)',
          `seat ${p.seat} has negative pools: ${negatives.join(', ')}`)
      }
    }
    // Only a 10-VP seat wins (LRR 2895) — unless the objective deck ran dry, which ends the game with the
    // most-VP player the winner (LRR 2896).
    if (after.phase === 'ended' && after.winner !== null) {
      const w = after.players[after.winner]
      const deckExhausted = after.objectiveOrder.length > 0 &&
        after.publicObjectives.length >= after.objectiveOrder.length
      if (w && w.vp < 10 && !deckExhausted) {
        this.record(after.winner, after.phase, mj, 'win-below-10', 'LRR 2895 (10 VP wins)',
          `game ended with seat ${after.winner} at ${w.vp} VP and the objective deck is not exhausted`)
      }
    }
    // Custodians token removed at most once (LRR 24.1).
    if (move.type === 'removeCustodians' && before.custodiansToken === false) {
      this.record(before.active, after.phase, mj, 'custodians-twice', 'LRR 24.1',
        'removeCustodians accepted while the custodians token was already gone')
    }
    // Played action cards leave the hand for the discard pile (LRR 66).
    if (move.type === 'playActionCard') {
      this.actionCardCount++
      const top = after.actionCardDiscard[after.actionCardDiscard.length - 1]
      if (top !== move.cardId) {
        this.record(before.active, after.phase, mj, 'card-not-discarded', 'LRR 66 (played card → discard pile)',
          `played ${move.cardId} but the discard top is ${top ?? 'empty'}`)
      }
      if ((after.players[before.active]?.actionCards ?? []).includes(move.cardId)) {
        this.record(before.active, after.phase, mj, 'card-still-in-hand', 'LRR 66',
          `played ${move.cardId} but it is still in seat ${before.active}'s hand`)
      }
    }
    if (move.type === 'research' || (move.type === 'secondary' && move.accept && move.card === 'technology')) this.techCount++
    if (move.type === 'combatRound' || move.type === 'groundCombatRound') this.combatCount++
  }

  /** R3.2 protocol around strategy-card secondaries. `open` is the window being tracked, or null. */
  checkWindow(before: GameState, after: GameState, move: Move, open: WindowTrack | null): WindowTrack | null {
    if (open === null) {
      if (move.type === 'strategic') {
        const n = before.players.length
        const queue: Seat[] = Array.from({ length: n - 1 }, (_, i) => (before.active + 1 + i) % n)
        return { card: move.card, owner: before.active, queue, answered: [] }
      }
      return null
    }
    if (move.type !== 'secondary') {
      // LRR 112: an excess-hand discard happens immediately and pre-empts the window, so a discard cutting
      // in front of the answers is fine — but it is not an answer and must not advance the window. Anything
      // else bypassing the window is a bug.
      if (move.type !== 'discardActionCard') {
        this.record(before.active, before.phase, moveJson(move), 'window-bypassed', 'R3.2 (game-rules.md 3.2: only the secondary is answered while the window is open)',
          `a ${move.type} move was accepted while seat ${open.owner}'s ${open.card} window was open (answered: ${open.answered.join(',') || 'none'})`)
      }
      return open
    }
    const seat = before.active
    const expected = open.queue[open.answered.length]
    if (seat === open.owner) {
      this.record(seat, before.phase, moveJson(move), 'holder-answered', 'R3.2 (game-rules.md 3.2: each OTHER player may resolve the secondary)',
        `the card holder seat ${seat} answered their own ${open.card} secondary`)
    } else if (expected !== undefined && seat !== expected) {
      this.record(seat, before.phase, moveJson(move), 'secondary-out-of-order', 'R3.2 (answers follow turn order)',
        `seat ${seat} answered ${open.card}, but turn order expects seat ${expected} (answered: ${open.answered.join(',') || 'none'})`)
    }
    if (open.answered.includes(seat)) {
      this.record(seat, before.phase, moveJson(move), 'secondary-answered-twice', 'R3.2 (each player answers once)',
        `seat ${seat} answered the ${open.card} secondary again (times: ${open.answered.filter(s => s === seat).length + 1})`)
    }
    const answered = [...open.answered, seat]
    if (answered.length >= open.queue.length) {
      if (after.pendingSecondary !== null) {
        this.record(open.owner, after.phase, moveJson(move), 'window-never-closed', 'R3.2',
          `every seat answered ${open.card} but pendingSecondary is still set`)
      }
      if (after.active !== open.owner) {
        this.record(open.owner, after.phase, moveJson(move), 'window-closed-to-wrong-seat', 'R3.2 (the window closes back onto the holder)',
          `${open.card} window finished but active is seat ${after.active}, expected holder ${open.owner}`)
      }
      return null
    }
    return { ...open, answered }
  }

  /** R10 protocol: one vote per seat per agenda, Nekro never votes, laws actually applied. Called ONCE,
   *  after the vote was applied. */
  checkVote(before: GameState, after: GameState, move: Move & { type: 'castVote' }, votes: Map<Seat, { outcome: string; influence: number }>): Map<Seat, { outcome: string; influence: number }> {
    const agenda = before.agenda
    if (!agenda) return votes
    const mj = moveJson(move)
    const seat = before.active
    if (votes.has(seat)) {
      this.record(seat, before.phase, mj, 'vote-twice', 'R10 (one vote per agenda per player)',
        `seat ${seat} voted more than once on ${agenda.revealed}`)
    }
    if (before.players[seat]?.faction === 'nekro') {
      this.record(seat, before.phase, mj, 'nekro-voted', 'Galactic Threat (lrr-factions.md)',
        'the Nekro Virus cast a vote')
    }
    const influence = (move.planets ?? []).reduce((sum, pid) => {
      const sys = Object.values(before.systems).find(s => s.planets.some(p => p.id === pid))
      const planet = sys?.planets.find(p => p.id === pid)
      return sum + (planet && planet.owner === seat ? planet.influence : 0)
    }, 0)
    const next = new Map(votes)
    next.set(seat, { outcome: move.outcome, influence })
    // Resolution: the engine either clears `agenda` or reveals the next agenda.
    const resolved = after.agenda === null || after.agenda.revealed !== agenda.revealed || after.agenda.slot !== agenda.slot
    if (resolved && after.phase !== 'ended') {
      this.verifyAgendaApplication(after, agenda, next)
      return new Map()
    }
    return next
  }

  private verifyAgendaApplication(after: GameState, agenda: NonNullable<GameState['agenda']>, votes: Map<Seat, { outcome: string; influence: number }>) {
    const def = AGENDAS.find(a => a.id === agenda.revealed)
    if (!def) return
    // Miscount Disclosed re-opens a revote on the elected law; nothing else to verify here.
    if (agenda.revealed === 'miscount_disclosed') return
    const voteRecord: NonNullable<GameState['agenda']>['votes'] = {}
    for (const [s, v] of votes.entries()) voteRecord[s] = v
    const full = { ...agenda, votes: voteRecord }
    const win = winningOutcome(after, full)
    if (!win) return
    const outcome = win.outcome
    const activeAfter = after.activeAgendas ?? []
    if (def.kind === 'law') {
      this.lawCount++
      const hasLaw = activeAfter.includes(agenda.revealed)
      if (outcome === 'For' && !hasLaw) {
        this.record(null, after.phase, `agenda ${agenda.revealed} → ${outcome}`, 'law-not-applied', 'R10 (a passed law is in effect)',
          `${def.name} passed For but is not in activeAgendas`)
      }
      if (outcome === 'Against' && hasLaw) {
        this.record(null, after.phase, `agenda ${agenda.revealed} → ${outcome}`, 'law-applied-against', 'R10 (a failed law is discarded)',
          `${def.name} failed (Against) but is still in activeAgendas`)
      }
      if (outcome !== 'For' && outcome !== 'Against' && outcome !== 'abstain') {
        if (def.target === 'Elect Player') {
          const seat = Number.parseInt(outcome, 10)
          const owner = after.lawOwners?.[agenda.revealed]
          if (Number.isInteger(seat) && owner !== seat) {
            this.record(null, after.phase, `agenda ${agenda.revealed} → elect ${outcome}`, 'law-owner-missing', 'R10 (the elected player gains the card)',
              `${def.name} elected seat ${outcome} but lawOwners says ${String(owner)}`)
          }
        }
        if (def.target === 'Elect Planet') {
          const sys = Object.values(after.systems).find(s => s.planets.some(p => p.id === outcome))
          const planet = sys?.planets.find(p => p.id === outcome)
          if (planet && !(planet.attachments ?? []).includes(agenda.revealed)) {
            this.record(null, after.phase, `agenda ${agenda.revealed} → elect ${outcome}`, 'attachment-missing', 'R10 (an Elect Planet law attaches to the planet)',
              `${def.name} elected ${planet.name} but the planet carries no such attachment`)
          }
        }
      }
    }
  }

  /** Engine log lines that admit a rule is only half-wired — collected for the report. */
  collectHalfWired(before: GameState, after: GameState) {
    for (let i = before.log.length; i < after.log.length; i++) {
      const entry = after.log[i]
      if (entry.t !== 'info') continue
      if (/not enforced by the engine yet/.test(entry.text)) {
        this.notEnforcedCount++
        this.record(null, after.phase, entry.text, 'law-not-enforced', 'the law\'s printed text (LRR/agenda card)',
          entry.text)
      }
    }
  }

  /** Independent movement re-verification for a moveShips the engine is about to accept. */
  checkMoveShips(before: GameState, move: Move & { type: 'moveShips' }) {
    const tac = before.tactical
    if (!tac) return
    const mj = moveJson(move)
    const seat = before.active
    const player = before.players[seat]
    if (!player) return
    let gravityDrive = player.techs.includes('gravity_drive') && !tac.gravityDriveUsed
    for (const spec of move.moves) {
      const src = before.systems[spec.from]
      if (!src) continue
      const unit = src.space.find(u => u.id === spec.unitId)
      if (!unit) continue
      if (unit.owner !== seat) {
        this.record(seat, before.phase, mj, 'moved-foreign-unit', 'LRR 57 (you move your own ships)',
          `seat ${seat} moved unit ${unit.id} owned by ${String(unit.owner)}`)
        continue
      }
      const baseMove = unitStats(unit.type, { faction: player.faction, techs: player.techs }).move
      if (baseMove <= 0) {
        this.record(seat, before.phase, mj, 'zero-move-moved', 'LRR 58 (a ship with move 0 cannot move on its own)',
          `seat ${seat} moved a ${unit.type} on its own (base move 0)`)
        continue
      }
      // Mirror the engine's Gravity Drive order: try the base value first; the drive (+1) is consumed only
      // when it is what enables the move (R3.2: one ship per activation).
      const baseValue = moveValueOf(before, seat, unit, false)
      let value = baseValue
      let reachable = independentReach(before, seat, spec.from, tac.systemId, baseValue)
      if (!reachable && gravityDrive) {
        if (independentReach(before, seat, spec.from, tac.systemId, baseValue + 1)) {
          reachable = true
          value = baseValue + 1
          gravityDrive = false
        }
      }
      if (!reachable) {
        const withMore = independentReach(before, seat, spec.from, tac.systemId, value + 6)
        if (withMore) {
          this.record(seat, before.phase, mj, 'path-blocked-illegal', 'LRR 1659.2 (no moving through a system containing another player\'s ships) / LRR 10, 57, 81 (anomalies)',
            `engine accepted ${unit.type} ${unit.id} from ${spec.from} to ${tac.systemId}, but no legal path exists within move value ${value} — every path is blocked`)
        } else {
          this.record(seat, before.phase, mj, 'out-of-range', 'LRR 58.1 (a ship may not move farther than its move value)',
            `engine accepted ${unit.type} ${unit.id} from ${spec.from} to ${tac.systemId} beyond move value ${value}`)
        }
      }
      // Capacity (LRR 91.1).
      const stats = unitStats(unit.type, { faction: player.faction, techs: player.techs })
      if (spec.carrying.length > stats.capacity) {
        this.record(seat, before.phase, mj, 'overloaded', 'LRR 91.1 (capacity)',
          `${unit.type} ${unit.id} carries ${spec.carrying.length} units but has capacity ${stats.capacity}`)
      }
    }
  }

  /** After an accepted moveShips: every mover is in the active system (or was lost to a rift). */
  checkArrival(before: GameState, after: GameState, move: Move & { type: 'moveShips' }) {
    const tac = before.tactical
    if (!tac) return
    for (const spec of move.moves) {
      const stillThere = after.systems[spec.from]?.space.some(u => u.id === spec.unitId)
      const arrived = after.systems[tac.systemId]?.space.some(u => u.id === spec.unitId)
      if (stillThere && !arrived) {
        this.record(before.active, after.phase, moveJson(move), 'move-not-applied', 'LRR 57 (movement step)',
          `${spec.from} still holds unit ${spec.unitId} after the move was accepted and it did not arrive in ${tac.systemId}`)
      }
    }
  }

  /** LRR 57.3: a system already carrying the seat's command token cannot be activated again. */
  checkStartTactical(before: GameState, move: Move & { type: 'startTactical' }) {
    const sys = before.systems[move.systemId]
    if (sys && sys.activatedBy.includes(before.active)) {
      this.record(before.active, before.phase, moveJson(move), 'reactivation', 'LRR 57.3 (a system with your token cannot be activated again)',
        `seat ${before.active} activated ${move.systemId} again; it already carried their command token`)
    }
  }
}

function monitorGame(seed: number, factions: FactionId[]): GameResult {
  const monitor = new GameMonitor(seed)
  let state = createGame(config(factions), seed)
  monitor.initialStock = state.players.map(p => stockOf(state, p.seat))
  let openWindow: WindowTrack | null = null
  let votes: Map<Seat, { outcome: string; influence: number }> = new Map()
  let lastHash: string | null = null
  let sameCount = 0
  let moves = 0
  const weights = WEIGHTS[seed % WEIGHTS.length]
  let terminal = false

  while (state.phase !== 'ended' && moves < MAX_MOVES) {
    const before = state
    let options: Move[]
    try {
      options = legalMoves(before)
    } catch (e) {
      monitor.record(before.active, before.phase, shortState(before), 'legal-moves-crash', 'engine bug',
        `legalMoves threw: ${e instanceof Error ? e.message : String(e)}`)
      terminal = true
      break
    }
    if (options.length === 0) {
      monitor.record(before.active, before.phase, shortState(before), 'no-legal-moves', 'R3.2/R4/R10 (the seat to act always has a move)',
        `seat ${before.active} must act but legalMoves is empty — deadlock`)
      terminal = true
      break
    }
    let move: Move
    try {
      move = aiChoose(before, options, before.active, weights)
    } catch (e) {
      monitor.record(before.active, before.phase, shortState(before), 'chooser-crash', 'AI bug',
        `aiChoose threw for seat ${before.active}: ${e instanceof Error ? e.message : String(e)}`)
      terminal = true
      break
    }
    monitor.note(before, moves, move.type)
    if (move.type === 'moveShips') monitor.checkMoveShips(before, move)
    if (move.type === 'startTactical') monitor.checkStartTactical(before, move)
    const r = applyMove(before, move, deriveSeed(seed, moves))
    if (!r.ok) {
      monitor.record(before.active, before.phase, moveJson(move), 'illegal-move', 'engine rejection (see error)',
        `AI seat ${before.active} chose a move the engine rejected: ${r.error}${r.internal ? ' (INTERNAL — engine exception)' : ''}`)
      terminal = true
      break
    }
    state = r.value
    moves++
    monitor.checkInvariants(before, state, move)
    if (move.type === 'moveShips') monitor.checkArrival(before, state, move)
    if (move.type === 'castVote') votes = monitor.checkVote(before, state, move, votes)
    openWindow = monitor.checkWindow(before, state, move, openWindow)
    monitor.collectHalfWired(before, state)
    const h = stateHash(state)
    if (h === lastHash) {
      sameCount++
      if (sameCount >= 4) {
        monitor.record(before.active, state.phase, moveJson(move), 'no-progress-loop', 'engine/AI (state must change)',
          `${sameCount} consecutive accepted moves left the state unchanged — the AI is spinning`)
        terminal = true
        break
      }
    } else {
      sameCount = 0
      lastHash = h
    }
  }

  if (!terminal && state.phase !== 'ended' && moves >= MAX_MOVES) {
    monitor.record(state.active, state.phase, shortState(state), 'stuck-at-budget', 'engine/AI',
      `game did not end within ${MAX_MOVES} moves; stuck in: ${shortState(state)}`)
  }

  const c = monitor.counts()
  return {
    stats: {
      seed,
      factions: factions.join(','),
      finished: state.phase === 'ended',
      winner: state.winner,
      rounds: state.round,
      moves,
      lawsPassed: c.laws,
      actionCardsPlayed: c.cards,
      techsResearched: c.techs,
      combats: c.combats,
      notEnforced: c.notEnforced,
    },
    problems: monitor.problems,
  }
}

function dedupe(problems: Problem[]): { key: string; count: number; sample: Problem }[] {
  const map = new Map<string, { count: number; sample: Problem }>()
  for (const p of problems) {
    const key = `${p.category} | ${p.rule} | ${p.description}`
    const e = map.get(key)
    if (e) e.count++
    else map.set(key, { count: 1, sample: p })
  }
  return [...map.entries()].map(([key, v]) => ({ key, count: v.count, sample: v.sample }))
}

function main() {
  const args = process.argv.slice(2)
  const seedCount = Number.parseInt(args[0] ?? '3', 10) || 3
  const results: GameResult[] = []
  for (let seed = 1; seed <= seedCount; seed++) {
    const factions = FACTION_SETS[(seed - 1) % FACTION_SETS.length]
    results.push(monitorGame(seed, factions))
  }

  const allProblems = results.flatMap(r => r.problems)
  const byCategory = new Map<string, number>()
  for (const p of allProblems) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1)

  const lines: string[] = []
  lines.push('# AI full-game monitoring report')
  lines.push('')
  lines.push(`Generated by \`scripts/ai-monitor.ts\` — ${String(seedCount)} full ${'6-player'} all-AI games, every move checked against the LRR (see \`docs/spec/\`).`)
  lines.push('')
  lines.push('## Games')
  lines.push('')
  lines.push('| seed | factions | finished | winner | rounds | moves | laws | action cards | techs | combats |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const s of results) {
    lines.push(`| ${String(s.stats.seed)} | ${s.stats.factions} | ${s.stats.finished ? 'yes' : 'NO'} | ${s.stats.winner === null ? '—' : String(s.stats.winner)} | ${String(s.stats.rounds)} | ${String(s.stats.moves)} | ${String(s.stats.lawsPassed)} | ${String(s.stats.actionCardsPlayed)} | ${String(s.stats.techsResearched)} | ${String(s.stats.combats)} |`)
  }
  lines.push('')
  lines.push(`Total problems found: **${String(allProblems.length)}** across ${String(byCategory.size)} categories.`)
  lines.push('')
  lines.push('## Problems by category')
  lines.push('')
  if (byCategory.size === 0) {
    lines.push('None. Every move matched the LRR-derived checks.')
  } else {
    lines.push('| category | count |')
    lines.push('|---|---|')
    for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${cat} | ${String(n)} |`)
    }
  }
  lines.push('')
  lines.push('## Problem details')
  lines.push('')
  const groups = dedupe(allProblems)
  if (groups.length === 0) {
    lines.push('Nothing to report.')
  } else {
    for (const g of groups) {
      const s = g.sample
      lines.push(`### ${s.category} — ${g.count} occurrence${g.count === 1 ? '' : 's'}`)
      lines.push('')
      lines.push(`- **Rule**: ${s.rule}`)
      lines.push(`- **What happened**: ${s.description}`)
      lines.push(`- **First seen**: seed ${String(s.seed)}, round ${String(s.round)}, move ${String(s.moveIndex)}, phase ${s.phase}, seat ${s.seat === null ? '—' : String(s.seat)}`)
      if (s.move.length < 400) lines.push(`- **Move/context**: \`${s.move}\``)
      if (s.trail.length) {
        lines.push('- **Move trail**: ')
        for (const t of s.trail) lines.push(`  - ${t}`)
      }
      lines.push('')
    }
  }

  // Half-wired laws are the known-gap list; call them out explicitly.
  const notEnforced = allProblems.filter(p => p.category === 'law-not-enforced')
  if (notEnforced.length) {
    const unique = [...new Set(notEnforced.map(p => p.description))]
    lines.push('## Laws the engine attaches but does not enforce')
    lines.push('')
    for (const u of unique) lines.push(`- ${u}`)
    lines.push('')
  }

  writeFileSync('docs/ai-monitor-report.md', lines.join('\n') + '\n')
  process.stdout.write(`monitored ${String(seedCount)} games → docs/ai-monitor-report.md (${String(allProblems.length)} problems, ${String(byCategory.size)} categories)\n`)
}

main()
