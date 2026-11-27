// What a click or a finger lands on around the position line: node review/checks/hit-area.cjs <base url>
// The line must take its whole height, and must not take clicks meant for the film above it or the buttons below it.
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
let failed = 0
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  for (const size of ['phone', 'desk']) {
    const phone = size === 'phone'
    const ctx = await browser.newContext({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 600))
    const r = await page.evaluate(() => {
      const q = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1), left: +b.left.toFixed(1), w: +b.width.toFixed(1) } }
      const sc = document.getElementById('scrub'); const b = sc.getBoundingClientRect()
      const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : null }
      const mid = b.left + b.width / 2
      return { coarse: matchMedia('(pointer: coarse)').matches, scrub: q('#scrub'), track: q('#scrub-track'), row: q('#scrub-row'), film: q('#film'), play: q('#play'), bar: q('.film-bar'), aboveTop: hit(mid, b.top - 1), atTop: hit(mid, b.top + 1), atBottom: hit(mid, b.bottom - 1), belowBottom: hit(mid, b.bottom + 1), playTop: hit(document.getElementById('play').getBoundingClientRect().left + 20, document.getElementById('play').getBoundingClientRect().top + 1), filmBottom: hit(mid, document.getElementById('film').getBoundingClientRect().bottom - 2) }
    })
    console.log(size, JSON.stringify(r))
    const pass = r.atTop === 'scrub' && r.atBottom === 'scrub' && r.aboveTop !== 'scrub' && r.belowBottom !== 'scrub' && r.playTop === 'play' && r.filmBottom === 'film'
    if (!pass) failed++
    console.log((pass ? 'PASS ' : 'FAIL ') + size + ': the position line takes clicks over its own ' + r.scrub.h + ' px and nowhere else')
    await page.locator('.film-bar').screenshot({ path: `${OUT}/hit-${size}-bar.png` })
    await ctx.close()
  }
  await browser.close()
  if (failed) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
