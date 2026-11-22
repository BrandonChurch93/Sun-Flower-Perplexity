#!/usr/bin/env python3
"""Compile a cue sheet written in bars and beats to seconds and frames, and lint it against the map.

  python3 cues.py CUES.json MAP.json [--out cues.compiled.json] [--fps 60] [--table CUES.md]

Exit code 1 when a cue names a hit that the map does not have at that position.
Positions: "11.2" is bar 11 beat 2, "11.2+" is the eighth after it. "at_s" gives seconds, for a pickup or the tail.
expect: kick, snare, low (kick or soft low hit), soft, hat, any, quiet (nothing new on that eighth), pickup, none.
"""
import argparse, json, math, sys

WANT = {'kick': 'KX', 'snare': 'SX', 'low': 'KkX', 'soft': 'k', 'hat': 'h', 'any': 'KkSXh', 'quiet': '.'}
NAME = {'K': 'kick', 'k': 'soft low hit', 'S': 'snare', 'X': 'kick and snare', 'h': 'hat', '.': 'nothing new'}


class Grid:
    def __init__(self, mp):
        self.mp = mp; self.bpb = mp['meter']['beats_per_bar']; self.cpb = mp['meter']['cells_per_bar']
        self.bars = mp['bars']; self.n = len(self.bars)
        self.constant = mp['tempo'].get('constant', True)
        self.bar1 = mp['grid']['bar1_s']; self.bar_s = mp['meter']['bar_s']

    def bar_start(self, bar):
        if self.constant or bar < 1 or bar > self.n:
            return self.bar1 + (bar - 1) * self.bar_s
        return self.bars[bar - 1]['t']

    def at(self, bar, beat=1.0):
        nxt = self.bar_start(bar + 1) if (not self.constant and bar < self.n) else self.bar_start(bar) + self.bar_s
        return self.bar_start(bar) + (beat - 1) * (nxt - self.bar_start(bar)) / self.bpb

    def parse(self, pos):
        if isinstance(pos, (list, tuple)):
            return int(pos[0]), float(pos[1])
        s = str(pos).strip(); plus = s.endswith('+'); s = s.rstrip('+')
        bar, _, beat = s.partition('.')
        return int(bar), float(beat or 1) + (0.5 if plus else 0.0)

    def cell(self, bar, beat):
        if bar < 1 or bar > self.n:
            return '.'
        c = (beat - 1) * self.cpb / self.bpb
        if abs(c - round(c)) > 1e-6:
            return None
        return self.bars[bar - 1]['cells'][int(round(c))]


