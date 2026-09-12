import { neighbours } from './adjacency'
import { FACTIONS } from '../data/factions'
import { MECATOL_ID } from '../data/map'
import { drawActionCards } from './actionCards'
import { ACTION_SPENT } from './actionPhase'
import { checkFleet, homeSystemOf, returnToReinforcements, shipsOf } from './board'
import { cheapestPayment, distributeTokens, exhaustPlanets, fleetPoolLimit, nonFighterShips, payCost } from './economy'
import { addVp, controlsMecatol, fulfils, scoreObjective } from './objectives'
import { produce } from './production'
import { canResearch } from './research'
import type { GameState, Result, Seat, StrategicParams, StrategyCardId, TechColor, UnitType } from './types'

/** The cost order for non-fighter ships, matching the combat module's logic. */
const NON_FIGHTER_ORDER: readonly UnitType[] = (['fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'flagship', 'warsun'] as const).filter(t => t !== 'fighter')

/** Maps research team IDs to the tech color they ignore. */
const RESEARCH_TEAM_COLORS: Readonly<Record<string, TechColor>> = {
  research_team_biotic: 'green',
  research_team_cybernetic: 'yellow',
  research_team_propulsion: 'blue',
  research_team_warfare: 'red',
}

/** The seat holding the card, used or not. */
export function cardOwner(state: GameState, card: StrategyCardId): Seat | null {
  for (let seat = 0; seat < state.players.length; seat++) {
    if (state.players[seat].strategyCards.some(c => c.id === card)) return seat
  }
  return null
}

export function unusedCards(state: GameState, seat: Seat): StrategyCardId[] {
  return state.players[seat].strategyCards.filter(c => !c.used).map(c => c.id)
}

/** R3.2: every secondary but Leadership costs one token from the strategy pool; free Trade secondary costs 0. */
export function secondaryTokenCost(card: StrategyCardId, isFree = false): number {
  if (card === 'leadership' || isFree) return 0
  return 1
}
// Star Forge (Muaat): spend 1 strategy token to produce 2 fighters or 1 destroyer
// in a system containing one of your war suns.
export function starForgeAllowed(state: GameState, seat: Seat, systemId: string): boolean {
  const p = state.players[seat]
  return p.faction === 'muaat' && (state.systems[systemId]?.space.some(u => u.owner === seat && u.type === 'warsun') ?? false) && p.tokens.strategy >= 1
}

// Orbital Drop (Sol): spend 1 strategy token to place 2 infantry from reinforcements
// on a planet you control in a system containing one of your planets.
export function orbitalDropAllowed(state: GameState, seat: Seat, planetId: string): boolean {
  const p = state.players[seat]
  if (p.faction !== 'sol') return false
  const hasPlanet = Object.values(state.systems).some(s => s.planets.some(pl => pl.id === planetId && pl.owner === seat))
  return hasPlanet && p.tokens.strategy >= 1
}

// Peace Accords (Xxcha): after resolving Diplomacy, take control of an empty planet
// adjacent to one you already control.
export function peaceAccords(state: GameState, seat: Seat, planetId: string): Result<GameState> {
  const player = state.players[seat]
  if (player.faction !== 'xxcha') return { ok: false, error: 'not a Xxcha player' }
  const targetPlanet = Object.entries(state.systems).flatMap(([sysId, sys]) =>
    sys.planets.filter(p => p.id === planetId).map(p => ({ sysId, planet: p }))
  )[0]
  if (!targetPlanet) return { ok: false, error: `planet ${planetId} not found` }
  if (targetPlanet.planet.owner !== seat) return { ok: false, error: `you do not control ${planetId}` }
  if (targetPlanet.planet.ground.length > 0 || targetPlanet.planet.structures.length > 0) {
    return { ok: false, error: `${planetId} is not empty` }
  }
  const neighborSysIds = neighbours(state.systems, targetPlanet.sysId)
  const ownsNeighbor = neighborSysIds.some(id => {
    const s = state.systems[id]
    return s.planets.some(p => p.owner === seat)
  })
  if (!ownsNeighbor) return { ok: false, error: `${planetId} is not adjacent to a planet you control` }
  const systems = { ...state.systems, [targetPlanet.sysId]: {
    ...state.systems[targetPlanet.sysId],
    planets: state.systems[targetPlanet.sysId].planets.map(p =>
      p.id === planetId ? { ...p, owner: seat } : p
    )
  }}
  return { ok: true, value: { ...state, systems } }
}

export function drawSecretObjective(state: GameState, seat: Seat): GameState {
  if (!state.secretObjectiveDeck || state.secretObjectiveDeck.length === 0) return state
  const [drawn, ...rest] = state.secretObjectiveDeck
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = { ...player, secretObjectives: [...(player.secretObjectives ?? []), drawn] }
  return {
    ...state,
    secretObjectiveDeck: rest,
    players,
    log: [...state.log, { t: 'info', text: `seat ${seat} draws a secret objective` }],
  }
}

function spendStrategyTokens(state: GameState, seat: Seat, cost: number): Result<GameState> {
  if (cost === 0) return { ok: true, value: state }
  const player = state.players[seat]
  if (player.tokens.strategy < cost) return { ok: false, error: 'R3.2: no token in the strategy pool' }
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...player,
    tokens: { ...player.tokens, strategy: player.tokens.strategy - cost },
    tokensSpentThisRound: player.tokensSpentThisRound + cost,
  }
  return { ok: true, value: { ...state, players } }
}

/** R6 Diplomacy: every system but Mecatol Rex in which the seat controls a planet. */
export function diplomacySystems(state: GameState, seat: Seat): string[] {
  return Object.keys(state.systems).filter(id => id !== MECATOL_ID && state.systems[id].planets.some(p => p.owner === seat))
}

/** R6 Warfare: every system that holds a command token of the seat. */
export function warfareTokenSystems(state: GameState, seat: Seat): string[] {
  return Object.keys(state.systems).filter(id => state.systems[id].activatedBy.includes(seat))
}

/** R6 Diplomacy: readies up to `max` exhausted planets the seat controls. */
export function readyPlanets(state: GameState, seat: Seat, planets: string[], max: number): Result<GameState> {
  if (planets.length > max) return { ok: false, error: `R6: at most ${max} planets` }
  let systems = state.systems
  for (const planetId of planets) {
    const sysId = Object.keys(systems).find(id => systems[id].planets.some(p => p.id === planetId))
    if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
    const sys = systems[sysId]
    const planet = sys.planets.find(p => p.id === planetId)
    if (!planet || planet.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
    if (!planet.exhausted) return { ok: false, error: `planet ${planetId} is not exhausted` }
    systems = { ...systems, [sysId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, exhausted: false } : p) } }
  }
  return { ok: true, value: { ...state, systems } }
}

