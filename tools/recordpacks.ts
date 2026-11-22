import { filmNeeds, filmPacks, type Need } from './filmpacks.ts'
import { rel } from './lib/layout.ts'
import { recordSelection, type SubPack } from './lib/recordplan.ts'
import type { Pack, PackContext } from './pack.ts'
import { unitNeeds, unitPacks } from './unitpacks.ts'

const inner = (context: PackContext, sub: SubPack): PackContext => ({ ...context, unit: sub.unit, only: sub.critics })

export function recordNeeds(context: PackContext): Need[] {
  const tier = context.tier ?? 'final'
  const seen = new Set<string>()
  const out: Need[] = []
  for (const sub of recordSelection(context.only)) {
    const needs = sub.unit ? unitNeeds(sub.unit, tier, sub.critics) : filmNeeds(inner(context, sub))
    for (const need of needs) {
      if (seen.has(need.file)) continue
      seen.add(need.file)
      out.push(need)
    }
  }
  return out
}

export function renderLines(needs: Need[]): string[] {
  const groups = new Map<string, Need[]>()
  for (const need of needs) if (!need.have) groups.set(need.make, [...(groups.get(need.make) ?? []), need])
  let total = 0
  const lines = [...groups].map(([make, group]) => {
    const frames = new Set(group.flatMap((n) => n.frames)).size
    total += frames
    const first = group[0]
    return `missing · ${first.what} · ${[...new Set(group.map((n) => n.label))].join(' + ')} · ${first.tier} · ${first.format} · ${group.map((n) => rel(n.file)).join(' + ')} · ${frames} ${frames === 1 ? 'frame' : 'frames'} to make · ${make}`
  })
  const missing = needs.filter((n) => !n.have).length
  return [...lines, `${needs.length} files needed · ${needs.length - missing} here · ${missing} missing · ${lines.length} ${lines.length === 1 ? 'command' : 'commands'} · ${total} frames to make`]
}

export async function recordPacks(context: PackContext): Promise<Pack[]> {
  const selection = recordSelection(context.only)
  if (context.noRender) {
    const needs = recordNeeds(context)
    if (needs.some((n) => !n.have)) {
      for (const line of renderLines(needs)) console.log(`pack · ${line}`)
      throw new Error('the pack is not built: something it needs is missing and --no-render forbids making it')
    }
  }
  const out: Pack[] = []
  for (const sub of selection) {
    const built = sub.unit ? await unitPacks(inner(context, sub)) : await filmPacks(inner(context, sub))
    for (const pack of built) out.push({ ...pack, group: sub.name })
  }
  return out
}
