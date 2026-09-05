import { actionCardDef, findActionCard } from '../data/actionCards'
import { ACTION_SPENT } from './actionPhase'
import { checkFleet, destroyUnits } from './board'
import { canResearch, researchable } from './research'
import { deriveSeed, mulberry32, shuffleIds } from './rng'
import type { ActionCardParams, GameState, Move, Planet, Result, Seat, Unit } from './types'

/** R9: a player may hold at most seven action cards. */
export const HAND_LIMIT = 7

/**
 * The action cards the engine can actually resolve, and therefore the only ones a game's deck holds.
 *
 * CLAUDE.md: a card offers its whole printed ability, never a convenient stub — so a card the engine cannot
 * play in full is not dealt at all rather than dealt as a blank. Every id here is an "ACTION:" card, i.e. one
 * played as a whole action on your turn, which is the timing the action phase already models. The cards with
 * reaction windows (combat, invasion, agenda, strategy-phase timing) need a window system that does not exist
 * yet; they are in `ACTION_CARDS` as printed data and will join the deck as their windows land.
 */
export const PLAYABLE_ACTION_CARDS: readonly string[] = [
  'cripple_defenses',
  'economic_initiative',
  'focused_research_1', 'focused_research_2', 'focused_research_3', 'focused_research_4',
  'frontline_deployment_1', 'frontline_deployment_2',
  'ghost_ship_1', 'ghost_ship_2',
  'industrial_initiative',
  'insubordination',
  'mining_initiative',
  'reactor_meltdown',
  'rise_of_a_messiah',
  'unexpected_action_1', 'unexpected_action_2',
  'unstable_planet',
  'uprising',
  'war_effort',
]

const PLAYABLE = new Set(PLAYABLE_ACTION_CARDS)

/** The printed card, with the copy number stripped: `focused_research_3` and its siblings share one effect. */
function effectOf(cardId: string): string {
  return cardId.replace(/_\d+$/, '')
}

const DISCARD_RESHUFFLE_SALT = 97

/** R9: the deck ran out, so the discard pile is shuffled into a new one. An empty discard leaves it empty. */
function reshuffle(state: GameState, seed: number): GameState {
  if (state.actionCardDiscard.length === 0) return state
  const deck = shuffleIds(state.actionCardDiscard, mulberry32(deriveSeed(seed, DISCARD_RESHUFFLE_SALT)))
  return {
    ...state,
    actionCardDeck: [...state.actionCardDeck, ...deck],
    actionCardDiscard: [],
    log: [...state.log, { t: 'info', text: 'the action card discard pile is shuffled into a new deck' }],
  }
}

/**
 * R9: draw `count` action cards for a seat, reshuffling the discard pile when the deck runs dry.
 *
 * Ruling: the hand limit of 7 is enforced here, the moment the hand would exceed it (LRR: "if a player ever
 * has more than seven action cards"). The surplus is the freshly drawn card, because there is no interface
 * yet for choosing which card to throw away; when one exists, the choice becomes the player's.
 */
export function drawActionCards(state: GameState, seat: Seat, count: number, seed: number): GameState {
  let next = state
  const drawn: string[] = []
  for (let i = 0; i < count; i++) {
    if (next.actionCardDeck.length === 0) next = reshuffle(next, deriveSeed(seed, i))
    const [top, ...rest] = next.actionCardDeck
    if (top === undefined) break
    drawn.push(top)
    next = { ...next, actionCardDeck: rest }
  }
  if (drawn.length === 0) {
    return { ...next, log: [...next.log, { t: 'info', text: 'the action card deck is empty, nothing is drawn' }] }
  }
  const players = [...next.players] as GameState['players']
  const hand = [...players[seat].actionCards, ...drawn]
  const kept = hand.slice(0, HAND_LIMIT)
  const over = hand.slice(HAND_LIMIT)
  players[seat] = { ...players[seat], actionCards: kept }
  const log: GameState['log'] = [...next.log, { t: 'info', text: `seat ${seat} draws ${drawn.length} action card(s)` }]
  if (over.length) log.push({ t: 'info', text: `seat ${seat} is over the hand limit of ${HAND_LIMIT} and discards ${over.length} card(s)` })
  return { ...next, players, actionCardDiscard: [...next.actionCardDiscard, ...over], log }
}

/** Every planet on the board with the system it sits in. */
function planetsOnBoard(state: GameState): { systemId: string; planet: Planet }[] {
  const out: { systemId: string; planet: Planet }[] = []
  for (const systemId of Object.keys(state.systems)) {
    for (const planet of state.systems[systemId].planets) out.push({ systemId, planet })
  }
  return out
}

