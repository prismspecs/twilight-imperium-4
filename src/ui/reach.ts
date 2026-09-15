import { shipsThatCanReach } from '../engine'
import type { ActiveEffect, GameState, Seat } from '../engine/types'

/**
 * R9: whether a ship of `seat` can reach `systemId` right now — and, when it cannot, which cards or
 * unexhausted techs in the seat's possession WOULD put one in range. The activation step must not tell a
 * player holding Flank Speed that a system is out of reach: the card is played into the activation's own
 * reaction window (LRR "After you activate a system"), so the far system is exactly the one they should be
 * able to choose. The probes mirror `reactionMoves`' own `addsReach` test: re-run `shipsThatCanReach` with
 * the effect added and see whether the reachable set grows.
 */
export interface ReachPreview {
  /** a ship reaches the system as the board stands (movableShips agrees with this) */
  reachable: boolean
  /** card/tech names that would extend reach to this system, empty when reachable or beyond all help */
  via: string[]
}

const FLANK_CARD = /^flank_speed_\d+$/
const SILENCE_CARD = /^in_the_silence_of_space_\d+$/
const CHART_CARD = /^lost_star_chart$/

function reachesWith(state: GameState, seat: Seat, systemId: string, effect: ActiveEffect): boolean {
  if (shipsThatCanReach(state, seat, systemId).length > 0) return false   // already reachable; no card needed
  const probe: GameState = { ...state, effects: [...state.effects, effect] }
  return shipsThatCanReach(probe, seat, systemId).length > 0
}

export function reachPreview(state: GameState, seat: Seat, systemId: string): ReachPreview {
  if (shipsThatCanReach(state, seat, systemId).length > 0) return { reachable: true, via: [] }
  const player = state.players[seat]
  if (!player) return { reachable: false, via: [] }
  const via: string[] = []
  // Flank Speed: "+1 to the move value of each of your ships during this tactical action."
  if (player.actionCards.some(c => FLANK_CARD.test(c))
    && reachesWith(state, seat, systemId, { effect: 'flank_speed', seat, scope: 'tactical' })) {
    via.push('Flank Speed')
  }
  // Lost Star Chart: alpha and beta wormholes count as one class for this tactical action.
  if (player.actionCards.some(c => CHART_CARD.test(c))
    && reachesWith(state, seat, systemId, { effect: 'lost_star_chart', seat, scope: 'tactical' })) {
    via.push('Lost Star Chart')
  }
  // In The Silence Of Space: the seat's ships in the NAMED system ignore fleets on the path; the card is
  // played once per source system, so any one of the seat's fleets may be the one that gets through.
  if (player.actionCards.some(c => SILENCE_CARD.test(c))) {
    for (const sys of Object.values(state.systems)) {
      if (sys.id === systemId || sys.activatedBy.includes(seat)) continue
      if (!sys.space.some(u => u.owner === seat && u.type !== 'fighter' && u.type !== 'infantry' && u.type !== 'floating_factory')) continue
      if (reachesWith(state, seat, systemId, { effect: 'in_the_silence_of_space', seat, scope: 'tactical', systemId: sys.id })) {
        via.push('In The Silence Of Space')
        break
      }
    }
  }
  // Jol-Nar Spatial Conduit Cylinder: the activated system counts as adjacent to every system holding the
  // seat's ships. Gravity Drive is NOT probed — `shipsThatCanReach` already prices it into the base reach,
  // so a system beyond that preview is beyond Gravity Drive too.
  if (player.faction === 'jolnar' && player.techs.includes('spatial_conduit_cylinder') && !player.spatialConduitExhausted
    && reachesWith(state, seat, systemId, { effect: 'spatial_conduit_cylinder', seat, scope: 'tactical' })) {
    via.push('Spatial Conduit Cylinder')
  }
  return { reachable: false, via }
}
