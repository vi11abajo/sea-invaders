"""Prepares the drawn Octopi looks for the app (design doc 2026-09-23 §6).

For every `<name>Front.png` + `<name>Ooff.png` pair under the source folder: trim to the alpha
bounding box, make the body opaque (alpha >= 128 -> 255, else 0 — the rule the first sprites got),
downscale so the longer side is at most MAX_SIDE, quantise to a palette PNG (<= 256 colours) and
write `<slug>-front.png` / `<slug>-ooff.png` into the output folder.

Usage: python tools/octopi-sprites.py <source folder> <output folder>
The slug table below maps the owner's file names to the codes of the design doc (§1); a pair
whose name is not in the table is reported and skipped, never guessed.
"""
import os
import re
import sys

from PIL import Image

MAX_SIDE = 1400

# owner's file stem (case-insensitive, the part before Front/Ooff) -> slug
SLUGS = {
    "azul": "azul", "poseidon": "poseidon", "coraluna": "coraluna", "hex": "hex", "kakashi": "kakashi",
    "krang": "krang", "noob": "noob", "shoupe": "shoupe",
    "seeker": "seeker",
    "0010101": "matrix", "bear": "bear", "bunny": "bunny", "grim": "grim", "king": "king", "pengu": "pengu",
    "reaper": "reaper", "sharingan": "sharingan", "sponge": "sponge", "tiger": "tiger", "wizard": "wizard",
    "img_9530": "outlaw", "img_": "outlaw",  # the unnamed pair: IMG_9530.png (front) + IMG_Ooff.png (hit)
}


def key_out_backdrop(image: Image.Image, tolerance: int = 40) -> Image.Image:
    """A source saved without transparency (RGB) keeps its flat backdrop; this floods it away from the
    four corners so only the drawing stays. Anything not connected to the border is kept — a red
    "OUCH" badge inside the pose survives, a white sheet around it does not."""
    from PIL import ImageDraw

    rgb = image.convert("RGB")
    w, h = rgb.size
    mask = Image.new("L", (w, h), 255)
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, corner, (1, 2, 3), thresh=tolerance)
    px = rgb.load()
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == (1, 2, 3):
                mpx[x, y] = 0
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def prepare(image: Image.Image) -> Image.Image:
    rgba = key_out_backdrop(image) if image.mode == "RGB" else image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgba.putalpha(alpha)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("empty image")
    rgba = rgba.crop(box)
    longer = max(rgba.size)
    if longer > MAX_SIDE:
        scale = MAX_SIDE / longer
        rgba = rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.LANCZOS)
    # Quantise with the alpha kept exact: palette on the colour, the mask reapplied afterwards.
    rgb = rgba.convert("RGB").quantize(colors=255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    out = rgb.convert("RGBA")
    out.putalpha(rgba.getchannel("A"))
    return out.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


def main(source: str, output: str) -> int:
    os.makedirs(output, exist_ok=True)
    pairs: dict[str, dict[str, str]] = {}
    for folder, _, files in os.walk(source):
        for name in files:
            m = re.match(r"(.+?)(Front|Ooff)?\.png$", name, re.IGNORECASE)
            if not m:
                continue
            stem = m.group(1).lower()
            pose = (m.group(2) or "front").lower()  # IMG_9530.png carries no suffix: it is the front
            slug = SLUGS.get(stem)
            if slug is None:
                print(f"skip (no slug): {os.path.join(folder, name)}")
                continue
            pairs.setdefault(slug, {})[pose] = os.path.join(folder, name)
    done = 0
    for slug, poses in sorted(pairs.items()):
        if set(poses) != {"front", "ooff"}:
            print(f"incomplete pair {slug}: {sorted(poses)}")
            continue
        for pose, path in poses.items():
            out = prepare(Image.open(path))
            target = os.path.join(output, f"{slug}-{pose}.png")
            out.save(target, optimize=True)
            print(f"{slug}-{pose}: {out.size[0]}x{out.size[1]} {os.path.getsize(target) // 1024} KB")
        done += 1
    print(f"{done} pairs written to {output}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
