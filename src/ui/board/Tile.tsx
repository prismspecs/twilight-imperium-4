import { useRef, type CSSProperties } from 'react'
import { BADGE, COLOUR_INK, MISC, SIGIL, ownerKey, planetArtUrl, planetTrait, tileNumberLabel, tileUrl, tokenUrl } from '../art'
import {
  ACTIVATION_SIZE, ACTIVATION_SPOT, GALAXY_ORIGIN, PLATE_VALS_W, SIGIL_SIZE, SIGIL_SPOT,
  TILE_H, TILE_NUMBER_SPOT, TILE_POS, TILE_W, WORMHOLE_SIZE, fleetScale,
  getPlanetCentre, getPlanetSpot, getSpaceBox, getWormholeSpot, hexToPixel,
} from '../layout'
import { UnitStack, groupUnits } from './UnitStack'
import { diagnoseMovement } from '../debugLogger'
import { productionLimit, shipsThatCanReach } from '../../engine'
import { FACTIONS } from '../../data/factions'
import type { Color, GameState, Owner, Planet, System } from '../../engine/types'

const HEX = '58,1 174,1 231,100.5 174,200 58,200 1,100.5'
/** Inset hex points for thick borders that stay inside the hex boundary without being clipped by .tile clip-path */
const INSET_HEX = '59.5,3.2 172.5,3.2 228.8,100.5 172.5,197.8 59.5,197.8 3.2,100.5'

/** AsyncTI4/ti4_web_new's SystemHexTarget.tsx: a pan that ends over a tile still fires click, so the tile
 * checks its own pointerdown-to-click travel rather than relying on a shared, timing-based "just panned"
 * flag from the pan/zoom handler - the map's own drag threshold is for when panning itself should start. */
