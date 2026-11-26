"""Generates the app icon (adaptive + legacy), notification icon and splash screens. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os
R = "android/app/src/main/res"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def orbs(size, dark=True):
    W, H = size
    img = Image.new("RGB", size, (11, 16, 32) if dark else (238, 241, 248))
    layer = Image.new("RGBA", size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    s = min(W, H)
    for (cx, cy, r, col) in [(0.22, 0.25, 0.55, (99, 102, 241, 230)), (0.85, 0.35, 0.5, (20, 184, 166, 200)), (0.5, 0.95, 0.6, (168, 85, 247, 200))]:
        d.ellipse([cx * W - r * s / 1.6, cy * H - r * s / 1.6, cx * W + r * s / 1.6, cy * H + r * s / 1.6], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(s * 0.12))
    img.paste(layer, (0, 0), layer)
    return img

def glass_mark(size):
    """Frosted glass card with a rupee mark, transparent background (adaptive foreground)."""
    S = size; img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    card = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
    m = int(S * 0.28); box = [m, int(S * 0.30), S - m, S - int(S * 0.30)]
    # back card (offset), front card: layered glass
    d.rounded_rectangle([box[0] + S * 0.05, box[1] - S * 0.06, box[2] + S * 0.05, box[3] - S * 0.06], radius=S * 0.07, fill=(255, 255, 255, 70), outline=(255, 255, 255, 120), width=max(1, S // 160))
    d.rounded_rectangle(box, radius=S * 0.07, fill=(255, 255, 255, 120), outline=(255, 255, 255, 220), width=max(1, S // 110))
    # highlight
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([box[0] + S * 0.02, box[1] + S * 0.02, box[2] - S * 0.02, box[1] + S * 0.1], radius=S * 0.05, fill=(255, 255, 255, 90))
    card = Image.alpha_composite(card, hl.filter(ImageFilter.GaussianBlur(S * 0.01)))
    f = ImageFont.truetype(FONT, int(S * 0.24))
    td = ImageDraw.Draw(card)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    td.text((cx, cy + S * 0.005), "₹", font=f, fill=(30, 27, 75, 255), anchor="mm")
    return Image.alpha_composite(img, card)

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True); img.save(path)

dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
master_bg = orbs((1024, 1024)); master_fg = glass_mark(1024)
full = master_bg.convert("RGBA"); full = Image.alpha_composite(full, master_fg)
save(full.convert("RGB"), "resources/icon-1024.png")
for k, f in dens.items():
    n = int(48 * f); a = int(108 * f)
    sq = full.resize((n, n), Image.LANCZOS)
    mask = Image.new("L", (n, n), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=255)
    leg = Image.new("RGBA", (n, n), (0, 0, 0, 0)); leg.paste(sq, (0, 0), mask); save(leg, f"{R}/mipmap-{k}/ic_launcher.png")
    rm = Image.new("L", (n, n), 0); ImageDraw.Draw(rm).ellipse([0, 0, n - 1, n - 1], fill=255)
    rd = Image.new("RGBA", (n, n), (0, 0, 0, 0)); rd.paste(sq, (0, 0), rm); save(rd, f"{R}/mipmap-{k}/ic_launcher_round.png")
    save(master_fg.resize((a, a), Image.LANCZOS), f"{R}/mipmap-{k}/ic_launcher_foreground.png")
    save(master_bg.resize((a, a), Image.LANCZOS), f"{R}/mipmap-{k}/ic_launcher_background.png")
    # status-bar notification icon: white silhouette
    ni = int(24 * f); nimg = Image.new("RGBA", (ni, ni), (0, 0, 0, 0))
    ImageDraw.Draw(nimg).text((ni / 2, ni / 2), "₹", font=ImageFont.truetype(FONT, int(ni * 0.85)), fill=(255, 255, 255, 255), anchor="mm")
    save(nimg, f"{R}/drawable-{k}/ic_stat_glass.png")
with open(f"{R}/mipmap-anydpi-v26/ic_launcher.xml", "w") as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')
with open(f"{R}/mipmap-anydpi-v26/ic_launcher_round.xml", "w") as fh:
    fh.write(open(f"{R}/mipmap-anydpi-v26/ic_launcher.xml").read())
for p in ["drawable/ic_launcher_background.xml", "drawable-v24/ic_launcher_foreground.xml"]:
    if os.path.exists(f"{R}/{p}"): os.remove(f"{R}/{p}")

def splash(W, H):
    img = orbs((W, H)).convert("RGBA"); s = int(min(W, H) * 0.95)
    mk = glass_mark(s); img.alpha_composite(mk, ((W - s) // 2, (H - s) // 2 - int(min(W, H) * 0.06)))
    d = ImageDraw.Draw(img); f = ImageFont.truetype(FONT, int(min(W, H) * 0.06))
    d.text((W / 2, H / 2 + s * 0.24), "Finance Tracker", font=f, fill=(255, 255, 255, 235), anchor="mm")
    return img.convert("RGB")
sizes = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}
for k, (w, h) in sizes.items():
    save(splash(w, h), f"{R}/drawable-port-{k}/splash.png"); save(splash(h, w), f"{R}/drawable-land-{k}/splash.png")
save(splash(480, 800), f"{R}/drawable/splash.png")
save(splash(1080, 1920), "resources/splash.png")
print("icons and splash generated")
