import { FACTIONS } from '../data/factions'
import { MECATOL_ID, SYSTEMS } from '../data/map'
import { PUBLIC_OBJECTIVES } from '../data/objectives'
import { POSTS, POST_IDS, type PostId } from '../data/posts'
import { deriveSeed, mulberry32 } from './rng'
import type { GameConfig, GameState, Owner, Planet, Player, Seat, StrategyCardId, System, Unit, UnitType } from './types'

export const START_TOKENS = { tactic: 3, fleet: 3, strategy: 2 }
export const ALL_STRATEGY_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'trade', 'warfare', 'technology', 'imperial']
export const REINFORCEMENTS: Readonly<Record<UnitType, number>> = { infantry: 12, fighter: 10, destroyer: 8, cruiser: 8, carrier: 4, dreadnought: 5, warsun: 2, flagship: 1, pds: 6, spacedock: 3 }

export const GUARDIAN_FLEETS: readonly Partial<Record<UnitType, number>>[] = [
  { dreadnought: 1, cruiser: 1, destroyer: 1, fighter: 2 },
  { dreadnought: 2 },
  { carrier: 1, cruiser: 1, destroyer: 2, fighter: 2 },
  { dreadnought: 1, cruiser: 2 },
  { cruiser: 2, destroyer: 2, fighter: 4 },
  { carrier: 1, dreadnought: 1, fighter: 2 },
]

function makeUnit(counter: { nextUnitId: number }, type: UnitType, owner: Owner): Unit {
  return { id: counter.nextUnitId++, type, owner, damaged: false }
}

function makePlayer(seat: Seat, cfg: GameConfig['players'][number]): Player {
  const f = FACTIONS[cfg.faction]
  const reinforcements = { ...REINFORCEMENTS }
  for (const su of f.startingUnits) reinforcements[su.type] -= su.count
  return {
    seat, faction: cfg.faction, color: cfg.color, name: cfg.name, vp: 0,
    tokens: { ...START_TOKENS }, tradeGoods: 0, commodities: f.commodityValue,
    techs: [...f.startingTechs], strategyCards: [], passed: false,
    scoredObjectives: [], scoredMandates: [],
    resourcesSpentThisRound: 0, spaceCombatWins: 0, trades: 0, tradedThisRound: { west: false, east: false },
    inheritanceExhausted: false, shipyardUsed: false, pendingInfantry: 0, reinforcements,
  }
}

/**
 * R8: seed salt for the trade post pair rolled at setup. `deriveSeed` is injective in its salt (every step
 * of it is a bijection on uint32), so this stream can never coincide with the objective shuffle's 91 on the
 * same game seed. The rounds after the first roll in the status phase, on that move's seed, with their own
 * salt base (see `statusPhase.ts`).
 */
const POSTS_SALT = 92

/**
 * R8: draws the west post, then the east one from what is left, skipping `exclude` entirely — the two posts
 * of the round before, which may not come straight back. Takes an already derived seed, like
 * `rollGuardianFleet`, so every caller documents its own salt.
 */
export function rollPosts(seed: number, exclude: readonly PostId[] = []): { west: PostId; east: PostId } {
  const rng = mulberry32(seed)
  const pool = POST_IDS.filter(id => !exclude.includes(id))
  const west = pool[Math.floor(rng() * pool.length)]
  const rest = pool.filter(id => id !== west)
  const east = rest[Math.floor(rng() * rest.length)]
  return { west, east }
}

/** R8: the log line both rolls share, so a replay reads the same whichever round the pair arrived in. */
export function postRollEntry(posts: { west: PostId; east: PostId }): string {
  return `Trade posts: ${POSTS[posts.west].name} to the west, ${POSTS[posts.east].name} to the east`
}

/** R7: the pool is shuffled from the game seed, so the order of the objectives is different every game. */
function shuffledObjectives(seed: number): string[] {
  const rng = mulberry32(deriveSeed(seed, 91))
  const ids = PUBLIC_OBJECTIVES.map(o => o.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = ids[i]
    ids[i] = ids[j]
    ids[j] = swap
  }
  return ids
}

