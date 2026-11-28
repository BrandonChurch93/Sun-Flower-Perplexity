// Measures, on every frame the browser draws, how closely the bar readout, the flower head and the lit part of the
// strip follow the film while it plays. Passes when no more than one frame shows the beat before, and the head and
// the lit edge stay within one screen pixel of the film.
// node review/checks/follow.cjs <base url> [seconds] [width] [height]
const { chromium } = require('playwright-core')
const [base, secs = '8', w = '1440', h = '900'] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) { const ok = await page.evaluate(() => { const v = document.getElementById('film'); return !v.paused && v.currentTime > 1 }); if (ok) break; await sleep(200) }
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = (n) => m.find((x) => x.name === n).value; return { script: g('ScriptDuration'), layout: g('LayoutDuration'), style: g('RecalcStyleDuration'), layouts: g('LayoutCount'), styles: g('RecalcStyleCount'), task: g('TaskDuration') } }
  const m0 = await metrics()
  const res = await page.evaluate((secs) => new Promise((done) => {
    const FIRST = 0.883143, BAR = 1.714286
    const v = document.getElementById('film'), scrub = document.getElementById('scrub'), track = document.getElementById('scrub-track')
    const want = (t) => { const bar = (t - FIRST) / BAR + 1; const n = Math.floor(bar + 1e-6); const beat = Math.floor((bar - n) * 4 + 1e-6) + 1; return bar >= 1 ? 'bar ' + n + '.' + beat : 'before bar 1' }
    const since = (t) => { const b = (t - FIRST) / (BAR / 4); return (b - Math.floor(b)) * (BAR / 4) } // seconds since the last beat line
    const px = track.querySelector('.strip').getBoundingClientRect().width * devicePixelRatio // the picture's width in screen pixels
    const rows = []; const start = performance.now(); let lastFrame = start; const gaps = []
    const step = (ts) => {
      const t = v.currentTime
      const text = (document.querySelector('#part span') || {}).textContent
      const at = +track.style.getPropertyValue('--at')
      rows.push({ t, text, right: text === want(t), late: text === want(t) ? 0 : since(t), thumb: (+scrub.value - t) / v.duration * px, edge: (at - t / v.duration) * px, at })
      gaps.push(ts - lastFrame); lastFrame = ts
      if (performance.now() - start < secs * 1000) requestAnimationFrame(step); else done({ rows, gaps, px })
    }
    requestAnimationFrame(step)
  }), +secs)
  const m1 = await metrics()
  const rows = res.rows, late = rows.filter((r) => !r.right)
  const turns = rows.filter((r, i) => i > 0 && r.text !== rows[i - 1].text).length
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
  const gaps = res.gaps.slice(1)
  const out = {
    frames: rows.length, seconds: +secs, framesASecond: +(rows.length / +secs).toFixed(1), frameGapMs: { median: +q(gaps, 0.5).toFixed(1), p95: +q(gaps, 0.95).toFixed(1), worst: +Math.max(...gaps).toFixed(1) },
    beatTurnsSeen: turns, framesWithOldBeat: late.length, worstLatenessMs: +(Math.max(0, ...late.map((r) => r.late)) * 1000).toFixed(1),
    pictureScreenPixels: +res.px.toFixed(1), stepsOfTheLineASecond: +(rows.filter((r, i) => i > 0 && r.at !== rows[i - 1].at).length / +secs).toFixed(1),
    flowerHeadOffFilmPx: { worst: +Math.max(...rows.map((r) => Math.abs(r.thumb))).toFixed(2), median: +q(rows.map((r) => Math.abs(r.thumb)), 0.5).toFixed(2) },
    litEdgeOffFilmPx: { worst: +Math.max(...rows.map((r) => Math.abs(r.edge))).toFixed(2), median: +q(rows.map((r) => Math.abs(r.edge)), 0.5).toFixed(2) },
    costPerSecondMs: { script: +((m1.script - m0.script) / +secs * 1000).toFixed(2), style: +((m1.style - m0.style) / +secs * 1000).toFixed(2), layout: +((m1.layout - m0.layout) / +secs * 1000).toFixed(2), allTasks: +((m1.task - m0.task) / +secs * 1000).toFixed(1) },
    countsPerSecond: { styles: +((m1.styles - m0.styles) / +secs).toFixed(1), layouts: +((m1.layouts - m0.layouts) / +secs).toFixed(1) },
    errors,
  }
  console.log(JSON.stringify(out, null, 1))
  await browser.close()
  const pass = out.frames > +secs * 30 && out.beatTurnsSeen >= +secs * 2 && out.framesWithOldBeat <= 1 && out.flowerHeadOffFilmPx.worst <= 1 && out.litEdgeOffFilmPx.worst <= 1 && errors.length === 0
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${out.frames} frames in ${secs} s: ${out.framesWithOldBeat} with the beat before, flower head at most ${out.flowerHeadOffFilmPx.worst} px off the film, lit edge at most ${out.litEdgeOffFilmPx.worst} px`)
  if (!pass) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