/**
 * LRR "Technology Specialties" 12: exhausts each named planet (controlled, ready, carrying that specialty)
 * before the research itself is checked, and hands back the colour it ignores one prerequisite of.
 */
function exhaustTechSkipPlanets(state: GameState, seat: Seat, planetIds: string[]): Result<{ state: GameState; skips: TechColor[] }> {
  let next = state
  const skips: TechColor[] = []
  for (const planetId of planetIds) {
    const sysId = Object.keys(next.systems).find(id => next.systems[id].planets.some(p => p.id === planetId))
    if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
    const sys = next.systems[sysId]
    const planet = sys.planets.find(p => p.id === planetId)
    if (!planet || planet.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
    if (planet.exhausted) return { ok: false, error: `planet ${planetId} is exhausted` }
    if (!planet.techSkip) return { ok: false, error: `planet ${planetId} has no technology specialty` }
    skips.push(planet.techSkip)
    next = { ...next, systems: { ...next.systems, [sysId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, exhausted: true } : p) } } }
  }
  return { ok: true, value: { state: next, skips } }
}

/**
 * R5: adds the technology after the prerequisite check; Inheritance Systems ignores the prerequisites.
 * `techSkipPlanets` names planets exhausted for their technology specialty, each ignoring one matching
 * prerequisite symbol (LRR "Technology Specialties" 12) — irrelevant, but harmless to pass, when
 * `ignorePrereqs` already waives every prerequisite.
 * Research Teams (attached laws) are also checked: if a planet with a research team is attached to a
 * controlled planet, it can be exhausted to skip the corresponding color prerequisite.
 */
