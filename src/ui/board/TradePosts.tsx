import { TRADE_POSTS } from '../../data/map'
import { POST_POS } from '../layout'
import type { GameState, Seat } from '../../engine/types'

const NAMES = { west: 'Kasda Exchange', east: 'Vorhal Freeport' } as const

function stateLine(state: GameState, seat: Seat, post: 'west' | 'east'): string {
  const linked = TRADE_POSTS[post].some(id => state.systems[id].planets.some(p => p.owner === seat))
  if (!linked) return `Locked for you: hold a planet in the ${post}`
  return state.players[seat].tradedThisRound[post] ? 'Used this round' : 'Open: 1 trade left'
}

/** R8: two neutral posts outside the map; not systems, so they are drawn as panels, not hexes. */
export function TradePosts({ state, seat }: { state: GameState; seat: Seat }) {
  return (
    <>
      {(['west', 'east'] as const).map(post => (
        <div key={post} className={`post ${post}`} style={POST_POS[post]} data-testid={`post-${post}`}>
          <div className="in">
            <span className="tab">{NAMES[post]}</span>
            <div className={`station ${post}`} aria-hidden="true" />
            <div className="desc">2 commodities for 2 trade goods, once per round</div>
            <span className="chip gold" data-testid={`post-state-${post}`}>{stateLine(state, seat, post)}</span>
          </div>
        </div>
      ))}
    </>
  )
}
