// src/ui/hud/FloatingRightDeck.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine/setup'
import { DUEL_CONFIG, toActionPhase, withPlayer } from '../../engine/testUtils'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'

describe('FloatingRightDeck and streamlined TopBar', () => {
  it('renders readable objectives with stage tags, full titles and descriptions in the floating deck', () => {
    const state = toActionPhase()
    renderWithSession(state, <BoardScreen />)

    const deck = screen.getByTestId('floating-right-deck')
    expect(deck).toBeTruthy()
    expect(deck.className).toContain('is-open')

    // Public objective is displayed with its short title and description
    const objId = state.publicObjectives[0]
    const objEl = screen.getByTestId(`objective-${objId}`)
    expect(objEl).toBeTruthy()
    expect(objEl.textContent).toContain('STAGE I')
    expect(objEl.textContent).toContain('VP')

    // Mandates are displayed with description and titles
    expect(screen.getByTestId('mandate-first_strike').textContent).toContain('First Strike')
    expect(screen.getByTestId('mandate-foothold').textContent).toContain('Foothold')
  })

  it('switches between Objectives and Strategy tabs using TopBar buttons and deck tabs', () => {
    const state = toActionPhase()
    renderWithSession(state, <BoardScreen />)

    // Initially on objectives tab
    expect(screen.getByTestId('tab-btn-objectives').className).toContain('active')

    // Switch to strategy via TopBar button
    fireEvent.click(screen.getByTestId('topbar-btn-strategy'))
    expect(screen.getByTestId('tab-btn-strategy').className).toContain('active')
    expect(screen.getByTestId('strategy-card-leadership')).toBeTruthy()

    // Switch back to objectives via deck tab
    fireEvent.click(screen.getByTestId('tab-btn-objectives'))
    expect(screen.getByTestId('tab-btn-objectives').className).toContain('active')
  })

  it('toggles the floating deck collapsed and expanded state', () => {
    const state = toActionPhase()
    renderWithSession(state, <BoardScreen />)

    const deck = screen.getByTestId('floating-right-deck')
    expect(deck.className).toContain('is-open')

    // Click toggle deck button in TopBar
    fireEvent.click(screen.getByTestId('topbar-btn-toggle-deck'))
    expect(deck.className).toContain('is-collapsed')

    // Click toggle deck button again to re-open
    fireEvent.click(screen.getByTestId('topbar-btn-toggle-deck'))
    expect(deck.className).toContain('is-open')
  })

  it('shows scored faction control tokens on objectives', () => {
    let state = toActionPhase()
    const objId = state.publicObjectives[0]
    state = withPlayer(state, 0, {
      scoredObjectives: [objId],
    })

    renderWithSession(state, <BoardScreen />)
    expect(screen.getByTestId(`scored-${objId}-0`)).toBeTruthy()
  })

  it('allows drafting strategy cards in strategy phase and displays trade good bonuses', () => {
    let state = createGame(DUEL_CONFIG, 42)
    state = {
      ...state,
      strategyPool: state.strategyPool.map(c => c.id === 'leadership' ? { ...c, bonus: 2 } : c),
    }

    const { store } = renderWithSession(state, <BoardScreen />)

    // Strategy tab is active by default in strategy phase
    expect(screen.getByTestId('tab-btn-strategy').className).toContain('active')
    expect(screen.getByTestId('pick-prompt')).toBeTruthy()

    // Bonus trade goods are visible
    const bonus = screen.getByTestId('strategy-bonus-leadership')
    expect(bonus.textContent).toContain('+2')

    // Click warfare to draft it
    const warfareCard = screen.getByTestId('strategy-card-warfare')
    fireEvent.click(warfareCard)

    // Verify session received pickStrategyCard move
    const currentSession = store().session
    expect(currentSession?.state.players[0].strategyCards.some(c => c.id === 'warfare')).toBe(true)
  })

  it('collapses the deck using the header close button', () => {
    const state = toActionPhase()
    renderWithSession(state, <BoardScreen />)

    const deck = screen.getByTestId('floating-right-deck')
    expect(deck.className).toContain('is-open')

    fireEvent.click(screen.getByTestId('frd-close-btn'))
    expect(deck.className).toContain('is-collapsed')
  })

  it('adds has-modal class to stage when combat is active to maintain clear visual hierarchy', () => {
    let state = toActionPhase()
    state = {
      ...state,
      tactical: {
        systemId: 'mecatol',
        step: 'spaceCombat',
        combat: {
          round: 1,
          attacker: 0,
          defender: 1,
          retreating: null,
          retreatTo: null,
          lastRolls: [],
          pending: [],
        },
      },
    }

    renderWithSession(state, <BoardScreen />)
    const stage = screen.getByTestId('stage')
    expect(stage.className).toContain('has-modal')
  })
})