export function grantTech(state: GameState, seat: Seat, techId: string, ignorePrereqs: boolean, techSkipPlanets: string[] = []): Result<GameState> {
  const player = state.players[seat]
  if (player.faction === 'nekro') {
    // Propagation (Nekro): instead of researching technology, gain 3 command tokens
    const updated = { ...state, players: [...state.players] as GameState['players'] }
    updated.players[seat] = { ...player, tokens: { ...player.tokens, strategy: (player.tokens.strategy ?? 0) + 3 } }
    return { ok: true, value: { ...updated, log: [...updated.log, { t: 'info', text: `seat ${seat} gains 3 strategy tokens from Propagation instead of researching ${techId}` }] } }
  }
  const exhausted = exhaustTechSkipPlanets(state, seat, techSkipPlanets)
  if (!exhausted.ok) return exhausted
  
  // Check for research team attachments on controlled planets
  let next = exhausted.value.state
  const skips = [...exhausted.value.skips]
  for (const [sysId, sys] of Object.entries(next.systems)) {
    for (const planet of sys.planets) {
      if (planet.owner !== seat) continue
      for (const attachment of planet.attachments ?? []) {
        const skipColor = RESEARCH_TEAM_COLORS[attachment]
        if (skipColor && !skips.includes(skipColor)) {
          // Found a research team - exhaust the planet and add the skip
          next = { ...next, systems: { ...next.systems, [sysId]: { ...sys, planets: sys.planets.map(p => p.id === planet.id ? { ...p, exhausted: true } : p) } } }
          skips.push(skipColor)
          next = { ...next, log: [...next.log, { t: 'info', text: `seat ${seat} exhausts ${planet.name} (${attachment}) to skip ${skipColor} prerequisite for ${techId}` }] }
        }
      }
    }
  }
  
  if (!canResearch(player, techId, ignorePrereqs, skips)) return { ok: false, error: `R5: ${techId} cannot be researched` }
  const players = [...next.players] as GameState['players']
  players[seat] = { ...player, techs: [...player.techs, techId] }
  const skipNote = skips.length ? ` (${skips.length} prerequisite${skips.length > 1 ? 's' : ''} skipped)` : ''
  return {
    ok: true,
    value: { ...next, players, log: [...next.log, { t: 'info', text: `seat ${seat} researches ${techId}${skipNote}` }] },
  }
}

function replenish(state: GameState, seat: Seat): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], commodities: FACTIONS[players[seat].faction].commodityValue }
  return { ...state, players }
}

function addTradeGoods(state: GameState, seat: Seat, n: number): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], tradeGoods: players[seat].tradeGoods + n }
  return { ...state, players }
}

/**
 * R6 Leadership: `base` command tokens plus one for every 3 influence exhausted. Ruling: trade goods count
 * as influence too, spent 1 for 1 alongside planets.
 */
function leadership(state: GameState, seat: Seat, params: StrategicParams, base: number): Result<GameState> {
  const tradeGoods = params.tradeGoods ?? 0
  // same shape check as `payCost`: `NaN` slips through both comparisons, a numeric string makes the influence
  // sum below a concatenation ("3" + "1" = 31 influence), so both are rejected before anything is compared
  if (!Number.isInteger(tradeGoods)) return { ok: false, error: 'R6: the trade good count must be a whole number' }
  const spent = exhaustPlanets(state, seat, params.planets ?? [])
  if (!spent.ok) return spent
  const player = state.players[seat]
  if (tradeGoods < 0 || tradeGoods > player.tradeGoods) return { ok: false, error: 'R6: not enough trade goods' }
  const players = [...spent.value.state.players] as GameState['players']
  players[seat] = {
    ...players[seat],
    tradeGoods: players[seat].tradeGoods - tradeGoods,
    tradeGoodsSpentThisRound: players[seat].tradeGoodsSpentThisRound + tradeGoods,
    influenceSpentThisRound: players[seat].influenceSpentThisRound + spent.value.influence,
  }
  const influence = spent.value.influence + tradeGoods
  return distributeTokens({ ...spent.value.state, players }, seat, params.tokens, base + Math.floor(influence / 3))
}

/**
 * R6 Diplomacy, errata text: the opponent places a command token, then up to 2 of your planets ready.
 * R3.2: a card must always be playable, so with no eligible system only the readying half resolves.
 * Simplification: the duel tracks no reinforcement pool of command tokens, so a token is simply added to
 * `activatedBy` and never runs out; in TI4 it would come off the owner's supply.
 */
