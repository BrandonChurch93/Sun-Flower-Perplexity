// Counts the loads in which the page misses that the browser refused the film file.
//   node review/checks/race-trace.cjs <url> [runs]        ALL=1 prints the trace of every load
// Every film request by the video element is refused. The page's script is given two extra log lines, so
// the order of things can be read: the refusal, the script's start, and the fetch of the whole film.
// A load counts as missed when that fetch has not begun 1.5 seconds after the page arrived.
const { chromium } = require('playwright-core')
const [base, runs = '40'] = process.argv.slice(2)
;(async () => {
  let src = await (await fetch(new URL('review.js', base))).text()
  const marks = ["    var NO_FILE = 3 // HTMLMediaElement.NETWORK_NO_SOURCE\n", "    film.addEventListener('error', refused)\n"]
  const mark = marks.find((m) => src.includes(m))
  if (!mark || !src.includes('    var refused = function () {\n')) throw new Error('review.js has changed: the lines this script hooks into are gone')
  src = src.replace(mark, mark + "    console.log('TRACE script ns=' + film.networkState + ' rs=' + film.readyState + ' err=' + (film.error && film.error.code) + ' cur=' + (film.currentSrc || '').split('/').pop());\n    Array.prototype.forEach.call(film.querySelectorAll('source'), function (s, i) { s.addEventListener('error', function () { console.log('TRACE source ' + i + ' error ns=' + film.networkState) }) });\n")
  src = src.replace('    var refused = function () {\n', "    var refused = function () {\n      console.log('TRACE refused() ns=' + film.networkState + ' rs=' + film.readyState);\n")
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] })
  const tally = { runs: 0, missed: 0, refusedBeforeScript: 0 }
  for (let i = 0; i < +runs; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    let t0 = Date.now()
    const at = () => ((Date.now() - t0) / 1000).toFixed(3)
    const log = []
    const name = (r) => r.url().split('/').pop().replace('life-of-a-sunflower-', '')
    page.on('console', (m) => { if (/^TRACE/.test(m.text())) log.push(at() + ' ' + m.text().slice(6)) })
    page.on('requestfailed', (r) => { if (/\.mp4/.test(r.url())) log.push(at() + ' failed ' + r.resourceType() + ' ' + name(r)) })
    page.on('request', (r) => { if (/\.mp4/.test(r.url())) log.push(at() + ' request ' + r.resourceType() + ' ' + name(r)) })
    await page.route('**/*.mp4', (route) => (route.request().resourceType() === 'media' ? route.abort() : route.continue()))
    await page.route('**/review.js', (route) => route.fulfill({ contentType: 'text/javascript', body: src }))
    t0 = Date.now()
    await page.goto(base, { waitUntil: 'commit' })
    await new Promise((r) => setTimeout(r, 1500))
    const whole = log.some((l) => / request fetch /.test(l))
    const script = log.findIndex((l) => / script /.test(l)), refusal = log.findIndex((l) => / failed media /.test(l))
    tally.runs++
    if (!whole) tally.missed++
    if (refusal >= 0 && script > refusal) tally.refusedBeforeScript++
    if (!whole || process.env.ALL) console.log((whole ? 'ok     ' : 'MISSED ') + log.join(' | '))
    await ctx.close()
  }
  await browser.close()
  console.log(`${tally.missed === 0 ? 'PASS' : 'FAIL'}  ${tally.missed} of ${tally.runs} loads missed the refusal; in ${tally.refusedBeforeScript} the refusal came before the script began`)
  process.exit(tally.missed === 0 ? 0 : 1)
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
