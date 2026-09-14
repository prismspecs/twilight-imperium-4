// src/ui/flows/MovementPanel.test.tsx
// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine'
import { BASE_CONFIG, SAAR_CONFIG } from '../../engine/testUtils'
import type { GameState, System } from '../../engine/types'
import { renderWithSession } from '../test/harness'
import { MovementPanel } from './MovementPanel'

function makeMultiPlanetMovementState(): GameState {
  const base = createGame(BASE_CONFIG, 1)

  // System tile-37 has Arinam and Meer (2 planets)
  // Connect tile-37 to tile-21
  const sys37: System = {
    ...base.systems['tile-37'],
    id: 'tile-37',
    name: 'Arinam / Meer',
    activatedBy: [],
    neighbours: ['tile-21'],
    space: [
      { id: 1001, type: 'carrier', owner: 0, damaged: false },
    ],
    planets: [
      {
        id: 'arinam',
        name: 'Arinam',
        resources: 1,
        influence: 2,
        trait: null,
        techSkip: null,
        owner: 0,
        exhausted: false,
        ground: [
          { id: 2001, type: 'infantry', owner: 0, damaged: false },
          { id: 2002, type: 'infantry', owner: 0, damaged: false },
        ],
        structures: [],
      },
      {
        id: 'meer',
        name: 'Meer',
        resources: 0,
        influence: 4,
        trait: null,
        techSkip: null,
        owner: 0,
        exhausted: false,
        ground: [
          { id: 3001, type: 'infantry', owner: 0, damaged: false },
        ],
        structures: [],
      },
    ],
  }

  const sys21: System = {
    ...base.systems['tile-21'],
    id: 'tile-21',
    name: 'Thibah',
    activatedBy: [0],
    neighbours: ['tile-37'],
    space: [],
  }

  return {
    ...base,
    active: 0,
    phase: 'action',
    tactical: {
      systemId: 'tile-21',
      step: 'movement',
    },
    systems: {
      ...base.systems,
      'tile-37': sys37,
      'tile-21': sys21,
    },
  }
}