function diplomacyPrimary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  const systemId = params.systemId
  if (systemId === undefined) {
    if (diplomacySystems(state, seat).length > 0) return { ok: false, error: 'R6: Diplomacy needs a system' }
    return readyPlanets(state, seat, params.planets ?? [], 2)
  }
  const sys = state.systems[systemId]
  if (!sys) return { ok: false, error: `unknown system ${systemId}` }
  if (systemId === MECATOL_ID) return { ok: false, error: 'R6: not the Mecatol Rex system' }
  if (!sys.planets.some(p => p.owner === seat)) return { ok: false, error: `R6: you control no planet in ${systemId}` }
  // R6 errata: every other player places a command token in the chosen system. A seat that already has one
  // there is unchanged; the token comes off reinforcements (approximated here as just joining activatedBy).
  const activatedBy = [...sys.activatedBy]
  for (const other of otherSeatsInOrder(state, seat)) if (!activatedBy.includes(other)) activatedBy.push(other)
  const systems = { ...state.systems, [systemId]: { ...sys, activatedBy } }
  return readyPlanets({ ...state, systems }, seat, params.planets ?? [], 2)
}

/**
 * R6 Warfare: one of your command tokens leaves the board and you gain one, then you may move any of them.
 * With a token on the board the system must be named; with none the card is pure redistribution and gains
 * nothing, so it stays playable (R3.2).
 */
function warfarePrimary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  const onBoard = warfareTokenSystems(state, seat)
  const systemId = params.systemId
  if (systemId === undefined) {
    if (onBoard.length > 0) return { ok: false, error: 'R6: name the system your command token comes from' }
    return withFleetPoolIntact(distributeTokens(state, seat, params.tokens, 0, true), seat)
  }
  const sys = state.systems[systemId]
  if (!sys) return { ok: false, error: `unknown system ${systemId}` }
  if (!sys.activatedBy.includes(seat)) return { ok: false, error: `R6: no command token of yours in ${systemId}` }
  const next = { ...state, systems: { ...state.systems, [systemId]: { ...sys, activatedBy: sys.activatedBy.filter(s => s !== seat) } } }
  return withFleetPoolIntact(distributeTokens(next, seat, params.tokens, 1, true), seat)
}

/**
 * R4.4/R6: Warfare is the only card that may shrink the fleet pool, so the resulting sheet has to still carry
 * every fleet already on the board. If a system would exceed the fleet pool, the cheapest excess non-fighter
 * ships are destroyed automatically (matching the R3.2 retreat logic).
 */
function withFleetPoolIntact(result: Result<GameState>, seat: Seat): Result<GameState> {
  if (!result.ok) return result
  let next = result.value
  for (const sys of Object.values(next.systems)) {
    if (!sys.space.some(u => u.owner === seat)) continue
    const excess = nonFighterShips(sys.space, seat) - fleetPoolLimit(next.players[seat])
    if (excess > 0) {
      // Destroy the cheapest excess non-fighter ships
      const victims = NON_FIGHTER_ORDER.flatMap(t => shipsOf(sys, seat).filter(u => u.type === t)).slice(0, excess)
      if (victims.length) {
        next = { ...next, systems: { ...next.systems, [sys.id]: { ...sys, space: sys.space.filter(u => !victims.find(v => v.id === u.id)) } } }
        next = returnToReinforcements(next, victims)
        next = { ...next, log: [...next.log, { t: 'info', text: `${victims.length} ships beyond the fleet pool are destroyed in ${sys.id}` }] }
      }
    }
    if (!checkFleet(next, seat, sys.id).ok) return { ok: false, error: `R4.4: redistribution would exceed the fleet pool in ${sys.id}` }
  }
  return { ok: true, value: next }
}

/** R6 Warfare secondary: the R4.4 production of a space dock in your own home system. */
function warfareSecondary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  const staged: GameState = { ...state, tactical: { systemId: homeSystemOf(state, seat), step: 'production' } }
  const made = produce(staged, params.units ?? {}, params.planets ?? [], params.tradeGoods ?? 0)
  if (!made.ok) return made
  return { ok: true, value: { ...made.value, tactical: state.tactical } }
}