function findPlanet(state: GameState, planetId: string): { systemId: string; planet: Planet } | null {
  return planetsOnBoard(state).find(entry => entry.planet.id === planetId) ?? null
}

function withPlanet(state: GameState, systemId: string, planetId: string, change: (p: Planet) => Planet): GameState {
  const sys = state.systems[systemId]
  return { ...state, systems: { ...state.systems, [systemId]: { ...sys, planets: sys.planets.map(p => p.id === planetId ? change(p) : p) } } }
}

function addTradeGoods(state: GameState, seat: Seat, n: number): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], tradeGoods: players[seat].tradeGoods + n }
  return { ...state, players }
}

/** Takes `count` units of one type out of a seat's reinforcements, capped by what is actually left there. */
function takeFromReinforcements(state: GameState, seat: Seat, type: 'infantry' | 'cruiser' | 'destroyer', count: number): { state: GameState; units: Unit[] } {
  const player = state.players[seat]
  const n = Math.min(count, player.reinforcements[type])
  if (n <= 0) return { state, units: [] }
  const units: Unit[] = []
  let nextUnitId = state.nextUnitId
  for (let i = 0; i < n; i++) units.push({ id: nextUnitId++, type, owner: seat, damaged: false })
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, reinforcements: { ...player.reinforcements, [type]: player.reinforcements[type] - n } }
  return { state: { ...state, players, nextUnitId }, units }
}

/** R9 Ghost Ship: a non-home system with a wormhole that holds no other player's ships. */
export function ghostShipSystems(state: GameState, seat: Seat): string[] {
  return Object.keys(state.systems).filter(id => {
    const sys = state.systems[id]
    return sys.home === null && sys.wormhole !== null && !sys.space.some(u => u.owner !== seat)
  })
}

/** R9 War Effort: any system holding at least one of your ships. */
export function warEffortSystems(state: GameState, seat: Seat): string[] {
  return Object.keys(state.systems).filter(id => state.systems[id].space.some(u => u.owner === seat))
}

/** R9 Reactor Meltdown: every planet in a non-home system that carries a space dock. */
export function meltdownPlanets(state: GameState): string[] {
  return planetsOnBoard(state)
    .filter(({ systemId, planet }) => state.systems[systemId].home === null && planet.structures.some(u => u.type === 'spacedock'))
    .map(({ planet }) => planet.id)
}

/** R9 Uprising: a ready non-home planet controlled by somebody else. */
export function uprisingPlanets(state: GameState, seat: Seat): string[] {
  return planetsOnBoard(state)
    .filter(({ systemId, planet }) => state.systems[systemId].home === null && planet.owner !== null && planet.owner !== seat && !planet.exhausted)
    .map(({ planet }) => planet.id)
}

/** R9 Unstable Planet: a hazardous planet somebody else controls. */
export function unstablePlanets(state: GameState, seat: Seat): string[] {
  return planetsOnBoard(state)
    .filter(({ planet }) => planet.trait === 'hazardous' && planet.owner !== null && planet.owner !== seat)
    .map(({ planet }) => planet.id)
}

/** R9 Cripple Defenses: a planet that actually carries a PDS, so the card is never played for nothing. */
export function crippleDefensePlanets(state: GameState, seat: Seat): string[] {
  return planetsOnBoard(state)
    .filter(({ planet }) => planet.owner !== seat && planet.structures.some(u => u.type === 'pds'))
    .map(({ planet }) => planet.id)
}

function controlledPlanetIds(state: GameState, seat: Seat): string[] {
  return planetsOnBoard(state).filter(({ planet }) => planet.owner === seat).map(({ planet }) => planet.id)
}

/**
 * Resolve the printed effect of one action card. Every branch is the whole printed ability; a card whose
 * ability the engine cannot express is not in `PLAYABLE_ACTION_CARDS` and never reaches this switch.
 */
