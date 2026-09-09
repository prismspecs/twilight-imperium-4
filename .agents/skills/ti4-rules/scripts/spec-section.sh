#!/usr/bin/env bash
# spec-section.sh — section-aware search over the TI4 rules spec (docs/spec/).
#
# The spec is several thousand lines; plain grep drowns you in hits. This prints whole SECTIONS:
# the FAQ files (lrr-components.md, lrr-factions.md) are organised in `### Card/Ability` blocks, and
# lrr.md is a numbered ruleset, so a hit there comes with its heading context.
#
# usage: spec-section.sh <term> [file-substring]
#   spec-section.sh "Fleet Logistics"      # every spec section that names it
#   spec-section.sh "Mitosis" factions     # only lrr-factions.md
set -euo pipefail

term="${1:?usage: spec-section.sh <term> [file-substring]}"
filter="${2:-}"
root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
spec="$root/docs/spec"

for f in "$spec"/*.md; do
  base="$(basename "$f")"
  if [[ -n "$filter" && "$base" != *"$filter"* ]]; then continue; fi
  # print each heading-block whose body mentions the term, with its heading
  awk -v term="$term" -v file="$base" '
    BEGIN { IGNORECASE = 1; block = ""; head = "" }
    /^#{1,4} / {
      if (block ~ term) printf "%s", block
      head = file ": " $0 "\n"
      block = head
      next
    }
    { block = block $0 "\n" }
    END { if (block ~ term) printf "%s", block }
  ' "$f"
done
