import { useState } from 'react'
import { Tile } from './Tile'
import { GALAXY_MAP_SIZE } from '../layout'
import { useMapPanZoom } from './useMapPanZoom'
import type { GameState, Seat } from '../../engine/types'

export interface BoardMapProps {
  state: GameState
  activeSystemId?: string | null
  selectable?: string[]
  /** Selectable systems no ship of the active seat can move into; they stay clickable but read as a dead end. */
  outOfReach?: string[]
  humanSeat?: Seat
  /** The system a card or panel is currently naming as its target, so the player can see where it is. */
  highlightedSystemId?: string | null
  onSelect?: (systemId: string) => void
  /** Any system not currently selectable for an action opens its info panel here instead. */
  onInspect?: (systemId: string) => void
  /** The mouse entered or left a tile - the side panel previews whichever faction owns a planet there. */
  onHover?: (systemId: string | null) => void
}

export function BoardMap({ state, activeSystemId = null, selectable = [], outOfReach = [], humanSeat, highlightedSystemId = null, onSelect, onInspect, onHover }: BoardMapProps) {
  const panZoom = useMapPanZoom()
  const [hoveredWormhole, setHoveredWormhole] = useState<'alpha' | 'beta' | 'delta' | null>(null)

  return (
    <>
      <div
        className="map-viewport"
        data-testid="map-viewport"
        onPointerDown={panZoom.onPointerDown}
        onPointerMove={panZoom.onPointerMove}
        onPointerUp={panZoom.onPointerUp}
        onWheel={panZoom.onWheel}
        style={{
          cursor: panZoom.isDragging ? 'grabbing' : 'grab',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          className="map"
          data-testid="board-map"
          style={{
            width: `${GALAXY_MAP_SIZE.width}px`,
            height: `${GALAXY_MAP_SIZE.height}px`,
            transform: `translate(${panZoom.pan.x}px, ${panZoom.pan.y}px) scale(${panZoom.zoom})`,
            transformOrigin: 'center center',
            transition: (panZoom.isDragging || panZoom.isWheeling) ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          {Object.values(state.systems).map(system => (
            <Tile
              key={system.id}
              state={state}
              system={system}
              active={activeSystemId === system.id}
              highlighted={highlightedSystemId === system.id}
              selectable={selectable.includes(system.id)}
              outOfReach={outOfReach.includes(system.id)}
              isGalaxy={true}
              isPlayerHome={system.home !== null && (humanSeat !== undefined ? system.home === humanSeat : system.home === 0)}
              onSelect={onSelect}
              onInspect={onInspect}
              onHover={onHover}
              wormholeHighlighted={hoveredWormhole !== null && hoveredWormhole === system.wormhole}
              onHoverWormhole={setHoveredWormhole}
            />
          ))}
        </div>
      </div>
      <div className="map-controls" data-testid="map-controls">
        <button
          type="button"
          className="btn-map-control"
          data-testid="zoom-in"
          title="Zoom In"
          onClick={panZoom.zoomIn}
        >
          +
        </button>
        <button
          type="button"
          className="btn-map-control"
          data-testid="zoom-out"
          title="Zoom Out"
          onClick={panZoom.zoomOut}
        >
          −
        </button>
        <button
          type="button"
          className="btn-map-control reset"
          data-testid="zoom-reset"
          title="Reset View / Fit"
          onClick={panZoom.resetView}
        >
          Fit
        </button>
      </div>
    </>
  )
}
