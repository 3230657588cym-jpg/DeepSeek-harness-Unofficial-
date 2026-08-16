#!/usr/bin/env python3
"""Generate the DMG installer background image with usage notes and disclaimer."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 660, 400
BG = (246, 247, 249, 255)          # light neutral, macOS-like
DARK = (28, 30, 36, 255)
GRAY = (95, 99, 108, 255)
FAINT = (150, 153, 160, 255)
LINE = (206, 208, 212, 255)

FONT = "/System/Library/Fonts/STHeiti Medium.ttc"

def load(size):
    return ImageFont.truetype(FONT, size, index=0)

def center_x(draw, text, font):
    return (W - draw.textlength(text, font=font)) / 2

img = Image.new("RGBA", (W, H), BG)
d = ImageDraw.Draw(img)

# Title
title = "DeepSeek Harness"
d.text((center_x(d, title, load(36)), 30), title, font=load(36), fill=DARK)

# Subtitle: drag-to-install hint
sub = "Drag the App icon into the Applications folder to install"
d.text((center_x(d, sub, load(15)), 74), sub, font=load(15), fill=GRAY)

# Disclaimer (unofficial + official link)
disc = "Unofficial community build — not affiliated with DeepSeek · https://www.deepseek.com/harness/"
d.text((center_x(d, disc, load(11)), 96), disc, font=load(11), fill=FAINT)

# Divider
d.line([(64, 250), (W - 64, 250)], fill=LINE, width=1)

# Notes
lead = "If the app is blocked on first launch:"
d.text((64, 258), lead, font=load(15), fill=DARK)

notes = [
    "2. System Settings → Privacy & Security (the official way)",
    "    After the app is blocked once, open System Settings →",
    "    Privacy & Security, scroll to the Security section and",
    '    click "Open Anyway", then enter your password.',
]
y = 286
for line in notes:
    d.text((64, y), line, font=load(14), fill=GRAY)
    y += 20

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dmg-background.png")
img.convert("RGB").save(out)
print("saved:", out, img.size)
