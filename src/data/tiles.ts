import type { FactionId } from '../engine/types'

/**
 * The full Twilight Imperium 4th-edition BASE-GAME system-tile catalogue (51 tiles),
 * generated from the verified data/reference/tiles.json (AsyncTI4 + LRR v1.1).
 * Green backs: 16 home systems (1-16), the Creuss Gate (17) and off-board Creuss (51).
 * Blue backs: Mecatol Rex (18) + the 20 planet tiles (19-38). Red backs: the 12 anomaly/
 * empty tiles (39-50). This is data only; the active duel map (map.ts) is unchanged until
 * the galaxy generator builds an N-player map from this catalogue.
 */
export type TileBack = 'blue' | 'red' | 'green'
export type TileCategory = 'home' | 'home_gate' | 'home_offboard' | 'mecatol_rex' | 'blue_planet' | 'red_anomaly_or_empty'
export type Anomaly = 'asteroid_field' | 'nebula' | 'gravity_rift' | 'supernova'
export type PlanetTrait = 'industrial' | 'hazardous' | 'cultural'
export type TechSkip = 'red' | 'blue' | 'green' | 'yellow'
export type TileWormhole = 'alpha' | 'beta' | 'delta'

export interface TilePlanet {
  id: string; name: string; resources: number; influence: number
  trait: PlanetTrait | null; techSkip: TechSkip | null; homeOf: FactionId | null
}
export interface TileDef {
  tile: number; category: TileCategory; back: TileBack; name: string
  faction: FactionId | null; factionName: string | null
  wormholes: TileWormhole[]; anomalies: Anomaly[]; planets: TilePlanet[]
  totalResources: number; totalInfluence: number
  note: string | null
}

