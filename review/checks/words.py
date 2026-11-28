#!/usr/bin/env python3
"""The rules for the words of the review page: python3 review/checks/words.py [folder of the page]

Reads index.html, review.css and review.js and fails on:

  - an em dash or an en dash anywhere in the three files
  - an exclamation point in words a reader sees or hears: the text of the page, its
    labels and descriptions, and the words the script writes into the page
  - a word about who or what made the film
  - an address that is not on the short list of public links below
  - a way to a live version of the film: the page is where the film is watched, so it names no other place

Two rules this script cannot check, and a reader has to: the page gives no family
name of a reviewer, and it names no other film, game or product.
"""
import html
import os
import re
import sys

folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FILES = ['index.html', 'review.css', 'review.js']
LINKS = {
    'https://openfontlicense.org/open-font-license-official-text/',  # the license of the two typefaces
}
# The page once led to a second place where the film is drawn as it plays. That way was taken out on the owner's word.
ELSEWHERE = re.compile(r'live version|vercel\.app|live-link', re.I)
MAKERS = re.compile(
    r'\b(AI|A\.I\.)\b|\b(artificial intelligence|machine learning|language model|LLM|chatbot|agents?|prompt(s|ed)?|'
    r'generated|generative|Builder|Claude|Anthropic|GPT|ChatGPT|OpenAI|Perplexity|Gemini|Copilot|Midjourney|ElevenLabs)\b',
    re.I,
)
PRIVATE = re.compile(r'github\.com|perplexity\.ai|localhost|127\.0\.0\.1|file://|/home/', re.I)

text = {f: open(os.path.join(folder, f), encoding='utf-8').read() for f in FILES}
faults = []


def fault(where, what, sample=''):
    faults.append(f'{where}: {what}' + (f'  "{sample.strip()[:70]}"' if sample else ''))


# 1. Dashes, in the files as they are written.
for f, s in text.items():
    for name, pattern in (('em dash', r'\u2014|&mdash;|&#8212;|&#x2014;'), ('en dash', r'\u2013|&ndash;|&#8211;|&#x2013;')):
        for m in re.finditer(pattern, s, re.I):
            fault(f, name, s[max(0, m.start() - 30):m.end() + 30])

# 2. The words a reader meets.
page = text['index.html']
body = re.sub(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<!DOCTYPE[^>]*>', ' ', page, flags=re.S | re.I)
labels = re.findall(r'\b(?:alt|aria-label|title|content|placeholder)="([^"]*)"', body)
words = {'the page text': html.unescape(re.sub(r'<[^>]+>', ' ', body)), 'the labels of the page': html.unescape(' | '.join(labels))}

script = re.sub(r'/\*.*?\*/', ' ', text['review.js'], flags=re.S)
script = re.sub(r'(^|[^:\'"\\])//[^\n]*', r'\1', script)
strings = [m.group(2) for m in re.finditer(r'''(['"`])((?:\\.|(?!\1)[^\\\n])*)\1''', script)]
words['the words the script writes'] = ' | '.join(s for s in strings if re.search(r'[A-Za-z]{3}', s))

for where, s in words.items():
    for m in re.finditer(r'!', s):
        fault(where, 'exclamation point', s[max(0, m.start() - 40):m.end() + 10])
    for m in MAKERS.finditer(s):
        if m.group(0) == 'ai' or (m.group(1) and m.group(1) not in ('AI', 'A.I.')):
            continue  # "AI" is only meant in capitals
        fault(where, f'a word about the maker ({m.group(0)})', s[max(0, m.start() - 40):m.end() + 30])

# 3. Addresses.
for f, s in text.items():
    for m in PRIVATE.finditer(s):
        fault(f, f'an address that is not public ({m.group(0)})', s[max(0, m.start() - 40):m.end() + 30])
    for url in re.findall(r'https?://[^\s"\'<>)]+', s):
        if url not in LINKS and not url.startswith('http://www.w3.org/'):
            fault(f, 'a link that is not on the list', url)

# 4. No way to a live version, in any of the three files.
for f, s in text.items():
    for m in ELSEWHERE.finditer(s):
        fault(f, f'a way to a live version ({m.group(0)})', s[max(0, m.start() - 40):m.end() + 30])

found = sorted({u for s in text.values() for u in re.findall(r'https?://[^\s"\'<>)]+', s)})
print('files:', ', '.join(f'{f} {len(s.encode("utf-8")):,} bytes' for f, s in text.items()))
print('words read:', ', '.join(f'{k} {len(v.split()):,}' for k, v in words.items()))
print('links:', ', '.join(found))
if faults:
    print(f'FAILED {len(faults)}')
    for x in faults:
        print('  ' + x)
    sys.exit(1)
print('ALL PASS: no dashes, no exclamation points, no word about the maker, no address off the list, no way to a live version')
