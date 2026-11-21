import fs from 'node:fs'
import { PROGRESS_FILE } from './paths.ts'

export function readProgress(): string {
  return fs.readFileSync(PROGRESS_FILE, 'utf8')
}

export function writeProgress(text: string): void {
  fs.writeFileSync(PROGRESS_FILE, text)
}

export function setField(text: string, name: string, value: string): string {
  const re = new RegExp(`^- ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: .*$`, 'm')
  if (!re.test(text)) throw new Error(`PROGRESS.md has no field "${name}"`)
  return text.replace(re, () => `- ${name}: ${value}`)
}

export function getField(text: string, name: string): string | null {
  const m = text.match(new RegExp(`^- ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (.*)$`, 'm'))
  return m ? m[1].trim() : null
}

function sectionRange(text: string, title: string): [number, number] {
  const head = `## ${title}\n`
  const start = text.indexOf(head)
  if (start < 0) throw new Error(`PROGRESS.md has no section "${title}"`)
  const bodyStart = start + head.length
  const next = text.indexOf('\n## ', bodyStart)
  return [bodyStart, next < 0 ? text.length : next + 1]
}

export function getSection(text: string, title: string): string {
  const [a, b] = sectionRange(text, title)
  return text.slice(a, b)
}

export function setSection(text: string, title: string, body: string): string {
  const [a, b] = sectionRange(text, title)
  return text.slice(0, a) + '\n' + body.trim() + '\n\n' + text.slice(b)
}

export function replaceInSection(text: string, title: string, find: string | RegExp, replacement: string): string {
  const [a, b] = sectionRange(text, title)
  const body = text.slice(a, b)
  const next = typeof find === 'string' ? body.split(find).join(replacement) : body.replace(find, () => replacement)
  return text.slice(0, a) + next + text.slice(b)
}

export function appendToSection(text: string, title: string, line: string): string {
  const [a, b] = sectionRange(text, title)
  let body = text.slice(a, b).replace(/\n(None yet\.|None\.|Not recorded yet\.|Not measured yet\.|Not reached yet\.)\n/, '\n')
  body = body.replace(/\s+$/, '') + '\n' + line.trim() + '\n\n'
  if (!body.startsWith('\n')) body = '\n' + body
  return text.slice(0, a) + body + text.slice(b)
}

export function donePhases(text: string): number[] {
  const body = getSection(text, 'Phases')
  const out: number[] = []
  for (const m of body.matchAll(/^\| (\d+) · [^|]*\| ([^|]*)\|/gm)) if (m[2].trim() === 'done') out.push(Number(m[1]))
  return out
}
