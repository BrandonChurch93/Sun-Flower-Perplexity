#!/usr/bin/env python3
"""The two marks of the page are made from the film, by the tools in review/tools/.

  python3 review/checks/marks.py [folder of the page]

  - the disc set into index.html is the one tools/disc.py draws: 1,500 dots, dot for dot
  - disc.py uses the count of florets and the angle the film uses, which the film reads from
    config/showcase.json (plant.discFlorets and plant.goldenAngleDeg)
  - the strip, assets/media/film-strip.webp, is 3,810 columns wide, and the page gives it its own size
  - the film has 3,810 frames, and tools/strip.py makes the same picture from it again

The last line reads every frame of the film, which takes about half a minute. STRIP=0 leaves it out.
Needs python3 with numpy and Pillow, and ffmpeg with ffprobe.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
source = os.path.normpath(os.path.join(here, '..'))
root = os.path.normpath(os.path.join(source, '..'))
tools = os.path.join(source, 'tools')
folder = sys.argv[1] if len(sys.argv) > 1 else source
ok = True


def line(passed, text):
    global ok
    ok = ok and passed
    print(('PASS ' if passed else 'FAIL ') + text)


try:
    import numpy as np
    from PIL import Image
except ImportError as e:
    print('FAIL this check needs numpy and Pillow: ' + str(e))
    sys.exit(1)

html = open(os.path.join(folder, 'index.html'), encoding='utf-8').read()

# The disc.
with tempfile.TemporaryDirectory() as tmp:
    drawn = os.path.join(tmp, 'disc.svg')
    subprocess.run([sys.executable, os.path.join(tools, 'disc.py'), drawn], check=True, stdout=subprocess.DEVNULL)
    paths = re.findall(r'<path [^>]*/>', open(drawn, encoding='utf-8').read())
    kept = re.findall(r'<path [^>]*/>', open(os.path.join(tools, 'disc.svg'), encoding='utf-8').read())
m = re.search(r'<g id="disc"[^>]*>(.*?)</g>', html, re.S)
on_page = re.findall(r'<path [^>]*/>', m.group(1)) if m else []
dots = sum(p.count('M') for p in on_page)
line(paths == kept, 'tools/disc.py draws tools/disc.svg again, dot for dot')
line(bool(on_page) and on_page == paths, f'the disc in index.html is the one tools/disc.py draws: {dots} dots')
line(html.count('id="disc"') == 1 and html.count('href="#disc"') == 2, 'the disc is in the page once and is used again twice, in the design system and in the footer')

disc_py = open(os.path.join(tools, 'disc.py'), encoding='utf-8').read()
count = int(re.search(r'^COUNT = (\d+)$', disc_py, re.M).group(1))
angle = float(re.search(r'^GOLDEN_DEG = ([\d.]+)$', disc_py, re.M).group(1))
config = os.path.join(root, 'config', 'showcase.json')
if os.path.isfile(config):
    plant = json.load(open(config, encoding='utf-8'))['plant']
    line(plant['discFlorets'] == count == dots and plant['goldenAngleDeg'] == angle,
         f'the film\'s own numbers: config/showcase.json has {plant["discFlorets"]} florets at {plant["goldenAngleDeg"]} degrees, tools/disc.py has {count} at {angle}')
else:
    line(False, 'config/showcase.json is not here, so the count of florets and the angle cannot be compared with the film\'s')
said = f'{count:,} florets, each turned {angle} degrees from the one before'
line(html.count(said) == 2, f'the page says "{said}" twice, under the mark by the title and in the design system')

# The strip.
strip_file = os.path.join(folder, 'assets', 'media', 'film-strip.webp')
strip = Image.open(strip_file).convert('RGB')
w, h = strip.size
line(f'src="assets/media/film-strip.webp" width="{w}" height="{h}"' in html, f'the strip is {w} columns wide and {h} rows high, and the page gives it that size')

film = os.path.join(folder, 'assets', 'film', 'life-of-a-sunflower-1080p.mp4')
if not os.path.isfile(film):
    film = os.path.join(root, 'portfolio', 'sunflower-video.mp4')
if not os.path.isfile(film):
    line(False, 'the film is not here, so its frames cannot be counted')
else:
    frames = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', film],
                                check=True, capture_output=True, text=True).stdout.strip().strip(','))
    line(frames == w, f'the film has {frames:,} frames, one for each column of the strip')
    line(html.count(f'{frames:,} frames') >= 1 and html.count(f'{frames:,} columns') >= 1, f'the page says {frames:,} frames and {frames:,} columns')
    if os.environ.get('STRIP') == '0':
        print('     STRIP=0: the strip was not made again from the film')
    else:
        with tempfile.TemporaryDirectory() as tmp:
            again = os.path.join(tmp, 'strip.webp')
            plain = os.path.join(tmp, 'strip.png')
            subprocess.run([sys.executable, os.path.join(tools, 'strip.py'), film, again, str(h)], check=True, stdout=subprocess.DEVNULL)
            same = open(again, 'rb').read() == open(strip_file, 'rb').read()
            if same:
                line(True, 'tools/strip.py makes the strip again from the film with the same bytes')
            else:
                # Another Pillow may write other bytes. Then the picture decides: made again without loss, and compared with the stored one.
                subprocess.run([sys.executable, os.path.join(tools, 'strip.py'), film, plain, str(h)], check=True, stdout=subprocess.DEVNULL)
                a = np.asarray(Image.open(plain).convert('RGB'), dtype=np.int16)
                b = np.asarray(strip, dtype=np.int16)
                d = np.abs(a - b)
                line(a.shape == b.shape and d.mean() < 2 and np.percentile(d, 99) <= 8,
                     f'tools/strip.py makes the same picture again from the film, in a file with other bytes: mean difference {d.mean():.2f} of 255, 99 in 100 values within {int(np.percentile(d, 99))}')

if not ok:
    print('FAILED')
    sys.exit(1)
print('ALL PASS: the disc and the strip are the ones the tools make from the film')
