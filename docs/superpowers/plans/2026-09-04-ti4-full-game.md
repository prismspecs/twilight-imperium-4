# Expand Mecatol Duel into the Full Twilight Imperium 4 Base Game (with Codices), 6 players

**Goal:** Take the current 2-player TI4 distillation and expand it into the entire TI4 4th edition base game (with Codices I–IV errata/updates layered on base content), playable by up to 6 players (e.g. 1 human + 5 bots).

**Current state:** 2-player duel, L1Z1X vs Letnev, 6 strategy cards, custom trade-post minigame, no action cards / agendas / promissory notes / secret objectives, map and engine hardcoded to 2 seats. All 455 tests pass; tsc and lint clean.

**Authoritative rules data:** cloned to `/tmp/ti4-rules` from `prismspecs/ti4` (factions, strategy cards, objectives, action cards, agendas, promissory notes, technology, unit upgrades, planets, content-set registry, full living rules reference).

**Binding spec:** `docs/spec/game-rules.md` and `docs/spec/engine-design.md` — both currently describe the duel and must be rewritten/extended to cover the full base game.

## Scope decisions

- **Base game + Codices I–IV layered on base only.** PoK-only and TE-only content is out (content_sets.json is the authority). This includes: no exploration/frontier tokens/relics (PoK), no leaders/mechs (PoK), no Alliance promissory notes (Codex II needs commanders/PoK), no Council Keleres (Codex III needs PoK). Thunder's Edge entirely out.
- 17 base factions.
- Full base game decks filtered to base: objectives (Stage I/II + secret), action cards, agendas, promissory notes, technology + unit upgrades, 8 strategy cards.
- 3 to 6 players; speaker, snake draft, initiative order, agenda phase, status phase.
- Bots generalized to N seats.

## Architecture sequence

1. Generalize engine from 2 to N players (`types.ts` and all consumers).
2. Full data import (factions, techs/upgrades, objectives, action cards, agendas, promissory notes, 8 strategy cards, map tiles/planets, anomalies, wormholes).
3. Full setup + draft (map gen, faction/colour pick, speaker, starting units/techs, decks, deals).
4. Full round structure: strategy (8 cards, initiative), action (tactical/strategic/component/pass), agenda (new), status.
5. Politics + Construction strategy cards.
6. Agendas, action cards, promissory note mechanics.
7. Faction abilities across 17 factions.
8. Bots for N players.
9. UI: setup for up to 6 players, 6-player board, new panels.

Rulings made while executing are recorded in `2026-09-04-ti4-full-game.ledger.md`.
