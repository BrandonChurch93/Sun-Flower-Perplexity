import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function isMain(url: string): boolean {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(url))
}
