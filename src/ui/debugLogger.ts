import { unitStats } from '../data/units'
import { neighbours } from '../engine/adjacency'
import { pathLength } from '../engine/movement'
import type { GameState, Seat } from '../engine/types'

export interface DebugLogEntry {
  id: number
  time: string
  level: 'INFO' | 'WARN' | 'ERROR'
  category: string
  message: string
  data?: unknown
}

let nextEntryId = 1
const entries: DebugLogEntry[] = []
const listeners = new Set<() => void>()
const MAX_IN_MEMORY_ENTRIES = 500

export function getDebugLogEntries(): readonly DebugLogEntry[] {
  return entries
}

export function subscribeDebugLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearDebugLog(): void {
  entries.length = 0
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    fetch('/api/debug-log/clear', { method: 'POST' }).catch(() => {})
  }
  notifyListeners()
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // ignore listener error
    }
  }
}

function sendToServer(entry: DebugLogEntry) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return
  try {
    fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      // Dev server might not be running or route unavailable
    })
  } catch {
    // ignore fetch exceptions
  }
}

export function logDebug(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string, data?: unknown) {
  const entry: DebugLogEntry = {
    id: nextEntryId++,
    time: new Date().toISOString(),
    level,
    category,
    message,
    data,
  }

  entries.push(entry)
  if (entries.length > MAX_IN_MEMORY_ENTRIES) {
    entries.shift()
  }

  // Also output to console with prefix
  const style = level === 'ERROR' ? 'color: red' : level === 'WARN' ? 'color: orange' : 'color: cyan'
  if (typeof console !== 'undefined') {
    if (level === 'ERROR') {
      console.error(`[${entry.category}] ${message}`, data !== undefined ? data : '')
    } else if (level === 'WARN') {
      console.warn(`[${entry.category}] ${message}`, data !== undefined ? data : '')
    } else {
      console.log(`%c[${entry.category}] ${message}`, style, data !== undefined ? data : '')
    }
  }

  sendToServer(entry)
  notifyListeners()
}

export function logInfo(category: string, message: string, data?: unknown) {
  logDebug('INFO', category, message, data)
}

export function logWarn(category: string, message: string, data?: unknown) {
  logDebug('WARN', category, message, data)
}

export function logError(category: string, message: string, data?: unknown) {
  logDebug('ERROR', category, message, data)
}

/** Diagnoses why no ship or which ships can reach targetSystemId from current state for seat. */
export function diagnoseMovement(state: GameState, seat: Seat, targetSystemId: string): string[] {
  const target = state.systems[targetSystemId]
  if (!target) return [`Unknown target system: ${targetSystemId}`]
  const player = state.players[seat]
  if (!player) return [`Unknown player seat: ${seat}`]

  const reports: string[] = []
  const hasToken = target.activatedBy.includes(seat)
  if (hasToken) {
    reports.push(`Target ${target.id} (${target.name}) already has seat ${seat}'s command token.`)
  }

  if (player.tokens.tactic < 1) {
    reports.push(`Seat ${seat} has 0 tactic command tokens (cannot activate systems).`)
  }

  const bonus = player.techs.includes('gravity_drive') ? 1 : 0
  let totalShipsFound = 0
  let eligibleShipsFound = 0

  for (const sys of Object.values(state.systems)) {
    const myShips = sys.space.filter(u => u.owner === seat && (u.type === 'carrier' || u.type === 'cruiser' || u.type === 'destroyer' || u.type === 'dreadnought' || u.type === 'warsun' || u.type === 'flagship'))
    if (myShips.length === 0) continue

    totalShipsFound += myShips.length
    const sysActivated = sys.activatedBy.includes(seat)
    const isTarget = sys.id === targetSystemId

    if (isTarget) {
      reports.push(`${myShips.length} ship(s) sit in target system ${sys.id} (ships in destination cannot move into it).`)
      continue
    }

    if (sysActivated) {
      reports.push(
        `${myShips.length} ship(s) in ${sys.id} (${sys.name}) CANNOT move: system already contains seat ${seat}'s command token (LRR 49.2: ships cannot move out of an activated system).`
      )
      continue
    }

    // System is unactivated, check reachability for each ship
    for (const ship of myShips) {
      const stats = unitStats(ship.type, { faction: player.faction, techs: player.techs })
      const move = stats.move + bonus
      const len = pathLength(state, seat, sys.id, targetSystemId, move)
      const directNeighbours = neighbours(state.systems, sys.id)
      const isDirectNeighbour = directNeighbours.includes(targetSystemId)

      if (len !== null) {
        eligibleShipsFound++
        reports.push(
          `Ship ${ship.type} #${ship.id} in ${sys.id} CAN reach ${target.name} (move ${move}, path distance ${len}, adjacent: ${isDirectNeighbour}).`
        )
      } else {
        const lenIgnoreFleets = pathLength(state, seat, sys.id, targetSystemId, move, true)
        if (lenIgnoreFleets !== null) {
          reports.push(
            `Ship ${ship.type} #${ship.id} in ${sys.id} (move ${move}) could reach ${target.name} but path is BLOCKED by hostile fleets.`
          )
        } else {
          reports.push(
            `Ship ${ship.type} #${ship.id} in ${sys.id} (move ${move}) cannot reach ${target.name} (out of range, direct neighbour: ${isDirectNeighbour}).`
          )
        }
      }
    }
  }

  if (totalShipsFound === 0) {
    reports.push(`Seat ${seat} has no ships in space on the board.`)
  } else if (eligibleShipsFound === 0) {
    reports.push(`Total 0 ships in range of ${target.name}.`)
  }

  return reports
}
