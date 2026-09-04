import { TRADE_POSTS } from '../data/map'
import type { PostDef } from '../data/posts'
import { TECHS, findTech, type TechDef } from '../data/techs'
import { SHIP_TYPES, isShip, unitStats, type StatsOwner } from '../data/units'
import { checkFleet, destroyUnits, statsOwner } from './board'
import { postDef, postLinked, turnReady } from './componentActions'
import { exhaustPlanets } from './economy'
import { addVp } from './objectives'
import type { GameState, PostAbilityParams, Result, Seat, Unit, UnitType } from './types'

/** R8: what the charter pays for the command token it takes back. */
export const CHARTER_TRADE_GOODS = 4
/** R8: what half a chess clock buys at the Sarnex Time Machine Wheel. */
export const TIME_TRADE_VP = 1
/** R8: the pools a returned command token may come out of; R3.3 knows no others. */
const POOLS = ['tactic', 'fleet', 'strategy'] as const

/**
 * R8: the preconditions every special ability shares. They are the sale's, plus the two the ability adds:
 * the post in play on that side actually has an ability, and nobody has taken it yet this round. A spent
 * turn (`turnDone`) passes, because an ability is a free move like the sale, not an action.
 */
export function postAbilityReady(state: GameState, post: 'west' | 'east'): Result<{ seat: Seat; def: PostDef }> {
  const ready = turnReady(state)
  if (!ready.ok) return ready
  const seat = ready.value
  const def = postDef(state, post)
  if (def.ability === 'none') return { ok: false, error: `R8: the ${def.name} has no special ability` }
  if (state.postAbilityUsed[post]) return { ok: false, error: `R8: the ${def.name}'s ${def.abilityName} is already used this round` }
  if (!postLinked(state, seat, post)) return { ok: false, error: `R8: no planet controlled in a system linked to the ${post} post` }
  return { ok: true, value: { seat, def } }
}

/** R8: a technology's tier is the number of prerequisites it prints, that is the sum of its colour needs. */
function tier(def: TechDef): number {
  return Object.values(def.prereq).reduce((sum, n) => sum + n, 0)
}

/**
 * R8 Tessik Refinery: return one general technology and take another of the same tier in a different colour.
 * Prerequisites are ignored, so this is deliberately not `canResearch`; unit upgrades and faction
 * technologies are out on both sides of the trade.
 */
function techExchange(state: GameState, seat: Seat, params: PostAbilityParams): Result<GameState> {
  const { techId, takeTechId } = params
  if (techId === undefined || takeTechId === undefined) {
    return { ok: false, error: 'R8: name the technology to return and the one to take' }
  }
  const give = findTech(techId)
  const take = findTech(takeTechId)
  if (!give) return { ok: false, error: `R8: unknown technology ${techId}` }
  if (!take) return { ok: false, error: `R8: unknown technology ${takeTechId}` }
  const player = state.players[seat]
  if (!player.techs.includes(techId)) return { ok: false, error: `R8: ${techId} is not owned` }
  if (player.techs.includes(takeTechId)) return { ok: false, error: `R8: ${takeTechId} is already owned` }
  if (give.kind !== 'general' || take.kind !== 'general') {
    return { ok: false, error: 'R8: both sides must be general technologies, no unit upgrades and no faction technologies' }
  }
  if (give.colour === null || take.colour === null) return { ok: false, error: 'R8: both sides must be a technology with a colour' }
  if (give.colour === take.colour) return { ok: false, error: `R8: ${takeTechId} must be a different colour than ${techId}` }
  if (tier(give) !== tier(take)) return { ok: false, error: `R8: ${takeTechId} must be the same tier as ${techId}` }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, techs: [...player.techs.filter(id => id !== techId), takeTechId] }
  return { ok: true, value: { ...state, players } }
}

/**
 * R8 Orrun Port Authority: exhaust exactly one ready planet and take one trade good per resource or per
 * influence it prints, whichever of the two the caller names. Never both sides, never a second planet: the
 * single planet is the whole limit.
 */
function clearingHouse(state: GameState, seat: Seat, params: PostAbilityParams): Result<GameState> {
  const planetId = params.planet
  const pays = params.pays
  if (planetId === undefined) return { ok: false, error: 'R8: name the one planet to exhaust' }
  if (pays !== 'resources' && pays !== 'influence') {
    return { ok: false, error: 'R8: say whether the planet pays its resources or its influence' }
  }
  const spent = exhaustPlanets(state, seat, [planetId])
  if (!spent.ok) return spent
  const gained = pays === 'resources' ? spent.value.resources : spent.value.influence
  if (gained < 1) return { ok: false, error: `R8: ${planetId} prints no ${pays}` }
  const next = spent.value.state
  const players = [...next.players] as GameState['players']
  players[seat] = { ...players[seat], tradeGoods: players[seat].tradeGoods + gained }
  return { ok: true, value: { ...next, players } }
}