/**
 * R6 Politics, third line: "Look at the top 2 cards of the agenda deck. Place each card on the top or bottom
 * of the deck in any order." The two cards come back in the arrangement the player names; naming nothing puts
 * them back as they were, which is one of the legal arrangements.
 */
export function reorderAgendaDeck(state: GameState, params: StrategicParams): Result<GameState> {
  const peeked = state.agendaDeck.slice(0, 2)
  if (params.agendaTop === undefined && params.agendaBottom === undefined) return { ok: true, value: state }
  const top = params.agendaTop ?? []
  const bottom = params.agendaBottom ?? []
  const placed = [...top, ...bottom]
  if (placed.length !== peeked.length || new Set(placed).size !== placed.length || placed.some(id => !peeked.includes(id))) {
    return { ok: false, error: 'R6: put each of the two agenda cards you looked at back exactly once' }
  }
  return { ok: true, value: { ...state, agendaDeck: [...top, ...state.agendaDeck.slice(peeked.length), ...bottom] } }
}

/**
 * R6 Politics primary: choose a new speaker (anyone but the current speaker, yourself included), draw 2
 * action cards, then look at the top 2 agenda cards and put them back in any order.
 */
function politicsPrimary(state: GameState, seat: Seat, params: StrategicParams, seed: number): Result<GameState> {
  const to = params.speakerTo
  if (to === undefined || !Number.isInteger(to) || to < 0 || to >= state.players.length) {
    return { ok: false, error: 'R6: Politics needs a new speaker' }
  }
  if (to === state.speaker) return { ok: false, error: 'R6: choose a player other than the speaker' }
  const spoken: GameState = {
    ...state,
    speaker: to,
    log: [...state.log, { t: 'info', text: `seat ${to} takes the speaker token` }],
  }
  return reorderAgendaDeck(drawActionCards(spoken, seat, 2, seed), params)
}

/** R6 Construction: how many of that structure the planet may still take (1 space dock, 2 PDS per planet). */
function structureRoom(planet: { structures: { type: string }[] }, type: 'pds' | 'spacedock'): number {
  const limit = type === 'spacedock' ? 1 : 2
  return limit - planet.structures.filter(u => u.type === type).length
}

/** Saar's space dock is a Floating Factory: never on a planet, so Construction can offer/place it as soon as
 * the seat controls any planet in the system and doesn't already have one there (lrr-facions.md 2124). */
function isSaarFloatingFactory(state: GameState, seat: Seat, type: 'pds' | 'spacedock'): boolean {
  return type === 'spacedock' && state.players[seat].faction === 'saar'
}

/** R6 Construction: the planets a seat may still put that structure on. For Saar's Floating Factory this
 * names a controlled planet only to identify the system — the dock itself lands in the space area. */
export function constructionPlanets(state: GameState, seat: Seat, type: 'pds' | 'spacedock', systemId?: string): string[] {
  const reinforcementType = isSaarFloatingFactory(state, seat, type) ? 'floating_factory' : type
  if (state.players[seat].reinforcements[reinforcementType] < 1) return []
  const out: string[] = []
  for (const id of Object.keys(state.systems)) {
    if (systemId !== undefined && id !== systemId) continue
    const sys = state.systems[id]
    if (isSaarFloatingFactory(state, seat, type)) {
      if (sys.space.some(u => u.type === 'floating_factory' && u.owner === seat)) continue
      const controlled = sys.planets.find(p => p.owner === seat)
      if (controlled) out.push(controlled.id)
      continue
    }
    for (const planet of sys.planets) {
      if (planet.owner === seat && structureRoom(planet, type) > 0) out.push(planet.id)
    }
  }
  return out
}

/** Places a Floating Factory in the space area of the system containing `planetId`, which only names the
 * seat's proof of control there (lrr-components.md 1810: it is never on a planet). */
