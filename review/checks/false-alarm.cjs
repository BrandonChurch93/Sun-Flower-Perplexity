// Counts the loads in which the page fetches the whole film although the browser can play the plain file.
//   node review/checks/false-alarm.cjs <url> [loads set up on purpose] [loads left to chance]
// A film the browser has not begun on yet reads like one whose files were all turned down: nothing loaded,
// no file. A script that starts in that moment must wait and not fetch the whole film. A browser gets there
// by chance only now and then: in 1 of 150 loads in each of two counts, and in 2 of 40 in a third. So the
// check sets the moment up on purpose first: before the page's script runs, the film is swapped for a fresh
// copy of itself, which the browser cannot begin on until the script has finished its first run. Then the
// page is loaded as it is, and one added line only notes how the film read when the script started.
const { chromium } = require('playwright-core')
const [base, forced = '8', plain = '40'] = process.argv.slice(2)
const NOTE = "window.__atStart=(function(){var f=document.getElementById('film');return{rs:f.readyState,ns:f.networkState,cur:f.currentSrc||'',doc:document.readyState}})();\n"
const SWAP = "(function(){var f=document.getElementById('film'),c=f.cloneNode(true);f.parentNode.replaceChild(c,f);while(f.firstChild)f.removeChild(f.firstChild);f.removeAttribute('src');try{f.load()}catch(e){}})();\n"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const src = await (await fetch(new URL('review.js', base))).text()
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const load = async (body, wait) => {
    const page = await ctx.newPage()
    let whole = 0
    page.on('request', (r) => { if (/life-of-a-sunflower.*\.mp4/.test(r.url()) && r.resourceType() === 'fetch') whole++ })
    await page.route('**/review.js', (route) => route.fulfill({ contentType: 'text/javascript', body }))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await sleep(wait)
    const s = await page.evaluate(() => { const v = document.getElementById('film'); return { at: window.__atStart || null, plays: v.readyState > 0 && v.currentSrc.indexOf('blob:') !== 0 && /life-of-a-sunflower/.test(v.currentSrc), note: document.getElementById('note').textContent } })
    await page.close()
    return { whole, ...s, moment: !!s.at && s.at.rs === 0 && s.at.ns === 3 && s.at.cur === '' && s.at.doc !== 'complete' }
  }
  let failed = false
  const say = (ok, line, detail) => { if (!ok) failed = true; console.log((ok ? 'PASS  ' : 'FAIL  ') + line + (ok || !detail ? '' : '  ' + JSON.stringify(detail))) }

  const a = []
  for (let i = 0; i < +forced; i++) a.push(await load(SWAP + NOTE + src, 2500))
  const set = a.filter((r) => r.moment).length, wholeA = a.filter((r) => r.whole).length, playsA = a.filter((r) => r.plays && !r.note).length
  say(set === a.length && wholeA === 0 && playsA === a.length, `set up on purpose: in ${set} of ${a.length} loads the script started before the browser had begun on the film; the whole film was fetched in ${wholeA} of them, and the plain file loaded in ${playsA}`, a.filter((r) => !r.moment || r.whole || !r.plays || r.note)[0])

  const b = []
  for (let i = 0; i < +plain; i++) b.push(await load(NOTE + src, 900))
  const chance = b.filter((r) => r.moment).length, wholeB = b.filter((r) => r.whole).length
  say(wholeB === 0, `left to chance: in ${b.length} loads of the page as it is, the script started in that moment ${chance} times; the whole film was fetched in ${wholeB} loads`, b.filter((r) => r.whole)[0])

  await browser.close()
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
