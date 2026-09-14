// src/ui/flows/ProductionPicker.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toActionPhase, SAAR_CONFIG } from '../../engine/testUtils'
import { ProductionPicker } from './ProductionPicker'

describe('ProductionPicker', () => {
  it('renders dedicated flagship card for Saar instead of Dreadnought fallback card', () => {
    const state = toActionPhase(1, 0, SAAR_CONFIG)
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    // Verify Saar flagship card is rendered with Son of Ragh name and stats
    const flagshipCard = screen.getByTestId('uc-flagship-saar')
    expect(flagshipCard).toBeTruthy()
    expect(flagshipCard.textContent).toContain('Son of Ragh')
    expect(flagshipCard.textContent).toContain('SUSTAIN')
    expect(flagshipCard.textContent).toContain('AFB 6 (x4)')
    expect(flagshipCard.textContent).toContain('8') // Cost 8

    // Verify it does NOT render Dreadnought card image for Flagship
    const DreadnoughtImg = flagshipCard.querySelector('img[src*="unit_generic_dreadnought"]')
    expect(DreadnoughtImg).toBeNull()
  })

  it('renders card image for L1Z1X flagship which has dedicated reference art', () => {
    const state = toActionPhase(1, 0) // default config is L1Z1X
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    // L1Z1X has unit_l1z1x_flagship_001.png
    const flagshipImg = screen.getByAltText('Flagship [0.0.1]') as HTMLImageElement
    expect(flagshipImg).toBeTruthy()
    expect(flagshipImg.src).toContain('unit_l1z1x_flagship_001.png')
  })

  it('does not display War Sun for faction without War Sun technology', () => {
    const state = toActionPhase(1, 0) // L1Z1X without war_sun tech
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    expect(screen.queryByAltText('War Sun')).toBeNull()
    expect(screen.queryByTestId('step-warsun')).toBeNull()
  })

  it('displays War Sun for faction that has researched War Sun technology', () => {
    const base = toActionPhase(1, 0)
    const state = {
      ...base,
      players: base.players.map((p, i) => i === 0 ? { ...p, techs: [...p.techs, 'war_sun'] } : p),
    }
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    expect(screen.getByAltText(/War Sun/)).toBeTruthy()
    expect(screen.getByTestId('step-warsun')).toBeTruthy()
  })

  it('displays War Sun for Muaat even without war_sun technology (Prototype War Sun I)', () => {
    const muaatConfig = {
      players: [{ faction: 'muaat' as const, color: 'red' as const, name: 'Muaat' }, { faction: 'letnev' as const, color: 'blue' as const, name: 'Letnev' }],
      speaker: 0 as const,
    }
    const state = toActionPhase(1, 0, muaatConfig)
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    expect(screen.getByAltText(/War Sun/)).toBeTruthy()
    expect(screen.getByTestId('step-warsun')).toBeTruthy()
  })

  it('does not display Infantry for Arborec space docks (Mitosis)', () => {
    const arborecConfig = {
      players: [{ faction: 'arborec' as const, color: 'green' as const, name: 'Arborec' }, { faction: 'letnev' as const, color: 'blue' as const, name: 'Letnev' }],
      speaker: 0 as const,
    }
    const state = toActionPhase(1, 0, arborecConfig)
    render(
      <ProductionPicker
        state={state}
        seat={0}
        limit={5}
        units={{}}
        onUnits={vi.fn()}
      />,
    )

    expect(screen.queryByAltText(/Letani Warrior|Infantry/)).toBeNull()
    expect(screen.queryByTestId('step-infantry')).toBeNull()
  })
})
