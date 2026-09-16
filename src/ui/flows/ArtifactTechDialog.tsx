import { useState } from 'react'
import { canResearch, researchable, techSkipCandidates } from '../../engine/research'
import { findTech } from '../../data/techs'
import type { GameState, Move, Seat, TechColor } from '../../engine/types'
import { useGame } from '../store'
import { isAi } from '../../engine'
import { TechDrawer } from './TechDrawer'

interface Pick {
  techId: string | null
  skipPlanets: string[]
}

const NO_PICK: Pick = { techId: null, skipPlanets: [] }

/**
 * Ixthian Artifact, roll 6-10 (lrr-components.md): each player, in speaker order, MAY research up to 2
 * technologies. Prerequisites still apply, the first pick can satisfy the second's, and each technology-
 * specialty planet exhausted ignores one matching prerequisite (that planet readies at the end of the
 * agenda phase — the normal readying covers it). "May" also means picking nothing is legal.
 */
export function ArtifactTechDialog() {
  const { session, apply } = useGame()
  const [first, setFirst] = useState<Pick>(NO_PICK)
  const [second, setSecond] = useState<Pick>(NO_PICK)
  const [stage, setStage] = useState<1 | 2>(1)

  if (!session) return null
  const state: GameState = session.state
  const pending = state.pendingArtifactTechs
  if (!pending || pending.order.length === 0) return null
  const seat: Seat = pending.order[0]
  if (isAi(session.config, seat)) return null

  const player = state.players[seat]
  const skipsFor = (pick: Pick): TechColor[] => {
    const all = techSkipCandidates(state, seat)
    return pick.skipPlanets
      .map(id => all.find(c => c.planetId === id)?.colour)
      .filter((c): c is TechColor => c !== undefined)
  }

  // The second pick's legality is evaluated with the first pick already owned (lrr-components.md IA 1.1)
  const allowedFor = (stage: 1 | 2): string[] => {
    const owned = stage === 1 ? player.techs : [...player.techs, ...(first.techId ? [first.techId] : [])]
    const skips = stage === 1 ? skipsFor(first) : skipsFor(second)
    return researchable({ ...player, techs: owned }).filter(id => canResearch({ ...player, techs: owned }, id, false, skips))
  }

  const pick = stage === 1 ? first : second
  const setPick = (next: Pick) => (stage === 1 ? setFirst(next) : setSecond(next))

  const onPickTech = (techId: string) => {
    if (stage === 1) {
      setFirst({ techId, skipPlanets: [] })
      setStage(2)
    } else {
      setSecond({ techId, skipPlanets: [] })
    }
  }

  const toggleSkip = (planetId: string) => {
    const cur = pick
    const has = cur.skipPlanets.includes(planetId)
    setPick({ ...cur, skipPlanets: has ? cur.skipPlanets.filter(id => id !== planetId) : [...cur.skipPlanets, planetId] })
  }

  const submit = (move: Move) => {
    apply(move)
    setFirst(NO_PICK)
    setSecond(NO_PICK)
    setStage(1)
  }

  const buildMove = (): Move => ({
    type: 'artifactTechs',
    ...(first.techId ? { techId: first.techId, techSkipPlanets: first.skipPlanets } : {}),
    ...(second.techId ? { secondTechId: second.techId, secondTechSkipPlanets: second.skipPlanets } : {}),
  })

  const skipCandidates = techSkipCandidates(state, seat)
  const nameOf = (id: string) => findTech(id)?.name ?? id
  const remaining = pending.order.length

  return (
    <div className="reaction-modal-overlay" data-testid="artifact-tech-overlay">
      <div className="dialog" data-testid="artifact-tech-dialog" style={{ maxWidth: 920, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="in" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="dhead">
            <div>
              <span className="tab" style={{ color: '#fde047' }}>Ixthian Artifact · Research</span>
              <div className="sub" style={{ marginTop: 2 }}>
                {player.name} — you may research up to 2 technologies, free (prerequisites still apply; the
                first pick can satisfy the second's). {remaining > 1 ? `${remaining - 1} other player${remaining > 2 ? 's' : ''} pick after you.` : 'You are the last to pick.'}
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 4px 0' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 4 }}>
              Pick {stage} of 2 {pick.techId ? `— ${nameOf(pick.techId)}` : '— choose a technology, or skip'}
            </div>
            {skipCandidates.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {skipCandidates.map(c => (
                  <button
                    key={c.planetId}
                    type="button"
                    data-testid={`artifact-skip-${c.planetId}`}
                    onClick={() => toggleSkip(c.planetId)}
                    style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${pick.skipPlanets.includes(c.planetId) ? '#eab308' : '#475569'}`,
                      background: pick.skipPlanets.includes(c.planetId) ? 'rgba(234,179,8,0.18)' : 'transparent',
                      color: pick.skipPlanets.includes(c.planetId) ? '#fde047' : '#94a3b8',
                    }}
                    title="Exhaust this technology-specialty planet to ignore one matching prerequisite"
                  >
                    ⊘ {c.planetId} ({c.colour})
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
              <TechDrawer state={state} seat={seat} allowed={allowedFor(stage)} selected={pick.techId} onSelect={onPickTech} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 10 }}>
            {stage === 2 && second.techId ? (
              <button type="button" className="btn" data-testid="artifact-undo-second" onClick={() => setSecond(NO_PICK)}>
                Unpick {nameOf(second.techId)}
              </button>
            ) : null}
            <button type="button" className="btn" data-testid="artifact-skip-all" onClick={() => submit({ type: 'artifactTechs' })}>
              Pick nothing
            </button>
            <button
              type="button" className="btn primary" data-testid="artifact-confirm"
              disabled={stage === 1 ? !first.techId : !second.techId}
              onClick={() => submit(buildMove())}
            >
              {first.techId === null ? 'Pick nothing' : stage === 1 ? 'Research 1 technology' : `Research 2 technologies`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
