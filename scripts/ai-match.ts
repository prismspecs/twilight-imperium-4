/**
 * Run a round-robin of AI personalities against each other across a set of seeds and print a win matrix.
 *
 * This is the observation surface for co-evolution: it shows which personality beats which, how often, and
 * whether any seat ever throws an illegal move (a "corrupt" run a trainer must discard).
 *
 * Usage:
 *   npm run ai:match                 # all personalities, seeds 1..20
 *   npm run ai:match -- 30           # all personalities, seeds 1..30
 *   npm run ai:match -- 20 aggressive economist   # just two personalities, seeds 1..20
 */
import { playMatch } from '../src/ai'
import { PERSONALITIES, type ScoreWeights } from '../src/ai/score'
import { DUEL_CONFIG } from '../src/engine/testUtils'

const args = process.argv.slice(2)
const seedCount = Number.parseInt(args[0] ?? '20', 10) || 20
const only = args.slice(1)

const names = only.length ? only : Object.keys(PERSONALITIES)
const fallback: Readonly<ScoreWeights> = PERSONALITIES.balanced
const weights: Readonly<ScoreWeights>[] = names.map(n => PERSONALITIES[n] ?? fallback)

interface Stats { w: number; l: number; d: number }
const stats: Stats[][] = names.map(() => names.map(() => ({ w: 0, l: 0, d: 0 })))

let corrupt = 0
for (let a = 0; a < names.length; a += 1) {
  for (let b = 0; b < names.length; b += 1) {
    for (let seed = 1; seed <= seedCount; seed += 1) {
      const r = playMatch(DUEL_CONFIG, seed, [weights[a], weights[b]])
      if (r.failed !== null) { corrupt += 1; continue }
      if (r.winner === 0) stats[a][b].w += 1
      else if (r.winner === 1) stats[a][b].l += 1
      else stats[a][b].d += 1
    }
  }
}

const width = Math.max(...names.map(n => n.length), 8) + 2
const pad = (s: string) => s.padStart(width)
let out = `\nAI personality win matrix — row beats column, ${seedCount} seeds each\n\n`
out += pad('') + names.map(n => pad(n)).join('') + '\n'
for (let a = 0; a < names.length; a += 1) {
  out += pad(names[a]) + names.map((_n, b) => pad(`${stats[a][b].w}`)).join('') + '\n'
}
out += `\ncorrupt runs (a seat threw an illegal move): ${corrupt}\n`
process.stdout.write(out)
