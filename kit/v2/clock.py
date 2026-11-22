"""Shared timing model for the v2 plan: the music grid, the world clock, growth and weather dials.
Everything is a pure function of film time. Used by the timeline chart and the timing sketch."""
import math

BAR1 = 0.883143          # start of bar 1 in the track, seconds (measured)
BAR = 60.0 / 140.0 * 4   # one bar at 140 BPM, 4/4
END = 127.0              # film length, seconds
FPS = 30
DAY = 0.85               # share of one day cycle with the sun up
EMAX = 62.0              # highest sun, degrees


def bar_t(n, beat=1.0):
    return BAR1 + (n - 1) * BAR + (beat - 1) * BAR / 4


def bpos(t):
    return (t - BAR1) / BAR + 1


B0 = bpos(0.0)


def hit_t(n):
    """Time of the frame on which a sharp event at bar n starts: the hit frame, never the one after."""
    return math.floor(bar_t(n) * FPS + 1e-6) / FPS


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return a + (b - a) * x


def hermite(b, b0, w0, m0, b1, w1, m1):
    d = b1 - b0
    u = clamp((b - b0) / d)
    h00 = 2 * u ** 3 - 3 * u ** 2 + 1
    h10 = u ** 3 - 2 * u ** 2 + u
    h01 = -2 * u ** 3 + 3 * u ** 2
    h11 = u ** 3 - u ** 2
    return h00 * w0 + h10 * d * m0 + h01 * w1 + h11 * d * m1


def world(b):
    """World day count: whole part is the day (0 based), fraction is the phase, 0 at sunrise."""
    if b < 1:
        return -0.012 + 0.012 * (b - B0) / (1 - B0)
    if b < 16.4:
        return (b - 1) / 4
    if b < 17:
        return hermite(b, 16.4, 3.85, 0.25, 17, 4.0, 0.0)
    if b < 25:
        return hermite(b, 17, 4.0, 0.0, 25, 4.045, 0.012)
    if b < 25.4:
        return hermite(b, 25, 4.045, 0.012, 25.4, 4.2, 0.5)
    if b < 27:
        return 5 - 0.5 * (27 - b)
    if b < 31.5:
        return 5 + (b - 27) / 2
    if b < 33:
        return hermite(b, 31.5, 7.25, 0.5, 33, 7.62, 0.003)
    if b < 41:
        return 7.62 + 0.003 * (b - 33)
    if b < 43:
        return hermite(b, 41, 7.644, 0.003, 43, 8.0, 0.5)
    if b < 55:
        return 8 + (b - 43) / 2
    if b < 57:
        # the last day: the sun crosses the sky in bars 55 and 56 and time slows into a low evening sun
        return hermite(b, 55, 14.0, 0.5, 57, 14.788, 0.010)
    if b < 61:
        return hermite(b, 57, 14.788, 0.010, 61, 14.808, 0.0035)
    if b < 73:
        return 14.808 + 0.0035 * (b - 61)
    return hermite(b, 73, 14.85, 0.0035, 74.6, 14.862, 0.0115)


def sun(b):
    """Returns (elevation in degrees, phase 0..1, day index)."""
    w = world(b)
    day = math.floor(w)
    ph = w - day
    if ph < DAY:
        el = EMAX * math.sin(math.pi * ph / DAY)
    else:
        el = -18.0 * math.sin(math.pi * (ph - DAY) / (1 - DAY))
    return el, ph, day


def trap(u, r_in, r_out):
    """Position under a speed that ramps up over r_in, runs flat, ramps down over r_out. 0..1 to 0..1."""
    u = clamp(u)
    area = 1 - r_in / 2 - r_out / 2
    if u < r_in:
        p = u * u / (2 * r_in) if r_in > 0 else 0
    elif u <= 1 - r_out:
        p = r_in / 2 + (u - r_in)
    else:
        p = area - (1 - u) ** 2 / (2 * r_out) if r_out > 0 else area
    return p / area


def grow(b):
    """Growth clock in grow days. Exactly flat in the two holds."""
    if b < 17:
        return 4 * trap((b - B0) / (17 - B0), 0.0, 0.08)
    if b < 25:
        return 4.0
    if b < 33:
        return 4 + 4 * trap((b - 25) / 8, 0.05, 0.14)
    if b < 41:
        return 8.0
    if b < 55.5:
        return 8 + 7 * trap((b - 41) / 14.5, 0.07, 0.12)
    return 15.0


_HG = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
_HH = [0.0, 0.028, 0.062, 0.112, 0.18, 0.30, 0.47, 0.68, 0.90, 1.08, 1.26, 1.43, 1.58, 1.71, 1.82, 1.90]
_pchip = None


def height(b):
    global _pchip
    if _pchip is None:
        from scipy.interpolate import PchipInterpolator
        _pchip = PchipInterpolator(_HG, _HH)
    return float(_pchip(grow(b)))


def bud(b):
    g = grow(b)
    return smooth((g - 11.3) / 3.4) * 0.85 + 0.15 * smooth((b - 55.0) / 1.9) if g > 11.3 else 0.0


def bloom(b):
    if b < 57:
        return 0.0
    tb = (hit_t(57) - BAR1) / BAR + 1
    u = clamp((b - tb) / 4.0)
    return 1 - (1 - u) ** 2.4


def frost(b):
    if b < 16.4:
        return 0.0
    if b < 17:
        return smooth((b - 16.4) / 0.6)
    if b < 23:
        return 1.0
    if b < 25:
        return lerp(1.0, 0.6, smooth((b - 23) / 2))
    return 0.6 * (1 - smooth((b - 25) / 0.4))


