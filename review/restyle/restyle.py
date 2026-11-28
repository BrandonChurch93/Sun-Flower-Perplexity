#!/usr/bin/env python3
"""Writes index.html in the film's own look from the index.html the page was published with.

Every change is an exact replacement that must match once, so text that is not
named here is carried over byte for byte.

The disc is set into the page itself, so it needs no file of its own: tools/disc.py
draws it, and its dots are copied in here once and used again further down.

  python3 review/restyle/restyle.py <published index.html> <review/tools/disc.svg> <out.html>

The published index.html is review/index.html at commit f676b48. How to get it, and
what came out, is in README.md beside this script. This is the record of one change:
it does not write review.css or review.js, which were changed by hand.
"""
import math
import re
import sys

src, disc_file, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8').read()
disc = open(disc_file, encoding='utf-8').read()
dots = re.findall(r'<path [^>]*/>', disc)
assert len(dots) == 3 and sum(d.count('M') for d in dots) == 1500, [d.count('M') for d in dots]
DISC = ('<g id="disc" fill="none" stroke="currentColor" stroke-linecap="round">' + ''.join(dots) + '</g>')


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)


# Fonts: Fraunces upright and italic, both fetched early.
rep('''    <link rel="preload" href="assets/fonts/Fraunces-latin.woff2" as="font" type="font/woff2" crossorigin />
''', '''    <link rel="preload" href="assets/fonts/Fraunces-roman.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="assets/fonts/Fraunces-italic.woff2" as="font" type="font/woff2" crossorigin />
''')

# The film's line: the film as one picture, in place of a plain line.
rep('''          <div class="scrub-track" id="scrub-track">
            <input type="range"''', '''          <div class="scrub-track" id="scrub-track">
            <div class="strip" aria-hidden="true"><span></span></div>
            <input type="range"''')

# The flower head on the line follows the film frame by frame, so the line takes steps of a hundredth of a second.
rep('''id="scrub" min="0" max="127" step="0.25" value="0"''', '''id="scrub" min="0" max="127" step="0.01" value="0"''')

# The buttons say what the film's own page says.
rep('''<button type="button" class="btn btn-play" id="play" aria-controls="film">Play</button>''',
    '''<button type="button" class="btn btn-play" id="play" aria-controls="film">Play the film</button>''')
rep('''<button type="button" class="btn btn-sound" id="sound" aria-controls="film" aria-pressed="false">Sound off</button>''',
    '''<button type="button" class="btn btn-sound" id="sound" aria-controls="film" data-on="no">Turn the sound on</button>''')
rep('''>Open the live version <span aria-hidden="true">&rarr;</span></a>''', '''>Open the live version</a>''')

# The title block, with the page's mark beside it.
rep('''        <div class="wrap">
        <h1 class="title">Life of a <span>Sunflower</span></h1>
''', '''        <div class="wrap intro-in">
        <div class="intro-text">
        <h1 class="title">Life of a <span>Sunflower</span></h1>
''')
rep('''every sunrise lands on a bar line of the music.</p>
        <dl class="facts">''', '''every sunrise lands on a bar line of the music.</p>
        </div>
        <figure class="mark">
          <svg class="disc" viewBox="0 0 1000 1000" role="img" aria-label="The disc of a sunflower drawn as 1,500 gold dots that run outward in crossing spirals. The dots near the middle are smaller and fainter.">@@DISC@@</svg>
          <figcaption>The disc of the flower as the film sets it out: 1,500 florets, each turned 137.508 degrees from the one before.</figcaption>
        </figure>
        <dl class="facts">''')

# Kickers: the number, and the sun on its way across the sky. Section 1 is early morning, section 7 is evening.
for i in range(1, 8):
    t = i / 8
    a = math.pi * (1 - t)
    cx = 24 + 21 * math.cos(a)
    cy = 18.5 - 14 * math.sin(a)
    arc = (f'<svg class="arc" viewBox="0 0 48 20" width="48" height="20" aria-hidden="true" focusable="false">'
           f'<path class="arc-sky" d="M3 18.5A21 14 0 0 1 45 18.5" />'
           f'<path class="arc-land" d="M0 18.5H48" />'
           f'<circle class="arc-sun" cx="{cx:.1f}" cy="{cy:.1f}" r="2.75" /></svg>')
    rep(f'<p class="kicker">0{i}</p>', f'<p class="kicker">0{i}{arc}</p>')

