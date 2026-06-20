#!/usr/bin/env python3
"""
Rasterize each page of the company profile PDF to JPEGs in assets/company-profile/.

By default, vector text is redacted before rasterizing so the site can show the same
visuals without duplicating copy (HTML carries the text). Raster/bitmap text inside
images cannot be removed — replace those source assets manually if needed.

Usage:
  python3 scripts/export-company-profile-slides.py
  python3 scripts/export-company-profile-slides.py --no-strip-text
  python3 scripts/export-company-profile-slides.py --pdf /path/to/profile.pdf
"""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path.home() / "Downloads" / "Atmad Company Profile.pdf"
OUT_DIR = ROOT / "assets" / "company-profile"
SCALE = 1.35
JPG_QUALITY = 88

# Skip redaction rects covering almost the whole page (bad detection / full-bleed mistake)
MAX_REDACT_AREA_FRAC = 0.88
WORD_PAD_PT = 2.5
BLOCK_PAD_PT = 2.0


def _edge_background_rgb(page: fitz.Page) -> tuple[float, float, float]:
    """Sample RGB along page edges (0–1) for redaction fill."""
    pix = page.get_pixmap(matrix=fitz.Matrix(0.22, 0.22), alpha=False, colorspace=fitz.csRGB)
    w, h = pix.width, pix.height
    if w < 2 or h < 2:
        return (0.06, 0.06, 0.07)
    coords: list[tuple[int, int]] = []
    step = max(1, min(w, h) // 16)
    for x in range(0, w, step):
        coords.append((min(x, w - 1), 1))
        coords.append((min(x, w - 1), h - 2))
    for y in range(0, h, step):
        coords.append((1, min(y, h - 1)))
        coords.append((w - 2, min(y, h - 1)))
    rs, gs, bs = [], [], []
    for x, y in coords:
        r, g, b = pix.pixel(x, y)
        rs.append(r)
        gs.append(g)
        bs.append(b)
    n = len(rs)
    return (
        sum(rs) / (255.0 * n),
        sum(gs) / (255.0 * n),
        sum(bs) / (255.0 * n),
    )


def _inflate_rect(rect: fitz.Rect, pad: float) -> fitz.Rect:
    return fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)


def _redact_extractable_text(page: fitz.Page, fill_rgb01: tuple[float, float, float]) -> None:
    """Cover extractable text with solid fill (vector text)."""
    mediabox = page.rect
    page_area = mediabox.width * mediabox.height
    seen: set[tuple[float, float, float, float]] = set()

    def add_rect(r: fitz.Rect) -> None:
        if r.is_empty or r.width < 0.5 or r.height < 0.5:
            return
        r.intersect(mediabox)
        if r.is_empty:
            return
        area = r.width * r.height
        if area > MAX_REDACT_AREA_FRAC * page_area:
            return
        key = (round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2))
        if key in seen:
            return
        seen.add(key)
        page.add_redact_annot(r, fill=fill_rgb01)

    # Word boxes (good coverage for lines of copy)
    words = page.get_text("words") or []
    for w in words:
        x0, y0, x1, y1 = w[0], w[1], w[2], w[3]
        add_rect(_inflate_rect(fitz.Rect(x0, y0, x1, y1), WORD_PAD_PT))

    # Dict blocks catch some text words() misses
    try:
        data = page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)
        for block in data.get("blocks", []):
            if block.get("type") != 0:
                continue
            bbox = block.get("bbox")
            if not bbox:
                continue
            x0, y0, x1, y1 = bbox
            add_rect(_inflate_rect(fitz.Rect(x0, y0, x1, y1), BLOCK_PAD_PT))
    except (AttributeError, ValueError, RuntimeError):
        pass

    page.apply_redactions(images=0, graphics=0)


def export_pages(pdf: Path, out_dir: Path, *, strip_text: bool) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    mat = fitz.Matrix(SCALE, SCALE)
    doc = fitz.open(pdf)
    try:
        n = doc.page_count
        for i in range(n):
            page = doc.load_page(i)
            if strip_text:
                fill = _edge_background_rgb(page)
                _redact_extractable_text(page, fill)
            pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
            path = out_dir / f"slide-{i + 1:02d}.jpg"
            pix.save(str(path), jpg_quality=JPG_QUALITY)
        return n
    finally:
        doc.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Export company profile PDF to slide JPEGs.")
    p.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    p.add_argument("--out", type=Path, default=OUT_DIR)
    p.add_argument(
        "--no-strip-text",
        action="store_true",
        help="Rasterize slides as-is (keep all text in images).",
    )
    args = p.parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"PDF not found: {args.pdf}")
    mode = "text stripped (vector)" if not args.no_strip_text else "verbatim"
    count = export_pages(args.pdf, args.out, strip_text=not args.no_strip_text)
    print(f"Wrote {count} slides to {args.out} ({mode})")


if __name__ == "__main__":
    main()
