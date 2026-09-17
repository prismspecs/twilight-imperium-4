# Mecatol Online

Full Twilight Imperium 4 (base game + Codices I–IV), 2–6 players (primarily 6). Pure TypeScript rules engine in `src/engine/` and `src/data/`, React UI on top, Vitest tests alongside modules. Authority specs: [docs/spec/lrr.md](docs/spec/lrr.md) and [docs/spec/game-rules.md](docs/spec/game-rules.md). Unwired backlog: [docs/spec/unwired.md](docs/spec/unwired.md).

## Rules for Every Change

- **Micro-commits**: Commit after every logical step (failing test, implementation, doc change). Never bundle tasks.
- **Push immediately**: Push green commits directly to `main` (auto-deploys to Vercel). Conventional commit format (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
- **Pre-commit checks**: Before touching `src/`, ensure `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, and `npm run lint` are clean.
- **Engine integrity**: Strict TypeScript, no `any`, no non-null assertions, no React/DOM/Node imports in engine. Never mutate input `GameState`. Deterministic PRNG from seed; log all dice rolls.
- **Rules authority**: [docs/spec/game-rules.md](docs/spec/game-rules.md) is binding. Consult spec via `ti4-rules` skill (`.agents/skills/ti4-rules/scripts/spec-section.sh "<name>"`) before modifying cards/abilities/units.

## Interface Rules

- **Chess clock**: Runs for active decider in every phase (stops only for handoff and game end).
- **Full abilities**: Card secondaries offer full abilities (e.g. Warfare = full production at home dock).
- **Explicit blockers**: Explain impossible moves in words (asteroid field requiring Antimass, fleet in way, range).
- **Galaxy rendering**: AsyncTI4 catalog tile art (`public/assets/tiles/NN_Name.png`) with baked stats. Live game state is drawn on top.
- **Player units**: Rendered as colored models everywhere named (panels, pickers, tech lists).

## Working Defaults

- **Fast path**: Run only the targeted test file, commit, and push. Long verification runs in background.
- **Narrow reads**: Targeted grep and specific line ranges over full-file reads.

## Diagnostics & Troubleshooting

- App logs append to `debug.log` in root (`GET /api/debug-log`, `POST /api/debug-log/clear`).
- Saved games persist in `localStorage` under `md:game:<CODE>`.
- Full troubleshooting guide (Vite cache, white screens, type checking): [docs/spec/diagnostics.md](docs/spec/diagnostics.md).
