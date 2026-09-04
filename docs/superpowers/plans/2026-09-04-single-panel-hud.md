# TACTICAL_READOUT: single-panel HUD reorganization

## Objective
The visual redesign (gold → graphite/blue, IBM Plex, machined chrome) landed, but the layout itself still
crammed everything into the old fixed-dock: two side columns, a bloated top bar with oversized player
blocks, and strategy cards framed in a narrow strip. Nothing was collapsible, so a small window turned the
strategy-card row into an unreadable scroll. Reorganize the chrome around the AsyncTI4/ti4_web_new
"tabs and panels" idea: one sensible side panel, collapsible sections, a narrower top bar, and larger
readable strategy cards.

## Non-goals
- No engine rules change (all 527 tests must stay green).
- No change to the board map geometry or the map element itself.

## Plan
### Task 1 — Remove the redundant right panel
- BoardScreen renders one `SidePanel` (left) instead of two.
- The single panel follows the active player by default; clicking a seat tab overrides it for the turn,
  and it snaps back when the active seat changes.
- SidePanel drops the `side` prop and the `colL`/`colR` classes; it uses a `side-panel` class.

### Task 2 — Collapsible, scrollable side panel
- The panel is a fixed-height column with its content (`pcontent`) scrolling.
- Every group (VP, Command tokens, Planets, Technologies, Forces, Secret Objectives) becomes a `Section`
  with a clickable header (arrow + title) that collapses the body.
- A compact seat-tab strip is always visible (P1/P2/... in 3+ players, faction name in 2 players).

### Task 3 — Slim, readable top bar
- Replace the two oversized `pblock` player blocks with compact `player-strip` rows (portrait, name, VP,
  clock, runbar, turn chip).
- Strategy cards grow to 72x92 so the card art is legible; the hover popup keeps the big art.
- Objectives become compact cards fitting the smaller bar.
- Layout constants updated in `useViewportScale` (single 272px gutter, 100px top + 56px bottom bars).

### Task 4 — Tests
- Update layout tests for the single-panel world and the new scale constants.
- Tests that inspect a primary's result after the turn passes now flip the panel to seat 0 via the tab.

## Rulings
- The panel follows the active player (best hot-seat ergonomics) rather than being a static seat-0 column.
- 2-player games get a seat-tab strip too (faction names) so either seated player can inspect the other's
  panel mid-turn.
- The board scales up to fill the wider single-gutter stage (s > 1 at 1440x900); it is no longer locked
  to the authored 940x698 size.
