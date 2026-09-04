// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { FACTIONS } from '../../data/factions'
import { createGame } from '../../engine'
import { listGames, saveGame } from '../persist'
import type { FactionId, UnitType } from '../../engine/types'

function startingCount(faction: FactionId, type: UnitType): number {
  return FACTIONS[faction].startingUnits.filter(u => u.type === type).reduce((n, u) => n + u.count, 0)
}

function renderApp(hash = '#/?seed=7') {
  window.location.hash = hash
  return render(<App ticking={false} />)
}

/** A game already in this browser's storage, as if it had been started earlier. */
function savedGame(code: string, north: string, south: string) {
  const state = createGame({
    players: [{ faction: 'l1z1x', color: 'blue', name: north }, { faction: 'letnev', color: 'red', name: south }],
    speaker: 0,
  }, 7)
  saveGame({ code, seed: 7, minutes: 15, state, history: [], clockMs: [900000, 900000], handoff: null })
}

describe('the setup screen', () => {
  it('offers seats with the factions and the eight TI colours', () => {
    renderApp()
    expect(screen.getByTestId('seat-faction-0').textContent).toBe('L1Z1X Mindnet')
    expect(screen.getByTestId('seat-faction-1').textContent).toBe('Barony of Letnev')
    expect(screen.getByTestId('seat-position-0').textContent).toBe('East')
    expect(screen.getByTestId('seat-position-1').textContent).toBe('North-West')
    expect(screen.getAllByTestId(/^colour-0-/)).toHaveLength(8)
  })

  it('swaps the factions between the seats', () => {
    renderApp()
    fireEvent.click(screen.getByTestId('btn-swap-factions'))
    expect(screen.getByTestId('seat-faction-0').textContent).toBe('Barony of Letnev')
    expect(screen.getByTestId('seat-faction-1').textContent).toBe('L1Z1X Mindnet')
  })

  it('R2: keeps the colours distinct across seats', () => {
    renderApp()
    expect(screen.getByTestId('colour-1-blue').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('colour-1-green').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByTestId('colour-1-yellow'))
    expect(screen.getByTestId('chosen-colour-1').textContent).toBe('Yellow')
    expect(screen.getByTestId('colour-0-yellow').hasAttribute('disabled')).toBe(true)
  })

  it('starts the game and shows the board', () => {
    renderApp()
    fireEvent.change(screen.getByTestId('seat-name-0'), { target: { value: 'Despot' } })
    fireEvent.change(screen.getByTestId('seat-name-1'), { target: { value: 'Kael' } })
    fireEvent.click(screen.getByTestId('btn-start'))
    expect(screen.getByTestId('board-screen')).toBeTruthy()
    expect(screen.getByTestId('round').textContent).toBe('Round 1 of 8, strategy phase')
  })

  it('offers hot-seat play now and disables the two online panels until they ship', () => {
    renderApp()
    expect(screen.getByTestId('landing-hotseat').querySelector('button')?.hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('landing-online').querySelector('button')?.hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('landing-join').querySelector('button')?.hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('landing-online').textContent).toContain('coming with online play')
    expect(screen.getByTestId('landing-join').textContent).toContain('coming with online play')
  })

  it('lists the starting fleet as a row of unit sprites with counts', () => {
    renderApp()
    // l1z1x: dreadnought, carrier, fighter, infantry, pds, spacedock
    expect(screen.getByTestId('seat-0-fleet').querySelectorAll('img')).toHaveLength(6)
    expect(screen.getByTestId('seat-0-fleet-fighter-count').textContent).toBe('3')
    expect(screen.getByTestId('seat-0-fleet-infantry-count').textContent).toBe('5')
    // letnev: dreadnought, carrier, destroyer, fighter, infantry, spacedock
    expect(screen.getByTestId('seat-1-fleet').querySelectorAll('img')).toHaveLength(6)
    expect(screen.getByTestId('seat-1-fleet-fighter-count').textContent).toBe('1')
    expect(screen.getByTestId('seat-1-fleet-infantry-count').textContent).toBe('3') // 2 on Arc Prime, 1 on Wren Terra
  })

  it('presents the lobby as a hot-seat lobby with all seats taken', () => {
    renderApp()
    expect(screen.getByTestId('lobby-tab').textContent).toContain('Hot-seat')
    expect(screen.getByTestId('lobby-status').textContent).toContain('3 of 3 seats taken')
  })

  it('shows a leader portrait and a faction symbol for each seat', () => {
    renderApp()
    expect(screen.getByAltText('L1Z1X Mindnet portrait').getAttribute('src')).toBe('/assets/factions/leader_l1z1x_commander.png')
    expect(screen.getByAltText('Barony of Letnev portrait').getAttribute('src')).toBe('/assets/factions/leader_letnev_commander.png')
    expect(screen.getByTestId('seat-symbol-0').getAttribute('src')).toBe('/assets/factions/l1z1x.png')
    expect(screen.getByTestId('seat-symbol-1').getAttribute('src')).toBe('/assets/factions/letnev.png')
  })

  it('spells the starting fleet out under the sprites', () => {
    renderApp()
    const fighters = startingCount('l1z1x', 'fighter')
    const infantry = startingCount('l1z1x', 'infantry')
    expect(screen.getByTestId('seat-0-fleet-caption').textContent)
      .toBe(`Super-Dreadnought I, Carrier, ${fighters} Fighters, ${infantry} Infantry, PDS, Space Dock`)
    expect(screen.getByTestId('seat-1-fleet-caption').textContent)
      .toBe(`Dreadnought, Carrier, Destroyer, Fighter, ${startingCount('letnev', 'infantry')} Infantry, Space Dock`)
  })

  it('names the starting techs of both factions', () => {
    renderApp()
    expect(screen.getByTestId('seat-0-techs').textContent).toBe('Neural Motivator, Plasma Scoring')
    expect(screen.getByTestId('seat-1-techs').textContent).toBe('Antimass Deflectors, Plasma Scoring')
  })

  it('names the map, the clock and the target below the seats', () => {
    renderApp()
    expect(screen.getByTestId('setup-map').textContent).toContain('Generated Galaxy')
    expect(screen.getByTestId('setup-clock').textContent).toContain('minutes per player')
    expect(screen.getByTestId('setup-target').textContent).toContain('10 victory points or 8 rounds')
    expect(screen.getByTestId('minutes').getAttribute('value')).toBe('15')
  })

  it('keeps the hot-seat blurb in step with the clock', () => {
    renderApp()
    expect(screen.getByTestId('landing-hotseat').textContent).toContain('chess clock 15 minutes each')
    fireEvent.change(screen.getByTestId('minutes'), { target: { value: '20' } })
    expect(screen.getByTestId('landing-hotseat').textContent).toContain('chess clock 20 minutes each')
  })

  it('has no saved-games block until this browser holds a game', () => {
    renderApp()
    expect(screen.queryByTestId('saved-games')).toBeNull()
  })

  it('lists the saved games newest first and resumes the one that is picked', () => {
    savedGame('AAA222', 'Despot', 'Kael')
    savedGame('BBB333', 'Ada', 'Bo')
    renderApp()
    const rows = screen.getAllByTestId(/^saved-game-/)
    expect(rows.map(row => row.getAttribute('data-testid'))).toEqual(['saved-game-BBB333', 'saved-game-AAA222'])
    expect(rows[0].textContent).toContain('Ada')
    expect(rows[0].textContent).toContain('Bo')
    expect(rows[0].textContent).toContain('BBB333')
    expect(rows[0].textContent).toContain('Round 1')
    expect(rows[0].textContent).toContain('just now')

    fireEvent.click(screen.getByTestId('btn-resume-AAA222'))
    expect(window.location.hash).toBe('#/g/AAA222')
    expect(screen.getByTestId('board-screen')).toBeTruthy()
    expect(screen.getByTestId('player-0').textContent).toContain('Despot')
  })

  it('scales the page down by what the saved-games block adds, rather than scrolling', () => {
    renderApp()
    const bare = screen.getByTestId('setup-screen').style.zoom
    cleanup()
    savedGame('AAA222', 'Despot', 'Kael')
    renderApp()
    const withOne = screen.getByTestId('setup-screen').style.zoom
    expect(Number(withOne)).toBeGreaterThan(0)
    expect(Number(withOne)).toBeLessThan(Number(bare))
    cleanup()
    savedGame('BBB333', 'Ada', 'Bo')
    renderApp()
    expect(Number(screen.getByTestId('setup-screen').style.zoom)).toBeLessThan(Number(withOne))
  })

  it('deletes one saved game and leaves the others alone', () => {
    savedGame('AAA222', 'Despot', 'Kael')
    savedGame('BBB333', 'Ada', 'Bo')
    renderApp()
    fireEvent.click(screen.getByTestId('btn-delete-AAA222'))
    expect(screen.queryByTestId('saved-game-AAA222')).toBeNull()
    expect(screen.getByTestId('saved-game-BBB333')).toBeTruthy()
    expect(listGames().map(game => game.code)).toEqual(['BBB333'])
  })

  it('credits Fantasy Flight Games, AsyncTI4 and the music the licence asks it to name', () => {
    renderApp()
    const legal = screen.getByTestId('setup-legal').textContent ?? ''
    expect(legal).toContain('Twilight Imperium and its artwork belong to Fantasy Flight Games')
    expect(legal).toContain('Unit, tile and card images via AsyncTI4')
    expect(legal).toContain('Kevin MacLeod')
    expect(legal).toContain('Creative Commons By Attribution 4.0')
  })

  it('supports selecting 3 to 6 players and updates seats and map target accordingly', () => {
    renderApp()
    fireEvent.click(screen.getByTestId('player-count-3'))
    expect(screen.getByTestId('seat-position-0').textContent).toBe('East')
    expect(screen.getByTestId('seat-position-1').textContent).toBe('North-West')
    expect(screen.getByTestId('seat-position-2').textContent).toBe('South-West')
    expect(screen.getByTestId('setup-map').textContent).toContain('Generated Galaxy (34 systems)')
    expect(screen.getByTestId('setup-target').textContent).toContain('10 victory points')
    expect(screen.getByTestId('lobby-status').textContent).toContain('3 of 3 seats taken')

    fireEvent.click(screen.getByTestId('player-count-6'))
    expect(screen.getByTestId('seat-position-5')).toBeTruthy()
    expect(screen.getByTestId('setup-map').textContent).toContain('Generated Galaxy (37 systems)')
    expect(screen.getByTestId('lobby-status').textContent).toContain('6 of 6 seats taken')
  })

  it('allows picking any of the 17 factions and updates techs, fleet, and commodities', () => {
    renderApp()
    fireEvent.change(screen.getByTestId('select-faction-0'), { target: { value: 'sol' } })
    expect(screen.getByTestId('seat-faction-0').textContent).toBe('Federation of Sol')
    expect(screen.getByTestId('seat-0-techs').textContent).toContain('Antimass Deflectors')
    expect(screen.getByTestId('seat-0-commodities').textContent).toContain('4')
  })

  it('starts a 3-player game on the generated galaxy', () => {
    renderApp()
    fireEvent.click(screen.getByTestId('player-count-3'))
    fireEvent.click(screen.getByTestId('btn-start'))
    expect(screen.getByTestId('board-screen')).toBeTruthy()
    expect(screen.getByTestId('player-0')).toBeTruthy()
    expect(screen.getByTestId('player-1')).toBeTruthy()
    expect(screen.getByTestId('player-2')).toBeTruthy()
    expect(screen.getByTestId('tile-mecatol')).toBeTruthy()
  })
})
