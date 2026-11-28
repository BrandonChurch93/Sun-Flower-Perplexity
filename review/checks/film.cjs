// Checks the film, its position line and the whole-file path against a local server: the film starting by itself,
// the words on the buttons, the readout of the part, the bar and the beat against the film's time, the names under
// the line, the flower head and the lit part of the strip, jumps, sound, the end of the film and the short videos.
// node review/checks/film.cjs <base url> <scenario: stream | ranges | refused | phone | reduce> [tag]
// stream, phone, refused and reduce want a server started with NORANGE=1 (the public host); ranges wants one without.
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
const [base, scenario, tag = scenario] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail) => { results.push(pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')) }
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const phone = scenario === 'phone'
  const ctx = await browser.newContext({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, reducedMotion: scenario === 'reduce' ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  const errors = [], wholeFetches = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  page.on('request', (r) => { if (/\.mp4/.test(r.url()) && r.resourceType() === 'fetch') wholeFetches.push(r.url().split('/').pop()) })
  if (scenario === 'refused') await page.route('**/*.mp4', (route) => (route.request().resourceType() === 'media' ? route.abort() : route.continue()))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const st = () => page.evaluate(() => { const v = document.getElementById('film'); const s = v.seekable; return { t: +v.currentTime.toFixed(2), paused: v.paused, muted: v.muted, rs: v.readyState, err: v.error && v.error.code, blob: v.currentSrc.indexOf('blob:') === 0, src: v.currentSrc.split('/').pop().slice(0, 34), seekEnd: s.length ? +s.end(s.length - 1).toFixed(1) : -1, controls: v.hasAttribute('controls'), rowHidden: document.getElementById('scrub-row').hidden, hold: !document.getElementById('hold').hidden, note: document.getElementById('note').textContent, part: document.getElementById('part').textContent, rung: document.getElementById('rung').textContent, now: document.getElementById('now').textContent, total: document.getElementById('total').textContent, scrub: +document.getElementById('scrub').value, play: document.getElementById('play').textContent, sound: document.getElementById('sound').textContent, ticks: document.querySelectorAll('#scrub-track > i').length, soundOn: document.getElementById('sound').getAttribute('data-on'), playState: document.getElementById('play').getAttribute('data-state'), names: [...document.querySelectorAll('.scrub-names li')].map((e) => ({ text: e.textContent, cur: e.getAttribute('data-current'), shown: e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' })), at: +getComputedStyle(document.getElementById('scrub-track')).getPropertyValue('--at'), dur: v.duration, noteFlag: document.querySelector('.film-bar').getAttribute('data-note'), partShown: getComputedStyle(document.getElementById('part')).display !== 'none', noteShown: getComputedStyle(document.getElementById('note')).display !== 'none', barH: Math.round(document.querySelector('.film-bar').getBoundingClientRect().height), partName: (document.querySelector('#part i') || {}).textContent, partBar: (document.querySelector('#part span') || {}).textContent, over: document.documentElement.scrollWidth - document.documentElement.clientWidth } })
  const clickAt = async (f) => { const b = await page.locator('#scrub').boundingBox(); const x = b.x + 8 + (b.width - 16) * f, y = b.y + b.height / 2; if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y) }
  // What the readout must say at a time: the part, then the bar and the beat counted from 1.
  const FIRST = 0.883143, BAR = 1.714286, PARTS = [[1, 'Germination'], [17, 'Frost'], [25, 'First climb'], [33, 'Storm'], [41, 'The great climb'], [57, 'Bloom'], [65, 'Field'], [73, 'Last light']]
  const want = (t) => { const bar = (t - FIRST) / BAR + 1; const n = Math.floor(bar + 1e-6); const beat = Math.floor((bar - n) * 4 + 1e-6) + 1; let at = 0; PARTS.forEach((p, i) => { if (n >= p[0]) at = i }); return { name: PARTS[at][1], bar: bar >= 1 ? 'bar ' + n + '.' + beat : 'before bar 1' } }
  // The page writes the readout once a frame while the film plays, so what stands there is right for the film's
  // time now or for its time up to three frames ago, and never for a later time.
  const readoutFits = (s, t) => [t - 0.05, t - 0.034, t - 0.017, t].some((x) => { const w = want(Math.max(0, x)); return w.name === s.partName && w.bar === s.partBar })
  const namesFit = (s) => { const cur = s.names.filter((n) => n.cur === 'yes'); return s.names.length === 8 && cur.length === 1 && cur[0].text === s.partName && s.names.every((n) => n.shown === !phone) }
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await sleep(200) } return st() }

  if (scenario === 'refused') {
    const a = await until((s) => /Loading the film/.test(s.note), 8000)
    ok('refused plain file: the page says it is loading the film', /^Loading the film( \u00b7 \d+%)?$/.test(a.note) && a.noteFlag === 'yes' && !a.partShown, { note: a.note, flag: a.noteFlag, partShown: a.partShown })
    const b = await until((s) => s.blob && !s.paused && s.t > 1, 90000)
    ok('refused plain file: the film plays from the whole file', b.blob && !b.paused && b.t > 1 && b.muted && b.err === null, b)
    ok('note cleared, label Pause', b.note === '' && b.play === 'Pause' && b.noteFlag === 'no' && b.partShown, { note: b.note, play: b.play, flag: b.noteFlag })
    await clickAt(0.5); const c = await until((s) => Math.abs(s.t - 63.5) < 4, 4000)
    ok('jump on the whole file', Math.abs(c.t - 63.5) < 4, c.t)
  } else if (scenario === 'reduce') {
    await sleep(2500); const a = await st()
    ok('reduced motion: the film waits', a.paused && a.t === 0 && a.rs >= 1, { paused: a.paused, t: a.t, rs: a.rs })
    await clickAt(0.5); const b = await until((s) => s.blob && s.rs >= 2 && Math.abs(s.t - 63.5) < 2, 90000)
    ok('reduced motion: jump lands and stays paused', b.blob && b.paused && Math.abs(b.t - 63.5) < 2 && !b.hold && b.note === '', { t: b.t, blob: b.blob, paused: b.paused, hold: b.hold, note: b.note })
    ok('reduced motion: label, readout and names at rest', a.play === 'Play the film' && a.partName === 'Germination' && a.partBar === 'before bar 1' && b.play === 'Play the film' && readoutFits(b, b.t) && b.partName === 'Storm' && /^bar 37\.[1-4]$/.test(b.partBar) && namesFit(b), { play: [a.play, b.play], start: [a.partName, a.partBar], after: [b.partName, b.partBar] })
    await page.click('#play'); await sleep(1500); const c = await st()
    ok('Play then starts it', !c.paused && c.t > b.t, { t: c.t, paused: c.paused })
  } else {
    const a0 = await until((s) => s.t > 1 && !s.paused, 15000); await sleep(1500); const a = await st()
    ok('film plays on arrival, muted', !a.paused && a.t > a0.t && a.muted, { t0: a0.t, t1: a.t })
    ok('own position line in place of the browser controls', !a.controls && !a.rowHidden && a.ticks === 7 && a.total === '2:07', { controls: a.controls, ticks: a.ticks, total: a.total, now: a.now })
    ok('the film page\'s words on the buttons', a.play === 'Pause' && a.playState === 'playing' && a.sound === 'Turn the sound on' && a.soundOn === 'no', { play: a.play, sound: a.sound, on: a.soundOn })
    ok('readout names the part, the bar and the beat of the film\'s time', readoutFits(a, a.t) && a.partShown, { t: a.t, name: a.partName, bar: a.partBar, want: want(a.t) })
    ok(phone ? 'the eight names are built, hidden on a phone, one marked as current' : 'eight names under the line, the current one marked and the same as the readout', namesFit(a), a.names.map((n) => n.text + (n.cur === 'yes' ? '*' : '') + (n.shown ? '' : ' (hidden)')).join(', '))
    ok('the lit part of the strip ends where the film is', Math.abs(a.at - a.t / a.dur) < 0.012, { at: a.at, share: +(a.t / a.dur).toFixed(4) })
    ok('no word about loading: flag off, readout shown', a.note === '' && a.noteFlag !== 'yes' && a.partShown, { note: a.note, flag: a.noteFlag })
    // Four seconds of the film, looked at on every frame: the readout against the film's time, and the flower head and
    // the lit edge of the strip against the place the film is at, in screen pixels.
    const fol = await page.evaluate(() => new Promise((done) => {
      const FIRST = 0.883143, BAR = 1.714286
      const v = document.getElementById('film'), scrub = document.getElementById('scrub'), track = document.getElementById('scrub-track')
      const px = track.querySelector('.strip').getBoundingClientRect().width * devicePixelRatio
      const want = (t) => { const bar = (t - FIRST) / BAR + 1; const n = Math.floor(bar + 1e-6); const beat = Math.floor((bar - n) * 4 + 1e-6) + 1; return bar >= 1 ? 'bar ' + n + '.' + beat : 'before bar 1' }
      const since = (t) => { const b = (t - FIRST) / (BAR / 4); return (b - Math.floor(b)) * (BAR / 4) }
      let frames = 0, turns = 0, late = 0, worstLate = 0, head = 0, edge = 0, last = null; const start = performance.now()
      const step = () => {
        const t = v.currentTime, text = (document.querySelector('#part span') || {}).textContent
        frames++; if (last !== null && text !== last) turns++; last = text
        if (text !== want(t)) { late++; worstLate = Math.max(worstLate, since(t)) }
        head = Math.max(head, Math.abs((+scrub.value - t) / v.duration * px)); edge = Math.max(edge, Math.abs((+track.style.getPropertyValue('--at') - t / v.duration) * px))
        if (performance.now() - start < 4000) requestAnimationFrame(step); else done({ frames, turns, late, worstLateMs: +(worstLate * 1000).toFixed(1), headPx: +head.toFixed(2), edgePx: +edge.toFixed(2), stripPx: +px.toFixed(1) })
      }
      requestAnimationFrame(step)
    }))
    ok('over four seconds the beat turns over on the beat: no frame shows the beat before', fol.frames > 150 && fol.turns >= 8 && fol.late <= 1 && fol.worstLateMs <= 35, fol)
    ok('the flower head and the lit edge of the strip stay within a screen pixel of the film', fol.headPx <= 1 && fol.edgePx <= 1, { headPx: fol.headPx, edgePx: fol.edgePx })
    ok('file for this width', a.rung === (phone ? '720p' : '1080p'), a.rung)
    ok('no sideways overflow', a.over <= 0, a.over)
    await page.screenshot({ path: `${OUT}/${tag}-top.png` })
    await page.locator('.film-bar').screenshot({ path: `${OUT}/${tag}-bar.png` })
    if (scenario === 'ranges') {
      ok('host with ranges: the plain file can jump', a.seekEnd > 100, a.seekEnd)
      await clickAt(0.8); const b = await until((s) => Math.abs(s.t - 101.6) < 4, 6000)
      ok('jump to 80% without fetching the whole file', Math.abs(b.t - 101.6) < 4 && !b.blob && wholeFetches.filter((n) => /life-of/.test(n)).length === 0 && b.note === '', { t: b.t, blob: b.blob, fetches: wholeFetches, part: b.part })
      ok('after the jump the readout, the names and the strip agree with the film', readoutFits(b, b.t) && b.partName === 'Bloom' && namesFit(b) && Math.abs(b.at - b.t / b.dur) < 0.012 && b.barH === a.barH, { t: b.t, name: b.partName, bar: b.partBar, at: b.at, barH: [a.barH, b.barH] })
    } else {
      ok('host without ranges: the plain file cannot jump', a.seekEnd <= 1, a.seekEnd)
      await clickAt(0.8); await sleep(700); const b = await st()
      ok('jump asked: note with target, thumb and readout at the target, film keeps playing', /^Loading the film to jump to 1:4\d( \u00b7 \d+%)?$/.test(b.note) && Math.abs(b.scrub - 101.6) < 2 && /Bloom/.test(b.part) && !b.paused && !b.blob, { note: b.note, scrub: b.scrub, part: b.part, now: b.now, t: b.t })
      ok('readout at the target reads Bloom and its bar', b.partName === 'Bloom' && /^bar (59|60)\.[1-4]$/.test(b.partBar) && readoutFits(b, b.scrub), { name: b.partName, bar: b.partBar, want: want(b.scrub) })
      ok('while the word about loading stands it takes the readout\'s place, and the bar keeps its height', b.noteFlag === 'yes' && b.noteShown && !b.partShown && Math.abs(b.barH - a.barH) <= 1, { flag: b.noteFlag, noteShown: b.noteShown, partShown: b.partShown, barH: [a.barH, b.barH] })
      ok('names and strip follow the target', namesFit(b) && Math.abs(b.at - b.scrub / b.dur) < 0.012, { cur: b.names.filter((n) => n.cur === 'yes').map((n) => n.text), at: b.at })
      await sleep(600); await page.locator('.film-bar').screenshot({ path: `${OUT}/${tag}-bar-loading.png` })
      const c = await until((s) => s.blob && s.rs >= 2 && !s.hold && s.t > 100, 120000)
      ok('jump lands on the whole file and plays on', c.blob && !c.paused && c.t >= 101 && c.t < 112 && c.muted && !c.hold && c.note === '' && c.rung === (phone ? '720p' : '1080p') && c.play === 'Pause' && c.err === null, { t: c.t, blob: c.blob, paused: c.paused, muted: c.muted, hold: c.hold, note: c.note, rung: c.rung, play: c.play, err: c.err })
      ok('the word is gone, the readout is back and right, the bar has its height', c.noteFlag === 'no' && c.partShown && !c.noteShown && readoutFits(c, c.t) && namesFit(c) && c.barH === a.barH, { flag: c.noteFlag, name: c.partName, bar: c.partBar, t: c.t, barH: [a.barH, c.barH] })
      await clickAt(0.2); const d = await until((s) => Math.abs(s.t - 25.4) < 3, 4000)
      ok('second jump is immediate', Math.abs(d.t - 25.4) < 3 && !d.paused, { t: d.t, part: d.part })
      ok('readout after the second jump', readoutFits(d, d.t) && d.partName === 'Germination' && namesFit(d), { t: d.t, name: d.partName, bar: d.partBar })
      if (!phone) { await page.focus('#scrub'); const k0 = (await st()).t; await page.keyboard.press('ArrowRight'); await sleep(600); const k1 = (await st()).t; ok('right arrow moves 5 seconds on', k1 - k0 > 4.5 && k1 - k0 < 7, { from: k0, to: k1 }) }
      await page.click('#sound'); await sleep(400); const e = await st()
      ok('Sound turns on', !e.muted && e.sound === 'Turn the sound off' && e.soundOn === 'yes' && !e.paused, { muted: e.muted, sound: e.sound, on: e.soundOn })
      await page.click('#play'); await sleep(300); const f = await st(); await page.click('#film'); await sleep(500); const g = await st()
      ok('Pause, then a click on the picture plays', f.paused && f.play === 'Play the film' && f.playState === 'paused' && !g.paused && g.play === 'Pause', { paused: f.paused, label: f.play, after: g.paused })
      await page.click('#sound'); await sleep(400); const h = await st()
      ok('Sound turns off again', h.muted && h.sound === 'Turn the sound on' && h.soundOn === 'no', { muted: h.muted, sound: h.sound })
      await page.evaluate(() => { const v = document.getElementById('film'); v.currentTime = v.duration - 0.6 }); const en = await until((s) => s.play === 'Play it again', 6000)
      ok('at the end the button offers the film again, the readout stands in Last light, the strip is lit whole', en.play === 'Play it again' && en.playState === 'paused' && en.partName === 'Last light' && /^bar 7[45]\.[1-4]$/.test(en.partBar) && en.at > 0.99, { play: en.play, name: en.partName, bar: en.partBar, at: en.at })
      await page.click('#play'); const ag = await until((s) => !s.paused && s.t > 0.3 && s.t < 6, 6000)
      ok('Play it again starts from the beginning', !ag.paused && ag.t < 6 && ag.play === 'Pause' && ag.partName === 'Germination', { t: ag.t, play: ag.play, name: ag.partName, bar: ag.partBar })
      ok('whole film fetched once', wholeFetches.filter((n) => /life-of/.test(n)).length === 1, wholeFetches)
    }
    // the two short videos further down
    for (const id of ['loop', 'sketch']) {
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'center' }), id)
      let v; const t0 = Date.now()
      while (Date.now() - t0 < 15000) { v = await page.evaluate((i) => { const x = document.getElementById(i); return { t: +x.currentTime.toFixed(2), paused: x.paused, blob: x.currentSrc.indexOf('blob:') === 0, seekEnd: x.seekable.length ? +x.seekable.end(0).toFixed(1) : -1, rs: x.readyState } }, id); if (!v.paused && v.t > 0.3) break; await sleep(250) }
      ok(`short video "${id}" plays from a whole file and can be scrubbed`, !v.paused && v.t > 0.3 && v.blob && v.seekEnd > 5, v)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  const z = await st()
  ok('no console or page errors', errors.filter((e) => !(scenario === 'refused' && /ERR_FAILED|Failed to load resource/.test(e))).length === 0, errors.slice(0, 4))
  ok('no sideways overflow at the end', z.over <= 0, z.over)
  await page.screenshot({ path: `${OUT}/${tag}-end.png` })
  await browser.close()
  console.log(results.every(Boolean) ? `ALL PASS (${results.length})` : `FAILED ${results.filter((x) => !x).length} of ${results.length}`)
  if (!results.every(Boolean)) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
