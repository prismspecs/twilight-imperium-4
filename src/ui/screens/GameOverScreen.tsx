import { objectiveDef } from '../../data/objectives'
import { LogPanel } from '../LogPanel'
import { navigate } from '../route'
import { useGame } from '../store'
import { useFitScale } from '../useViewportScale'
import type { Seat } from '../../engine/types'
import { SpaceBackdrop } from '../SpaceBackdrop'

export function GameOverScreen() {
  const fit = useFitScale()
  const { session, abandon } = useGame()
  const winnerSeat = session ? session.state.winner : null
  if (!session || winnerSeat === null) return null
  // `winnerSeat`, not `state.winner`: strict mode's narrowing of `session.state.winner === null` above
  // doesn't survive re-reading the same field off the `state` alias below.
  const state = session.state
  const winner = state.players[winnerSeat]
  return (
    <div className="setup" data-testid="game-over" style={{ zoom: fit }}>
      <SpaceBackdrop />
      <header className="hero">
        <h1 className="title goldtext" data-testid="winner">{winner.name} wins</h1>
        <p className="tagline" data-testid="final-score">
          {state.players.length <= 2
            ? `${state.players[0].name} ${state.players[0].vp} victory points, ${state.players[1].name} ${state.players[1].vp}`
            : state.players.map(p => `${p.name} ${p.vp} VP`).join(' · ')}
        </p>
      </header>
      <div className="seats">
        {state.players.map((_, i) => i as Seat).map(seat => (
          <div className="cut seat" key={seat}>
            <div className="in">
              <div className="lbl">{state.players[seat].name}</div>
              <div data-testid={`scored-list-${seat}`}>
                {state.players[seat].scoredObjectives.map(id => objectiveDef(id)?.text ?? id).join(', ') || 'No public objective scored'}
              </div>
              {state.players[seat].scoredMandates.map(id => <div key={id}>{objectiveDef(id)?.short ?? id}</div>)}
            </div>
          </div>
        ))}
      </div>
      <LogPanel state={state} />
      <div className="setup-foot">
        <button type="button" className="btn gold" data-testid="btn-new-game" onClick={() => { abandon(); navigate('#/') }}>
          New game
        </button>
      </div>
    </div>
  )
}
