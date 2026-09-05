import type { ActiveEffect, GameState, Owner, Seat } from './types'

/**
 * R9: the action card effects that outlive the instant they were played.
 *
 * Nothing sweeps an effect away on a timer. A `tactical` effect is dropped when the tactical action that
 * could have created it ends (`clearTacticalEffects`); a round effect simply stops matching once the combat
 * has moved past the round it names, which is why it carries that round. This module is deliberately free of
 * every other engine import so the rules modules that read an effect (movement, combat, invasion) can do so
 * without pulling in the reaction machinery that writes them.
 */

/** Is `effect` running for `owner` right now? Guardians never hold cards, so they never have effects. */
function has(state: GameState, owner: Owner, effect: string, match: (e: ActiveEffect) => boolean): boolean {
  if (owner === 'guardian') return false
  return state.effects.some(e => e.seat === owner && e.effect === effect && match(e))
}

/** An effect that lasts the whole tactical action. */
export function tacticalEffect(state: GameState, owner: Owner, effect: string): boolean {
  return has(state, owner, effect, e => e.scope === 'tactical')
}

/** An effect played into one space combat round, live only while that round is the one being fought. */
export function spaceRoundEffect(state: GameState, owner: Owner, effect: string): boolean {
  const round = state.tactical?.combat?.round
  if (round === undefined) return false
  return has(state, owner, effect, e => e.scope === 'spaceRound' && e.round === round)
}

/** An effect played into one ground combat round, live only while that round is the one being fought. */
export function groundRoundEffect(state: GameState, owner: Owner, effect: string): boolean {
  const round = state.tactical?.invasion?.round
  if (round === undefined) return false
  return has(state, owner, effect, e => e.scope === 'groundRound' && e.round === round)
}

/** R9 Flank Speed: +1 to the move value of each of your ships for the rest of this tactical action. */
export function moveBonus(state: GameState, seat: Seat): number {
  return tacticalEffect(state, seat, 'flank_speed') ? 1 : 0
}

/** R9 Lost Star Chart: alpha and beta wormholes count as one class for this tactical action. */
export function wormholesLinked(state: GameState, seat: Seat): boolean {
  return tacticalEffect(state, seat, 'lost_star_chart')
}

/**
 * R9 In The Silence Of Space: the seat's ships in the named system may move through systems that hold other
 * players' ships. The effect is keyed on where the ships start, which is what the card names.
 */
export function ignoresFleets(state: GameState, seat: Seat, from: string): boolean {
  return state.effects.some(e => e.seat === seat && e.effect === 'in_the_silence_of_space' && e.scope === 'tactical' && e.systemId === from)
}

/**
 * R9 Morale Boost: +1 to the result of each of the seat's combat rolls this combat round, which this engine
 * expresses as a bonus subtracted from the value a die has to beat. Both combat kinds have their own round.
 */
export function moraleBoost(state: GameState, owner: Owner, kind: 'space' | 'ground'): number {
  const live = kind === 'space' ? spaceRoundEffect(state, owner, 'morale_boost') : groundRoundEffect(state, owner, 'morale_boost')
  return live ? 1 : 0
}

/** R9 Fighter Prototype: +2 to each of the seat's fighters' combat rolls this space combat round. */
export function fighterBonus(state: GameState, owner: Owner): number {
  return spaceRoundEffect(state, owner, 'fighter_prototype') ? 2 : 0
}

/** Every effect goes when the tactical action does: none of them can outlive it. */
export function clearTacticalEffects(state: GameState): GameState {
  return state.effects.length === 0 ? state : { ...state, effects: [] }
}
