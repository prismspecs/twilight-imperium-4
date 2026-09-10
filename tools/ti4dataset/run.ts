/**
 * Extract a state->action dataset from raw AsyncTI4 game files.
 *
 * Reads `<game>.events.json` (move log) and `<game>.webdata.json` (final state),
 * decodes the boards, replays player state, and writes `<out>/<game>.ndjson`,
 * one JSON object per decision-point record.
 *
 * Usage:
 *   npx tsx tools/ti4dataset/run.ts <events.json> <webdata.json> [--out DIR]
 */
import fs from 'node:fs'
import path from 'node:path'
import { decodeBoard, hasBoard } from './decoder'
import { mapEvent, CLONE_ARCHETYPES } from './map'
import { Replay } from './replay'
import type { RawEvent, RawWebData } from './types'

/** Stats for the unmapped-rate report (plan milestone 2: target <5%). */
export interface DatasetReport {
  game: string
  records: number
  cloneRecords: number
  mapped: number
  unmappedClone: number
  bookkeeping: number
  unmappedRate: number
  reasons: Record<string, number>
}

export function extractGame(fileName: string, events: RawEvent[], web?: RawWebData): { records: Record<string, unknown>[]; report: DatasetReport } {
  const replay = new Replay(events, web).run()
  const records: Record<string, unknown>[] = []
  const report: DatasetReport = {
    game: fileName,
    records: 0,
    cloneRecords: 0,
    mapped: 0,
    unmappedClone: 0,
    bookkeeping: 0,
    unmappedRate: 0,
    reasons: {},
  }

  for (const e of events) {
    if (e.archetype === 'MANUAL_COMMAND') continue // not a game action record
    const board = hasBoard(e) ? decodeBoard(e.mapState as string) : null
    if (!board) continue // no board snapshot -> skip (TURN/PHASE events mostly)

    const players = replay.snapshot()
    const mapped = mapEvent(e)
    report.records += 1
    const isClone = CLONE_ARCHETYPES.has(e.archetype)
    if (isClone) report.cloneRecords += 1
    if (mapped.mapped) {
      report.mapped += 1
    } else if (isClone) {
      report.unmappedClone += 1
      const r = mapped.reason ?? e.archetype
      report.reasons[r] = (report.reasons[r] ?? 0) + 1
    } else {
      report.bookkeeping += 1
    }

    records.push({
      game: fileName,
      seq: e.seq,
      round: e.round,
      phase: e.phase,
      faction: e.faction,
      archetype: e.archetype,
      payload: e.payload,
      action: mapped.action,
      mapped: mapped.mapped,
      reason: mapped.reason,
      board,
      players,
    })
  }
  const total = report.mapped + report.unmappedClone
  report.unmappedRate = total > 0 ? report.unmappedClone / total : 0
  return { records, report }
}

function writeReport(reports: DatasetReport[], outDir: string): void {
  const merged: Record<string, number> = {}
  let records = 0, mapped = 0, unmappedClone = 0, bookkeeping = 0
  for (const r of reports) {
    records += r.records
    mapped += r.mapped
    unmappedClone += r.unmappedClone
    bookkeeping += r.bookkeeping
    for (const [k, v] of Object.entries(r.reasons)) merged[k] = (merged[k] ?? 0) + v
  }
  const total = mapped + unmappedClone
  const rate = total > 0 ? unmappedClone / total : 0
  const lines = [
    '# Dataset mapping report',
    '',
    `- games: ${reports.length}`,
    `- records (board-carrying events): ${records}`,
    `- cloning targets (mapped, in CLONE_ARCHETYPES): ${mapped}`,
    `- bookkeeping events (not cloning labels): ${bookkeeping}`,
    `- UNMAPPED cloning targets: ${unmappedClone} (${(rate * 100).toFixed(1)}% of cloning targets)`,
    '- unmapped reasons (cloning targets only):',
    ...Object.entries(merged).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  - ${k}: ${v}`),
  ]
  const target = path.join(outDir, 'report.md')
  fs.writeFileSync(target, lines.join('\n') + '\n', 'utf8')
  console.log(`report -> ${target} (${unmappedClone} unmapped / ${total} cloning targets = ${(rate * 100).toFixed(1)}%)`)
}

// ---- CLI ----
function main(): void {
  const args = process.argv.slice(2)
  const outFlag = args.indexOf('--out')
  const outDir = outFlag >= 0 ? args[outFlag + 1] : 'data/asyncti4/dataset'
  const files = args.filter((a) => !a.startsWith('--') && !['--out'].includes(a))
  if (files.length < 1) {
    console.error('usage: npx tsx tools/ti4dataset/run.ts <events.json> [<webdata.json> ...] [--out DIR]')
    process.exit(1)
  }

  fs.mkdirSync(outDir, { recursive: true })
  const reports: DatasetReport[] = []
  // Each pair or single file is an independent game.
  const gameFiles = files.reduce<{ events: string; web: string | null }[]>((acc, f) => {
    if (f.endsWith('.events.json')) acc.push({ events: f, web: null })
    else if (f.endsWith('.webdata.json') && acc.length && !acc[acc.length - 1].web) acc[acc.length - 1].web = f
    return acc
  }, [])

  for (const game of gameFiles) {
    const events = JSON.parse(fs.readFileSync(game.events, 'utf8')) as RawEvent[]
    const web = game.web ? (JSON.parse(fs.readFileSync(game.web, 'utf8')) as RawWebData) : undefined
    const base = path.basename(game.events).replace(/\.events\.json$/, '')
    const { records, report } = extractGame(base, events, web)
    const target = path.join(outDir, `${base}.ndjson`)
    fs.writeFileSync(target, records.map((r) => JSON.stringify(r)).join('\n'), 'utf8')
    reports.push(report)
    console.log(`wrote ${records.length} records -> ${target}`)
    if (records.length === 0) console.warn(`  WARN: no records for ${base}; check retention window / event shape`)
  }
  writeReport(reports, outDir)
}

if (process.argv[1]?.includes('ti4dataset/run')) main()
