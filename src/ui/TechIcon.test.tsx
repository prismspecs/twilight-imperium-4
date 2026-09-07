// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { iconFitSize } from './sprites'
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
    const img = screen.getByAltText('Dreadnought II')
    expect(img.getAttribute('src')).toBe('/assets/sprites/counters/red_dreadnought.png')
    expect(img.getAttribute('width')).toBe('18')
    expect(img.getAttribute('height')).toBe('18')
    const container = img.closest('.ticon.unit') as HTMLElement
    expect(container).not.toBeNull()
    expect(container.style.width).toBe('18px')
    expect(container.style.height).toBe('18px')
  })
  it('sizes infantry_ii and fighter_ii from the shared sprite manifest, keeping their true aspect ratio', () => {
    // Regression: the icon used to force width===height===size on every unit, distorting non-square sprites
    // (infantry's counter art is 156x172, not square) instead of reading real proportions from one place.
    const { container } = render(
      <>
        <TechIcon techId="infantry_ii" colour="blue" size={15} />
        <TechIcon techId="fighter_ii" colour="blue" size={15} />
      </>,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(2)
    const expected = [iconFitSize('infantry', 15, 'counters'), iconFitSize('fighter', 15, 'counters')]
    imgs.forEach((img, i) => {
      expect(img.getAttribute('width')).toBe(String(expected[i].width))
      expect(img.getAttribute('height')).toBe(String(expected[i].height))
      expect(Number(img.getAttribute('width'))).toBeLessThanOrEqual(15)
      expect(Number(img.getAttribute('height'))).toBeLessThanOrEqual(15)
      const unitContainer = img.closest('.ticon.unit') as HTMLElement
      expect(unitContainer.style.width).toBe('15px')
      expect(unitContainer.style.height).toBe('15px')
    })
  })
  it('falls back to models sprite style when counter sprite fails to load', () => {
    render(<TechIcon techId="infantry_ii" colour="blue" />)
    const img = screen.getByAltText('Infantry II') as HTMLImageElement
    expect(img.src).toContain('/assets/sprites/counters/blue_infantry.png')
    img.dispatchEvent(new Event('error'))
    expect(img.src).toContain('/assets/sprites/blue_infantry.png')
  })
})
