import { effectOf, findActionCard } from '../data/actionCards'
import { isShip } from '../data/units'
import { neighbours } from './adjacency'
import { checkFleet, shipsOf, trimCargo } from './board'
import { trimFleetPool } from './combat'
import { afterSpaceStep } from './invasion'
import { shipsThatCanReach } from './movement'
import type { ActionCardParams, ActiveEffect, GameState, Move, Result, Seat, System, Unit } from './types'
import type { ReactionKind, ReactionWindow } from './types'

/**
 * R9: the reaction-window machinery, and the cards that are played into one.
 *
 * A reaction window is the two shapes the engine had already proved, put together. From `pendingSecondary` it
 * takes the queue of seats polled in turn order, one answer each, closing back onto whoever was on turn; from
 * `PendingHits` it takes "while this is open it is the only thing anybody may do" (`legalMoves` offers exactly
 * `playActionCard` for a matching card and `declineReaction`). Unlike a secondary, windows are a **stack**:
 * Sabotage reacts to a card being played, so a window can open on top of a window and the innermost — the
 * last entry of `state.pendingReactions` — is the one being answered.
 *
 * Two properties keep the common path free. A window whose queue filters down to nobody never opens at all,
 * so a table holding no matching card never sees one; and a seat is in the queue only when it holds a card
 * that has a legal target here, so an offered answer is always one the handler takes.
 */

/**
 * The reaction cards the engine resolves in full, and therefore the only ones a game's deck holds. This list
 * joins the "ACTION:" cards in `PLAYABLE_ACTION_CARDS`; the same rule governs both, that a card is dealt only
 * when its whole printed ability resolves.
 */
export const PLAYABLE_REACTION_CARDS: readonly string[] = [
  'emergency_repairs',
  'fighter_prototype',
  'flank_speed_1', 'flank_speed_2', 'flank_speed_3', 'flank_speed_4',
  'in_the_silence_of_space_1', 'in_the_silence_of_space_2',
  'lost_star_chart',
  'morale_boost_1', 'morale_boost_2', 'morale_boost_3', 'morale_boost_4',
  'skilled_retreat_1', 'skilled_retreat_2', 'skilled_retreat_3', 'skilled_retreat_4',
  'upgrade',
]

const PLAYABLE = new Set(PLAYABLE_REACTION_CARDS)

/** The windows each printed effect may be played into, taken from the card's own timing text. */
const WINDOWS_OF: Readonly<Record<string, readonly ReactionKind[]>> = {
  // "After you activate a system", and Upgrade's "...that contains 1 or more of your ships"
  flank_speed: ['systemActivated'],
  in_the_silence_of_space: ['systemActivated'],
  lost_star_chart: ['systemActivated'],
  upgrade: ['systemActivated'],
  // "At the start of a combat round" — a combat round is a space or a ground combat round
  morale_boost: ['spaceCombatRound', 'groundCombatRound'],
  emergency_repairs: ['spaceCombatRound', 'groundCombatRound'],
  // "at the start of the first round of a space combat" / "at the start of a [space] combat round"
  fighter_prototype: ['spaceCombatRound'],
  skilled_retreat: ['spaceCombatRound'],
}

/** The window being answered: the innermost of the stack, or null when no window is open. */
export function pendingReaction(state: GameState): ReactionWindow | null {
  return state.pendingReactions.length ? state.pendingReactions[state.pendingReactions.length - 1] : null
}

/** The seat the open window is waiting on, or null when no window is open. */
export function reactingSeat(state: GameState): Seat | null {
  const window = pendingReaction(state)
  return window?.queue[0] ?? null
}

// ---------------------------------------------------------------------------------------------------------
// Which answers a seat has, window by window. Every function here is also the check the handler makes, so an
// enumerated answer is never refused.
// ---------------------------------------------------------------------------------------------------------

/** Whether adding `effect` would let at least one more ship of the seat reach the activated system. */
function addsReach(state: GameState, seat: Seat, systemId: string, effect: ActiveEffect): boolean {
  const before = shipsThatCanReach(state, seat, systemId).length
  const probe: GameState = { ...state, effects: [...state.effects, effect] }
  return shipsThatCanReach(probe, seat, systemId).length > before
}

/** R9 Upgrade: a cruiser of yours in the activated system, and a dreadnought left to replace it with. */
function upgradeableCruiser(state: GameState, seat: Seat, systemId: string): Unit | null {
  if (state.players[seat].reinforcements.dreadnought < 1) return null
  return state.systems[systemId]?.space.find(u => u.owner === seat && u.type === 'cruiser') ?? null
}

