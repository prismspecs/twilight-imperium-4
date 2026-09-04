import { Tile } from './Tile'
import { TradePosts } from './TradePosts'
import { TRADE_POSTS } from '../../data/map'
import { FLOWER_MAP_SIZE, GALAXY_MAP_SIZE } from '../layout'
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
  const isDuel = state.players.length <= 2 && TRADE_POSTS.west.every(id => Boolean(state.systems[id]))
  const mapSize = isDuel ? FLOWER_MAP_SIZE : GALAXY_MAP_SIZE

  return (
    <div
      className="map"
      data-testid="board-map"
      style={{
        width: `${mapSize.width}px`,
        height: `${mapSize.height}px`,
        ['--map-w' as string]: `${mapSize.width}px`,
        ['--map-h' as string]: `${mapSize.height}px`,
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
          onSelect={onSelect}
        />
      ))}
      {isDuel && <TradePosts state={state} seat={state.active} />}
    </div>
  )
}
