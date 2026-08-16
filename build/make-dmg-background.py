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

# Chinese subtitle: drag-to-install hint
sub = "把 App 图标拖到右侧 Applications 文件夹完成安装"
d.text((center_x(d, sub, load(15)), 74), sub, font=load(15), fill=GRAY)

# English disclaimer (unofficial + official link)
disc = "Unofficial community build — not affiliated with DeepSeek · https://www.deepseek.com/harness/"
d.text((center_x(d, disc, load(11)), 96), disc, font=load(11), fill=FAINT)

# Divider
d.line([(64, 250), (W - 64, 250)], fill=LINE, width=1)

# Notes
lead = "如首次打开被系统拦截，请按以下方式操作："
d.text((64, 258), lead, font=load(15), fill=DARK)

notes = [
    "2. 系统设置 → 隐私与安全性（最正规的入口）",
    "    先双击 App 被拦截一次后，打开「系统设置 → 隐私与安全性」，",
    "    往下滚到「安全性」区，会出现一个「仍要打开」按钮，",
    "    点一下并输入密码即可。",
]
y = 286
for line in notes:
    d.text((64, y), line, font=load(14), fill=GRAY)
    y += 20

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dmg-background.png")
img.convert("RGB").save(out)
print("saved:", out, img.size)