# The ruler: the film strip in place of the colored blocks, with each part's bar and name under it.
old_ruler_start = s.index('            <div class="ruler" aria-hidden="true">')
old_ruler_end = s.index('            <p class="ruler-key">')
parts = [(0, 28.312, 1, 'Germination'), (28.312, 42.026, 17, 'Frost'), (42.026, 55.74, 25, 'First climb'), (55.74, 69.455, 33, 'Storm'),
         (69.455, 96.883, 41, 'The great climb'), (96.883, 110.597, 57, 'Bloom'), (110.597, 124.312, 65, 'Field'), (124.312, 127, 73, 'Last light')]
old_ruler = s[old_ruler_start:old_ruler_end]
for a, b, bar, name in parts:
    assert f'--a: {a:g}; --b: {b:g}"' in old_ruler, (a, b)
marks_start = old_ruler.index('              <div class="ruler-marks">')
marks_end = old_ruler.index('              <div class="ruler-axis">')
marks = old_ruler[marks_start:marks_end]
assert marks.count('class="sun"') == 15 and marks.count('class="cut"') == 4
axis_at = {1: 0.883, 17: 28.312, 25: 42.026, 33: 55.74, 41: 69.455, 57: 96.883, 65: 110.597, 73: 124.312}
for bar, at in axis_at.items():
    assert f'<span style="--a: {at:g}">{bar}</span>' in old_ruler, bar
seps = ''.join(f'<i style="--a: {a:g}"></i>' for a, _, _, _ in parts[1:])
axis = ''.join(f'<span{" class=\"is-last\"" if bar == 73 else ""} style="--a: {axis_at[bar]:g}">{bar}<i>{name}</i></span>' for _, _, bar, name in parts)
new_ruler = ('            <div class="ruler" aria-hidden="true">\n' + marks +
             '              <div class="ruler-strip">' + seps + '</div>\n'
             '              <div class="ruler-axis">\n                ' + axis + '\n              </div>\n'
             '            </div>\n')
s = s[:old_ruler_start] + new_ruler + s[old_ruler_end:]

rep('''<span class="key"><span class="key-num">17</span>The bar a part begins on</span></p>''',
    '''<span class="key"><span class="key-num">17</span>The bar a part begins on</span></p>
            <p class="ruler-note">The band is the film itself. It holds one column for each of the 3,810 frames, each frame averaged across its width, with the sky at the top and the soil at the bottom. Each night shows as a dark line, the frost as a pale stretch and the storm as a dark one.</p>''')

# The eight parts: each carries its own piece of the strip.
kinds = ['k-grow', 'k-frost', 'k-grow', 'k-storm', 'k-grow', 'k-bloom', 'k-field', 'k-last']
for (a, b, bar, name), kind in zip(parts, kinds):
    rep(f'<li class="{kind}"><b>{name}</b>', f'<li style="--a: {a:g}; --b: {b:g}"><b>{name}</b>')

# The design system, said again for the look as it is now.
rep('''        <p class="section-lede">Dark soil and one gold. The film carries its color in its light, so everything around it stays quiet: six colors taken from the film's live page, two typefaces and no decoration. A leaf green and a rose mark the labels.</p>''',
    '''        <p class="section-lede">Dark soil and one gold. The film carries its color in its light, so everything around it stays quiet. The nine colors all come from the project: six from the film's own page, and three from the live version, where they mark a result. There are two typefaces, and the two marks are made from the film itself.</p>''')
