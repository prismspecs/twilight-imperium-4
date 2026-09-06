// src/ui/flows/CombatDialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toActionPhase, withTactical, withUnits } from '../../engine/testUtils'
import { BoardScreen } from '../screens/BoardScreen'
import { renderWithSession } from '../test/harness'
import type { LogEntry } from '../../engine/types'

describe('CombatDialog and combat outcome visibility', () => {
  it('renders rich rolls and casualties in CombatDialog with coordinate-prefixed system labels', () => {
    let s = withUnits(toActionPhase(), 'bereg', 0, ['cruiser', 'fighter'])
    s = withUnits(s, 'bereg', 1, ['destroyer'])
    s = withTactical(s, {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 0,
        defender: 1,
        retreating: null,
        retreatTo: null,
        lastRolls: [
          { owner: 0, unit: 'cruiser', value: 8, hit: true },
          { owner: 0, unit: 'fighter', value: 4, hit: false },
          { owner: 1, unit: 'destroyer', value: 2, hit: false },
        ],
        pending: [],
      },
    })
    s = {
      ...s,
      log: [
        ...s.log,
        {
          t: 'roll',
          owner: 0,
          context: 'combat round 1',
          rolls: [
            { owner: 0, unit: 'cruiser', value: 8, hit: true },
            { owner: 0, unit: 'fighter', value: 4, hit: false },
          ],
        },
        {
          t: 'roll',
          owner: 1,
          context: 'combat round 1',
          rolls: [
            { owner: 1, unit: 'destroyer', value: 2, hit: false },
          ],
        },
        { t: 'info', text: 'seat 1 loses: 1 destroyer destroyed in bereg' },
      ],
    }

    renderWithSession(s, <BoardScreen />)

    // Check system label in combat dialog header
    expect(screen.getByTestId('combat-dialog').textContent).toContain('[104] Bereg')

    // Check rolls display
    const roll0 = screen.getByTestId('combat-rolls-0')
    expect(roll0.textContent).toContain('Cruiser I: [8] ★ HIT')
    expect(roll0.textContent).toContain('Fighter I: [4] miss')
    expect(roll0.textContent).toContain('1 hit')

    const roll1 = screen.getByTestId('combat-rolls-1')
    expect(roll1.textContent).toContain('Destroyer I: [2] miss')
    expect(roll1.textContent).toContain('0 hits')

    // Check casualties event box
    expect(screen.getByText(/Casualties & Hit Assignments/i)).toBeTruthy()
    expect(screen.getByText(/B loses: 1 destroyer destroyed in \[104\] Bereg/i)).toBeTruthy()
  })

  it('renders combat-outcome-banner when combat ends and dismisses on click', () => {
    let s = toActionPhase()
    s = withTactical(s, {
      systemId: 'bereg',
      step: 'movement',
    })
    const combatWinEntry: LogEntry = {
      t: 'info',
      text: 'space combat in bereg won by seat 0',
    }
    const casualtyEntry: LogEntry = {
      t: 'info',
      text: 'seat 1 loses: 1 cruiser destroyed in bereg',
    }
    s = {
      ...s,
      log: [...s.log, casualtyEntry, combatWinEntry],
    }

    renderWithSession(s, <BoardScreen />)

    const banner = screen.getByTestId('combat-outcome-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('Space Combat Decided')
    expect(banner.textContent).toContain('victorious in [104] Bereg')
    expect(banner.textContent).toContain('B loses: 1 cruiser destroyed')

    // Click continue
    fireEvent.click(screen.getByTestId('btn-dismiss-combat-outcome'))
    expect(screen.queryByTestId('combat-outcome-banner')).toBeNull()
  })

  it('renders modal overlay, D10 dice cards with values, and allows toggling action cards drawer', () => {
    let s = withUnits(toActionPhase(), 'bereg', 0, ['cruiser'])
    s = withUnits(s, 'bereg', 1, ['fighter'])
    s = withTactical(s, {
      systemId: 'bereg',
      step: 'spaceCombat',
      combat: {
        round: 1,
        attacker: 0,
        defender: 1,
        retreating: null,
        retreatTo: null,
        lastRolls: [
          { owner: 0, unit: 'cruiser', value: 9, hit: true },
          { owner: 1, unit: 'fighter', value: 3, hit: false },
        ],
        pending: [],
      },
    })
    // Give player 0 an action card and add combat rolls to log
    s = {
      ...s,
      players: [
        { ...s.players[0], actionCards: ['direct_hit_1'] },
        s.players[1],
      ],
      log: [
        ...s.log,
        {
          t: 'roll',
          owner: 0,
          context: 'combat round 1',
          rolls: [{ owner: 0, unit: 'cruiser', value: 9, hit: true }],
        },
        {
          t: 'roll',
          owner: 1,
          context: 'combat round 1',
          rolls: [{ owner: 1, unit: 'fighter', value: 3, hit: false }],
        },
      ],
    }

    renderWithSession(s, <BoardScreen />)

    // Modal overlay wraps the combat dialog
    expect(screen.getByTestId('combat-modal-overlay')).toBeTruthy()
    expect(screen.getByTestId('combat-dialog')).toBeTruthy()

    // Matchup and Roll Button
    expect(screen.getByTestId('btn-combat-round').textContent).toContain('Roll combat dice')

    // D10 dice cards
    const hitCard = document.querySelector('.d10-die-card.is-hit')
    expect(hitCard).toBeTruthy()
    expect(hitCard?.textContent).toContain('9')
    expect(hitCard?.textContent).toContain('HIT')

    const missCard = document.querySelector('.d10-die-card.is-miss')
    expect(missCard).toBeTruthy()
    expect(missCard?.textContent).toContain('3')

    // Action Cards drawer toggle
    expect(screen.queryByTestId('combat-action-cards')).toBeNull()
    const toggleBtn = screen.getByText(/▼ Action Cards \(1\)/i)
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('combat-action-cards')).toBeTruthy()
    expect(screen.getByText('Direct Hit')).toBeTruthy()

    // Turn action HUD banner
    expect(screen.getByTestId('turn-action-hud')).toBeTruthy()
    expect(screen.getByTestId('turn-action-hud').textContent).toContain('Space Combat in [104] Bereg')
  })
})

