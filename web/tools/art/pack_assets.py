"""Empacota escudos, logos, placas e marca do jogo (Godot) em atlas WebP para a web.
Uso: python3 -I tools/art/pack_assets.py <pasta_assets_godot> <web/public>"""
import json, os, sys, glob
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
ART = os.path.join(OUT, "art")
os.makedirs(ART, exist_ok=True)

def pack(files, name, cell, per_row, quality):
    """Cada imagem vai para uma célula quadrada; devolve {id: [folha, x, y, w, h]}."""
    per_sheet = per_row * per_row
    mapping = {}
    for s in range(0, len(files), per_sheet):
        chunk = files[s:s + per_sheet]
        rows = (len(chunk) + per_row - 1) // per_row
        sheet = Image.new("RGBA", (per_row * cell, rows * cell), (0, 0, 0, 0))
        idx = s // per_sheet
        for i, (key, path) in enumerate(chunk):
            try:
                im = Image.open(path).convert("RGBA")
            except Exception:
                continue
            bb = im.getbbox()
            if bb:
                im = im.crop(bb)
            im.thumbnail((cell - 2, cell - 2), Image.LANCZOS)
            x = (i % per_row) * cell + (cell - im.width) // 2
            y = (i // per_row) * cell + (cell - im.height) // 2
            sheet.alpha_composite(im, (x, y))
            mapping[key] = [idx, x, y, im.width, im.height]
        sheet.save(os.path.join(ART, f"{name}_{idx}.webp"), "WEBP", quality=quality, method=6)
    return mapping, (len(files) + per_sheet - 1) // per_sheet

def ids(folder):
    out = []
    for p in sorted(glob.glob(os.path.join(folder, "*.webp")) + glob.glob(os.path.join(folder, "*.png"))):
        k = os.path.splitext(os.path.basename(p))[0]
        out.append((k, p))
    return out

crests, n_c = pack(ids(os.path.join(SRC, "datapack/logos")), "crests", 96, 21, 82)
comp_files = dict(ids(os.path.join(SRC, "datapack/comps")))
comp_files.update(dict(ids(os.path.join(SRC, "comp_logos"))))   # logos próprias têm prioridade
comps, n_k = pack(sorted(comp_files.items()), "comps", 128, 16, 88)

# placas de publicidade: altura 48 px, uma faixa por pasta
ads = {}
for d in sorted(os.listdir(os.path.join(SRC, "datapack/adboards"))):
    imgs = []
    for p in sorted(glob.glob(os.path.join(SRC, "datapack/adboards", d, "*.webp"))):
        im = Image.open(p).convert("RGB")
        im = im.resize((max(1, round(im.width * 48 / im.height)), 48), Image.LANCZOS)
        imgs.append(im)
    if not imgs:
        continue
    # quebra em linhas de até 4096 px (limite do WebP é 16383)
    W = 4096
    rows, x, y, rects = [[]], 0, 0, []
    for im in imgs:
        if x + im.width > W and x > 0:
            rows.append([]); x = 0; y += 1
        rows[-1].append((im, x)); rects.append([y, x, im.width]); x += im.width
    strip = Image.new("RGB", (W if len(rows) > 1 else x, 48 * len(rows)))
    for r, row in enumerate(rows):
        for im, xx in row:
            strip.paste(im, (xx, r * 48))
    strip.save(os.path.join(ART, f"ads_{d}.webp"), "WEBP", quality=78, method=6)
    ads[d] = rects

# marca
B = os.path.join(SRC, "brand")
Image.open(os.path.join(B, "banner.webp")).convert("RGB").save(os.path.join(ART, "banner.webp"), "WEBP", quality=86)
Image.open(os.path.join(B, "splash.png")).convert("RGB").save(os.path.join(ART, "splash.webp"), "WEBP", quality=86)
for f in ["icon_192.png", "icon_512.png"]:
    Image.open(os.path.join(B, f)).save(os.path.join(ART, f))

json.dump({"cell": {"crests": 96, "comps": 128}, "sheets": {"crests": n_c, "comps": n_k},
           "crests": crests, "comps": comps, "ads": ads},
          open(os.path.join(ART, "atlas.json"), "w"), separators=(",", ":"))
print("crests", len(crests), "sheets", n_c, "comps", len(comps), "ads", len(ads))
