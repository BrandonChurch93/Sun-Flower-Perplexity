/**
 * beat-sync film clock and sync mark. Plain browser JavaScript, no dependencies.
 *
 * The page plays the track and reads film time from the audio clock on every frame, so picture time is sound
 * time by construction. A sync mark (a white flash and a blip at the same instant) sits in the dark lead before
 * the first frame and in the dark tail after the last one. check_recording.py measures both in a recording.
 *
 *   const clock = await createFilmClock({ url: 'track.flac', duration: 109.6, avMs: Number(new URLSearchParams(location.search).get('av') || 0) });
 *   window.addEventListener('keydown', (e) => { if (e.code === 'Space') clock.start(); });
 *   function frame() { const t = clock.time(); flash.style.opacity = clock.markOn() ? '1' : '0'; draw(t); requestAnimationFrame(frame); }
 *
 * time() is negative during the lead, 0 at the first frame, and runs past duration during the tail.
 */
export async function createFilmClock({ url, arrayBuffer, duration, lead = 2, tail = 2, markAt = 1, markHoldMs = 50, blipHz = 1000, avMs = 0 }) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ latencyHint: 'playback' });
  const data = arrayBuffer || (await (await fetch(url)).arrayBuffer());
  const buffer = await ctx.decodeAudioData(data);
  const length = duration || buffer.duration;
  let zero = null;
  let source = null;

  const blip = (when) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = blipHz;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.6, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0006, when + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.05);
  };

  const marks = () => [-lead + markAt, length + tail - markAt];

  return {
    ctx,
    buffer,
    duration: length,
    lead,
    tail,
    /** Call from a key press. The browser will not start sound without one. */
    async start() {
      if (source) { try { source.stop(); } catch (e) { /* already ended */ } }
      await ctx.resume();
      zero = ctx.currentTime + 0.15 + lead;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(zero);
      for (const m of marks()) blip(zero + m);
    },
    stop() {
      if (source) { try { source.stop(); } catch (e) { /* already ended */ } }
      source = null;
      zero = null;
    },
    started: () => zero !== null,
    /** Film time in seconds. avMs moves the picture against the sound by a measured capture offset. */
    time: () => (zero === null ? -lead : ctx.currentTime - zero + avMs / 1000),
    /** True while the white flash of a sync mark should be on screen. */
    markOn() {
      if (zero === null) return false;
      const t = ctx.currentTime - zero + avMs / 1000;
      return marks().some((m) => t >= m && t < m + markHoldMs / 1000);
    },
    done: () => zero !== null && ctx.currentTime - zero > length + tail,
  };
}
