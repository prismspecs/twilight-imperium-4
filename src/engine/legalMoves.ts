import { ACTION_SPENT, activatableSystems, canPass } from './actionPhase'
import { canMunitions, defaultAssignment, pendingFor, retreatTargets } from './combat'
import { SHIPYARD_COST, canInheritance, canShipyard, inheritanceTechs, postDef, shipyardPlanets, tradePostOptions } from './componentActions'
import { cheapestPlanets, productionCost, productionLimit, readyInfluence } from './economy'
import { PRODUCIBLE } from './production'
import { bombardablePlanets, groundCombatPending, landablePlanets } from './invasion'
import { movableShips } from './movement'
import { postAbilityOptions } from './postAbilities'
import { fulfils } from './objectives'
import { researchable } from './research'
import { FACTIONS } from '../data/factions'
import { homeSystemOf } from './board'
import { isShip } from '../data/units'
import { diplomacySystems, otherSeatsInOrder, secondaryTokenCost, unusedCards, warfareTokenSystems } from './strategicActions'
import { MECATOL_ID } from '../data/map'
import { tokensGained } from './statusPhase'
import type { GameState, Move, Result, Seat, StrategicParams, StrategyCardId } from './types'

function tacticalMoves(state: GameState): Move[] {
  const tac = state.tactical
  if (!tac) return []
  const seat = state.active
  switch (tac.step) {
    case 'movement': {
      const out: Move[] = []
      if (movableShips(state, seat).length) out.push({ type: 'moveShips', moves: [] })
      out.push({ type: 'endMovement' })
      return out
    }
    case 'spaceCombat': {
      const out: Move[] = [{ type: 'combatRound' }]
      const combat = tac.combat
      if (!combat) return out
      // R4.1 step 6: Munitions Reserves rerolls a combat round's dice, so it is only offered from round 1 on.
      if (combat.round >= 1) {
        const attacker = canMunitions(state, combat.attacker)
        const defender = canMunitions(state, combat.defender)
        if (attacker) out.push({ type: 'combatRound', munitions: { attacker: true } })
        if (defender) out.push({ type: 'combatRound', munitions: { defender: true } })
        if (attacker && defender) out.push({ type: 'combatRound', munitions: { attacker: true, defender: true } })
      }
      if (combat.round >= 2 && seat === combat.attacker && combat.retreating === null) {
        for (const to of retreatTargets(state, seat)) out.push({ type: 'retreat', to })   // one announcement per combat
      }
      return out
    }
    case 'invasion': {
      const out: Move[] = []
      for (const planetId of bombardablePlanets(state)) out.push({ type: 'bombard', planetId })
      if ((tac.systemId === MECATOL_ID || tac.systemId === 'mecatol') && state.custodiansToken) {
        const hasShips = state.systems[tac.systemId]?.space.some(u => u.owner === seat && (isShip(u.type) || u.type === 'infantry'))
        const canPay = readyInfluence(state, seat) + state.players[seat].tradeGoods >= 6
        if (hasShips && canPay) {
          out.push({ type: 'removeCustodians' })
        }
      }
      for (const { planetId, infantryIds } of landablePlanets(state)) out.push({ type: 'land', planetId, infantryIds })
      if (groundCombatPending(state)) out.push({ type: 'groundCombatRound' })
      else out.push({ type: 'endInvasion' })
      return out
    }
    case 'production': {
      const out: Move[] = []
      if (productionLimit(state, seat, tac.systemId) > 0) out.push({ type: 'produce', units: {}, planets: [], tradeGoods: 0 })
      out.push({ type: 'endTactical' })
      return out
    }
    case 'done':
      return [{ type: 'endTactical' }]
  }
}

/** One directly playable primary per card; the UI may fill in richer parameters, the handler checks them. */
function primaryMoves(state: GameState, seat: Seat, card: StrategyCardId): Move[] {
  switch (card) {
    case 'diplomacy': {
      // R6: with no eligible system the card is played bare, which is what the handler allows
      const systems = diplomacySystems(state, seat)
      if (!systems.length) return [{ type: 'strategic', card, params: {} }]
      return systems.map((systemId): Move => ({ type: 'strategic', card, params: { systemId, planets: [] } }))
    }
    case 'warfare': {
      // R6: a token on the board must be named, so the bare variant is offered only when there is none
      const systems = warfareTokenSystems(state, seat)
      if (!systems.length) return [{ type: 'strategic', card, params: {} }]
      return systems.map((systemId): Move => ({ type: 'strategic', card, params: { systemId } }))
    }
    case 'technology': {
      const techs = researchable(state.players[seat])
      if (!techs.length) return [{ type: 'strategic', card, params: {} }]
      return techs.map((techId): Move => ({ type: 'strategic', card, params: { techId } }))
    }
    case 'imperial': {
      const open = state.publicObjectives.filter(id => !state.players[seat].scoredObjectives.includes(id) && fulfils(state, seat, id))
      return [{ type: 'strategic', card, params: {} }, ...open.map((objectiveId): Move => ({ type: 'strategic', card, params: { objectiveId } }))]
    }
    case 'trade':
      // R6: sharing is optional and can target any other player, so each one is offered alongside the bare primary
      return [{ type: 'strategic', card, params: {} }, ...otherSeatsInOrder(state, seat).map(s2 => ({ type: 'strategic' as const, card, params: { shareWith: [s2] } }))]
    default:
      return [{ type: 'strategic', card, params: {} }]
  }
}

