import { MECATOL_ID } from '../data/map'
import { MANDATE_IDS, objectiveDef } from '../data/objectives'
import { isShip } from '../data/units'
import { homeSystemOf } from './board'
import type { GameState, Seat } from './types'

export function controlledPlanets(state: GameState, seat: Seat): { systemId: string; planetId: string }[] {
  const out: { systemId: string; planetId: string }[] = []
  for (const sys of Object.values(state.systems)) {
    for (const p of sys.planets) if (p.owner === seat) out.push({ systemId: sys.id, planetId: p.id })
  }
  return out
}

export function controlsMecatol(state: GameState, seat: Seat): boolean {
  return state.systems[MECATOL_ID].planets.some(p => p.owner === seat)
}

function shipCount(state: GameState, seat: Seat): number {
  let n = 0
  for (const sys of Object.values(state.systems)) {
    for (const u of sys.space) if (u.owner === seat && isShip(u.type)) n += 1
  }
  return n
}

/** R7: the public objectives and the two mandates. An unknown id is false, never a throw. */
export function fulfils(state: GameState, seat: Seat, objectiveId: string): boolean {
  const player = state.players[seat]
  const allOtherSeats = state.players.map((_, i) => i).filter(i => i !== seat)
  
  switch (objectiveId) {
    case 'win_space_combat':
      return player.spaceCombatWins >= 1
    case 'control_4_outside_home':
      return controlledPlanets(state, seat).filter(p => state.systems[p.systemId].home !== seat).length >= 4
    case 'spend_6_resources':
      return player.resourcesSpentThisRound >= 6
    case 'trade_three_times':
      return player.trades >= 3
    case 'more_ships':
      // N-player: seat has more ships than at least one other seat
      const myShips = shipCount(state, seat)
      return allOtherSeats.some(other => myShips > shipCount(state, other))
    case 'first_strike':
      return state.mecatolCombatWinner === seat
    case 'foothold':
      // N-player: seat controls at least one other seat's home system
      return allOtherSeats.some(other =>
        controlledPlanets(state, seat).some(p => p.systemId === homeSystemOf(state, other))
      )
    default:
      return false
  }
}

/** R3.3 step 1: what the seat may score right now, each objective and each mandate once per game. */
export function scoreable(state: GameState, seat: Seat): string[] {
  const player = state.players[seat]
  const out = state.publicObjectives.filter(id => !player.scoredObjectives.includes(id) && fulfils(state, seat, id))
  for (const id of MANDATE_IDS) {
    if (!player.scoredMandates.includes(id) && fulfils(state, seat, id)) out.push(id)
  }
  return out
}

export function addVp(state: GameState, seat: Seat, points: number, reason: string): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], vp: players[seat].vp + points }
  return { ...state, players, log: [...state.log, { t: 'info', text: `seat ${seat} scores ${points} VP: ${reason}` }] }
}

/** R7: records the objective (or the mandate) and adds its victory point. Fulfilment is checked by the caller. */
export function scoreObjective(state: GameState, seat: Seat, objectiveId: string): GameState {
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = MANDATE_IDS.includes(objectiveId)
    ? { ...player, scoredMandates: [...player.scoredMandates, objectiveId] }
    : { ...player, scoredObjectives: [...player.scoredObjectives, objectiveId] }
  return addVp({ ...state, players }, seat, 1, objectiveDef(objectiveId)?.text ?? objectiveId)
}
