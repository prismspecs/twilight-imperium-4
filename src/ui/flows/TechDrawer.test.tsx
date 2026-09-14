// src/ui/flows/TechDrawer.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toActionPhase } from '../../engine/testUtils'
import { SAAR_CONFIG } from '../../engine/testUtils'
import { TechDrawer } from './TechDrawer'

describe('TechDrawer', () => {
  it('renders technology cards with descriptions', () => {
    const state = toActionPhase(1, 0, SAAR_CONFIG)
    const onSelect = vi.fn()
    render(
      <TechDrawer
        state={state}
        seat={0}
        allowed={['antimass_deflectors', 'chaos_mapping', 'floating_factory_ii']}
        selected={null}
        onSelect={onSelect}
      />,
    )

    // Verify description is rendered on Antimass Deflectors
    const antimassDesc = screen.getByTestId('tech-desc-antimass_deflectors')
    expect(antimassDesc.textContent).toContain('asteroid fields')

    // Verify description is rendered on Chaos Mapping
    const chaosDesc = screen.getByTestId('tech-desc-chaos_mapping')
    expect(chaosDesc.textContent).toContain('asteroid fields with your units')

    // Verify clicking on card calls onSelect
    const chaosCard = screen.getByTestId('tech-card-chaos_mapping')
    fireEvent.click(chaosCard)
    expect(onSelect).toHaveBeenCalledWith('chaos_mapping')
  })

  it('renders faction art without falling back to cardback_public2.png for faction techs without files', () => {
    const state = toActionPhase(1, 0, SAAR_CONFIG)
    render(
      <TechDrawer
        state={state}
        seat={0}
        allowed={['chaos_mapping']}
        selected={null}
        onSelect={() => {}}
      />,
    )

    const chaosCard = screen.getByTestId('tech-card-chaos_mapping')
    // Should NOT have an img pointing to cardback_public2.png
    const images = chaosCard.querySelectorAll('img')
    for (const img of images) {
      expect(img.src).not.toContain('cardback_public2.png')
    }
  })
})
