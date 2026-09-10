# Training the Mecatol Online AI from AsyncTI4 game data

This plan is grounded in the data we actually pulled: four complete games harvested from AsyncTI4's
retained window (`pbd26500`, `pbd27000`, `pbd27800`, `pbd28000`, each with a `winner`, 450–600 move
events, and full `web-data` final snapshots), decoded from their raw event logs. It proposes a concrete
pipeline to turn AsyncTI4 games into training signal for *this repo's* engine and AI
(`src/engine/`, `src/ai/`).

> Corpus mechanics (API, endpoints, retention window) are in
> [`docs/scraping-asyncti4.md`](./scraping-asyncti4.md). The scraper is
> [`scripts/scrape_asyncti4.py`](../scripts/scrape_asyncti4.py).

---

## 1. What the raw data actually gives us

Each complete game yields two artifacts. The example analysis below is from `pbd27800` (7 players,
winner `lime`, 603 events).

### `/events` — the move log (state → action signal)

Every event has `seq`, `round`, `phase`, `faction`, `timestamp`, and a structured `payload`. The move
vocabulary observed:

| archetype | count | payload carries |
|---|---|---|
| `TURN` | 216 | passed (pass / take another action) |
| `TACTICAL_ACTION` | 100 | `activeSystem`, `planetsTaken`, `combat` (vs faction), `subEvents` (COMBAT space/ground, LEADER_PLAYED, PRODUCTION, CONTROL_ESTABLISHED), human `summary` |
| `TECH_RESEARCHED` | 42 | `techId`, `paymentType` |
| `SC_PICKED` / `SC_PLAYED` | 73 | `scNumber` (1–8) |
| `CARD_PLAY_ACTION_CARD` | 28 | `cardId`, `cardName` |
| `TRANSACTION` | 24 | `from`, `to`, `items` (commodities / TGs / promissory) |
| `CARD_PLAY_AGENT` / `_HERO` / `_RELIC` / `_ABILITY` | 39 | `cardId` |
| `OBJECTIVE_SCORED` / `STATUS_SCORING` | 16 | objective id, category, faction, sub-events |
| `AGENDA_RESOLVED` | 7 | agenda id/name, `outcome`, `votes` |
| `PHASE_STARTED` / `ROUND_STARTED` / `GAME_ENDED` | 24 | boundaries + `winner` |

**175 of 603 events also carry a `mapState` snapshot** — a compact serialised board: `[round, tile₁, …,
tile₄₀]`, where each tile has system id, activation flag, space units, planets with controller and
ground units, command tokens, PDS and control tokens. Every `TACTICAL_ACTION` (the core decision) is
accompanied by one.

### `/web-data` — the final state (label / supervision signal)

The final snapshot gives full player detail (`technologies`, `strategyCards`, `commandTokens`,
`objectives`, score breakdowns, units, trade goods, eliminated flags), objectives with per-faction
progress, laws passed, and the `winner`. This is the ground-truth label for each complete game.

---

## 2. What is recoverable per move — and what is not

This determines the honest shape of the dataset.

**Recoverable from `mapState` (board space):**
- Full board layout: which units are in which system, planet ownership, activation tokens, PDS,
  command tokens on tiles, wormhole/control tokens.

**Recoverable by replaying events (accumulated over the log):**
- **Techs** — each `TECH_RESEARCHED` reveals a tech the moment it is researched, so we can rebuild
  each faction's tech tree at any time index.
- **Strategy cards** — `SC_PICKED`/`SC_PLAYED` give the full drafting and play sequence.
- **Objective scoring** — `OBJECTIVE_SCORED`/`STATUS_SCORING` reveal when each objective fell.
- **Trades** — `TRANSACTION` items reconstruct commodity/TG/promissory flows.
- **Agenda outcomes** — `AGENDA_RESOLVED` gives every vote + outcome.

**Not directly recoverable from this log (hidden tracker state):**
- Exact **hand contents** (action cards / secret objectives each player is *holding*) — the `payload`
  reveals a card *when it is played* but not the unseen hand.
- Each player's **command-token pool / trade goods balance** between the snapshots (only final totals
  are in `web-data`).
- **Dice rolls** — combat is recorded as a *result* (who fought whom, who won) with `expectedHits`/
  `actualHits` finally in `web-data`, but not per-round roll-by-roll.

The per-move `mapState` is board-only, so **the clean, load-bearing training interface is the board +
the action**. Player hidden state is a partially-observable residual (as in any real TI game this repo
already models).

---

## 3. Recommended approach: supervised imitation on state → action

The AsyncTI4 logs are naturally a **cloning / behaviour-cloning corpus**: for each decision point we
have the observed board state and the action a (typically strong) human took next. This is the most
straightforward, highest-value use — it does not require us to run AsyncTI4's engine at all.

### 3.1 Build a state→action extractor (new module `tools/ti4dataset/`)

Converts a raw game (`events` + `web-data`) into a flat list of training records:

```
record = {
  gameId, seq, round, phase, faction (the actor),
  board:   <decoded mapState board, expressed in src/engine/types>,
  tech:    <reconstructed tech trees for all factions up to this move>,
  sc:      <strategy-card picks/plays up to this move>,
  objectives: <scored objectives + progress up to this move>,
  action:  <the move, in this repo's action schema>   ← the label
}
```

Steps:
1. **Decode `mapState`** → `GameState`-shaped board (map AsyncTI4 tile ids 101/201/… and unit codes
   `ca/cv/dd/dn/ff/gf/mf/sd/fs/ws/pds` onto this repo's `src/engine/types`).
2. **Replay accumulation** — walk events in `seq` order, maintaining tech/SC/objective/trade state as
   §2 describes.
3. **Map each action** onto this repo's action vocabulary (`TACTICAL_ACTION` → activate system +
   movement + production; `TECH_RESEARCHED` → research; `SC_PICKED` → pick strategy card; pass → done;
   etc.). Where AsyncTI4's schema and this repo's differ, map conservatively and emit an `unmapped`
   flag rather than a wrong action.
