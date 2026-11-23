const D = JSON.parse(document.getElementById('data').textContent)
const $ = (id) => document.getElementById(id)
const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const svg = (tag, attrs, text) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  if (text !== undefined) e.textContent = text
  return e
}
const FRAME = 1 / D.fps
const barLength = D.bars[1].t - D.bars[0].t
const barAt = (t) => 1 + (t - D.bars[0].t) / barLength
const frameAt = (t) => Math.min(D.frames - 1, Math.max(0, Math.floor(t * D.fps + 1e-6)))
const sectionAt = (f) => D.sections.find((s) => f >= s.firstFrame && f <= s.lastFrame) || D.sections[D.sections.length - 1]
function place(t) {
  const b = barAt(t)
  if (b < 1) return 'before bar 1'
  const bar = Math.floor(b + 1e-6)
  const beat = Math.floor((b - bar) * D.beatsPerBar + 1e-6) + 1
  return `bar ${bar} beat ${beat}`
}
const verdictOf = (r) => (!r ? ['not run', 'none'] : !r.ok ? ['FAIL', 'fail'] : r.complete ? ['PASS', 'pass'] : ['PASS SO FAR', 'sofar'])

$('title').textContent = `${D.name}: the checks and the film`
$('stamp').textContent = `Built ${D.built.replace('T', ' ').slice(0, 16)} UTC from what is in out/ · film ${D.engineHash} · ${D.frames} frames, ${D.fps} a second, ${D.seconds} s`
for (const c of D.checks) {
  const [word, cls] = verdictOf(c.result)
  const a = el('a', 'chip')
  a.href = `#check-${c.name}`
  a.append(el('span', '', c.name), el('span', cls, word))
  $('chips').append(a)
}

const video = $('video')
const audio = $('audio')
const timeline = $('timeline')
const W = 1500
const H = 84
const x = (t) => (t / D.seconds) * W
timeline.setAttribute('viewBox', `0 0 ${W} ${H}`)
timeline.setAttribute('preserveAspectRatio', 'none')
timeline.setAttribute('aria-valuemax', String(D.frames - 1))
const COLORS = { grow: '#3f6b4a', hold: '#44566e', bloom: '#8a6a2a', field: '#6b4f3a' }
for (const s of D.sections) {
  timeline.append(svg('rect', { x: x(s.start), y: 18, width: Math.max(1, x(s.end) - x(s.start) - 1), height: 34, fill: COLORS[s.kind] || '#444' }))
  if (x(s.end) - x(s.start) > 60) timeline.append(svg('text', { x: x(s.start) + 5, y: 39, class: 'name' }, s.kind === 'hold' ? `${s.name} · hold` : s.name))
}
const edges = new Set(D.sections.map((s) => s.fromBar))
for (const b of D.bars) {
  const edge = edges.has(b.n)
  const four = (b.n - 1) % 4 === 0
  timeline.append(svg('line', { x1: x(b.t), x2: x(b.t), y1: edge ? 14 : four ? 52 : 56, y2: 62, stroke: edge ? '#dedcd5' : four ? '#8a8b87' : '#55585b', 'stroke-width': 1 }))
  if (edge || four) timeline.append(svg('text', { x: x(b.t) + 3, y: edge ? 12 : 74 }, String(b.n)))
}
for (const l of D.looks) {
  const m = svg('path', { d: `M ${x(l.seconds) - 4} 62 L ${x(l.seconds) + 4} 62 L ${x(l.seconds)} 54 Z`, fill: '#e9c46a' })
  m.append(svg('title', {}, `look ${l.id}, ${l.bar}`))
  timeline.append(m)
}
const head = svg('line', { x1: 0, x2: 0, y1: 0, y2: H, stroke: '#fff', 'stroke-width': 1.5 })
timeline.append(head)

