import { Tile } from './Tile'
import { TradePosts } from './TradePosts'
import { TRADE_POSTS } from '../../data/map'
import { FLOWER_MAP_SIZE, GALAXY_MAP_SIZE } from '../layout'
import { useMapPanZoom } from './useMapPanZoom'
import type { GameState } from '../../engine/types'

export interface BoardMapProps {
  state: GameState
  activeSystemId?: string | null
  selectable?: string[]
  /** Selectable systems no ship of the active seat can move into; they stay clickable but read as a dead end. */
  outOfReach?: string[]
  onSelect?: (systemId: string) => void
}

export function BoardMap({ state, activeSystemId = null, selectable = [], outOfReach = [], onSelect }: BoardMapProps) {
  const panZoom = useMapPanZoom()
  const isDuel = state.players.length <= 2 && TRADE_POSTS.west.every(id => Boolean(state.systems[id]))
  const mapSize = isDuel ? FLOWER_MAP_SIZE : GALAXY_MAP_SIZE

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
            width: `${mapSize.width}px`,
            height: `${mapSize.height}px`,
            ['--map-w' as string]: `${mapSize.width}px`,
            ['--map-h' as string]: `${mapSize.height}px`,
            transform: `translate(${panZoom.pan.x}px, ${panZoom.pan.y}px) scale(${panZoom.zoom})`,
            transformOrigin: 'center center',
            transition: panZoom.isDragging ? 'none' : 'transform 0.08s ease-out',
          }}
        >
          {Object.values(state.systems).map(system => (
            <Tile
              key={system.id}
              state={state}
              system={system}
              active={activeSystemId === system.id}
              selectable={selectable.includes(system.id)}
              outOfReach={outOfReach.includes(system.id)}
              isGalaxy={!isDuel}
              onSelect={onSelect}
            />
          ))}
          {isDuel && <TradePosts state={state} seat={state.active} />}
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