4. **Filter** to decisions the AI actually makes: the primary actor's `TACTICAL_ACTION` /
   `TECH_RESEARCHED` / `SC_PICKED` / `TURN`.

### 3.2 Training interface (what the AI sees)

Reuse the existing `src/ai` scoring/selector rather than a from-scratch network if possible — this repo
already has a heuristic `moveScorer` / `PERSONALITIES`. Two escalating options:

- **(A) Behaviour distillation into the existing heuristic scorer.** For each action type, learn
  per-faction weight vectors (e.g. "which techs does a strong Saar player take first", "how many fleet
  tokens do winners keep", "which SC does each faction prefer at pick N"). This is an *extension of the
  existing `calibrate-asyncti4.ts`* (which already derives win-rate/pick-rate from the final-state
  stats) but now using the *per-move* sequence to capture **order and tempo**, not just final outcomes.
- **(B) A true imitative model.** Train a head that, given the state vector, predicts the observed
  next action. This is the real "teach it to play" route and needs the state encoder from 3.1.

**Recommendation:** start with **(A)** — it is low-risk, fits the existing architecture, and directly
sharpens the current heuristic AI. Keep **(B)** as the stretch goal once the dataset is healthy.

### 3.3 Supervision "panels" (each is a concrete, measurable training target)

1. **Tech order / tempo** — `TECH_RESEARCHED` sequence by faction & victory outcome. Learn: which tech a
   faction researches 1st/2nd/3rd, and its lift on winning.
2. **Opening (round 1) strategy** — first `SC_PICKED` + first `TACTICAL_ACTION` per faction, conditioned
   on slice/map. Teaches the AI the standard openings.
3. **Expansion vs conflict** — `TACTICAL_ACTION` `activeSystem` distribution over rounds; when players
   attack (`combat` present, vs faction) vs expand (planets taken, no combat).
4. **Tech→objective follow-through** — correlate `TECH_RESEARCHED` with `OBJECTIVE_SCORED` to learn
   *which objectives the winning faction is teching toward*.
5. **Endgame timing** — `STATUS_SCORING` / `GAME_ENDED`; how near 10VP winning boards act.
6. **Action-card & transaction behaviour** — `CARD_PLAY_ACTION_CARD` timing and `TRANSACTION` item flow.

### 3.4 Evaluation (how we know it's better)

- **Cross-round backtest:** hold out whole games; at each decision point, ask the trained AI what it
  would do and compare to what the winner/near-winner actually did.
- **Win-rate A/B against the current heuristic AI:** run the existing `scripts/ai-match.ts` round-robin
  (heuristic-only vs distilled-tempo vs imitative) across many seeds. A distilled model with better
  tempo should raise win-rate — that is the concrete signal it learned something real.
- **Calibration variance:** confirm the learned weights match the empirical win-lift from
  `statistics.json` (so the per-move distillation is *consistent* with the 24.5k-game aggregate).

---

## 4. Data hygiene and scale

- **Filter to complete, real games:** `winner != null`, `phase == finished`, and exclude
  `homebrew`, `discordantStarsMode`, `frankenGame`, `absolMode` (same filters `calibrate-asyncti4.ts`
  uses). Abandoned/stalled games (`winner == null`, often R1) are noise.
- **Filter by field size:** this repo targets 6-player (and general 2–6). AsyncTI4 games are usually
  4–8 players. Prefer 6-player games, and pin the player count in each record so the model can
  generalise.
- **Version alignment:** AsyncTI4 runs PoK + Codices + a lot of homebrew/constant-homebrew content
  (faction names like `firmament`, `keleresm`, `cabal` are from their expanded pool, and some map tiles
  differ from base TI4). Map carefully; unknown factions/tiles/techs must be skipped or aliased, never
  silently misread.
- **Scale target:** the retained window currently holds ~3,500 games; the final-state corpus holds 24.5k.
  For behaviour cloning on tactical actions (~100 per 7-player game), even 300–1000 complete games
  gives 30k–100k decision instances — plenty to start with panel (A).
- **Privacy / ToS:** data is public but person-identifying (Discord IDs, usernames). Strip these from
  any dataset we ship; ask the AsyncTI4 maintainers before a large sustained scrape; run with a
  politeness delay.

---

## 5. Concrete milestones

1. **Harvest + parse** (1–2 sessions): run `scripts/scrape_asyncti4.py events --range …` over the
   retained window; build `tools/ti4dataset/decode.ts` to parse mapState + events into a typed
   intermediate; validate against known `web-data` finals.
2. **Action mapping** (2 sessions): map decoded events onto `src/engine/types` actions; emit the
   training records; write the `unmapped`-rate report (target <5%).
3. **Panel (A) distillation** (2 sessions): extend `calibrate-asyncti4.ts` to consume the per-move
   records; derive tempo/order weights per faction; wire into the heuristic scorer.
4. **Backtest + A/B** (1 session): cross-game held-out backtest; `npm run ai:match` before/after;
   confirm lift and no regression on existing personalities.
5. **Stretch — imitative head (B):** train a state→action predictor on the same records for the games
   where panel (A)'s lift saturates.

The immediate, highest-value next step is **milestone 2** interactively on the 4 games already pulled
(`/tmp/complete_games/*.events.json`), to lock down the action mapping and prove the pipeline before a
full ~3,500-game harvest.
