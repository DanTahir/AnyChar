"""Rebuild AnyChar's brand assets from the raw generated art.

Usage (from web/):  python scripts/build-brand-assets.py

Raw, full-size generator output lives in web/brand-src/ (git-ignored; it is
large and lossless). This script derives everything the site actually serves:

- The icon's face is transparent in the raw art, which reads as a dark hole on
  the site's dark theme. It is flood-filled with cream so the mark works on any
  background, then exported as the UI mark, the favicon (app/icon.png) and the
  Apple touch icon (app/apple-icon.png).
- Illustrations and portraits are re-encoded as lossy WebP at display sizes.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand-src"
BRAND = ROOT / "public" / "brand"
APP = ROOT / "src" / "app"

CREAM = (255, 246, 251, 255)
APPLE_BG = (11, 7, 22, 255)


def build_mark() -> Image.Image:
    icon = Image.open(SRC / "anychar-icon.png").convert("RGBA")
    w, h = icon.size

    # Drop the faint generator haze outside the strokes.
    r, g, b, a = icon.split()
    a = a.point(lambda v: v if v >= 16 else 0)
    icon = Image.merge("RGBA", (r, g, b, a))

    # Flood the transparent face region starting just above its centre.
    holes = a.point(lambda v: 255 if v < 128 else 0)
    seed = (w // 2, int(h * 0.44))
    if holes.getpixel(seed) != 255:
        raise SystemExit(f"seed {seed} is not inside the transparent face")
    ImageDraw.floodfill(holes, seed, 128)
    face = holes.point(lambda v: 255 if v == 128 else 0)

    share = face.histogram()[255] / (w * h)
    if not 0.08 < share < 0.5:
        raise SystemExit(f"face fill covers {share:.0%} of the canvas; it probably leaked")
    print(f"face fill: {share:.1%} of canvas")

    # Grow the fill a few px so it sits under the anti-aliased outline.
    face = face.filter(ImageFilter.MaxFilter(7))
    base = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    base.paste(CREAM, (0, 0, w, h), face)
    mark = Image.alpha_composite(base, icon)

    # Trim to content and re-centre on a square canvas with a small margin.
    bbox = mark.getbbox()
    if bbox is None:
        raise SystemExit("icon is empty")
    cropped = mark.crop(bbox)
    side = int(max(cropped.size) * 1.08)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    return square


def export_icons(mark: Image.Image) -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    mark.resize((512, 512), Image.LANCZOS).save(BRAND / "anychar-mark.png", optimize=True)
    mark.resize((256, 256), Image.LANCZOS).save(APP / "icon.png", optimize=True)

    apple = Image.new("RGBA", (180, 180), APPLE_BG)
    inner = mark.resize((138, 138), Image.LANCZOS)
    apple.alpha_composite(inner, ((180 - 138) // 2, (180 - 138) // 2))
    apple.convert("RGB").save(APP / "apple-icon.png", optimize=True)


def export_art() -> None:
    for path in sorted(SRC.glob("*.webp")):
        img = Image.open(path).convert("RGB")
        if path.stem.startswith("cast-"):
            img = img.resize((640, 640), Image.LANCZOS)
            quality = 80
        else:
            target_w = min(img.width, 1536 if path.stem == "aurora" else 1400)
            img = img.resize((target_w, round(img.height * target_w / img.width)), Image.LANCZOS)
            quality = 76 if path.stem == "aurora" else 80
        out = BRAND / path.name
        img.save(out, "WEBP", quality=quality, method=6)
        print(f"{out.name}: {img.width}x{img.height}, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    export_icons(build_mark())
    export_art()