const CLICK_DRAG_TOLERANCE = 14

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
      {/* The generated galaxy's tile art is the AsyncTI4 catalog face: name, resource hexagon and
       * influence shield are already printed on it (public/assets/tiles/NN_Name.png), so this nameplate
       * would only duplicate static art. The fixed duel map still renders a plain background
       * (00_blue.png, see tileUrl) with the planet composed on top, so it still needs its own nameplate. */}
      {isGalaxy ? null : (
        <span className={`plate ${planetTrait(planet.id, planet.trait)}${spot.plate.flip ? ' flip' : ''}${planet.exhausted ? ' exh' : ''}`}
          data-testid={`plate-${planet.id}`} style={plateStyle}>
          <span className="vals">
            <span className="badge res" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.resourceExhausted : BADGE.resourceReady})` }}>{planet.resources}</span>
            <span className="badge inf" style={{ backgroundImage: `url(${planet.exhausted ? BADGE.influenceExhausted : BADGE.influenceReady})` }}>{planet.influence}</span>
          </span>
          <span className="nm">{planet.name}<i className="em" /></span>
        </span>
      )}
      <span className="row-ground" style={{ left: centre.left, top: centre.top }} data-testid={`ground-row-${planet.id}`}>
        {planet.owner !== null ? (() => {
          const ownerPlayer = state.players[planet.owner]
          const ownerInk = ownerPlayer ? COLOUR_INK[ownerPlayer.color] : undefined
          return (
            <span
              className="ctl-wrapper"
              title={`Controlled by ${ownerPlayer?.name ?? `Player ${planet.owner + 1}`} (${ownerPlayer ? FACTIONS[ownerPlayer.faction].name : ''})`}
              style={{
                borderColor: ownerInk?.accent ?? 'transparent',
                boxShadow: ownerInk?.glow ? `0 0 5px ${ownerInk.glow}` : undefined,
              }}
            >
              <img
                className="ctl"
                src={tokenUrl(ownerPlayer ? ownerPlayer.faction : 'l1z1x', 'control')}
                alt="control"
                data-testid={`control-${planet.id}`}
                width={26}
              />
              {ownerPlayer && (
                <img
                  className="ctl-sigil"
                  src={SIGIL[ownerPlayer.faction]}
                  alt=""
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </span>
          )
        })() : null}
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
  isPlayerHome?: boolean
  onSelect?: (systemId: string) => void
  /** Not currently selectable for an action - clicking it instead opens the system's info panel. */
  onInspect?: (systemId: string) => void
}

export function Tile({ state, system, active, selectable, outOfReach = false, isGalaxy: isGalaxyProp, isPlayerHome = false, onSelect, onInspect }: TileProps) {
  const isGalaxy = isGalaxyProp ?? (state.players.length > 2)
  const pos = !isGalaxy && TILE_POS[system.id]
    ? TILE_POS[system.id]
    : hexToPixel(system.q ?? 0, system.r ?? 0, GALAXY_ORIGIN)
  // everything the system holds in space, ships and the fighters and infantry they carry, drawn inside
  // the tile's own space box and shrunk rather than allowed to spill out of it
  const box = getSpaceBox(system.id, system.planets.length)
  const fleet = groupUnits(system.space)
  const scale = fleetScale(fleet.length, box)
  const isHomeTurn = system.home !== null && system.home === state.active && state.winner === null
  const homeOwner = system.home !== null ? state.players[system.home] : undefined
  const homeInk = homeOwner ? COLOUR_INK[homeOwner.color] : undefined
  const home = system.home === null ? '' : ` home-${system.home}`
  const playerHomeClass = isPlayerHome ? ' player-home-hex' : ''
  const homeTurnClass = isHomeTurn ? ' turn-active-home' : ''
  // a selectable tile is a control, so it takes focus and answers to Enter and Space like a button
  const activate = selectable && onSelect ? () => onSelect(system.id) : undefined
  const inspect = onInspect ? () => onInspect(system.id) : undefined
  const act = activate ?? inspect
  const classes = `tile${home}${playerHomeClass}${homeTurnClass}${active ? ' active' : ''}${selectable ? ' selectable' : ''}${selectable && outOfReach ? ' outofreach' : ''}${act ? ' hoverable' : ''}`
  const guardians = system.space.some(u => u.owner === 'guardian')
  const reachDiag = selectable && outOfReach ? diagnoseMovement(state, state.active, system.id).join('\n') : undefined
  const canProduce = selectable && productionLimit(state, state.active, system.id) > 0
  const canReach = selectable && shipsThatCanReach(state, state.active, system.id).length > 0
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const activeColor = state.players[state.active] ? COLOUR_INK[state.players[state.active].color] : undefined
  const tileStyle: CSSProperties = {
    left: pos.left,
    top: pos.top,
    width: TILE_W,
    height: TILE_H,
    ...(homeInk ? {
      '--home-hex-stroke': homeInk.accent,
      '--home-hex-glow': homeInk.glow,
      '--home-hex-tint': homeInk.tint,
    } as CSSProperties : {}),
    ...(active && activeColor ? {
      '--active-hex-stroke': activeColor.accent,
      '--active-hex-glow': activeColor.glow,
      '--active-hex-tint': activeColor.tint,
    } as CSSProperties : {}),
  }
  const actAriaLabel = act
    ? (activate
      ? (canProduce && !canReach
        ? `Activate ${system.name} to produce`
        : `Activate ${system.name}${outOfReach ? ', no ship in range' : ''}`)
      : `View ${system.name}${isPlayerHome ? ' (Your home system)' : ''}`)
    : (isPlayerHome ? `Your home system: ${system.name}` : undefined)
  const titleText = reachDiag ?? (isPlayerHome ? `Your Home System (${system.name})` : undefined)
  return (
    <div
      className={classes} data-testid={`tile-${system.id}`}
      style={tileStyle}
      role={act ? 'button' : undefined}
      tabIndex={act ? 0 : undefined}
      title={titleText}
      aria-label={actAriaLabel}
      onPointerDown={act ? event => { pointerDown.current = { x: event.clientX, y: event.clientY } } : undefined}
      onClick={act
        ? event => {
          const down = pointerDown.current
          pointerDown.current = null
          if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_DRAG_TOLERANCE) return
          act()
        }
        : undefined}
      onKeyDown={act
        ? event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          act()
        }
        : undefined}
    >
      <img className="hex" src={tileUrl(system.id, system.tile, isGalaxy)} alt={system.name} width={TILE_W} height={TILE_H} data-testid={`hex-${system.id}`} draggable={false} />
      <svg className="line" viewBox={`0 0 ${TILE_W} ${TILE_H}`}>
        <polygon points={HEX} />
        {isPlayerHome && (
          <polygon
            className="player-home-line"
            points={INSET_HEX}
            data-testid={`player-home-border-${system.id}`}
          />
        )}
        {isHomeTurn && !isPlayerHome && (
          <polygon
            className="turn-home-line"
            points={INSET_HEX}
            data-testid={`turn-home-border-${system.id}`}
          />
        )}
      </svg>
      {tileNumberLabel(system.q, system.r) ? (
        <span className="tile-number" data-testid={`tile-number-${system.id}`}
          style={{ left: TILE_NUMBER_SPOT.left, top: TILE_NUMBER_SPOT.top }}>
          {tileNumberLabel(system.q, system.r)}
        </span>
      ) : null}
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
          {system.activatedBy.map(seat => {
            const actPlayer = state.players[seat]
            const actInk = actPlayer ? COLOUR_INK[actPlayer.color] : undefined
            return (
              <span
                key={seat}
                className="act-wrapper"
                title={`Activated by ${actPlayer?.name ?? `Player ${seat + 1}`} (${actPlayer ? FACTIONS[actPlayer.faction].name : ''})`}
                style={{
                  borderColor: actInk?.accent ?? 'rgba(255, 255, 255, 0.4)',
                  boxShadow: actInk?.glow ? `0 0 6px ${actInk.glow}, 0 2px 4px rgba(0,0,0,0.8)` : undefined,
                }}
              >
                <img
                  className="act"
                  src={tokenUrl(actPlayer ? actPlayer.faction : 'l1z1x', 'command')}
                  width={ACTIVATION_SIZE}
                  alt={`${actPlayer ? actPlayer.name : `Seat ${seat}`} command token`}
                  data-testid={`activation-${system.id}-${seat}`}
                />
                {actPlayer && (
                  <img
                    className="act-sigil"
                    src={SIGIL[actPlayer.faction]}
                    alt=""
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                )}
              </span>
            )
          })}
        </span>
      ) : null}
      {system.wormhole ? (
        <img className="wh" src={system.wormhole === 'alpha' ? MISC.alpha : (system.wormhole === 'beta' ? MISC.beta : MISC.delta)} alt={`${system.wormhole} wormhole`}
          data-testid={`wormhole-${system.id}`} style={getWormholeSpot(system.id, system.home !== null)} width={WORMHOLE_SIZE} height={WORMHOLE_SIZE} />
      ) : null}
      {system.home !== null ? (
        <img
          className="sigil"
          src={SIGIL[state.players[system.home].faction]}
          alt=""
          data-testid={`sigil-${system.id}`}
          style={{ left: SIGIL_SPOT.left, top: SIGIL_SPOT.top }}
          width={SIGIL_SIZE}
          height={SIGIL_SIZE}
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
        />
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
      {selectable && canProduce && !canReach ? (
        <span className="canproduce" data-testid={`canproduce-${system.id}`}>Produce here</span>
      ) : null}
    </div>
  )
}
