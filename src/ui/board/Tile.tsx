import { BADGE, MISC, SIGIL, ownerKey, planetArtUrl, planetTrait, tileUrl, tokenUrl } from '../art'
import {
  ACTIVATION_SIZE, ACTIVATION_SPOT, GALAXY_ORIGIN, PLATE_VALS_W, SIGIL_SIZE, SIGIL_SPOT,
  TILE_H, TILE_POS, TILE_W, WORMHOLE_SIZE, fleetScale,
  getPlanetCentre, getPlanetSpot, getSpaceBox, getWormholeSpot, hexToPixel,
} from '../layout'
import { UnitStack, groupUnits } from './UnitStack'
import { diagnoseMovement } from '../debugLogger'
import type { Color, GameState, Owner, Planet, System } from '../../engine/types'

const HEX = '58,1 174,1 231,100.5 174,200 58,200 1,100.5'

function colourOf(state: GameState, owner: Owner): Color | 'grey' {
  return owner === 'guardian' ? 'grey' : state.players[owner].color
}

/** How far off the planet's centre the structures row sits, on the side the nameplate leaves free. */
const STRUCT_OFFSET = 34

function PlanetMarkers({ state, planet, index, count, isGalaxy }: { state: GameState; planet: Planet; index: number; count: number; isGalaxy: boolean }) {
  const spot = getPlanetSpot(planet.id, index, count)
  const centre = getPlanetCentre(planet.id, spot)
  const art = isGalaxy ? null : planetArtUrl(planet.id)
  const ground = groupUnits(planet.ground)
  const structures = groupUnits(planet.structures)
  // the printed banner runs along the top of an upper planet and the bottom of a lower one; the space
  // dock and the PDS take the other side, so neither ever sits on the name or on the landed infantry
  const plateOnTop = spot.plate.top < centre.top
  const plateStyle = spot.plate.flip
    ? { right: TILE_W - (spot.plate.left + PLATE_VALS_W), top: spot.plate.top }
    : { left: spot.plate.left, top: spot.plate.top }
  return (
    <>
      {art ? (
        <img className="planet" src={art} alt={planet.name} data-testid={`planet-art-${planet.id}`}
          style={{ left: spot.art.left, top: spot.art.top, width: spot.art.width, height: spot.art.height }} />
      ) : null}
      <span className={`plate ${planetTrait(planet.id, planet.trait)}${spot.plate.flip ? ' flip' : ''}${planet.exhausted ? ' exh' : ''}`}
        data-testid={`plate-${planet.id}`} style={plateStyle}>
        <span className="vals">
          <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
          <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
        </span>
        <span className="nm">{planet.name}<i className="em" /></span>
      </span>
      <span className="row-ground" style={{ left: centre.left, top: centre.top }} data-testid={`ground-row-${planet.id}`}>
        {planet.owner !== null ? (
          <img className="ctl" src={tokenUrl(state.players[planet.owner].faction, 'control')} alt="control"
            data-testid={`control-${planet.id}`} width={26} />
        ) : null}
        {ground.map(group => (
          <span key={`${ownerKey(group.owner)}-${group.type}`} data-testid={`ground-${planet.id}-${ownerKey(group.owner)}-${group.type}`}>
            <UnitStack group={group} colour={colourOf(state, group.owner)}
              testId={`${planet.id}-${ownerKey(group.owner)}-${group.type}`} alwaysCount />
          </span>
        ))}
      </span>
      <span className="row-structures" data-testid={`structure-row-${planet.id}`}
        style={{ left: centre.left, top: centre.top + (plateOnTop ? STRUCT_OFFSET : -STRUCT_OFFSET) }}>
        {structures.map(group => (
          <span key={`${ownerKey(group.owner)}-${group.type}`} data-testid={`structure-${planet.id}-${ownerKey(group.owner)}-${group.type}`}>
            <UnitStack group={group} colour={colourOf(state, group.owner)}
              testId={`s-${planet.id}-${ownerKey(group.owner)}-${group.type}`} />
          </span>
        ))}
      </span>
    </>
  )
}

export interface TileProps {
  state: GameState
  system: System
  active: boolean
  selectable: boolean
  /** Selectable, but no ship can move in; the outline goes cold and the tile says so. */
  outOfReach?: boolean
  isGalaxy?: boolean
  onSelect?: (systemId: string) => void
}

