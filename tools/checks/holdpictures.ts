import type { Args } from '../lib/args.ts'
import type { Finding } from './lib/report.ts'

export interface PictureProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; data: unknown }

export async function pictureProof(_args: Args, _broken: string | null): Promise<PictureProof> {
  return { findings: [{ ok: true, expected: true, what: 'the proof by the picture is not built yet: this run is the proof by the clock alone' }], complete: false, pictures: [], data: null }
}
