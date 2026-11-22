#!/usr/bin/env python3
"""Measure picture against sound in a recording that carries the sync marks.

  python3 check_recording.py RECORDING.mp4 [--blip-hz 1000] [--json out.json]

A sync mark is a white flash on a dark screen and a short blip at the same instant. The page shows one before the
first frame and one after the last. This finds both and reports the offset at the head, at the tail, and the drift.
Positive means the sound is late. A take passes when both offsets are within one frame.
"""
import argparse, json, subprocess, sys
import numpy as np
from scipy import signal


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', path],
                         check=True, capture_output=True, text=True).stdout
    s = json.loads(out)['streams'][0]
    n, d = s['avg_frame_rate'].split('/')
    return float(n) / float(d or 1)


def frame_times(path, count, fps):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', path],
                         check=True, capture_output=True, text=True).stdout
    t = sorted(float(x.split(',')[0]) for x in out.split() if x.strip() and x.split(',')[0] not in ('N/A', ''))
    return np.array(t[:count]) if len(t) >= count else np.arange(count) / fps


def luma(path):
    w, h = 32, 18
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-an', '-fps_mode', 'passthrough', '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, w * h).mean(axis=1)


def audio(path, sr=48000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-af', 'aresample=async=1:first_pts=0', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32), sr


def flashes(lum, times):
    out = []
    white = lum > 180
    for i in np.flatnonzero(white):
        dark_before = i >= 3 and lum[max(0, i - 12):i].max() < 60
        if dark_before and (not out or times[i] - out[-1] > 1.0):
            out.append(float(times[i]))
    return out


def blip_near(x, sr, t, hz, span=0.6):
    a = max(0, int((t - span) * sr)); b = min(len(x), int((t + span) * sr))
    if b - a < sr // 10:
        return None
    sos = signal.butter(4, [hz * 0.8, hz * 1.25], btype='band', fs=sr, output='sos')
    y = np.abs(signal.sosfiltfilt(sos, x[a:b]))
    w = max(1, int(0.002 * sr))
    env = np.convolve(y, np.ones(w) / w, mode='same')
    if env.max() < 0.004:
        return None
    i = int(np.argmax(env >= 0.25 * env.max()))
    return (a + i) / sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recording'); ap.add_argument('--blip-hz', type=float, default=1000); ap.add_argument('--json')
    a = ap.parse_args()
    fps = probe(a.recording)
    lum = luma(a.recording); times = frame_times(a.recording, len(lum), fps)
    x, sr = audio(a.recording)
    fl = flashes(lum, times)
    res = {'recording': a.recording, 'fps': round(fps, 3), 'frame_ms': round(1000 / fps, 2), 'frames': int(len(lum)), 'flashes_s': [round(f, 4) for f in fl], 'marks': []}
    for name, f in (('head', fl[0] if fl else None), ('tail', fl[-1] if len(fl) > 1 else None)):
        if f is None:
            res['marks'].append({'mark': name, 'found': False}); continue
        b = blip_near(x, sr, f, a.blip_hz)
        res['marks'].append({'mark': name, 'found': b is not None, 'flash_s': round(f, 4), 'blip_s': round(b, 4) if b is not None else None,
                             'sound_late_ms': round(1000 * (b - f), 1) if b is not None else None})
    got = [m for m in res['marks'] if m.get('sound_late_ms') is not None]
    one = 1000 / fps
    if len(got) == 2:
        head, tail = got[0]['sound_late_ms'], got[1]['sound_late_ms']
        res['drift_ms'] = round(tail - head, 1)
        res['pass'] = bool(abs(head) <= one and abs(tail) <= one)
        if not res['pass'] and abs(tail - head) <= one:
            res['advice'] = f"Constant offset. Set the page's av setting to {round((head + tail) / 2):d} ms and record again."
        elif not res['pass']:
            res['advice'] = 'The offset changes during the take. That is drift in the capture, not a setting. Check dropped frames in the recorder.'
    else:
        res['pass'] = None
        res['advice'] = 'Both sync marks were not found. Record from before the first mark to after the last one.'
    for m in res['marks']:
        print(f"MEASURED {m['mark']}: flash {m.get('flash_s')} s, blip {m.get('blip_s')} s, sound late by {m.get('sound_late_ms')} ms" if m['found'] else f"UNKNOWN {m['mark']}: mark not found")
    if 'drift_ms' in res:
        print(f"MEASURED drift {res['drift_ms']} ms across the take. One frame is {res['frame_ms']} ms.")
    print('PASS' if res['pass'] else ('UNKNOWN' if res['pass'] is None else 'FAIL'), res.get('advice', ''))
    if a.json:
        json.dump(res, open(a.json, 'w'), indent=1)
    sys.exit(0 if res['pass'] else 1)


if __name__ == '__main__':
    main()
