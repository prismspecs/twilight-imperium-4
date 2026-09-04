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

  it('stacks the units of a system with a count badge', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('stack-home-n-0-fighter').textContent).toBe('3')
    expect(screen.getByTestId('stack-home-n-0-carrier').textContent).toBe('')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('src')).toContain('blue_dreadnought.png')
    expect(screen.getByTestId('sprite-home-n-0-dreadnought').getAttribute('width')).toBe('44')
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

  it('R4.2: the guardian fleet is grey and carries two infantry on Mecatol Rex', () => {
    render(<BoardMap state={state} />)
    expect(screen.getByTestId('guardian-label').textContent).toBe('Guardian fleet, worth 8')
    expect(screen.getByTestId('ground-mecatol-rex-guardian-infantry').textContent).toBe('2')
    const ships = screen.getAllByTestId(/^sprite-mecatol-guardian-/)
    expect(ships.length).toBeGreaterThan(0)
    for (const ship of ships) expect(ship.getAttribute('src')).toContain('/grey_')
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
    expect(screen.getByTestId('tile-home-0')).toBeTruthy()
    expect(screen.getByTestId('tile-home-1')).toBeTruthy()
    expect(screen.getByTestId('tile-home-2')).toBeTruthy()
    expect(screen.queryByTestId('post-west')).toBeNull()
    expect(screen.queryByTestId('post-east')).toBeNull()
  })
})
