/**
 * Replays an AsyncTI4 event log to reconstruct player off-board state (techs,
 * strategy cards, objectives, points) at each decision point. The board geometry
 * comes from each event's own `mapState`; this module reconstructs the rest by
 * walking events in `seq` order.
 *
 * Reconstruction scope (see docs/training-plan-asyncti4.md §2):
 *  - techs        : revealed by TECH_RESEARCHED
 *  - strategy cards: revealed by SC_PICKED / SC_PLAYED
 *  - objectives    : revealed by OBJECTIVE_SCORED / STATUS_SCORING
 *  - points        : summed from scored objectives where values are inferable
 * Hidden hand contents (action cards / secrets not yet played) are NOT recoverable.
 */
import type { RawEvent, RawWebData, ReplayPlayer } from './types'

export class Replay {
  private players = new Map<string, ReplayPlayer>()
  private roundTechs: { round: number; faction: string; tech: string }[] = []

  constructor(private events: RawEvent[], private web?: RawWebData) {}

  allPlayerKeys(): string[] {
    return Array.from(this.players.keys())
  }

  player(faction: string): ReplayPlayer {
    let p = this.players.get(faction)
    if (!p) {
      p = {
        faction,
        techs: [],
        techsByRound: {},
        strategyCards: [],
        scoredObjectives: [],
        vp: 0,
      }
      this.players.set(faction, p)
    }
    return p
  }

  private ensurePlayer(faction: string | null): ReplayPlayer | null {
    if (!faction || faction === 'null') return null
    return this.player(faction)
  }

  private applyTech(faction: string, tech: string, round: number): void {
    const p = this.player(faction)
    if (!p.techs.includes(tech)) p.techs.push(tech)
    ;(p.techsByRound[round] ??= []).push(tech)
    this.roundTechs.push({ round, faction, tech })
  }

  private applyScoredObjective(faction: string, objective: string, points: number): void {
    const p = this.player(faction)
    if (!p.scoredObjectives.includes(objective)) {
      p.scoredObjectives.push(objective)
      p.vp += points
    }
  }

  /** Walk the event log, applying every state-mutating event to the running players. */
  run(): this {
    for (const e of this.events) {
      const pay = e.payload
      switch (e.archetype) {
        case 'TECH_RESEARCHED': {
          const f = this.ensurePlayer(e.faction)
          const tech = String((pay as { techId?: string }).techId ?? '')
          if (f && tech) this.applyTech(f.faction, tech, e.round)
          break
        }
        case 'SC_PICKED': {
          const f = this.ensurePlayer(e.faction)
          if (f) {
            const sc = Number((pay as { scNumber?: number }).scNumber)
            if (!Number.isNaN(sc) && !f.strategyCards.includes(sc)) f.strategyCards.push(sc)
          }
          break
        }
        case 'OBJECTIVE_SCORED': {
          const f = this.ensurePlayer(e.faction)
          if (f) {
            const obj = String((pay as { objectiveId?: string }).objectiveId ?? '')
            if (obj) this.applyScoredObjective(f.faction, obj, pointsFor(e))
          }
          break
        }
        case 'STATUS_SCORING': {
          // Contains subEvents: [{type:'OBJECTIVE_SCORED', faction, objectiveId, category}, ...]
          const subs = (pay as { subEvents?: unknown[] }).subEvents ?? []
          for (const s of subs as { type?: string; faction?: string; objectiveId?: string; category?: string }[]) {
            if (s.type === 'OBJECTIVE_SCORED' && s.faction && s.objectiveId) {
              this.applyScoredObjective(s.faction, s.objectiveId, pointsFor({ ...e, payload: s }))
            }
          }
          break
        }
        default:
          break
      }
    }
    // Lay web-data final values on top (authoritative end state).
    if (this.web) {
      for (const pd of this.web.playerData ?? []) {
        const p = this.player(pd.faction)
        p.finalVp = pd.totalVps
        p.eliminated = pd.eliminated
        if (pd.techs?.length) {
          for (const t of pd.techs) if (!p.techs.includes(t)) p.techs.push(t)
        }
      }
    }
    return this
  }

  /** Clone-of-state at a given event index (for producing per-move records). */
  snapshot(): Record<string, ReplayPlayer> {
    const out: Record<string, ReplayPlayer> = {}
    for (const [k, v] of this.players) {
      out[k] = { ...v, techs: [...v.techs], strategyCards: [...v.strategyCards], scoredObjectives: [...v.scoredObjectives] }
    }
    return out
  }
}

/** Best-effort point value for a scored objective (1 public stage I, 2 public stage II, 1 secret). */
function pointsFor(e: RawEvent): number {
  const cat = String((e.payload as { category?: string }).category ?? '')
  const key = String((e.payload as { objectiveId?: string }).objectiveId ?? '')
  if (cat === 'PUBLIC') {
    // Stage II public objectives (imperial stage) — heuristic from vps; keep 1 by default.
    return /^[A-Z]|ii|2$/.test(key) ? 2 : 1
  }
  return 1 // secret / stage I / custom (custodian is 1)
}
