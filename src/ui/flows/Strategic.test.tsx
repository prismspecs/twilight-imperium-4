// src/ui/flows/Strategic.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cardsUsed, toActionPhase, toStatusPhase, withCards, withPlanetOwner, withPlayer } from '../../engine/testUtils'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

function playCard(card: string) {
  fireEvent.click(screen.getByTestId('btn-strategic'))
  fireEvent.click(screen.getByTestId(`strategic-pick-${card}`))
}

describe('strategic actions', () => {
  it('R3.2: only ready cards of the active seat are offered', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, ['imperial'])
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-strategic'))
    expect(screen.getByTestId('strategic-pick-leadership')).toBeTruthy()
    expect(screen.queryByTestId('strategic-pick-imperial')).toBeNull()
  })

  it('R6 Leadership: the primary gives three command tokens and opens the secondary window', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('leadership')
    // the three new tokens start unplaced, so the player puts each one where they want it
    expect(screen.getByTestId('token-tactic').textContent).toBe('3')
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(true)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('token-tactic-plus'))
    expect(screen.getByTestId('token-tactic').textContent).toBe('6')
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('6')
    expect(screen.getByTestId('secondary-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('btn-secondary-decline'))
    expect(screen.queryByTestId('secondary-panel')).toBeNull()
    // R3.2: the action is over and this seat has no free move left, so the turn ends by itself rather
    // than sending the device back for one dead click
    expect(screen.getByTestId('turn-1').textContent).toBe('Your turn')
  })

  it('R5: the Technology primary researches the technology chosen in the drawer', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['technology']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('technology')
    expect(screen.getByTestId('tech-card-plasma_scoring').className).toContain('owned')
    expect(screen.getByTestId('tech-card-assault_cannon').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('tech-card-sarween_tools'))
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('tech-0-sarween_tools').textContent).toBe('Sarween Tools')
  })

  it('R5: the Technology secondary opens in the wide drawer, so the unit-upgrade and faction column is not clipped', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['technology']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('technology')
    fireEvent.click(screen.getByTestId('tech-card-sarween_tools'))
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('secondary-panel').className).toContain('drawer full')
    expect(screen.getByTestId('tech-card-infantry_ii')).toBeTruthy()
  })

  it('closes the strategic dialog on Escape, the same way Cancel does', () => {
    const s = withCards(withCards(toActionPhase(), 0, ['leadership']), 1, [])
    renderWithSession(s, <BoardScreen />)
    playCard('leadership')
    expect(screen.getByTestId('strategic-dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('strategic-dialog')).toBeNull()
  })

  it('keeps the confirm button dead until the card has the parameter it needs', () => {
    const tech = withCards(withCards(toActionPhase(), 0, ['technology']), 1, [])
    const view = renderWithSession(tech, <BoardScreen />)
    playCard('technology')
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('tech-card-sarween_tools'))
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(false)
    view.unmount()

    const imperial = {
      ...withPlayer(withCards(withCards(toActionPhase(), 0, ['imperial']), 1, []), 0, { resourcesSpentThisRound: 8 }),
      publicObjectives: ['erect_a_monument'],
    }
    const view2 = renderWithSession(imperial, <BoardScreen />)
    playCard('imperial')
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('objective-pick-erect_a_monument'))
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(false)
    view2.unmount()

    const diplomacy = withCards(withCards(toActionPhase(), 0, ['diplomacy']), 1, [])
    renderWithSession(diplomacy, <BoardScreen />)
    playCard('diplomacy')
    const systems = screen.getAllByTestId(/^system-pick-/)
    expect(systems.length).toBeGreaterThan(0)
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(true)
    fireEvent.click(systems[0])
    expect(screen.getByTestId('btn-strategic-confirm').hasAttribute('disabled')).toBe(false)
  })

  it('R7: the Imperial primary scores a fulfilled public objective', () => {
    const s = {
      ...withPlayer(withCards(withCards(toActionPhase(), 0, ['imperial']), 1, []), 0, { resourcesSpentThisRound: 8 }),
      publicObjectives: ['erect_a_monument'],
    }
    renderWithSession(s, <BoardScreen />)
    playCard('imperial')
    fireEvent.click(screen.getByTestId('objective-pick-erect_a_monument'))
    fireEvent.click(screen.getByTestId('btn-strategic-confirm'))
    expect(screen.getByTestId('vp-0').textContent).toBe('1 of 7')
    expect(screen.getByTestId('scored-erect_a_monument-0')).toBeTruthy()
  })

  it('R8: a trade post sells two commodities for two trade goods without ending the turn', () => {
    const s = withPlanetOwner(cardsUsed(toActionPhase()), 'bereg', 'bereg', 0)
    renderWithSession(s, <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-component'))
    expect(screen.queryByTestId('btn-tradepost-west')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-tradepost-east'))
    expect(screen.getByTestId('economy-0-tradegoods').textContent).toBe('2')
    expect(screen.getByTestId('economy-0-commodities').textContent).toBe('0 of 2')
    expect(screen.getByTestId('turn-0').textContent).toBe('Your turn')
  })

  it('R3.3: the status dialog distributes the new command tokens, speaker first', () => {
    renderWithSession(toStatusPhase(toActionPhase()), <BoardScreen />)
    expect(screen.getByTestId('status-dialog').textContent).toContain('2 command tokens')
    expect(screen.getByTestId('token-tactic').textContent).toBe('3')
    fireEvent.click(screen.getByTestId('token-tactic-plus'))
    fireEvent.click(screen.getByTestId('token-fleet-plus'))
    fireEvent.click(screen.getByTestId('btn-status-confirm'))
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('4')
    expect(screen.getByTestId('tokens-0-fleet').textContent).toBe('4')
    expect(screen.getByTestId('turn-1').textContent).toBe('Your turn')
  })
})