let shown = -1
function show() {
  const t = video.currentTime || 0
  const f = frameAt(t)
  head.setAttribute('x1', x(t))
  head.setAttribute('x2', x(t))
  if (f === shown) return
  shown = f
  const s = sectionAt(f)
  $('readout').textContent = `${place(t)} · ${t.toFixed(3)} s · frame ${f} · ${s.name}${s.kind === 'hold' ? ' (hold: nothing grows)' : ''}`
  timeline.setAttribute('aria-valuenow', String(f))
  timeline.setAttribute('aria-valuetext', `${place(t)}, ${s.name}`)
}
function seek(t) {
  video.currentTime = Math.min(D.seconds - FRAME / 2, Math.max(0, t))
  if (audio.src) audio.currentTime = video.currentTime
  show()
}
const seekFrame = (f) => seek((Math.min(D.frames - 1, Math.max(0, f)) + 0.5) * FRAME)
function toggle() {
  if (video.paused) video.play()
  else video.pause()
}
if (D.film) {
  video.src = D.film.file
  $('film-note').textContent = D.film.note
} else {
  $('film-note').textContent = 'No frame of the film has been drawn yet, so there is no film here. The timeline still shows where the bars and the sections fall.'
}
video.addEventListener('play', () => {
  $('play').textContent = 'Pause'
  if (audio.src) {
    audio.currentTime = video.currentTime
    audio.play()
  }
})
video.addEventListener('pause', () => {
  $('play').textContent = 'Play'
  audio.pause()
})
video.addEventListener('seeked', () => {
  if (audio.src) audio.currentTime = video.currentTime
  show()
})
video.addEventListener('click', toggle)
function tick() {
  show()
  // The picture leads. If the sound has drifted by more than two frames it is put back.
  if (audio.src && !video.paused && Math.abs(audio.currentTime - video.currentTime) > 2 * FRAME) audio.currentTime = video.currentTime
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
$('play').addEventListener('click', toggle)
$('back').addEventListener('click', () => seekFrame(frameAt(video.currentTime) - 1))
$('forward').addEventListener('click', () => seekFrame(frameAt(video.currentTime) + 1))
const timeOf = (e) => {
  const r = timeline.getBoundingClientRect()
  return ((e.clientX - r.left) / r.width) * D.seconds
}
let dragging = false
timeline.addEventListener('pointerdown', (e) => {
  dragging = true
  timeline.setPointerCapture(e.pointerId)
  seek(timeOf(e))
})
timeline.addEventListener('pointermove', (e) => {
  if (dragging) seek(timeOf(e))
})
timeline.addEventListener('pointerup', () => {
  dragging = false
})
function keys(e) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return
  const here = video.currentTime
  if (e.key === ' ') toggle()
  else if (e.key === 'ArrowLeft') e.shiftKey ? seek(D.bars[0].t + (Math.ceil(barAt(here) - 1e-3) - 2) * barLength + FRAME / 2) : seekFrame(frameAt(here) - 1)
  else if (e.key === 'ArrowRight') e.shiftKey ? seek(D.bars[0].t + Math.floor(barAt(here) + 1e-3) * barLength + FRAME / 2) : seekFrame(frameAt(here) + 1)
  else return
  e.preventDefault()
}
document.addEventListener('keydown', keys)
$('audio-file').addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return
  if (audio.src) URL.revokeObjectURL(audio.src)
  audio.src = URL.createObjectURL(file)
  audio.currentTime = video.currentTime
  video.muted = true
  $('audio-note').textContent = `Playing "${file.name}" in step with the picture from your disk. Nothing was uploaded. The film is cut to "${D.track}".`
  if (!video.paused) audio.play()
})

for (const l of D.looks) {
  const row = el('article', 'look')
  const h = el('header')
  h.append(el('h3', '', l.id), el('span', 'mono quiet', `${l.section} · ${l.bar} · ${l.seconds.toFixed(3)} s · frame ${l.frame}`))
  row.append(h)
  const side = (file, alt, caption, missing) => {
    if (!file) return el('div', 'gap', missing)
    const fig = el('figure')
    const img = el('img')
    img.src = file
    img.alt = alt
    img.loading = 'lazy'
    img.decoding = 'async'
    img.addEventListener('click', () => {
      seekFrame(l.frame)
      $('film').scrollIntoView()
    })
    fig.append(img, el('figcaption', '', caption))
    return fig
  }
  row.append(side(l.film, `The film at frame ${l.frame}, the look ${l.id}`, `the film, frame ${l.frame} · ${l.source}`, 'this frame of the film is not drawn yet'))
  row.append(side(l.reference, `The reference for the look ${l.id}`, `the reference · ${l.referencePath}`, `the reference ${l.referencePath} is not there`))
  $('look-list').append(row)
}

