import type { FactionId } from '../engine/types'

/**
 * Every faction's flagship: its printed name, and a plain-language summary (in our own words, not the
 * printed card text) of the one ability it has beyond Sustain Damage — every flagship has that — and
 * whatever secondary keyword its own stats already carry (AFB/bombardment/space cannon, in `FLAGSHIPS` in
 * `units.ts`). Names and numbers checked against twilight-imperium.fandom.com (see
 * docs/superpowers/plans/2026-09-04-ti4-full-game.ledger.md for how to reach it); no card art exists there
 * for any flagship, hence `FlagshipCard` rendering this as text instead of an image.
 */
export interface FlagshipInfo { name: string; ability: string }

export const FLAGSHIP_INFO: Record<FactionId, FlagshipInfo> = {
  l1z1x: { name: '[0.0.1]', ability: 'Hits it and your dreadnoughts in this system score must go on non-fighter ships first, whenever there is one to take them.' },
  letnev: { name: 'Arc Secundus', ability: 'Strips Planetary Shield from everyone else in the system, and repairs itself at the start of every combat round.' },
  arborec: { name: 'Duha Menaimon', ability: 'Lets you produce up to 5 units in the system the moment you activate it.' },
  saar: { name: 'Son of Ragh', ability: '' },
  muaat: { name: 'The Inferno', ability: 'Can spend a strategy token as an action to conjure a cruiser straight into its own system.' },
  hacan: { name: 'Wrath of Kenara', ability: 'Lets you pay a trade good to boost any of its combat rolls by 1, after seeing the roll.' },
  sol: { name: 'Genesis', ability: 'Spawns a fresh infantry into the system every status phase.' },
  creuss: { name: 'Hil Colish', ability: 'Sits on a delta wormhole and can move in before or after the rest of your fleet.' },
  mentak: { name: 'Fourth Moon', ability: "Denies every other ship in the system the use of Sustain Damage." },
  naalu: { name: 'Matriarch', ability: 'Lets your fighters join an invasion as ground forces, returning to space once the fighting is over.' },
  nekro: { name: 'The Alastor', ability: 'Can pull any number of your ground forces into a space battle in this system as if they were ships.' },
  sardakk: { name: "C'Morran N'orr", ability: 'Adds +1 to every other one of your ships\' combat rolls in the system.' },
  jolnar: { name: 'J.N.S. Hylarim', ability: 'Turns its own 9s and 10s into two hits apiece before modifiers.' },
  winnu: { name: 'Salai Sai Corian', ability: "Rolls one die per non-fighter ship the opponent has in the system, instead of a fixed number." },
  xxcha: { name: 'Loncara Ssodu', ability: 'Its Space Cannon reaches into adjacent systems, not just its own.' },
  yin: { name: 'Van Hauge', ability: 'Takes every other ship in the system down with it if destroyed.' },
  yssaril: { name: "Y'sia Y'ssrila", ability: 'Can move straight through systems full of enemy ships.' },
}
