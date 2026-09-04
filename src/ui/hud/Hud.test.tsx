// src/ui/hud/Hud.test.tsx
// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine'
import { cardsUsed, toActionPhase, withPlayer } from '../../engine/testUtils'
import { renderWithSession } from '../test/harness'
import { BoardScreen } from '../screens/BoardScreen'

describe('the HUD', () => {
  it('shows both players with their faction, clock and turn state', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('player-0').textContent).toContain('L1Z1X Mindnet')
    expect(screen.getByTestId('player-1').textContent).toContain('Barony of Letnev')
    expect(screen.getByTestId('clock-0').textContent).toBe('15:00')
    expect(screen.getByTestId('turn-0').textContent).toBe('Your turn')
    expect(screen.getByTestId('turn-1').textContent).toBe('Waiting')
    expect(screen.getByTestId('speaker-0')).toBeTruthy()
    expect(screen.queryByTestId('speaker-1')).toBeNull()
  })

  it('R3.1: the strategy strip shows who holds each card and what it is worth', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('strategy-state-warfare').textContent).toBe('A, ready')
    expect(screen.getByTestId('strategy-state-leadership').textContent).toBe('B, ready')
    expect(screen.getByTestId('strategy-state-trade').textContent).toBe('unpicked, 1 trade good on it')
    // the bonus is drawn as trade good tokens on the card itself, the wording is for assistive technology
    expect(screen.getByTestId('strategy-bonus-trade').querySelectorAll('img').length).toBe(1)
    expect(screen.getByTestId('strategy-card-technology').className).toContain('own-0')
  })

  it('R7: the objectives strip lists the revealed objectives and both mandates', () => {
    const state = toActionPhase()
    renderWithSession(state, <BoardScreen />)
    expect(screen.getByTestId(`objective-${state.publicObjectives[0]}`)).toBeTruthy()
    expect(state.publicObjectives).toHaveLength(1)                       // one revealed in round 1
    expect(screen.queryByTestId(`objective-${state.objectiveOrder[1]}`)).toBeNull()
    expect(screen.getByTestId('mandate-first_strike').textContent).toContain('First Strike')
    expect(screen.getByTestId('mandate-foothold').textContent).toContain('Foothold')
  })

  it('shows victory points, command tokens, planets, economy, technologies and forces', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('vp-0').textContent).toBe('0 of 7')
    expect(screen.getByTestId('tokens-0-tactic').textContent).toBe('3')
    expect(screen.getByTestId('tokens-0-fleet').textContent).toBe('3')
    expect(screen.getByTestId('tokens-0-strategy').textContent).toBe('2')
    expect(screen.getByTestId('planet-0-000').textContent).toContain('[0.0.0]')
    expect(screen.getByTestId('economy-0-resources').textContent).toBe('5')
    expect(screen.getByTestId('economy-0-influence').textContent).toBe('0')
    expect(screen.getByTestId('economy-0-commodities').textContent).toBe('2 of 2')
    expect(screen.getByTestId('tech-0-neural_motivator').textContent).toBe('Neural Motivator')
    expect(screen.getByTestId('forces-0-dreadnought').textContent).toBe('1 Super-Dreadnought I')
    expect(screen.getByTestId('forces-0-infantry').textContent).toBe('5 Infantry I')
    expect(screen.getByTestId('forces-1-destroyer').textContent).toBe('1 Destroyer I')
  })

  it('R3.2: the action bar enables exactly the actions the engine offers', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.getByTestId('btn-tactical').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('btn-strategic').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('btn-component').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('btn-pass').hasAttribute('disabled')).toBe(true)   // two unused cards
    expect(screen.getByTestId('btn-undo').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('btn-tactical'))
    expect(screen.getByTestId('hint').textContent).toBe('Tactical action. Choose a system to activate.')
  })

  it('R3.2: a player without a tactic token cannot start a tactical action', () => {
    const broke = withPlayer(toActionPhase(), 0, { tokens: { tactic: 0, fleet: 3, strategy: 2 } })
    renderWithSession(broke, <BoardScreen />)
    expect(screen.getByTestId('btn-tactical').hasAttribute('disabled')).toBe(true)
  })

  it('shows an engine rejection in the hint area and clears it on the next accepted move', () => {
    const { store } = renderWithSession(cardsUsed(toActionPhase()), <BoardScreen />)
    expect(screen.queryByTestId('engine-error')).toBeNull()
    act(() => { store().apply({ type: 'endTactical' }) })
    expect(screen.getByTestId('engine-error').textContent).toBe('no tactical action is running')
    expect(screen.queryByTestId('hint')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-pass'))
    expect(screen.queryByTestId('engine-error')).toBeNull()
    expect(screen.getByTestId('hint')).toBeTruthy()
  })

  it('opens the unit reference card while a force is hovered', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.queryByTestId('unitcard-0-carrier')).toBeNull()
    fireEvent.mouseEnter(screen.getByTestId('forces-0-carrier'))
    expect(screen.getByTestId('unitcard-0-carrier')).toBeTruthy()
    fireEvent.mouseLeave(screen.getByTestId('forces-0-carrier'))
    expect(screen.queryByTestId('unitcard-0-carrier')).toBeNull()
  })

  it('R3.2: the menu offers the way back to the lobby without abandoning the game', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    expect(screen.queryByTestId('game-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-menu'))
    expect(screen.getByTestId('game-menu')).toBeTruthy()
    expect(screen.getByTestId('btn-menu-lobby')).toBeTruthy()
    expect(screen.getByTestId('btn-menu-rules')).toBeTruthy()
    fireEvent.click(screen.getByTestId('btn-menu-close'))
    expect(screen.queryByTestId('game-menu')).toBeNull()
  })

  it('R3.1: the strip asks for a strategy card while the draft is open, and stops once it is over', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    // toActionPhase has every card drafted already
    expect(screen.queryByTestId('pick-prompt')).toBeNull()
    expect(document.querySelectorAll('.sc.pick')).toHaveLength(0)
  })

  it('renders all player blocks, seat tabs, and 10 VP target in a 3-player game', () => {
    const state3 = createGame({
      players: [
        { faction: 'l1z1x', color: 'blue', name: 'Alpha' },
        { faction: 'sol', color: 'red', name: 'Beta' },
        { faction: 'hacan', color: 'yellow', name: 'Gamma' },
      ],
      speaker: 0,
    }, 42)
    renderWithSession(state3, <BoardScreen />)
    expect(screen.getByTestId('player-0').textContent).toContain('Alpha')
    expect(screen.getByTestId('player-1').textContent).toContain('Beta')
    expect(screen.getByTestId('player-2').textContent).toContain('Gamma')
    expect(screen.getByTestId('vp-0').textContent).toBe('0 of 10')
    expect(screen.getByTestId('seat-tabs-left')).toBeTruthy()
    expect(screen.getByTestId('seat-tabs-right')).toBeTruthy()

    // Switch right panel to player 2
    fireEvent.click(screen.getByTestId('tab-right-2'))
    expect(screen.getByTestId('panel-2')).toBeTruthy()
    expect(screen.getByTestId('vp-2').textContent).toBe('0 of 10')
  })

  it('renders secret objectives in the side panel for a player', () => {
    const s = withPlayer(toActionPhase(), 0, { secretObjectives: ['fwm'], scoredObjectives: ['fwm'] })
    renderWithSession(s, <BoardScreen />)
    expect(screen.getByTestId('secret-objectives-0')).toBeTruthy()
    expect(screen.getByTestId('secret-0-fwm').textContent).toContain('Fuel the War Machine')
    expect(screen.getByTestId('secret-0-fwm').textContent).toContain('Scored (1 VP)')
  })

  it('opens log panel and allows switching to debug log tab', () => {
    renderWithSession(toActionPhase(), <BoardScreen />)
    fireEvent.click(screen.getByTestId('btn-log'))
    expect(screen.getByTestId('log-panel')).toBeTruthy()
    expect(screen.getByTestId('tab-game-log')).toBeTruthy()
    expect(screen.getByTestId('tab-debug-log')).toBeTruthy()

    // Switch to debug log tab
    fireEvent.click(screen.getByTestId('tab-debug-log'))
    expect(screen.getByTestId('debug-log-list')).toBeTruthy()
    expect(screen.getByTestId('btn-clear-debug-log')).toBeTruthy()
  })
})