/** The affordable secondary answers; every one of them is accepted by its handler. */
function secondaryMoves(state: GameState, seat: Seat, card: StrategyCardId): Move[] {
  const player = state.players[seat]
  if (player.tokens.strategy < secondaryTokenCost(card)) return []
  const params: StrategicParams = {}
  switch (card) {
    case 'leadership':
      // R6, consistent with the Diplomacy and Trade filters below: with nothing to spend as influence the
      // secondary hands out 0 tokens, so accepting is a pure no-op and only the decline is offered
      if (readyInfluence(state, seat) < 1 && player.tradeGoods < 1) return []
      return [{ type: 'secondary', card, accept: true, params }]
    case 'diplomacy': {
      const exhausted: string[] = []
      for (const sys of Object.values(state.systems)) {
        for (const p of sys.planets) if (p.owner === seat && p.exhausted && exhausted.length < 2) exhausted.push(p.id)
      }
      return exhausted.length ? [{ type: 'secondary', card, accept: true, params: { planets: exhausted } }] : []
    }
    case 'trade':
      // R6, consistent with the Diplomacy filter above: already replenished is a no-op token burn, not useful
      return player.commodities < FACTIONS[player.faction].commodityValue ? [{ type: 'secondary', card, accept: true, params }] : []
    case 'warfare': {
      // R6: the secondary is the space dock's full PRODUCTION ability, so the window opens as soon as any one
      // unit is affordable; the responder picks the units and the payment, the handler checks them.
      const home = state.systems[homeSystemOf(state, seat)]
      const dock = home.planets.some(p => p.structures.some(u => u.type === 'spacedock' && u.owner === seat))
      if (!dock || productionLimit(state, seat, home.id) < 1) return []
      const stats = { faction: player.faction, techs: player.techs }
      for (const type of PRODUCIBLE) {
        if (player.reinforcements[type] < 1) continue
        const cost = productionCost({ [type]: 1 }, stats, player.techs.includes('sarween_tools'))
        const planets = cheapestPlanets(state, seat, cost)
        if (planets) return [{ type: 'secondary', card, accept: true, params: { units: { [type]: 1 }, planets, tradeGoods: 0 } }]
      }
      return []
    }
    case 'technology': {
      const planets = cheapestPlanets(state, seat, 4)
      if (!planets) return []
      return researchable(state.players[seat]).map((techId): Move => ({ type: 'secondary', card, accept: true, params: { techId, planets } }))
    }
    case 'imperial':
      return [{ type: 'secondary', card, accept: true, params }]
  }
}

/**
 * R8: the free moves at the two posts, offered before and after the action alike. The sale takes as many
 * commodities as the post in play allows; the special ability is offered with the first of the ready-made
 * picks `postAbilityOptions` enumerates, every one of which the handler accepts as it is.
 */
function postMoves(state: GameState, seat: Seat): Move[] {
  const out: Move[] = []
  for (const post of tradePostOptions(state, seat)) {
    out.push({ type: 'tradePost', post, commodities: Math.min(postDef(state, post).commodityLimit, state.players[seat].commodities) })
  }
  for (const post of ['west', 'east'] as const) {
    const options = postAbilityOptions(state, seat, post)
    if (options.length) out.push({ type: 'postAbility', post, params: options[0] })
  }
  return out
}

