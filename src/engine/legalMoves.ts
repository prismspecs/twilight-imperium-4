import { actionCardMoves } from './actionCards'
import { ACTION_SPENT, activatableSystems, canPass } from './actionPhase'
import { agendaMoves } from './agendas'
import { canMunitions, defaultAssignment, pendingFor, retreatTargets } from './combat'
import { pendingReaction, reactionMoves } from './reactions'
import { canInheritance, canProductionBiomes, inheritanceTechs, productionBiomesTargets } from './componentActions'
import { cheapestPayment, cheapestPlanets, hasOwnDock, productionCost, productionLimit, readyInfluence } from './economy'
import { PRODUCIBLE } from './production'
import { bombardablePlanets, groundCombatPending, landablePlanets } from './invasion'
import { movableShips } from './movement'
import { fulfils } from './objectives'
import { canResearch, researchable, researchableWithSkips } from './research'
import { FACTIONS } from '../data/factions'
import { techDef } from '../data/techs'
import { hasTech, homeSystemOf, maxFightersAllowed } from './board'
import { isShip } from '../data/units'
import { constructionPlanets, diplomacySystems, otherSeatsInOrder, secondaryTokenCost, unusedCards, warfareTokenSystems } from './strategicActions'
import { MECATOL_ID } from '../data/map'
import { tokensGained } from './statusPhase'
import type { GameState, Move, Result, Seat, StrategicParams, StrategyCardId, TechColor } from './types'

/**
 * LRR "Technology Specialties" 12: the seat's own ready planets that carry one, each worth ignoring one
 * matching prerequisite symbol on whatever technology is being researched.
 */
function techSkipCandidates(state: GameState, seat: Seat): { planetId: string; colour: TechColor }[] {
  const out: { planetId: string; colour: TechColor }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat && !p.exhausted && p.techSkip) out.push({ planetId: p.id, colour: p.techSkip })
  }
  return out
}

/**
 * One legal (not the only possible) set of the seat's specialty planets that gets `techId` researchable —
 * greedily one planet per still-needed colour, cheapest in the sense of "fewest planets spent" since it never
 * takes a second planet of a colour the tech only needs once. Empty array if no skip is needed at all; null if
 * no combination of the seat's own specialty planets reaches it.
 */
function skipPlanetsFor(state: GameState, seat: Seat, techId: string, owned: string[]): string[] | null {
  const player = { faction: state.players[seat].faction, techs: owned }
  if (canResearch(player, techId)) return []
  const need = { ...techDef(techId).prereq }
  const chosen: { planetId: string; colour: TechColor }[] = []
  for (const c of techSkipCandidates(state, seat)) {
    if ((need[c.colour] ?? 0) > chosen.filter(x => x.colour === c.colour).length) chosen.push(c)
  }
  const skips = chosen.map(c => c.colour)
  return canResearch(player, techId, false, skips) ? chosen.map(c => c.planetId) : null
}

/** `cheapestPayment`, but treating `avoid` as already exhausted first — so a resource payment never lands
 * on a planet the same move is also spending as a technology-specialty skip. */
function paymentAvoiding(state: GameState, seat: Seat, cost: number, avoid: string[]): { planets: string[]; tradeGoods: number } | null {
  if (!avoid.length) return cheapestPayment(state, seat, cost)
  const avoidSet = new Set(avoid)
  const systems: GameState['systems'] = {}
  for (const [id, sys] of Object.entries(state.systems)) {
    systems[id] = sys.planets.some(p => avoidSet.has(p.id))
      ? { ...sys, planets: sys.planets.map(p => (avoidSet.has(p.id) ? { ...p, exhausted: true } : p)) }
      : sys
  }
  return cheapestPayment({ ...state, systems }, seat, cost)
}

