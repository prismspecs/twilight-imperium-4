import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FACTIONS } from '../../data/factions'
import {
  aiDraftPick,
  applyDraftPick,
  availablePicksFor,
  createDraftState,
  type DraftPick,
  type DraftPlayer,
  type MiltyDraftState,
} from '../../engine/draft/miltyDraft'
import { assembleDraftedGame } from '../../engine/draft/assembleMap'
import type { FactionId, GameConfig } from '../../engine/types'
import { COLOUR_INK } from '../art'
import { MusicButton } from '../music'
import { SpaceBackdrop } from '../SpaceBackdrop'
import { SliceHexView } from '../draft/SliceHexView'
import '../draft.css'

export interface MiltyDraftScreenProps {
  playerCount: number
  players: DraftPlayer[]
  seed: number
  minutes: number
  autoDraftAi?: boolean
  onBackToSetup: () => void
  onStartGame: (config: GameConfig, seed: number, minutes: number) => void
}

export function MiltyDraftScreen({
  playerCount,
  players,
  seed,
  minutes,
  autoDraftAi = false,
  onBackToSetup,
  onStartGame,
}: MiltyDraftScreenProps) {
  const [draftState, setDraftState] = useState<MiltyDraftState>(() =>
    createDraftState({ playerCount, players, seed }),
  )
  const aiTimerRef = useRef<number | null>(null)

  const activePlayerIndex = draftState.isComplete
    ? null
    : draftState.pickSequence[draftState.turnIndex]
  const activePlayer =
    activePlayerIndex !== null ? draftState.players[activePlayerIndex] : null
  const currentRound = Math.min(3, Math.floor(draftState.turnIndex / playerCount) + 1)
  const totalPicks = draftState.pickSequence.length
  const isAiThinking = activePlayer?.playerType === 'ai' && !draftState.isComplete

  const activeAvail = useMemo(() => {
    if (activePlayerIndex === null) return null
    return availablePicksFor(draftState, activePlayerIndex)
  }, [draftState, activePlayerIndex])

  // Handle human pick
  function handlePick(pick: DraftPick) {
    if (draftState.isComplete) return
    const res = applyDraftPick(draftState, pick)
    if (res.ok) {
      setDraftState(res.value)
    }
  }

  // Handle automated AI drafting
  useEffect(() => {
    if (draftState.isComplete || activePlayerIndex === null || !activePlayer) return

    if (activePlayer.playerType === 'ai') {
      const delay = autoDraftAi ? 0 : 500
      if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current)
      aiTimerRef.current = window.setTimeout(() => {
        aiTimerRef.current = null
        const pick = aiDraftPick(draftState, activePlayerIndex)
        const res = applyDraftPick(draftState, pick)
        if (res.ok) setDraftState(res.value)
      }, delay)
    }

    return () => {
      if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current)
    }
  }, [draftState, activePlayerIndex, activePlayer, autoDraftAi])

  function handleLaunch() {
    if (!draftState.isComplete) return
    const assembled = assembleDraftedGame(draftState, seed)
    onStartGame(
      {
        players: assembled.players,
        speaker: assembled.speaker,
        systems: assembled.systems,
      },
      seed,
      minutes,
    )
  }

  // Map who claimed what
  const claimedFactionOwners = useMemo(() => {
    const map = new Map<FactionId, DraftPlayer>()
    for (let p = 0; p < playerCount; p++) {
      const f = draftState.picks[p]?.faction
      if (f) map.set(f, draftState.players[p])
    }
    return map
  }, [draftState, playerCount])

  const claimedSliceOwners = useMemo(() => {
    const map = new Map<string, DraftPlayer>()
    for (let p = 0; p < playerCount; p++) {
      const s = draftState.picks[p]?.sliceId
      if (s) map.set(s, draftState.players[p])
    }
    return map
  }, [draftState, playerCount])

  const claimedPositionOwners = useMemo(() => {
    const map = new Map<number, DraftPlayer>()
    for (let p = 0; p < playerCount; p++) {
      const pos = draftState.picks[p]?.position
      if (pos) map.set(pos, draftState.players[p])
    }
    return map
  }, [draftState, playerCount])

  return (
    <div className="milty-draft-root" data-testid="milty-draft-screen">
      <SpaceBackdrop dim />

      {/* Header bar */}
      <header className="draft-header">
        <div className="draft-brand">
          <button
            type="button"
            className="btn quiet small"
            data-testid="btn-back-to-setup"
            onClick={onBackToSetup}
          >
            ← Setup
          </button>
          <h1 className="draft-title">Twilight Imperium IV</h1>
          <span className="draft-badge">Milty Draft</span>
        </div>

        <div className="draft-turn-banner" data-testid="draft-turn-banner">
          {draftState.isComplete ? (
            <span className="draft-turn-complete">Draft complete — assemble galaxy below</span>
          ) : (
            <>
              <span className="draft-turn-meta">
                Round {currentRound}/3 · Pick {draftState.turnIndex + 1}/{totalPicks}
              </span>
              <div className="draft-turn-player">
                <span
                  className="player-dot"
                  style={{
                    backgroundColor: COLOUR_INK[activePlayer!.color].accent,
                    color: COLOUR_INK[activePlayer!.color].accent,
                  }}
                />
                <span>{activePlayer!.name}</span>
                <span className="draft-turn-status">
                  {isAiThinking ? 'AI deciding…' : activePlayer!.playerType === 'ai' ? 'AI' : 'Your pick'}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="draft-header-end">
          <MusicButton />
        </div>
      </header>

      {/* Snake pick ribbon */}
      <div className="draft-snake-ribbon" data-testid="draft-snake-ribbon">
        {draftState.pickSequence.map((playerIdx, idx) => {
          const p = draftState.players[playerIdx]
          const isDone = idx < draftState.turnIndex
          const isCurrent = idx === draftState.turnIndex
          const ink = COLOUR_INK[p.color]
          return (
            <div
              key={idx}
              className={`ribbon-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ink.accent,
                  display: 'inline-block',
                }}
              />
              <span>{p.name}</span>
            </div>
          )
        })}
      </div>

      {/* Player Roster Summary */}
      <section className="draft-roster-section" data-testid="draft-roster">
        <div className="draft-roster-grid">
          {draftState.players.map((p, idx) => {
            const picks = draftState.picks[idx] ?? {}
            const isTurn = idx === activePlayerIndex
            const ink = COLOUR_INK[p.color]
            const cardStyle = {
              '--player-accent': ink.accent,
              '--player-glow': ink.glow,
            } as CSSProperties
            const faction = picks.faction ? FACTIONS[picks.faction] : null
            const slice = picks.sliceId
              ? draftState.slicesPool.find(s => s.id === picks.sliceId)
              : null

            return (
              <div
                key={idx}
                className={`roster-card ${isTurn ? 'active' : ''}`}
                style={cardStyle}
              >
                <div className="roster-head">
                  <div className="roster-name">
                    <span
                      className="player-dot"
                      style={{ backgroundColor: ink.accent, color: ink.accent }}
                    />
                    <span>{p.name}</span>
                  </div>
                  <span className="roster-type-tag">
                    {p.playerType === 'ai' ? 'AI' : 'Human'}
                  </span>
                </div>
                <div className="roster-picks">
                  <div className="roster-pick-row">
                    <span>Faction:</span>
                    <span className="roster-pick-val">
                      {faction ? faction.name : '—'}
                    </span>
                  </div>
                  <div className="roster-pick-row">
                    <span>Slice:</span>
                    <span className="roster-pick-val">
                      {slice
                        ? `${slice.name} (${String(slice.optimalResources)}r/${String(slice.optimalInfluence)}i)`
                        : '—'}
                    </span>
                  </div>
                  <div className="roster-pick-row">
                    <span>Position:</span>
                    <span className="roster-pick-val">
                      {picks.position ? (picks.position === 1 ? '⭐ Speaker (1st)' : `${String(picks.position)}th`) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* The 3 Draft Pools */}
      <main className="draft-pools-container">
        {/* Factions Pool */}
        <section className="draft-pool-col pool-factions" data-testid="draft-factions-pool">
          <div className="pool-title-bar">
            <h2 className="pool-title">Factions Pool</h2>
            <span className="pool-count">
              {draftState.factionsPool.length - draftState.claimedFactions.length} available
            </span>
          </div>

          <div className="pool-items-list">
            {draftState.factionsPool.map(fId => {
              const faction = FACTIONS[fId]
              const owner = claimedFactionOwners.get(fId)
              const isClaimed = Boolean(owner)
              const canDraft =
                !draftState.isComplete &&
                activePlayer?.playerType === 'human' &&
                activeAvail?.canPickFaction &&
                !isClaimed

              return (
                <div
                  key={fId}
                  className={`draft-faction-card ${isClaimed ? 'claimed' : ''}`}
                >
                  <div className="faction-info-row">
                    <img
                      src={`/assets/factions/${fId}.png`}
                      alt={faction.name}
                      className="faction-sigil"
                      onError={e => {
                        ;(e.currentTarget as HTMLElement).style.display = 'none'
                      }}
                    />
                    <div>
                      <div className="faction-name">{faction.name}</div>
                      <div className="faction-sub">
                        <span>Commodities: {faction.commodityValue}</span>
                        <span>•</span>
                        <span>Techs: {faction.startingTechs.join(', ') || 'None'}</span>
                      </div>
                    </div>
                  </div>

                  {isClaimed ? (
                    <span
                      className="claimed-badge"
                      data-testid={`claimed-faction-${fId}`}
                      style={{
                        borderColor: COLOUR_INK[owner!.color].accent,
                        color: COLOUR_INK[owner!.color].tint,
                      }}
                    >
                      {owner!.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn primary small"
                      data-testid={`draft-pick-faction-${fId}`}
                      aria-label={`Draft faction ${faction.name}`}
                      disabled={!canDraft}
                      onClick={() => {
                        handlePick({
                          playerIndex: activePlayerIndex!,
                          kind: 'faction',
                          value: fId,
                        })
                      }}
                    >
                      Draft
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Slices Pool */}
        <section className="draft-pool-col pool-slices" data-testid="draft-slices-pool">
          <div className="pool-title-bar">
            <h2 className="pool-title">Slices Pool</h2>
            <span className="pool-count">
              {draftState.slicesPool.length - draftState.claimedSlices.length} available
            </span>
          </div>

          <div className="pool-items-list slices-grid">
            {draftState.slicesPool.map(slice => {
              const owner = claimedSliceOwners.get(slice.id)
              const isClaimed = Boolean(owner)
              const canDraft =
                !draftState.isComplete &&
                activePlayer?.playerType === 'human' &&
                activeAvail?.canPickSlice &&
                !isClaimed

              return (
                <div
                  key={slice.id}
                  className={`draft-slice-card ${isClaimed ? 'claimed' : ''}`}
                >
                  <div className="slice-head">
                    <span className="slice-name">{slice.name}</span>
                    {isClaimed ? (
                      <span
                        className="claimed-badge"
                        data-testid={`claimed-slice-${slice.id}`}
                        style={{
                          borderColor: COLOUR_INK[owner!.color].accent,
                          color: COLOUR_INK[owner!.color].tint,
                        }}
                      >
                        {owner!.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn primary small"
                        data-testid={`draft-pick-slice-${slice.id}`}
                        aria-label={`Draft ${slice.name}`}
                        disabled={!canDraft}
                        onClick={() => {
                          handlePick({
                            playerIndex: activePlayerIndex!,
                            kind: 'slice',
                            value: slice.id,
                          })
                        }}
                      >
                        Draft
                      </button>
                    )}
                  </div>

                  <div className="slice-viewport">
                    <span className="slice-corner tl" />
                    <span className="slice-corner tr" />
                    <span className="slice-corner bl" />
                    <span className="slice-corner br" />
                    <SliceHexView slice={slice} />
                  </div>

                  <div className="slice-readout">
                    <span className="readout-value res">{slice.optimalResources}</span>
                    <span className="readout-unit">res</span>
                    <span className="readout-slash">/</span>
                    <span className="readout-value inf">{slice.optimalInfluence}</span>
                    <span className="readout-unit">inf</span>
                    <span className="readout-caption">
                      optimal · {slice.totalResources}r/{slice.totalInfluence}i total
                    </span>
                  </div>

                  <div className="slice-metrics-row">
                    {slice.techSkips.map(skip => (
                      <span key={skip} className={`metric-badge skip-${skip}`}>
                        {skip.toUpperCase()} skip
                      </span>
                    ))}
                    {slice.wormholes.map(wh => (
                      <span key={wh} className="metric-badge wormhole">
                        {wh} wormhole
                      </span>
                    ))}
                    {slice.anomalies.map(anom => (
                      <span key={anom} className="metric-badge anomaly">
                        {anom.replace('_', ' ')}
                      </span>
                    ))}
                  </div>

                  <div className="slice-planets-list">
                    {slice.tiles.map((tile, i) => (
                      <span key={tile.tile}>
                        {i > 0 && <span className="planet-sep">·</span>}
                        {tile.planets.length > 0
                          ? tile.planets.map(p => `${p.name} (${String(p.resources)}/${String(p.influence)})`).join(', ')
                          : tile.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Positions Pool */}
        <section className="draft-pool-col pool-positions" data-testid="draft-positions-pool">
          <div className="pool-title-bar">
            <h2 className="pool-title">Speaker & Table Positions</h2>
            <span className="pool-count">
              {draftState.positionsPool.length - draftState.claimedPositions.length} available
            </span>
          </div>

          <div className="pool-items-list">
            {draftState.positionsPool.map(pos => {
              const owner = claimedPositionOwners.get(pos.position)
              const isClaimed = Boolean(owner)
              const isSpeaker = pos.position === 1
              const canDraft =
                !draftState.isComplete &&
                activePlayer?.playerType === 'human' &&
                activeAvail?.canPickPosition &&
                !isClaimed

              return (
                <div
                  key={pos.position}
                  className={`draft-pos-card ${isClaimed ? 'claimed' : ''}`}
                >
                  <div>
                    <div className="pos-title">
                      {isSpeaker ? (
                        <>
                          <span className="speaker-star">⭐</span> Speaker (Position 1)
                        </>
                      ) : (
                        `Position ${String(pos.position)}`
                      )}
                    </div>
                    <div className="pos-sub">
                      {isSpeaker ? 'Picks strategy card 1st in round 1' : `Picks strategy card ${String(pos.position)}th`}
                    </div>
                  </div>

                  {isClaimed ? (
                    <span
                      className="claimed-badge"
                      data-testid={`claimed-position-${String(pos.position)}`}
                      style={{
                        borderColor: COLOUR_INK[owner!.color].accent,
                        color: COLOUR_INK[owner!.color].tint,
                      }}
                    >
                      {owner!.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn primary small"
                      data-testid={`draft-pick-position-${String(pos.position)}`}
                      aria-label={`Draft ${isSpeaker ? 'Speaker (Position 1)' : `Position ${String(pos.position)}`}`}
                      disabled={!canDraft}
                      onClick={() => {
                        handlePick({
                          playerIndex: activePlayerIndex!,
                          kind: 'position',
                          value: pos.position,
                        })
                      }}
                    >
                      Draft
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>

      {/* Completion Modal / Dialog */}
      {draftState.isComplete && (
        <div className="draft-complete-modal-overlay">
          <div className="draft-complete-card">
            <h2 className="complete-title">Draft Complete</h2>
            <p className="complete-body">
              All players have drafted their faction, map slice, and speaker/seat position.
              The galaxy is ready to assemble.
            </p>

            <div className="complete-roster-list">
              {Array.from({ length: playerCount }, (_, seat) => {
                const pos = seat + 1
                const entry = Object.entries(draftState.picks).find(([, p]) => p.position === pos)
                if (!entry) return null
                const pIdx = Number(entry[0])
                const pick = entry[1]
                const player = draftState.players[pIdx]
                const faction = pick.faction ? FACTIONS[pick.faction] : null
                const slice = draftState.slicesPool.find(s => s.id === pick.sliceId)

                return (
                  <div key={seat} className="complete-seat-row">
                    <span className="complete-seat-name" style={{ color: COLOUR_INK[player.color].tint }}>
                      Seat {seat + 1} {pos === 1 ? '⭐ ' : ''}{player.name}
                    </span>
                    <span className="complete-seat-picks">
                      {faction?.name} · {slice?.name}
                    </span>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              className="btn primary"
              data-testid="btn-launch-drafted-game"
              onClick={handleLaunch}
            >
              Launch Game with Drafted Galaxy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
