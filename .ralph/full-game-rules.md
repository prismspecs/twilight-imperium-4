
## Iteration status — DOCS COMPLETE

Final verification (docs-only task, no `src/` touched, so no test/tsc/lint gate required):
- Working tree clean, all commits pushed to `origin/main` (Vercel deployment).
- `docs/spec/` now contains complete LRR: `lrr.md` (109 glossary sections, LRR v2.0 base+Codices),
  `lrr-components.md`, `lrr-quick.md`, `lrr-index.md`, `lrr-factions.md`.
- `docs/spec/game-rules.md` rewritten for the full base game + Codices, 2-6 players; no "duel"/"Bereg"/"trade post"
  remnants.
- `docs/spec/lrr-excerpts.md` and `docs/spec/trade-posts.md` removed.
- `CLAUDE.md` and `engine-design.md` updated.
- Commits: c51a56d, c1f30e2, 153406c, b4af440, 28425b9.

Deferred (code-touching, out of scope for this docs task): removing the duel-only trade posts, Bereg map and
emergency shipyard from the engine code itself (flagged as legacy in engine-design.md). That is a future
iteration and would need the full `npm test`/`tsc`/`lint` gate.
