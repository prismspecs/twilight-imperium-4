import { actionCardDef } from '../../data/actionCards'
import { isShip } from '../../data/units'
import { HAND_LIMIT, PLAYABLE_ACTION_CARDS } from '../../engine'
import { planetLabel, systemLabel, techLabel } from '../format'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import type { ActionCardParams, GameState, Move, Seat } from '../../engine/types'

export interface ActionCardPanelProps {
  onClose: () => void
  viewingSeat?: Seat
  /** Lets the map glow the system a hovered or focused target names, so the player can find it. */
  onHighlight?: (systemId: string | null) => void
}

function findPlanetInState(state: GameState, planetId: string) {
  for (const sys of Object.values(state.systems)) {
    const p = sys.planets.find(pl => pl.id === planetId)
    if (p) return p
  }
  return undefined
}

/** The system a move's target lives in, whichever kind of target it names. */
function targetSystemId(state: GameState, params: ActionCardParams | undefined): string | null {
  if (!params) return null
  if (params.systemId !== undefined) return params.systemId
  if (params.planetId !== undefined) {
    for (const sys of Object.values(state.systems)) {
      if (sys.planets.some(p => p.id === params.planetId)) return sys.id
    }
  }
  return null
}

/** What one enumerated play of a card actually does, in words: the card names its own target. */
function offerLabel(state: GameState, params: ActionCardParams | undefined, cardId?: string): string {
  if (!params) return 'Play it'
  const baseCard = cardId ? cardId.replace(/_\d+$/, '') : ''
  if (params.planetId !== undefined) {
    const planet = findPlanetInState(state, params.planetId)
    const name = planetLabel(state, params.planetId)
    if (!planet) return name
    if (baseCard === 'uprising' || baseCard === 'mining_initiative') {
      return `${name} (${planet.resources} res → +${planet.resources} TG)`
    }
    if (baseCard === 'plague') {
      const infCount = planet.ground.filter(u => u.type === 'infantry').length
      return `${name} (${infCount} inf)`
    }
    if (baseCard === 'cripple_defenses') {
      const pdsCount = planet.structures.filter(u => u.type === 'pds').length
      return `${name} (${pdsCount} PDS)`
    }
    return `${name} (${planet.resources}R, ${planet.influence}I)`
  }
  if (params.systemId !== undefined) {
    if (baseCard === 'war_effort') return `Place cruiser in ${systemLabel(params.systemId, state)}`
    if (baseCard === 'ghost_ship') return `Place destroyer in ${systemLabel(params.systemId, state)}`
    return systemLabel(params.systemId, state)
  }
  if (params.techId !== undefined) return techLabel(params.techId)
  if (params.seat !== undefined) return state.players[params.seat].name
  return 'Play it'
}

/**
 * R9: the hand, and every play the engine will accept for it. A card that cannot be played says why in
 * words rather than sitting there greyed out and mute (CLAUDE.md).
 */
export function ActionCardPanel({ onClose, viewingSeat, onHighlight }: ActionCardPanelProps) {
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
          const baseCard = cardId.replace(/_\d+$/, '')
          const offers = plays.filter(m => m.cardId === cardId)
          const isWarEffort = baseCard === 'war_effort'
          const shipSystems = isWarEffort && isMyTurn
            ? Object.keys(state.systems).filter(id => state.systems[id].space.some(u => u.owner === seat && isShip(u.type)))
            : []
          const warEffortBlocked = isWarEffort && isMyTurn
            ? shipSystems.filter(id => !offers.some(m => m.params?.systemId === id))
            : []
          let reason = !isMyTurn
            ? 'Cards can only be played during your turn or during appropriate reaction windows.'
            : PLAYABLE_ACTION_CARDS.includes(cardId)
              ? `Nothing on the board is a legal target for this card right now (${def.window.toLowerCase()}).`
              : `This card waits for a moment the game cannot offer yet: ${def.window.toLowerCase()}.`

          if (isMyTurn && isWarEffort && offers.length === 0) {
            if (state.players[seat].reinforcements.cruiser < 1) {
              reason = 'No cruisers remaining in your reinforcements (TI4 limit: 8 cruisers).'
            } else if (shipSystems.length === 0) {
              reason = 'None of your systems contains a ship in space (ground forces and space docks on planets do not count as ships per TI4 LRR 78.1).'
            } else if (warEffortBlocked.length > 0) {
              reason = 'All systems containing your ships have reached your fleet pool capacity. Add command tokens to your fleet pool to place more ships.'
            }
          }

          return (
            <div key={cardId} className="rowline" data-testid={`action-card-${cardId}`} style={{ alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ minWidth: 220 }}>
                <div className="tab">{def.name}</div>
                <div className="sub">{def.text}</div>
                {warEffortBlocked.length > 0 && offers.length > 0 ? (
                  <div className="sub warn" style={{ color: '#fca5a5', marginTop: 4 }}>
                    Fleet pool full in: {warEffortBlocked.map(id => systemLabel(id, state)).join(', ')}
                  </div>
                ) : null}
              </div>
              {offers.length === 0 ? <span className="sub err">{reason}</span> : null}
              {offers.map((move, i) => {
                const targetId = targetSystemId(state, move.params)
                return (
                  <button key={`${cardId}-${String(i)}`} type="button" className="pay"
                    data-testid={`play-${cardId}-${String(i)}`}
                    onClick={() => { if (apply(move)) onClose() }}
                    onMouseEnter={targetId ? () => onHighlight?.(targetId) : undefined}
                    onMouseLeave={targetId ? () => onHighlight?.(null) : undefined}
                    onFocus={targetId ? () => onHighlight?.(targetId) : undefined}
                    onBlur={targetId ? () => onHighlight?.(null) : undefined}>
                    {offerLabel(state, move.params, cardId)}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
