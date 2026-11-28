#!/usr/bin/env python3
"""Compares the page as it was published with the page in the film's own look.

What must be the same: the headings and their order, the sections, the film's files, the two short videos,
every picture with its alt text, every link target, and every number in the text. What is new is listed, so
each new sentence and each new number can be read and traced.

One thing left on purpose, after the new look was shown: the way to the live version, which stood under the
film and in the footer, and the note under the facts that led to it. Both are named below, so that anything
else that goes missing still fails.

  python3 review/restyle/compare.py <folder of the published look> <folder of the new look>

Both folders are ones publish.sh has put together, each from its own commit, so both hold the film.
The lines of the output say "first" for the first folder, the page as it was first published, and "new" for the second.
"""
import difflib
import hashlib
import os
import re
import sys
from html.parser import HTMLParser

a_dir, b_dir = sys.argv[1], sys.argv[2]

# Taken out on the owner's word. The link stood twice, and the note once.
GONE_LINK = ('https://sun-flower-perplexity.vercel.app/live/', '_blank', 'noopener noreferrer')
GONE_NOTE = ('The live version draws the film in your browser as it plays. On a machine with four cores and no graphics card '
             'its script ran over its time limit in 11 of 16 measured stretches of the film; on a graphics card it has not been measured.')


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.heads, self.sections, self.links, self.imgs, self.videos, self.sources, self.text = [], [], [], [], [], [], []
        self.stack, self.skip, self.cur_head, self.cur_link = [], 0, None, None

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        self.stack.append(tag)
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('h1', 'h2', 'h3', 'h4'):
            self.cur_head = [tag, d.get('id', ''), '']
        if tag == 'section':
            self.sections.append(d.get('aria-labelledby', ''))
        if tag == 'a':
            self.cur_link = [d.get('href', ''), d.get('target', ''), d.get('rel', ''), '']
        if tag == 'img':
            self.imgs.append((d.get('src', ''), d.get('alt', ''), d.get('width', ''), d.get('height', '')))
        if tag == 'video':
            self.videos.append((d.get('id', ''), d.get('poster', ''), d.get('aria-label', ''), 'muted' in d, 'loop' in d, 'playsinline' in d, d.get('preload', ''), d.get('width', ''), d.get('height', '')))
        if tag == 'source':
            self.sources.append((d.get('src', ''), d.get('type', ''), d.get('media', ''), d.get('data-bytes', '')))
        for k in ('aria-label', 'alt', 'content', 'title'):
            if k in d and d[k] and tag != 'meta' or (tag == 'meta' and k == 'content' and d.get('name') in ('description',)):
                self.text.append('[' + k + '] ' + ' '.join(d[k].split()))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.stack.pop()
        if tag in ('script', 'style'):
            self.skip -= 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1
        if tag in ('h1', 'h2', 'h3', 'h4') and self.cur_head:
            self.cur_head[2] = ' '.join(self.cur_head[2].split())
            self.heads.append(tuple(self.cur_head))
            self.cur_head = None
        if tag == 'a' and self.cur_link:
            self.cur_link[3] = ' '.join(self.cur_link[3].split())
            self.links.append(tuple(self.cur_link))
            self.cur_link = None
        while self.stack and self.stack[-1] != tag:
            self.stack.pop()
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.skip:
            return
        if self.cur_head is not None:
            self.cur_head[2] += data
        if self.cur_link is not None:
            self.cur_link[3] += data
        t = ' '.join(data.split())
        if t:
            self.text.append(t)


def read(folder):
    p = Page()
    p.feed(open(os.path.join(folder, 'index.html'), encoding='utf-8').read())
    return p


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


A, B = read(a_dir), read(b_dir)
bad = 0


def same(name, x, y, show=True):
    global bad
    if x == y:
        print('SAME  ' + name + (f'  ({len(x)})' if hasattr(x, '__len__') else ''))
    else:
        bad += 1
        print('DIFF  ' + name)
        if show:
            for line in difflib.unified_diff([str(i) for i in x], [str(i) for i in y], 'first', 'new', lineterm='', n=0):
                print('      ' + line[:260])


same('headings, their levels, ids and order', A.heads, B.heads)
same('sections and their order', A.sections, B.sections)
same('the film and the short videos: every source, type, media rule and byte count', A.sources, B.sources)
same('the videos: ids, posters, labels, muted, loop, inline, preload, sizes', A.videos, B.videos)

# Links: every link of the first page must still be there with the same target; new ones are listed.
key = lambda l: (l[0], l[1], l[2])
a_links, b_links = [key(l) for l in A.links], [key(l) for l in B.links]
missing = [l for l in a_links if l not in b_links]
gone_links = [l for l in missing if l == GONE_LINK]
missing = [l for l in missing if l != GONE_LINK]
new = [l for l in B.links if key(l) not in a_links]
print(('SAME  ' if not missing else 'DIFF  ') + f'every link of the first page that was to stay is on the new page with the same target ({len(a_links)} first, {len(b_links)} new)')
bad += 1 if missing else 0
if gone_links:
    print(f'LEFT  on the owner\'s word: the way to the live version, {len(gone_links)} links')
