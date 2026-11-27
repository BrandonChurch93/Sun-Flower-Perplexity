// Checks the film, its position line and the whole-file path against a local server.
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
  const st = () => page.evaluate(() => { const v = document.getElementById('film'); const s = v.seekable; return { t: +v.currentTime.toFixed(2), paused: v.paused, muted: v.muted, rs: v.readyState, err: v.error && v.error.code, blob: v.currentSrc.indexOf('blob:') === 0, src: v.currentSrc.split('/').pop().slice(0, 34), seekEnd: s.length ? +s.end(s.length - 1).toFixed(1) : -1, controls: v.hasAttribute('controls'), rowHidden: document.getElementById('scrub-row').hidden, hold: !document.getElementById('hold').hidden, note: document.getElementById('note').textContent, part: document.getElementById('part').textContent, rung: document.getElementById('rung').textContent, now: document.getElementById('now').textContent, total: document.getElementById('total').textContent, scrub: +document.getElementById('scrub').value, play: document.getElementById('play').textContent, sound: document.getElementById('sound').textContent, ticks: document.querySelectorAll('#scrub-track i').length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth } })
  const clickAt = async (f) => { const b = await page.locator('#scrub').boundingBox(); const x = b.x + 7 + (b.width - 14) * f, y = b.y + b.height / 2; if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y) }
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await sleep(200) } return st() }

  if (scenario === 'refused') {
    const a = await until((s) => /Loading the film/.test(s.note), 8000)
    ok('refused plain file: the page says it is loading the film', /^Loading the film( \u00b7 \d+%)?$/.test(a.note), a.note)
    const b = await until((s) => s.blob && !s.paused && s.t > 1, 90000)
    ok('refused plain file: the film plays from the whole file', b.blob && !b.paused && b.t > 1 && b.muted && b.err === null, b)
    ok('note cleared, label Pause', b.note === '' && b.play === 'Pause', { note: b.note, play: b.play })
    await clickAt(0.5); const c = await until((s) => Math.abs(s.t - 63.5) < 4, 4000)
    ok('jump on the whole file', Math.abs(c.t - 63.5) < 4, c.t)
  } else if (scenario === 'reduce') {
    await sleep(2500); const a = await st()
    ok('reduced motion: the film waits', a.paused && a.t === 0 && a.rs >= 1, { paused: a.paused, t: a.t, rs: a.rs })
    await clickAt(0.5); const b = await until((s) => s.blob && s.rs >= 2 && Math.abs(s.t - 63.5) < 2, 90000)
    ok('reduced motion: jump lands and stays paused', b.blob && b.paused && Math.abs(b.t - 63.5) < 2 && !b.hold && b.note === '', b)
    await page.click('#play'); await sleep(1500); const c = await st()
    ok('Play then starts it', !c.paused && c.t > b.t, { t: c.t, paused: c.paused })
  } else {
    const a0 = await until((s) => s.t > 1 && !s.paused, 15000); await sleep(1500); const a = await st()
    ok('film plays on arrival, muted', !a.paused && a.t > a0.t && a.muted, { t0: a0.t, t1: a.t })
    ok('own position line in place of the browser controls', !a.controls && !a.rowHidden && a.ticks === 7 && a.total === '2:07', { controls: a.controls, ticks: a.ticks, total: a.total, now: a.now })
    ok('file for this width', a.rung === (phone ? '720p' : '1080p'), a.rung)
    ok('no sideways overflow', a.over <= 0, a.over)
    await page.screenshot({ path: `${OUT}/${tag}-top.png` })
    await page.locator('.film-bar').screenshot({ path: `${OUT}/${tag}-bar.png` })
    if (scenario === 'ranges') {
      ok('host with ranges: the plain file can jump', a.seekEnd > 100, a.seekEnd)
      await clickAt(0.8); const b = await until((s) => Math.abs(s.t - 101.6) < 4, 6000)
      ok('jump to 80% without fetching the whole file', Math.abs(b.t - 101.6) < 4 && !b.blob && wholeFetches.filter((n) => /life-of/.test(n)).length === 0 && b.note === '', { t: b.t, blob: b.blob, fetches: wholeFetches, part: b.part })
    } else {
      ok('host without ranges: the plain file cannot jump', a.seekEnd <= 1, a.seekEnd)
      await clickAt(0.8); await sleep(700); const b = await st()
      ok('jump asked: note with target, thumb and readout at the target, film keeps playing', /^Loading the film to jump to 1:4\d( \u00b7 \d+%)?$/.test(b.note) && Math.abs(b.scrub - 101.6) < 2 && /Bloom/.test(b.part) && !b.paused && !b.blob, { note: b.note, scrub: b.scrub, part: b.part, now: b.now, t: b.t })
      await sleep(600); await page.locator('.film-bar').screenshot({ path: `${OUT}/${tag}-bar-loading.png` })
      const c = await until((s) => s.blob && s.rs >= 2 && !s.hold && s.t > 100, 120000)
      ok('jump lands on the whole file and plays on', c.blob && !c.paused && c.t >= 101 && c.t < 112 && c.muted && !c.hold && c.note === '' && c.rung === (phone ? '720p' : '1080p') && c.play === 'Pause' && c.err === null, c)
      await clickAt(0.2); const d = await until((s) => Math.abs(s.t - 25.4) < 3, 4000)
      ok('second jump is immediate', Math.abs(d.t - 25.4) < 3 && !d.paused, { t: d.t, part: d.part })
      if (!phone) { await page.focus('#scrub'); const k0 = (await st()).t; await page.keyboard.press('ArrowRight'); await sleep(600); const k1 = (await st()).t; ok('right arrow moves 5 seconds on', k1 - k0 > 4.5 && k1 - k0 < 7, { from: k0, to: k1 }) }
      await page.click('#sound'); await sleep(400); const e = await st()
      ok('Sound turns on', !e.muted && e.sound === 'Sound on' && !e.paused, { muted: e.muted, sound: e.sound })
      await page.click('#play'); await sleep(300); const f = await st(); await page.click('#film'); await sleep(500); const g = await st()
      ok('Pause, then a click on the picture plays', f.paused && f.play === 'Play' && !g.paused, { paused: f.paused, after: g.paused })
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
