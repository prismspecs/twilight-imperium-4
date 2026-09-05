import { actionCardDef } from '../../data/actionCards'
import { HAND_LIMIT, PLAYABLE_ACTION_CARDS, isAi } from '../../engine'
import { planetLabel, systemLabel, techLabel } from '../format'
import { useGame } from '../store'
import { useEscape } from '../useEscape'
import type { ActionCardParams, GameState, Move } from '../../engine/types'

export interface ActionCardPanelProps {
  onClose: () => void
}

/** What one enumerated play of a card actually does, in words: the card names its own target. */
function offerLabel(state: GameState, params: ActionCardParams | undefined): string {
  if (!params) return 'Play it'
  if (params.planetId !== undefined) return planetLabel(state, params.planetId)
  if (params.systemId !== undefined) return systemLabel(params.systemId)
  if (params.techId !== undefined) return techLabel(params.techId)
  if (params.seat !== undefined) return state.players[params.seat].name
  return 'Play it'
}

/**
 * R9: the hand, and every play the engine will accept for it. A card that cannot be played says why in
 * words rather than sitting there greyed out and mute (CLAUDE.md).
 */
export function ActionCardPanel({ onClose }: ActionCardPanelProps) {
  const { session, legal, apply } = useGame()
  useEscape(onClose)
  if (!session) return null
  const state = session.state
  if (isAi(session.config, state.active)) return null
  const seat = state.active
  const hand = state.players[seat].actionCards
  const plays = legal.filter((m): m is Extract<Move, { type: 'playActionCard' }> => m.type === 'playActionCard')
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
        {hand.map(cardId => {
          const def = actionCardDef(cardId)
          const offers = plays.filter(m => m.cardId === cardId)
          const reason = PLAYABLE_ACTION_CARDS.includes(cardId)
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
                  {offerLabel(state, move.params)}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
