// What a stopped export has already made, kept in the browser's private file system so the next start goes on from there.
// Frames are kept in closed groups, each starting on a key frame. Only whole groups count.
export interface StoredChunk { key: boolean; timestamp: number; duration: number; data: Uint8Array }
export interface StoreMeta { codec: string; description: string | null; frames: number; group: number }

const ROOT = 'export'
const HEAD = 21

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export function describe(description: AllowSharedBufferSource | undefined): string | null {
  if (!description) return null
  const bytes = description instanceof ArrayBuffer || description instanceof SharedArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
  return hex(bytes)
}

export function undescribe(text: string | null): Uint8Array | undefined {
  if (text === null) return undefined
  const out = new Uint8Array(text.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  return out
}

// The name of a store: everything that decides what is in the file. Another build, format, tier, range or encoder is another store.
export async function storeId(parts: (string | number)[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('|'))
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).slice(0, 24)
}

export function pack(chunks: StoredChunk[]): Uint8Array {
  let size = 4
  for (const c of chunks) size += HEAD + c.data.byteLength
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  view.setUint32(0, chunks.length)
  let at = 4
  for (const c of chunks) {
    view.setUint8(at, c.key ? 1 : 0)
    view.setFloat64(at + 1, c.timestamp)
    view.setFloat64(at + 9, c.duration)
    view.setUint32(at + 17, c.data.byteLength)
    out.set(c.data, at + HEAD)
    at += HEAD + c.data.byteLength
  }
  return out
}

// The chunks of one group, or null when the bytes are not a whole group.
export function unpack(bytes: Uint8Array): StoredChunk[] | null {
  if (bytes.byteLength < 4) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(0)
  const out: StoredChunk[] = []
  let at = 4
  for (let i = 0; i < count; i++) {
    if (at + HEAD > bytes.byteLength) return null
    const length = view.getUint32(at + 17)
    if (at + HEAD + length > bytes.byteLength) return null
    out.push({ key: view.getUint8(at) === 1, timestamp: view.getFloat64(at + 1), duration: view.getFloat64(at + 9), data: bytes.slice(at + HEAD, at + HEAD + length) })
    at += HEAD + length
  }
  return at === bytes.byteLength ? out : null
}

const groupName = (index: number): string => `group-${String(index).padStart(5, '0')}.bin`

export class Store {
  private constructor(private readonly root: FileSystemDirectoryHandle, private readonly dir: FileSystemDirectoryHandle, private readonly id: string) {}

  // Null where the browser has no private file system: the export still runs, it only cannot be continued.
  static async open(id: string): Promise<Store | null> {
    try {
      const top = await navigator.storage.getDirectory()
      const root = await top.getDirectoryHandle(ROOT, { create: true })
      return new Store(root, await root.getDirectoryHandle(id, { create: true }), id)
    } catch {
      return null
    }
  }

  private async read(name: string): Promise<Uint8Array | null> {
    try {
      const file = await (await this.dir.getFileHandle(name)).getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return null
    }
  }

  private async write(name: string, bytes: Uint8Array | string): Promise<void> {
    const handle = await this.dir.getFileHandle(name, { create: true })
    const out = await handle.createWritable()
    await out.write(bytes as FileSystemWriteChunkType)
    await out.close()
  }

  async meta(): Promise<StoreMeta | null> {
    const bytes = await this.read('meta.json')
    if (!bytes) return null
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as StoreMeta
    } catch {
      return null
    }
  }

  writeMeta(meta: StoreMeta): Promise<void> {
    return this.write('meta.json', JSON.stringify(meta))
  }

  async group(index: number, frames: number): Promise<StoredChunk[] | null> {
    const bytes = await this.read(groupName(index))
    const chunks = bytes ? unpack(bytes) : null
    return chunks && chunks.length === frames && chunks[0].key ? chunks : null
  }

  writeGroup(index: number, chunks: StoredChunk[]): Promise<void> {
    return this.write(groupName(index), pack(chunks))
  }

  // Removes this store, and every other one: a stopped export of other settings is not kept for ever.
  async clear(): Promise<void> {
    try {
      const names: string[] = []
      for await (const name of (this.root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
      for (const name of names) await this.root.removeEntry(name, { recursive: true })
      await this.root.getDirectoryHandle(this.id, { create: true })
    } catch {}
  }
}
