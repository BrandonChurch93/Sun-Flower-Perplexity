#!/usr/bin/env python3
"""The page's mark: the disc of the flower, set out by the film's own rule.

The film places its disc florets in src/plant/head/disc/index.ts:

    rho   = RIM_SHARE * sqrt((n + 0.5) / COUNT)
    theta = n * GOLDEN

with COUNT = 1500 florets and GOLDEN = 137.508 degrees, both read from
config/showcase.json (plant.discFlorets, plant.goldenAngleDeg). This script
draws one dot for each floret by that rule and writes an SVG. The scale
RIM_SHARE is left out, because the picture fills its own frame.

Florets nearer the middle than 0.36 of the head's radius are drawn smaller and
fainter: in the film they stay closed (src/plant/head/disc/opening.ts, where a
floret at 0.36 of the radius or less does not begin to open before the growth
ends). The ring between 0.36 and 0.5 is a soft step between the two, chosen by
eye for this picture.

  python3 disc.py <out.svg> [color]
"""
import math
import sys

COUNT = 1500
GOLDEN_DEG = 137.508
RIM_SHARE = 0.95
OPEN_FROM = 0.36

out = sys.argv[1]
color = sys.argv[2] if len(sys.argv) > 2 else '#e2b23a'

SIZE = 1000
R = 484  # the radius the outermost dot sits on
cell = R * math.sqrt(math.pi / COUNT)  # the width of one floret's share of the disc

bands = [
    # from, to (shares of the head's radius), dot width as a share of the cell, opacity
    (0.0, OPEN_FROM, 0.34, 0.5),
    (OPEN_FROM, 0.5, 0.5, 0.8),
    (0.5, 2.0, 0.62, 1.0),
]
paths = [[] for _ in bands]
for n in range(COUNT):
    rho = math.sqrt((n + 0.5) / COUNT)
    theta = n * math.radians(GOLDEN_DEG)
    x = SIZE / 2 + R * rho * math.cos(theta)
    y = SIZE / 2 - R * rho * math.sin(theta)
    for i, (a, b, _, _) in enumerate(bands):
        if a <= RIM_SHARE * rho < b:
            # A dot is a line too short to see, with round ends.
            paths[i].append(f'M{x:.1f} {y:.1f}h.01')
            break

parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" fill="none" stroke="{color}" stroke-linecap="round">']
for (a, b, share, opacity), d in zip(bands, paths):
    parts.append(f'<path stroke-width="{cell * share:.2f}" stroke-opacity="{opacity}" d="{"".join(d)}"/>')
parts.append('</svg>')
with open(out, 'w') as f:
    f.write('\n'.join(parts) + '\n')
print('dots', sum(len(p) for p in paths), [len(p) for p in paths], 'cell', round(cell, 2), 'file', out)
