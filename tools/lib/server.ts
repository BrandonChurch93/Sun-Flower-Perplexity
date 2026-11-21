import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
}

export interface Served { url: string; close: () => Promise<void> }

export function serve(root: string): Promise<Served> {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://localhost')
      let rel = decodeURIComponent(u.pathname)
      if (rel.endsWith('/')) rel += 'index.html'
      const file = path.join(root, rel)
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found')
        return
      }
      const stat = fs.statSync(file)
      const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
      if (range) {
        const start = range[1] ? Number(range[1]) : 0
        const end = range[2] ? Number(range[2]) : stat.size - 1
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' })
        fs.createReadStream(file, { start, end }).pipe(res)
        return
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
      fs.createReadStream(file).pipe(res)
    } catch (error) {
      res.writeHead(500).end(String(error))
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ url: `http://localhost:${port}`, close: () => new Promise<void>((done) => server.close(() => done())) })
    })
  })
}
