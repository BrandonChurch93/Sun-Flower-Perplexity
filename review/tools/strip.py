#!/usr/bin/env python3
"""The film as one picture: one column for each frame.

Each frame of the film is averaged across its width, which leaves one column of
color running from the sky at the top to the soil at the bottom. The columns are
set side by side in film order, so the picture is as many pixels wide as the film
has frames. Nights show as dark bands, the frost as a pale stretch, the storm as
slate, the bloom as gold.

  python3 strip.py <film.mp4> <out.webp> [rows]

Needs ffmpeg, numpy and Pillow. The film is read at 320 x 180, which is enough
for an average across the width.
"""
import subprocess
import sys

import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 96
W, H = 320, 180

p = subprocess.Popen(
    ['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    stdout=subprocess.PIPE,
)
columns = []
while True:
    b = p.stdout.read(W * H * 3)
    if len(b) < W * H * 3:
        break
    frame = np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.float32)
    columns.append(frame.mean(axis=1))  # H x 3: the average across the width
p.wait()

strip = np.stack(columns, axis=1)  # H x frames x 3
im = Image.fromarray(strip.clip(0, 255).round().astype(np.uint8))
im = im.resize((len(columns), rows), Image.LANCZOS)
if out.endswith('.webp'):
    im.save(out, 'WEBP', quality=92, method=6)
else:
    im.save(out)
print('frames', len(columns), 'picture', im.size, 'file', out)
