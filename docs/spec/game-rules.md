# Twilight Imperium Fourth Edition, game rules v0.3 (engine specification)

Full base game of Twilight Imperium 4th edition (including Codices I–IV), playable by 2–6 players (primary mode 3–6 players). The galaxy is generated: a radius-3 hex grid with Mecatol Rex at the centre, all 17 base factions, all 8 strategy cards, 101 base action cards, 50 base agendas, 20 public objectives (Stage I + Stage II) plus secrets, 6 promissory notes, 143 planets across 51 tiles, anomalies (asteroid fields, nebulae, gravity rifts, supernovas), and wormholes.

Verified faction, unit, technology and tile data live in `data/reference/*.json`; the complete rules text is the Living Rules Reference (`docs/spec/lrr.md`, LRR v2.0 including Codex errata), with every component card in `docs/spec/lrr-components.md`. **The LRR is the binding authority for the printed rules; this document records the engine-scope readings of them.** Where this document and the reference data disagree, the LRR wins.

## 1. Components

- Map: a generated galaxy (3–6 players; 2 players may use a fixed two-home-slice, but the primary mode is a generated radius-3 hex galaxy). Home systems sit on evenly spaced corners; Mecatol Rex is the centre; the rest of the ring is filled from shuffled base-game system tiles. Wormholes (alpha, beta, delta) make their two systems adjacent. Anomalies (asteroid, nebula, gravity rift, supernova) are placed during generation.
- Units: infantry, fighter, destroyer, cruiser, carrier, dreadnought (L1Z1X: super-dreadnought), war sun, flagship, PDS, space dock — per faction sheet in `data/reference/factions.json`; upgrades in `techs.json` (`unit_upgrades`, `faction_extras`).
- Strategy cards: all 8 base-game cards — Leadership 1, Diplomacy 2, Politics 3, Construction 4, Trade 5, Warfare 6, Technology 7, Imperial 8. Text verified against the AsyncTI4 catalogue (`source: "base"`) with Codex errata applied, recorded in `src/data/strategyCards`/the strategy-phase module.
- Command tokens: three pools (tactic, fleet, strategy); start 3 / 3 / 2. Fleet pool limits non-fighter ships per system (faction bonuses apply, e.g. Letnev Armada +2).
- Trade goods and commodities: commodity value per faction sheet; trade goods replenish via the Trade card.
- Objectives: 20 public objectives — 10 Stage I (1 VP) and 10 Stage II (2 VP) — shuffled from the seed, one revealed per round (rounds 1–5; round 6 reveals none) — plus secret objectives and promissory notes.
- Victory: first to 10 VP wins.

See `docs/spec/lrr.md` for the full glossary of every term used below.

## 2. Setup

1. Seats: 2–6 players in initiative order, each with a faction (from the 17 base factions), a colour, and a name. The generated galaxy places each faction's starting home system on a corner.
2. Starting units on each home system are printed per faction sheet in `data/reference/factions.json`.
3. Starting technologies are printed per faction sheet in `data/reference/techs.json`.
4. Command tokens 3/3/2, trade goods 0, commodities full, all home planets ready and controlled.
5. Mecatol Rex starts neutral with the Custodians token and the guardian fleet (section 4.2).
6. Speaker: seat 0 in round 1 (the UI may randomise before creating the game); the speaker passes clockwise every round.
7. Deal action cards and secret objectives; set up the objective and agenda decks.

## 3. Round structure

### 3.1 Strategy phase
Snake draft: the speaker picks one card, then each other player picks in initiative order, wrapping back; 2 players draft 2 each, 3 players draft 2 each in a snake, 4–6 players draft 1 each clockwise. Unpicked cards get one trade good placed on them; the next player to pick such a card gains its trade goods. Initiative order for the action phase is by the lowest card number each player holds.

