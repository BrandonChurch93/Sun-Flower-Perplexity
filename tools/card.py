#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

FPS = 30
TO_YUV = 'in_range=pc:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int'
TO_RGB = 'in_range=tv:out_range=pc:in_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int'
TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
SIZES = {'1080p': (1920, 1080), '720p': (1280, 720)}


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def fit(image, size):
    return image if image.size == size else image.resize(size, Image.LANCZOS)


def psnr(a, b):
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    return 99.0 if mse == 0 else float(10 * np.log10(255 * 255 / mse))


def encode(folder, first, count, size, crf, file):
    run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-start_number', str(first), '-i', f'{folder}/f%05d.png', '-frames:v', str(count),
         '-vf', f'scale={size[0]}:{size[1]}:{TO_YUV},format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', str(crf),
         '-g', str(FPS), '-keyint_min', str(FPS), '-sc_threshold', '0', '-flags', '+cgop', '-r', str(FPS), '-video_track_timescale', str(FPS * 512),
         *TAGS, '-movflags', '+faststart', '-an', file])


def decoded(file, size):
    step = size[0] * size[1] * 3
    pipe = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', file, '-vf', f'scale={TO_RGB},format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
    while True:
        raw = pipe.stdout.read(step)
        if len(raw) < step:
            break
        yield np.frombuffer(raw, dtype=np.uint8).reshape(size[1], size[0], 3)
    pipe.wait()


def probe(file):
    j = json.loads(run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
                        'stream=codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,nb_read_frames,color_range,color_space,color_transfer,color_primaries:format=duration',
                        '-of', 'json', file]))
    key = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=key_frame', '-read_intervals', '%+#1', '-of', 'csv=p=0', file]).strip()
    return j, key.startswith('1')


