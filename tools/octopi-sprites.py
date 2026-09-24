"""Prepares the drawn Octopi looks for the app.

For every `<name>Front.png` + `<name>Ooff.png` pair under the source folder:
1. Make the alpha binary first: alpha >= 128 -> 255, else 0 (the rule the first sprites got). A
   source with nothing transparent (saved as RGB on a flat white sheet, like the Seeker's hit pose)
   is keyed instead, by `body_mask`.
2. Trim to the alpha bounding box and downscale so the longer side is at most MAX_SIDE. The resize
   softens the rim, so the same rule makes the alpha binary again.
3. Reduce the colour of the opaque pixels alone to at most 255 entries, no dithering, and give
   every transparent pixel the one reserved entry TRANSPARENT. The palette PNG then has a single
   transparent entry, and its alpha is exactly the binary alpha of step 2. (A palette keeps the
   whole set near 5 MB; lossless RGBA would be about 38 MB, too much for the APK.) The palette is
   Pillow's maximum coverage refined by k-means, and each sprite gets the fewest entries of
   PALETTE_SIZES that keep its mean error within MEAN_ERROR. Pillow's median cut was measured and
   dropped: it splits by pixel count, so it spends the palette on the large smooth areas (the set
   came out at 16 MB) and lumps rare colours together (single pixels off by 200+).
4. Write `<slug>-front.png` / `<slug>-ooff.png` into the output folder.

Usage: python tools/octopi-sprites.py <source folder> <output folder>
Needs Python >= 3.9 and Pillow >= 9.1 (Image.Resampling, Image.Quantize, Image.Dither).

The slug table below maps the owner's file names to the slug each look uses elsewhere. Nothing is
guessed: a file whose stem is not in the table, a bare `<name>.png` that is not the unnamed front,
a second file for a pose already taken (the first met in a sorted walk stays), an incomplete pair
and a source that cannot be keyed (its whole pair is then left unwritten) are each reported and
skipped, and the run then ends with a summary and exit code 1.
"""
import os
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

MAX_SIDE = 1400
TRANSPARENT = 255  # the palette entry every transparent pixel takes; the colours use 0..254
PALETTE_SIZES = (48, 64, 96, 128, 160, 192, 224, 255)  # tried in turn; the last is the most there is
MEAN_ERROR = 3.5  # the mean |dR| + |dG| + |dB| over a sprite's opaque pixels its palette may leave
WHITE_TOLERANCE = 40  # how far from pure white (|255-R| + |255-G| + |255-B|) a backdrop pixel may be
BACKDROP = 128  # the flood's mark; the map it floods only ever holds 0 and 255
ERODE_PX = 1  # how far a keyed body's rim is shrunk: 1 px takes the Seeker's white fringe off

# owner's file stem (case-insensitive, the part before Front/Ooff) -> slug
SLUGS = {
    "azul": "azul", "poseidon": "poseidon", "coraluna": "coraluna", "hex": "hex", "kakashi": "kakashi",
    "krang": "krang", "noob": "noob", "shoupe": "shoupe",
    "seeker": "seeker",
    "0010101": "matrix", "bear": "bear", "bunny": "bunny", "grim": "grim", "king": "king", "pengu": "pengu",
    "reaper": "reaper", "sharingan": "sharingan", "sponge": "sponge", "tiger": "tiger", "wizard": "wizard",
    "img_9530": "outlaw", "img_": "outlaw",  # the unnamed pair: IMG_9530.png (front) + IMG_Ooff.png (hit)
}
# The only stems whose bare `<stem>.png` (no Front/Ooff) is a front; any other bare name is skipped.
BARE_FRONTS = {"img_9530"}


def binary(alpha: Image.Image) -> Image.Image:
    return alpha.point(lambda a: 255 if a >= 128 else 0)


def body_mask(image: Image.Image) -> Image.Image:
    """The alpha (255 body, 0 backdrop) of a source with nothing transparent, drawn on a flat white
    sheet. The backdrop is every near-white pixel connected to a near-white corner; anything not
    connected to the border stays, so a white "OUCH" badge inside the pose survives and the sheet
    around it does not. The flood runs on a map of its own that only holds 0 and 255, so no colour
    of the drawing can ever be taken for the flood's mark. The body's rim is then shrunk by ERODE_PX
    (a 3x3 minimum filter per pixel), which drops the anti-aliased near-white fringe along the
    outline."""
    r, g, b = ImageChops.invert(image.convert("RGB")).split()
    # |255-R| + |255-G| + |255-B|, clipped at 255 (only whether it is <= WHITE_TOLERANCE matters)
    distance = ImageChops.add(ImageChops.add(r, g), b)
    near_white = distance.point(lambda d: 255 if d <= WHITE_TOLERANCE else 0)
    w, h = near_white.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seeds = [c for c in corners if near_white.getpixel(c) == 255]
    if not seeds:
        raise ValueError("nothing transparent and no near-white corner to key the backdrop from")
    for seed in seeds:
        ImageDraw.floodfill(near_white, seed, BACKDROP)
    body = near_white.point(lambda v: 0 if v == BACKDROP else 255)
    for _ in range(ERODE_PX):
        body = body.filter(ImageFilter.MinFilter(3))
    return body


