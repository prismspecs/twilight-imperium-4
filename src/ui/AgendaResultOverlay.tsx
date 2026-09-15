import { useEffect, useRef } from 'react'
import { formatOutcome } from '../engine'
import { describeEntry } from './logText'
import { useGame } from './store'

/**
 * R10: the vote that just closed an agenda also closes the dialog that showed it (state.agenda goes null
 * the same instant). This overlay clearly presents the resolved outcome, card rule text, vote tally,
 * individual player choices, and engine resolution logs so players understand exactly what happened.
 */
export function AgendaResultOverlay() {
  const { session, dismissAgendaResult } = useGame()
  const continueRef = useRef<HTMLButtonElement | null>(null)
  const shown = session !== null && session.agendaResult !== null

  useEffect(() => {
    if (shown) continueRef.current?.focus()
  }, [shown])

  if (!session || session.agendaResult === null) return null
  const result = session.agendaResult
  const state = session.state

  const isPassed = result.outcome === 'For'
  const isRejected = result.outcome === 'Against'

  return (
    <div
      className="overlay"
      data-testid="agenda-result"
      role="dialog"
      aria-modal="true"
      aria-label="Agenda resolved"
      style={{
        maxWidth: '580px',
        width: '92%',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
      }}
    >
      {/* Top Slot & Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
        <span style={{ color: 'var(--amber, #f59e0b)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agenda {result.slot} of 2 Resolved
        </span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            background: result.agendaKind === 'law' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
            color: result.agendaKind === 'law' ? '#60a5fa' : '#c084fc',
            border: `1px solid ${result.agendaKind === 'law' ? '#3b82f6' : '#a855f7'}`,
          }}
        >
          {result.agendaKind.toUpperCase()}
        </span>
      </div>

      {/* Agenda Card Name */}
      <h2 className="title goldtext" style={{ margin: '0 0 8px 0', fontSize: '1.4rem', textAlign: 'center' }}>
        {result.agendaName}
      </h2>

      {/* Card Rule Text */}
      {result.agendaText && (
        <div
          style={{
            width: '100%',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            color: 'var(--muted, #94a3b8)',
            marginBottom: 14,
            textAlign: 'left',
          }}
        >
          {result.agendaText}
        </div>
      )}

      {/* Winning Outcome Banner */}
      <div
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 14,
          textAlign: 'center',
          background: isPassed
            ? 'rgba(16, 185, 129, 0.15)'
            : isRejected
            ? 'rgba(239, 68, 68, 0.15)'
            : 'rgba(245, 158, 11, 0.15)',
          border: `1px solid ${
            isPassed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b'
          }`,
        }}
      >
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
          Winning Outcome
        </div>
        <div
          style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            marginTop: 2,
            color: isPassed ? '#34d399' : isRejected ? '#f87171' : '#fbbf24',
          }}
        >
          {isPassed ? 'PASSED: FOR' : isRejected ? 'REJECTED: AGAINST' : `ELECTED: ${result.formattedOutcome}`}
        </div>
        {result.tieBreak && (
          <div style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: 4 }}>
            ⚖️ Decided by Speaker {result.speakerName} (Tie Break)
          </div>
        )}
      </div>

      {/* Ixthian Artifact ceremony: the Speaker's 1d10 reveal, front and centre */}
      {result.artifactRoll !== undefined ? (
        <div
          data-testid="artifact-roll"
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 8,
            marginBottom: 14,
            textAlign: 'center',
            background: result.artifactRoll >= 6 ? 'rgba(234, 179, 8, 0.14)' : 'rgba(100, 116, 139, 0.14)',
            border: `1px solid ${result.artifactRoll >= 6 ? '#eab308' : '#64748b'}`,
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
            The Speaker rolls the Ixthian Artifact die
          </div>
          <div
            style={{
              fontSize: '3rem',
              fontWeight: 900,
              lineHeight: 1.1,
              marginTop: 4,
              color: result.artifactRoll >= 6 ? '#fde047' : '#94a3b8',
              textShadow: result.artifactRoll >= 6 ? '0 0 24px rgba(234, 179, 8, 0.45)' : 'none',
            }}
          >
            {result.artifactRoll}
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: 4, color: result.artifactRoll >= 6 ? '#fde047' : '#94a3b8' }}>
            {result.artifactRoll >= 6
              ? '6 or higher — each player, in speaker order, researches 2 technologies'
              : '5 or lower — the Artifact is silent. Nothing happens.'}
          </div>
        </div>
      ) : null}

      {/* Vote Tally Section */}
      <div style={{ width: '100%', marginBottom: 12 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', textAlign: 'left', marginBottom: 6 }}>
          Vote Tally
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(result.tally).length > 0 ? (
            Object.entries(result.tally).map(([out, inf]) => (
              <div
                key={out}
                style={{
                  flex: '1 1 auto',
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {formatOutcome(state, result.agendaId, out)}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--gold, #f59e0b)', marginLeft: 8 }}>
                  {inf} vote{inf === 1 ? '' : 's'}
                </span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted, #94a3b8)', textAlign: 'left' }}>
              No votes cast with influence (tie broken by Speaker).
            </div>
          )}
        </div>
      </div>

      {/* Individual Player Votes Breakdown */}
      <div style={{ width: '100%', marginBottom: 14 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', textAlign: 'left', marginBottom: 6 }}>
          Player Votes
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.votes.map(v => {
            const isSpeaker = v.seat === result.speaker
            return (
              <div
                key={v.seat}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: 4,
                  fontSize: '0.85rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span>
                  <strong>{v.playerName}</strong>
                  {isSpeaker && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#fbbf24' }}>👑 Speaker</span>}
                </span>
                <span>
                  {v.abstained ? (
                    <span style={{ color: 'var(--muted, #94a3b8)' }}>Abstained</span>
                  ) : (
                    <span>
                      Voted <strong style={{ color: 'var(--gold, #f59e0b)' }}>{v.formattedOutcome}</strong> ({v.influence} vote{v.influence === 1 ? '' : 's'})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Resolution Details & Log Entries */}
      <div
        className="tagline"
        data-testid="agenda-result-lines"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          textAlign: 'left',
          width: '100%',
          maxHeight: '140px',
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: '0.85rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: 16,
        }}
      >
        {result.logs.map((entry, i) => (
          <span key={i}>{describeEntry(state, entry).text}</span>
        ))}
      </div>

      <button
        ref={continueRef}
        type="button"
        className="btn gold"
        data-testid="agenda-result-continue"
        onClick={dismissAgendaResult}
        style={{ minWidth: '120px', padding: '8px 24px', fontSize: '1rem', fontWeight: 600 }}
      >
        Continue
      </button>
    </div>
  )
}
