# SDD ledger — plan: docs/superpowers/plans/2026-09-08-saar-floating-factory.md

Ruling: Floating Factory is modelled as its own `UnitType`, not as `spacedock` plus a per-faction movement
flag. It lives in `System.space`, never `Planet.structures` — `lrr-components.md:1810` is explicit that a
Floating Factory is never on a planet, so folding it into the existing structure model would misrepresent
where it can be targeted, blockaded, and destroyed. Cost if wrong: a rename/re-type pass across every file in
plan step 4-7's lookups.

Ruling: the gravity-rift destruction roll and Direct Hit's real effect are out of scope for this plan and
tracked as explicit prerequisites instead of being built ad hoc under a Saar-specific fix — see the plan's
"Explicitly deferred" section for why.