def compile_sheet(sheet, mp, fps=None):
    g = Grid(mp); fps = fps or sheet.get('fps') or mp.get('fps') or 60
    cues = []; caps = []; bad = []; warn = []
    groups = [(None, sheet)] + [(s.get('id', i + 1), s) for i, s in enumerate(sheet.get('scenes', []))]
    for sid, grp in groups:
        for c in grp.get('cues', []):
            exp = c.get('expect', 'none')
            if 'at_s' in c:
                t = float(c['at_s']); where = f"{t:.3f} s"; found = None
                if exp == 'pickup' and t > 0:
                    near = [p for p in mp['grid'].get('pickup', []) if abs(p['t'] - t) <= 0.03]
                    found = near[0]['hit'] if near else '.'
                    if not near:
                        bad.append({'scene': sid, 'at': where, 'expect': exp, 'found': 'no pickup hit within 30 ms'})
            else:
                bar, beat = g.parse(c['at']); t = g.at(bar, beat); where = str(c['at'])
                found = g.cell(bar, beat)
                if exp in WANT:
                    if found is None:
                        bad.append({'scene': sid, 'at': where, 'expect': exp, 'found': 'not on an eighth note'})
                    elif found not in WANT[exp]:
                        bad.append({'scene': sid, 'at': where, 'expect': exp, 'found': NAME.get(found, found)})
                elif exp not in ('none', 'pickup'):
                    bad.append({'scene': sid, 'at': where, 'expect': exp, 'found': 'unknown expect value'})
            cues.append({'scene': sid, 'at': where, 't': round(t, 6), 'frame': int(math.floor(t * fps + 1e-6)), 'do': c.get('do', ''), 'expect': exp, 'found': found,
                         **({'id': c['id']} if 'id' in c else {})})
        for c in grp.get('captions', []):
            a = g.parse(c['in']); b = g.parse(c['out']); t0 = g.at(*a); t1 = g.at(*b)
            beats = (t1 - t0) / mp['meter']['beat_s']
            if beats < 2 - 1e-6:
                warn.append({'scene': sid, 'caption': c['text'], 'issue': f'holds {beats:.1f} beats, under 2'})
            caps.append({'scene': sid, 'in': str(c['in']), 'out': str(c['out']), 't_in': round(t0, 6), 't_out': round(t1, 6),
                         'frame_in': int(math.floor(t0 * fps + 1e-6)), 'frame_out': int(math.floor(t1 * fps + 1e-6)), 'text': c['text'],
                         **({k: v for k, v in c.items() if k not in ('in', 'out', 'text')})})
    cues.sort(key=lambda c: c['t']); caps.sort(key=lambda c: c['t_in'])
    for a, b in zip(caps, caps[1:]):
        if b['t_in'] < a['t_out'] - 1e-6 and not (a.get('with') or b.get('with')):
            warn.append({'scene': b['scene'], 'caption': b['text'], 'issue': f"enters at {b['in']} while \"{a['text']}\" is still up"})
    return {'schema': 'beat-sync/cues 1 compiled', 'track_sha256': mp['source']['sha256'], 'arrangement': mp.get('arrangement', {}).get('name'),
            'fps': fps, 'count': len(cues), 'mismatches': len(bad), 'detail': bad, 'warnings': warn, 'cues': cues, 'captions': caps}


def table(out, mp):
    rows = ['| Scene | At | Seconds | Frame | Expects | Found | What happens |', '|---|---|---|---|---|---|---|']
    for c in out['cues']:
        rows.append(f"| {c['scene'] if c['scene'] is not None else ''} | {c['at']} | {c['t']:.3f} | {c['frame']} | {c['expect']} | {NAME.get(c['found'], '') if c['found'] else ''} | {c['do']} |")
    caps = ['| Scene | In | Out | Seconds | Text |', '|---|---|---|---|---|']
    for c in out['captions']:
        caps.append(f"| {c['scene'] if c['scene'] is not None else ''} | {c['in']} | {c['out']} | {c['t_in']:.3f} to {c['t_out']:.3f} | {c['text']} |")
    return '\n'.join(rows), '\n'.join(caps)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cues'); ap.add_argument('map'); ap.add_argument('--out'); ap.add_argument('--fps', type=float); ap.add_argument('--table')
    a = ap.parse_args()
    mp = json.load(open(a.map)); out = compile_sheet(json.load(open(a.cues)), mp, a.fps)
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(out, f, indent=1); f.write('\n')
    if a.table:
        t1, t2 = table(out, mp)
        open(a.table, 'w').write(f"# Cue sheet\n\nCompiled from bars and beats against the map. {out['count']} cues, {out['mismatches']} mismatches.\n\n## Cues\n\n{t1}\n\n## Captions\n\n{t2}\n")
    print(f"MEASURED {out['count']} cues, {out['mismatches']} mismatches, {len(out['captions'])} captions, {len(out['warnings'])} warnings")
    for b in out['detail']:
        print(f"  MISMATCH scene {b['scene']} at {b['at']}: expects {b['expect']}, the map has {b['found']}")
    for w in out['warnings']:
        print(f"  warning scene {w['scene']}: \"{w['caption']}\" {w['issue']}")
    sys.exit(1 if out['mismatches'] else 0)
