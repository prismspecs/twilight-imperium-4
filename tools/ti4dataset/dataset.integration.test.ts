// tools/ti4dataset/dataset.integration.test.ts
// Integration check against the *extracted* dataset (data/asyncti4/dataset/*.ndjson),
// produced by running tools/ti4dataset/run.ts. Skips cleanly when the data isn't
// present so the whole suite never breaks on a missing (large, optional) fixture.
// Run: npx vitest run tools/ti4dataset/dataset.integration.test.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(process.cwd(), 'data/asyncti4/dataset')

function loadRecords(): Record<string, unknown>[] | null {
  if (!existsSync(DIR)) return null
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ndjson'))
  const out: Record<string, unknown>[] = []
  for (const f of files) {
    for (const line of readFileSync(join(DIR, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line) as Record<string, unknown>)
    }
  }
  return out
}

describe('extracted dataset invariants', () => {
  const records = loadRecords()
  it.runIf(!!records)('every record has a parseable board with >= 30 tiles', () => {
    for (const r of records!) {
      const board = r.board as { round: number; tiles: Record<string, unknown> }
      expect(board.round).toBeGreaterThanOrEqual(1)
      expect(Object.keys(board.tiles).length).toBeGreaterThanOrEqual(30)
      expect(r.archetype).toBeTruthy()
      expect(typeof r.seq).toBe('number')
    }
  })
  it.runIf(!!records)('board-carrying action records carry an actor faction, board snapshots parse', () => {
    // AGENDA_RESOLVED is a collective outcome, not attributed to one actor faction.
    const actorArchetypes = ['TACTICAL_ACTION', 'TECH_RESEARCHED', 'SC_PICKED', 'PLAYER_STATUS', 'TRANSACTION']
    for (const r of records!) {
      expect(r.payload).toBeTruthy()
      if (actorArchetypes.includes(r.archetype as string)) {
        expect(r.faction).toBeTruthy()
      }
    }
  })
  it.runIf(!!records)('at least one tactical action exists across the dataset', () => {
    expect(records!.some((r) => r.archetype === 'TACTICAL_ACTION')).toBe(true)
  })
})
