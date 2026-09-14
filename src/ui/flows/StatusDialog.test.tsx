// src/ui/flows/StatusDialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toStatusPhase, toActionPhase, withPlayer } from '../../engine/testUtils'
import { renderWithSession } from '../test/harness'
import { StatusDialog } from './StatusDialog'

describe('StatusDialog Mitosis', () => {
  it('renders Mitosis section when player is Arborec', () => {
    let state = toStatusPhase(toActionPhase(1, 0))
    state = withPlayer(state, 0, { faction: 'arborec' })
    renderWithSession(state, <StatusDialog />)

    expect(screen.getByTestId('status-mitosis')).toBeDefined()
    expect(screen.getByText(/Mitosis/)).toBeDefined()
    expect(screen.getByText(/Place 1 free infantry on:/)).toBeDefined()
  })

  it('does not render Mitosis section when player is not Arborec', () => {
    let state = toStatusPhase(toActionPhase(1, 0))
    state = withPlayer(state, 0, { faction: 'l1z1x' })
    renderWithSession(state, <StatusDialog />)

    expect(screen.queryByTestId('status-mitosis')).toBeNull()
  })

  it('passes selected mitosisPlanet when confirming status move', () => {
    let state = toStatusPhase(toActionPhase(1, 0))
    state = withPlayer(state, 0, { faction: 'arborec' })
    const { store } = renderWithSession(state, <StatusDialog />)

    const mitosisBtn = screen.getByTestId('status-mitosis-0.0.0')
    expect(mitosisBtn).toBeDefined()
    fireEvent.click(mitosisBtn)

    // Place the 2 gained tokens so Confirm is enabled
    fireEvent.click(screen.getByTestId('token-tactic-plus'))
    fireEvent.click(screen.getByTestId('token-tactic-plus'))

    const confirmBtn = screen.getByTestId('btn-status-confirm')
    expect(confirmBtn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirmBtn)

    // Session state should have applied status move with Mitosis infantry on 0.0.0
    const targetPlanet = Object.values(store().session!.state.systems)
      .flatMap(s => s.planets)
      .find(p => p.id === '0.0.0')
    expect(targetPlanet).toBeDefined()
    // Should have placed 1 infantry
    expect(targetPlanet?.ground.some(u => u.type === 'infantry' && u.owner === 0)).toBe(true)
  })
})
