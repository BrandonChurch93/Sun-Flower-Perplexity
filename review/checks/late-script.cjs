// Times one load in which the browser refuses the film file and the page's script arrives late, after the refusal.
//   node review/checks/late-script.cjs <url> [script delay in ms] [seconds to watch]
// Prints, in seconds after the page arrived: the refusal, the script, the fetch of the whole film, the note
// "Loading the film", and the film playing. Passes when the fetch begins within 2 seconds of the script.
const { chromium } = require('playwright-core')
const [base, delay = '800', watch = '30'] = process.argv.slice(2)
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let t0 = Date.now()
  const at = () => +((Date.now() - t0) / 1000).toFixed(2)
  const seen = {}
  page.on('requestfailed', (r) => { if (/\.mp4/.test(r.url()) && r.resourceType() === 'media' && !seen.refused) seen.refused = at() })
  page.on('request', (r) => { if (/\.mp4/.test(r.url()) && r.resourceType() === 'fetch' && !seen.fetch) seen.fetch = at() })
  await page.route('**/*.mp4', (route) => (route.request().resourceType() === 'media' ? route.abort() : route.continue()))
  await page.route('**/review.js', async (route) => { await new Promise((r) => setTimeout(r, +delay)); seen.script = at(); route.continue() })
  t0 = Date.now()
  await page.goto(base, { waitUntil: 'commit' })
  while (Date.now() - t0 < +watch * 1000) {
    const s = await page.evaluate(() => { const v = document.getElementById('film'), n = document.getElementById('note'); return v ? { note: n ? n.textContent : '', blob: v.currentSrc.indexOf('blob:') === 0, paused: v.paused, t: v.currentTime } : null }).catch(() => null)
    if (s) {
      if (!seen.note && /Loading the film/.test(s.note)) seen.note = at()
      if (s.blob && !s.paused && s.t > 0.2) { seen.plays = at(); break }
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  await browser.close()
  const ok = seen.fetch !== undefined && seen.script !== undefined && seen.fetch - seen.script < 2 && seen.plays !== undefined
  const say = (k) => (seen[k] === undefined ? 'never' : seen[k] + ' s')
  console.log(`${ok ? 'PASS' : 'FAIL'}  refused ${say('refused')}, script ${say('script')}, whole film asked for ${say('fetch')}, note ${say('note')}, plays ${say('plays')}`)
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
