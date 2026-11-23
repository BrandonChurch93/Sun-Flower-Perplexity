import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch, openPage } from '../../lib/browser.ts'
import { OUT } from '../lib/report.ts'

const VIEWS: [string, number, number, string][] = [
  ['film', 1440, 1000, '#film'],
  ['looks', 1440, 1000, '#looks'],
  ['sections', 1440, 1000, '#sections'],
  ['checks', 1440, 1400, '#checks'],
  ['narrow', 375, 800, '#film'],
]

// Pictures of the review page as a person sees it, part by part, with the film stopped a little way into the storm.
export async function shots(): Promise<string[]> {
  const browser = await launch()
  const out: string[] = []
  try {
    for (const [name, width, height, anchor] of VIEWS) {
      const page = await openPage(browser, width, height)
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.goto(pathToFileURL(path.join(OUT, 'review', 'index.html')).href)
      await page.evaluate(async (to) => {
        const v = document.querySelector('video') as HTMLVideoElement
        if (v.getAttribute('src')) {
          if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
          v.currentTime = 57.6
          await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
        }
        document.documentElement.style.scrollBehavior = 'auto'
        const first = document.querySelector('#check-list details')
        if (first) (first as HTMLDetailsElement).open = true
        for (const img of document.querySelectorAll('img')) img.loading = 'eager'
        await Promise.all([...document.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })))))
        ;(document.querySelector(to) as HTMLElement).scrollIntoView()
        if (to === '#film') window.scrollTo(0, 0)
      }, anchor)
      await page.waitForTimeout(600)
      const file = path.join(OUT, `review-${name}.jpg`)
      await page.screenshot({ path: file, type: 'jpeg', quality: 85 })
      out.push(file)
      if (errors.length) throw new Error(`the review page threw: ${errors.join('; ')}`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
  return out
}
