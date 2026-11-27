// No text under 12 px, nothing wider than the window, and the small labels: node review/checks/text-size.cjs <base url> [tag]
const { chromium } = require('playwright-core')
const OUT = require('./out.cjs')
const [base, tag = 'text'] = process.argv.slice(2)
let failed = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  for (const size of ['desk', 'phone']) {
    const phone = size === 'phone'
    const ctx = await browser.newContext({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y <= h; y += 500) { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(60) }
    await page.evaluate(() => document.fonts.ready)
    await sleep(500)
    const r = await page.evaluate(() => {
      const small = [], seen = new Set()
      const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
      for (const e of document.querySelectorAll('body *')) {
        if (!vis(e)) continue
        const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        const fs = parseFloat(getComputedStyle(e).fontSize)
        if (own && fs < 12) { const k = e.tagName + '.' + e.className + ' ' + fs; if (!seen.has(k)) { seen.add(k); small.push(k + ' "' + e.textContent.trim().slice(0, 20) + '"') } }
        for (const ps of ['::before', '::after']) { const s = getComputedStyle(e, ps); if (s.content && s.content !== 'none' && s.content !== 'normal' && s.content !== '""' && parseFloat(s.fontSize) < 12) { const k = e.tagName + '.' + e.className + ps + ' ' + s.fontSize; if (!seen.has(k)) { seen.add(k); small.push(k + ' ' + s.content.slice(0, 20)) } } }
      }
      const cw = document.documentElement.clientWidth
      const wide = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > cw + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.skip') }).map((e) => e.tagName + '.' + String(e.className).slice(0, 24)).slice(0, 6)
      // labels that touch or overlap on the ruler axis
      const ax = [...document.querySelectorAll('.ruler-axis span')].map((e) => e.getBoundingClientRect())
      let gap = 1e9; for (let i = 1; i < ax.length; i++) gap = Math.min(gap, ax[i].left - ax[i - 1].right)
      const axisBox = document.querySelector('.ruler-axis').getBoundingClientRect()
      const axisIn = ax.every((b) => b.left >= axisBox.left - 8 && b.right <= axisBox.right + 8 && b.bottom <= axisBox.bottom + 1)
      // pills on one line, tables inside their wrap
      const pills = [...document.querySelectorAll('.tag, .res')].filter((e) => e.getClientRects().length > 1).length
      const mini = [...document.querySelectorAll('table.mini')].map((t) => ({ w: Math.round(t.getBoundingClientRect().width), parent: Math.round(t.parentElement.getBoundingClientRect().width), scroll: t.parentElement.scrollWidth - t.parentElement.clientWidth }))
      return { small, over: document.documentElement.scrollWidth - cw, wide, axisGap: +gap.toFixed(1), axisIn, pillsWrapped: pills, mini, height: document.documentElement.scrollHeight }
    })
    console.log(size, JSON.stringify(r))
    const pass = r.small.length === 0 && r.over <= 0 && r.wide.length === 0 && r.axisGap > 0 && r.axisIn && r.pillsWrapped === 0 && r.mini.every((m) => m.scroll <= 0)
    if (!pass) failed++
    console.log((pass ? 'PASS ' : 'FAIL ') + size + ': no text under 12 px, nothing wider than the window, the bar numbers of the ruler apart, labels on one line')
    const shot = async (name, sel, nth) => { const l = page.locator(sel).nth(nth || 0); if (await l.count()) { await l.scrollIntoViewIfNeeded(); await sleep(250); await l.screenshot({ path: `${OUT}/${tag}-${size}-${name}.png` }) } else console.log('  no element for', name) }
    await shot('tag', 'figure:has(.tag)', 0)
    await shot('ruler', ':has(> .ruler-axis)', 0)
    await shot('key', '.ruler-key', 0)
    await shot('res', ':is(.table-wrap, table):has(.res)', 0)
    await shot('mini', 'table.mini', 0)
    await ctx.close()
  }
  await browser.close()
  if (failed) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