/** R9 Skilled Retreat: an adjacent system holding no other player's ships. */
export function skilledRetreatTargets(state: GameState, seat: Seat, systemId: string): string[] {
  if (!state.systems[systemId]) return []
  return neighbours(state.systems, systemId)
    .filter(id => !state.systems[id].space.some(u => u.owner !== seat && isShip(u.type)))
}

/** Whether the space combat the window belongs to is still being fought at the round it named. */
function spaceWindowLive(state: GameState, window: ReactionWindow): boolean {
  const tac = state.tactical
  const combat = tac?.combat
  if (!tac || !combat || tac.step !== 'spaceCombat') return false
  if (tac.systemId !== window.systemId || combat.round !== window.round) return false
  if (combat.pending.length) return false
  const sys = state.systems[tac.systemId]
  return shipsOf(sys, combat.attacker).length > 0 && shipsOf(sys, combat.defender).length > 0
}

/** Whether the ground combat the window belongs to is still being fought at the round it named. */
function groundWindowLive(state: GameState, window: ReactionWindow): boolean {
  const tac = state.tactical
  const inv = tac?.invasion
  if (!tac || !inv || tac.step !== 'invasion') return false
  if (tac.systemId !== window.systemId || inv.round !== window.round || inv.planetId === null) return false
  const planet = state.systems[tac.systemId].planets.find(p => p.id === inv.planetId)
  if (!planet) return false
  return planet.ground.some(u => u.owner === window.source) && planet.ground.some(u => u.owner !== window.source)
}

/** Whether the activation the window belongs to is still the running tactical action. */
function activationWindowLive(state: GameState, window: ReactionWindow): boolean {
  return state.tactical?.systemId === window.systemId && state.tactical.step === 'movement'
}

/** Whether the window's own moment is still the moment the game is at. */
function windowLive(state: GameState, window: ReactionWindow): boolean {
  switch (window.kind) {
    case 'systemActivated': return activationWindowLive(state, window)
    case 'spaceCombatRound': return spaceWindowLive(state, window)
    case 'groundCombatRound': return groundWindowLive(state, window)
  }
}

/** The ground forces a seat has in the ground combat the window names. */
function groundForces(state: GameState, seat: Seat, window: ReactionWindow): Unit[] {
  const inv = state.tactical?.invasion
  const planet = inv?.planetId === undefined || inv.planetId === null
    ? undefined
    : state.systems[window.systemId].planets.find(p => p.id === inv.planetId)
  return planet?.ground.filter(u => u.owner === seat) ?? []
}

/** The seat's units that would roll in the combat the window names, so a "+1 to your rolls" card does something. */
function rollingUnits(state: GameState, seat: Seat, window: ReactionWindow): Unit[] {
  if (window.kind === 'spaceCombatRound') return shipsOf(state.systems[window.systemId], seat)
  return groundForces(state, seat, window)
}

function damagedUnits(sys: System | undefined, seat: Seat): Unit[] {
  return sys?.space.filter(u => u.owner === seat && u.damaged) ?? []
}

/**
 * Every answer `seat` may give to `window`, one move per legal target. An empty list means the seat is not
 * asked at all: that is what keeps a window from opening on a table that cannot answer it.
 */