describe('MovementPanel infantry source selection', () => {
  it('displays separate cards for each planet in multi-planet systems', () => {
    const state = makeMultiPlanetMovementState()
    renderWithSession(state, <MovementPanel />)

    expect(screen.getByTestId('origin-tile-37')).toBeTruthy()

    // Separate cards for Arinam and Meer
    const arinamCard = screen.getByTestId('cargo-card-tile-37-infantry-arinam')
    const meerCard = screen.getByTestId('cargo-card-tile-37-infantry-meer')

    expect(arinamCard.textContent).toContain('On Arinam')
    expect(arinamCard.textContent).toContain('of 2')
    expect(meerCard.textContent).toContain('On Meer')
    expect(meerCard.textContent).toContain('of 1')
  })

  it('allows selecting infantry specifically from one planet and carries those exact units', () => {
    const state = makeMultiPlanetMovementState()
    const { store } = renderWithSession(state, <MovementPanel />)

    // Select 1 Carrier (capacity 4)
    fireEvent.click(screen.getByTestId('ship-tile-37-carrier-plus'))
    expect(screen.getByTestId('capacity-tile-37').textContent).toContain('Capacity 4, carrying 0')

    // Pick 1 infantry from Meer (unitId 3001) and 0 from Arinam
    fireEvent.click(screen.getByTestId('cargo-tile-37-infantry-meer-plus'))
    expect(screen.getByTestId('capacity-tile-37').textContent).toContain('Capacity 4, carrying 1')

    // Submit movement
    fireEvent.click(screen.getByTestId('btn-move-ships'))

    // Verify the state after move: the ship moved carrying unit 3001 from Meer
    const updated = store().session?.state
    const tile21 = updated?.systems['tile-21']
    expect(tile21?.space.some(u => u.id === 1001)).toBe(true)
    // Infantry 3001 is now in tile-21 space (transported)
    expect(tile21?.space.some(u => u.id === 3001)).toBe(true)
    // Arinam still has both of its infantry
    const arinam = updated?.systems['tile-37'].planets.find(p => p.id === 'arinam')
    expect(arinam?.ground.map(u => u.id)).toEqual([2001, 2002])
    // Meer has 0 infantry left
    const meer = updated?.systems['tile-37'].planets.find(p => p.id === 'meer')
    expect(meer?.ground.length).toBe(0)
  })

  it('displays In space for ground forces located in space alongside planets', () => {
    const base = createGame(SAAR_CONFIG, 2)
    // Put 1 infantry in space and 1 on Meer
    const sys37: System = {
      ...base.systems['tile-37'],
      id: 'tile-37',
      name: 'Arinam / Meer',
      activatedBy: [],
      neighbours: ['tile-21'],
      space: [
        { id: 1001, type: 'carrier', owner: 0, damaged: false },
        { id: 4001, type: 'infantry', owner: 0, damaged: false },
      ],
      planets: [
        {
          id: 'meer',
          name: 'Meer',
          resources: 0,
          influence: 4,
          trait: null,
          techSkip: null,
          owner: 0,
          exhausted: false,
          ground: [
            { id: 4002, type: 'infantry', owner: 0, damaged: false },
          ],
          structures: [],
        },
      ],
    }
    const sys21: System = {
      ...base.systems['tile-21'],
      id: 'tile-21',
      name: 'Thibah',
      activatedBy: [0],
      neighbours: ['tile-37'],
      space: [],
    }

    const state: GameState = {
      ...base,
      active: 0,
      phase: 'action',
      tactical: {
        systemId: 'tile-21',
        step: 'movement',
      },
      systems: {
        ...base.systems,
        'tile-37': sys37,
        'tile-21': sys21,
      },
    }

    renderWithSession(state, <MovementPanel />)

    const spaceCard = screen.getByTestId('cargo-card-tile-37-infantry-space')
    const meerCard = screen.getByTestId('cargo-card-tile-37-infantry-meer')

    expect(spaceCard.textContent).toContain('In space')
    expect(meerCard.textContent).toContain('On Meer')
  })

  it('displays movement error message when an engine error occurs', () => {
    const state = makeMultiPlanetMovementState()
    const { store } = renderWithSession(state, <MovementPanel />)
    expect(screen.queryByTestId('movement-error')).toBeNull()

    // Trigger an illegal move to set an error in store
    act(() => {
      store().apply({ type: 'moveShips', moves: [{ unitId: 9999, from: 'tile-37', carrying: [] }] })
    })

    const errorEl = screen.getByTestId('movement-error')
    expect(errorEl).toBeTruthy()
    expect(errorEl.textContent).toContain('no movable ship 9999')
  })

  it('does not display Carried units section when origin system has 0 fighters and 0 infantry', () => {
    const base = makeMultiPlanetMovementState()
    // Clear all ground forces on tile-37
    const noGround: GameState = {
      ...base,
      systems: {
        ...base.systems,
        'tile-37': {
          ...base.systems['tile-37'],
          planets: base.systems['tile-37'].planets.map(p => ({ ...p, ground: [] })),
        },
      },
    }
    renderWithSession(noGround, <MovementPanel />)

    // Ships section is shown
    expect(screen.getByTestId('origin-tile-37')).toBeTruthy()
    expect(screen.getByTestId('ship-card-tile-37-carrier')).toBeTruthy()

    // Carried units section and cargo cards should NOT be shown
    expect(screen.queryByTestId('cargo-card-tile-37-fighter')).toBeNull()
    expect(screen.queryByTestId('cargo-card-tile-37-infantry-arinam')).toBeNull()
    expect(screen.queryByTestId('cargo-card-tile-37-infantry-meer')).toBeNull()
    expect(screen.queryByTestId('cargo-card-tile-37-infantry')).toBeNull()
    expect(screen.queryByText('Carried units')).toBeNull()
  })

  it('does not display cargo card for a planet that has 0 infantry in a multi-planet system', () => {
    const base = makeMultiPlanetMovementState()
    // Meer has 1 infantry, but Arinam has 0
    const arinamEmpty: GameState = {
      ...base,
      systems: {
        ...base.systems,
        'tile-37': {
          ...base.systems['tile-37'],
          planets: base.systems['tile-37'].planets.map(p => (p.id === 'arinam' ? { ...p, ground: [] } : p)),
        },
      },
    }
    renderWithSession(arinamEmpty, <MovementPanel />)

    // Arinam has 0 infantry, so its card should NOT be shown
    expect(screen.queryByTestId('cargo-card-tile-37-infantry-arinam')).toBeNull()

    // Meer is the only source with infantry, so its card SHOULD be shown
    const meerCard = screen.getByTestId('cargo-card-tile-37-infantry')
    expect(meerCard).toBeTruthy()
    expect(meerCard.textContent).toContain('On Meer')
    expect(meerCard.textContent).toContain('of 1')
  })
})
