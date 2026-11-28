#!/usr/bin/env python3
"""The links of the page:  python3 review/checks/links.py [folder of the page]

  - every link inside the page points at an id that is on the page, and no id stands twice
  - every link that leaves the page opens in a new tab, without handing the new tab a way back
  - the links that leave the page are the ones on the short list below, and no others
  - a link to a file of the page names a file that is in the folder. In the source, review/ itself, the film
    files are not stored: publish.sh makes them in the folder that gets deployed
"""
import os
import re
import sys
from html.parser import HTMLParser

folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUTSIDE = {
    'https://openfontlicense.org/open-font-license-official-text/': 1,  # the license of the two typefaces
}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links = [], []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get('id'):
            self.ids.append(d['id'])
        if tag == 'a':
            self.links.append(d)


p = Page()
p.feed(open(os.path.join(folder, 'index.html'), encoding='utf-8').read())
faults = []
twice = sorted({i for i in p.ids if p.ids.count(i) > 1})
if twice:
    faults.append('ids that stand twice: ' + ', '.join(twice))
inside = [a for a in p.links if (a.get('href') or '').startswith('#')]
outside = [a for a in p.links if re.match(r'https?:', a.get('href') or '')]
files = [a for a in p.links if re.match(r'assets/[A-Za-z0-9_./-]+$', a.get('href') or '')]
other = [a for a in p.links if a not in inside and a not in outside and a not in files]
for a in inside:
    if a['href'][1:] not in p.ids:
        faults.append('a link to an id that is not on the page: ' + a['href'])
for a in outside:
    if a.get('target') != '_blank' or 'noopener' not in (a.get('rel') or ''):
        faults.append('a link that leaves the page without target="_blank" and rel="noopener": ' + a['href'])
count = {}
for a in outside:
    count[a['href']] = count.get(a['href'], 0) + 1
if count != OUTSIDE:
    faults.append('the links that leave the page are not the ones on the list: ' + str(count))
source = os.path.isfile(os.path.join(folder, 'publish.sh'))
for a in files:
    if source and a['href'].startswith('assets/film/'):
        continue
    if not os.path.isfile(os.path.join(folder, a['href'])):
        faults.append('a link to a file that is not in the folder: ' + a['href'])
for a in other:
    faults.append('a link with no address, or an address of another kind: ' + str(a.get('href')))

print(f'{len(p.links)} links: {len(inside)} inside the page ({", ".join(a["href"] for a in inside)}), {len(outside)} that leave it, {len(files)} to a file of the page ({", ".join(a["href"] for a in files)})')
for href, n in sorted(count.items()):
    print(f'  {n} x {href}')
if faults:
    print(f'FAILED {len(faults)}')
    for x in faults:
        print('  ' + x)
    sys.exit(1)
print('ALL PASS: every link inside the page has its target, every link that leaves it opens in a new tab, and none is off the list')
