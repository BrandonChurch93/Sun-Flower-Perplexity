// What the page costs each second while the film plays and nobody touches it: the time the main thread spends in
// script, style and layout, and in all its tasks together. Passes under LIMIT milliseconds a second (150 unless set).
// node review/checks/cost.cjs <base url> [seconds] [width] [height]
const { chromium } = require('playwright-core')
const [base, secs = '8', w = '1440', h = '900'] = process.argv.slice(2)
const LIMIT = +process.env.LIMIT || 150
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h } })
  const page = await ctx.newPage()
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const t0 = Date.now()
  let plays = false
  while (Date.now() - t0 < 15000) { plays = await page.evaluate(() => { const v = document.getElementById('film'); return !v.paused && v.currentTime > 1 }); if (plays) break; await sleep(200) }
  await sleep(1500)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = (n) => m.find((x) => x.name === n).value; return { script: g('ScriptDuration'), layout: g('LayoutDuration'), style: g('RecalcStyleDuration'), layouts: g('LayoutCount'), styles: g('RecalcStyleCount'), task: g('TaskDuration') } }
  const m0 = await metrics(); await sleep(+secs * 1000); const m1 = await metrics()
  const per = (k, d = 2) => +((m1[k] - m0[k]) / +secs * (k === 'layouts' || k === 'styles' ? 1 : 1000)).toFixed(d)
  const all = per('task', 1)
  await browser.close()
  const pass = plays && all <= LIMIT
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${plays ? '' : 'the film did not play; '}all tasks ${all} ms a second (limit ${LIMIT}): script ${per('script')}, style ${per('style')}, layout ${per('layout')}; ${per('styles', 1)} style passes and ${per('layouts', 1)} layouts a second`)
  if (!pass) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
