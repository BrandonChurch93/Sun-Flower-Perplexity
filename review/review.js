// Review page: the film's buttons, its position line, the bar readout and the two short videos further down.
// The words on the buttons are the ones the film's own page uses, and the bar readout is written the way
// the live player writes it. No dependencies.
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
  var BEATS = 4 // beats in a bar
  // Where a part begins, as a share of the film. The first part takes the lead-in before bar 1 as well.
  var partAt = function (k) { return k === 0 ? 0 : (FIRST + (PARTS[k][0] - 1) * BAR) / LENGTH }

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
    // A word about loading. While it stands, the page shows it in place of the bar readout.
    var filmBar = note && note.closest ? note.closest('.film-bar') : null
    var say = function (msg) {
      if (note) note.textContent = msg
      if (filmBar) filmBar.setAttribute('data-note', msg ? 'yes' : 'no')
    }
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

    var names = [] // the part names under the position line
    var partName = null // the two halves of the readout: the part, then the bar and the beat
    var partBar = null
    var shownPart = -1
    // What the page shows now. paint runs on every frame while the film plays, and writes only what has changed.
    var seen = {}
    var put = function (key, value, write) {
      if (seen[key] === value) return
      seen[key] = value
      write(value)
    }
    // The line moves in whole screen pixels, so the lit edge of the picture and the flower head stay sharp and the
    // page has nothing to redraw between two steps. steps is the width of the picture in screen pixels.
    var steps = 0
    var strip = track ? track.querySelector('.strip') : null
    var measure = function () {
      var w = strip ? strip.getBoundingClientRect().width : 0
      steps = w > 0 ? Math.max(1, Math.round(w * (window.devicePixelRatio || 1))) : 0
    }

    // The bar and the beat at a time, counted from 1 and held as one number: 613 is the third beat of bar 61.
    // Before bar 1 the number is under 10.
    var beatAt = function (t) {
      var bar = (t - FIRST) / BAR + 1
      var barNo = Math.floor(bar + 1e-6)
      return barNo * 10 + Math.floor((bar - barNo) * BEATS + 1e-6) + 1
    }

    var paint = function () {
      var d = dur()
      var t = Math.min(shown(), d)
      // The readout is written as the live player writes it: bar 61.3 is the third beat of bar 61.
      var code = beatAt(t)
      var barNo = Math.floor(code / 10)
      var beat = code % 10
      var at = 0
      for (var i = 0; i < PARTS.length; i++) if (barNo >= PARTS[i][0]) at = i
      if (part) {
        if (!partName) {
          part.textContent = ''
          partName = part.appendChild(document.createElement('i'))
          partBar = part.appendChild(document.createElement('span'))
        }
        put('name', PARTS[at][1], function (v) { partName.textContent = v })
        put('bar', barNo >= 1 ? 'bar ' + barNo + '.' + beat : 'before bar 1', function (v) { partBar.textContent = v })
      }
      if (at !== shownPart) {
        shownPart = at
        for (var n = 0; n < names.length; n++) names[n].setAttribute('data-current', n === at ? 'yes' : 'no')
      }
      if (!scrub) return
      // The flower head stands where the film is, to the nearest screen pixel of the line.
      var share = steps ? Math.round(t / d * steps) / steps : t / d
      var place = +(share * d).toFixed(2)
      if (!dragging && Math.abs(+scrub.value - place) > 0.006) scrub.value = place
      var got = onWhole ? d : film.buffered.length ? film.buffered.end(film.buffered.length - 1) : 0
      var line = track || scrub
      put('at', share.toFixed(5), function (v) { line.style.setProperty('--at', v) })
      put('got', (Math.max(t, got) / d).toFixed(4), function (v) { line.style.setProperty('--got', v) })
      put('says', clock(t) + ' of ' + clock(d) + ', ' + PARTS[at][1], function (v) { scrub.setAttribute('aria-valuetext', v) })
      if (now) put('now', clock(t), function (v) { now.textContent = v })
      if (total) put('total', clock(d), function (v) { total.textContent = v })
    }

    // While the film runs, the page looks at its time on every frame, so the beat turns over on the beat and the
    // flower head glides. A browser reports the time only about four times a second on its own. A frame on which
    // the beat, the second and the pixel of the line are all the same as on the last one is left alone.
    var following = false
    var lastBeat = -1
    var lastStep = -1
    var lastSecond = -1
    var follow = function () {
      if (film.paused || film.ended) { following = false; return }
      var t = film.currentTime
      var b = beatAt(t)
      var p = steps ? Math.round(t / dur() * steps) : -1
      var sec = Math.floor(t)
      if (b !== lastBeat || p !== lastStep || sec !== lastSecond) {
        lastBeat = b
        lastStep = p
        lastSecond = sec
        paint()
      }
      window.requestAnimationFrame(follow)
    }
    var followFilm = function () {
      if (following || !window.requestAnimationFrame) return
      following = true
      window.requestAnimationFrame(follow)
    }

    var sync = function () {
      if (changing) return
      var ended = film.ended
      var paused = film.paused || ended
      play.textContent = ended ? 'Play it again' : paused ? 'Play the film' : 'Pause'
      play.setAttribute('data-state', paused ? 'paused' : 'playing')
      // The sound button says what a press will do, so its words carry its state and it is not marked as pressed.
      var on = !film.muted && film.volume > 0
      sound.textContent = on ? 'Turn the sound off' : 'Turn the sound on'
      sound.setAttribute('data-on', on ? 'yes' : 'no')
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
      // The film says it has paused or started a moment after it has; the button does not wait for that.
      sync()
    })

    sound.addEventListener('click', function () {
      film.muted = !film.muted
      if (!film.muted && film.volume === 0) film.volume = 1
      if (!film.muted && (film.paused || film.ended)) {
        if (refusedPlain && !onWhole) { wantPlay = true; loadWhole() } else start()
      }
      sync()
    })

    ;['play', 'playing', 'pause', 'ended', 'seeked', 'volumechange', 'emptied'].forEach(function (e) { film.addEventListener(e, sync) })
    ;['timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'progress', 'ended'].forEach(function (e) { film.addEventListener(e, paint) })
    ;['play', 'playing'].forEach(function (e) { film.addEventListener(e, followFilm) })
    film.addEventListener('loadedmetadata', showRung)
    film.addEventListener('loadeddata', showRung)
    // Has the film given up on its files? An error on the film itself, or every file tried and none taken.
    // A film the browser has not begun on yet reads the same as one whose files were all turned down: nothing
    // loaded and no file. So that reading counts only with one thing more. An error was just heard; or the browser
    // names a file, which it does once it has tried one; or the page has finished loading, which a browser holds
    // back until the film has begun.
    var NO_FILE = 3 // HTMLMediaElement.NETWORK_NO_SOURCE
    var lookAgain = function (heard) {
      if (film.error) return refused()
      if (film.readyState !== 0 || film.networkState !== NO_FILE) return
      if (heard === true || film.currentSrc || document.readyState === 'complete') refused()
    }
    // An error on one of the film's files does not bubble, so it is heard on its way down to the file. Every file's
    // error is heard, not only the last one's: a browser can give up after the first file without trying the second.
    film.addEventListener('error', function () { setTimeout(function () { lookAgain(true) }, 0) }, true)
    // The browser may also have given up before this script began to listen. Then no error comes again, so the
    // film's state is read once here, and once more when the page has finished loading.
    lookAgain()
    window.addEventListener('load', lookAgain)
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

      // The line is the film itself, cut where its eight parts meet, with the name of each part under it.
      if (track) {
        var list = document.createElement('ol')
        list.className = 'scrub-names'
        list.setAttribute('aria-hidden', 'true')
        for (var k = 0; k < PARTS.length; k++) {
          if (k > 0) {
            var tick = document.createElement('i')
            tick.style.setProperty('--a', partAt(k).toFixed(5))
            track.insertBefore(tick, scrub)
          }
          var item = document.createElement('li')
          item.textContent = PARTS[k][1]
          item.style.setProperty('--a', partAt(k).toFixed(5))
          if (k === PARTS.length - 1) item.className = 'is-last'
          names.push(list.appendChild(item))
        }
        track.appendChild(list)
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

    measure()
    if (strip && window.ResizeObserver) new ResizeObserver(function () { measure(); paint() }).observe(strip)
    window.addEventListener('resize', function () { measure(); paint() })
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
