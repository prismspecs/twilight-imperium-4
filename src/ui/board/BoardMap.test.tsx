// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createGame } from '../../engine'
import { toActionPhase } from '../../engine/testUtils'
import { BoardMap } from './BoardMap'
import type { Seat } from '../../engine/types'

const state = toActionPhase()

describe('the board', () => {
  it('draws all seven systems with their tile art', () => {
    render(<BoardMap state={state} />)
    for (const id of ['home-n', 'bereg', 'sakulag', 'mecatol', 'quann', 'starpoint', 'home-s']) {
      expect(screen.getByTestId(`tile-${id}`)).toBeTruthy()
    }
    // R1: the tile file is the background alone, the planets are drawn on top from their own renders
    expect(screen.getByTestId('hex-mecatol').getAttribute('src')).toContain('00_blue.png')
    expect(screen.getByTestId('planet-art-mecatol-rex').getAttribute('src')).toContain('planet_Mecatol.png')
  })

  it('shows the catalog tile number in a corner, AsyncTI4-style, for the fixed map\'s composite tile strings', () => {
    render(<BoardMap state={state} />)
    // 'tile' is a composite 'NN_name' string on the fixed map; the leading token is the real catalog number
    expect(screen.getByTestId('tile-number-home-n').textContent).toBe('06')
    expect(screen.getByTestId('tile-number-bereg').textContent).toBe('35')
    expect(screen.getByTestId('tile-number-home-s').textContent).toBe('10')
    expect(screen.getByTestId('tile-number-mecatol').textContent).toBe('18')
    // quann/starpoint/sakulag share the plain, unnumbered backing art
    expect(screen.getByTestId('tile-number-quann').textContent).toBe('00')
  })

  it('stacks the units of a system with a count badge', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('stack-home-n-0-fighter').textContent).toBe('3')
    expect(screen.getByTestId('stack-home-n-0-carrier').textContent).toBe('')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('src')).toContain('blue_dreadnought.png')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('width')).toBe('31')
    expect(screen.getByTestId('stack-home-s-1-destroyer')).toBeTruthy()
  })

  it('shows ground forces, structures and control tokens on the planets', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('ground-000-0-infantry').textContent).toBe('5')
    expect(screen.getByTestId('structure-000-0-spacedock')).toBeTruthy()
    expect(screen.getByTestId('structure-000-0-pds')).toBeTruthy()
    expect(screen.getByTestId('control-000').getAttribute('src')).toContain('l1z1x_control.png')
    expect(screen.getByTestId('ground-arc-prime-1-infantry').textContent).toBe('2')
    expect(screen.getByTestId('ground-wren-terra-1-infantry').textContent).toBe('1')
    expect(screen.queryByTestId('control-sakulag')).toBeNull()
  })

  it('renders Custodians token badge on Mecatol Rex and map pan/zoom controls', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('custodians-token')).toBeTruthy()
    expect(screen.getByTestId('custodians-token').getAttribute('src')).toBe('/assets/tokens/token_custodian.png')
    expect(screen.queryByTestId('guardian-label')).toBeNull()
    expect(screen.getByTestId('map-controls')).toBeTruthy()
    expect(screen.getByTestId('zoom-in')).toBeTruthy()
    expect(screen.getByTestId('zoom-out')).toBeTruthy()
    expect(screen.getByTestId('zoom-reset')).toBeTruthy()
  })

  it('R1: every planet carries its own nameplate, and wormholes show their glyph', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('plate-sakulag').textContent).toBe('21Sakulag')
    expect(screen.getByTestId('plate-centauri').textContent).toBe('23Centauri')
    expect(screen.getByTestId('plate-bereg').textContent).toBe('31Bereg')
    expect(screen.getByTestId('plate-mecatol-rex').textContent).toBe('16Mecatol Rex')
    expect(screen.getByTestId('sigil-home-n').getAttribute('src')).toContain('l1z1x.png')
    expect(screen.getByTestId('sigil-home-s').getAttribute('src')).toContain('letnev.png')
    expect(screen.getByTestId('wormhole-bereg').getAttribute('src')).toContain('WHalpha')
    expect(screen.getByTestId('wormhole-quann').getAttribute('src')).toContain('WHbeta')
  })

  it('only calls back for a system the caller marked selectable', () => {
    const onSelect = vi.fn()
    render(<BoardMap state={state} selectable={['bereg']} activeSystemId="quann" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('tile-bereg'))
    fireEvent.click(screen.getByTestId('tile-sakulag'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('bereg')
    expect(screen.getByTestId('tile-quann').className).toContain('active')
    expect(screen.getByTestId('tile-bereg').className).toContain('selectable')
  })

  it('makes a selectable tile a focusable button that answers to Enter and Space', () => {
    const onSelect = vi.fn()
    render(<BoardMap state={state} selectable={['bereg']} onSelect={onSelect} />)
    const tile = screen.getByTestId('tile-bereg')
    expect(tile.getAttribute('role')).toBe('button')
    expect(tile.getAttribute('tabindex')).toBe('0')
    expect(tile.getAttribute('aria-label')).toBe('Activate Bereg')
    tile.focus()
    expect(document.activeElement).toBe(tile)
    fireEvent.keyDown(tile, { key: 'Enter' })
    fireEvent.keyDown(tile, { key: ' ' })
    fireEvent.keyDown(tile, { key: 'a' })
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenCalledWith('bereg')
    // a tile that cannot be activated stays out of the tab order
    const idle = screen.getByTestId('tile-sakulag')
    expect(idle.getAttribute('role')).toBeNull()
    expect(idle.getAttribute('tabindex')).toBeNull()
  })

  it('R8: both trade posts sit outside the map with their state', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('post-west').textContent).toContain('Kasda Exchange')
    expect(screen.getByTestId('post-east').textContent).toContain('Vorhal Freeport')
  })

  it('shows a played command token per seat with a token on the system, and none on an idle system', () => {
    const activated = {
      ...state,
      systems: {
        ...state.systems,
        bereg: { ...state.systems.bereg, activatedBy: [0] as Seat[] },
        sakulag: { ...state.systems.sakulag, activatedBy: [0, 1] as Seat[] },
      },
    }
    render(<BoardMap state={activated} />)
    const seat0 = screen.getByTestId('activation-bereg-0')
    expect(seat0.getAttribute('src')).toContain('l1z1x_command.png')
    expect(seat0.getAttribute('alt')).toBe(`${state.players[0].name} command token`)
    expect(screen.getByTestId('activation-sakulag-0').getAttribute('src')).toContain('l1z1x_command.png')
    expect(screen.getByTestId('activation-sakulag-1').getAttribute('src')).toContain('letnev_command.png')
    expect(screen.getByTestId('activation-sakulag-1').getAttribute('alt')).toBe(`${state.players[1].name} command token`)
    expect(screen.queryByTestId('activation-quann-0')).toBeNull()
    expect(screen.queryByTestId('activation-quann-1')).toBeNull()
  })

  it('renders all systems in a generated galaxy without trade posts', () => {
    const g3 = createGame({
      players: [
        { faction: 'l1z1x', color: 'blue', name: 'A' },
        { faction: 'sol', color: 'red', name: 'B' },
        { faction: 'hacan', color: 'yellow', name: 'C' },
      ],
      speaker: 0,
    }, 42)
    render(<BoardMap state={g3} />)
    const mecatol = screen.getByTestId('tile-mecatol')
    expect(mecatol).toBeTruthy()
    expect(mecatol.style.left).toBe('522px')
    expect(mecatol.style.top).toBe('603px')
    expect(screen.getByTestId('hex-mecatol').getAttribute('src')).toContain('18_MR.png')
    expect(screen.queryByTestId('planet-art-mecatol-rex')).toBeNull()
    expect(screen.getByTestId('tile-home-0')).toBeTruthy()
    expect(screen.getByTestId('tile-home-1')).toBeTruthy()
    expect(screen.getByTestId('hex-home-1').getAttribute('src')).toContain('01_Jord.png')
    expect(screen.getByTestId('tile-home-2')).toBeTruthy()
    expect(screen.queryByTestId('post-west')).toBeNull()
    expect(screen.queryByTestId('post-east')).toBeNull()
    // the galaxy generator's `tile` is a plain, unpadded catalog number ('18', '1'), so the label pads it
    expect(screen.getByTestId('tile-number-mecatol').textContent).toBe('18')
    expect(screen.getByTestId('tile-number-home-1').textContent).toBe('01')
  })

  it('renders delta wormhole and anomaly tiles with authentic art and non-overlapping spots', () => {
    const gCreuss = createGame({
      players: [
        { faction: 'creuss', color: 'blue', name: 'Ghosts' },
        { faction: 'letnev', color: 'red', name: 'Barony' },
        { faction: 'hacan', color: 'yellow', name: 'Emirates' },
      ],
      speaker: 0,
    }, 42)
    render(<BoardMap state={gCreuss} />)
    const home0 = screen.getByTestId('tile-home-0')
    expect(home0).toBeTruthy()
    // Creuss Gate has a delta wormhole:
    const wh = screen.getByTestId('wormhole-home-0')
    expect(wh.getAttribute('src')).toContain('emoji_WHdelta.png')
    // Sigil and wormhole spots must not collide on Creuss Gate
    const sigil = screen.getByTestId('sigil-home-0')
    expect(sigil).toBeTruthy()
    expect(wh.style.left).toBe('36px')
    expect(wh.style.top).toBe('40px')
  })
})
