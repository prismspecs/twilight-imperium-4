// src/ui/board/SystemInfo.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine'
import { BASE_CONFIG } from '../../engine/testUtils'
import type { GameState } from '../../engine/types'
import { SystemInfo } from './SystemInfo'

describe('SystemInfo', () => {
  it('displays infantry and structures on planets when inspecting a tile', () => {
    const base = createGame(BASE_CONFIG, 1)
    const state: GameState = {
      ...base,
      systems: {
        ...base.systems,
        'tile-21': {
          ...base.systems['tile-21'],
          planets: [
            {
              id: 'thibah',
              name: 'Thibah',
              resources: 1,
              influence: 1,
              trait: 'industrial',
              techSkip: 'blue',
              owner: 0,
              exhausted: false,
              ground: [
                { id: 101, type: 'infantry', owner: 0, damaged: false },
                { id: 102, type: 'infantry', owner: 0, damaged: false },
                { id: 103, type: 'infantry', owner: 0, damaged: false },
              ],
              structures: [
                { id: 201, type: 'spacedock', owner: 0, damaged: false },
              ],
            },
          ],
        },
      },
    }

    render(<SystemInfo state={state} systemId="tile-21" onClose={() => {}} />)

    // Verify planet name and control
    expect(screen.getByTestId('system-info-planet-thibah').textContent).toContain('Thibah')
    expect(screen.getByTestId('system-info-planet-thibah').textContent).toContain('Controlled by')

    // Verify ground row is rendered with infantry
    const groundEl = screen.getByTestId('system-info-ground-thibah')
    expect(groundEl).toBeTruthy()
    expect(screen.getByTestId('stack-system-info-ground-thibah-0-infantry')).toBeTruthy()
    expect(screen.getByTestId('stack-system-info-struct-thibah-0-spacedock')).toBeTruthy()
    expect(screen.getByTestId('stack-system-info-ground-thibah-0-infantry').textContent).toContain('3')
  })
})
