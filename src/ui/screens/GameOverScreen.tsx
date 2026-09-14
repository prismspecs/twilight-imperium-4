import { useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { objectiveDef } from '../../data/objectives'
import { LogPanel } from '../LogPanel'
import { SpaceBackdrop } from '../SpaceBackdrop'
import { COLOUR_INK, PORTRAIT, SIGIL } from '../art'
import { navigate } from '../route'
import { useGame } from '../store'
import { useFitScale } from '../useViewportScale'
import type { Seat } from '../../engine/types'

export function GameOverScreen() {
  const fit = useFitScale()
  const { session, abandon } = useGame()
  const [showLog, setShowLog] = useState(true)
  const winnerSeat = session ? session.state.winner : null
  if (!session || winnerSeat === null) return null
  // `winnerSeat`, not `state.winner`: strict mode's narrowing of `session.state.winner === null` above
  // doesn't survive re-reading the same field off the `state` alias below.
  const state = session.state
  const winner = state.players[winnerSeat]
  const winnerFaction = FACTIONS[winner.faction]
  const winnerColor = COLOUR_INK[winner.color] ?? { accent: '#eab308', tint: '#fde047', glow: 'rgba(234, 179, 8, 0.4)' }

  // Rank players by VP descending with winner at #1
  const rankedSeats: Seat[] = state.players
    .map((p, seat) => ({ seat: seat as Seat, vp: p.vp, isWinner: seat === winnerSeat }))
    .sort((a, b) => {
      if (a.isWinner) return -1
      if (b.isWinner) return 1
      return b.vp - a.vp
    })
    .map(item => item.seat)

  return (
    <div className="setup victory-screen" data-testid="game-over" style={{ zoom: fit }}>
      <SpaceBackdrop />

      {/* Hero Header */}
      <header className="hero victory-hero">
        <div className="victory-kicker">
          <span className="victory-kicker-icon" aria-hidden="true">👑</span>
          <span>Imperial Coronation · Round {state.round}</span>
        </div>
        <h1 className="title victory-title goldtext" data-testid="winner">{winner.name} wins</h1>
        <p className="tagline victory-tagline" data-testid="final-score">
          {state.players.length <= 2
            ? `${state.players[0].name} ${state.players[0].vp} victory points, ${state.players[1].name} ${state.players[1].vp}`
            : state.players.map(p => `${p.name} ${p.vp} VP`).join(' · ')}
        </p>
      </header>

      {/* Champion Spotlight Banner */}
      <div className="victory-champion-card" data-testid="champion-card">
        <div className="victory-champion-left">
          <div className="victory-champion-avatar-wrap" style={{ borderColor: winnerColor.accent }}>
            <img
              src={SIGIL[winner.faction] ?? PORTRAIT[winner.faction]}
              alt={winner.name}
              className="victory-champion-avatar"
            />
          </div>
          <div className="victory-champion-meta">
            <div className="victory-champion-sub">Galactic Emperor · Ascended to the Throne</div>
            <div className="victory-champion-name">{winner.name}</div>
            <div className="victory-champion-faction">
              {winnerFaction?.name ?? winner.faction}
              <span className="victory-champion-color-pill" style={{ color: winnerColor.accent }}>
                {' '}· {winner.color.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="victory-champion-score">
          <div className="victory-champion-vp-val">{winner.vp}</div>
          <div className="victory-champion-vp-lbl">Victory Points</div>
        </div>
        {SIGIL[winner.faction] && (
          <img src={SIGIL[winner.faction]} alt="" className="victory-champion-sigil-bg" aria-hidden="true" />
        )}
      </div>

      {/* Standings Grid Section */}
      <div className="victory-section-header">
        <div className="victory-section-title">Galactic Standings</div>
        <div className="victory-section-count">{state.players.length} Players · Final Standings</div>
      </div>

      <div className={`victory-grid ${state.players.length <= 2 ? 'two-player' : ''}`}>
        {rankedSeats.map((seat, index) => {
          const player = state.players[seat]
          const isWinner = seat === winnerSeat
          const rank = index + 1
          const playerColor = COLOUR_INK[player.color] ?? { accent: '#3b82f6', tint: '#93c5fd', glow: 'rgba(59, 130, 246, 0.4)' }
          const faction = FACTIONS[player.faction]

          const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other'
          const rankLabel = rank === 1 ? '1ST' : rank === 2 ? '2ND' : rank === 3 ? '3RD' : `${rank}TH`

          const scoredObjs = player.scoredObjectives.map(id => {
            const def = objectiveDef(id)
            return {
              id,
              name: def?.name ?? id,
              points: def?.points ?? 1,
              stage: def?.stage ?? 'stage1',
              text: def?.text ?? id,
            }
          })
          const scoredPointsTotal = scoredObjs.reduce((sum, o) => sum + o.points, 0)
          const extraVp = Math.max(0, player.vp - scoredPointsTotal)

          return (
            <div
              key={seat}
              className={`victory-card ${isWinner ? 'is-winner' : ''}`}
              data-testid={`standings-card-${seat}`}
            >
              <div className="victory-card-color-strip" style={{ backgroundColor: playerColor.accent }} />

              <div className="victory-card-header">
                <div className="victory-card-id">
                  <span className={`victory-rank-pill ${rankClass}`}>{rankLabel}</span>
                  <img
                    src={SIGIL[player.faction] ?? PORTRAIT[player.faction]}
                    alt=""
                    className="victory-card-avatar"
                    style={{ borderColor: playerColor.accent }}
                  />
                  <div className="victory-card-names">
                    <div className="victory-card-pname">{player.name}</div>
                    <div className="victory-card-fname">{faction?.name ?? player.faction}</div>
                  </div>
                </div>

                <div className="victory-card-score-box">
                  <span className="victory-card-vp-val">{player.vp}</span>
                  <span className="victory-card-vp-lbl">VP</span>
                </div>
              </div>

              <div className="victory-card-body">
                <div className="victory-card-body-lbl">
                  <span>Scored Objectives</span>
                  <span>{scoredObjs.length}</span>
                </div>

                <div className="victory-card-obj-list" data-testid={`scored-list-${seat}`}>
                  {scoredObjs.length === 0 ? (
                    <div className="victory-no-objectives">No public objective scored</div>
                  ) : (
                    scoredObjs.map(obj => {
                      const stageClass = obj.stage === 'stage2' ? 'stage-2' : obj.stage === 'secret' ? 'stage-secret' : 'stage-1'
                      const stageLabel = obj.stage === 'stage2' ? 'STAGE II' : obj.stage === 'secret' ? 'SECRET' : 'STAGE I'
                      return (
                        <div key={obj.id} className={`victory-obj-item ${stageClass}`}>
                          <div className="victory-obj-top">
                            <span className="victory-obj-badge">{stageLabel}</span>
                            <span className="victory-obj-points">+{obj.points} VP</span>
                          </div>
                          <div className="victory-obj-title">{obj.name}</div>
                          {obj.text && <div className="victory-obj-desc">{obj.text}</div>}
                        </div>
                      )
                    })
                  )}

                  {extraVp > 0 && (
                    <div className="victory-obj-item stage-special">
                      <div className="victory-obj-top">
                        <span className="victory-obj-badge">MECATOL / SPECIAL</span>
                        <span className="victory-obj-points">+{extraVp} VP</span>
                      </div>
                      <div className="victory-obj-title">Imperial & Galactic Glory</div>
                      <div className="victory-obj-desc">Points from Custodians token, Imperial strategy bonus, agendas, or promissory notes.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showLog ? (
        <LogPanel state={state} onClose={() => setShowLog(false)} />
      ) : null}

      <div className="setup-foot victory-footer">
        <button
          type="button"
          className="btn quiet"
          data-testid="btn-toggle-log"
          onClick={() => setShowLog(prev => !prev)}
        >
          {showLog ? 'Minimize Game Log' : '📜 Show Game Log'}
        </button>
        <button
          type="button"
          className="btn gold"
          data-testid="btn-new-game"
          onClick={() => { abandon(); navigate('#/') }}
        >
          New game
        </button>
      </div>
    </div>
  )
}