function placeFloatingFactory(state: GameState, seat: Seat, planetId: string): Result<GameState> {
  const systemId = Object.keys(state.systems).find(id => state.systems[id].planets.some(p => p.id === planetId))
  if (systemId === undefined) return { ok: false, error: `unknown planet ${planetId}` }
  const sys = state.systems[systemId]
  const planet = sys.planets.find(p => p.id === planetId)
  if (!planet || planet.owner !== seat) return { ok: false, error: `R6: you do not control ${planetId}` }
  if (sys.space.some(u => u.type === 'floating_factory' && u.owner === seat)) {
    return { ok: false, error: `R6: ${systemId} already has your Floating Factory` }
  }
  const player = state.players[seat]
  if (player.reinforcements.floating_factory < 1) return { ok: false, error: 'R6: no Floating Factory left in your reinforcements' }
  const unit = { id: state.nextUnitId, type: 'floating_factory' as const, owner: seat, damaged: false }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, reinforcements: { ...player.reinforcements, floating_factory: player.reinforcements.floating_factory - 1 } }
  return {
    ok: true,
    value: {
      ...state,
      players,
      nextUnitId: state.nextUnitId + 1,
      systems: { ...state.systems, [systemId]: { ...sys, space: [...sys.space, unit] } },
      log: [...state.log, { t: 'info', text: `seat ${seat} places a Floating Factory in ${systemId}` }],
    },
  }
}

/** Places one structure on a planet the seat controls, checking the reinforcements and the per-planet limit. */
function placeStructure(state: GameState, seat: Seat, planetId: string, type: 'pds' | 'spacedock'): Result<GameState> {
  if (isSaarFloatingFactory(state, seat, type)) return placeFloatingFactory(state, seat, planetId)
  const systemId = Object.keys(state.systems).find(id => state.systems[id].planets.some(p => p.id === planetId))
  if (systemId === undefined) return { ok: false, error: `unknown planet ${planetId}` }
  const sys = state.systems[systemId]
  const planet = sys.planets.find(p => p.id === planetId)
  if (!planet || planet.owner !== seat) return { ok: false, error: `R6: you do not control ${planetId}` }
  if (structureRoom(planet, type) < 1) {
    return { ok: false, error: type === 'spacedock' ? `R6: ${planetId} already has a space dock` : `R6: ${planetId} already has two PDS` }
  }
  const player = state.players[seat]
  if (player.reinforcements[type] < 1) return { ok: false, error: `R6: no ${type} left in your reinforcements` }
  const unit = { id: state.nextUnitId, type, owner: seat, damaged: false }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, reinforcements: { ...player.reinforcements, [type]: player.reinforcements[type] - 1 } }
  return {
    ok: true,
    value: {
      ...state,
      players,
      nextUnitId: state.nextUnitId + 1,
      systems: { ...state.systems, [systemId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, structures: [...p.structures, unit] } : p) } },
      log: [...state.log, { t: 'info', text: `seat ${seat} places a ${type === 'spacedock' ? 'space dock' : 'PDS'} on ${planetId}` }],
    },
  }
}

/**
 * R6 Construction primary: "Place 1 PDS or 1 Space Dock on a planet you control. Place 1 PDS on a planet you
 * control." Two structures, and only the first of them may be a space dock. Placing fewer is allowed (and is
 * all a player with no planet or no reinforcements can do), so the card is always playable (R3.2).
 */
function constructionPrimary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  const wanted = params.structures ?? []
  if (wanted.length > 2) return { ok: false, error: 'R6: Construction places at most two structures' }
  if (wanted.slice(1).some(s => s.type !== 'pds')) return { ok: false, error: 'R6: only the first structure may be a space dock' }
  let next = state
  for (const spec of wanted) {
    const placed = placeStructure(next, seat, spec.planetId, spec.type)
    if (!placed.ok) return placed
    next = placed.value
  }
  return { ok: true, value: next }
}

/**
 * R6 Construction secondary: "Place 1 token from your strategy pool in any system; you may place either 1
 * space dock or 1 PDS on a planet you control in that system." The token itself is the secondary's cost,
 * already taken from the strategy pool; here it lands on the board.
 */
function constructionSecondary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  const systemId = params.systemId
  if (systemId === undefined || !state.systems[systemId]) return { ok: false, error: 'R6: name the system your command token goes into' }
  const wanted = params.structures ?? []
  if (wanted.length > 1) return { ok: false, error: 'R6: the Construction secondary places at most one structure' }
  const sys = state.systems[systemId]
  const activatedBy = sys.activatedBy.includes(seat) ? sys.activatedBy : [...sys.activatedBy, seat]
  let next: GameState = { ...state, systems: { ...state.systems, [systemId]: { ...sys, activatedBy } } }
  for (const spec of wanted) {
    if (!next.systems[systemId].planets.some(p => p.id === spec.planetId)) {
      return { ok: false, error: `R6: ${spec.planetId} is not in ${systemId}` }
    }
    const placed = placeStructure(next, seat, spec.planetId, spec.type)
    if (!placed.ok) return placed
    next = placed.value
  }
  return { ok: true, value: next }
}

