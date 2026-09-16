#!/usr/bin/env python3
"""Trim transparent margins off a rendered sprite set and update its manifest spriteW/H."""
import sys, json, os
from PIL import Image

d = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/sprites/studio'
manifest_path = os.path.join(d, 'manifest.json')
manifest = json.load(open(manifest_path))
for unit, entry in manifest['units'].items():
    best_w, best_h = 0, 0
    for colour in manifest['colors']:
        path = os.path.join(d, f'{colour}_{unit}.png')
        im = Image.open(path).convert('RGBA')
        bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if not bbox:
            continue
        x0, y0, x1, y1 = bbox
        pad = 6
        trimmed = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
        trimmed.save(path)
        best_w, best_h = max(best_w, trimmed.width), max(best_h, trimmed.height)
    entry['spriteW'], entry['spriteH'] = best_w, best_h
    print(f"{unit}: {best_w}x{best_h}")
json.dump(manifest, open(manifest_path, 'w'), indent=1)
open(manifest_path, 'a').write('\n')
