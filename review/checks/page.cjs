// Contrast, alt text, heading order, focus rings and touch sizes: node review/checks/page.cjs <base url>
const { chromium } = require('playwright-core')
let failed = 0
const say = (pass, what) => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + what) }
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  for (const size of ['desk', 'phone']) {
    const phone = size === 'phone'
    const ctx = await browser.newContext({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready)
    const r = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
      const bgOf = (e) => { const layers = []; let hasImage = false; while (e) { const s = getComputedStyle(e); if (s.backgroundImage && s.backgroundImage !== 'none') hasImage = true; const c = parse(s.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break } e = e.parentElement } let base = { r: 0, g: 0, b: 0, a: 1 }; if (layers.length && layers[layers.length - 1].a >= 1) base = layers.pop(); for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base); return { c: base, hasImage } }
      const low = [], seen = new Set()
      for (const e of document.querySelectorAll('body *')) {
        const b = e.getBoundingClientRect(); const s = getComputedStyle(e)
        if (!(b.width > 0 && b.height > 0) || s.visibility === 'hidden' || e.closest('[hidden], [aria-hidden="true"] canvas')) continue
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
        const fg0 = parse(s.color); if (!fg0) continue
        const bg = bgOf(e); const fg = over(fg0, bg.c)
        const l1 = lum(fg), l2 = lum(bg.c); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const fs = parseFloat(s.fontSize); const big = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700)
        if (ratio < (big ? 3 : 4.5)) { const k = e.tagName + '.' + String(e.className).slice(0, 18) + ' ' + s.color; if (!seen.has(k)) { seen.add(k); low.push({ el: e.tagName + '.' + String(e.className).slice(0, 18), text: e.textContent.trim().slice(0, 18), ratio: +ratio.toFixed(2), fs, image: bg.hasImage }) } }
      }
      const imgs = [...document.images]
      const hs = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => +h.tagName[1]); let skips = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skips++
      const touch = [...document.querySelectorAll('button, #scrub')].map((e) => { const b = e.getBoundingClientRect(); return { el: e.id || e.textContent.trim().slice(0, 16), w: Math.round(b.width), h: Math.round(b.height) } })
      return { low, pictures: imgs.length, noAlt: imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).length, shortAlt: imgs.filter((i) => (i.getAttribute('alt') || '').trim().length < 12).length, h1: document.querySelectorAll('h1').length, headingSkips: skips, lang: document.documentElement.lang, title: document.title, desc: (document.querySelector('meta[name=description]') || {}).content, viewport: (document.querySelector('meta[name=viewport]') || {}).content, touch, videoLabels: [...document.querySelectorAll('video')].filter((v) => !v.getAttribute('aria-label')).length }
    })
    console.log(size, JSON.stringify(r))
    say(r.low.length === 0, size + ': no text below the contrast floor (4.5 to 1, or 3 to 1 for large text)')
    say(r.noAlt === 0 && r.shortAlt === 0 && r.videoLabels === 0, size + ': all ' + r.pictures + ' pictures and every video carry a description')
    say(r.h1 === 1 && r.headingSkips === 0 && r.lang === 'en', size + ': one main heading, no heading level skipped, language set')
    say(r.touch.filter((t) => t.el !== 'scrub').every((t) => t.h >= 44) && r.touch.filter((t) => t.el === 'scrub').every((t) => t.h >= (phone ? 40 : 24)), size + ': the buttons are at least 44 px high, the position line at least ' + (phone ? 40 : 24))
    // keyboard: tab through the first controls and read the outline
    if (!phone) {
      const f = []
      for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); f.push(await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return (e.id || e.textContent.trim().slice(0, 14)) + ' [' + s.outlineStyle + ' ' + s.outlineWidth + (s.boxShadow !== 'none' ? ' +shadow' : '') + ']' })) }
      console.log('tab order', JSON.stringify(f))
      say(f.slice(0, 5).every((x) => /\[solid 2px/.test(x)), 'desk: the first five stops of the Tab key each show a focus ring')
    }
    await ctx.close()
  }
  await browser.close()
  if (failed) process.exitCode = 1
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