rep('''          <li style="--c: #e2b23a"><span class="chip"></span><b>Gold</b><code>#e2b23a</code></li>
''', '''          <li style="--c: #e2b23a"><span class="chip"></span><b>Gold</b><code>#e2b23a</code></li>
          <li style="--c: #b9d18b"><span class="chip"></span><b>Leaf</b><code>#b9d18b</code></li>
          <li style="--c: #e8b77a"><span class="chip"></span><b>Amber</b><code>#e8b77a</code></li>
          <li style="--c: #e8a08c"><span class="chip"></span><b>Rose</b><code>#e8a08c</code></li>
''')
rep('''          <div class="type-sample">
            <p class="type-text" aria-hidden="true">Bar 57 &middot; the bud opens</p>
            <p class="type-name">Work Sans, a plain grotesque, for the reading text and the labels</p>
          </div>
        </div>
''', '''          <div class="type-sample">
            <p class="type-italic" aria-hidden="true">The great climb</p>
            <p class="type-name">Fraunces italic, for the film's own names: its title and its eight parts</p>
          </div>
          <div class="type-sample">
            <p class="type-text" aria-hidden="true">Bar 57 &middot; the bud opens</p>
            <p class="type-name">Work Sans, a plain grotesque, for the reading text and the labels</p>
          </div>
        </div>
        <div class="marks">
          <figure class="marks-disc">
            <svg class="disc" viewBox="0 0 1000 1000" role="img" aria-label="The mark: the disc of the flower as 1,500 gold dots in crossing spirals."><use href="#disc" /></svg>
            <figcaption><b>The mark.</b> The disc of the flower, drawn by the rule the film uses: 1,500 florets, each turned 137.508 degrees from the one before. The florets near the middle are drawn fainter, since they have not opened when the film ends.</figcaption>
          </figure>
          <figure class="marks-line">
            <img src="assets/media/film-strip.webp" width="3810" height="96" loading="lazy" decoding="async" alt="The line: a long band of color, pale blue and dark in turns at first, then gray, dark blue green, and gold at the end." />
            <figcaption><b>The line.</b> The film as one picture, 3,810 columns wide, one for each frame. It is the position line under the film, where a small flower head marks the place, and the ruler in <a href="#h-music">The film laid on its music</a>.</figcaption>
          </figure>
        </div>
''')

# The footer: the name set as the title is, and the disc going down at the end of the page.
rep('''    <footer class="foot wrap">
      <p class="foot-name">Life of a Sunflower.</p>
''', '''    <footer class="foot">
      <div class="wrap">
      <p class="foot-name">Life of a <span>Sunflower</span>.</p>
''')
rep('''<a href="https://openfontlicense.org/open-font-license-official-text/" target="_blank" rel="noopener noreferrer">SIL Open Font License</a>.</p>
    </footer>''', '''<a href="https://openfontlicense.org/open-font-license-official-text/" target="_blank" rel="noopener noreferrer">SIL Open Font License</a>.</p>
      </div>
      <svg class="disc foot-sun" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false"><use href="#disc" /></svg>
    </footer>''')

# After the look was shown, on the owner's word: the way to the live version goes, in the bar under the film
# and in the footer, with the note under the facts that led to it. Three wordings follow from that, so that
# nothing on the page speaks of a live version any more. The numbers stay where they stood.
rep('''        <a class="live-link" href="https://sun-flower-perplexity.vercel.app/live/" target="_blank" rel="noopener noreferrer">Open the live version</a>
''', '')
rep('''      <p><a href="https://sun-flower-perplexity.vercel.app/live/" target="_blank" rel="noopener noreferrer">Open the live version</a></p>
''', '')
rep('''        <p class="note">The live version draws the film in your browser as it plays. On a machine with four cores and no graphics card its script ran over its time limit in 11 of 16 measured stretches of the film; on a graphics card it has not been measured.</p>
''', '')
rep('''six from the film's own page, and three from the live version, where they mark a result.''',
    '''six from the film's own page, and three from its live player, where they mark a result.''')
rep('''<td data-label="What it measured">Live play only: the page's own script is over its limit in 11 of 16 measured stretches,''',
    '''<td data-label="What it measured">Live play only: the script that draws each frame is over its limit in 11 of 16 measured stretches,''')
rep('''          <li><b>The live version.</b> On a machine with four cores and no graphics card its script is over its time limit in 11 of 16 measured stretches of the film. On a machine with a graphics card it has not been measured.</li>''',
    '''          <li><b>Live play.</b> When the film is drawn as it plays, on a machine with four cores and no graphics card the script that draws each frame is over its time limit in 11 of 16 measured stretches of the film. On a machine with a graphics card it has not been measured.</li>''')
assert 'live version' not in s and 'vercel' not in s and 'live-link' not in s

assert s.count('@@DISC@@') == 1
s = s.replace('@@DISC@@', DISC)

open(out, 'w', encoding='utf-8').write(s)
print('written', out, len(s))