/**
 * R8 Sarnex Time Machine Wheel: half the seat's remaining clock for 1 victory point. The engine is time-free,
 * so it grants and logs the point and nothing else; the interface halves that seat's clock when it applies
 * the move. A replay of the log therefore rebuilds the score without knowing anything about clocks.
 */
function timeTrade(state: GameState, seat: Seat): Result<GameState> {
  return { ok: true, value: addVp(state, seat, TIME_TRADE_VP, 'time trade at the Sarnex Time Machine Wheel') }
}

/**
 * R8 Kesh Line Freighter and Vandel Bulk Tanker: both return one command token from a pool the caller names.
 * The token goes back to the reinforcements, never onto the board, and the engine has no reinforcement
 * counter for tokens, so taking it off the command sheet is the whole of it. The pool is checked against the
 * three that exist, because a bogus key would read as `undefined` and turn the arithmetic into `NaN`.
 */
function returnToken(state: GameState, seat: Seat, params: PostAbilityParams): Result<GameState> {
  const pool = params.pool
  if (pool === undefined || !POOLS.includes(pool)) return { ok: false, error: 'R8: name the pool the command token comes from' }
  const player = state.players[seat]
  if (player.tokens[pool] < 1) return { ok: false, error: `R8: no command token in the ${pool} pool` }
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...player,
    tokens: { ...player.tokens, [pool]: player.tokens[pool] - 1 },
    tokensSpentThisRound: player.tokensSpentThisRound + (pool === 'fleet' ? 0 : 1),
  }
  const next: GameState = { ...state, players }
  // R4.4: only the fleet pool carries ships, and the engine never destroys ships to make a sheet fit. The
  // same guard the Warfare redistribution uses, narrowed to the one pool whose shrinking can break a fleet:
  // if a fleet on the board would be over the pool afterwards, the token stays where it is.
  if (pool === 'fleet') {
    for (const sys of Object.values(next.systems)) {
      if (!sys.space.some(u => u.owner === seat)) continue
      if (!checkFleet(next, seat, sys.id).ok) return { ok: false, error: `R8/R4.4: returning that token would leave your fleet in ${sys.id} over the pool` }
    }
  }
  return { ok: true, value: next }
}

/** R8 Kesh Line Freighter: one command token from any pool for 4 trade goods. */
function charter(state: GameState, seat: Seat, params: PostAbilityParams): Result<GameState> {
  const spent = returnToken(state, seat, params)
  if (!spent.ok) return spent
  const players = [...spent.value.players] as GameState['players']
  players[seat] = { ...players[seat], tradeGoods: players[seat].tradeGoods + CHARTER_TRADE_GOODS }
  return { ok: true, value: { ...spent.value, players } }
}

/**
 * R8: what a ship is worth in a refit. Fighters are produced two to a cost, so one is worth half a cost and
 * a dreadnought is worth eight of them. This is deliberately not `productionCost`, which rounds a part-order
 * up to a whole cost; a refit weighs hulls, it does not buy them.
 */
function refitValue(type: UnitType, stats: StatsOwner): number {
  const s = unitStats(type, stats)
  return s.cost / s.producedPerCost
}

/**
 * R8 Dromm Heavy Hauler: return any ships from one system this post serves and take any ships out of the
 * reinforcements whose total cost is no higher, into the same system. One big hull for many small ones or the
 * other way round, whatever adds up; the difference is lost. Infantry is not a ship and is out of both lists
 * by `isShip`, and the fleet that comes out of it has to hold up to `checkFleet`, so a swap that strands
 * cargo or overruns the fleet pool is refused rather than trimmed.
 */
