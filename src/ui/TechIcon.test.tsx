// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TechIcon } from './TechIcon'

describe('the technology symbol', () => {
  it('shows the printed colour symbol for a research technology', () => {
    render(<TechIcon techId="neural_motivator" colour="blue" />)
    expect(screen.getByAltText('Biotic').getAttribute('src')).toBe('/assets/icons/tech_green.png')
  })
  it('shows each of the four colours with its own symbol', () => {
    const { container } = render(
      <>
        <TechIcon techId="gravity_drive" colour="blue" />
        <TechIcon techId="plasma_scoring" colour="blue" />
        <TechIcon techId="sarween_tools" colour="blue" />
      </>,
    )
    const sources = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'))
    expect(sources).toEqual(['/assets/icons/tech_blue.png', '/assets/icons/tech_red.png', '/assets/icons/tech_yellow.png'])
  })
  it('shows the unit model in the player colour for a unit upgrade', () => {
    render(<TechIcon techId="dreadnought_ii" colour="red" />)
    expect(screen.getByAltText('Dreadnought II').getAttribute('src')).toBe('/assets/sprites/counters/red_dreadnought.png')
  })
})
