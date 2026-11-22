#!/usr/bin/env python3
"""Make a short test recording with sync marks and a known offset, to prove check_recording.py on this machine.

  python3 make_sync_test.py OUT.mp4 [--late-ms 0] [--fps 60]
"""
import argparse, os, subprocess, tempfile
import numpy as np
import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('--late-ms', type=float, default=0); ap.add_argument('--fps', type=int, default=60)
a = ap.parse_args()
sr, dur, marks, w, h = 48000, 8.0, (1.0, 7.0), 320, 180
frames = np.zeros((int(dur * a.fps), h, w), dtype=np.uint8)
frames[int(3 * a.fps):int(5 * a.fps)] = 90
x = np.zeros(int(dur * sr), dtype=np.float32)
t = np.arange(int(0.04 * sr)) / sr
blip = (0.6 * np.sin(2 * np.pi * 1000 * t) * np.minimum(1, t / 0.001) * np.exp(-t / 0.012)).astype(np.float32)
x[int(3 * sr):int(5 * sr)] += (0.2 * np.sin(2 * np.pi * 220 * np.arange(int(2 * sr)) / sr)).astype(np.float32)
for m in marks:
    i = int(round(m * a.fps)); frames[i:i + 3] = 255
    j = int(round((m + a.late_ms / 1000) * sr)); x[j:j + len(blip)] += blip
with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, 'a.wav'); sf.write(wav, x, sr)
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{w}x{h}', '-r', str(a.fps), '-i', '-', '-i', wav,
                          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', a.out], stdin=subprocess.PIPE)
    p.stdin.write(frames.tobytes()); p.stdin.close(); p.wait()
print('wrote', a.out, 'with the sound late by', a.late_ms, 'ms')
