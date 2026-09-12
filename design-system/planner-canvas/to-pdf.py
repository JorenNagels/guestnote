"""Assemble the rendered artboards into one PDF, a page per screen at natural size."""
import json, sys, os
from PIL import Image

out = sys.argv[1]
items = json.load(open(os.path.join(out, "index.json")))
pages = []
for it in items:
    im = Image.open(it["png"]).convert("RGB")
    # Shot at deviceScaleFactor 2; halve it so one CSS pixel is one PDF point-ish at 96dpi.
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    pages.append(im)

dest = os.path.join(out, "guestnote-planner-app-screens.pdf")
pages[0].save(dest, save_all=True, append_images=pages[1:], resolution=96.0)
print(f"{len(pages)} pages -> {dest} ({os.path.getsize(dest)/1e6:.1f} MB)")
