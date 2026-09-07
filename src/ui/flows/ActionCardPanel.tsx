import { actionCardDef } from '../../data/actionCards'
import { HAND_LIMIT, PLAYABLE_ACTION_CARDS } from '../../engine'
import { planetLabel, systemLabel, techLabel } from '../format'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import type { ActionCardParams, GameState, Move, Seat } from '../../engine/types'

export interface ActionCardPanelProps {
  onClose: () => void
  viewingSeat?: Seat
}

function findPlanetInState(state: GameState, planetId: string) {
  for (const sys of Object.values(state.systems)) {
    const p = sys.planets.find(pl => pl.id === planetId)
    if (p) return p
  }
  return undefined
}

/** What one enumerated play of a card actually does, in words: the card names its own target. */
function offerLabel(state: GameState, params: ActionCardParams | undefined, cardId?: string): string {
  if (!params) return 'Play it'
  if (params.planetId !== undefined) {
    const planet = findPlanetInState(state, params.planetId)
    if (!planet) return planetLabel(state, params.planetId)
    const baseCard = cardId ? cardId.replace(/_\d+$/, '') : ''
    if (baseCard === 'uprising' || baseCard === 'mining_initiative') {
      return `${planet.name} (${planet.resources} res → +${planet.resources} TG)`
    }
    if (baseCard === 'plague') {
      const infCount = planet.ground.filter(u => u.type === 'infantry').length
      return `${planet.name} (${infCount} inf)`
    }
    if (baseCard === 'cripple_defenses') {
      const pdsCount = planet.structures.filter(u => u.type === 'pds').length
      return `${planet.name} (${pdsCount} PDS)`
    }
    return `${planet.name} (${planet.resources}R, ${planet.influence}I)`
  }
  if (params.systemId !== undefined) return systemLabel(params.systemId, state)
  if (params.techId !== undefined) return techLabel(params.techId)
  if (params.seat !== undefined) return state.players[params.seat].name
  return 'Play it'
}

/**
 * R9: the hand, and every play the engine will accept for it. A card that cannot be played says why in
 * words rather than sitting there greyed out and mute (CLAUDE.md).
 */
export function ActionCardPanel({ onClose, viewingSeat }: ActionCardPanelProps) {
  const { session, legal, apply } = useGame()
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  const humanSeatIndex = session.config?.players.findIndex(p => p.playerType === 'human') ?? -1
  const humanSeat = humanSeatIndex !== -1 ? (humanSeatIndex as Seat) : undefined
  const seat = viewingSeat ?? humanSeat ?? state.active
  const isMyTurn = state.active === seat
  const hand = state.players[seat]?.actionCards ?? []
  const plays = isMyTurn
    ? legal.filter((m): m is Extract<Move, { type: 'playActionCard' }> => m.type === 'playActionCard')
    : []
  return (
    <div className="drawer full" data-testid="action-card-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Action cards ({hand.length} of {HAND_LIMIT})</span>
          <div className="right">
            <button type="button" className="btn quiet" data-testid="btn-action-card-close" onClick={onClose}>Close</button>
          </div>
        </div>
        {hand.length === 0 ? <div className="sub">You hold no action cards. One is dealt to every player in the status phase.</div> : null}
        {!isMyTurn ? (
          <div className="sub" style={{ color: '#93c5fd', marginBottom: 10 }}>
            It is currently {state.players[state.active].name}&apos;s turn. Action cards can be reviewed here.
          </div>
        ) : null}
        {hand.map(cardId => {
          const def = actionCardDef(cardId)
          const offers = plays.filter(m => m.cardId === cardId)
          const reason = !isMyTurn
            ? 'Cards can only be played during your turn or during appropriate reaction windows.'
            : PLAYABLE_ACTION_CARDS.includes(cardId)
              ? `Nothing on the board is a legal target for this card right now (${def.window.toLowerCase()}).`
              : `This card waits for a moment the game cannot offer yet: ${def.window.toLowerCase()}.`
          return (
            <div key={cardId} className="rowline" data-testid={`action-card-${cardId}`} style={{ alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ minWidth: 220 }}>
                <div className="tab">{def.name}</div>
                <div className="sub">{def.text}</div>
              </div>
              {offers.length === 0 ? <span className="sub err">{reason}</span> : null}
              {offers.map((move, i) => (
                <button key={`${cardId}-${String(i)}`} type="button" className="pay"
                  data-testid={`play-${cardId}-${String(i)}`}
                  onClick={() => { if (apply(move)) onClose() }}>
                  {offerLabel(state, move.params, cardId)}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
