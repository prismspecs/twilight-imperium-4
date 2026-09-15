// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { neighbours } from '../../engine/adjacency'
import { toActionPhase } from '../../engine/testUtils'
import type { GameState } from '../../engine/types'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'
import { reachPreview } from '../reach'

/** A system two steps from seat 0's home with no fleet in the way, plus the hop on the way there. */
function twoHopsFromHome(state: GameState): { mid: string; far: string } | null {
  const home = Object.values(state.systems).find(s => s.home === 0)?.id
  if (home === undefined) return null
  for (const mid of neighbours(state.systems, home)) {
    for (const far of neighbours(state.systems, mid)) {
      if (far === home) continue
      if (state.systems[far].activatedBy.includes(0)) continue
      if (state.systems[far].space.some(u => u.owner !== 0)) continue
      return { mid, far }
    }
  }
  return null
}

describe('reachPreview: the activation step must not close doors a held card opens', () => {
  it('a system two hops away is out of reach for a move-1 fleet — and in range with Flank Speed in hand', () => {
    const base = toActionPhase()
    const hops = twoHopsFromHome(base)
    if (!hops) throw new Error('no two-hop system in the fixture galaxy')
    // without any help the far system is beyond the seat's move-1 ships and nothing in hand changes that
    const bare = reachPreview(base, 0, hops.far)
    expect(bare.reachable).toBe(false)
    expect(bare.via).toEqual([])
    // the same seat holding Flank Speed must see the far system as in range with the card
    const holding = { ...base, players: [{ ...base.players[0], actionCards: ['flank_speed_1'] }, base.players[1]] }
    const withCard = reachPreview(holding, 0, hops.far)
    expect(withCard.reachable).toBe(false)   // not until the card is actually played into the window
    expect(withCard.via).toEqual(['Flank Speed'])
    // and the hop on the way is plain reachable
    expect(reachPreview(holding, 0, hops.mid).reachable).toBe(true)
  })

  it('UI: a far tile with Flank Speed in hand offers the play instead of saying no ship is in range', () => {
    const base = toActionPhase()
    const hops = twoHopsFromHome(base)
    if (!hops) throw new Error('no two-hop system in the fixture galaxy')
    const holding = { ...base, players: [{ ...base.players[0], actionCards: ['flank_speed_1'] }, base.players[1]] }
    renderWithSession(holding, <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-tactical'))
    // no "No ship in range" door-slam on the far tile: the badge names the way in
    expect(screen.queryByTestId(`noreach-${hops.far}`)).toBeNull()
    expect(screen.getByTestId(`canreach-${hops.far}`).textContent).toContain('Flank Speed')
    // activating it works, and the activation's reaction window offers Flank Speed
    fireEvent.click(screen.getByTestId(`tile-${hops.far}`))
    const play = screen.getByTestId('reaction-play-flank_speed_1-0')
    fireEvent.click(play)
    // the card applied: the movement step is live and the home fleet is now movable into the far system
    expect(screen.getByTestId('movement-panel')).toBeTruthy()
    expect(screen.getByTestId('ship-home-0-carrier')).toBeTruthy()
  })
})
