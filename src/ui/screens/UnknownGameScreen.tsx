import { navigate } from '../route'
import { useFitScale } from '../useViewportScale'
import '../setup.css'

/**
 * `#/g/<code>` for a game this browser does not hold. A game lives in the storage of the browser it was
 * started in, so the honest answer is that it is elsewhere; sharing a game between devices needs the
 * online lobby, which is not here yet. Nothing about this screen pretends otherwise.
 */
export function UnknownGameScreen({ code }: { code: string }) {
  const fit = useFitScale()
  return (
    <div className="setup lobbyui" data-testid="unknown-game" style={{ zoom: fit }}>
      <div className="space">
        <div className="base" /><div className="stars" /><div className="galaxy a" /><div className="galaxy b" />
        <div className="veil" /><div className="dust" /><div className="limb" /><div className="vig" />
      </div>

      <header className="hero">
        <h1 className="title goldtext">Mecatol Online</h1>
        <div className="rule"><span /><i className="dia" /><span /></div>
      </header>

      <section className="box notfound">
        <div className="frame panel">
          <h2 className="nf-head goldtext" data-testid="unknown-head">This game is not on this device</h2>
          <p className="line">
            Games are saved in the browser they were started in. Ask for the device that started it, or start a new game.
          </p>
          <div className="foot">
            <button type="button" className="btn gold" data-testid="btn-lobby" onClick={() => { navigate('#/') }}>
              Back to the lobby
            </button>
            <span className="note">Two devices, one game: coming with online play</span>
          </div>
        </div>
        <div className="tab"><b>Code</b>&nbsp; {code}</div>
      </section>
    </div>
  )
}
