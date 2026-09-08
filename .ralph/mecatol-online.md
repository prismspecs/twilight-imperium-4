## Goal
(1) Rename project from "Mecatol Duel" to "Mecatol Online" everywhere; (2) fully remove ALL duel-only content (trade posts / postAbilities / posts data / TRADE_POSTS links / Bereg flower map / emergency shipyard / duel-specific objective pool) from code, docs and assets.

## Authoritative scope (from prior iterations)
- Source of rules: `/tmp/ti4-rules` (complete LRR v2.0 base+Codices) — already imported to `docs/spec/lrr.md`
- Spec cleaned: `docs/spec/game-rules.md` rewritten; `lrr-excerpts.md` and `trade-posts.md` removed; `engine-design.md` updated with legacy flags
- User directive: trade posts and any other duel-only content removed; project renamed to Mecatol Online

## Items
1. Rename all references to "Mecatol Duel" / "mecatol-duel" / "Mecatol_Duel" across repo (package.json, index.html, meta tags, CLAUDE.md, docs, data references, source code strings, theme CSS, assets, .ralph, .git references). Push.
2. Remove `src/data/posts.ts`; empty or remove `TRADE_POSTS` references from `src/data/map.ts`; remove `src/engine/postAbilities.ts`; edit `componentActions.ts` to remove commodity-sale/post references; edit `setup.ts` to remove trade-post roll; edit `types.ts` / `legalMoves` / `statusPhase` / etc. that reference posts.
3. Remove `src/ui/board/TradePosts.tsx`; edit `BoardMap.tsx`, `ActionBar.tsx`, `ComponentPanel.tsx` to drop post UI.
4. Delete any duel-only asset directories (e.g. `public/assets/posts/` if only trade posts).
5. Verify `git status` clean; commit with `chore:` / `docs:` / `feat:` / `fix:` messages; push to `main`; final verification command documented.

## Rules
- Small commits, conventional messages, English only.
- Before each commit touching `src/`: `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` must be green.
- Never delete working base-game engine modules (combat, movement, etc.). Only delete duel-only modules.
- If removal breaks tests, fix the tests too (they become red when duel content is removed — that's expected; fix them to match the new state).