import { FACTIONS } from '../data/factions'
import { AGENDAS } from '../data/agendas'
import { MECATOL_ID, type SystemDef } from '../data/map'
import { SECRET_OBJECTIVES, STAGE_1_OBJECTIVES, STAGE_2_OBJECTIVES } from '../data/objectives'
import { PLAYABLE_ACTION_CARDS } from './actionCards'
import { PLAYABLE_REACTION_CARDS } from './reactions'
import { generateGalaxy } from './galaxy'
import { deriveSeed, mulberry32, shuffleIds } from './rng'
import type { GameConfig, GameState, Owner, Planet, PlanetTrait, Player, Seat, StrategyCardId, System, TechSkip, Unit, UnitType } from './types'

export const START_TOKENS = { tactic: 3, fleet: 3, strategy: 2 }
export const ALL_STRATEGY_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'politics', 'construction', 'trade', 'warfare', 'technology', 'imperial']
// TI4 LRR 94.1: Infantry and fighters are unlimited (plastic + tokens).
// Plastic piece limits apply to: destroyer (8), cruiser (8), carrier (4), dreadnought (5), warsun (2), flagship (1), pds (6), spacedock (3).
export const REINFORCEMENTS: Readonly<Record<UnitType, number>> = { infantry: 99, fighter: 99, destroyer: 8, cruiser: 8, carrier: 4, dreadnought: 5, warsun: 2, flagship: 1, pds: 6, spacedock: 3 }

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
    techs: [...f.startingTechs], actionCards: [], strategyCards: [], passed: false,
    scoredObjectives: [], scoredMandates: [], secretObjectives: [],
    resourcesSpentThisRound: 0, influenceSpentThisRound: 0, tradeGoodsSpentThisRound: 0, tokensSpentThisRound: 0,
    spaceCombatWins: 0,
    inheritanceExhausted: false, shipyardUsed: false, productionBiomesExhausted: false, spatialConduitExhausted: false, pendingInfantry: 0, reinforcements,
  }
}

/**
 * TI4 public objective deck: 5 Stage I objectives placed on top of 5 Stage II objectives.
 * Shuffled from the game seed, so each game draws a unique set of 10 objectives.
 */
export function shuffledObjectives(seed: number): string[] {
  const rng = mulberry32(deriveSeed(seed, 91))
  const stage1 = shuffleIds(STAGE_1_OBJECTIVES.map(o => o.id), rng).slice(0, 5)
  const stage2 = shuffleIds(STAGE_2_OBJECTIVES.map(o => o.id), rng).slice(0, 5)
  return [...stage1, ...stage2]
}

const SECRET_OBJECTIVES_SALT = 94

export function shuffledSecretObjectives(seed: number): string[] {
  const rng = mulberry32(deriveSeed(seed, SECRET_OBJECTIVES_SALT))
  return shuffleIds(SECRET_OBJECTIVES.map(o => o.id), rng)
}

const ACTION_CARDS_SALT = 95
const AGENDAS_SALT = 96

/**
 * R9: the action card deck, shuffled from the game seed. It holds every base-game card the engine can play in
 * full, copies included — the "ACTION:" cards played as a whole turn (`PLAYABLE_ACTION_CARDS`) and the ones
 * played into a reaction window (`PLAYABLE_REACTION_CARDS`). A card whose printed ability the engine cannot
 * yet resolve is left out of the deck rather than dealt as a blank.
 */
export function shuffledActionCards(seed: number): string[] {
  return shuffleIds([...PLAYABLE_ACTION_CARDS, ...PLAYABLE_REACTION_CARDS], mulberry32(deriveSeed(seed, ACTION_CARDS_SALT)))
}

/**
 * R10: the 50 base-game agendas, shuffled from the game seed. The agenda phase is not implemented yet, but
 * the deck is real: the Politics primary looks at its top two cards and puts them back in the order it likes.
 */
export function shuffledAgendas(seed: number): string[] {
  return shuffleIds(AGENDAS.map(a => a.id), mulberry32(deriveSeed(seed, AGENDAS_SALT)))
}

export function createGame(config: GameConfig, seed: number): GameState {
  const counter = { nextUnitId: 1 }
  const order = shuffledObjectives(seed)
  const secretDeck = shuffledSecretObjectives(seed)
  // Two players use the curated duel map; three to six generate a full galaxy from the tile catalogue.
  // Custom maps (e.g. drafted galaxy) supply config.systems directly.
  const defs: SystemDef[] = config.systems
    ? config.systems
    : generateGalaxy(config.players.map((p, seat) => ({ seat, faction: p.faction })), seed)
  const systems: Record<string, System> = {}
  for (const def of defs) {
    const planets: Planet[] = def.planets.map(p => ({ id: p.id, name: p.name, resources: p.resources, influence: p.influence, trait: (p.trait ?? null) as PlanetTrait | null, techSkip: (p.techSkip ?? null) as TechSkip | null, owner: def.home, exhausted: false, ground: [], structures: [] }))
    systems[def.id] = { id: def.id, name: def.name, tile: def.tile, q: def.q, r: def.r, planets, wormhole: def.wormhole, neighbours: [...def.neighbours], home: def.home, space: [], activatedBy: [], anomalies: def.anomalies ? [...def.anomalies] : [] }
  }
  const seats: Seat[] = config.players.map((_, i) => i)
  for (const seat of seats) {
    const home = defs.find(s => s.home === seat)
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
  // R3.1 N-player draft over the eight strategy cards: 2 to 4 players draft 2 cards each (snake order),
  // 5 and 6 players draft 1 each. Kept in step with `snakeOrder`, which lays out every later round.
  const orderSeats = seats.map((_, i) => (config.speaker + i) % config.players.length)
  const draft = config.players.length <= 4 ? [...orderSeats, ...orderSeats.slice().reverse()] : orderSeats
  const players = config.players.map((cfg, seat) => {
    const p = makePlayer(seat, cfg)
    const initialSecret = secretDeck[seat]
    return initialSecret ? { ...p, secretObjectives: [initialSecret] } : p
  })
  const state: GameState = {
    version: 5, round: 1, phase: 'strategy', speaker: config.speaker, active: config.speaker,
    strategyPool: ALL_STRATEGY_CARDS.map(id => ({ id, bonus: 0 })),
    draft,
    publicObjectives: [order[0]],
    objectiveOrder: order,
    secretObjectiveDeck: secretDeck.slice(config.players.length),
    actionCardDeck: shuffledActionCards(seed),
    actionCardDiscard: [],
    agendaDeck: shuffledAgendas(seed),
    mecatolCombatWinner: null,
    players,
    systems, tactical: null, turnDone: false, pendingSecondary: null, statusSubmitted: [],
    pendingReactions: [], effects: [],
    nextUnitId: counter.nextUnitId, guardianRolls: 0, custodiansToken: true, agenda: null, winner: null,
    log: [
      { t: 'info', text: 'Game started with Custodians token on Mecatol Rex' },
    ],
  }
  return state
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
