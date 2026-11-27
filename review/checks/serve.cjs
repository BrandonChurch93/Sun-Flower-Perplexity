// Local static server for the page and its checks: node review/checks/serve.cjs <folder> <port>
// NORANGE=1 answers like the public host: 200 to every request, no byte ranges, no length on big files.
// KBPS=n paces big video files to n kilobits a second.
const http = require('http'), fs = require('fs'), path = require('path')
const root = path.resolve(process.argv[2] || '.'), port = +process.argv[3] || 8080
const NORANGE = process.env.NORANGE === '1', KBPS = +process.env.KBPS || 0
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp4': 'video/mp4', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'
  const f = path.join(root, p)
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found') }
  const size = fs.statSync(f).size, type = types[path.extname(f)] || 'application/octet-stream'
  const r = !NORANGE && req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range)
  let stream
  if (r) {
    const start = r[1] ? +r[1] : 0, end = r[2] ? Math.min(+r[2], size - 1) : size - 1
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' })
    stream = fs.createReadStream(f, { start, end, highWaterMark: 65536 })
  } else {
    const h = { 'Content-Type': type, 'Cache-Control': 'no-store' }
    if (!NORANGE) h['Accept-Ranges'] = 'bytes'
    if (!(NORANGE && size > 10e6)) h['Content-Length'] = size
    res.writeHead(200, h)
    stream = fs.createReadStream(f, { highWaterMark: 65536 })
  }
  if (KBPS && type === 'video/mp4' && size > 10e6) {
    stream.on('data', (c) => { stream.pause(); res.write(c); setTimeout(() => stream.resume(), c.length / (KBPS * 125) * 1000) })
    stream.on('end', () => res.end())
    res.on('close', () => stream.destroy())
  } else stream.pipe(res)
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port, NORANGE ? '(no ranges)' : '(ranges)', KBPS ? KBPS + ' kbps' : ''))
