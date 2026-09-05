import { actionCardName } from '../engine'
import { CARD_NAME, planetLabel, systemLabel, techLabel } from './format'
import type { GameState, LogEntry, Move, Owner, Seat, UnitType } from '../engine/types'

function who(state: GameState, seat: Seat | null): string {
  return seat === null ? 'The game' : state.players[seat].name
}

function ownerName(state: GameState, owner: Owner): string {
  return owner === 'guardian' ? 'The guardian fleet' : state.players[owner].name
}

function unitSummary(units: Partial<Record<UnitType, number>>): string {
  const parts = (Object.entries(units) as [UnitType, number][]).filter(([, n]) => n > 0).map(([type, n]) => `${n} ${type}`)
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

export function describeMove(state: GameState, seat: Seat | null, move: Move): string {
  const name = who(state, seat)
  switch (move.type) {
    case 'pickStrategyCard': return `${name} takes ${CARD_NAME[move.card]}`
    case 'startTactical': return `${name} activates ${systemLabel(move.systemId)}`
    case 'moveShips': return `${name} moves ${move.moves.length} ships in`
    case 'endMovement': return `${name} finishes moving`
    case 'combatRound': {
      const sides = [move.munitions?.attacker ? 'attacker' : null, move.munitions?.defender ? 'defender' : null].filter(s => s !== null)
      return sides.length > 0 ? `${name} fights a combat round, Munitions Reserves for the ${sides.join(' and ')}` : `${name} fights a combat round`
    }
    // the move is logged under the seat on turn, but hits are assigned by their owner, whom the engine's own
    // info entry names right after this one
    case 'assignHits': return 'Hits are assigned'
    case 'retreat': return `${name} announces a retreat to ${systemLabel(move.to)}`
    case 'bombard': return `${name} bombards ${planetLabel(state, move.planetId)}`
    case 'land': return `${name} lands ${move.infantryIds.length} infantry on ${planetLabel(state, move.planetId)}`
    case 'groundCombatRound': return `${name} fights a ground combat round`
    case 'endInvasion': return `${name} ends the invasion`
    case 'produce': return `${name} produces ${unitSummary(move.units)}`
    case 'endTactical': return `${name} ends the tactical action`
    case 'endTurn': return `${name} ends their turn`
    case 'strategic': return `${name} plays ${CARD_NAME[move.card]}`
    case 'playActionCard': return `${name} plays the action card ${actionCardName(move.cardId)}`
    case 'secondary': return `${name} ${move.accept ? 'uses' : 'declines'} the ${CARD_NAME[move.card]} secondary`
    case 'research': return `${name} researches ${techLabel(move.techId)} with Inheritance Systems`
    case 'shipyard': return `${name} builds an emergency shipyard on ${planetLabel(state, move.planetId)}`
    case 'tradePost': return `${name} sells ${move.commodities} commodities at the ${move.post} trade post`
    case 'postAbility': return `${name} uses the ${move.post} trade post's ability`
    case 'removeCustodians': return `${name} spends 6 influence to remove the Custodians token from Mecatol Rex (+1 VP)`
    case 'pass': return `${name} passes`
    case 'status': return `${name} distributes command tokens`
  }
}

export function describeEntry(state: GameState, entry: LogEntry): { text: string; kind: 'move' | 'roll' | 'info' } {
  if (entry.t === 'move') return { text: describeMove(state, entry.seat, entry.move), kind: 'move' }
  if (entry.t === 'roll') {
    const hits = entry.rolls.filter(r => r.hit).length
    const dice = entry.rolls.map(r => r.value).join(', ')
    return { text: `${ownerName(state, entry.owner)} rolls ${dice || 'no dice'} for ${entry.context}, ${hits} hits`, kind: 'roll' }
  }
  // engine notes name the seat; the log shows the player instead
  let text = entry.text
  for (const player of state.players) {
    text = text.replaceAll(`seat ${player.seat}`, player.name)
  }
  return { text, kind: 'info' }
}
