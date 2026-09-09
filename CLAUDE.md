# Mecatol Online

Full Twilight Imperium 4 (base game plus Codices), for 2-6 players (primarily 6). This is the complete base game of TI4 (all 17 factions, 8 strategy cards, 101 action cards, 50 agendas, 20 public objectives + secrets, 6 promissory notes, 51-tile galaxy, anomalies, wormholes) with Codices I–IV updates. It is not a 2-player duel variant; any remaining duel-only mechanics in the code (e.g. trade posts) are legacy and should be removed. Pure TypeScript rules engine in `src/engine/` and `src/data/`, React UI on top, Vitest tests next to the modules. The complete rules text is `docs/spec/lrr.md` (LRR v2.0 incl. Codices) and `docs/spec/lrr-components.md`.

## Rules for every change

- Commit after every logical step, in small commits: the failing test, the implementation, each fix, each doc change gets its own commit. Never bundle several tasks into one commit.
- Push every commit to `main` as soon as it is green. `main` is wired to Vercel, so a push is a deployment and the player sees the fix immediately. Do not sit on a stack of local commits.
- Conventional commit messages (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), English only.
- Before a commit that touches `src/`: `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` must be clean.
- Engine and data modules: strict TypeScript, no `any`, no non-null assertions, no React/DOM/Node imports, never mutate an input `GameState`, all randomness from the seed passed in, every dice roll logged.
- The spec in `docs/spec/game-rules.md` is the binding authority; plans in `docs/superpowers/plans/` argue from it. Rulings taken during execution are recorded in the plan's `.ledger.md`.

## Rules the interface must respect

- The chess clock runs for whoever has to decide something, in every phase, not only in the action phase. It stops only for the handoff screen and the end of the game.
- A card's secondary offers the whole printed ability, never a convenient stub. Warfare's secondary is a full production at the home space dock, not a single infantry.
- When something is not possible, the interface says why in words: the asteroid field that needs Antimass Deflectors, the fleet in the way, plain range. "Nothing can reach this system" on its own is a bug report waiting to happen.
- The generated galaxy (3-6 players, the primary mode) uses the AsyncTI4 catalog tile art (`public/assets/tiles/NN_Name.png`), which prints the planet's name, resources and influence directly into the image — no separate nameplate overlay for it. The (legacy, to-be-removed) fixed 2-player map composes a plain background plus a rendered planet per planet plus its own nameplate. Either way, live game state (control, structures, ground forces, command tokens) is always drawn on top, never baked into art.
- Units are shown as the models on the board, in the player's colour, everywhere they are named: the panels, the movement picker, the production picker, the technology list.

## Diagnostics

- The dev server appends every `debugLogger` entry — AI move choices, rejected moves, crashes — to `debug.log` in the repo root (`GET /api/debug-log`, clear with `POST /api/debug-log/clear`). It survives page reloads, so it is the first place to look when a game stalls or an AI seat stops moving. Browser `error`/`unhandledrejection` events and ErrorBoundary catches land there too.
- Saved games live in the browser's localStorage under `md:game:<CODE>` (index `md:games`); `src/ui/persist.ts` normalises old payloads on load. The `state` plus the full `history` of snapshots are in there, which is what a post-mortem needs.
- Vite strips types without checking them: only `npx tsc -p tsconfig.app.json --noEmit` catches a missing import before it becomes a runtime `ReferenceError` in the browser. Never commit `src/` changes while it is red.
