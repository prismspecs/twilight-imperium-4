---
name: ti4-rules
description: Wiring or fixing ANY Twilight Imperium rule in this repo — a card, faction ability, tech, unit, agenda, or phase. The spec in docs/spec/ is the binding authority and it has caught the agent guessing wrong more than once; consult it BEFORE writing code. Includes scripts/spec-section.sh for section-aware search over the thousands of lines.
---

# TI4 Rules: consult the spec before you wire

This repo's binding authority is `docs/spec/` (per CLAUDE.md). It is several thousand lines across four
files, and it has repeatedly proven more reliable than the agent's memory of TI4:

- **Fleet Logistics** is a *technology* granting one extra action per turn, not an action card — and its
  five clarifications (lrr-components.md, `### Fleet Logistics`) pin edge cases no one guesses correctly.
- **Arborec Mitosis** bans dock-produced *infantry*, but the same FAQ (lrr-factions.md 9-13, 39-43) gives
  every Letani Warrior `PRODUCTION 1`, pooled — the faction CAN build infantry, just not at docks.
- **Nekro Galactic Threat** says "cannot vote", which must mean the seat never enters the vote order —
  wiring it as "zero legal outcomes" deadlocked a live game.

Never wire a rule from memory. Follow this workflow.

## The spec map

| file | what it is | cite as |
|---|---|---|
| `docs/spec/game-rules.md` | the binding authority; plans argue from it | the plan's `.ledger.md` |
| `docs/spec/lrr.md` | LRR v2.0 incl. Codices, the numbered rules | `R3.2`, `LRR 91.3` in comments |
| `docs/spec/lrr-components.md` | per-component FAQ: action cards, tech, units, objectives, agendas | `lrr-components.md <line>:` in comments |
| `docs/spec/lrr-factions.md` | per-faction FAQ: abilities, units, flagship, leaders, mech | `lrr-factions.md <line>:` in comments |

## Workflow for any card/ability/tech/unit/agenda

1. **Printed text first.** Find the card/ability in `src/data/` — the engine treats that text as the
   contract. If the printed text is ambiguous, the FAQ section resolves it; do not improvise.
2. **Read its whole spec section.** Run:

   ```bash
   .agents/skills/ti4-rules/scripts/spec-section.sh "Fleet Logistics"
   .agents/skills/ti4-rules/scripts/spec-section.sh "Mitosis" factions   # optional file filter
   ```

   Read the ENTIRE `###` section for the component, not just the first hit — clarifications lower in the
   section routinely invert what the top implies (see Mitosis above). Also scan the other sections the
   script prints: cards are frequently clarified inside *other* cards' sections (Fleet Logistics is
   clarified under Puppets On A String and Sabotage too).
3. **Read the numbered rule for the mechanic** in `lrr.md` (production, movement, voting...) — the FAQ
   assumes it.
4. **Write the failing test from the spec's own example** when the FAQ gives one ("two Letani Warrior I in
   a system produce two infantry for one resource" is a test waiting to be written).
5. **Implement with citations**: the repo convention is `R9:`, `R3.2/`, `LRR 28.3:`,
   `lrr-factions.md 2108:` in code comments. Every non-obvious branch should name its rule.
6. **Partial wiring is normal — say so.** If you wire the immediate effect but not the ongoing one
   (e.g. Demilitarized Zone's ban), the resolution must *say* it in the game log, and the gap goes into
   `NOT_FIXED.md`. A silent stub is a bug report waiting to happen.
7. **Rulings go in the ledger**: a judgment call the spec doesn't settle (e.g. "Minister of War's choice
   resolves to lowest VP, ties to lowest seat") is recorded in the active plan's `.ledger.md` under
   `docs/superpowers/plans/` and marked as a ruling in the commit message or code comment.

## When the spec and the code disagree

The spec wins; the code is the bug. But check the FAQ date-context: this engine is base game + Codices
I–IV, and some printed texts were *changed* by later Codices — `docs/spec/` already incorporates that.
If the printed text in `src/data/` disagrees with the spec, fix the data, not the spec.

## Special cases worth knowing

- **"Cannot" abilities** (Galactic Threat, Mitosis): implement by removing the seat/option from the
  enumeration, never by offering moves that then fail — a legal-move list that can be empty for the seat
  that must act is a deadlock.
- **"Additional action" effects** (Fleet Logistics, Master Plan, Suffi An): the engine's turn model is
  `turnDone`; LRR 2176-2180 clarify timing (no turn-start/end triggers between the two actions, usable the
  turn it's gained, no passing with it).
- **Elect X agendas**: an elected planet must be player-controlled (LRR agenda rule 10); enumeration is in
  `legalOutcomes`, resolution in `AGENDA_RESOLVERS`, and attachments live on `Planet.attachments`.
- **Wording is data**: "destroy each ground force" ≠ "destroy all units" (infantry only vs structures
  included). Compare the exact verbs before reusing a helper.