def fog(b):
    if b < 16.5:
        return 0.0
    if b < 17:
        return 0.8 * smooth((b - 16.5) / 0.5)
    if b < 21:
        return 0.8
    if b < 25:
        return lerp(0.8, 0.35, smooth((b - 21) / 4))
    return 0.35 * (1 - smooth((b - 25) / 0.5))


def overcast(b):
    base = 0.14
    if b < 31.6:
        return base
    if b < 32.9:
        return lerp(base, 1.0, smooth((b - 31.6) / 1.3))
    if b < 40:
        return 1.0
    if b < 41:
        return lerp(1.0, 0.78, smooth((b - 40) / 1))
    tb = (hit_t(41) - BAR1) / BAR + 1
    return lerp(0.78, base, smooth((b - tb) / 0.7))


def rain(b):
    tb = (hit_t(33) - BAR1) / BAR + 1
    if b < tb:
        return 0.0
    if b < 39.5:
        return smooth((b - tb) / 0.12)
    if b < 41.1:
        return lerp(1.0, 0.0, smooth((b - 39.5) / 1.6))
    return 0.0


def wet(b):
    if b < 33:
        return 0.0
    if b < 36:
        return smooth((b - 33) / 3)
    if b < 41:
        return 1.0
    return 1 - smooth((b - 41) / 3)


def flash(t):
    f = 0.0
    for n in (33, 37):
        x = t - hit_t(n)
        if x >= -1e-6:
            f = max(f, math.exp(-x / 0.17) + (0.7 * math.exp(-(x - 0.13) / 0.11) if x >= 0.13 else 0.0))
    return clamp(f)


def burst(b):
    tb = (hit_t(41) - BAR1) / BAR + 1
    if b < tb:
        return 0.0
    return (1 - smooth((b - tb) / 1.8))


SECTIONS = [
    # name, first bar, bar after the last, kind
    ('Germination', 1, 17, 'grow'),
    ('Frost', 17, 25, 'hold'),
    ('First climb', 25, 33, 'grow'),
    ('Storm', 33, 41, 'hold'),
    ('The great climb', 41, 57, 'grow'),
    ('Bloom', 57, 65, 'bloom'),
    ('Field', 65, 73, 'field'),
]

HITS = {
    1: 'first light', 5: 'sunrise · seed leaves open', 9: 'sunrise · first true leaves', 13: 'sunrise · second pair of leaves',
    17: 'first light on the frost', 21: 'the sun clears the mist', 25: 'thaw · the climb begins', 27: 'sunrise', 29: 'sunrise', 31: 'sunrise',
    33: 'lightning · the rain starts', 37: 'lightning', 41: 'the sun breaks through', 43: 'sunrise', 45: 'sunrise', 47: 'sunrise',
    49: 'sunrise · the bud forms', 51: 'sunrise', 53: 'sunrise', 55: 'sunrise · the last day', 57: 'the petals break open', 61: 'fully open',
    65: 'crane up', 69: 'the whole field', 73: 'last light',
}


def section(b):
    if b < 1:
        return ('Germination', 1, 17, 'grow')
    for s in SECTIONS:
        if s[1] <= b < s[2]:
            return s
    return ('Last light', 73, 74.6, 'field')


if __name__ == '__main__':
    prev = None
    for n in [1, 4.4, 5, 9, 13, 16.4, 17, 21, 25, 25.4, 27, 31, 32, 33, 37, 41, 42, 43, 49, 55, 55.5, 57, 59, 61, 65, 69, 73, 74.5]:
        el, ph, day = sun(n)
        print(f'bar {n:5.1f} t {bar_t(n):7.3f} world {world(n):7.3f} day {day + 1:2d} phase {ph:.3f} elev {el:6.1f} grow {grow(n):5.2f} h {height(n):.3f} bud {bud(n):.2f} bloom {bloom(n):.2f} frost {frost(n):.2f} fog {fog(n):.2f} over {overcast(n):.2f} rain {rain(n):.2f}')
    # checks: world is monotonic, growth is flat in the holds, nights are short
    import numpy as np
    ts = np.arange(0, END, 1 / FPS)
    w = np.array([world(bpos(t)) for t in ts])
    assert (np.diff(w) >= -1e-9).all(), 'world clock runs backwards'
    g = np.array([grow(bpos(t)) for t in ts])
    assert (np.diff(g) >= -1e-9).all()
    for a, c in ((17, 25), (33, 41)):
        m = (ts >= bar_t(a)) & (ts < bar_t(c))
        print('hold', a, c, 'growth change', float(g[m].max() - g[m].min()), 'height', height(a), height(c - 0.001))
    el = np.array([sun(bpos(t))[0] for t in ts])
    dark = el < -6
    runs = []; n = 0
    for d in dark:
        if d: n += 1
        elif n: runs.append(n / FPS); n = 0
    if n: runs.append(n / FPS)
    print('nights (sun under -6 degrees):', len(runs), 'longest', max(runs), 's, total', sum(runs), 's of', END)
    below = el < 0
    print('sun below the horizon in total', below.sum() / FPS, 's')
    rises = [ts[i] for i in range(1, len(el)) if el[i - 1] < 0 <= el[i]]
    print('sunrises', len(rises), [round(float(x), 3) for x in rises])
    print('bars of sunrises', [round(bpos(float(x)), 2) for x in rises])
