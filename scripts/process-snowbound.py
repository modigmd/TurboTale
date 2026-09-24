"""Deterministic cropping, alpha cleanup and nearest-neighbor packing of ImageGen art."""
from pathlib import Path
from PIL import Image
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "public/assets/generated/snowbound"
metadata = {"source": "OpenAI built-in image_gen", "filter": "nearest-neighbor", "assets": {}}

def clean(image):
    arr = np.array(image.convert("RGBA"))
    # Honor generated alpha and remove the specified magenta chroma key.
    r, g, b = [arr[:,:,i].astype(int) for i in range(3)]
    key = (r > 110) & (b > 100) & (r > g * 1.4) & (b > g * 1.4)
    arr[:,:,3] = np.where(key | (arr[:,:,3] < 150), 0, 255)
    arr[arr[:,:,3] == 0, :3] = 0
    return Image.fromarray(arr)

def cells(image, cols, rows):
    return [image.crop((round(c*image.width/cols), round(r*image.height/rows), round((c+1)*image.width/cols), round((r+1)*image.height/rows))) for r in range(rows) for c in range(cols)]

def pack(name, cols, rows, size, shared=False, crop_names=None):
    source = Image.open(ROOT / (name+"-raw.png"))
    parts = [Image.open(ROOT / 'crops' / (n+'.png')).convert('RGBA') for n in crop_names] if crop_names else [clean(cell) for cell in cells(source, cols, rows)]
    boxes = [part.getbbox() for part in parts]
    assert all(boxes), name+" contains an empty cell"
    crops = [part.crop(box) for part, box in zip(parts,boxes)]
    limitw, limith = size[0]-8, size[1]-8
    common = min(limitw/max(p.width for p in crops), limith/max(p.height for p in crops))
    out = Image.new("RGBA", (cols*size[0], rows*size[1]))
    frames=[]
    for i, part in enumerate(crops):
        scale = common if shared else min(limitw/part.width, limith/part.height)
        part = part.resize((max(1,round(part.width*scale)), max(1,round(part.height*scale))), Image.Resampling.NEAREST)
        frame = Image.new("RGBA",size)
        frame.alpha_composite(part, ((size[0]-part.width)//2,size[1]-4-part.height))
        bbox=frame.getbbox()
        assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<size[0] and bbox[3]<size[1], name+" edge touch"
        out.alpha_composite(frame, ((i%cols)*size[0],(i//cols)*size[1]))
        frames.append({"bounds":list(bbox), "edge_touch":False})
        if name=="turbo" and i==0: frame.save(ROOT/"turbo-face.png")
    out.save(ROOT/(name+".png"))
    metadata["assets"][name]={"size":list(out.size),"cell":list(size),"frames":frames,"prompt":name+".prompt.txt"}

terrain=Image.open(ROOT/"terrain-raw.png").convert("RGBA")
atlas=Image.new("RGBA",(128,128))
for i, tile in enumerate(cells(terrain,4,4)):
    # Keep the full bridge rails in spare frame 0 for overworld crossings.
    if i == 4:
        atlas.paste(tile.resize((32,32),Image.Resampling.NEAREST),(0,0))
    # Puzzle cells use the plank interiors; rails belong around the whole board.
    if i in (4,5,6,7):
        tile=tile.crop((round(tile.width*.16),round(tile.height*.13),round(tile.width*.84),round(tile.height*.87)))
    tile=tile.resize((32,32),Image.Resampling.NEAREST)
    base=Image.new("RGBA",(32,32),(134,157,202,255))
    base.alpha_composite(tile)
    atlas.paste(base,((i%4)*32,(i//4)*32))
atlas.save(ROOT/"terrain.png")
metadata["assets"]["terrain"]={"size":[128,128],"cell":[32,32],"frames":16,"prompt":"terrain.prompt.txt"}
pack("turbo",2,2,(64,64),True)
for name,cols,rows,size,names in [("tree",1,1,(64,96),['tree']),("cabin",1,1,(160,128),['cabin']),("props",2,2,(64,64),['rock','sign','lantern','trunk']),("actors",2,2,(64,64),['snail-family','jury','bridge-monster','plum-monster'])]:
    if (ROOT/(name+"-raw.png")).exists(): pack(name,cols,rows,size,crop_names=names)
actors=Image.open(ROOT/"actors.png")
for index,name in enumerate(['family','jury','monster','final-monster']):
    actors.crop(((index%2)*64,(index//2)*64,(index%2+1)*64,(index//2+1)*64)).save(ROOT/(name+'-face.png'))
# Extract the existing generated gold star; cool plank pixels become transparent.
star=np.array(atlas.crop((106,42,118,54)))
star[:,:,3]=np.where(star[:,:,0].astype(int)>star[:,:,2].astype(int)+4,255,0)
star_image=Image.fromarray(star)
star_canvas=Image.new('RGBA',(16,16))
star_canvas.alpha_composite(star_image,(2,2))
star_canvas.save(ROOT/'star.png')
metadata['assets']['star']={'size':[16,16],'source':'terrain atlas goal marker','prompt':'terrain.prompt.txt'}
(ROOT/"pipeline-meta.json").write_text(json.dumps(metadata,indent=2)+"\n")
print(json.dumps(metadata,indent=2))