function refit(state: GameState, seat: Seat, post: 'west' | 'east', params: PostAbilityParams): Result<GameState> {
  const give = params.give ?? []
  const take = params.take ?? {}
  if (!give.length) return { ok: false, error: 'R8: name the ships to return' }
  if (new Set(give).size !== give.length) return { ok: false, error: 'R8: a ship can only be returned once' }
  const wanted = (Object.entries(take) as [UnitType, number][]).filter(([, n]) => n !== 0)
  if (!wanted.length) return { ok: false, error: 'R8: name the ships to take' }
  const stats = statsOwner(state, seat)
  let cost = 0
  for (const [type, n] of wanted) {
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: `R8: ${type} must be a whole number of ships` }
    if (!isShip(type)) return { ok: false, error: `R8: ${type} is not a ship` }
    cost += n * refitValue(type, stats)
  }
  const systemId = TRADE_POSTS[post].find(id => {
    const sys = state.systems[id]
    return sys !== undefined && sys.space.some(u => u.id === give[0])
  })
  if (systemId === undefined) return { ok: false, error: `R8: the ships must be in one system linked to the ${post} post` }
  const units: Unit[] = []
  let returned = 0
  for (const id of give) {
    const unit = state.systems[systemId].space.find(u => u.id === id)
    if (!unit) return { ok: false, error: `R8: the ships returned must be all in the same system, ${id} is not in ${systemId}` }
    if (unit.owner !== seat) return { ok: false, error: `R8: ship ${id} in ${systemId} is not yours` }
    if (!isShip(unit.type)) return { ok: false, error: `R8: ${unit.type} is not a ship` }
    units.push(unit)
    returned += refitValue(unit.type, stats)
  }
  if (cost > returned) return { ok: false, error: `R8: the ships taken cost ${cost}, the ships returned are worth ${returned}` }
  // the returned hulls reach the reinforcements before the new ones are drawn, so a fleet may be recast as
  // its own kinds; whatever is left over of the cost is simply lost, as the spec says
  let next = destroyUnits(state, systemId, units)
  const me = next.players[seat]
  const reinforcements = { ...me.reinforcements }
  const built: Unit[] = []
  let nextUnitId = next.nextUnitId
  for (const [type, n] of wanted) {
    if (reinforcements[type] < n) return { ok: false, error: `R8: only ${reinforcements[type]} ${type} in the reinforcements` }
    reinforcements[type] -= n
    for (let i = 0; i < n; i++) built.push({ id: nextUnitId++, type, owner: seat, damaged: false })
  }
  const players = [...next.players] as GameState['players']
  players[seat] = { ...me, reinforcements }
  const sys = next.systems[systemId]
  next = {
    ...next, players, nextUnitId,
    systems: { ...next.systems, [systemId]: { ...sys, space: [...sys.space, ...built] } },
  }
  const fleet = checkFleet(next, seat, systemId)
  if (!fleet.ok) return fleet
  return { ok: true, value: next }
}

/** R8: every use of an ability is once per round for the table, and says in the log who took what where. */
function spend(state: GameState, seat: Seat, post: 'west' | 'east', def: PostDef): GameState {
  return {
    ...state,
    postAbilityUsed: { ...state.postAbilityUsed, [post]: true },
    log: [...state.log, { t: 'info', text: `seat ${seat} uses ${def.abilityName} at the ${post} post, the ${def.name}` }],
  }
}

/**
 * R8: the special ability of the post in play on that side. Which ability that is comes from the post, never
 * from the parameters, so a caller cannot pick an ability by filling in its fields.
 */
export function postAbility(state: GameState, post: 'west' | 'east', params: PostAbilityParams): Result<GameState> {
  const ready = postAbilityReady(state, post)
  if (!ready.ok) return ready
  const { seat, def } = ready.value
  const resolved = resolveAbility(state, seat, post, def, params)
  if (!resolved.ok) return resolved
  return { ok: true, value: spend(resolved.value, seat, post, def) }
}

function resolveAbility(state: GameState, seat: Seat, post: 'west' | 'east', def: PostDef, params: PostAbilityParams): Result<GameState> {
  switch (def.ability) {
    case 'timeTrade': return timeTrade(state, seat)
    case 'techExchange': return techExchange(state, seat, params)
    case 'clearingHouse': return clearingHouse(state, seat, params)
    case 'charter': return charter(state, seat, params)
    // R8: the tanker buys time, which the engine does not have; the move is recorded and the interface adds
    // the three minutes to that seat's clock when it applies it
    case 'layover': return returnToken(state, seat, params)
    case 'refit': return refit(state, seat, post, params)
    // `postAbilityReady` has already refused a post without an ability, so this is unreachable
    case 'none': return { ok: false, error: `R8: the ${def.name} has no special ability` }
  }
}

/**
 * R8: the ready-made picks the interface offers at a post, every one of them directly playable — the
 * enumerator contract of `docs/spec/engine-design.md`, so `legalMoves` can hand the first one straight to a
 * driver. The lists are kept finite and small on purpose: every legal pair for the technology exchange, one
 * canonical planet pick per achievable payout for the clearing house, every pool that holds a token for the
 * charter and the layover, and one give-set per ship the refit could take out of each of the post's systems.
 * A richer pick the interface builds itself is checked by `postAbility`, which is the only authority.
 */