def fit(image: Image.Image) -> Image.Image:
    """Steps 1 and 2: the source as RGBA with a binary alpha, trimmed and at most MAX_SIDE long."""
    rgba = image.convert("RGBA")
    alpha = binary(rgba.getchannel("A"))
    if alpha.getextrema()[0] == 255:  # nothing transparent: the drawing sits on a sheet
        alpha = body_mask(image)
    rgba.putalpha(alpha)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("empty image")
    rgba = rgba.crop(box)
    longer = max(rgba.size)
    if longer > MAX_SIDE:
        scale = MAX_SIDE / longer
        size = (round(rgba.width * scale), round(rgba.height * scale))
        # Pillow resizes RGBA premultiplied, so a rim pixel keeps its own colour, not the hidden one.
        rgba = rgba.resize(size, Image.Resampling.LANCZOS)
        alpha = binary(rgba.getchannel("A"))
        rgba.putalpha(alpha)
        rgba = rgba.crop(alpha.getbbox())
    return rgba


def reduce_colours(strip: Image.Image) -> Image.Image:
    """The opaque pixels (`strip`, one row of them) mapped to the fewest entries of PALETTE_SIZES
    that keep the mean error within MEAN_ERROR, or to 255 when none does. Maximum coverage places
    the entries over the whole colour range, so a rare colour keeps an entry of its own; k-means
    then pulls each entry to the mean of its pixels. Pillow's `kmeans` is a stop threshold on the
    pixels that still move, not a pass count (measured: a larger value stops sooner), so 1 runs
    until none moves."""
    for size in PALETTE_SIZES:
        colours = strip.quantize(
            colors=size, method=Image.Quantize.MAXCOVERAGE, kmeans=1, dither=Image.Dither.NONE
        )
        error = sum(ImageStat.Stat(ImageChops.difference(strip, colours.convert("RGB"))).mean)
        if error <= MEAN_ERROR:
            break
    return colours


def to_palette(rgba: Image.Image) -> Image.Image:
    """Step 3: reduce the opaque pixels' colour to at most 255 entries, give every transparent pixel
    the entry TRANSPARENT, and mark that entry as the single transparent one. The alpha is not
    quantised at all, so it stays exactly the binary alpha it came in with, and the palette spends
    nothing on the colour hidden behind alpha 0."""
    w, h = rgba.size
    alpha = rgba.getchannel("A").tobytes()
    rgb = rgba.convert("RGB").tobytes()
    opaque = [i for i, a in enumerate(alpha) if a == 255]
    strip = bytearray(3 * len(opaque))
    for j, i in enumerate(opaque):
        strip[3 * j:3 * j + 3] = rgb[3 * i:3 * i + 3]
    colours = reduce_colours(Image.frombytes("RGB", (len(opaque), 1), bytes(strip)))
    index = colours.tobytes()
    pixels = bytearray([TRANSPARENT]) * (w * h)
    for j, i in enumerate(opaque):
        pixels[i] = index[j]
    out = Image.frombytes("P", (w, h), bytes(pixels))
    palette = colours.getpalette()[: 3 * TRANSPARENT]
    out.putpalette(palette + [0] * (3 * 256 - len(palette)))
    out.info["transparency"] = TRANSPARENT
    return out


def prepare(image: Image.Image) -> Image.Image:
    return to_palette(fit(image))


def main(source: str, output: str) -> int:
    os.makedirs(output, exist_ok=True)
    pairs: dict[str, dict[str, str]] = {}
    problems: list[str] = []

    def skip(reason: str) -> None:
        problems.append(reason)
        print(f"warning: {reason}")

    for folder, dirs, files in os.walk(source):
        dirs.sort(key=str.lower)  # a fixed order: "the first file for a pose" is the same everywhere
        for name in sorted(files, key=str.lower):
            m = re.match(r"(.+?)(Front|Ooff)?\.png$", name, re.IGNORECASE)
            if not m:
                continue
            path = os.path.join(folder, name)
            stem = m.group(1).lower()
            slug = SLUGS.get(stem)
            if slug is None:
                skip(f"no slug for {path}")
                continue
            if m.group(2) is None and stem not in BARE_FRONTS:
                skip(f"no Front/Ooff in the name of {path}")
                continue
            pose = (m.group(2) or "front").lower()  # IMG_9530.png carries no suffix: it is the front
            poses = pairs.setdefault(slug, {})
            if pose in poses:
                skip(f"second {pose} for {slug}: {path} (kept {poses[pose]})")
                continue
            poses[pose] = path
    done = 0
    for slug, poses in sorted(pairs.items()):
        if set(poses) != {"front", "ooff"}:
            skip(f"incomplete pair {slug}: only {sorted(poses)}")
            continue
        # Both poses are prepared before either is written, so a pair is never left half new.
        ready = {}
        for pose, path in sorted(poses.items()):
            try:
                ready[pose] = prepare(Image.open(path))
            except ValueError as error:
                skip(f"cannot prepare {path}: {error}")
        if len(ready) != 2:
            skip(f"pair {slug} not written")
            continue
        for pose, out in ready.items():
            target = os.path.join(output, f"{slug}-{pose}.png")
            out.save(target, optimize=True)
            print(f"{slug}-{pose}: {out.size[0]}x{out.size[1]} {os.path.getsize(target) // 1024} KB")
        done += 1
    print(f"{done} pairs written to {output}")
    if problems:
        print(f"{len(problems)} problem(s), nothing guessed:")
        for reason in problems:
            print(f"  {reason}")
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
