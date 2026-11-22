"""Shared parts of beat-sync: decode, envelopes, grid fit, hit detection."""
import hashlib, json, os, subprocess
import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
SCHEMA = 'beat-sync/map 1'
# Hit thresholds: dB under the loudest 8 ms of the band, and the rise over the level just before.
DEFAULTS = {'K_under': 4.6, 'K_rise': 5.0, 'k_under': 11.6, 'k_rise': 20.0, 'S_under': 2.5, 'S_rise': 9.0, 'h_under': 9.0, 'h_rise': 12.0}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def decode(src, wav):
    """Decode any audio file to 16 bit stereo WAV at 44.1 kHz. Never resamples twice, never normalizes."""
    os.makedirs(os.path.dirname(os.path.abspath(wav)), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c:a', 'pcm_s16le', '-ar', str(SR), '-ac', '2', wav], check=True)
    return wav


def load(wav):
    y, sr = sf.read(wav, always_2d=True)
    if sr != SR:
        raise SystemExit(f'{wav} is {sr} Hz. Decode it with decode() first.')
    return y, y.mean(axis=1)


def first_loud(m, level=0.1):
    i = np.flatnonzero(np.abs(m) > level)
    return int(i[0]) if len(i) else -1


def _rms_env(x, win_s=0.008):
    w = int(win_s * SR)
    return np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode='same') + 1e-14)


def band_envelopes(m):
    """8 ms RMS envelopes in dB for the three drum bands."""
    sos = {
        'sub': signal.butter(4, 100, 'lowpass', fs=SR, output='sos'),
        'mid': signal.butter(4, [300, 3000], 'bandpass', fs=SR, output='sos'),
        'hi': signal.butter(4, 6000, 'highpass', fs=SR, output='sos'),
    }
    return {n: 20 * np.log10(_rms_env(signal.sosfiltfilt(s, m)) + 1e-9) for n, s in sos.items()}


def thresholds(E, opts=None):
    o = dict(DEFAULTS); o.update(opts or {})
    ref = {n: float(e.max()) for n, e in E.items()}
    return {
        'reference_db': {n: round(v, 3) for n, v in ref.items()},
        'K_db': round(ref['sub'] - o['K_under'], 3), 'K_rise': o['K_rise'], 'k_db': round(ref['sub'] - o['k_under'], 3), 'k_rise': o['k_rise'],
        'S_db': round(ref['mid'] - o['S_under'], 3), 'S_rise': o['S_rise'],
        'h_db': round(ref['hi'] - o['h_under'], 3), 'h_rise': o['h_rise'],
    }


def _peak(e, t):
    a = max(0, int((t - 0.010) * SR)); b = int((t + 0.070) * SR)
    c = max(0, int((t - 0.090) * SR)); d = max(c + 1, int((t - 0.020) * SR))
    if b > len(e) or a >= b:
        return (-99.0, 0.0)
    p = float(e[a:b].max())
    return (p, p - float(np.median(e[c:d])))


def cell(E, thr, t):
    """What starts on this eighth: K kick, k soft low hit, S snare or clap, X kick and snare, h hat only, . nothing new."""
    s, sa = _peak(E['sub'], t); md, ma = _peak(E['mid'], t); h, ha = _peak(E['hi'], t)
    low = 'K' if (s > thr['K_db'] and sa > thr['K_rise']) else ('k' if (s > thr['k_db'] and sa > thr['k_rise']) else '')
    sn = md > thr['S_db'] and ma > thr['S_rise']
    if low and sn:
        sym = 'X'
    elif sn:
        sym = 'S'
    elif low:
        sym = low
    else:
        sym = 'h' if (h > thr['h_db'] and ha > thr['h_rise']) else '.'
    return sym, {'sub': (s, sa), 'mid': (md, ma), 'hi': (h, ha)}


