export type Args = Record<string, string | boolean>

export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1)
      continue
    }
    const name = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[name] = next
      i++
    } else out[name] = true
  }
  return out
}

export function str(args: Args, name: string, fallback?: string): string {
  const v = args[name]
  if (typeof v === 'string') return v
  if (fallback !== undefined) return fallback
  throw new Error(`missing --${name}`)
}

export function num(args: Args, name: string, fallback?: number): number {
  const v = args[name]
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  if (fallback !== undefined) return fallback
  throw new Error(`missing --${name}`)
}

export function flag(args: Args, name: string): boolean {
  return args[name] === true || args[name] === 'true'
}
