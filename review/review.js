// Review page: the film's buttons, its position line, the bar readout and the two short videos further down.
// No dependencies.
;(function () {
  'use strict'

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var film = document.getElementById('film')
  var play = document.getElementById('play')
  var sound = document.getElementById('sound')
  var rung = document.getElementById('rung')
  var part = document.getElementById('part')
  var note = document.getElementById('note')
  var live = document.getElementById('film-live')
  var hold = document.getElementById('hold')
  var row = document.getElementById('scrub-row')
  var track = document.getElementById('scrub-track')
  var scrub = document.getElementById('scrub')
  var now = document.getElementById('now')
  var total = document.getElementById('total')

  // Some hosts send a video only as one stream from its first byte and cannot hand out a piece from the middle.
  // On such a host a browser cannot jump around in the plain file, and some browsers will not play it at all.
  // A file fetched whole and held in memory has neither limit, so that is what the page falls back on.
  var canWhole = !!(window.fetch && window.Blob && window.URL && URL.createObjectURL)

  // Fetch one file whole. bytes is its known size, used for the percentage when the host does not state a length.
  function fetchWhole(url, bytes, onProgress) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      var size = +r.headers.get('content-length') || bytes || 0
      if (!r.body || !r.body.getReader) return r.blob()
      var reader = r.body.getReader()
      var chunks = []
      var got = 0
      var pump = function () {
        return reader.read().then(function (x) {
          if (x.done) return new Blob(chunks, { type: 'video/mp4' })
          chunks.push(x.value)
          got += x.value.length
          if (onProgress) onProgress(got, size)
          return pump()
        })
      }
      return pump()
    })
  }

  // The map of the track: bar n begins at FIRST + (n - 1) * BAR seconds.
  var FIRST = 0.883143
  var BAR = 1.714286
  // The eight parts of the film, each with the bar it begins on.
  var PARTS = [
    [1, 'Germination'],
    [17, 'Frost'],
    [25, 'First climb'],
    [33, 'Storm'],
    [41, 'The great climb'],
    [57, 'Bloom'],
    [65, 'Field'],
    [73, 'Last light']
  ]
  var LENGTH = 127 // seconds, used until the file states its own length

  if (film && play && sound) {
    var rungName = ''
    var whole = null // the fetch of the whole file, once it has been asked for
    var onWhole = false // true once the film plays from the whole file
    var wanted = null // where to jump to once the whole file is here
    var wantPlay = false // start playing once the whole file is here
    var refusedPlain = false // the browser would not load the plain file
    var dragging = false
    var thawTimer = 0
    var changing = false // the film is changing over to the whole file; the buttons hold their labels meanwhile

    var dur = function () { return isFinite(film.duration) && film.duration > 0 ? film.duration : LENGTH }
    var clock = function (t) {
      t = Math.max(0, Math.floor(t))
      return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2)
    }
    var say = function (msg) { if (note) note.textContent = msg }
    var announce = function (msg) { if (live) live.textContent = msg }

    // The 1080p file carries media="(min-width: 1000px)", so a narrow window takes the 720p file and never fetches both.
    var showRung = function () {
      if (!rung) return
      var src = film.currentSrc || ''
      if (src.indexOf('720p') >= 0) rungName = '720p'
      else if (src.indexOf('1080p') >= 0) rungName = '1080p'
      rung.textContent = rungName
    }

    // The time the controls show: where the film is, or where it is being taken.
    var shown = function () {
      if (wanted !== null) return wanted
      if (dragging && scrub) return +scrub.value
      return film.currentTime || 0
    }

    var paint = function () {
      var d = dur()
      var t = Math.min(shown(), d)
      if (part) {
        var bar = Math.floor((t - FIRST) / BAR) + 1
        var name = PARTS[0][1]
        for (var i = 0; i < PARTS.length; i++) if (bar >= PARTS[i][0]) name = PARTS[i][1]
        part.textContent = bar >= 1 ? 'Bar ' + bar + ' \u00b7 ' + name : name
      }
      if (!scrub) return
      if (!dragging) scrub.value = t
      var got = onWhole ? d : film.buffered.length ? film.buffered.end(film.buffered.length - 1) : 0
      scrub.style.setProperty('--at', (t / d * 100).toFixed(2) + '%')
      scrub.style.setProperty('--got', (Math.max(t, got) / d * 100).toFixed(2) + '%')
      scrub.setAttribute('aria-valuetext', clock(t) + ' of ' + clock(d))
      if (now) now.textContent = clock(t)
      if (total) total.textContent = clock(d)
    }

    var sync = function () {
      if (changing) return
      var ended = film.ended
      var paused = film.paused || ended
      play.textContent = ended ? 'Play again' : paused ? 'Play' : 'Pause'
      play.setAttribute('aria-label', ended ? 'Play the film again' : paused ? 'Play the film' : 'Pause the film')
      play.setAttribute('data-state', paused ? 'paused' : 'playing')
      var on = !film.muted && film.volume > 0
      sound.textContent = on ? 'Sound on' : 'Sound off'
      sound.setAttribute('aria-pressed', on ? 'true' : 'false')
      sound.setAttribute('aria-label', on ? 'Sound is on. Mute the film' : 'Sound is off. Turn the sound on')
    }

    var start = function () {
      var p = film.play()
      if (p && p.catch) p.catch(function () { sync() })
    }

    // The file the browser chose, or the one it would have chosen had it loaded either.
    var fileUrl = function () {
      var src = film.currentSrc || ''
      if (film.readyState > 0 && src && src.indexOf('blob:') !== 0) return src
      var list = film.querySelectorAll('source')
      for (var i = 0; i < list.length; i++) {
        var m = list[i].getAttribute('media')
        if (!m || (window.matchMedia && window.matchMedia(m).matches)) return list[i].src
      }
      return src
    }
    var fileBytes = function (url) {
      var list = film.querySelectorAll('source')
      for (var i = 0; i < list.length; i++) if (list[i].src === url) return +list[i].getAttribute('data-bytes') || 0
      return 0
    }

    // Keep the frame on screen while the film changes over to the whole file.
    var freeze = function () {
      if (!hold || film.readyState < 2 || !film.videoWidth) return
      try {
        hold.width = film.videoWidth
        hold.height = film.videoHeight
        hold.getContext('2d').drawImage(film, 0, 0, hold.width, hold.height)
        hold.hidden = false
      } catch (e) {}
    }
    var thaw = function () {
      clearTimeout(thawTimer)
      if (hold) hold.hidden = true
    }

    var useWhole = function (blob) {
      var at = wanted !== null ? wanted : film.readyState > 0 ? film.currentTime : 0
      var go = wantPlay || (film.readyState > 0 && !film.paused && !film.ended)
      wanted = null
      wantPlay = false
      freeze()
      onWhole = true
      var ready = function () {
        film.removeEventListener('loadedmetadata', ready)
        var jumped = at > 0.05
        film.addEventListener(jumped ? 'seeked' : 'loadeddata', function shown1() {
          film.removeEventListener(jumped ? 'seeked' : 'loadeddata', shown1)
          thaw()
        })
        if (jumped) film.currentTime = Math.min(at, dur() - 0.05)
        if (go) start()
        changing = false
        sync()
        say('')
        announce('The film is loaded.')
        paint()
      }
      film.addEventListener('loadedmetadata', ready)
      thawTimer = setTimeout(function () { changing = false; sync(); thaw() }, 6000)
      changing = true
      film.src = URL.createObjectURL(blob)
    }

    var loadWhole = function () {
      if (whole || onWhole || !canWhole) return
      var url = fileUrl()
      var label = function () { return wanted !== null ? 'Loading the film to jump to ' + clock(wanted) : 'Loading the film' }
      say(label())
      announce(label())
      whole = fetchWhole(url, fileBytes(url), function (got, size) {
        say(size ? label() + ' \u00b7 ' + Math.min(99, Math.floor(got / size * 100)) + '%' : label())
      })
      whole.then(useWhole, function () {
        whole = null
        wanted = null
        wantPlay = false
        say(refusedPlain ? 'The film could not be loaded here.' : 'The film could not be loaded whole, so it plays from its start only.')
        announce(note ? note.textContent : '')
        paint()
      })
    }

    var canSeek = function (t) {
      if (onWhole) return true
      var s = film.seekable
      for (var i = 0; i < s.length; i++) {
        if (s.end(i) - s.start(i) > 1 && t >= s.start(i) - 0.01 && t <= s.end(i) + 0.01) return true
      }
      return false
    }

    // Go to a time in the film. Where the plain file cannot jump, the whole file is fetched first.
    var jump = function (t) {
      t = Math.max(0, Math.min(t, dur() - 0.05))
      if (film.readyState > 0 && (t <= 0.05 || canSeek(t))) {
        wanted = null
        if (!whole) say('')
        film.currentTime = t
      } else if (canWhole) {
        wanted = t
        loadWhole()
        if (whole && note && note.textContent.indexOf('%') < 0) say('Loading the film to jump to ' + clock(t))
      }
      paint()
    }

    // The browser would not take the plain file, or lost it part of the way through.
    var refused = function () {
      if (onWhole || whole) return
      if (film.readyState > 0) {
        if (!film.error) return
        wanted = film.currentTime || 0
        wantPlay = !film.ended
      } else {
        refusedPlain = true
        if (reduce) return
        wantPlay = true
      }
      loadWhole()
    }

    play.addEventListener('click', function () {
      if (refusedPlain && !onWhole) { wantPlay = true; loadWhole(); return }
      if (film.paused || film.ended) start()
      else film.pause()
    })

    sound.addEventListener('click', function () {
      film.muted = !film.muted
      if (!film.muted && film.volume === 0) film.volume = 1
      if (!film.muted && (film.paused || film.ended)) {
        if (refusedPlain && !onWhole) { wantPlay = true; loadWhole() } else start()
      }
      sync()
    })

    ;['play', 'playing', 'pause', 'ended', 'volumechange', 'emptied'].forEach(function (e) { film.addEventListener(e, sync) })
    ;['timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'progress', 'ended'].forEach(function (e) { film.addEventListener(e, paint) })
    film.addEventListener('loadedmetadata', showRung)
    film.addEventListener('loadeddata', showRung)
    film.addEventListener('error', refused)
    var sources = film.querySelectorAll('source')
    if (sources.length) sources[sources.length - 1].addEventListener('error', refused)
    // A browser that neither loads the file nor says so: twelve seconds after play was asked for, fetch it whole.
    film.addEventListener('play', function () {
      setTimeout(function () {
        if (film.readyState === 0 && !onWhole && !whole && !film.paused) { refusedPlain = true; wantPlay = true; loadWhole() }
      }, 12000)
    })

    // The page's own position line replaces the browser's, which cannot jump on a host that only streams.
    if (scrub && row) {
      film.removeAttribute('controls')
      film.classList.add('is-ours')
      row.hidden = false
      film.addEventListener('click', function () { play.click() })

      if (track) {
        for (var k = 1; k < PARTS.length; k++) {
          var tick = document.createElement('i')
          var at = (FIRST + (PARTS[k][0] - 1) * BAR) / LENGTH
          tick.style.left = 'calc(7px + (100% - 14px) * ' + at.toFixed(5) + ')'
          track.insertBefore(tick, scrub)
        }
      }

      scrub.addEventListener('input', function () {
        dragging = true
        var t = +scrub.value
        if (film.readyState > 0 && canSeek(t)) film.currentTime = t
        paint()
      })
      scrub.addEventListener('change', function () {
        dragging = false
        jump(+scrub.value)
      })
      // A drag that ends where it began sends no change event, so let go a moment after the pointer does.
      ;['pointerup', 'pointercancel', 'blur'].forEach(function (e) {
        scrub.addEventListener(e, function () {
          setTimeout(function () { if (dragging) { dragging = false; paint() } }, 80)
        })
      })
      scrub.addEventListener('keydown', function (e) {
        var step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 }[e.key]
        var to = e.key === 'Home' ? 0 : e.key === 'End' ? dur() : step ? shown() + step : null
        if (to === null) return
        e.preventDefault()
        jump(to)
      })
    }

    sync()
    showRung()
    paint()

    // Muted play on arrival where the browser allows it, never under reduced motion. Otherwise the film waits for a click.
    if (!reduce) {
      film.muted = true
      start()
    }
  }

  // The short videos further down load only when they come into view, each fetched whole so that it loops and
  // can be scrubbed on any host. They play muted there unless motion is reduced, and stop when they leave the window.
  var lazy = document.querySelectorAll('video.lazy-video')
  if (lazy.length && 'IntersectionObserver' in window) {
    var playIfSeen = function (v) {
      if (!reduce && v.getAttribute('data-seen') === '1') v.play().catch(function () {})
    }
    var begin = function (v) {
      var plain = function () { v.preload = 'auto'; playIfSeen(v) }
      var s = v.querySelector('source')
      if (!canWhole || !s) return plain()
      fetchWhole(s.src).then(function (blob) {
        v.src = URL.createObjectURL(blob)
        playIfSeen(v)
      }, plain)
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var v = entry.target
        if (entry.isIntersecting) {
          v.setAttribute('data-seen', '1')
          if (!v.hasAttribute('data-started')) { v.setAttribute('data-started', ''); begin(v) }
          else playIfSeen(v)
        } else {
          v.setAttribute('data-seen', '0')
          if (!v.paused) v.pause()
        }
      })
    }, { threshold: 0.35 })
    for (var n = 0; n < lazy.length; n++) io.observe(lazy[n])
  }
})()
