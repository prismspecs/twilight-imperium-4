#!/usr/bin/env python3
"""
Distills per-faction tempo and opening strategies from AsyncTI4 per-move records.
Python implementation for speed (vs TypeScript).
"""
import json
import glob
import os
from collections import defaultdict

FACTION_MAP = {
    'The Federation of Sol': 'sol',
    'The Barony of Letnev': 'letnev',
    'The Emirates of Hacan': 'hacan',
    'The Universities of Jol-Nar': 'jolnar',
    'The L1Z1X Mindnet': 'l1z1x',
    'The Xxcha Kingdom': 'xxcha',
    'The Clan of Saar': 'saar',
    'The Embers of Muaat': 'muaat',
    'The Ghosts of Creuss': 'creuss',
    'The Mentak Coalition': 'mentak',
    'The Naalu Collective': 'naalu',
    'The Nekro Virus': 'nekro',
    'Sardakk Norr': 'sardakk',
    'The Winnu': 'winnu',
    'The Yin Brotherhood': 'yin',
    'The Yssaril Tribes': 'yssaril',
    'The Arborec': 'arborec',
}

STRATEGY_CARD_MAP = {
    'Imperial': 'imperial', 'Leadership': 'leadership', 'Politics': 'politics',
    'Diplomacy': 'diplomacy', 'Warfare': 'warfare', 'Technology': 'technology',
    'Construction': 'construction', 'Trade': 'trade',
}

TECH_ALIAS_MAP = {
    'antimass deflectors': 'antimass_deflectors', 'gravity drive': 'gravity_drive',
    'fleet logistics': 'fleet_logistics', 'light/wave deflector': 'light_wave_deflector',
    'plasma scoring': 'plasma_scoring', 'magen defense grid': 'magen_defense_grid',
    'duranium armor': 'duranium_armor', 'assault cannon': 'assault_cannon',
    'neural motivator': 'neural_motivator', 'dacxive animators': 'dacxive_animators',
    'hyper metabolism': 'hyper_metabolism', 'x-89 bacterial weapon': 'x89_bacterial_weapon',
    'sarween tools': 'sarween_tools', 'graviton laser system': 'graviton_laser_system',
    'transit diodes': 'transit_diodes', 'integrated economy': 'integrated_economy',
    'infantry ii': 'infantry_ii', 'spec ops ii': 'infantry_ii',
    'crimson legionnaire ii': 'infantry_ii', 'fighter ii': 'fighter_ii',
    'hybrid crystal fighter ii': 'fighter_ii', 'destroyer ii': 'destroyer_ii',
    'strike wing alpha ii': 'destroyer_ii', 'cruiser ii': 'cruiser_ii',
    'carrier ii': 'carrier_ii', 'advanced carrier ii': 'carrier_ii',
    'dreadnought ii': 'dreadnought_ii', 'exotrireme ii': 'dreadnought_ii',
    'space dock ii': 'space_dock_ii', 'floating factory ii': 'space_dock_ii',
    'dimensional tear ii': 'space_dock_ii', 'inheritance systems': 'inheritance_systems',
    'super dreadnought ii': 'super_dreadnought_ii', 'l4 disruptors': 'l4_disruptors',
    'non-euclidean shielding': 'non_euclidean_shielding',
}

def normalize_tech(raw):
    if not raw or not isinstance(raw, str): return None
    cleaned = raw.lower().replace('omega', '').replace('ω', '').replace('Ω', '').strip()
    return TECH_ALIAS_MAP.get(cleaned)

def normalize_faction(raw):
    return FACTION_MAP.get(raw)

def normalize_sc(raw):
    return STRATEGY_CARD_MAP.get(raw)

def top_n(map, n):
    return [k for k, v in sorted(map.items(), key=lambda x: -x[1])][:n]

