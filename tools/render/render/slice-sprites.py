import sys, json, os
from PIL import Image
unit=sys.argv[1]; src=sys.argv[2]; out='sprites-b'
COLORS=['red','blue','green','yellow','purple','black','orange','pink','grey']
im=Image.open(src).convert('RGBA'); cell=1024
man={}
for i,c in enumerate(COLORS):
    col,row=i%3,i//3
    tile=im.crop((col*cell,row*cell,(col+1)*cell,(row+1)*cell))
    bbox=tile.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    if not bbox: print('EMPTY',unit,c); continue
    x0,y0,x1,y1=bbox; pad=6
    sp=tile.crop((max(0,x0-pad),max(0,y0-pad),min(cell,x1+pad),min(cell,y1+pad)))
    sp.save(f'{out}/{c}_{unit}.png'); man[c]=[sp.width,sp.height]
print(json.dumps({unit:man}))