function tacticalMoves(state: GameState): Move[] {
  const tac = state.tactical
  if (!tac) return []
  const seat = state.active
  switch (tac.step) {
    case 'movement': {
      const out: Move[] = []
      if (movableShips(state, seat).length) out.push({ type: 'moveShips', moves: [] })
      if (hasTech(state, seat, 'spatial_conduit_cylinder') && !state.players[seat].spatialConduitExhausted) {
        out.push({ type: 'exhaustSpatialConduit' })
      }
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
      const player = state.players[seat]
      const skipColours = techSkipCandidates(state, seat).map(c => c.colour)
      const techs = researchable(player)
      // techs that need a specialty planet skip to reach at all, each with one legal set of planets for it
      const skipTechs = researchableWithSkips(player, skipColours)
        .flatMap((techId): { id: string; skip: string[] }[] => {
          const planets = skipPlanetsFor(state, seat, techId, player.techs)
          return planets ? [{ id: techId, skip: planets }] : []
        })
      const out: Move[] = [
        ...techs.map((techId): Move => ({ type: 'strategic', card, params: { techId } })),
        ...skipTechs.map((t): Move => ({ type: 'strategic', card, params: { techId: t.id, techSkipPlanets: t.skip } })),
      ]
      const affordSecond = cheapestPayment(state, seat, 6)
      if (affordSecond) {
        const firstChoices = [...techs.map(id => ({ id, skip: [] as string[] })), ...skipTechs]
        for (const first of firstChoices) {
          const ownedAfterFirst = [...player.techs, first.id]
          const secondTechs = researchable({ ...player, techs: ownedAfterFirst }).filter(id => id !== first.id)
          // Payment for the second tech must avoid whatever the first tech's own skip already spends —
          // otherwise the same planet could be offered as both payment and skip in one move.
          const paymentAfterFirstSkip = first.skip.length ? paymentAvoiding(state, seat, 6, first.skip) : affordSecond
          if (paymentAfterFirstSkip) {
            for (const second of secondTechs) {
              out.push({
                type: 'strategic',
                card,
                params: {
                  techId: first.id,
                  secondTechId: second,
                  techSkipPlanets: first.skip.length ? first.skip : undefined,
                  planets: paymentAfterFirstSkip.planets,
                  tradeGoods: paymentAfterFirstSkip.tradeGoods,
                },
              })
            }
          }
          // The second tech's own skip is only offered when the first needed none, so every specialty planet
          // is still free for it — otherwise the same planet could get offered for both, which would never
          // actually be playable (a planet cannot be exhausted twice).
          if (first.skip.length) continue
          const secondSkipTechs = researchableWithSkips({ ...player, techs: ownedAfterFirst }, skipColours).filter(id => id !== first.id)
          for (const second of secondSkipTechs) {
            const secondSkip = skipPlanetsFor(state, seat, second, ownedAfterFirst)
            if (!secondSkip) continue
            // Payment for the second tech must equally avoid the second tech's own skip planets.
            const paymentForSecondSkip = paymentAvoiding(state, seat, 6, secondSkip)
            if (!paymentForSecondSkip) continue
            out.push({
              type: 'strategic',
              card,
              params: {
                techId: first.id,
                secondTechId: second,
                secondTechSkipPlanets: secondSkip,
                planets: paymentForSecondSkip.planets,
                tradeGoods: paymentForSecondSkip.tradeGoods,
              },
            })
          }
        }
      }
      return out.length ? out : [{ type: 'strategic', card, params: {} }]
    }
    case 'imperial': {
      const open = state.publicObjectives.filter(id => !state.players[seat].scoredObjectives.includes(id) && fulfils(state, seat, id))
      return [{ type: 'strategic', card, params: {} }, ...open.map((objectiveId): Move => ({ type: 'strategic', card, params: { objectiveId } }))]
    }
    case 'politics': {
      // R6: the speaker token must go to somebody other than the current speaker; the card holder may take it
      // themselves. The two agenda cards go back as they were unless the interface names an order.
      const seats = state.players.map((_, i) => i).filter(i => i !== state.speaker)
      return seats.map((speakerTo): Move => ({ type: 'strategic', card, params: { speakerTo } }))
    }
    case 'construction': {
      // R6: the primary places a PDS or a space dock, and then a PDS. Only the placements the seat can afford
      // are offered; with nothing to place the card is still playable and simply places nothing.
      const pds = constructionPlanets(state, seat, 'pds')
      const docks = constructionPlanets(state, seat, 'spacedock')
      const out: Move[] = []
      for (const planetId of docks) {
        const structures: { planetId: string; type: 'pds' | 'spacedock' }[] = [{ planetId, type: 'spacedock' }]
        if (pds.length) structures.push({ planetId: pds[0], type: 'pds' })
        out.push({ type: 'strategic', card, params: { structures } })
      }
      for (const planetId of pds) out.push({ type: 'strategic', card, params: { structures: [{ planetId, type: 'pds' }] } })
      return out.length ? out : [{ type: 'strategic', card, params: {} }]
    }
    case 'trade':
      // R6: sharing is optional and can target any other player, so each one is offered alongside the bare primary
      return [{ type: 'strategic', card, params: {} }, ...otherSeatsInOrder(state, seat).map(s2 => ({ type: 'strategic' as const, card, params: { shareWith: [s2] } }))]
    default:
      return [{ type: 'strategic', card, params: {} }]
  }
}