function resolve(state: GameState, seat: Seat, cardId: string, params: ActionCardParams): Result<GameState> {
  switch (effectOf(cardId)) {
    case 'economic_initiative': {
      // "Ready each cultural planet you control." Playable with none, which readies nothing.
      let next = state
      for (const { systemId, planet } of planetsOnBoard(state)) {
        if (planet.owner === seat && planet.trait === 'cultural' && planet.exhausted) {
          next = withPlanet(next, systemId, planet.id, p => ({ ...p, exhausted: false }))
        }
      }
      return { ok: true, value: next }
    }
    case 'industrial_initiative': {
      // "Gain 1 trade good for each industrial planet you control."
      const n = planetsOnBoard(state).filter(({ planet }) => planet.owner === seat && planet.trait === 'industrial').length
      return { ok: true, value: addTradeGoods(state, seat, n) }
    }
    case 'mining_initiative': {
      // "Gain trade goods equal to the resource value of 1 planet you control."
      const found = params.planetId === undefined ? null : findPlanet(state, params.planetId)
      if (!found || found.planet.owner !== seat) return { ok: false, error: 'R9: name a planet you control' }
      return { ok: true, value: addTradeGoods(state, seat, found.planet.resources) }
    }
    case 'rise_of_a_messiah': {
      // "Place 1 infantry from your reinforcements on each planet you control." The reinforcements are finite,
      // so the infantry go down planet by planet until the supply runs out.
      let next = state
      for (const planetId of controlledPlanetIds(state, seat)) {
        const found = findPlanet(next, planetId)
        if (!found) continue
        const taken = takeFromReinforcements(next, seat, 'infantry', 1)
        if (taken.units.length === 0) break
        next = withPlanet(taken.state, found.systemId, planetId, p => ({ ...p, ground: [...p.ground, ...taken.units] }))
      }
      return { ok: true, value: next }
    }
    case 'frontline_deployment': {
      // "Place 3 infantry from your reinforcements on 1 planet you control."
      const found = params.planetId === undefined ? null : findPlanet(state, params.planetId)
      if (!found || found.planet.owner !== seat) return { ok: false, error: 'R9: name a planet you control' }
      const taken = takeFromReinforcements(state, seat, 'infantry', 3)
      if (taken.units.length === 0) return { ok: false, error: 'R9: no infantry left in your reinforcements' }
      return { ok: true, value: withPlanet(taken.state, found.systemId, found.planet.id, p => ({ ...p, ground: [...p.ground, ...taken.units] })) }
    }
    case 'focused_research': {
      // "Spend 4 trade goods to research 1 technology."
      if (params.techId === undefined) return { ok: false, error: 'R9: name the technology to research' }
      const player = state.players[seat]
      if (player.tradeGoods < 4) return { ok: false, error: 'R9: Focused Research costs 4 trade goods' }
      if (!canResearch(player, params.techId, false)) return { ok: false, error: `R5: ${params.techId} cannot be researched` }
      const players = [...state.players] as GameState['players']
      players[seat] = {
        ...player,
        tradeGoods: player.tradeGoods - 4,
        tradeGoodsSpentThisRound: player.tradeGoodsSpentThisRound + 4,
        techs: [...player.techs, params.techId],
      }
      return { ok: true, value: { ...state, players, log: [...state.log, { t: 'info', text: `seat ${seat} researches ${params.techId}` }] } }
    }
    case 'war_effort': {
      // "Place 1 cruiser from your reinforcements in a system that contains 1 or more of your ships."
      const systemId = params.systemId
      if (systemId === undefined || !state.systems[systemId]) return { ok: false, error: 'R9: name a system' }
      if (!warEffortSystems(state, seat).includes(systemId)) return { ok: false, error: `R9: no ship of yours in ${systemId}` }
      return placeShip(state, seat, systemId, 'cruiser')
    }
    case 'ghost_ship': {
      // "Place 1 destroyer ... in a non-home system that contains a wormhole and does not contain other
      // players' ships."
      const systemId = params.systemId
      if (systemId === undefined || !state.systems[systemId]) return { ok: false, error: 'R9: name a system' }
      if (!ghostShipSystems(state, seat).includes(systemId)) {
        return { ok: false, error: `R9: ${systemId} is not an empty wormhole system outside a home system` }
      }
      return placeShip(state, seat, systemId, 'destroyer')
    }
    case 'unexpected_action': {
      // "Remove 1 of your command tokens from the game board and return it to your reinforcements."
      const systemId = params.systemId
      const sys = systemId === undefined ? undefined : state.systems[systemId]
      if (!sys || !systemId || !sys.activatedBy.includes(seat)) return { ok: false, error: 'R9: name a system holding a command token of yours' }
      return { ok: true, value: { ...state, systems: { ...state.systems, [systemId]: { ...sys, activatedBy: sys.activatedBy.filter(s => s !== seat) } } } }
    }
    case 'insubordination': {
      // "Remove 1 token from another player's tactic pool and return it to their reinforcements."
      const target = params.seat
      if (target === undefined || target === seat || target < 0 || target >= state.players.length) {
        return { ok: false, error: 'R9: name another player' }
      }
      const victim = state.players[target]
      if (victim.tokens.tactic < 1) return { ok: false, error: `R9: seat ${target} has no token in their tactic pool` }
      const players = [...state.players] as GameState['players']
      players[target] = { ...victim, tokens: { ...victim.tokens, tactic: victim.tokens.tactic - 1 } }
      return { ok: true, value: { ...state, players } }
    }
    case 'uprising': {
      // "Exhaust 1 non-home planet controlled by another player. Then gain trade goods equal to its resource value."
      const planetId = params.planetId
      if (planetId === undefined || !uprisingPlanets(state, seat).includes(planetId)) {
        return { ok: false, error: 'R9: name a ready non-home planet another player controls' }
      }
      const found = findPlanet(state, planetId)
      if (!found) return { ok: false, error: `unknown planet ${planetId}` }
      const exhausted = withPlanet(state, found.systemId, planetId, p => ({ ...p, exhausted: true }))
      return { ok: true, value: addTradeGoods(exhausted, seat, found.planet.resources) }
    }
    case 'unstable_planet': {
      // "Choose 1 hazardous planet. Exhaust that planet and destroy up to 3 infantry on it." Ruling: the
      // engine takes the maximum of an "up to", so three infantry die whenever three are there.
      const planetId = params.planetId
      if (planetId === undefined || !unstablePlanets(state, seat).includes(planetId)) {
        return { ok: false, error: 'R9: name a hazardous planet another player controls' }
      }
      const found = findPlanet(state, planetId)
      if (!found) return { ok: false, error: `unknown planet ${planetId}` }
      const doomed = found.planet.ground.slice(0, 3)
      const exhausted = withPlanet(state, found.systemId, planetId, p => ({ ...p, exhausted: true }))
      return { ok: true, value: destroyUnits(exhausted, found.systemId, doomed) }
    }
    case 'cripple_defenses': {
      // "Choose 1 planet. Destroy each PDS on that planet."
      const planetId = params.planetId
      const found = planetId === undefined ? null : findPlanet(state, planetId)
      if (!found) return { ok: false, error: 'R9: name a planet' }
      const doomed = found.planet.structures.filter(u => u.type === 'pds')
      return { ok: true, value: destroyUnits(state, found.systemId, doomed) }
    }
    case 'reactor_meltdown': {
      // "Destroy 1 space dock in a non-home system."
      const planetId = params.planetId
      if (planetId === undefined || !meltdownPlanets(state).includes(planetId)) {
        return { ok: false, error: 'R9: name a planet outside a home system that carries a space dock' }
      }
      const found = findPlanet(state, planetId)
      if (!found) return { ok: false, error: `unknown planet ${planetId}` }
      const dock = found.planet.structures.find(u => u.type === 'spacedock')
      return { ok: true, value: dock ? destroyUnits(state, found.systemId, [dock]) : state }
    }
    default:
      return { ok: false, error: `R9: ${cardId} is not implemented yet` }
  }
}

