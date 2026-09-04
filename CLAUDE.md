# Mecatol Duel

Full Twilight Imperium 4 (base game plus Codices), for 2-6 players (primarily 6). Pure TypeScript rules engine in `src/engine/` and `src/data/`, React UI on top, Vitest tests next to the modules.

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
- Every system on the map is composed: a background tile plus a rendered planet per planet, plus one nameplate design (resource hexagon, influence shield, tapered name banner). No tile with planets and values printed into the art.
- Units are shown as the models on the board, in the player's colour, everywhere they are named: the panels, the movement picker, the production picker, the technology list.
