import { actionCardDef } from '../../data/actionCards'
import { FACTIONS } from '../../data/factions'
import { HAND_LIMIT, isAi } from '../../engine'
import type { Seat } from '../../engine/types'
import { useGame } from '../store'

export interface DiscardActionCardDialogProps {
  seat?: Seat
}

/**
 * LRR 112 & 140: When a player holds more than 7 action cards, they must immediately
 * choose and discard action cards until they have only 7 cards.
 */
export function DiscardActionCardDialog({ seat: propSeat }: DiscardActionCardDialogProps) {
  const { session, apply } = useGame()
  if (!session) return null
  const state = session.state
  const pendingHandLimit = state.pendingActionCardDiscards
  const pendingScheming = state.pendingSchemingDiscards
  if ((!pendingHandLimit || pendingHandLimit.length === 0) && (!pendingScheming || pendingScheming.length === 0)) return null

  const seat = propSeat ?? (pendingHandLimit?.[0] ?? pendingScheming?.[0])
  if (seat === undefined || isAi(session.config, seat)) return null

  const isScheming = Boolean(pendingScheming?.includes(seat))
  const player = state.players[seat]
  if (!player) return null

  const hand = player.actionCards
  const excess = Math.max(0, hand.length - HAND_LIMIT)
  if (!isScheming && excess <= 0) return null

  const factionName = FACTIONS[player.faction]?.name ?? player.faction

  return (
    <div className="reaction-modal-overlay" data-testid="discard-action-card-overlay">
      <div className="dialog" data-testid="discard-action-card-dialog" style={{ maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="in" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="dhead">
            <div>
              <span className="tab" style={{ color: isScheming ? '#fbbf24' : '#fca5a5' }}>
                {isScheming ? 'Scheming · Discard Action Card' : 'Hand Limit Exceeded'}
              </span>
              <div className="sub" style={{ marginTop: 2 }}>
                {isScheming
                  ? `${player.name} (${factionName}) — You drew 1 additional card via Scheming. Choose 1 action card from your hand to discard.`
                  : `${player.name} (${factionName}) — You hold ${hand.length} cards (limit is ${HAND_LIMIT}). Discard ${excess} card${excess > 1 ? 's' : ''}.`}
              </div>
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {hand.map((cardId, idx) => {
              const def = actionCardDef(cardId)
              return (
                <div
                  key={`${cardId}-${String(idx)}`}
                  className="rowline"
                  data-testid={`discard-card-row-${cardId}`}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: 4,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="tab" style={{ fontSize: 14 }}>{def.name}</span>
                      <span className="pill phase" style={{ fontSize: 10, textTransform: 'uppercase', padding: '1px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
                        {def.phase}
                      </span>
                    </div>
                    <div className="sub" style={{ fontSize: 11, marginTop: 2, color: 'var(--ink-muted)' }}>
                      {def.window}
                    </div>
                    <div className="sub" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.3 }}>
                      {def.text}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      borderColor: '#ef4444',
                      color: '#fca5a5',
                      whiteSpace: 'nowrap',
                      padding: '6px 12px',
                    }}
                    data-testid={`btn-discard-${cardId}`}
                    onClick={() => apply({ type: 'discardActionCard', cardId })}
                  >
                    Discard
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