/** The affordable secondary answers; every one of them is accepted by its handler. */
function secondaryMoves(state: GameState, seat: Seat, card: StrategyCardId, isFree = false): Move[] {
  const player = state.players[seat]
  if (player.tokens.strategy < secondaryTokenCost(card, isFree)) return []
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
    case 'politics':
      // R6: two action cards. With deck and discard pile both empty there is nothing to draw, so the token
      // burn is not offered, consistent with the Trade and Diplomacy filters.
      return state.actionCardDeck.length + state.actionCardDiscard.length > 0
        ? [{ type: 'secondary', card, accept: true, params }]
        : []
    case 'construction': {
      // R6: the command token goes into a system of your choice and may bring a structure with it. Only the
      // systems where a structure can actually go are offered; the handler accepts any system the UI names.
      const out: Move[] = []
      for (const systemId of Object.keys(state.systems)) {
        for (const type of ['spacedock', 'pds'] as const) {
          for (const planetId of constructionPlanets(state, seat, type, systemId)) {
            out.push({ type: 'secondary', card, accept: true, params: { systemId, structures: [{ planetId, type }] } })
          }
        }
      }
      return out
    }
    case 'trade':
      // R6, consistent with the Diplomacy filter above: already replenished is a no-op token burn, not useful
      return player.commodities < FACTIONS[player.faction].commodityValue ? [{ type: 'secondary', card, accept: true, params }] : []
    case 'warfare': {
      // R6: the secondary is the space dock's full PRODUCTION ability, so the window opens as soon as any one
      // unit is affordable; the responder picks the units and the payment, the handler checks them.
      const home = state.systems[homeSystemOf(state, seat)]
      const dock = hasOwnDock(home, seat)
      if (!dock || productionLimit(state, seat, home.id) < 1) return []
      const stats = { faction: player.faction, techs: player.techs }
      for (const type of PRODUCIBLE) {
        if (player.reinforcements[type] < 1) continue
        if (type === 'fighter' && maxFightersAllowed(state, seat, home.id) < 1) continue
        const cost = productionCost({ [type]: 1 }, stats, player.techs.includes('sarween_tools'))
        const planets = cheapestPlanets(state, seat, cost)
        if (planets) return [{ type: 'secondary', card, accept: true, params: { units: { [type]: 1 }, planets, tradeGoods: 0 } }]
      }
      return []
    }
    case 'technology': {
      const payment = cheapestPayment(state, seat, 4)
      if (!payment) return []
      const player = state.players[seat]
      const skipColours = techSkipCandidates(state, seat).map(c => c.colour)
      const techs = researchable(player).map(id => ({ id, skip: [] as string[] }))
      const skipTechs = researchableWithSkips(player, skipColours)
        .flatMap((techId): { id: string; skip: string[] }[] => {
          const planets = skipPlanetsFor(state, seat, techId, player.techs)
          return planets ? [{ id: techId, skip: planets }] : []
        })
      const out: Move[] = techs.map((t): Move => ({
        type: 'secondary',
        card,
        accept: true,
        params: { techId: t.id, planets: payment.planets, tradeGoods: payment.tradeGoods },
      }))
      // Payment must avoid whatever this specific tech's own skip already spends.
      for (const t of skipTechs) {
        const paymentForSkip = paymentAvoiding(state, seat, 4, t.skip)
        if (!paymentForSkip) continue
        out.push({
          type: 'secondary',
          card,
          accept: true,
          params: { techId: t.id, techSkipPlanets: t.skip, planets: paymentForSkip.planets, tradeGoods: paymentForSkip.tradeGoods },
        })
      }
      return out
    }
    case 'imperial':
      return [{ type: 'secondary', card, accept: true, params }]
  }
}