def check(file, size, folder, first, count, still):
    j, key = probe(file)
    video = [s for s in j['streams'] if s['codec_type'] == 'video']
    total = 0.0
    worst = (99.0, None)
    n = 0
    start = None
    end = None
    for i, frame in enumerate(decoded(file, size)):
        source = np.asarray(fit(Image.open(f'{folder}/f{first + i:05d}.png').convert('RGB'), size))
        p = psnr(frame, source)
        total += p
        if p < worst[0]:
            worst = (p, first + i)
        if i == 0:
            start = frame.copy()
        end = frame.copy()
        n += 1
    ref = np.asarray(fit(still, size))
    d = np.abs(start.astype(np.int16) - ref.astype(np.int16))
    seam = np.abs(end.astype(np.int16) - start.astype(np.int16))
    return {
        'bytes': os.path.getsize(file), 'streams': len(j['streams']), 'video': video[0], 'seconds': float(j['format']['duration']), 'frames': n, 'framesMeant': count,
        'firstFrameIsAKeyFrame': key,
        'firstFrameAgainstTheStill': {'psnr': round(psnr(start, ref), 2), 'meanLevels': round(float(d.mean()), 3), 'shareOver8Levels': round(float((d.max(axis=2) > 8).mean()), 5)},
        'everyFrameAgainstItsSource': {'meanPsnr': round(total / n, 2), 'worstPsnr': round(worst[0], 2), 'worstFrame': worst[1]},
        'lastFrameAgainstTheFirst': {'psnr': round(psnr(end, start), 2), 'meanLevels': round(float(seam.mean()), 3)},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--first', type=int, default=2905)
    ap.add_argument('--last', type=int, default=3112)
    ap.add_argument('--crf1080', type=int, default=15)
    ap.add_argument('--crf720', type=int, default=18)
    ap.add_argument('--fade', type=int, default=0)
    ap.add_argument('--clip', action='store_true')
    ap.add_argument('--turn', type=int, default=3075)
    ap.add_argument('--back', type=int, default=2)
    ap.add_argument('--tag', default='')
    a = ap.parse_args()
    count = a.last - a.first + 1
    missing = [f for f in range(a.first, a.last + 1) if not os.path.exists(f'{a.frames}/f{f:05d}.png')]
    if missing:
        raise SystemExit(f'missing {missing}')
    os.makedirs(a.out, exist_ok=True)
    name = f'sunflower-card{a.tag}'
    report = {'firstFrame': a.first, 'lastFrame': a.last, 'frames': count, 'seconds': round(count / FPS, 4), 'framesASecond': FPS, 'files': {}}

    drawn = Image.open(f'{a.frames}/f{a.first:05d}.png')
    if drawn.size != SIZES['1080p']:
        raise SystemExit(f'size {drawn.size}')
    opaque = [True]
    for f in range(a.first, a.last + 1):
        im = Image.open(f'{a.frames}/f{f:05d}.png')
        if im.size != SIZES['1080p']:
            raise SystemExit(f'size of {f} {im.size}')
        if 'A' in im.getbands() and im.getchannel('A').getextrema() != (255, 255):
            opaque[0] = False
    still = drawn.convert('RGB')
    png = f'{a.out}/{name}-still-1920x1080.png'
    still.save(png, optimize=True)
    jpg = f'{a.out}/{name}-still-1920x1080.jpg'
    still.save(jpg, quality=93, subsampling=0, optimize=True, progressive=True)
    small = fit(still, SIZES['720p'])
    jpg720 = f'{a.out}/{name}-still-1280x720.jpg'
    small.save(jpg720, quality=92, subsampling=0, optimize=True, progressive=True)
    report['still'] = {
        'frame': a.first, 'sha256OfTheSourceFramesPixels': hashlib.sha256(np.asarray(drawn.convert('RGBA')).tobytes()).hexdigest(),
        'everySourceFrameIsOpaque': opaque[0],
        'pngEqualsTheSourceFrame': bool(np.array_equal(np.asarray(Image.open(png).convert('RGB')), np.asarray(still))),
        'files': {os.path.basename(png): os.path.getsize(png), os.path.basename(jpg): os.path.getsize(jpg), os.path.basename(jpg720): os.path.getsize(jpg720)},
        'jpgPsnr': round(psnr(np.asarray(Image.open(jpg).convert('RGB')), np.asarray(still)), 2),
    }

    if a.clip:
        for label, size in SIZES.items():
            file = f'{a.out}/{name}-clip-{label}.mp4'
            encode(a.frames, a.first, count, size, a.crf1080 if label == '1080p' else a.crf720, file)
            report['files'][os.path.basename(file)] = check(file, size, a.frames, a.first, count, still)

    work = f'{a.out}/.loop'
    if a.turn > a.first:
        there = list(range(a.first, a.turn + 1))
        back = list(range(a.turn - a.back, a.first, -a.back))
        order = there + back
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        for i, f in enumerate(order):
            os.symlink(os.path.abspath(f'{a.frames}/f{f:05d}.png'), f'{work}/f{a.first + i:05d}.png')
        for label, size in SIZES.items():
            file = f'{a.out}/{name}-loop-open-close-{label}.mp4'
            encode(work, a.first, len(order), size, a.crf1080 if label == '1080p' else a.crf720, file)
            report['files'][os.path.basename(file)] = check(file, size, work, a.first, len(order), still)
        shutil.rmtree(work, ignore_errors=True)
        report['loopOpenClose'] = {'forwardFrames': len(there), 'turnsAtFrame': a.turn, 'backwardFrames': len(back), 'backwardStep': a.back, 'lastSourceFrame': back[-1],
                                   'frames': len(order), 'seconds': round(len(order) / FPS, 4)}

    if a.fade > 0:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        for f in range(a.first, a.last + 1):
            os.symlink(os.path.abspath(f'{a.frames}/f{f:05d}.png'), f'{work}/f{f:05d}.png')
        head = np.asarray(still).astype(np.float64)
        tail = np.asarray(Image.open(f'{a.frames}/f{a.last:05d}.png').convert('RGB')).astype(np.float64)
        for k in range(1, a.fade + 1):
            t = k / (a.fade + 1)
            t = t * t * (3 - 2 * t)
            Image.fromarray(np.clip(np.rint(tail * (1 - t) + head * t), 0, 255).astype(np.uint8)).save(f'{work}/f{a.last + k:05d}.png', compress_level=1)
        for label, size in SIZES.items():
            file = f'{a.out}/{name}-loop-fade-{label}.mp4'
            encode(work, a.first, count + a.fade, size, a.crf1080 if label == '1080p' else a.crf720, file)
            report['files'][os.path.basename(file)] = check(file, size, work, a.first, count + a.fade, still)
        shutil.rmtree(work, ignore_errors=True)
        report['loopFade'] = {'dissolveFrames': a.fade, 'frames': count + a.fade, 'seconds': round((count + a.fade) / FPS, 4)}

    json.dump(report, open(f'{a.out}/card-proof.json', 'w'), indent=1)
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