def margins(E, thr, times):
    """How close the nearest call was for each class, in dB. Under 1 dB is a thin margin."""
    out = {}
    rows = [cell(E, thr, t) for t in times]
    lows = [(r[1]['sub'][0], r[0], i) for i, r in enumerate(rows) if r[1]['sub'][1] > 6 or r[0] in 'KkX']
    k_in = [v for v in lows if v[1] in 'KX']; k_out = [v for v in lows if v[1] not in 'KX']
    if k_in and k_out:
        out['K'] = {'weakest_accepted_db': round(min(k_in)[0], 2), 'strongest_rejected_db': round(max(k_out)[0], 2),
                    'margin_db': round(min(min(k_in)[0] - thr['K_db'], thr['K_db'] - max(k_out)[0]), 2),
                    'nearest_cells': [min(k_in)[2], max(k_out)[2]]}
    mids = [(r[1]['mid'][0], r[0], i) for i, r in enumerate(rows) if r[1]['mid'][1] > thr['S_rise']]
    s_in = [v for v in mids if v[1] in 'SX']; s_out = [v for v in mids if v[1] not in 'SX']
    if s_in and s_out:
        out['S'] = {'weakest_accepted_db': round(min(s_in)[0], 2), 'strongest_rejected_db': round(max(s_out)[0], 2),
                    'margin_db': round(min(min(s_in)[0] - thr['S_db'], thr['S_db'] - max(s_out)[0]), 2),
                    'nearest_cells': [min(s_in)[2], max(s_out)[2]]}
    his = [(r[1]['hi'][0], r[0], i) for i, r in enumerate(rows) if r[1]['hi'][1] > thr['h_rise'] and r[0] in 'h.']
    h_in = [v for v in his if v[1] == 'h']; h_out = [v for v in his if v[1] == '.']
    if h_in and h_out:
        out['h'] = {'weakest_accepted_db': round(min(h_in)[0], 2), 'strongest_rejected_db': round(max(h_out)[0], 2),
                    'margin_db': round(min(min(h_in)[0] - thr['h_db'], thr['h_db'] - max(h_out)[0]), 2),
                    'nearest_cells': [min(h_in)[2], max(h_out)[2]]}
    return out


# ---------- tempo ----------

def trackers(wav):
    """Two independent beat trackers. Each returns its tempo from a line through its own beats."""
    out = []
    try:
        import librosa
        y, sr = librosa.load(wav, sr=22050, mono=True)
        oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256, aggregate=np.median)
        _, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=256, units='frames', tightness=100)
        out.append(('librosa', librosa.frames_to_time(beats, sr=sr, hop_length=256)))
    except Exception as e:  # noqa: BLE001
        out.append(('librosa', None, str(e)[:80]))
    try:
        import essentia, essentia.standard as es
        essentia.log.warningActive = False
        essentia.log.infoActive = False
        audio = es.MonoLoader(filename=wav, sampleRate=SR)()
        _, beats, _, _, _ = es.RhythmExtractor2013(method='multifeature')(audio)
        out.append(('essentia', np.asarray(beats, dtype=float)))
    except Exception as e:  # noqa: BLE001
        out.append(('essentia', None, str(e)[:80]))
    res = []
    for item in out:
        name, beats = item[0], item[1]
        if beats is None or len(beats) < 8:
            res.append({'name': name, 'bpm': None, 'error': item[2] if len(item) > 2 else 'too few beats'})
            continue
        n = np.arange(len(beats))
        slope, _ = np.polyfit(n, beats, 1)
        res.append({'name': name, 'bpm': round(60 / float(slope), 3), 'beats': beats})
    return res


def _fit_env(m, lo, hi, hop=16, win=256):
    sos = signal.butter(4, [lo, hi], btype='band', fs=SR, output='sos')
    x = signal.sosfiltfilt(sos, m)
    return np.sqrt(signal.convolve(x * x, np.ones(win) / win, mode='same'))[::hop], hop


def _onset(e, hop, t, half=0.045):
    """Time at which the envelope crosses half of its rise, near t. Sharper than a peak and stable to level."""
    a = int((t - half) * SR / hop); b = int((t + half) * SR / hop)
    if a < 2 or b >= len(e) - 2:
        return None
    seg = e[a:b]
    d = np.convolve(np.diff(np.log(seg + 1e-6)), np.ones(9) / 9, mode='same')
    i = int(np.argmax(d))
    rise = np.log(seg.max() + 1e-6) - np.log(seg[:max(3, i - 10)].min() + 1e-6) if i > 12 else 0
    pk = seg[i:i + 60].max() if i + 60 <= len(seg) else seg[i:].max()
    base = seg[max(0, i - 20):i + 1].min()
    thr = base + 0.5 * (pk - base)
    j = i
    while j > 0 and seg[j] > thr:
        j -= 1
    while j < len(seg) - 1 and seg[j] < thr:
        j += 1
    return (a + j) * hop / SR, float(rise)


def _comb(e, hop, bpm0):
    """Rough eighth note grid: the period near the trackers' tempo and the phase that collect the most onset energy."""
    o = np.maximum(0, np.diff(np.log(e + 1e-6)))
    o = np.convolve(o, np.hanning(41) / np.hanning(41).sum(), mode='same')
    rate = SR / hop; dur = len(o) / rate
    best = (-1, None, None)
    for scale in np.linspace(0.99, 1.01, 201):
        E8 = 30.0 / (bpm0 * scale)
        n = int(dur / E8) - 1
        k = np.arange(n)
        for t0 in np.arange(0, E8, 0.002):
            idx = np.round((t0 + k * E8) * rate).astype(int)
            s = float(o[idx[idx < len(o)]].sum())
            if s > best[0]:
                best = (s, E8, t0)
    return best[1], best[2]