for l in missing:
    print('      missing', l)
for l in new:
    print('      NEW link:', l[0], '"' + l[3] + '"')
changed_words = [(x[3], y[3]) for x in A.links for y in B.links if key(x) == key(y) and x[3] != y[3]]
for x, y in changed_words:
    print('      link words changed:', repr(x), '->', repr(y))

# Pictures: every picture of the first page is still there with the same file, alt text and size.
missing = [i for i in A.imgs if i not in B.imgs]
new = [i for i in B.imgs if i not in A.imgs]
print(('SAME  ' if not missing else 'DIFF  ') + f'every picture of the first page is on the new page with the same file, alt text and size ({len(A.imgs)} first, {len(B.imgs)} new)')
bad += 1 if missing else 0
for i in missing:
    print('      missing', i[0])
for i in new:
    print('      NEW picture:', i[0], '| alt:', i[1])

# Files named by the page exist, and files both pages name hold the same bytes.
names = set(re.findall(r'(?:src|href|poster)="(assets/[^"]+)"', open(os.path.join(b_dir, 'index.html'), encoding='utf-8').read()))
names |= set('assets/' + m for m in re.findall(r"url\(['\"]?assets/([^'\")]+)", open(os.path.join(b_dir, 'review.css'), encoding='utf-8').read()))
gone = sorted(n for n in names if not os.path.exists(os.path.join(b_dir, n)))
print(('SAME  ' if not gone else 'DIFF  ') + f'every file the new page names is in its folder ({len(names)} files)')
bad += 1 if gone else 0
for n in gone:
    print('      missing file', n)
both = sorted(n for n in names if os.path.exists(os.path.join(a_dir, n)) and os.path.exists(os.path.join(b_dir, n)))
differ = [n for n in both if os.path.getsize(os.path.join(a_dir, n)) != os.path.getsize(os.path.join(b_dir, n)) or sha(os.path.join(a_dir, n)) != sha(os.path.join(b_dir, n))]
print(('SAME  ' if not differ else 'DIFF  ') + f'files both pages name hold the same bytes ({len(both)} files, the film in both sizes among them)')
bad += 1 if differ else 0
for n in differ:
    print('      differs', n)
for n in sorted(names - set(both)):
    print('      NEW file:', n, os.path.getsize(os.path.join(b_dir, n)), 'bytes')

# Text: what left, what came.
a_text, b_text = A.text, B.text
sm = difflib.SequenceMatcher(None, a_text, b_text, autojunk=False)
left, came = [], []
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op in ('replace', 'delete'):
        left += a_text[i1:i2]
    if op in ('replace', 'insert'):
        came += b_text[j1:j2]
print(f'TEXT  {len(a_text)} pieces of text on the first page, {len(b_text)} on the new page; {len(left)} left, {len(came)} came')
for t in left:
    print('      - ' + t[:300])
for t in came:
    print('      + ' + t[:300])

# Numbers: every number in the first text is still in the new text, as often or more often.
num = re.compile(r'#[0-9a-fA-F]{6}\b|\d[\d,]*(?:\.\d+)?')
count = lambda texts: {n: sum(t.count(n) for t in [' '.join(texts)]) for n in set(num.findall(' '.join(texts)))}
from collections import Counter
ca, cb = Counter(num.findall(' '.join(a_text))), Counter(num.findall(' '.join(b_text)))
if GONE_NOTE in a_text and GONE_NOTE not in b_text:
    note_numbers = Counter(num.findall(GONE_NOTE))
    ca = ca - note_numbers
    print('LEFT  on the owner\'s word: the note under the facts. Its numbers (' + ', '.join(sorted(note_numbers)) + ') are not looked for a second time; each still stands in the table of checks and under Known limits')
fewer = {n: (ca[n], cb[n]) for n in ca if cb[n] < ca[n]}
more = {n: (ca[n], cb[n]) for n in cb if cb[n] > ca[n]}
print(('SAME  ' if not fewer else 'DIFF  ') + f'every number in the first text stands in the new text at least as often ({sum(ca.values())} numbers, {len(ca)} different)')
bad += 1 if fewer else 0
for n, (x, y) in sorted(fewer.items()):
    print(f'      fewer: {n} ({x} -> {y})')
for n, (x, y) in sorted(more.items()):
    print(f'      more or new: {n} ({x} -> {y})')

print('RESULT', 'nothing that must stay has changed' if not bad else f'{bad} thing(s) that must stay have changed')
sys.exit(1 if bad else 0)