export function legalMoves(state: GameState): Move[] {
  if (state.winner !== null || state.phase === 'ended') return []
  // R4.1 step 4: queued hits block everything else, and the offer is a complete pick so it can be played as it is
  if (pendingFor(state)) return [{ type: 'assignHits', ...defaultAssignment(state) }]
  // R9: an open reaction window blocks everything else too; the seat it is waiting on may play a matching
  // card or decline, and nothing else, until the window closes
  const reaction = pendingReaction(state)
  if (reaction) {
    const seat = reaction.queue[0]
    return seat === undefined ? [] : [{ type: 'declineReaction' }, ...reactionMoves(state, seat, reaction)]
  }
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
  if (state.phase === 'agenda') return agendaMoves(state)
  if (state.phase !== 'action') return []
  const seat = state.active
  // R3.2: the answer to a strategy card is not a turn, so it comes before the passed check
  const pending = state.pendingSecondary
  if (pending !== null) {
    // the seat the window is waiting on (the head of the queue) answers; the holder and anyone else in the
    // queue who is not the head must not act, and the enumerator stays on the decline so a live phase never
    // hands back an empty list
    if (pending.queue[0] !== seat) return [{ type: 'secondary', card: pending.card, accept: false }]
    const isFree = pending.card === 'trade' && ((pending.freeSeats?.includes(seat) ?? false) || state.players[seat].faction === 'muaat')
    return [{ type: 'secondary', card: pending.card, accept: false }, ...secondaryMoves(state, seat, pending.card, isFree)]
  }
  if (state.players[seat].passed) return []
  if (state.tactical) return tacticalMoves(state)
  // R3.2/R8: the action is spent but the turn is not over. Only the free moves and the handover are left:
  // no second action, and no `pass` either, because you pass instead of taking an action, never after one.
  if (state.turnDone) {
    const spent: Move[] = [{ type: 'endTurn' }]
    return spent
  }
  const out: Move[] = activatableSystems(state, seat).map(id => ({ type: 'startTactical', systemId: id }))
  for (const card of unusedCards(state, seat)) out.push(...primaryMoves(state, seat, card))
  // R9: an "ACTION:" card is a whole action, so it belongs beside the tactical and strategic ones
  out.push(...actionCardMoves(state, seat))
  if (canInheritance(state, seat)) {
    for (const techId of inheritanceTechs(state, seat)) out.push({ type: 'research', techId, via: 'inheritance' })
  }
  if (canProductionBiomes(state, seat)) {
    for (const target of productionBiomesTargets(state, seat)) out.push({ type: 'productionBiomes', target })
  }
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
    // R9: which card it is identifies the move; its target is checked by `playActionCard`, the only place
    // that knows what the printed ability needs
    case 'playActionCard':
      return candidate.type === 'playActionCard' && candidate.cardId === move.cardId
    case 'secondary':
      return candidate.type === 'secondary' && candidate.card === move.card && candidate.accept === move.accept
    case 'research':
      return candidate.type === 'research' && candidate.techId === move.techId
    case 'productionBiomes':
      return candidate.type === 'productionBiomes' && candidate.target === move.target
    // R10: which planets pay for the vote is the voter's own choice, checked by castVote itself, the only
    // place that knows what is legal — same idiom as research/productionBiomes above
    case 'castVote':
      return candidate.type === 'castVote' && candidate.outcome === move.outcome
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