/** R5: one technology, then optionally a second one for 6 resources; the first may be the prerequisite. */
function technologyPrimary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  let next = state
  if (params.techId !== undefined) {
    const first = grantTech(next, seat, params.techId, false, params.techSkipPlanets ?? [])
    if (!first.ok) return first
    next = first.value
  }
  if (params.secondTechId !== undefined) {
    if (params.techId === undefined) return { ok: false, error: 'R5: the second technology needs the first' }
    const payment = cheapestPayment(next, seat, 6)
    const planets = params.planets !== undefined ? params.planets : (payment?.planets ?? [])
    const tradeGoods = params.tradeGoods !== undefined ? params.tradeGoods : (payment?.tradeGoods ?? 0)
    const paid = payCost(next, seat, 6, planets, tradeGoods)
    if (!paid.ok) return paid
    const second = grantTech(paid.value, seat, params.secondTechId, false, params.secondTechSkipPlanets ?? [])
    if (!second.ok) return second
    next = second.value
  }
  return { ok: true, value: next }
}

function technologySecondary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  if (params.techId === undefined) return { ok: false, error: 'R5: name the technology to research' }
  const payment = cheapestPayment(state, seat, 4)
  const planets = params.planets !== undefined ? params.planets : (payment?.planets ?? [])
  const tradeGoods = params.tradeGoods !== undefined ? params.tradeGoods : (payment?.tradeGoods ?? 0)
  const paid = payCost(state, seat, 4, planets, tradeGoods)
  if (!paid.ok) return paid
  return grantTech(paid.value, seat, params.techId, false, params.techSkipPlanets ?? [])
}

/** R6/R7 Imperial: score one fulfilled public objective, then 1 VP for Mecatol Rex or draw 1 secret objective. */
function imperialPrimary(state: GameState, seat: Seat, params: StrategicParams): Result<GameState> {
  let next = state
  const id = params.objectiveId
  if (id !== undefined) {
    if (!state.publicObjectives.includes(id)) return { ok: false, error: `R7: ${id} is not a revealed public objective` }
    if (state.players[seat].scoredObjectives.includes(id)) return { ok: false, error: `R7: ${id} is already scored` }
    if (!fulfils(state, seat, id)) return { ok: false, error: `R7: ${id} is not fulfilled` }
    next = scoreObjective(next, seat, id)
  }
  if (controlsMecatol(next, seat)) {
    next = addVp(next, seat, 1, 'Imperial primary: Mecatol Rex')
  } else {
    next = drawSecretObjective(next, seat)
  }
  return { ok: true, value: next }
}

function primary(state: GameState, seat: Seat, card: StrategyCardId, params: StrategicParams, seed: number): Result<GameState> {
  switch (card) {
    case 'leadership':
      return leadership(state, seat, params, 3)
    case 'diplomacy':
      return diplomacyPrimary(state, seat, params)
    case 'politics':
      return politicsPrimary(state, seat, params, seed)
    case 'construction':
      return constructionPrimary(state, seat, params)
    case 'trade': {
      let next = replenish(addTradeGoods(state, seat, 3), seat)
      // R7: each chosen other player replenishes without paying, and it counts as a trade for both of them
      for (const s2 of params.shareWith ?? []) {
        if (s2 === seat || s2 < 0 || s2 >= state.players.length) continue
        next = replenish(next, s2)
      }
      return { ok: true, value: next }
    }
    case 'warfare':
      return warfarePrimary(state, seat, params)
    case 'technology':
      return technologyPrimary(state, seat, params)
    case 'imperial':
      return imperialPrimary(state, seat, params)
  }
}

