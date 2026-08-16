#!/usr/bin/env python3
"""Generate the DMG installer background image with usage notes."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 660, 400
BG = (246, 247, 249, 255)          # light neutral, macOS-like
DARK = (28, 30, 36, 255)
GRAY = (95, 99, 108, 255)
LINE = (206, 208, 212, 255)

FONT = "/System/Library/Fonts/STHeiti Medium.ttc"

def load(size):
    return ImageFont.truetype(FONT, size, index=0)

img = Image.new("RGBA", (W, H), BG)
d = ImageDraw.Draw(img)

title_f = load(40)
sub_f = load(19)
lead_f = load(16)
body_f = load(14)

# Title
title = "DeepSeek Harness"
w = d.textlength(title, font=title_f)
d.text(((W - w) / 2, 40), title, font=title_f, fill=DARK)

# Subtitle
sub = "把 App 图标拖到右侧 Applications 文件夹完成安装"
w = d.textlength(sub, font=sub_f)
d.text(((W - w) / 2, 96), sub, font=sub_f, fill=GRAY)

# Divider
d.line([(64, 268), (W - 64, 268)], fill=LINE, width=1)

# Notes
lead = "如首次打开被系统拦截，请按以下方式操作："
d.text((64, 276), lead, font=lead_f, fill=DARK)

notes = [
    "2. 系统设置 → 隐私与安全性（最正规的入口）",
    "    先双击 App 被拦截一次后，打开「系统设置 → 隐私与安全性」，",
    "    往下滚到「安全性」区，会出现一个「仍要打开」按钮，",
    "    点一下并输入密码即可。",
]
y = 304
for line in notes:
    d.text((64, y), line, font=body_f, fill=GRAY)
    y += 22

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dmg-background.png")
img.convert("RGB").save(out)
print("saved:", out, img.size)