export function createGame(config: GameConfig, seed: number): GameState {
  const counter = { nextUnitId: 1 }
  const order = shuffledObjectives(seed)
  const systems: Record<string, System> = {}
  for (const def of SYSTEMS) {
    const planets: Planet[] = def.planets.map(p => ({ id: p.id, name: p.name, resources: p.resources, influence: p.influence, owner: def.home, exhausted: false, ground: [], structures: [] }))
    systems[def.id] = { id: def.id, name: def.name, planets, wormhole: def.wormhole, neighbours: [...def.neighbours], space: [], activatedBy: [] }
  }
  const seats: Seat[] = config.players.map((_, i) => i)
  for (const seat of seats) {
    const home = SYSTEMS.find(s => s.home === seat)
    if (!home) throw new Error('missing home system')
    const sys = systems[home.id]
    for (const su of FACTIONS[config.players[seat].faction].startingUnits) {
      for (let i = 0; i < su.count; i++) {
        const unit = makeUnit(counter, su.type, seat)
        if (su.planetIndex === undefined) { sys.space.push(unit); continue }
        const planet = sys.planets[su.planetIndex]
        if (!planet) throw new Error(`no home planet index ${String(su.planetIndex)} for faction ${config.players[seat].faction}`)
        if (su.type === 'infantry') planet.ground.push(unit); else planet.structures.push(unit)
      }
    }
  }
  // N-player snake draft over the strategy pool (see strategyPhase.snakeOrder).
  const orderSeats = seats.map((_, i) => (config.speaker + i) % config.players.length)
  const draft = [...orderSeats, ...orderSeats.slice().reverse()]
  const posts = rollPosts(deriveSeed(seed, POSTS_SALT))
  const state: GameState = {
    version: 3, round: 1, phase: 'strategy', speaker: config.speaker, active: config.speaker,
    strategyPool: ALL_STRATEGY_CARDS.map(id => ({ id, bonus: 0 })),
    draft,
    publicObjectives: [order[0]],
    objectiveOrder: order,
    mecatolCombatWinner: null,
    players: config.players.map((cfg, seat) => makePlayer(seat, cfg)),
    systems, tactical: null, turnDone: false, pendingSecondary: null, statusSubmitted: [],
    posts, postAbilityUsed: { west: false, east: false },
    nextUnitId: counter.nextUnitId, guardianRolls: 0, winner: null,
    log: [{ t: 'info', text: postRollEntry(posts) }],
  }
  return rollGuardianFleet(state, seed)
}

export function rollGuardianFleet(state: GameState, seed: number): GameState {
  const rng = mulberry32(seed)
  const fleet = GUARDIAN_FLEETS[Math.floor(rng() * GUARDIAN_FLEETS.length)]
  const counter = { nextUnitId: state.nextUnitId }
  const newGuardians: Unit[] = []
  for (const [type, n] of Object.entries(fleet) as [UnitType, number][]) for (let i = 0; i < n; i++) newGuardians.push(makeUnit(counter, type, 'guardian'))
  const mecatol = state.systems[MECATOL_ID]
  const twoNewGuardianInfantry = [makeUnit(counter, 'infantry', 'guardian'), makeUnit(counter, 'infantry', 'guardian')]
  const planets = mecatol.planets.map((p, i) => i === 0
    ? { ...p, ground: [...p.ground.filter(u => u.owner !== 'guardian'), ...twoNewGuardianInfantry] }
    : p)
  return {
    ...state,
    nextUnitId: counter.nextUnitId,
    guardianRolls: state.guardianRolls + 1,
    systems: {
      ...state.systems,
      [MECATOL_ID]: { ...mecatol, space: [...mecatol.space.filter(u => u.owner !== 'guardian'), ...newGuardians], planets },
    },
    log: [...state.log, { t: 'info', text: `Guardian fleet: ${Object.entries(fleet).map(([t, n]) => `${n} ${t}`).join(', ')} and 2 infantry` }],
  }
}

export function unitsOf(state: GameState, owner: Owner): Unit[] {
  const out: Unit[] = []
  for (const sys of Object.values(state.systems)) {
    out.push(...sys.space.filter(u => u.owner === owner))
    for (const p of sys.planets) { out.push(...p.ground.filter(u => u.owner === owner)); out.push(...p.structures.filter(u => u.owner === owner)) }
  }
  return out
}