export function postAbilityOptions(state: GameState, seat: Seat, post: 'west' | 'east'): PostAbilityParams[] {
  const ready = postAbilityReady(state, post)
  if (!ready.ok || ready.value.seat !== seat) return []
  switch (ready.value.def.ability) {
    // the time trade needs nothing named: the point is the engine's, the clock is the interface's
    case 'timeTrade': return [{}]
    case 'techExchange': return techExchangeOptions(state, seat)
    case 'clearingHouse': return clearingHouseOptions(state, seat)
    case 'charter':
    case 'layover': return poolOptions(state, seat)
    case 'refit': return refitOptions(state, seat, post)
    case 'none': return []
  }
}

function techExchangeOptions(state: GameState, seat: Seat): PostAbilityParams[] {
  const owned = state.players[seat].techs.map(id => findTech(id)).filter(t => t !== undefined)
  const out: PostAbilityParams[] = []
  for (const give of owned) {
    if (give.kind !== 'general' || give.colour === null) continue
    for (const take of TECHS) {
      if (take.kind !== 'general' || take.colour === null) continue
      if (take.colour === give.colour || tier(take) !== tier(give)) continue
      if (state.players[seat].techs.includes(take.id)) continue
      out.push({ techId: give.id, takeTechId: take.id })
    }
  }
  return out
}

/**
 * R8: the pools that still hold a token, the fullest first, so the offered default is the least painful.
 * Each one goes through `returnToken`, which is what refuses a fleet token that a fleet on the board needs.
 */
function poolOptions(state: GameState, seat: Seat): PostAbilityParams[] {
  const tokens = state.players[seat].tokens
  return POOLS.filter(pool => tokens[pool] >= 1)
    .sort((a, b) => tokens[b] - tokens[a])
    .map((pool): PostAbilityParams => ({ pool }))
    .filter(params => returnToken(state, seat, params).ok)
}

/**
 * R8: every ready planet the seat controls, once for each of the two values it prints, the richest pick
 * first. A planet that prints nothing on a side is not offered for that side, because it would pay nothing.
 */
function clearingHouseOptions(state: GameState, seat: Seat): PostAbilityParams[] {
  const picks: { params: PostAbilityParams; value: number }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) {
      if (p.owner !== seat || p.exhausted) continue
      if (p.resources >= 1) picks.push({ params: { planet: p.id, pays: 'resources' }, value: p.resources })
      if (p.influence >= 1) picks.push({ params: { planet: p.id, pays: 'influence' }, value: p.influence })
    }
  }
  return picks.sort((a, b) => b.value - a.value).map(pick => pick.params)
}

/** How many of the seat's non-fighter ships in one system a refit search looks at; 2^8 subsets is the cap. */
const REFIT_SEARCH_LIMIT = 8

/**
 * R8: a starting pick per ship the refit could take out of one of the post's systems, each paid for by the
 * cheapest set of hulls that covers it and survives `checkFleet`. The many-to-many swaps the ability allows
 * are the interface's to assemble; every candidate here is put through `refit` itself, so an offered option
 * is never one the handler would refuse.
 */
function refitOptions(state: GameState, seat: Seat, post: 'west' | 'east'): PostAbilityParams[] {
  const out: PostAbilityParams[] = []
  const stats = statsOwner(state, seat)
  for (const systemId of TRADE_POSTS[post]) {
    const sys = state.systems[systemId]
    if (!sys) continue
    const ships = sys.space
      .filter(u => u.owner === seat && isShip(u.type))
      .slice(0, REFIT_SEARCH_LIMIT)
    if (!ships.length) continue
    const subsets: { ids: number[]; value: number }[] = []
    for (let mask = 1; mask < 1 << ships.length; mask++) {
      let value = 0
      const ids: number[] = []
      for (let i = 0; i < ships.length; i++) {
        if (!(mask & (1 << i))) continue
        value += refitValue(ships[i].type, stats)
        ids.push(ships[i].id)
      }
      subsets.push({ ids, value })
    }
    subsets.sort((a, b) => a.value - b.value || a.ids.length - b.ids.length)
    for (const type of SHIP_TYPES) {
      // the returned hulls reach the reinforcements first, so a type all on the board is still takeable
      if (state.players[seat].reinforcements[type] + ships.filter(u => u.type === type).length < 1) continue
      const cost = refitValue(type, stats)
      for (const subset of subsets) {
        if (subset.value < cost) continue
        const params: PostAbilityParams = { give: subset.ids, take: { [type]: 1 } }
        if (!refit(state, seat, post, params).ok) continue
        out.push(params)
        break
      }
    }
  }
  return out
}