### 3.2 Action phase
Players take turns in initiative order. On a turn the active player performs exactly one of: tactical action, strategic action, component action, pass. An action resolves then the turn continues until the player ends it (so free moves can still be made). After passing, a player takes no more turns this round. A player may not pass while holding an unused strategy card. A passed player may still resolve a secondary ability.

Tactical action (a system that already contains one of your command tokens cannot be activated, your home system included):
1. Activation: spend one tactic token into the system.
2. Movement: move ships from other systems into the active system by move value, not through enemy ships; wormholes make their two systems adjacent; capacity and Fighter II rules apply; ships in a system with your own command token cannot move out.
3. Space combat if enemy or guardian ships are present (section 4).
4. Invasion: bombardment, landing, ground combat, control (section 4.3). Skipped entirely when it has nothing to offer.
5. Production if a space dock is in the active system (section 4.4).

Strategic action: play the primary ability of an unused strategy card; each other player may resolve the secondary for one strategy token. The card is then used for the round.

Component action: an action granted by a card or faction ability played by the player (e.g. a faction's component action).

### 3.3 Status phase
1. Score: each player may score each public objective they fulfil (once per objective per game) and 1 VP for controlling Mecatol Rex.
2. Reveal the next public objective (rounds 1 to 5; round 6 has none).
3. Each player gains two command tokens (Hyper Metabolism: three) and may redistribute their entire command sheet.
4. Ready all cards and planets, return strategy cards, remove command tokens from the map.
5. If Mecatol Rex is uncontrolled, roll a new guardian fleet.
6. Check victory (section 7). Then the speaker passes clockwise and the round counter increases. If the Custodians token has left Mecatol Rex, run the agenda phase instead of starting the next round (section 10).

## 4. Combat and production

### 4.1 Space combat (in the active system)
1. Space cannon offense: PDS in the system fire once at the attacker before combat (1 die per PDS, hit on 6+). The attacker assigns the whole barrage as one batch.
2. Anti-fighter barrage: each destroyer rolls its barrage dice (I: 2 dice at 9, II: 3 dice at 6); hits destroy enemy fighters only.
3. Combat rounds: every ship rolls its combat dice; a hit is a roll of combat value or higher.
4. Hit assignment: the owner of the ships assigns hits scored against them; sustain damage is a choice; restricted hits rules apply.
5. Retreat: before each round after the first, the attacker may announce a retreat to an adjacent safe system; the retreat happens after that round.
6. Combat ends when one side has no ships.

Full, step-by-step combat and hit-assignment rules are in `docs/spec/lrr.md` (Space Combat, Hit Assignment, Sustain Damage, Retreat, Destroyed). The engine implements these exactly.

### 4.2 Guardian fleet
The Custodians token on Mecatol Rex is defended by a neutral guardian fleet whose composition is rolled from a table at setup. The guardian uses level I stats and never moves. It is defeated like any enemy for the purpose of taking Mecatol Rex.

### 4.3 Invasion
1. Bombardment: ships with bombardment roll against a chosen planet; PDS (planetary shield) blocks bombardment unless canceled (e.g. a faction with the relevant tech/ability); hits destroy ground forces.
2. Landing: commit infantry from ships in the system to planets.
3. Space cannon defense: PDS on the planet fire at landing infantry (hit 6+), unless canceled.
4. Ground combat: infantry roll simultaneously until one side is gone; Infantry II returns destroyed infantry on a 6+.
5. Control: if attacking infantry survive and no defenders remain, the planet changes control, exhausted. Structures on the planet are destroyed (with faction exceptions, e.g. L1Z1X Assimilate).

### 4.4 Production
A space dock produces up to (planet resources + 2) units (Space Dock II: +4) the system can hold within capacity and fleet-pool limits. Payment by exhausting ready planets and spending trade goods. Faction/tech reductions (e.g. Sarween Tools) and restrictions apply. Flagship: one per player at a time. A War Sun needs no technology.

## 5. Technology
Research via the Technology strategy card (and faction/component actions). Prerequisites are colour counts of owned technologies (`techs.json`). Unit upgrades replace the unit's stats. The full base-game technology tree and unit upgrades are in `docs/spec/lrr-components.md` (Technology, Units) and `src/data/techs.ts`.

## 6. Faction abilities
Each of the 17 base factions has its abilities per its faction sheet (`data/reference/factions.json`, `data/reference/techs.json` for faction techs, and the faction-clarification notes in `docs/spec/lrr-factions.md`). Faction abilities, starting fleets, faction technologies, promissory notes and flagships are implemented per the sheet; the engine applies the printed modifiers (e.g. combat-roll modifiers, fleet-pool bonuses, production bonuses).

## 7. Objectives and victory
- Public objectives: 20 total (10 Stage I worth 1 VP, 10 Stage II worth 2 VP), shuffled at setup, one revealed per round (rounds 1–5; round 6 reveals none). Fully listed in `src/data/objectives.ts` and `docs/spec/lrr-components.md` (Objectives).
- Secret objectives: dealt at setup, scored once per player, worth 1 VP.
- Mecatol Rex: 1 VP per status phase in which you control it; Imperial primary gives 1 VP immediately when you control it.
- Promissory notes: Support For The Throne grants 1 VP to its holder while unresolved.
- Victory: the first player to reach 10 VP at a victory check wins. If two players tie on VP when the target is reached, tie-breaks follow the LRR (most VPs; then Mecatol Rex; then most planets; see `docs/spec/lrr.md`, Victory Points).

## 9. Action cards, agendas and the agenda phase

### 9.1 Action cards
The 101 base-game action cards are imported as printed data (`src/data/actionCards.ts`, filtered on `source: "base"`; full text in `docs/spec/lrr-components.md`). The deck a game shuffles holds the cards the engine resolves in full; a card the engine cannot resolve is never dealt, because a dealt card must offer its whole ability. Each player draws 1 action card in the status phase; hand limit 7; the deck reshuffles from the discard when dry.

### 9.2 Politics and Construction
- Politics (3): choose a player other than the speaker, who takes the speaker token; draw 2 action cards; look at the top 2 agenda cards and put each back on top or bottom in any order. Secondary: 1 strategy token for 2 action cards.
- Construction (4): place 1 PDS or 1 space dock on a planet you control, then 1 PDS on a planet you control (1 space dock and 2 PDS per planet at most). Secondary: place the strategy token in any system and, on a planet you control there, 1 space dock or 1 PDS.

### 9.3 Agendas
The 50 base agendas and the agenda phase (once the Custodians token has left Mecatol Rex) are implemented per section 10.

## 10. Agenda phase (R10)

- Entry: once the Custodians token has left Mecatol Rex, the status phase reveals an agenda instead of starting the next round straight away. While the token is still on Mecatol Rex, or the agenda deck is dry, the game goes straight to the next round.
- Vote order: clockwise starting with the seat left of the speaker, the speaker voting last.
- Casting a vote: name one of the agenda's legal outcomes and exhaust any number of ready planets that print influence to weight it — planets only, no trade goods. An empty planet list is a legal 0-influence vote.
- Two agendas are revealed and voted on per phase, exactly as in the base game; the second is skipped only if the deck runs dry mid-phase. Victory is re-checked after each agenda resolves.
- Every base agenda can be revealed and voted on. Which outcomes the engine enacts and which are recorded-not-enforced is tracked in `src/engine/agendas.ts` and its tests; laws (persistent effects) and the agenda-timing action cards (Riders, Veto, Bribery, etc.) are progressively wired via `docs/superpowers/plans/2026-09-07-agenda-phase.md`.

## 11. Chess clock
Optional per-player chess clock (default off) running whenever it is that player's turn to decide something, in every phase, stopping only for the handoff screen and game end. The engine is time-free; the transport records a timestamp per move (see `docs/spec/lobby-architecture.md`) and enforces the clock.
