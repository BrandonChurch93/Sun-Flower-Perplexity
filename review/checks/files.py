#!/usr/bin/env python3
"""Every file the page names is in the folder, and the folder holds nothing the page does not name.

  python3 review/checks/files.py [folder of the page]

Without a folder it reads the source, review/ itself. The two film files are not stored there: publish.sh makes
them in the folder that gets deployed. So on the source they are expected to be absent, and on any other folder
they must be there.
"""
import os
import re
import sys

folder = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
named = set()
for f in ('index.html', 'review.css', 'review.js'):
    s = open(os.path.join(folder, f), encoding='utf-8').read()
    named.update(re.findall(r'''assets/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+''', s))
held = set()
for d, _, files in os.walk(os.path.join(folder, 'assets')):
    for f in files:
        held.add(os.path.relpath(os.path.join(d, f), folder).replace(os.sep, '/'))
licenses = {p for p in held if p.startswith('assets/fonts/OFL-')}  # kept beside the typefaces, not named by the page
source = os.path.isfile(os.path.join(folder, 'publish.sh'))
film = {p for p in named if p.startswith('assets/film/')}
later = film - held if source else set()
missing = sorted(named - held - later)
spare = sorted(held - named - licenses)
top = sorted(f for f in os.listdir(folder) if f not in ('index.html', 'review.css', 'review.js', 'assets'))
print(f'the page names {len(named)} files; assets/ holds {len(held)}, {len(licenses)} of them licenses')
for p in sorted(later):
    print('  made by publish.sh, not stored in the source:', p)
for p in missing:
    print('  missing:', p)
for p in spare:
    print('  not named by the page:', p)
if not source and top:
    print('  beside the page, and not part of it:', ', '.join(top))
if missing or spare or (not source and top):
    print('FAILED')
    sys.exit(1)
print('ALL PASS: every named file is here, and nothing else is')
