// The ruler of "The film laid on its music" in narrow windows: node review/checks/ruler.cjs <base url>
// At 375, 351 and 320 px its bar numbers must stay inside the card and apart from each other.
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
let failed = 0
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  for (const w of [375, 351, 320]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.ruler-axis').scrollIntoViewIfNeeded(); await new Promise((r) => setTimeout(r, 400))
    const r = await page.evaluate(() => {
      const sp = [...document.querySelectorAll('.ruler-axis span')]; const a = sp[0].getBoundingClientRect(), z = sp[sp.length - 1].getBoundingClientRect()
      const clip = []; let e = sp[0].parentElement
      while (e && e !== document.documentElement) { const s = getComputedStyle(e); if (s.overflowX !== 'visible' || s.overflow !== 'visible') { const b = e.getBoundingClientRect(); clip.push({ el: e.tagName + '.' + String(e.className).slice(0, 20), overflow: s.overflow, left: +b.left.toFixed(1), right: +b.right.toFixed(1) }) } e = e.parentElement }
      let gap = 1e9; const bs = sp.map((s) => s.getBoundingClientRect()); for (let i = 1; i < bs.length; i++) gap = Math.min(gap, bs[i].left - bs[i - 1].right)
      const box = document.querySelector('.ruler-axis').getBoundingClientRect()
      return { firstLeft: +a.left.toFixed(1), lastRight: +z.right.toFixed(1), axisLeft: +box.left.toFixed(1), axisRight: +box.right.toFixed(1), viewport: document.documentElement.clientWidth, minGap: +gap.toFixed(1), clippingAncestors: clip, y: Math.round(box.top) }
    })
    console.log(w, JSON.stringify(r))
    const pass = r.minGap > 0 && r.firstLeft >= 0 && r.lastRight <= r.viewport && r.clippingAncestors.every((c) => r.firstLeft >= c.left && r.lastRight <= c.right)
    if (!pass) failed++
    console.log((pass ? 'PASS ' : 'FAIL ') + w + ' px: the bar numbers fit, smallest gap ' + r.minGap + ' px')
    if (w === 351) await page.screenshot({ path: `${OUT}/ruler-351.png`, clip: { x: 0, y: Math.max(0, r.y - 70), width: w, height: 110 } })
    await ctx.close()
  }
  await browser.close()
  if (failed) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
