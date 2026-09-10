# Scraping AsyncTI4 game data for AI training

This note documents **how to pull all game data from [https://asyncti4.com/](https://asyncti4.com/)** so it can be used to train an AI (win-rate / pick-rate calibration, endgame prediction, and move-sequence learning). The mechanics were reverse-engineered from the site's public JS bundle and verified against the live API. A working tool lives in [`scripts/scrape_asyncti4.py`](../scripts/scrape_asyncti4.py).

---

## 1. The public API

AsyncTI4's website is a client-rendered React app, but it talks to a **public, unauthenticated JSON backend**. All live game data is behind this base URL:

```
https://bot.asyncti4.com/api
```

Two endpoints carry all the data we want — both are plain `GET / JSON`, no auth, no cookies:

| Endpoint | What it returns |
|---|---|
| `GET /api/public/game/<gameName>/web-data` | The **full game snapshot**: board layout, tile units, every faction's techs / cards / units / command tokens, objectives + progress, score breakdowns, card decks & discard pools, laws, strategy cards, and the `gameState` header (`phase`, `activePlayer`, `winner`, round). Available for **all** games — finished and live. |
| `GET /api/public/game/<gameName>/events` | The **move-by-move log** of a game. Each event carries a `seq`, `round`, `phase`, `faction`, a structured `payload` describing the action, a `timestamp`, and — for board-mutating moves — a full serialised `mapState` board snapshot. **Only present for LIVE / in-progress games** (see §3). |

### Game IDs

Game names are of the form `pbd<N>` and map directly to the site URL — `https://asyncti4.com/game/pbd13920` ↔ API game `pbd13920`. IDs are **mostly sequential** from `pbd1` up to the current ceiling (roughly `pbd28xxx` at the time of writing), with occasional gaps. A missing ID returns `HTTP 400` (with a Spring-style `{"status":404,"message":"No static resource..."}` error body — the 400 is the "not found / pruned" signal).

The repo already has **24,585 finished games** in [`data/asyncti4/statistics.json`](../data/asyncti4/statistics.json); every record's `asyncGameID` field is a valid game name, so that file doubles as a ready-made game-ID list.

---

## 2. What `web-data` contains

`web-data` is the richest available snapshot and is ideal for **supervised endgame / win-rate / pick-rate / strategy-calibration** learning. Top-level keys:

- `gameState` — `phase` (`finished`, `setup.draft`, `miltydraft`, `strategy`, `action`, `agenda.voting`, …), `activePlayer`, `activeSystem`, `winner`, `turnStartedAt`.
- `playerData` — per player: faction, colour, `technologies`, `strategyCards`, `commandTokens`, `planetsTaken`, objectives, `units`, `promissoryNotes`, `leaders`, commanders/heroes used, trade goods, eliminated flag, etc.
- `objectives` — all/stage-1/stage-2/custom objectives with per-faction `factionProgress` and `scoredFactions`.
- `scoreBreakdowns` — per-faction entries with objective key, `pointValue` and `SCORED` state.
- `tilePositions` / `tileUnitData` — board layout and live unit/control/PDS/ground-force placement per tile.
- `cardPool` — action/agenda/explore/relic/secret/tech decks and discards.
- `lawsInPlay`, `strategyCards` (picked-by-faction, exhausted), `expeditions`, `borderAnomalies`.
- `gameRound`, `vpsToWin`, `ringCount`, `gameName`, `gameCustomName`.

This is essentially a superset of what `statistics.json` already aggregates — the difference is that `web-data` is the *raw structured state* (tile-level unit placement, deck composition, progress counters) rather than the compressed summary.

---

## 3. What `events` contains — and the crucial catch

`events` is the **move-sequence** data — the part `statistics.json` does *not* have, and the part needed to train an agent to actually make decisions over time.

Each event is shaped like:

```json
{
  "seq": 21,
  "archetype": "TACTICAL_ACTION",
  "round": 1,
  "phase": "action",
  "faction": "hacan",
  "timestamp": 1786347242225,
  "payload": {
    "summary": "Activated 317 (Tiamat/Hercalor). Moved ships there. ...",
    "activeSystem": "317",
    "planetsTaken": "_tiamat_hercalor",
    "subEvents": [ { "type": "CONTROL_ESTABLISHED", "planet": "tiamat" } ]
  },
  "mapState": "[1,[\"000\",...]"   // full serialised board snapshot (present on mutating moves)
}
```

`archetype` is the move vocabulary (all seen in a real game):

| archetype | payload highlights |
|---|---|
| `TACTICAL_ACTION` | `activeSystem`, `planetsTaken`, `subEvents`, human-readable `summary` — the core move |
| `TURN` | `passed` (pass/skip) |
| `TECH_RESEARCHED` | `techId`, `paymentType` |
| `SC_PICKED` / `SC_PLAYED` | `scNumber` / `scName` |
| `TRANSACTION` | `from`, `to`, `items` (commodities, TGs, promissory) |
| `OBJECTIVE_SCORED` / `STATUS_SCORING` | objective id, category, faction |
| `AGENDA_RESOLVED` | agenda id/name, `outcome`, `votes` |
| `CARD_PLAY_*` | action card / agent / promissory / breakthrough / ability plays |
| `PHASE_STARTED`, `ROUND_STARTED` | phase / round boundaries |
| `MANUAL_COMMAND` | the raw Discord command (e.g. `/draft faction add …`) |

A typical full game logs **300–450 events**, and ~1/3 of them (every board-mutating move) carry a `mapState` — a compact serialised array giving the board state at that moment. That makes `events` a directly usable **state → action** dataset.

### The catch: finished games lose their log — but only after a ~2-month window

The `/events` log survives for a while after a game finishes, then is **pruned by a rolling retention window**. This is what a sweep of finished games showed:

```
pbd13920 events=0     # finished long ago → pruned
pbd23000 events=0     # pruned
pbd25100 events=0     # turnStarted 2026-07-01 → pruned
pbd25220 events=1     # ~2026-06-15 → right at the edge
pbd25240 events=459   # ended 2026-08-25 → retained
pbd25300 events=72    # 2026-07-08 → retained
pbd26000 events=410   # 2026-07-23 → retained
pbd27000 events=461
pbd27800 events=603
pbd28000 events=509   # ends with a GAME_ENDED event
```

The server "now" is ~2026-09-10 (newest games are in `setup.draft`). Finished games whose last activity (`gameState.turnStartedAt`) is **after roughly mid-June / early-July 2026** still carry their **full move log, ending with a `GAME_ENDED` event**; finished games older than that have been purged to `[]`. In other words there is a **rolling ~2-month retention window**: every day, games age out and are lost, while newly-finished games enter the retained zone.

**Consequences:**
- Old finished games (your full `statistics.json` corpus below ~`pbd25300`) are **permanently without move history** — that data is unrecoverable.
- But **~3,500 recently-finished games (IDs `pbd25300`–`pbd28900`) are sitting in the retained window *right now*** with complete move logs, and can be harvested retroactively **before they age out**. This is a one-time windfall that is shrinking by the day — it should be the first thing you fetch.
- Going forward, capture `/events` continuously so no game's history is ever lost to pruning (see §5).

---

## 4. Two distinct training corpora

| Corpus | Source | Covers | Good for |
|---|---|---|---|
| **Final-state** snapshot | `data/asyncti4/statistics.json` (24.5k finished) **or** `web-data` | all finished games, regardless of age | heuristics / calibration (win rates, tech & strategy-card pick lift, command-token targets), endgame & win prediction |
| **Move-sequence** events | `/events` on **live** games and finished-but-unpruned games | ~2 months of recent games (≈3.5k now) + anything captured going forward | training an agent to *play* — state→action pairs, APM / tempo, opening theory, agenda & trade behaviour |

For a decision-making agent you want mostly the second corpus. A chunk of it is **retroactively available right now** in the retention window, but it is a shrinking, perishable resource — collect it immediately and keep collecting live thereafter.

---

## 5. Practical scraping

The tool at [`scripts/scrape_asyncti4.py`](../scripts/scrape_asyncti4.py) implements both corpora:

```bash
# Final-state snapshots of every finished game already known to statistics.json
python3 scripts/scrape_asyncti4.py snapshot --from-dataset

# ... or by explicit ID / range
python3 scripts/scrape_asyncti4.py snapshot --id pbd13921
python3 scripts/scrape_asyncti4.py snapshot --range 13900 14000

# Move-sequence logs (live games only)
python3 scripts/scrape_asyncti4.py events --ids 27750 28100

# Probe which IDs exist (find the live tail, map gaps)
python3 scripts/scrape_asyncti4.py discover --min 1 --max 28800
```

Output lands under `data/asyncti4/raw/` as `<gameName>.webdata.json` and `<gameName>.events.json`.

### Recommended pipeline for move-sequence capture

Because events age out after the ~2-month retention window (see §3), build the move-sequence corpus in two passes:

**Pass 1 — harvest the current windfall immediately.** The retained window (`pbd25300`–`pbd28900`, ≈3.5k games) is shrinking by the day. Fetch every ID in that range *now*, and keep re-running until all finish and are saved:

```bash
python3 scripts/scrape_asyncti4.py events --range 25300 28900 --out data/asyncti4/raw
```

**Pass 2 — keep collecting live thereafter.** A **continuously recurring collector** (cron / systemd timer) that:

1. Probes the ID space upward to locate the current ceiling (the new-game boundary rises as games are created).
2. Runs `events` on every new / in-progress / unpruned game ID.
3. Tracks which games have already been captured (the `raw/` directory itself, or a state file) so it only fetches new or changed logs.
4. Marks a game complete once its `web-data` shows `phase: "finished"` and its `events` ends with a `GAME_ENDED` event (so no further polling is needed for it).

This front-runs the pruning: a game's log is saved the moment you collect it, so it survives both the game finishing and the eventual purge.

---

## 6. Gotchas learned the hard way

- **The server bot-filters by TLS fingerprint, and Python's `urllib` gets throttled.** A `urllib` request to `web-data` is artificially stalled ~120s (TLS/JA3 fingerprint bot-defense — same class of defence Cloudflare uses), while **curl completes in ~0.7s** on the very same URL and headers. The scraper therefore shells out to **curl** for every request. If you write your own client, use curl (or a library with a browser/curl-grade TLS fingerprint), or every request will hang for minutes.
- **`HTTP 400` means "game not found / pruned", not necessarily a bad request.** Use it as the skip signal.
- **Events are a shrinking resource.** The retention window (~2 months) means old finished games are permanently pruned; harvest the current window promptly and collect continuously so nothing new is lost. (See §3.)
- **Rate limits / politeness.** The endpoint is public, but run big batches with a small `--sleep` between requests and consider asking the AsyncTI4 maintainers first (repo: `AsyncTI4/TI4_map_generator_bot`) — they may already distribute a bulk dataset and are the right people to consult on terms of use.
- **A finished game can still be a dud.** `phase: "finished"` with `winner: null` (often ending at round 1) is an abandoned/stalled game, not a real completion. Filter on `winner != null` (and, for competitive data, exclude `homebrew`, `discordantStarsMode`, `frankenGame`, `absolMode`) — the same filters `calibrate-asyncti4.ts` already applies.

---

## 7. Related assets in this repo

- [`scripts/calibrate-asyncti4.ts`](../scripts/calibrate-asyncti4.ts) — consumes `statistics.json` (final-state corpus) to build `src/ai/calibrationData.ts` (faction win rates, tech/SC pick lifts, fleet-token targets).
- [`data/asyncti4/statistics.json`](../data/asyncti4/statistics.json) — the 24.5k finished-game dataset (source of game IDs for `--from-dataset`).
- [`scripts/scrape_asyncti4.py`](../scripts/scrape_asyncti4.py) — the scraper this document describes.