def main():
    dataset_dir = 'data/asyncti4/dataset'
    files = sorted(glob.glob(os.path.join(dataset_dir, '*.ndjson')))
    print(f'Processing {len(files)} NDJSON files...')
    
    # Per-faction stats
    stats = defaultdict(lambda: {
        'games': 0, 'wins': 0,
        'tech_first': defaultdict(int), 'tech_second': defaultdict(int), 'tech_third': defaultdict(int),
        'round1_sc': defaultdict(int),
        'tactical': 0, 'expansion': 0, 'combat': 0,
        'total_round': 0, 'research_count': 0,
    })
    
    processed = 0
    for i, f in enumerate(files):
        if i % 500 == 0:
            print(f'  {i}/{len(files)} files')
        
        game_winner = None
        player_data = {}  # faction -> {techs, round1_sc, tacticals}
        
        with open(f, 'r', encoding='utf-8', errors='replace') as fp:
            for line in fp:
                if not line.strip(): continue
                r = json.loads(line)
                
                # Get winner
                if r.get('gameWinner'):
                    game_winner = r['gameWinner']
                elif r.get('payload', {}).get('winner'):
                    w = r['payload']['winner']
                    game_winner = w[0] if isinstance(w, list) else w
                
                # Collect player state
                faction = r.get('faction')
                if not faction: continue
                norm_f = normalize_faction(faction)
                if not norm_f: continue
                
                if norm_f not in player_data:
                    player_data[norm_f] = {'faction': faction, 'techs': [], 'round1_sc': [], 'tacticals': []}
                pd = player_data[norm_f]
                
                if r.get('archetype') == 'TECH_RESEARCHED':
                    tech = normalize_tech(r.get('payload', {}).get('tech'))
                    if tech: pd['techs'].append(tech)
                elif r.get('archetype') == 'SC_PICKED' and r.get('round') == 1:
                    sc = normalize_sc(r.get('payload', {}).get('strategyCard'))
                    if sc: pd['round1_sc'].append(sc)
                elif r.get('archetype') == 'TACTICAL_ACTION':
                    combat = (r.get('payload', {}).get('planetsTaken') and len(r['payload']['planetsTaken']) > 0)
                    pd['tacticals'].append({'combat': combat})
        
        if not game_winner: continue
        processed += 1
        
        # Aggregate
        for fid, pd in player_data.items():
            s = stats[fid]
            s['games'] += 1
            if game_winner == fid: s['wins'] += 1
            
            techs = pd['techs']
            if len(techs) >= 1: s['tech_first'][techs[0]] += 1
            if len(techs) >= 2: s['tech_second'][techs[1]] += 1
            if len(techs) >= 3: s['tech_third'][techs[2]] += 1
            
            for sc in pd['round1_sc']:
                s['round1_sc'][sc] += 1
            
            for t in pd['tacticals']:
                s['tactical'] += 1
                if t['combat']: s['combat'] += 1
                else: s['expansion'] += 1
        
    print(f'Processed {processed} games with winner signal')
    
    # Build output
    output = {'gamesCount': 0, 'gamesWon': 0, 'techOrder': {}, 'round1ScTop': [], 'expansionRatio': 0.0, 'aggression': 0.0, 'avgResearchRound': 0.0}
    tempo_data = {}
    
    for fid, s in stats.items():
        if s['games'] < 5: continue  # Skip factions with very few games
        total_t = max(s['tactical'], 1)
        tempo_data[fid] = {
            'gamesCount': s['games'],
            'gamesWon': s['wins'],
            'techOrder': {
                'first': top_n(s['tech_first'], 5),
                'second': top_n(s['tech_second'], 5),
                'third': top_n(s['tech_third'], 5),
            },
            'round1ScTop': top_n(s['round1_sc'], 4),
            'expansionRatio': round(s['expansion'] / total_t, 3),
            'aggression': round(s['combat'] / total_t, 3),
            'avgResearchRound': 0.0,  # Not tracked in this simple version
        }
    
    # Write output
    target = 'src/ai/tempoData.ts'
    with open(target, 'w') as fp:
        fp.write('''/**
 * Per-faction tempo and opening strategies distilled from AsyncTI4 per-move records.
 * Auto-generated by scripts/distill_tempo.py — DO NOT EDIT DIRECTLY.
 */
import type { FactionId, StrategyCardId } from '../engine/types'

export interface FactionTempo {
  gamesCount: number
  gamesWon: number
  techOrder: { first: string[]; second: string[]; third: string[] }
  round1ScTop: string[]
  expansionRatio: number
  aggression: number
  avgResearchRound: number
}

export interface TempoData {
  [faction: string]: FactionTempo
}

export const TEMPORAL_DATA: Readonly<TempoData> = ''' + json.dumps(tempo_data, indent=2).replace('"', '').replace('  ', '  ') + ''' as const

/** Tech order preference for faction (top N picks for position). */
export function getTechOrderPreference(faction: FactionId, position: 1 | 2 | 3, n: number = 3): string[] {
  const t = TEMPORAL_DATA[faction]?.techOrder
  if (!t) return []
  if (position === 1) return t.first.slice(0, n)
  if (position === 2) return t.second.slice(0, n)
  return t.third.slice(0, n)
}

/** Round 1 strategy card top picks for faction. */
export function getRound1ScTop(faction: FactionId, n: number = 3): string[] {
  return TEMPORAL_DATA[faction]?.round1ScTop?.slice(0, n) ?? []
}

/** Expansion vs conflict ratio (0=aggressive, 1=expansive). */
export function getExpansionRatio(faction: FactionId): number {
  return TEMPORAL_DATA[faction]?.expansionRatio ?? 0.5
}

/** Aggression ratio (fraction of tactical actions that are combat). */
export function getAggression(faction: FactionId): number {
  return TEMPORAL_DATA[faction]?.aggression ?? 0.5
}
''')
    
    print(f'Wrote {target} ({len(tempo_data)} factions)')

if __name__ == '__main__':
    main()
