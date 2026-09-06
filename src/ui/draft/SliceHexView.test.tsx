// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SliceHexView } from './SliceHexView'
import type { DraftSlice } from '../../engine/draft/sliceGenerator'
import { GALAXY_TILES } from '../../data/tiles'

describe('SliceHexView', () => {
  const blue19 = GALAXY_TILES.find(t => t.tile === 19)! // Wellon (1/2, yellow)
  const blue26 = GALAXY_TILES.find(t => t.tile === 26)! // Lodor (3/1, alpha)
  const blue35 = GALAXY_TILES.find(t => t.tile === 35)! // Bereg & Lirta IV (3/1, 2/3)
  const red39 = GALAXY_TILES.find(t => t.tile === 39)!  // Alpha wormhole
  const red44 = GALAXY_TILES.find(t => t.tile === 44)!  // Asteroids

  const mockSlice: DraftSlice = {
    id: 'slice-A',
    name: 'Slice A',
    tileIds: [19, 26, 35, 39, 44],
    tiles: [blue19, blue26, blue35, red39, red44],
    totalResources: 9,
    totalInfluence: 7,
    optimalResources: 6,
    optimalInfluence: 5,
    optimalFlex: 0,
    techSkips: ['yellow'],
    wormholes: ['alpha'],
    anomalies: ['asteroid_field'],
  }

  it('renders SVG container with 5 slice tiles and the Home ghost hex', () => {
    render(<SliceHexView slice={mockSlice} />)

    const container = screen.getByTestId('slice-hex-view-slice-A')
    expect(container).toBeTruthy()

    // 5 tiles present
    expect(screen.getByTestId('slice-tile-19')).toBeTruthy()
    expect(screen.getByTestId('slice-tile-26')).toBeTruthy()
    expect(screen.getByTestId('slice-tile-35')).toBeTruthy()
    expect(screen.getByTestId('slice-tile-39')).toBeTruthy()
    expect(screen.getByTestId('slice-tile-44')).toBeTruthy()

    // Home ghost hex present
    expect(screen.getByTestId('slice-home-hex')).toBeTruthy()
  })

  it('renders images for tile faces with correct tile URLs', () => {
    render(<SliceHexView slice={mockSlice} />)

    const img19 = screen.getByTestId('slice-tile-img-19')
    expect(img19.getAttribute('href')).toContain('19_Wellon.png')

    const img35 = screen.getByTestId('slice-tile-img-35')
    expect(img35.getAttribute('href')).toContain('35_Bereg.png')

    const img44 = screen.getByTestId('slice-tile-img-44')
    expect(img44.getAttribute('href')).toContain('44_Asteroids.png')
  })

  it('renders position markers (Left, Front, Right, Equidistant, Mecatol Adj)', () => {
    render(<SliceHexView slice={mockSlice} />)

    expect(screen.getByText('Left')).toBeTruthy()
    expect(screen.getByText('Front')).toBeTruthy()
    expect(screen.getByText('Right')).toBeTruthy()
    expect(screen.getByText('Equidistant')).toBeTruthy()
    expect(screen.getByText('Mecatol Adj')).toBeTruthy()
    expect(screen.getByText('HOME')).toBeTruthy()
  })

  it('renders tile numbers and stats badges', () => {
    render(<SliceHexView slice={mockSlice} />)

    expect(screen.getByText('#19')).toBeTruthy()
    expect(screen.getByText('#35')).toBeTruthy()
    expect(screen.getByText('#44')).toBeTruthy()
  })
})