def fit_grid(m, bpm0, bpm_fixed=None):
    """Least squares grid through the sharpest onset class. Returns the eighth note period, the origin and the fit."""
    e, hop = _fit_env(m, 2000, 8000)
    E8, t0 = _comb(e, hop, bpm_fixed or bpm0)
    dur = len(m) / SR
    n = int((dur - t0) / E8)
    fits = []
    for group in range(4):
        js = []; ts = []
        for j in range(group, n, 4):
            r = _onset(e, hop, t0 + j * E8)
            if r and r[1] > 1.5:
                js.append(j); ts.append(r[0])
        if len(js) < 16:
            continue
        js = np.array(js, dtype=float); ts = np.array(ts)
        A = np.vstack([js, np.ones_like(js)]).T
        (p, c), *_ = np.linalg.lstsq(A, ts, rcond=None)
        r = ts - (p * js + c)
        g = np.abs(r) < 0.006
        if g.sum() >= 12:
            (p, c), *_ = np.linalg.lstsq(A[g], ts[g], rcond=None)
        r = ts[g] - (p * js[g] + c)
        fits.append({'group': group, 'n': int(g.sum()), 'dropped': int((~g).sum()), 'p8': float(p), 'c': float(c),
                     'rms': float(r.std()), 'worst': float(np.abs(r).max()), 'js': js[g], 'ts': ts[g]})
    if not fits:
        return {'ok': False, 'eighth_s': E8, 'origin_s': t0, 'reason': 'no onset class with 16 or more sharp onsets'}
    f = min(fits, key=lambda x: (x['rms'], -x['n']))
    bpm_fit = 30.0 / f['p8']
    js, ts = f['js'], f['ts']
    # Snap to a round tempo when the fitted one is indistinguishable from it over the whole file.
    snapped = None
    for step in (1.0, 0.5, 0.1):
        cand = bpm_fixed or round(bpm_fit / step) * step
        p8 = 30.0 / cand
        c = float(np.median(ts - p8 * js))
        r = ts - (p8 * js + c)
        third = max(1, len(r) // 3)
        drift = float(np.median(r[-third:]) - np.median(r[:third]))
        if abs(drift) < 0.0015 and r.std() < f['rms'] + 0.00025:
            snapped = {'bpm': float(cand), 'p8': p8, 'c': c, 'rms': float(r.std()), 'worst': float(np.abs(r).max()), 'drift': drift}
            break
        if bpm_fixed:
            snapped = {'bpm': float(cand), 'p8': p8, 'c': c, 'rms': float(r.std()), 'worst': float(np.abs(r).max()), 'drift': drift}
            break
    use = snapped or {'bpm': bpm_fit, 'p8': f['p8'], 'c': f['c'], 'rms': f['rms'], 'worst': f['worst'], 'drift': 0.0}
    r_all = ts - (f['p8'] * js + f['c'])
    third = max(1, len(r_all) // 3)
    origin = use['c'] % use['p8']
    origin = round(origin, 4)
    constant = f['rms'] < 0.005 and abs(float(np.median(r_all[-third:]) - np.median(r_all[:third]))) < 0.003
    return {'ok': True, 'constant': bool(constant), 'snapped': snapped is not None, 'bpm': use['bpm'], 'eighth_s': use['p8'], 'origin_s': origin,
            'fit': {'count': f['n'], 'dropped': f['dropped'], 'bpm': round(bpm_fit, 4), 'rms_ms': round(1000 * f['rms'], 2), 'worst_ms': round(1000 * f['worst'], 2),
                    'fixed_rms_ms': round(1000 * use['rms'], 2), 'drift_ms': round(1000 * use['drift'], 2), 'group': f['group']},
            'onsets': {'j': js, 't': ts}}


def bar_phase(labels, cpb):
    """Which eighth starts the bar: kicks on the first cell, snares on the backbeats."""
    best = (None, -1e9)
    half = cpb // 2
    for o in range(cpb):
        score = 0.0
        for j, s in enumerate(labels):
            c = (j - o) % cpb
            if c == 0:
                score += 1.0 if s in 'KkX' else 0.0
                score -= 1.0 if s == 'S' else 0.0
            elif cpb == 8 and c in (2, 6):
                score += 1.0 if s in 'SX' else 0.0
            elif cpb != 8 and c == half:
                score += 0.5 if s in 'SX' else 0.0
            elif c % 2 == 1:
                score -= 0.5 if s in 'KSX' else 0.0
        if score > best[1]:
            best = (o, score)
    return best[0]


def bar_level(m, t0, t1):
    a = max(0, int(t0 * SR)); b = min(len(m), int(t1 * SR))
    if b <= a:
        return -120.0
    return float(10 * np.log10(np.mean(m[a:b] ** 2) + 1e-12))


def pos(bar, cell_index):
    beat = cell_index // 2 + 1
    return f'{bar}.{beat}' + ('+' if cell_index % 2 else '')


def dump(obj, path):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2)
        f.write('\n')