export function legalMoves(state: GameState): Move[] {
  if (state.winner !== null || state.phase === 'ended') return []
  // R4.1 step 4: queued hits block everything else, and the offer is a complete pick so it can be played as it is
  if (pendingFor(state)) return [{ type: 'assignHits', ...defaultAssignment(state) }]
  if (state.phase === 'strategy') {
    const seat = state.draft[0]
    if (seat === undefined || seat !== state.active) return []
    return state.strategyPool.map(c => ({ type: 'pickStrategyCard', card: c.id }))
  }
  if (state.phase === 'status') {
    const seat = state.active
    const tokens = state.players[seat].tokens
    return [{ type: 'status', params: { tokens: { ...tokens, tactic: tokens.tactic + tokensGained(state, seat) } } }]
  }
  if (state.phase !== 'action') return []
  const seat = state.active
  // R3.2: the answer to a strategy card is not a turn, so it comes before the passed check
  const pending = state.pendingSecondary
  if (pending !== null) {
    // the seat the window is waiting on (the head of the queue) answers; the holder and anyone else in the
    // queue who is not the head must not act, and the enumerator stays on the decline so a live phase never
    // hands back an empty list
    if (pending.queue[0] !== seat) return [{ type: 'secondary', card: pending.card, accept: false }]
    return [{ type: 'secondary', card: pending.card, accept: false }, ...secondaryMoves(state, seat, pending.card)]
  }
  if (state.players[seat].passed) return []
  if (state.tactical) return tacticalMoves(state)
  // R3.2/R8: the action is spent but the turn is not over. Only the free moves and the handover are left:
  // no second action, and no `pass` either, because you pass instead of taking an action, never after one.
  if (state.turnDone) {
    const spent: Move[] = [{ type: 'endTurn' }, ...postMoves(state, seat)]
    return spent
  }
  const out: Move[] = activatableSystems(state, seat).map(id => ({ type: 'startTactical', systemId: id }))
  for (const card of unusedCards(state, seat)) out.push(...primaryMoves(state, seat, card))
  if (canInheritance(state, seat)) {
    for (const techId of inheritanceTechs(state, seat)) out.push({ type: 'research', techId, via: 'inheritance' })
  }
  if (canShipyard(state, seat)) {
    const planets = cheapestPlanets(state, seat, SHIPYARD_COST) ?? []
    for (const planetId of shipyardPlanets(state, seat)) out.push({ type: 'shipyard', planetId, planets, tradeGoods: 0 })
  }
  out.push(...postMoves(state, seat))
  if (canPass(state, seat)) out.push({ type: 'pass' })
  return out
}

/** Compares the fields that identify a move; the parameters the UI fills in are not compared. */
function matches(candidate: Move, move: Move): boolean {
  if (candidate.type !== move.type) return false
  switch (move.type) {
    case 'pickStrategyCard':
      return candidate.type === 'pickStrategyCard' && candidate.card === move.card
    case 'startTactical':
      return candidate.type === 'startTactical' && candidate.systemId === move.systemId
    case 'combatRound': {
      if (candidate.type !== 'combatRound') return false
      const a = candidate.munitions
      const b = move.munitions
      return (a?.attacker ?? false) === (b?.attacker ?? false) && (a?.defender ?? false) === (b?.defender ?? false)
    }
    case 'retreat':
      return candidate.type === 'retreat' && candidate.to === move.to
    case 'bombard':
      return candidate.type === 'bombard' && candidate.planetId === move.planetId
    case 'removeCustodians':
      return candidate.type === 'removeCustodians'
    case 'land':
      return candidate.type === 'land' && candidate.planetId === move.planetId
    case 'strategic':
      return candidate.type === 'strategic' && candidate.card === move.card
    case 'secondary':
      return candidate.type === 'secondary' && candidate.card === move.card && candidate.accept === move.accept
    case 'research':
      return candidate.type === 'research' && candidate.techId === move.techId
    case 'shipyard':
      return candidate.type === 'shipyard' && candidate.planetId === move.planetId
    case 'tradePost':
      return candidate.type === 'tradePost' && candidate.post === move.post
    // R8: which ability it is follows from the post, so the side identifies the move; the parameters the
    // interface fills in are checked by `postAbility`, the only place that knows what the ability needs
    case 'postAbility':
      return candidate.type === 'postAbility' && candidate.post === move.post
    default:
      // moveShips, produce, assignHits, status and the closing moves are identified by their kind alone; the
      // picks of an assignment are checked by its handler, which is the only place that knows the queue
      return true
  }
}

export function validateMove(state: GameState, move: Move): Result<true> {
  if (pendingFor(state) && move.type !== 'assignHits') return { ok: false, error: 'hits must be assigned first' }
  const ok = legalMoves(state).some(candidate => matches(candidate, move))
  if (ok) return { ok: true, value: true }
  // R3.2: a spent turn is the one rejection worth naming, because the player still has moves, just not this one
  if (state.phase === 'action' && state.turnDone && !state.tactical && state.pendingSecondary === null) {
    return { ok: false, error: ACTION_SPENT }
  }
  return { ok: false, error: `illegal move ${move.type}` }
}