/**
 * R4.4: whether one more ship of that type would still fit the seat's fleet pool in that system. The
 * enumerator asks before offering War Effort or Ghost Ship there, so an offered play is never refused.
 */
function fitsFleet(state: GameState, seat: Seat, systemId: string, type: 'cruiser' | 'destroyer'): boolean {
  const sys = state.systems[systemId]
  const probe: GameState = {
    ...state,
    systems: { ...state.systems, [systemId]: { ...sys, space: [...sys.space, { id: -1, type, owner: seat, damaged: false }] } },
  }
  return checkFleet(probe, seat, systemId).ok
}

/** Places one ship from the reinforcements and refuses the placement if it would break the fleet pool. */
function placeShip(state: GameState, seat: Seat, systemId: string, type: 'cruiser' | 'destroyer'): Result<GameState> {
  const taken = takeFromReinforcements(state, seat, type, 1)
  if (taken.units.length === 0) return { ok: false, error: `R9: no ${type} left in your reinforcements` }
  const sys = taken.state.systems[systemId]
  const next: GameState = { ...taken.state, systems: { ...taken.state.systems, [systemId]: { ...sys, space: [...sys.space, ...taken.units] } } }
  const fleet = checkFleet(next, seat, systemId)
  if (!fleet.ok) return { ok: false, error: 'R4.4: the new ship would exceed your fleet pool there' }
  return { ok: true, value: next }
}

/**
 * R9: play an action card as your action for the turn. The card leaves the hand for the discard pile whether
 * or not its effect changed anything, and the action is spent, exactly like a strategic or tactical action.
 */