for (const s of D.sections) {
  const card = el('article', 'card')
  if (s.clip) {
    const v = el('video')
    v.src = s.clip
    v.muted = true
    v.loop = true
    v.controls = true
    v.playsInline = true
    v.preload = 'metadata'
    card.append(v)
  } else card.append(el('div', 'gap', 'no frame of this section is drawn yet'))
  const words = el('div', 'words')
  const h = el('h3', '', s.name)
  h.append(el('span', `kind ${s.kind}`, s.kind))
  words.append(h, el('div', 'mono quiet', `bars ${s.fromBar} to ${s.toBar} · ${s.start.toFixed(2)} to ${s.end.toFixed(2)} s · frames ${s.firstFrame} to ${s.lastFrame} · ${s.drawn} of ${s.frames} drawn`))
  card.append(words)
  $('section-list').append(card)
}

function tableOf(t) {
  const wrap = el('div', 'scroll')
  const table = el('table')
  const head = el('tr')
  for (const c of t.head) head.append(el('th', '', c))
  table.append(head)
  for (const r of t.rows) {
    const tr = el('tr')
    for (const c of r) tr.append(el('td', '', String(c)))
    table.append(tr)
  }
  wrap.append(table)
  return wrap
}
function findingsOf(r) {
  const ul = el('ul')
  for (const f of r.findings) ul.append(el('li', f.ok ? (f.expected ? 'expected' : '') : 'fail', f.ok ? f.what : `FAIL · ${f.what}`))
  return ul
}
function picturesOf(r) {
  const box = el('div', 'pictures')
  for (const p of r.pictures || []) {
    const img = el('img')
    img.src = p.file
    img.alt = p.caption
    img.loading = 'lazy'
    box.append(img, el('p', 'quiet', p.caption))
  }
  return box
}
function fold(title, ...inside) {
  const d = el('details')
  d.append(el('summary', '', title), ...inside)
  return d
}
for (const c of D.checks) {
  const box = el('article', 'check')
  box.id = `check-${c.name}`
  const [word, cls] = verdictOf(c.result)
  const h = el('header')
  h.append(el('h3', '', c.name), el('span', `verdict ${cls}`, word))
  box.append(h)
  const r = c.result
  if (!r) box.append(el('p', 'quiet', `This check has not been run. npm run checks -- ${c.name}`))
  else {
    h.append(el('span', 'quiet mono', `${r.subject} · ${r.at.replace('T', ' ').slice(0, 16)} UTC${c.stale ? ' · run on an older film than the one on this page' : ''}`))
    box.append(el('blockquote', '', r.sentence), findingsOf(r))
    if (r.table) box.append(fold(`What it measured: ${r.table.rows.length} rows`, tableOf(r.table)))
    if (r.pictures && r.pictures.length) box.append(fold(`${r.pictures.length} pictures`, picturesOf(r)))
  }
  for (const k of c.coarse) {
    if (!k) continue
    const [w2, c2] = verdictOf(k)
    const inside = [findingsOf(k)]
    if (k.table) inside.push(tableOf(k.table))
    inside.push(picturesOf(k))
    const d = fold(`The same on ${k.subject}: ${w2}`, ...inside)
    d.querySelector('summary').classList.add(c2)
    box.append(d)
  }
  if (c.broken.length) {
    const b = el('div', 'broken')
    b.append(el('p', 'quiet', 'Run on a film broken on purpose. It has to fail:'))
    const ul = el('ul')
    for (const k of c.broken) {
      if (!k) continue
      const li = el('li')
      const caught = !k.ok
      li.append(el('b', caught ? 'pass' : 'fail', caught ? 'caught' : 'NOT CAUGHT'), ` · ${k.subject} · ${(k.findings.find((f) => !f.ok) || k.findings[0]).what}`)
      ul.append(li)
    }
    b.append(ul)
    box.append(b)
  }
  $('check-list').append(box)
}
if (D.missing.length) {
  $('missing').hidden = false
  for (const m of D.missing) $('missing-list').append(el('li', '', m))
}
show()
