// The flows of FLOWS.md that the other scripts do not walk: the eight keys on the line, the readout at every part of
// the film, the short videos, the links, less motion, and a film that cannot be loaded at all.
// node review/checks/flows.cjs <url of a server with byte ranges> <url of a server without> [tag]
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
const [ranges, plain, tag = 'flows'] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail) => { results.push(pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')) }
const FIRST = 0.883143, BAR = 1.714286
const PARTS = [[1, 'Germination'], [17, 'Frost'], [25, 'First climb'], [33, 'Storm'], [41, 'The great climb'], [57, 'Bloom'], [65, 'Field'], [73, 'Last light']]
const barStart = (n) => FIRST + (n - 1) * BAR
const want = (t) => { const bar = (t - FIRST) / BAR + 1; const n = Math.floor(bar + 1e-6); const beat = Math.floor((bar - n) * 4 + 1e-6) + 1; let at = 0; PARTS.forEach((p, i) => { if (n >= p[0]) at = i }); return { name: PARTS[at][1], bar: bar >= 1 ? 'bar ' + n + '.' + beat : 'before bar 1' } }
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const open = async (url, opt = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: opt.reduce ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    const errors = [], asked = []
    page.on('request', (r) => asked.push(r.url().split('/').pop()))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
    if (opt.route) await opt.route(page)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    return { ctx, page, errors, asked }
  }
  const st = (page) => page.evaluate(() => { const v = document.getElementById('film'); return { t: +v.currentTime.toFixed(3), paused: v.paused, ended: v.ended, dur: v.duration, name: (document.querySelector('#part i') || {}).textContent, bar: (document.querySelector('#part span') || {}).textContent, cur: [...document.querySelectorAll('.scrub-names li[data-current="yes"]')].map((e) => e.textContent), now: document.getElementById('now').textContent, play: document.getElementById('play').textContent, note: document.getElementById('note').textContent, flag: document.querySelector('.film-bar').getAttribute('data-note'), value: +document.getElementById('scrub').value, says: document.getElementById('scrub').getAttribute('aria-valuetext'), barH: Math.round(document.querySelector('.film-bar').getBoundingClientRect().height) } })
  const until = async (page, fn, ms) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(page); if (fn(s)) return s; await sleep(120) } return s }

  // 1. Keys on the line, and the readout at every part, on a host that can hand out any piece of the file.
  {
    const { ctx, page, errors, asked } = await open(ranges)
    // The short videos further down, before anybody has scrolled to them: nothing has been asked of the host.
    await sleep(800)
    const SHORT = { loop: 'loop-bud-opens-and-closes.mp4', sketch: 'timing-sketch-excerpt.mp4' }
    const atFirst = {}
    for (const id of ['loop', 'sketch']) { atFirst[id] = await page.evaluate((i) => { const v = document.getElementById(i); return { started: v.hasAttribute('data-started'), readyState: v.readyState } }, id); atFirst[id].askedFor = asked.filter((n) => n === SHORT[id]).length }
    // The skip link, on a page nobody has touched yet.
    await page.keyboard.press('Tab')
    const skip = await page.evaluate(() => { const e = document.activeElement; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { text: e.textContent.trim(), href: e.getAttribute('href'), seen: b.width > 0 && b.height > 0 && b.top >= 0 && b.left >= 0, outline: s.outlineStyle + ' ' + s.outlineWidth } })
    await page.keyboard.press('Enter'); await sleep(600)
    const afterSkip = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement.id, top: Math.round(document.getElementById('process').getBoundingClientRect().top) }))
    ok('the skip link is the first stop, shows itself, and moves the focus to the process', skip.text === 'Skip to the process' && skip.href === '#process' && skip.seen && afterSkip.hash === '#process' && afterSkip.focus === 'process' && afterSkip.top >= -2 && afterSkip.top <= 200, { skip, afterSkip })
    await page.evaluate(() => window.scrollTo(0, 0))
    await until(page, (s) => !s.paused && s.t > 0.5, 15000)
    // The label follows the film's own pause event, which comes a moment after the press.
    await page.click('#play'); const p0 = await until(page, (s) => s.paused && s.play === 'Play the film', 3000)
    ok('the film is paused for the key checks', p0.paused && p0.play === 'Play the film', { t: p0.t, play: p0.play })
    const clickAt = async (t) => { const b = await page.locator('#scrub').boundingBox(); await page.mouse.click(b.x + 8 + (b.width - 16) * (t / 127), b.y + b.height / 2) }
    await clickAt(40); const a = await until(page, (s) => Math.abs(s.t - 40) < 0.3, 4000)
    ok('a click on the line at 0:40 lands there, still paused', Math.abs(a.t - 40) < 0.3 && a.paused, { t: a.t })
    await page.focus('#scrub')
    const keys = [['ArrowRight', 5], ['ArrowLeft', -5], ['PageUp', 15], ['PageDown', -15], ['ArrowUp', 5], ['ArrowDown', -5]]
    let at = a.t; const moves = []
    for (const [key, step] of keys) { await page.keyboard.press(key); const s = await until(page, (x) => Math.abs(x.t - (at + step)) < 0.06, 3000); moves.push({ key, from: at, to: s.t, fits: Math.abs(s.t - (at + step)) < 0.06 && s.paused && s.name === want(s.t).name && s.bar === want(s.t).bar }); at = s.t }
    ok('Right, Left, Page Up, Page Down, Up and Down move 5, 5, 15, 15, 5 and 5 seconds, and the readout follows', moves.every((m) => m.fits), moves.map((m) => m.key + ' ' + m.from + ' to ' + m.to))
    await page.keyboard.press('Home'); const h = await until(page, (s) => s.t < 0.06, 3000)
    ok('Home goes to the start', h.t < 0.06 && h.name === 'Germination' && h.bar === 'before bar 1' && h.now === '0:00', { t: h.t, name: h.name, bar: h.bar })
    await page.keyboard.press('End'); const e = await until(page, (s) => s.t > 126.9, 3000)
    ok('End goes to the end', e.t > 126.9 && e.name === 'Last light' && /^bar 74\.[1-4]$/.test(e.bar) && e.now === '2:06', { t: e.t, name: e.name, bar: e.bar, now: e.now })
    ok('the line tells a screen reader the time and the part', /^2:06 of 2:07, Last light$/.test(e.says), e.says)
    // The readout just before and just after each place where one part gives way to the next.
    const turns = []
    for (let i = 1; i < PARTS.length; i++) {
      const t = barStart(PARTS[i][0])
      await clickAt(t - 0.7); const before = await until(page, (s) => Math.abs(s.t - (t - 0.7)) < 0.2, 3000)
      await clickAt(t + 0.7); const after = await until(page, (s) => Math.abs(s.t - (t + 0.7)) < 0.2, 3000)
      turns.push({ bar: PARTS[i][0], before: before.name + ' ' + before.bar, after: after.name + ' ' + after.bar, fits: before.name === PARTS[i - 1][1] && before.bar === want(before.t).bar && before.cur.join() === PARTS[i - 1][1] && after.name === PARTS[i][1] && after.bar === want(after.t).bar && new RegExp('^bar ' + PARTS[i][0] + '\\.[12]$').test(after.bar) && after.cur.join() === PARTS[i][1] })
    }
    ok('at each of the seven turns the readout and the name under the line change with the film', turns.every((x) => x.fits), turns.map((x) => x.bar + ': ' + x.before + ' | ' + x.after))
    // The readout while the film plays through a turn: Frost begins on bar 17.
    await clickAt(barStart(17) - 1.2); await until(page, (s) => Math.abs(s.t - (barStart(17) - 1.2)) < 0.2, 3000)
    await page.click('#play')
    // The page writes the readout inside a frame, and frame callbacks run in the order they were asked for. This
    // reader starts a moment after the film does, so on every frame it reads after the page has written.
    await sleep(200)
    const seen = await page.evaluate((line) => new Promise((done) => {
      const v = document.getElementById('film'); const rows = []; const t0 = performance.now()
      const step = () => { rows.push([v.currentTime, document.querySelector('#part i').textContent, document.querySelector('#part span').textContent]); if (performance.now() - t0 < 2600) requestAnimationFrame(step); else done(rows) }
      requestAnimationFrame(step)
    }))
    // Every frame before the bar line must read Germination and every frame from the bar line on must read Frost.
    const line17 = barStart(17)
    const wrong = seen.filter((r) => (r[0] < line17 - 1e-4 ? r[1] !== 'Germination' || !/^bar 16\.[1-4]$/.test(r[2]) : r[1] !== 'Frost' || !/^bar 17\.[1-4]$/.test(r[2])))
    const firstFrost = seen.find((r) => r[1] === 'Frost'), lastGerm = [...seen].reverse().find((r) => r[1] === 'Germination')
    let gap = 0; for (let i = 1; i < seen.length; i++) gap = Math.max(gap, seen[i][0] - seen[i - 1][0])
    ok('while the film plays, the name turns from Germination to Frost on bar 17: no frame reads the old part after the bar line or the new one before it', seen.length > 100 && wrong.length === 0 && !!firstFrost && !!lastGerm && firstFrost[2] === 'bar 17.1' && lastGerm[2] === 'bar 16.4', { frames: seen.length, wrongFrames: wrong.length, lastGermination: lastGerm && +lastGerm[0].toFixed(3), firstFrost: firstFrost && +firstFrost[0].toFixed(3), barLine: +line17.toFixed(3), reads: firstFrost && firstFrost[2], longestStepBetweenFramesMs: Math.round(gap * 1000) })
    await page.click('#play')

    // 2. Links.
    await page.evaluate(() => window.scrollTo(0, 0))
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim().replace(/\s+/g, ' '), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), where: a.closest('.film-bar') ? 'bar' : a.closest('footer') ? 'foot' : a.closest('video') ? 'video' : a.closest('section') ? a.closest('section').getAttribute('aria-labelledby') : 'top' })))
    const live = links.filter((l) => /live/i.test(l.text) || /vercel/i.test(l.href || '') || l.where === 'bar')
    const liveWords = await page.evaluate(() => /live version/i.test(document.body.innerText))
    ok('no way to a live version stands on the page: no link under the film, none in the footer, and no words that name one', live.length === 0 && !liveWords && (await page.locator('.live-link').count()) === 0, { links: live, words: liveWords })
    const lic = links.filter((l) => l.href === 'https://openfontlicense.org/open-font-license-official-text/')
    ok('the font license link stands in the footer and opens in a new tab', lic.length === 1 && lic[0].where === 'foot' && lic[0].text === 'SIL Open Font License' && lic[0].target === '_blank', lic)
    ok('no other link leaves the page', links.filter((l) => /^https?:/.test(l.href)).length === 1, links.filter((l) => /^https?:/.test(l.href)).map((l) => l.href))
    for (const [text, id, from] of [['How it was checked', 'h-check', 'h-target'], ['Known limits', 'h-limits', 'h-target'], ['The film laid on its music', 'h-music', 'h-design']]) {
      const l = page.locator(`section[aria-labelledby="${from}"] a[href="#${id}"]`)
      const n = await l.count(); let r = null
      if (n === 1) { await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(900); r = await page.evaluate((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { hash: location.hash, top: Math.round(b.top), text: document.getElementById(id).textContent.trim() } }, id) }
      ok(`"${text}" in ${from} jumps to its heading, which lands in view`, n === 1 && r.hash === '#' + id && r.top >= 0 && r.top < 500 && (await l.textContent()).trim() === text && r.text.indexOf(text) >= 0, { count: n, r })
    }

    // 3. The short videos: they load when they come into view, play muted and looped, and stop when they leave.
    for (const id of ['loop', 'sketch']) {
      const file = SHORT[id], before = atFirst[id]
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'center' }), id)
      let v; const t0 = Date.now()
      while (Date.now() - t0 < 15000) { v = await page.evaluate((i) => { const x = document.getElementById(i); return { t: +x.currentTime.toFixed(2), paused: x.paused, muted: x.muted, loop: x.loop, blob: x.currentSrc.indexOf('blob:') === 0, dur: +x.duration.toFixed(2) } }, id); if (!v.paused && v.t > 0.4) break; await sleep(200) }
      // run it to its end and see it begin again
      await page.evaluate((i) => { const x = document.getElementById(i); x.currentTime = x.duration - 0.4 }, id); await sleep(1200)
      const looped = await page.evaluate((i) => { const x = document.getElementById(i); return { t: +x.currentTime.toFixed(2), paused: x.paused, ended: x.ended } }, id)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(700)
      const away = await page.evaluate((i) => { const x = document.getElementById(i); return { paused: x.paused } }, id)
      ok(`short video "${id}": untouched until seen, then plays muted, begins again at its end, and stops out of view`, !before.started && before.readyState === 0 && before.askedFor === 0 && asked.filter((n) => n === file).length === 1 && !v.paused && v.t > 0.4 && v.muted && v.loop && v.blob && !looped.paused && !looped.ended && looped.t < 1.5 && away.paused, { before, v, looped, away })
    }
    ok('no console or page errors through these flows', errors.length === 0, errors.slice(0, 4))
    await ctx.close()
  }

  // 4. Less motion: nothing starts by itself.
  {
    const { ctx, page, errors } = await open(plain, { reduce: true })
    await sleep(2500)
    const f = await st(page)
    const vids = []
    for (const id of ['loop', 'sketch']) { await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'center' }), id); await sleep(3500); vids.push(await page.evaluate((i) => { const x = document.getElementById(i); return { id: i, paused: x.paused, t: x.currentTime, loaded: x.currentSrc.indexOf('blob:') === 0, controls: x.controls } }, id)) }
    ok('less motion: the film and the two short videos wait for the reader, and each short video keeps its controls', f.paused && f.t === 0 && f.play === 'Play the film' && vids.every((v) => v.paused && v.t === 0 && v.controls), { film: { paused: f.paused, t: f.t }, vids })
    ok('less motion: no errors', errors.length === 0, errors.slice(0, 3))
    await ctx.close()
  }

  // 5. A film that cannot be loaded at all: neither as a plain file nor whole.
  {
    const { ctx, page, errors } = await open(plain, { route: (page) => page.route('**/life-of-a-sunflower-*.mp4', (route) => route.abort()) })
    const s = await until(page, (x) => /could not/.test(x.note), 20000)
    const shown = await page.evaluate(() => { const n = document.getElementById('note'); const b = n.getBoundingClientRect(); const bar = document.querySelector('.film-bar').getBoundingClientRect(); return { inBar: b.left >= bar.left && b.right <= bar.right + 0.5 && b.bottom <= bar.bottom, live: document.getElementById('film-live').textContent, poster: !!document.getElementById('film').getAttribute('poster'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth } })
    ok('a film that cannot be loaded: the page says so in the bar, where the readout stood, and the bar keeps its height', s.note === 'The film could not be loaded here.' && s.flag === 'yes' && s.barH === 141 && shown.inBar && shown.live === s.note && shown.poster && shown.over <= 0, { note: s.note, flag: s.flag, barH: s.barH, shown })
    await page.locator('.film-bar').screenshot({ path: `${OUT}/${tag}-cannot-load.png` })
    ok('and nothing breaks: only the refused requests are in the console', errors.every((e) => /ERR_FAILED|Failed to load resource/.test(e)), errors.slice(0, 4))
    await ctx.close()
  }
  await browser.close()
  console.log(results.every(Boolean) ? `ALL PASS (${results.length})` : `FAILED ${results.filter((x) => !x).length} of ${results.length}`)
  if (!results.every(Boolean)) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