export function playActionCard(state: GameState, cardId: string, params: ActionCardParams | undefined): Result<GameState> {
  if (state.phase !== 'action') return { ok: false, error: 'not in the action phase' }
  if (state.tactical) return { ok: false, error: 'finish the tactical action first' }
  if (state.pendingSecondary) return { ok: false, error: 'R3.2: a secondary window is open' }
  if (state.turnDone) return { ok: false, error: ACTION_SPENT }
  const seat = state.active
  if (state.players[seat].passed) return { ok: false, error: 'this player has passed' }
  if (!state.players[seat].actionCards.includes(cardId)) return { ok: false, error: `R9: seat ${seat} does not hold ${cardId}` }
  const def = findActionCard(cardId)
  if (!def) return { ok: false, error: `unknown action card ${cardId}` }
  if (!PLAYABLE.has(cardId)) return { ok: false, error: `R9: ${cardId} is not implemented yet` }
  if (def.window !== 'Action') return { ok: false, error: `R9: ${def.name} is not played as an action` }
  const played = resolve(state, seat, cardId, params ?? {})
  if (!played.ok) return played
  const players = [...played.value.players] as GameState['players']
  const hand = [...players[seat].actionCards]
  hand.splice(hand.indexOf(cardId), 1)
  players[seat] = { ...players[seat], actionCards: hand }
  return {
    ok: true,
    value: {
      ...played.value,
      players,
      actionCardDiscard: [...played.value.actionCardDiscard, cardId],
      turnDone: true,
      log: [...played.value.log, { t: 'info', text: `seat ${seat} plays ${def.name}` }],
    },
  }
}

/**
 * Every action card in the seat's hand that can be played right now, one move per legal target. A card with
 * no legal target is not offered at all, so accepting one of these is always a move the handler takes.
 */
export function actionCardMoves(state: GameState, seat: Seat): Move[] {
  const out: Move[] = []
  const player = state.players[seat]
  for (const cardId of player.actionCards) {
    if (!PLAYABLE.has(cardId)) continue
    const card = (): Move[] => {
      switch (effectOf(cardId)) {
        case 'economic_initiative':
        case 'industrial_initiative':
          return [{ type: 'playActionCard', cardId, params: {} }]
        case 'rise_of_a_messiah':
          return controlledPlanetIds(state, seat).length && player.reinforcements.infantry > 0
            ? [{ type: 'playActionCard', cardId, params: {} }]
            : []
        case 'mining_initiative':
          return controlledPlanetIds(state, seat).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
        case 'frontline_deployment':
          return player.reinforcements.infantry > 0
            ? controlledPlanetIds(state, seat).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
            : []
        case 'focused_research':
          if (player.tradeGoods < 4) return []
          return researchableTechs(state, seat).map((techId): Move => ({ type: 'playActionCard', cardId, params: { techId } }))
        case 'war_effort':
          return player.reinforcements.cruiser > 0
            ? warEffortSystems(state, seat)
              .filter(systemId => fitsFleet(state, seat, systemId, 'cruiser'))
              .map((systemId): Move => ({ type: 'playActionCard', cardId, params: { systemId } }))
            : []
        case 'ghost_ship':
          return player.reinforcements.destroyer > 0
            ? ghostShipSystems(state, seat)
              .filter(systemId => fitsFleet(state, seat, systemId, 'destroyer'))
              .map((systemId): Move => ({ type: 'playActionCard', cardId, params: { systemId } }))
            : []
        case 'unexpected_action':
          return Object.keys(state.systems)
            .filter(id => state.systems[id].activatedBy.includes(seat))
            .map((systemId): Move => ({ type: 'playActionCard', cardId, params: { systemId } }))
        case 'insubordination':
          return state.players
            .filter(p => p.seat !== seat && p.tokens.tactic > 0)
            .map((p): Move => ({ type: 'playActionCard', cardId, params: { seat: p.seat } }))
        case 'uprising':
          return uprisingPlanets(state, seat).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
        case 'unstable_planet':
          return unstablePlanets(state, seat).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
        case 'cripple_defenses':
          return crippleDefensePlanets(state, seat).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
        case 'reactor_meltdown':
          return meltdownPlanets(state).map((planetId): Move => ({ type: 'playActionCard', cardId, params: { planetId } }))
        default:
          return []
      }
    }
    out.push(...card())
  }
  return out
}

/** The card's own name, for interfaces and log lines. */
export function actionCardName(cardId: string): string {
  return actionCardDef(cardId).name
}

function researchableTechs(state: GameState, seat: Seat): string[] {
  return researchable(state.players[seat])
}
