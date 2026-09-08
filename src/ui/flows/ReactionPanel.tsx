import { actionCardDef } from '../../data/actionCards'
import { isAi, pendingReaction, reactingSeat, reactionMoves } from '../../engine'
import { systemLabel } from '../format'
import { useGame } from '../store'
import type { Move } from '../../engine/types'

/** R9: the printed window text, filled in with the system (and round, for a combat round) this one is about. */
function windowLabel(kind: string, systemName: string, round: number | undefined): string {
  if (kind === 'spaceCombatRound') return `Start of space combat round ${round ?? 1} in ${systemName}`
  if (kind === 'groundCombatRound') return `Start of ground combat round ${round ?? 1} in ${systemName}`
  return `After activating ${systemName}`
}

/**
 * R9: the reaction window the engine's `pendingReactions` stack opens has no other UI hook — it blocks every
 * other move (`legalMoves` returns only `declineReaction` and the eligible card plays) until the reacting
 * seat answers, so without this the game looks stuck the moment a window opens on a human seat. Rendered in
 * its own top-level overlay (above the combat dialog's own, which is also up whenever a combat-round window
 * opens) rather than inside `.stage`, since the reacting seat must always be able to resolve it.
 */
export function ReactionPanel() {
  const { session, apply } = useGame()
  if (!session) return null
  const state = session.state
  const window = pendingReaction(state)
  if (!window) return null
  const seat = reactingSeat(state)
  if (seat === null || isAi(session.config, seat)) return null
  const player = state.players[seat]
  const moves = reactionMoves(state, seat, window)
  const cardIds = [...new Set(moves.flatMap(m => m.type === 'playActionCard' ? [m.cardId] : []))]
  return (
    <div className="reaction-modal-overlay" data-testid="reaction-modal-overlay">
      <div className="dialog" data-testid="reaction-panel">
        <div className="in">
          <div className="dhead">
            <span className="tab">Reaction, {player.name}</span>
            <span className="sub">{windowLabel(window.kind, systemLabel(window.systemId, state), window.round)}</span>
            <div className="right">
              <button type="button" className="btn quiet" data-testid="btn-reaction-decline" onClick={() => apply({ type: 'declineReaction' })}>
                Decline
              </button>
            </div>
          </div>
          {cardIds.length === 0 ? (
            <div className="sub">You have nothing to play into this window.</div>
          ) : cardIds.map(cardId => {
            const def = actionCardDef(cardId)
            const offers = moves.filter((m): m is Extract<Move, { type: 'playActionCard' }> => m.type === 'playActionCard' && m.cardId === cardId)
            return (
              <div key={cardId} className="rowline" data-testid={`reaction-card-${cardId}`} style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 220 }}>
                  <div className="tab">{def.name}</div>
                  <div className="sub">{def.text}</div>
                </div>
                {offers.map((move, i) => (
                  <button key={`${cardId}-${String(i)}`} type="button" className="pay" data-testid={`reaction-play-${cardId}-${String(i)}`}
                    onClick={() => apply(move)}>
                    {move.params?.systemId ? `Play → ${systemLabel(move.params.systemId, state)}` : 'Play'}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
