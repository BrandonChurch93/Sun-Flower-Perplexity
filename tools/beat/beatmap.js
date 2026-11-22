/**
 * beat-sync loader. One plain file, no dependencies. Give it the parsed map.json.
 *
 * @typedef {{bar:number, t:number, source_bar:number, cells:string, level_db:number}} Bar
 * @typedef {{name:string, bars?:[number, number], from_s?:number, to_s?:number}} Section
 * @typedef {{bar:number, beat:number, cell:number, inBar:number, inBeat:number}} Position
 * @typedef {{
 *   map: any, bpm: number, beat: number, bar: number, bars: number, duration: number,
 *   at: (bar:number, beat?:number) => number,
 *   time: (pos:string|[number, number]) => number,
 *   parse: (pos:string|[number, number]) => [number, number],
 *   barAt: (t:number) => Position,
 *   phase: (t:number, unit?:'beat'|'bar') => number,
 *   section: (t:number) => Section|null,
 *   hits: (bar:number) => string,
 *   hitAt: (bar:number, beat:number) => string,
 *   frame: (t:number, fps?:number) => number
 * }} Beatmap
 *
 * @param {any} map
 * @returns {Beatmap}
 */
export function createBeatmap(map) {
  const bpb = map.meter.beats_per_bar;
  const cpb = map.meter.cells_per_bar;
  const list = map.bars;
  const n = list.length;
  const constant = map.tempo.constant !== false;
  const bar1 = map.grid.bar1_s;
  const barS = map.meter.bar_s;
  const beatS = map.meter.beat_s;
  const duration = map.arrangement ? map.arrangement.seconds : map.source.seconds;

  const start = (bar) => {
    if (constant) return bar1 + (bar - 1) * barS;
    if (bar < 1) return list[0].t + (bar - 1) * barS;
    if (bar > n) return list[n - 1].t + (bar - n) * barS;
    return list[bar - 1].t;
  };
  const length = (bar) => (constant || bar < 1 || bar >= n ? barS : list[bar].t - list[bar - 1].t);

  /** Seconds at a bar and beat. Beats start at 1 and may be fractional: 2.5 is the eighth after beat 2. */
  const at = (bar, beat = 1) => start(bar) + ((beat - 1) * length(bar)) / bpb;

  /** "11.2" is bar 11 beat 2. "11.2+" is the eighth after it. */
  const parse = (pos) => {
    if (Array.isArray(pos)) return [pos[0], pos[1]];
    const s = String(pos).trim();
    const plus = s.endsWith('+');
    const [b, bt] = s.replace(/\+$/, '').split('.');
    return [parseInt(b, 10), parseFloat(bt || '1') + (plus ? 0.5 : 0)];
  };
  const time = (pos) => at(...parse(pos));

  /** The position of a time. bar is 0 or less in the pickup and above the bar count in the tail. */
  const barAt = (t) => {
    let bar;
    if (constant) bar = Math.floor((t - bar1) / barS + 1e-9) + 1;
    else {
      bar = 1;
      if (t < list[0].t) bar = Math.floor((t - list[0].t) / barS) + 1;
      else { while (bar < n && list[bar].t <= t) bar += 1; if (bar === n && t >= list[n - 1].t + barS) bar = n + 1 + Math.floor((t - list[n - 1].t - barS) / barS); }
    }
    const inBar = Math.min(1, Math.max(0, (t - start(bar)) / length(bar)));
    const beatPos = inBar * bpb;
    const beat = Math.min(bpb, Math.floor(beatPos + 1e-9) + 1);
    return { bar, beat, cell: Math.min(cpb - 1, Math.floor(inBar * cpb + 1e-9)), inBar, inBeat: beatPos - (beat - 1) };
  };

  /** 0 to 1 inside the current beat or bar, for motion that breathes with the music. */
  const phase = (t, unit = 'beat') => {
    const p = barAt(t);
    return unit === 'bar' ? p.inBar : p.inBeat;
  };

  const section = (t) => {
    const { bar } = barAt(t);
    for (const s of map.sections) {
      if (s.bars && bar >= s.bars[0] && bar <= s.bars[1]) return s;
      if (s.from_s !== undefined && t >= s.from_s && t <= s.to_s) return s;
    }
    return null;
  };

  /** The eight cells of a bar: K kick, k soft low hit, S snare, X kick and snare, h hat, . nothing new. */
  const hits = (bar) => (bar >= 1 && bar <= n ? list[bar - 1].cells : '');
  const hitAt = (bar, beat) => {
    const c = ((beat - 1) * cpb) / bpb;
    const cells = hits(bar);
    return cells && Math.abs(c - Math.round(c)) < 1e-6 ? cells[Math.round(c)] : '.';
  };

  /** The frame that is on screen at t. A cut placed here is on the hit or one frame early, never late. */
  const frame = (t, fps = map.fps || 60) => Math.floor(t * fps + 1e-6);

  return { map, bpm: map.tempo.bpm, beat: beatS, bar: barS, bars: n, duration, at, time, parse, barAt, phase, section, hits, hitAt, frame };
}
