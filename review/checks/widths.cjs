// Opens the page at 39 window sizes, from 2560 x 1440 down to 320 x 640 and three phones on their side, and
// reports every layout fault it finds.   node review/checks/widths.cjs <url>      SHOTS=1 also keeps stills
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
const [url] = process.argv.slice(2)
const shots = process.env.SHOTS === '1' ? OUT : ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sizes = [[2560, 1440], [1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1101, 800], [1100, 800], [1024, 768], [1001, 700], [1000, 700], [901, 700], [900, 700], [820, 1180], [768, 1024], [761, 900], [760, 900], [701, 800], [700, 800], [641, 800], [640, 800], [500, 800], [440, 900], [439, 900], [430, 932], [414, 896], [393, 852], [390, 844], [389, 800], [375, 812], [372, 800], [371, 800], [360, 740], [355, 700], [354, 700], [320, 640], [667, 375], [844, 390], [932, 430]]
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  let faults = 0
  for (const [w, h] of sizes) {
    const phone = w < 700 || h < 500
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
    page.on('pageerror', (e) => errors.push('pageerror ' + String(e).slice(0, 120)))
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await sleep(300)
    const r = await page.evaluate(() => {
      // Shown: it has a box of more than one pixel. What is kept for screen readers only is clipped to one pixel.
      const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 1 && b.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' }
      const textRects = (e) => { const out = []; for (const n of e.childNodes) { if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const b of rg.getClientRects()) out.push(b) } } return out }
      const hits = (a, b, pad) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom && b.top < a.bottom
      const pairs = (list, pad) => { let n = 0, min = 1e9; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { if (hits(list[i], list[j], pad)) n++; if (list[i].top < list[j].bottom && list[j].top < list[i].bottom) min = Math.min(min, Math.max(list[j].left - list[i].right, list[i].left - list[j].right)) } return { n, min: min === 1e9 ? null : +min.toFixed(1) } }
      const cw = document.documentElement.clientWidth
      const out = { over: document.documentElement.scrollWidth - cw }
      // names under the film's line
      const names = [...document.querySelectorAll('.scrub-names li')].filter(vis)
      out.names = names.length
      const track = document.getElementById('scrub-track').getBoundingClientRect()
      out.namesGap = pairs(names.map((e) => e.getBoundingClientRect()), 6)
      out.namesIn = names.every((e) => { const b = e.getBoundingClientRect(); return b.left >= track.left - 1 && b.right <= track.right + 1 })
      // the ruler's numbers and names
      const axis = document.querySelector('.ruler-axis'); const ab = axis.getBoundingClientRect(); const card = axis.closest('.card').getBoundingClientRect()
      const labels = []
      for (const sp of axis.querySelectorAll('span')) { for (const b of textRects(sp)) labels.push(b); const i = sp.querySelector('i'); if (i && vis(i)) labels.push(i.getBoundingClientRect()) }
      out.axisNames = [...axis.querySelectorAll('i')].filter(vis).length
      out.axisGap = pairs(labels, 5)
      out.axisIn = labels.every((b) => b.left >= card.left + 4 && b.right <= card.right - 4 && b.bottom <= ab.bottom + 1)
      // the film and its bar inside the first screen
      const bar = document.querySelector('.film-bar').getBoundingClientRect(); const film = document.querySelector('.film-frame').getBoundingClientRect()
      out.bar = Math.round(bar.height); out.film = Math.round(film.width) + 'x' + Math.round(film.height); out.firstScreen = Math.round(bar.bottom) + '/' + window.innerHeight
      // buttons
      const row = [...document.querySelectorAll('.film-buttons > :not(.sr-only)')].filter(vis).map((e) => e.getBoundingClientRect())
      out.rows = new Set(row.map((b) => Math.round(b.top))).size
      const pad = parseFloat(getComputedStyle(document.querySelector('.film-bar')).paddingLeft) || (cw - document.querySelector('.film-bar-in').getBoundingClientRect().width) / 2
      out.buttonsIn = row.every((b) => b.left >= pad - 0.6 && b.right <= cw - pad + 0.6)
      const kids = [...document.querySelectorAll('#play, #sound, #rung, #part, #now, #total')].filter(vis).map((e) => e.getBoundingClientRect())
      out.barTouch = pairs(kids, 4).n
      // the size of the file: shown beside the buttons from 440 px up, kept for screen readers under that
      const rung = document.getElementById('rung')
      out.pill = rung.textContent.trim() ? (vis(rung) ? 'shown' : 'read only') : 'empty'
      // the title block
      const title = document.querySelector('.title').getBoundingClientRect(); const mark = document.querySelector('.mark').getBoundingClientRect(); const lede = document.querySelector('.lede').getBoundingClientRect()
      out.title = Math.round(parseFloat(getComputedStyle(document.querySelector('.title')).fontSize)); out.titleLines = Math.round(title.height / (parseFloat(getComputedStyle(document.querySelector('.title')).fontSize) * 0.96))
      out.mark = Math.round(mark.width); out.markBeside = mark.top < lede.bottom; out.ledeW = Math.round(lede.width)
      const span = document.querySelector('.title span'); const rg = document.createRange(); rg.selectNodeContents(span); const sb = rg.getBoundingClientRect()
      out.titleHitsMark = out.markBeside && sb.right > mark.left - 12
      // the end of the page
      const foot = document.querySelector('.foot').getBoundingClientRect(); const sun = document.querySelector('.foot-sun').getBoundingClientRect()
      const words = [...document.querySelectorAll('.foot p')].flatMap((p) => { const g = document.createRange(); g.selectNodeContents(p); return [...g.getClientRects()] })
      const sunShown = { left: sun.left + sun.width * 0.03, right: sun.right - sun.width * 0.03, top: sun.top + sun.height * 0.02, bottom: foot.bottom }
      out.footH = Math.round(foot.height); out.sunW = Math.round(sun.width)
      out.sunHitsWords = words.some((b) => hits(b, sunShown, 10))
      out.sunIn = sun.left >= 0 && sun.right <= cw + 0.5
      // sections' headings on one or two lines
      out.h2Lines = Math.max(...[...document.querySelectorAll('h2')].map((e) => Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).fontSize) * 1.06))))
      return out
    })
    const bad = []
    if (r.over > 0) bad.push('sideways overflow ' + r.over)
    if (r.names && (r.namesGap.n || !r.namesIn)) bad.push('names under the line touch or leave it')
    if (r.axisGap.n || !r.axisIn) bad.push('ruler labels touch or leave the card')
    if (!r.buttonsIn) bad.push('a button leaves the bar')
    if (r.barTouch) bad.push('things in the bar touch')
    if (r.pill !== (w >= 440 ? 'shown' : 'read only')) bad.push('the size of the file is ' + r.pill + ', and should be ' + (w >= 440 ? 'shown' : 'read only'))
    if (r.titleHitsMark) bad.push('title touches the mark')
    if (r.sunHitsWords || !r.sunIn) bad.push('the disc in the footer touches the words or leaves the window')
    if (w >= 641 && +r.firstScreen.split('/')[0] > h) bad.push('film and bar taller than the window')
    if (errors.length) bad.push('errors ' + JSON.stringify(errors))
    faults += bad.length
    console.log(`${w}x${h}`, bad.length ? 'FAULT ' + bad.join('; ') : 'ok', JSON.stringify(r))
    if (shots && [1920, 1101, 1024, 1000, 820, 768, 641, 360, 320, 844].includes(w)) {
      await page.screenshot({ path: `${shots}/w${w}-top.png` })
      await page.evaluate(() => { const e = document.querySelector('.intro'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 20) }); await sleep(200)
      await page.screenshot({ path: `${shots}/w${w}-title.png` })
      await page.evaluate(() => { const e = document.querySelector('#h-music'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 30) }); await sleep(200)
      await page.screenshot({ path: `${shots}/w${w}-music.png` })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(300)
      await page.screenshot({ path: `${shots}/w${w}-end.png` })
    }
    await ctx.close()
  }
  await browser.close()
  console.log(faults ? `FAIL  ${faults} faults over ${sizes.length} window sizes` : `PASS  no fault at ${sizes.length} window sizes`)
  if (faults) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
