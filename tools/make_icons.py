"""アイコンを作り直す: python3 tools/make_icons.py icons"""
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
def icon(size, maskable=False):
    S = size * 4
    img = Image.new("RGB", (S, S), (176, 32, 48))
    d = ImageDraw.Draw(img)
    # 半券（横長の券を少し傾けずに中央へ）。maskable は安全領域（80%）に収める
    scale = 0.62 if maskable else 0.74
    w, h = S * scale, S * scale * 0.56
    x0, y0 = (S - w) / 2, (S - h) / 2
    x1, y1 = x0 + w, y0 + h
    r = S * 0.04
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=(252, 246, 236))
    # 左右の切り欠き
    nr = h * 0.13
    for cx in (x0, x1):
        d.ellipse([cx - nr, (y0+y1)/2 - nr, cx + nr, (y0+y1)/2 + nr], fill=(176, 32, 48))
    # ミシン目
    px = x0 + w * 0.70
    n = 9
    for i in range(n):
        yy = y0 + h * (i + 0.5) / n
        d.ellipse([px - S*0.007, yy - S*0.007, px + S*0.007, yy + S*0.007], fill=(176, 32, 48))
    # 文字の代わりの線
    lw = S * 0.022
    for i, frac in enumerate((0.55, 0.40, 0.30)):
        yy = y0 + h * (0.30 + i * 0.2)
        d.rounded_rectangle([x0 + w*0.10, yy - lw/2, x0 + w*0.10 + w*frac, yy + lw/2], radius=lw/2, fill=(176, 32, 48))
    # 星
    sx, sy = x0 + w * 0.85, (y0 + y1) / 2
    d.ellipse([sx - S*0.035, sy - S*0.035, sx + S*0.035, sy + S*0.035], fill=(176, 32, 48))
    return img.resize((size, size), Image.LANCZOS)
icon(180).save(f"{out}/apple-touch-icon.png")
icon(192).save(f"{out}/icon-192.png")
icon(512).save(f"{out}/icon-512.png")
icon(512, maskable=True).save(f"{out}/icon-maskable-512.png")