function secondaryEffect(state: GameState, seat: Seat, card: StrategyCardId, params: StrategicParams, seed: number): Result<GameState> {
  switch (card) {
    case 'leadership':
      return leadership(state, seat, params, 0)
    case 'diplomacy':
      return readyPlanets(state, seat, params.planets ?? [], 2)
    case 'politics':
      // "Spend 1 token from your strategy pool to draw 2 action cards."
      return { ok: true, value: drawActionCards(state, seat, 2, seed) }
    case 'construction':
      return constructionSecondary(state, seat, params)
    case 'trade':
      return { ok: true, value: replenish(state, seat) }
    case 'warfare':
      return warfareSecondary(state, seat, params)
    case 'technology':
      return technologySecondary(state, seat, params)
    case 'imperial':
      return { ok: true, value: drawSecretObjective(state, seat) }
  }
}

/** R3.2: every other seat, in turn order after `from`, that still has to answer an open secondary. */
export function otherSeatsInOrder(state: GameState, from: Seat): Seat[] {
  const n = state.players.length
  return Array.from({ length: n - 1 }, (_, i) => (from + 1 + i) % n)
}

export function strategic(state: GameState, card: StrategyCardId, params: StrategicParams | undefined, seed: number): Result<GameState> {
  if (state.phase !== 'action') return { ok: false, error: 'not in the action phase' }
  if (state.tactical) return { ok: false, error: 'finish the tactical action first' }
  if (state.pendingSecondary) return { ok: false, error: 'R3.2: a secondary window is already open' }
  if (state.turnDone) return { ok: false, error: ACTION_SPENT }
  const seat = state.active
  if (state.players[seat].passed) return { ok: false, error: 'this player has passed' }
  const entry = state.players[seat].strategyCards.find(c => c.id === card)
  if (!entry) return { ok: false, error: `R3.2: seat ${seat} does not hold ${card}` }
  if (entry.used) return { ok: false, error: `R3.2: ${card} is already used` }
  const played = primary(state, seat, card, params ?? {}, seed)
  if (!played.ok) return played
  const players = [...played.value.players] as GameState['players']
  players[seat] = { ...players[seat], strategyCards: players[seat].strategyCards.map(c => c.id === card ? { ...c, used: true } : c) }
  const queue = otherSeatsInOrder(state, seat)
  const freeSeats = card === 'trade'
    ? (params?.shareWith?.filter(s => s !== seat && s >= 0 && s < state.players.length) ?? [])
    : undefined
  const window = { card, owner: seat, queue, ...(freeSeats ? { freeSeats } : {}) }
  const active = queue[0] ?? seat
  // R3.2: the holder's strategic action is spent; their turn ends once everyone has answered the secondary
  return { ok: true, value: { ...played.value, players, pendingSecondary: window, active, turnDone: queue.length === 0 } }
}

export function secondary(state: GameState, card: StrategyCardId, accept: boolean, params: StrategicParams | undefined, seed: number): Result<GameState> {
  if (state.phase !== 'action') return { ok: false, error: 'not in the action phase' }
  const pending = state.pendingSecondary
  if (pending === null || pending.card !== card) return { ok: false, error: `R3.2: no secondary window for ${card}` }
  const seat = state.active
  if (pending.owner === seat) {
    return { ok: false, error: 'R3.2: the card holder does not answer their own card' }
  }
  if (pending.queue[0] !== seat) return { ok: false, error: 'R3.2: it is not your turn to answer this secondary' }
  let next = state
  if (accept) {
    const isFree = pending.card === 'trade' && ((pending.freeSeats?.includes(seat) ?? false) || state.players[seat].faction === 'hacan')
    const paid = spendStrategyTokens(state, seat, secondaryTokenCost(card, isFree))
    if (!paid.ok) return paid
    const used = secondaryEffect(paid.value, seat, card, params ?? {}, seed)
    if (!used.ok) return used
    next = used.value
  }
  const queue = pending.queue.slice(1)
  const closed = queue.length === 0
  // R3.2: the window stays open until every other seat has answered; then it closes back onto the holder,
  // whose strategic action is now finished. The action is spent, the turn is not: they keep it (free moves
  // included) until they end it, which is what hands it on.
  return {
    ok: true,
    value: {
      ...next,
      pendingSecondary: closed ? null : { card: pending.card, owner: pending.owner, queue },
      active: closed ? pending.owner : queue[0],
      turnDone: next.turnDone || closed,
    },
  }
}
