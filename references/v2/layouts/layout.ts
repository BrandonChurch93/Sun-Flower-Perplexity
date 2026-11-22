import fs from 'node:fs'
import path from 'node:path'
import { openSession } from '../../../tools/lib/render.ts'

const OUT = path.dirname(new URL(import.meta.url).pathname)
const shots: { name: string; world: string; frame: number; extra?: string }[] = [
  { name: 'open', world: 'dawn', frame: 0 },
  { name: 'frost', world: 'frost', frame: 360 },
  { name: 'climb', world: 'golden', frame: 620 },
  { name: 'storm', world: 'rain', frame: 849, extra: 'dolly=1.9&el=-2' },
  { name: 'break', world: 'golden', frame: 849, extra: 'dolly=1.9&el=-2' },
  { name: 'late', world: 'golden', frame: 1200 },
  { name: 'last', world: 'golden', frame: 1799 },
]
const only = process.argv.slice(2)
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue
  const file = path.join(OUT, `layout-${s.name}.png`)
  if (fs.existsSync(file)) continue
  const session = await openSession({ mode: 'capture', format: '16x9', assets: 'full', extra: `world=${s.world}&frame=${s.frame}${s.extra ? `&${s.extra}` : ''}`, what: 'layout' })
  try {
    const { png, seconds } = await session.render(s.frame, 'draft')
    fs.writeFileSync(file, png)
    console.log(`${s.name} · ${s.world} · frame ${s.frame} · ${seconds.toFixed(1)} s`)
  } finally {
    await session.close()
  }
}
console.log('done')
