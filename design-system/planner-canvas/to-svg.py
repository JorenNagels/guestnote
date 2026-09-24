"""Rewrite each artboard's vector PDF as an SVG Figma can import as editable layers.

Two corrections applied to MuPDF's raw output, both of which matter on import:

1. **Size.** Chromium prints CSS pixels as PDF points (72dpi vs 96), so a 1440px
   artboard comes out 1080 wide and every frame lands in Figma at 75%. The viewBox is
   correct, so restating width/height in CSS pixels scales it back without touching a
   single coordinate.

2. **Font names.** The PDF embeds subset fonts, and MuPDF cannot recover their real
   names, so every run comes out labelled "DejaVu Sans". Relabelling is safe here and
   not a guess: each <tspan> carries PER-GLYPH x positions computed from Inter's own
   metrics, so the layout is fixed in the file no matter what font resolves. Leaving
   DejaVu would make Figma draw the wrong glyphs at Inter's positions -- the one
   combination that looks broken.
"""
import glob, json, os, re, sys
import pymupdf

out = sys.argv[1]
made = json.load(open(os.path.join(out, ".manifest.json")))
sizes = json.load(open(os.path.join(out, ".sizes.json")))

FONTS = {"DejaVu Sans Mono": "JetBrains Mono, ui-monospace, monospace",
         "DejaVu Sans": "Inter, system-ui, sans-serif"}

seen = set()
for name, pdf in made:
    doc = pymupdf.open(pdf)
    # text_as_path=False keeps <text> elements -- the whole point, since that is what
    # Figma turns into editable text layers. True would be pixel-perfect and inert.
    svg = doc[0].get_svg_image(text_as_path=False)
    doc.close()

    seen.update(re.findall(r'font-family="([^"]*)"', svg))
    # Longest first, so "DejaVu Sans Mono" is not eaten by the "DejaVu Sans" rule.
    for src, dst in sorted(FONTS.items(), key=lambda kv: -len(kv[0])):
        svg = svg.replace(f'font-family="{src}"', f'font-family="{dst}"')

    w, h = sizes[name]
    svg = re.sub(r'^(<svg[^>]*?)width="[\d.]+" height="[\d.]+"',
                 rf'\1width="{w}" height="{h}"', svg, count=1)

    dest = os.path.join(out, f"{name}.svg")
    open(dest, "w").write(svg)
    print(f"  {name}.svg  {w}x{h}  {os.path.getsize(dest)/1024:.0f} KB")

print(f"\nfont families MuPDF reported: {', '.join(sorted(seen))}")
print(f"{len(made)} SVGs -> {out}")

for f in glob.glob(os.path.join(out, ".*.pdf")) + glob.glob(os.path.join(out, ".*.html")):
    os.remove(f)
for f in (".manifest.json", ".sizes.json"):
    os.remove(os.path.join(out, f))