export function Tile({ state, system, active, selectable, outOfReach = false, isGalaxy: isGalaxyProp, onSelect }: TileProps) {
  const isGalaxy = isGalaxyProp ?? (state.players.length > 2)
  const pos = !isGalaxy && TILE_POS[system.id]
    ? TILE_POS[system.id]
    : hexToPixel(system.q ?? 0, system.r ?? 0, GALAXY_ORIGIN)
  // everything the system holds in space, ships and the fighters and infantry they carry, drawn inside
  // the tile's own space box and shrunk rather than allowed to spill out of it
  const box = getSpaceBox(system.id, system.planets.length)
  const fleet = groupUnits(system.space)
  const scale = fleetScale(fleet.length, box)
  const home = system.home === null ? '' : ` home-${system.home}`
  const classes = `tile${home}${active ? ' active' : ''}${selectable ? ' selectable' : ''}${selectable && outOfReach ? ' outofreach' : ''}`
  const guardians = system.space.some(u => u.owner === 'guardian')
  // a selectable tile is a control, so it takes focus and answers to Enter and Space like a button
  const activate = selectable && onSelect ? () => onSelect(system.id) : undefined
  const reachDiag = selectable && outOfReach ? diagnoseMovement(state, state.active, system.id).join('\n') : undefined
  return (
    <div
      className={classes} data-testid={`tile-${system.id}`}
      style={{ left: pos.left, top: pos.top, width: TILE_W, height: TILE_H }}
      role={activate ? 'button' : undefined}
      tabIndex={activate ? 0 : undefined}
      title={reachDiag}
      aria-label={activate ? `Activate ${system.name}${outOfReach ? ', no ship in range' : ''}` : undefined}
      onClick={activate}
      onKeyDown={activate
        ? event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          activate()
        }
        : undefined}
    >
      <img className="hex" src={tileUrl(system.id, system.tile, isGalaxy)} alt={system.name} width={TILE_W} height={TILE_H} data-testid={`hex-${system.id}`} />
      <svg className="line" viewBox={`0 0 ${TILE_W} ${TILE_H}`}><polygon points={HEX} /></svg>
      {system.planets.map((planet, i) => (
        <PlanetMarkers key={planet.id} state={state} planet={planet} index={i} count={system.planets.length} isGalaxy={isGalaxy} />
      ))}
      <span className="fleet" data-testid={`fleet-${system.id}`}
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
        <span className="in" style={{ zoom: scale, width: box.width / scale, maxHeight: box.height / scale }}>
          {fleet.map(group => (
            <UnitStack key={`${ownerKey(group.owner)}-${group.type}`} group={group} colour={colourOf(state, group.owner)}
              testId={`${system.id}-${ownerKey(group.owner)}-${group.type}`} />
          ))}
        </span>
      </span>
      {system.activatedBy.length > 0 ? (
        <span className="acts" style={{ left: ACTIVATION_SPOT.left, top: ACTIVATION_SPOT.top }}>
          {system.activatedBy.map(seat => (
            <img key={seat} className="act" src={tokenUrl(state.players[seat].faction, 'command')} width={ACTIVATION_SIZE}
              alt={`${state.players[seat].name} command token`} data-testid={`activation-${system.id}-${seat}`} />
          ))}
        </span>
      ) : null}
      {system.wormhole ? (
        <img className="wh" src={system.wormhole === 'alpha' ? MISC.alpha : (system.wormhole === 'beta' ? MISC.beta : MISC.delta)} alt={`${system.wormhole} wormhole`}
          data-testid={`wormhole-${system.id}`} style={getWormholeSpot(system.id, system.home !== null)} width={WORMHOLE_SIZE} height={WORMHOLE_SIZE} />
      ) : null}
      {system.home !== null ? (
        <img className="sigil" src={SIGIL[state.players[system.home].faction]} alt="" data-testid={`sigil-${system.id}`}
          style={{ left: SIGIL_SPOT.left, top: SIGIL_SPOT.top }} width={SIGIL_SIZE} height={SIGIL_SIZE} />
      ) : null}
      {state.custodiansToken && (system.id === 'mecatol' || system.planets.some(p => p.id === 'mecatol-rex' || p.id === 'mecatolrex')) ? (
        <img
          className="custodians-token"
          src="/assets/tokens/token_custodian.png"
          alt="Custodians Token"
          data-testid="custodians-token"
          style={{
            position: 'absolute',
            left: '148px',
            top: '120px',
            width: '48px',
            height: '48px',
            transform: 'translate(-50%, -50%)',
            zIndex: 6,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.85))',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {guardians ? <span className="guard" data-testid="guardian-label">Guardian fleet, worth 8</span> : null}
      {selectable && outOfReach ? (
        <span className="noreach" data-testid={`noreach-${system.id}`}>No ship in range</span>
      ) : null}
    </div>
  )
}