export const TILES: readonly TileDef[] = [
  {
    tile: 1, category: "home", back: "green", name: "Jord",
    faction: "sol", factionName: "Federation of Sol",
    wormholes: [], anomalies: [],
    planets: [
      { id: "jord", name: "Jord", resources: 4, influence: 2, trait: null, techSkip: null, homeOf: "sol" },
    ],
    totalResources: 4, totalInfluence: 2,
    note: null,
  },
  {
    tile: 2, category: "home", back: "green", name: "Moll Primus",
    faction: "mentak", factionName: "Mentak Coalition",
    wormholes: [], anomalies: [],
    planets: [
      { id: "mollprimus", name: "Moll Primus", resources: 4, influence: 1, trait: null, techSkip: null, homeOf: "mentak" },
    ],
    totalResources: 4, totalInfluence: 1,
    note: null,
  },
  {
    tile: 3, category: "home", back: "green", name: "Darien",
    faction: "yin", factionName: "Yin Brotherhood",
    wormholes: [], anomalies: [],
    planets: [
      { id: "darien", name: "Darien", resources: 4, influence: 4, trait: null, techSkip: null, homeOf: "yin" },
    ],
    totalResources: 4, totalInfluence: 4,
    note: null,
  },
  {
    tile: 4, category: "home", back: "green", name: "Muaat",
    faction: "muaat", factionName: "Embers of Muaat",
    wormholes: [], anomalies: [],
    planets: [
      { id: "muaat", name: "Muaat", resources: 4, influence: 1, trait: null, techSkip: null, homeOf: "muaat" },
    ],
    totalResources: 4, totalInfluence: 1,
    note: null,
  },
  {
    tile: 5, category: "home", back: "green", name: "Nestphar",
    faction: "arborec", factionName: "The Arborec",
    wormholes: [], anomalies: [],
    planets: [
      { id: "nestphar", name: "Nestphar", resources: 3, influence: 2, trait: null, techSkip: null, homeOf: "arborec" },
    ],
    totalResources: 3, totalInfluence: 2,
    note: null,
  },
  {
    tile: 6, category: "home", back: "green", name: "[0.0.0]",
    faction: "l1z1x", factionName: "L1Z1X Mindnet",
    wormholes: [], anomalies: [],
    planets: [
      { id: "0.0.0", name: "[0.0.0]", resources: 5, influence: 0, trait: null, techSkip: null, homeOf: "l1z1x" },
    ],
    totalResources: 5, totalInfluence: 0,
    note: null,
  },
  {
    tile: 7, category: "home", back: "green", name: "Winnu",
    faction: "winnu", factionName: "The Winnu",
    wormholes: [], anomalies: [],
    planets: [
      { id: "winnu", name: "Winnu", resources: 3, influence: 4, trait: null, techSkip: null, homeOf: "winnu" },
    ],
    totalResources: 3, totalInfluence: 4,
    note: null,
  },
  {
    tile: 8, category: "home", back: "green", name: "Mordai II",
    faction: "nekro", factionName: "Nekro Virus",
    wormholes: [], anomalies: [],
    planets: [
      { id: "mordaiii", name: "Mordai II", resources: 4, influence: 0, trait: null, techSkip: null, homeOf: "nekro" },
    ],
    totalResources: 4, totalInfluence: 0,
    note: null,
  },
  {
    tile: 9, category: "home", back: "green", name: "Maaluuk / Druaa",
    faction: "naalu", factionName: "Naalu Collective",
    wormholes: [], anomalies: [],
    planets: [
      { id: "maaluuk", name: "Maaluuk", resources: 0, influence: 2, trait: null, techSkip: null, homeOf: "naalu" },
      { id: "druaa", name: "Druaa", resources: 3, influence: 1, trait: null, techSkip: null, homeOf: "naalu" },
    ],
    totalResources: 3, totalInfluence: 3,
    note: null,
  },
  {
    tile: 10, category: "home", back: "green", name: "Arc Prime / Wren Terra",
    faction: "letnev", factionName: "Barony of Letnev",
    wormholes: [], anomalies: [],
    planets: [
      { id: "arcprime", name: "Arc Prime", resources: 4, influence: 0, trait: null, techSkip: null, homeOf: "letnev" },
      { id: "wrenterra", name: "Wren Terra", resources: 2, influence: 1, trait: null, techSkip: null, homeOf: "letnev" },
    ],
    totalResources: 6, totalInfluence: 1,
    note: null,
  },
  {
    tile: 11, category: "home", back: "green", name: "Lisis II / Ragh",
    faction: "saar", factionName: "Clan of Saar",
    wormholes: [], anomalies: [],
    planets: [
      { id: "lisisii", name: "Lisis II", resources: 1, influence: 0, trait: null, techSkip: null, homeOf: "saar" },
      { id: "ragh", name: "Ragh", resources: 2, influence: 1, trait: null, techSkip: null, homeOf: "saar" },
    ],
    totalResources: 3, totalInfluence: 1,
    note: null,
  },
  {
    tile: 12, category: "home", back: "green", name: "Nar / Jol",
    faction: "jolnar", factionName: "Universities of Jol-Nar",
    wormholes: [], anomalies: [],
    planets: [
      { id: "nar", name: "Nar", resources: 2, influence: 3, trait: null, techSkip: null, homeOf: "jolnar" },
      { id: "jol", name: "Jol", resources: 1, influence: 2, trait: null, techSkip: null, homeOf: "jolnar" },
    ],
    totalResources: 3, totalInfluence: 5,
    note: null,
  },
  {
    tile: 13, category: "home", back: "green", name: "Tren'lak / Quinarra",
    faction: "sardakk", factionName: "Sardakk N'orr",
    wormholes: [], anomalies: [],
    planets: [
      { id: "trenlak", name: "Tren'lak", resources: 1, influence: 0, trait: null, techSkip: null, homeOf: "sardakk" },
      { id: "quinarra", name: "Quinarra", resources: 3, influence: 1, trait: null, techSkip: null, homeOf: "sardakk" },
    ],
    totalResources: 4, totalInfluence: 1,
    note: null,
  },
  {
    tile: 14, category: "home", back: "green", name: "Archon Ren / Archon Tau",
    faction: "xxcha", factionName: "Xxcha Kingdom",
    wormholes: [], anomalies: [],
    planets: [
      { id: "archonren", name: "Archon Ren", resources: 2, influence: 3, trait: null, techSkip: null, homeOf: "xxcha" },
      { id: "archontau", name: "Archon Tau", resources: 1, influence: 1, trait: null, techSkip: null, homeOf: "xxcha" },
    ],
    totalResources: 3, totalInfluence: 4,
    note: null,
  },
  {
    tile: 15, category: "home", back: "green", name: "Retillion / Shalloq",
    faction: "yssaril", factionName: "Yssaril Tribes",
    wormholes: [], anomalies: [],
    planets: [
      { id: "retillion", name: "Retillion", resources: 2, influence: 3, trait: null, techSkip: null, homeOf: "yssaril" },
      { id: "shalloq", name: "Shalloq", resources: 1, influence: 2, trait: null, techSkip: null, homeOf: "yssaril" },
    ],
    totalResources: 3, totalInfluence: 5,
    note: null,
  },
  {
    tile: 16, category: "home", back: "green", name: "Hercant / Arretze / Kamdorn",
    faction: "hacan", factionName: "Emirates of Hacan",
    wormholes: [], anomalies: [],
    planets: [
      { id: "hercant", name: "Hercant", resources: 1, influence: 1, trait: null, techSkip: null, homeOf: "hacan" },
      { id: "arretze", name: "Arretze", resources: 2, influence: 0, trait: null, techSkip: null, homeOf: "hacan" },
      { id: "kamdorn", name: "Kamdorn", resources: 0, influence: 1, trait: null, techSkip: null, homeOf: "hacan" },
    ],
    totalResources: 3, totalInfluence: 2,
    note: null,
  },
  {
    tile: 17, category: "home_gate", back: "green", name: "Creuss Gate",
    faction: "creuss", factionName: "Ghosts of Creuss",
    wormholes: ["delta"], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Creuss Gate: placed in the galaxy ring as the Ghosts of Creuss home position; no planets; delta wormhole links it to tile 51 (Creuss home system, kept off-board).",
  },
  {
    tile: 18, category: "mecatol_rex", back: "blue", name: "Mecatol Rex",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "mr", name: "Mecatol Rex", resources: 1, influence: 6, trait: null, techSkip: null, homeOf: null },
    ],
    totalResources: 1, totalInfluence: 6,
    note: "Custodians token starts here. Removing it costs 6 influence before Commit Ground Forces, grants 1 VP and turns on the agenda phase (LRR 26).",
  },
  {
    tile: 19, category: "blue_planet", back: "blue", name: "Wellon",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "wellon", name: "Wellon", resources: 1, influence: 2, trait: "industrial", techSkip: "yellow", homeOf: null },
    ],
    totalResources: 1, totalInfluence: 2,
    note: null,
  },
  {
    tile: 20, category: "blue_planet", back: "blue", name: "Vefut II",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "vefutii", name: "Vefut II", resources: 2, influence: 2, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 2, totalInfluence: 2,
    note: null,
  },
  {
    tile: 21, category: "blue_planet", back: "blue", name: "Thibah",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "thibah", name: "Thibah", resources: 1, influence: 1, trait: "industrial", techSkip: "blue", homeOf: null },
    ],
    totalResources: 1, totalInfluence: 1,
    note: null,
  },
  {
    tile: 22, category: "blue_planet", back: "blue", name: "Tar'mann",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "tarmann", name: "Tar'mann", resources: 1, influence: 1, trait: "industrial", techSkip: "green", homeOf: null },
    ],
    totalResources: 1, totalInfluence: 1,
    note: null,
  },
  {
    tile: 23, category: "blue_planet", back: "blue", name: "Saudor",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "saudor", name: "Saudor", resources: 2, influence: 2, trait: "industrial", techSkip: null, homeOf: null },
    ],
    totalResources: 2, totalInfluence: 2,
    note: null,
  },
  {
    tile: 24, category: "blue_planet", back: "blue", name: "Mehar Xull",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "meharxull", name: "Mehar Xull", resources: 1, influence: 3, trait: "hazardous", techSkip: "red", homeOf: null },
    ],
    totalResources: 1, totalInfluence: 3,
    note: null,
  },
  {
    tile: 25, category: "blue_planet", back: "blue", name: "Quann",
    faction: null, factionName: null,
    wormholes: ["beta"], anomalies: [],
    planets: [
      { id: "quann", name: "Quann", resources: 2, influence: 1, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 2, totalInfluence: 1,
    note: null,
  },
  {
    tile: 26, category: "blue_planet", back: "blue", name: "Lodor",
    faction: null, factionName: null,
    wormholes: ["alpha"], anomalies: [],
    planets: [
      { id: "lodor", name: "Lodor", resources: 3, influence: 1, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 3, totalInfluence: 1,
    note: null,
  },
  {
    tile: 27, category: "blue_planet", back: "blue", name: "New Albion / Starpoint",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "newalbion", name: "New Albion", resources: 1, influence: 1, trait: "industrial", techSkip: "green", homeOf: null },
      { id: "starpoint", name: "Starpoint", resources: 3, influence: 1, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 4, totalInfluence: 2,
    note: null,
  },
  {
    tile: 28, category: "blue_planet", back: "blue", name: "Tequ'ran / Torkan",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "tequran", name: "Tequ'ran", resources: 2, influence: 0, trait: "hazardous", techSkip: null, homeOf: null },
      { id: "torkan", name: "Torkan", resources: 0, influence: 3, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 2, totalInfluence: 3,
    note: null,
  },
  {
    tile: 29, category: "blue_planet", back: "blue", name: "Qucen'n / Rarron",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "qucenn", name: "Qucen'n", resources: 1, influence: 2, trait: "industrial", techSkip: null, homeOf: null },
      { id: "rarron", name: "Rarron", resources: 0, influence: 3, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 1, totalInfluence: 5,
    note: null,
  },
  {
    tile: 30, category: "blue_planet", back: "blue", name: "Mellon / Zohbat",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "mellon", name: "Mellon", resources: 0, influence: 2, trait: "cultural", techSkip: null, homeOf: null },
      { id: "zohbat", name: "Zohbat", resources: 3, influence: 1, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 3, totalInfluence: 3,
    note: null,
  },
  {
    tile: 31, category: "blue_planet", back: "blue", name: "Lazar / Sakulag",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "lazar", name: "Lazar", resources: 1, influence: 0, trait: "industrial", techSkip: "yellow", homeOf: null },
      { id: "sakulag", name: "Sakulag", resources: 2, influence: 1, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 3, totalInfluence: 1,
    note: null,
  },
  {
    tile: 32, category: "blue_planet", back: "blue", name: "Dal Bootha / Xxehan",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "dalbootha", name: "Dal Bootha", resources: 0, influence: 2, trait: "cultural", techSkip: null, homeOf: null },
      { id: "xxehan", name: "Xxehan", resources: 1, influence: 1, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 1, totalInfluence: 3,
    note: null,
  },
  {
    tile: 33, category: "blue_planet", back: "blue", name: "Corneeq / Resculon",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "corneeq", name: "Corneeq", resources: 1, influence: 2, trait: "cultural", techSkip: null, homeOf: null },
      { id: "resculon", name: "Resculon", resources: 2, influence: 0, trait: "cultural", techSkip: null, homeOf: null },
    ],
    totalResources: 3, totalInfluence: 2,
    note: null,
  },
  {
    tile: 34, category: "blue_planet", back: "blue", name: "Centauri / Gral",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "centauri", name: "Centauri", resources: 1, influence: 3, trait: "cultural", techSkip: null, homeOf: null },
      { id: "gral", name: "Gral", resources: 1, influence: 1, trait: "industrial", techSkip: "blue", homeOf: null },
    ],
    totalResources: 2, totalInfluence: 4,
    note: null,
  },
  {
    tile: 35, category: "blue_planet", back: "blue", name: "Bereg / Lirta IV",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "bereg", name: "Bereg", resources: 3, influence: 1, trait: "hazardous", techSkip: null, homeOf: null },
      { id: "lirtaiv", name: "Lirta IV", resources: 2, influence: 3, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 5, totalInfluence: 4,
    note: null,
  },
  {
    tile: 36, category: "blue_planet", back: "blue", name: "Arnor / Lor",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "arnor", name: "Arnor", resources: 2, influence: 1, trait: "industrial", techSkip: null, homeOf: null },
      { id: "lor", name: "Lor", resources: 1, influence: 2, trait: "industrial", techSkip: null, homeOf: null },
    ],
    totalResources: 3, totalInfluence: 3,
    note: null,
  },
  {
    tile: 37, category: "blue_planet", back: "blue", name: "Arinam / Meer",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "arinam", name: "Arinam", resources: 1, influence: 2, trait: "industrial", techSkip: null, homeOf: null },
      { id: "meer", name: "Meer", resources: 0, influence: 4, trait: "hazardous", techSkip: "red", homeOf: null },
    ],
    totalResources: 1, totalInfluence: 6,
    note: null,
  },
  {
    tile: 38, category: "blue_planet", back: "blue", name: "Abyz / Fria",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [
      { id: "abyz", name: "Abyz", resources: 3, influence: 0, trait: "hazardous", techSkip: null, homeOf: null },
      { id: "fria", name: "Fria", resources: 2, influence: 0, trait: "hazardous", techSkip: null, homeOf: null },
    ],
    totalResources: 5, totalInfluence: 0,
    note: null,
  },
  {
    tile: 39, category: "red_anomaly_or_empty", back: "red", name: "Alpha Wormhole",
    faction: null, factionName: null,
    wormholes: ["alpha"], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 40, category: "red_anomaly_or_empty", back: "red", name: "Beta Wormhole",
    faction: null, factionName: null,
    wormholes: ["beta"], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 41, category: "red_anomaly_or_empty", back: "red", name: "Gravity Rift",
    faction: null, factionName: null,
    wormholes: [], anomalies: ["gravity_rift"],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Ships moving out of or through this system get +1 move; roll 1 die per such ship after Move Ships: 1-3 destroys it (LRR 37).",
  },
  {
    tile: 42, category: "red_anomaly_or_empty", back: "red", name: "Nebula",
    faction: null, factionName: null,
    wormholes: [], anomalies: ["nebula"],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Ships cannot move through; can only move in if it is the active system; ships starting here treat move as 1; defender +1 to combat rolls in space combat here (LRR 50).",
  },
  {
    tile: 43, category: "red_anomaly_or_empty", back: "red", name: "Supernova",
    faction: null, factionName: null,
    wormholes: [], anomalies: ["supernova"],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Ships cannot move through or into (LRR 75).",
  },
  {
    tile: 44, category: "red_anomaly_or_empty", back: "red", name: "Asteroids",
    faction: null, factionName: null,
    wormholes: [], anomalies: ["asteroid_field"],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Ships cannot move through or into; Antimass Deflectors lifts this (LRR 11).",
  },
  {
    tile: 45, category: "red_anomaly_or_empty", back: "red", name: "Asteroids",
    faction: null, factionName: null,
    wormholes: [], anomalies: ["asteroid_field"],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: "Ships cannot move through or into; Antimass Deflectors lifts this (LRR 11).",
  },
  {
    tile: 46, category: "red_anomaly_or_empty", back: "red", name: "Empty System",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 47, category: "red_anomaly_or_empty", back: "red", name: "Empty System",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 48, category: "red_anomaly_or_empty", back: "red", name: "Empty System",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 49, category: "red_anomaly_or_empty", back: "red", name: "Empty System",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 50, category: "red_anomaly_or_empty", back: "red", name: "Empty System",
    faction: null, factionName: null,
    wormholes: [], anomalies: [],
    planets: [],
    totalResources: 0, totalInfluence: 0,
    note: null,
  },
  {
    tile: 51, category: "home_offboard", back: "green", name: "Creuss",
    faction: "creuss", factionName: "Ghosts of Creuss",
    wormholes: ["delta"], anomalies: [],
    planets: [
      { id: "creuss", name: "Creuss", resources: 4, influence: 2, trait: null, techSkip: null, homeOf: "creuss" },
    ],
    totalResources: 4, totalInfluence: 2,
    note: "Off-board Ghosts of Creuss home system (delta wormhole). Not part of the 1..50 numbering the task asked for; included for completeness.",
  },
]

const BY_NUMBER = new Map(TILES.map(t => [t.tile, t]))
export function tileByNumber(tile: number): TileDef {
  const t = BY_NUMBER.get(tile)
  if (!t) throw new Error(`unknown tile ${String(tile)}`)
  return t
}

/** The 17 faction home tiles (16 green home systems plus the off-board Creuss, tile 51). */
export const HOME_TILES: readonly TileDef[] = TILES.filter(t => t.category === 'home' || t.category === 'home_offboard')
export function homeTileFor(faction: FactionId): TileDef | undefined {
  return HOME_TILES.find(t => t.faction === faction)
}

/** The Creuss Gate (tile 17), the delta-wormhole tile the Ghosts place in the galaxy ring. */
export const CREUSS_GATE: TileDef = tileByNumber(17)
/** Mecatol Rex (tile 18), the centre of every galaxy. */
export const MECATOL_TILE: TileDef = tileByNumber(18)
/** The shuffled tile deck used to fill a galaxy: the 20 blue planet tiles + 12 red anomaly/empty tiles. */
export const GALAXY_TILES: readonly TileDef[] = TILES.filter(t => t.category === 'blue_planet' || t.category === 'red_anomaly_or_empty')