export function reactionMoves(state: GameState, seat: Seat, window: ReactionWindow): Move[] {
  if (!windowLive(state, window)) return []
  const out: Move[] = []
  const player = state.players[seat]
  for (const cardId of player.actionCards) {
    if (!PLAYABLE.has(cardId)) continue
    const effect = effectOf(cardId)
    if (!(WINDOWS_OF[effect] ?? []).includes(window.kind)) continue
    switch (effect) {
      case 'flank_speed':
        if (addsReach(state, seat, window.systemId, { effect, seat, scope: 'tactical' })) {
          out.push({ type: 'playActionCard', cardId, params: {} })
        }
        break
      case 'lost_star_chart':
        if (addsReach(state, seat, window.systemId, { effect, seat, scope: 'tactical' })) {
          out.push({ type: 'playActionCard', cardId, params: {} })
        }
        break
      case 'in_the_silence_of_space':
        for (const systemId of Object.keys(state.systems)) {
          if (systemId === window.systemId) continue
          if (!state.systems[systemId].space.some(u => u.owner === seat && isShip(u.type))) continue
          if (addsReach(state, seat, window.systemId, { effect, seat, scope: 'tactical', systemId })) {
            out.push({ type: 'playActionCard', cardId, params: { systemId } })
          }
        }
        break
      case 'upgrade':
        if (upgradeableCruiser(state, seat, window.systemId)) out.push({ type: 'playActionCard', cardId, params: {} })
        break
      case 'morale_boost':
        if (rollingUnits(state, seat, window).length) out.push({ type: 'playActionCard', cardId, params: {} })
        break
      case 'fighter_prototype':
        // "at the start of the first round of a space combat": this engine fights round 0 as the pre-combat
        // steps, so the first round of dice is round 1
        if (window.round === 1 && shipsOf(state.systems[window.systemId], seat).some(u => u.type === 'fighter')) {
          out.push({ type: 'playActionCard', cardId, params: {} })
        }
        break
      case 'emergency_repairs':
        if (damagedUnits(state.systems[window.systemId], seat).length) out.push({ type: 'playActionCard', cardId, params: {} })
        break
      case 'skilled_retreat':
        if (shipsOf(state.systems[window.systemId], seat).length) {
          for (const systemId of skilledRetreatTargets(state, seat, window.systemId)) {
            out.push({ type: 'playActionCard', cardId, params: { systemId } })
          }
        }
        break
      default:
        break
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------
// Resolving one card into one window. Every branch is the whole printed ability.
// ---------------------------------------------------------------------------------------------------------

function withEffect(state: GameState, effect: ActiveEffect): GameState {
  return { ...state, effects: [...state.effects, effect] }
}

/** R9 Upgrade: "Replace 1 of your cruisers in that system with 1 dreadnought from your reinforcements." */
function upgrade(state: GameState, seat: Seat, systemId: string): Result<GameState> {
  const cruiser = upgradeableCruiser(state, seat, systemId)
  if (!cruiser) return { ok: false, error: 'R9: no cruiser of yours in that system, or no dreadnought in your reinforcements' }
  const player = state.players[seat]
  const dreadnought: Unit = { id: state.nextUnitId, type: 'dreadnought', owner: seat, damaged: false }
  const players = [...state.players] as GameState['players']
  players[seat] = {
    ...player,
    reinforcements: {
      ...player.reinforcements,
      cruiser: player.reinforcements.cruiser + 1,
      dreadnought: player.reinforcements.dreadnought - 1,
    },
  }
  const sys = state.systems[systemId]
  const next: GameState = {
    ...state,
    players,
    nextUnitId: state.nextUnitId + 1,
    systems: { ...state.systems, [systemId]: { ...sys, space: sys.space.map(u => u.id === cruiser.id ? dreadnought : u) } },
  }
  const fleet = checkFleet(next, seat, systemId)
  if (!fleet.ok) return { ok: false, error: fleet.error }
  return { ok: true, value: next }
}

/** R9 Emergency Repairs: "Repair all of your units that have SUSTAIN DAMAGE in the active system." */
function emergencyRepairs(state: GameState, seat: Seat, systemId: string): Result<GameState> {
  const sys = state.systems[systemId]
  const repaired = damagedUnits(sys, seat)
  if (!repaired.length) return { ok: false, error: 'R9: nothing of yours is damaged in the active system' }
  return {
    ok: true,
    value: {
      ...state,
      systems: { ...state.systems, [systemId]: { ...sys, space: sys.space.map(u => u.owner === seat && u.damaged ? { ...u, damaged: false } : u) } },
      log: [...state.log, { t: 'info', text: `seat ${seat} repairs ${String(repaired.length)} damaged unit(s) in ${systemId}` }],
    },
  }
}

/**
 * R9 Skilled Retreat: "Move all of your ships from the active system into an adjacent system that does not
 * contain another player's ships. The space combat ends in a draw. Then, place a command token from your
 * reinforcements in that system."
 *
 * Every unit of the seat leaves, cargo included, so nothing of theirs is left behind to trim in the system
 * they came from. The combat ends without a winner: nobody earns the space-combat mandate or the objective
 * counter, which is what "in a draw" means. The active player's tactical action then continues exactly as it
 * would after any other end of a space combat — into the invasion when they hold the field, and to `done`
 * when it was their own ships that left.
 */
function skilledRetreat(state: GameState, seat: Seat, window: ReactionWindow, to: string | undefined): Result<GameState> {
  const systemId = window.systemId
  const sys = state.systems[systemId]
  if (to === undefined || !state.systems[to]) return { ok: false, error: 'R9: name the system to retreat into' }
  if (!skilledRetreatTargets(state, seat, systemId).includes(to)) {
    return { ok: false, error: `R9: ${to} is not an adjacent system free of other players' ships` }
  }
  const leaving = sys.space.filter(u => u.owner === seat)
  if (!leaving.some(u => isShip(u.type))) return { ok: false, error: 'R9: you have no ships in the active system' }
  const dest = state.systems[to]
  let next: GameState = {
    ...state,
    systems: {
      ...state.systems,
      [systemId]: { ...sys, space: sys.space.filter(u => u.owner !== seat) },
      [to]: {
        ...dest,
        space: [...dest.space, ...leaving],
        activatedBy: dest.activatedBy.includes(seat) ? dest.activatedBy : [...dest.activatedBy, seat],
      },
    },
    log: [...state.log, { t: 'info', text: `seat ${seat} makes a skilled retreat from ${systemId} to ${to}; the space combat ends in a draw` }],
  }
  next = trimCargo(trimFleetPool(next, to, seat), to, seat)
  const tac = next.tactical
  const combat = tac?.combat
  if (!tac || !combat) return { ok: true, value: next }
  // the other side's cargo is trimmed against the capacity it has left, exactly as the end of a combat does
  next = trimCargo(next, systemId, seat === combat.attacker ? combat.defender : combat.attacker)
  if (seat === combat.attacker) return { ok: true, value: { ...next, tactical: { ...tac, step: 'done' } } }
  return { ok: true, value: { ...next, tactical: { ...afterSpaceStep(next, systemId, combat.attacker), combat } } }
}

/** The whole printed ability of one reaction card, against the context its window carries. */
function resolveReaction(state: GameState, seat: Seat, window: ReactionWindow, cardId: string, params: ActionCardParams): Result<GameState> {
  const effect = effectOf(cardId)
  switch (effect) {
    case 'flank_speed':
      // "Apply +1 to the move value of each of your ships during this tactical action."
      return { ok: true, value: withEffect(state, { effect, seat, scope: 'tactical' }) }
    case 'lost_star_chart':
      // "During this tactical action, systems that contain alpha and beta wormholes are adjacent to each other."
      return { ok: true, value: withEffect(state, { effect, seat, scope: 'tactical' }) }
    case 'in_the_silence_of_space': {
      // "Choose 1 system. During this tactical action, your ships in the chosen system can move through
      // systems that contain other players' ships."
      const systemId = params.systemId
      if (systemId === undefined || !state.systems[systemId]) return { ok: false, error: 'R9: name the system your ships move out of' }
      return { ok: true, value: withEffect(state, { effect, seat, scope: 'tactical', systemId }) }
    }
    case 'upgrade':
      return upgrade(state, seat, window.systemId)
    case 'morale_boost': {
      // "Apply +1 to the result of each of your unit's combat rolls during this combat round."
      const scope = window.kind === 'groundCombatRound' ? 'groundRound' : 'spaceRound'
      return { ok: true, value: withEffect(state, { effect, seat, scope, round: window.round }) }
    }
    case 'fighter_prototype':
      // "Apply +2 to the result of each of your fighters' combat rolls during this combat round."
      return { ok: true, value: withEffect(state, { effect, seat, scope: 'spaceRound', round: window.round }) }
    case 'emergency_repairs':
      return emergencyRepairs(state, seat, window.systemId)
    case 'skilled_retreat':
      return skilledRetreat(state, seat, window, params.systemId)
    default:
      return { ok: false, error: `R9: ${cardId} is not implemented yet` }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The window state machine.
// ---------------------------------------------------------------------------------------------------------

/**
 * Opens `window` if anybody in its queue can actually answer it, and hands the turn to the first of them. A
 * window nobody can answer never opens, so the common path costs a filter and nothing else.
 */
export function openReaction(state: GameState, window: ReactionWindow): GameState {
  const queue = window.queue.filter(seat => reactionMoves(state, seat, window).length > 0)
  if (queue.length === 0) return state
  return { ...state, pendingReactions: [...state.pendingReactions, { ...window, queue }], active: queue[0] }
}

/**
 * The head of the queue has answered. The rest of the queue is filtered again, because an answer can make
 * the window meaningless (a Skilled Retreat ends the combat the window was about); when nothing is left the
 * window closes back onto the seat that was on turn, or onto the window underneath it in the stack.
 */
function advance(state: GameState): GameState {
  const stack = state.pendingReactions
  const window = stack[stack.length - 1]
  if (!window) return state
  const queue = window.queue.slice(1).filter(seat => reactionMoves(state, seat, window).length > 0)
  if (queue.length > 0) {
    return { ...state, pendingReactions: [...stack.slice(0, -1), { ...window, queue }], active: queue[0] }
  }
  const rest = stack.slice(0, -1)
  const outer = rest[rest.length - 1]
  return { ...state, pendingReactions: rest, active: outer ? outer.queue[0] : window.resume }
}

/** R9: the answer that plays nothing. The window moves on to the next seat, or closes. */
export function declineReaction(state: GameState): Result<GameState> {
  if (!pendingReaction(state)) return { ok: false, error: 'R9: no reaction window is open' }
  return { ok: true, value: advance(state) }
}

/**
 * R9: an action card played into the open reaction window. The card leaves the hand for the discard pile and
 * the window moves on; unlike an "ACTION:" card this is not the player's action and costs them no turn.
 */
export function playReactionCard(state: GameState, cardId: string, params: ActionCardParams | undefined): Result<GameState> {
  const window = pendingReaction(state)
  if (!window) return { ok: false, error: 'R9: no reaction window is open' }
  const seat = window.queue[0]
  if (seat === undefined) return { ok: false, error: 'R9: the reaction window has nobody to answer it' }
  if (!state.players[seat].actionCards.includes(cardId)) return { ok: false, error: `R9: seat ${String(seat)} does not hold ${cardId}` }
  const def = findActionCard(cardId)
  if (!def) return { ok: false, error: `unknown action card ${cardId}` }
  if (!PLAYABLE.has(cardId)) return { ok: false, error: `R9: ${cardId} is not implemented yet` }
  if (!(WINDOWS_OF[effectOf(cardId)] ?? []).includes(window.kind)) {
    return { ok: false, error: `R9: ${def.name} is not played into this window` }
  }
  const played = resolveReaction(state, seat, window, cardId, params ?? {})
  if (!played.ok) return played
  const players = [...played.value.players] as GameState['players']
  const hand = [...players[seat].actionCards]
  hand.splice(hand.indexOf(cardId), 1)
  players[seat] = { ...players[seat], actionCards: hand }
  return {
    ok: true,
    value: advance({
      ...played.value,
      players,
      actionCardDiscard: [...played.value.actionCardDiscard, cardId],
      log: [...played.value.log, { t: 'info', text: `seat ${String(seat)} plays ${def.name}` }],
    }),
  }
}

// ---------------------------------------------------------------------------------------------------------
// Where the windows open.
// ---------------------------------------------------------------------------------------------------------

/**
 * R9: "After you activate a system". Only the active player reacts to their own activation, so the queue is
 * one seat long; the cards another player may play off somebody else's activation belong to windows that do
 * not exist yet and are not in the deck.
 */
export function openActivationWindow(state: GameState, seat: Seat, systemId: string): GameState {
  return openReaction(state, { kind: 'systemActivated', source: seat, queue: [seat], resume: seat, systemId })
}

/** The two sides of the running space combat, attacker first; the guardian fleet holds no cards. */
function combatSeats(attacker: Seat, defender: Seat | 'guardian'): Seat[] {
  return defender === 'guardian' ? [attacker] : [attacker, defender]
}

/**
 * R9: "At the start of a combat round", for both combat kinds. Called after every applied move rather than
 * from inside the combat code, so the window opens wherever the engine came to rest at the start of a round —
 * out of `endMovement`, out of a finished round, or out of the last queued hit assignment. `reacted` records
 * the round already offered, so a round is asked about exactly once.
 */
export function openCombatWindows(state: GameState): GameState {
  if (state.pendingReactions.length || state.winner !== null) return state
  const tac = state.tactical
  if (!tac) return state
  if (tac.step === 'spaceCombat' && tac.combat) {
    const combat = tac.combat
    if (combat.round < 1 || (combat.reacted ?? -1) >= combat.round) return state
    const window: ReactionWindow = {
      kind: 'spaceCombatRound',
      source: combat.attacker,
      queue: combatSeats(combat.attacker, combat.defender),
      resume: state.active,
      systemId: tac.systemId,
      round: combat.round,
    }
    const marked: GameState = { ...state, tactical: { ...tac, combat: { ...combat, reacted: combat.round } } }
    if (!spaceWindowLive(marked, window)) return marked
    return openReaction(marked, window)
  }
  if (tac.step === 'invasion' && tac.invasion) {
    const inv = tac.invasion
    if (inv.planetId === null || (inv.reacted ?? -1) >= inv.round) return state
    const planet = state.systems[tac.systemId].planets.find(p => p.id === inv.planetId)
    const defender = planet?.ground.find(u => u.owner !== state.active)?.owner
    if (!planet || defender === undefined || !planet.ground.some(u => u.owner === state.active)) return state
    const window: ReactionWindow = {
      kind: 'groundCombatRound',
      source: state.active,
      queue: combatSeats(state.active, defender),
      resume: state.active,
      systemId: tac.systemId,
      round: inv.round,
    }
    const marked: GameState = { ...state, tactical: { ...tac, invasion: { ...inv, reacted: inv.round } } }
    return openReaction(marked, window)
  }
  return state
}
