#!/usr/bin/env python3
"""
Pull picture assets from a .pptx that are NOT full-slide bleeds — usually the
photo / illustration side of a split layout, while titles and body copy live
as separate shapes (your site already has that text in HTML).

Full-bleed pictures (background composites that may include rasterized text)
are skipped by default.

Usage:
  python3 scripts/extract-pptx-visuals.py --pptx "/path/Company Profile.pptx"
  python3 scripts/extract-pptx-visuals.py --pptx deck.pptx --out assets/company-profile/extracted
  python3 scripts/extract-pptx-visuals.py --pptx deck.pptx --all-partials

Requires: Python 3.9+ (stdlib only).
"""

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

REL_TYPE_IMAGE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
)


def _read_slide_size(z: zipfile.ZipFile) -> tuple[int, int]:
    raw = z.read("ppt/presentation.xml")
    root = ET.fromstring(raw)
    # {NS['p']}sldSz
    el = root.find("p:sldSz", NS)
    if el is None:
        return (12192000, 6858000)
    return (int(el.get("cx", "0")), int(el.get("cy", "0")))


def _rels_map(z: zipfile.ZipFile, slide_num: int) -> dict[str, str]:
    path = f"ppt/slides/_rels/slide{slide_num}.xml.rels"
    try:
        raw = z.read(path)
    except KeyError:
        return {}
    root = ET.fromstring(raw)
    out: dict[str, str] = {}
    for rel in root:
        if rel.tag.split("}")[-1] != "Relationship":
            continue
        rid = rel.get("Id")
        target = rel.get("Target")
        rtype = rel.get("Type")
        if not rid or not target or rtype != REL_TYPE_IMAGE:
            continue
        # ../media/image1.jpg -> ppt/media/image1.jpg
        t = target.replace("../", "ppt/")
        out[rid] = t
    return out


def _iter_pictures(slide_root: ET.Element) -> list[ET.Element]:
    """All p:pic under slide (not master)."""
    tree = slide_root.find("p:cSld", NS)
    if tree is None:
        return []
    sp_tree = tree.find("p:spTree", NS)
    if sp_tree is None:
        return []
    return list(sp_tree.findall(".//p:pic", NS))


def _pic_geom(pic: ET.Element) -> tuple[int, int, int, int] | None:
    sp_pr = pic.find("p:spPr", NS)
    if sp_pr is None:
        return None
    xfrm = sp_pr.find("a:xfrm", NS)
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return None
    try:
        x = int(off.get("x", "0"))
        y = int(off.get("y", "0"))
        cx = int(ext.get("cx", "0"))
        cy = int(ext.get("cy", "0"))
    except ValueError:
        return None
    return (x, y, cx, cy)


def _embed_id(pic: ET.Element) -> str | None:
    blip = pic.find(".//a:blip", NS)
    if blip is None:
        return None
    return blip.get(f"{{{NS['r']}}}embed")


def _is_full_bleed(cx: int, cy: int, slide_cx: int, slide_cy: int, frac: float) -> bool:
    return cx >= slide_cx * frac and cy >= slide_cy * frac


def extract(
    pptx: Path,
    out_dir: Path,
    *,
    include_full_bleed: bool,
    all_partials: bool,
    bleed_frac: float,
    min_bytes: int,
    min_area_frac: float,
) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    with zipfile.ZipFile(pptx, "r") as z:
        slide_cx, slide_cy = _read_slide_size(z)
        # slide files: slide1.xml .. slideN.xml — detect count
        names = [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml") and "/_" not in n]
        slides = []
        for n in names:
            part = Path(n).stem.replace("slide", "")
            if part.isdigit():
                slides.append(int(part))
        slides.sort()
        for sn in slides:
            rels = _rels_map(z, sn)
            if not rels:
                continue
            try:
                xml = z.read(f"ppt/slides/slide{sn}.xml")
            except KeyError:
                continue
            root = ET.fromstring(xml)
            pics = _iter_pictures(root)
            partials: list[tuple[str, tuple[int, int, int, int]]] = []
            bleeds: list[tuple[str, tuple[int, int, int, int]]] = []
            slide_area = float(slide_cx * slide_cy)
            min_area = slide_area * min_area_frac
            for pic in pics:
                rid = _embed_id(pic)
                if not rid or rid not in rels:
                    continue
                geom = _pic_geom(pic)
                if not geom:
                    continue
                _x, _y, pcx, pcy = geom
                if float(pcx * pcy) < min_area:
                    continue
                media_path = rels[rid]
                if _is_full_bleed(pcx, pcy, slide_cx, slide_cy, bleed_frac):
                    bleeds.append((media_path, geom))
                else:
                    partials.append((media_path, geom))

            chosen: list[tuple[str, str]]
            if partials:
                def area(t: tuple[str, tuple[int, int, int, int]]) -> int:
                    g = t[1]
                    return g[2] * g[3]

                partials.sort(key=area, reverse=True)
                if all_partials:
                    chosen = [(p[0], "main") for p in partials]
                else:
                    chosen = [(partials[0][0], "main")]
            elif include_full_bleed and bleeds:
                bleeds.sort(key=lambda t: t[1][2] * t[1][3], reverse=True)
                chosen = [(bleeds[0][0], "full")]
            else:
                chosen = []

            for media_inner, kind in chosen:
                try:
                    data = z.read(media_inner)
                except KeyError:
                    continue
                if len(data) < min_bytes:
                    continue
                suffix = Path(media_inner).suffix.lower() or ".bin"
                name = f"slide-{sn:02d}{suffix}"
                dest = out_dir / name
                dest.write_bytes(data)
                written += 1
                print(f"{name}  <-  {media_inner}  ({kind})")

    return written


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract non-bleed pictures from .pptx slides.")
    ap.add_argument(
        "--pptx",
        type=Path,
        default=Path.home() / "Downloads" / "Company Profile.pptx",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "assets" / "company-profile" / "extracted",
    )
    ap.add_argument(
        "--include-full-bleed",
        action="store_true",
        help="If a slide has no partial picture, export the largest full-bleed (may include text in raster).",
    )
    ap.add_argument(
        "--bleed-frac",
        type=float,
        default=0.94,
        help="Treat as full-bleed if width and height exceed this fraction of slide size.",
    )
    ap.add_argument(
        "--min-bytes",
        type=int,
        default=4096,
        help="Skip tiny assets (icons).",
    )
    ap.add_argument(
        "--all-partials",
        action="store_true",
        help="Export every non-bleed picture over the size threshold (not just the largest).",
    )
    ap.add_argument(
        "--min-area-frac",
        type=float,
        default=0.05,
        help="Minimum picture area as a fraction of the slide (filters icons/decals).",
    )
    args = ap.parse_args()
    if not args.pptx.is_file():
        raise SystemExit(f"File not found: {args.pptx}")
    n = extract(
        args.pptx,
        args.out,
        include_full_bleed=args.include_full_bleed,
        all_partials=args.all_partials,
        bleed_frac=args.bleed_frac,
        min_bytes=args.min_bytes,
        min_area_frac=args.min_area_frac,
    )
    print(f"\nWrote {n} file(s) to {args.out}")


if __name__ == "__main__":
    main()
