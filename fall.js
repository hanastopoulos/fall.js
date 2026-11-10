/*! fall.js - page text turns the colors of autumn leaves, then falls and piles up at the bottom of the window. */
(function (global) {
  'use strict';

  var script = document.currentScript;

  var DEFAULTS = {
    unit: 'char',            // 'char' or 'word': what one leaf is made of
    interval: 350,           // ms between picking new pieces of text
    cycle: 3500,             // ms a piece spends changing color before it drops
    delay: 1000,             // ms to wait after the page is ready
    colors: ['#d4a017', '#e07b1a', '#c8451b', '#a3271f', '#7a4a1e'],
    gravity: 90,             // px/s^2
    terminal: 120,           // fastest fall speed, px/s
    sway: 45,                // side-to-side speed, px/s
    wind: 0,                 // constant sideways drift, px/s (negative blows left)
    spin: 40,                // slow tumbling, deg/s
    maxLeaves: 800,          // stop picking after this many
    maxPile: 0.35,           // tallest the pile may get, as a fraction of window height
    root: 'body',            // selector for the part of the page to draw text from
    exclude: '',             // extra selector for elements to leave alone
    onlyVisible: true,       // only pick text currently inside the window
    followScroll: true,      // scrolling carries the leaves with the page, then they fall again
    zIndex: 2147483647,
    autostart: true,
    respectReducedMotion: true
  };

  var SKIP_BASE = 'script,style,noscript,textarea,input,select,option,svg,canvas,iframe,video,audio,' +
    '[contenteditable],[data-fall-skip],[data-fall-leaf],[data-fall-layer]';
  var COPIED = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'fontKerning', 'fontFeatureSettings', 'letterSpacing', 'textTransform', 'textShadow',
    'textDecoration', 'direction'];
  var BUCKET = 6;
  var PACK = 0.3;
  var MAX_STEP = 5;

  var opts = null;
  var skip = SKIP_BASE;
  var running = false;
  var timer = 0;
  var raf = 0;
  var lastTime = 0;
  var layer = null;
  var candidates = [];
  var picks = 0;
  var total = 0;
  var spans = [];
  var turning = new Set();
  var falling = [];
  var landed = [];
  var pile = new Float32Array(0);
  var lastScroll = 0;

  function coerce(key, value) {
    var d = DEFAULTS[key];
    if (typeof d === 'number') return parseFloat(value);
    if (typeof d === 'boolean') return value !== 'false' && value !== '0';
    if (Array.isArray(d)) return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return value;
  }

  function scriptOptions() {
    var out = {};
    if (!script) return out;
    try {
      new URL(script.src, location.href).searchParams.forEach(function (v, k) {
        if (k in DEFAULTS) out[k] = coerce(k, v);
      });
    } catch (e) { /* inline script: no src to read */ }
    Object.keys(script.dataset).forEach(function (k) {
      if (k in DEFAULTS) out[k] = coerce(k, script.dataset[k]);
    });
    return out;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.random() * (i + 1) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function inView(r) {
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function collect() {
    candidates = [];
    var root = document.querySelector(opts.root) || document.body;
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return /\S/.test(n.data) && p && !p.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = walker.nextNode())) candidates.push(n);
  }

  function dropCandidate(i) {
    candidates[i] = candidates[candidates.length - 1];
    candidates.pop();
  }

  // Wraps one random character or word in a span, in place, and returns the span.
  function pick() {
    if (!candidates.length || ++picks % 60 === 0) collect();
    var pattern = opts.unit === 'word' ? /\S+/gu : /\S\p{M}*/gu;
    for (var attempt = 0; attempt < 40 && candidates.length; attempt++) {
      var i = Math.random() * candidates.length | 0;
      var node = candidates[i];
      var parent = node.parentElement;
      if (!node.isConnected || !parent || !/\S/.test(node.data) || parent.closest(skip)) { dropCandidate(i); continue; }
      // Longer runs of text get picked more often, so a paragraph is not outlived by a menu.
      if (Math.random() > Math.max(0.15, node.data.length / 60)) continue;
      if (opts.onlyVisible && !inView(parent.getBoundingClientRect())) continue;
      if (getComputedStyle(parent).visibility === 'hidden') continue;

      var matches = Array.from(node.data.matchAll(pattern));
      var m = matches[Math.random() * matches.length | 0];
      var range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      var r = range.getBoundingClientRect();
      if (!r.width || !r.height || (opts.onlyVisible && !inView(r))) continue;

      var span = document.createElement('span');
      span.setAttribute('data-fall-leaf', '');
      range.surroundContents(span);
      var rest = span.nextSibling;
      if (rest && rest.nodeType === 3 && /\S/.test(rest.data)) candidates.push(rest);
      return span;
    }
    return null;
  }

  function turn(span) {
    var colors = shuffle(opts.colors.slice());
    var anim = span.animate(
      { color: [getComputedStyle(span).color].concat(colors) },
      { duration: opts.cycle, easing: 'ease-in-out', fill: 'forwards' }
    );
    spans.push(span);
    turning.add(anim);
    total++;
    anim.onfinish = function () {
      turning.delete(anim);
      drop(span, colors[colors.length - 1]);
      anim.cancel();
    };
  }

  function ensureLayer() {
    if (layer) return;
    layer = document.createElement('div');
    layer.setAttribute('data-fall-layer', '');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;' +
      'margin:0;padding:0;border:0;background:none;z-index:' + opts.zIndex + ';';
    document.documentElement.appendChild(layer);
    lastScroll = global.scrollY;
    global.addEventListener('scroll', onScroll, { passive: true });
  }

  // Leaves move with the page while it scrolls. Scrolling down lifts the whole pile off the
  // bottom edge, and it falls again from wherever the page carried it.
  function onScroll() {
    var delta = global.scrollY - lastScroll;
    lastScroll = global.scrollY;
    if (!opts.followScroll || !delta) return;
    var i, l;
    for (i = 0; i < falling.length; i++) falling[i].y = lift(falling[i], delta);
    if (delta > 0 && landed.length) {
      for (i = 0; i < landed.length; i++) {
        l = landed[i];
        l.y = lift(l, delta, innerHeight - l.bottom - l.h);
        l.vy = 0;
        l.age = 0;
        l.el.style.left = '0';
        l.el.style.top = '0';
        l.el.style.bottom = 'auto';
        place(l);
        falling.push(l);
      }
      landed = [];
      pile.fill(0);
    }
    if (falling.length && !raf) { lastTime = 0; raf = requestAnimationFrame(frame); }
  }

  // A long jump would carry leaves far above the window; those re-enter from just above the top, staggered.
  function lift(l, delta, from) {
    var y = (from === undefined ? l.y : from) - delta;
    return y < -l.h ? -l.h - rand(0, innerHeight * 0.5) : y;
  }

  // Hides the original in place (it keeps its space) and releases a look-alike into the overlay.
  function drop(span, color) {
    if (!span.isConnected) return;
    var r = span.getBoundingClientRect();
    var cs = getComputedStyle(span);
    span.style.visibility = 'hidden';
    if (!r.width || !r.height) return;

    ensureLayer();
    var el = document.createElement('span');
    el.textContent = span.textContent;
    el.style.cssText = 'position:absolute;left:0;top:0;margin:0;padding:0;white-space:pre;' +
      'will-change:transform;transform-origin:50% 50%;';
    COPIED.forEach(function (p) { el.style[p] = cs[p]; });
    el.style.lineHeight = r.height + 'px';
    el.style.color = color;

    var leaf = {
      el: el, w: r.width, h: r.height,
      x: r.left,
      // Text that scrolled below the window while it was turning drifts in from the top instead.
      y: r.top >= innerHeight ? -r.height : r.top,
      vy: 0, age: 0,
      phase: rand(0, Math.PI * 2),
      freq: rand(1.6, 3.2),
      amp: opts.sway * rand(0.5, 1.2),
      tilt: rand(15, 50),
      drift: 0,
      spin: opts.spin * rand(-1, 1),
      drag: rand(0.7, 1.1),
      angle: 0
    };
    place(leaf);
    layer.appendChild(el);
    falling.push(leaf);
    if (!raf) { lastTime = 0; raf = requestAnimationFrame(frame); }
  }

  function place(l) {
    l.el.style.transform = 'translate(' + l.x.toFixed(1) + 'px,' + l.y.toFixed(1) + 'px) rotate(' + l.angle.toFixed(1) + 'deg)';
  }

  function sizePile() {
    var n = Math.ceil(innerWidth / BUCKET) + 1;
    if (n <= pile.length) return;
    var grown = new Float32Array(n);
    grown.set(pile);
    pile = grown;
  }

  function pileAt(x, w) {
    var a = Math.max(0, x / BUCKET | 0), b = Math.min(pile.length - 1, (x + w) / BUCKET | 0), top = 0;
    for (var i = a; i <= b; i++) if (pile[i] > top) top = pile[i];
    return top;
  }

  function land(l, height) {
    var cap = innerHeight * opts.maxPile;
    var a = Math.max(0, l.x / BUCKET | 0), b = Math.min(pile.length - 1, (l.x + l.w) / BUCKET | 0);
    var i, pass, spill;
    for (i = a; i <= b; i++) pile[i] = Math.min(cap, pile[i] + l.h * PACK);
    // Let steep heaps slump sideways so the pile forms mounds instead of towers.
    for (pass = 0; pass < 2; pass++) {
      for (i = 1; i < pile.length; i++) {
        spill = (pile[i] - pile[i - 1]) / 2;
        if (Math.abs(spill) > MAX_STEP / 2) {
          spill -= (spill > 0 ? MAX_STEP : -MAX_STEP) / 2;
          pile[i] -= spill;
          pile[i - 1] += spill;
        }
      }
    }
    // Anchored to the bottom edge so the pile stays put when the window is resized.
    l.el.style.top = 'auto';
    l.el.style.bottom = height.toFixed(1) + 'px';
    l.el.style.left = l.x.toFixed(1) + 'px';
    l.el.style.transform = 'rotate(' + l.angle.toFixed(1) + 'deg)';
    l.bottom = height;
    landed.push(l);
  }

  function frame(now) {
    var dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    sizePile();
    for (var i = falling.length - 1; i >= 0; i--) {
      var l = falling[i];
      l.age += dt;
      var ease = Math.min(1, l.age / 0.8);
      l.phase += l.freq * dt;
      l.vy = Math.min(opts.terminal * l.drag, l.vy + opts.gravity * dt);
      var swing = Math.cos(l.phase);
      l.x += (opts.wind + swing * l.amp) * ease * dt;
      // A leaf drops fastest at the ends of each swing and floats through the middle.
      l.y += l.vy * (1 - 0.4 * Math.abs(swing) * ease) * dt;
      l.drift += l.spin * ease * dt;
      l.angle = Math.sin(l.phase) * l.tilt * ease + l.drift;
      l.x = Math.max(0, Math.min(innerWidth - l.w, l.x));

      var height = pileAt(l.x, l.w);
      if (l.y + l.h >= innerHeight - height) {
        land(l, height);
        falling.splice(i, 1);
      } else {
        place(l);
      }
    }
    raf = falling.length ? requestAnimationFrame(frame) : 0;
  }

  function tick() {
    if (document.hidden) return;
    if (total >= opts.maxLeaves) { clearInterval(timer); timer = 0; return; }
    var span = pick();
    if (span) turn(span);
  }

  function start(options) {
    if (running) return api;
    opts = Object.assign({}, DEFAULTS, scriptOptions(), options || {});
    skip = SKIP_BASE + (opts.exclude ? ',' + opts.exclude : '');
    running = true;
    timer = setInterval(tick, Math.max(16, opts.interval));
    return api;
  }

  // Stops picking new text. Leaves already turning or falling finish their trip.
  function stop() {
    clearInterval(timer);
    timer = 0;
    running = false;
    return api;
  }

  // Puts the page back the way it was found.
  function reset() {
    stop();
    turning.forEach(function (a) { a.onfinish = null; a.cancel(); });
    turning.clear();
    spans.forEach(function (s) {
      var p = s.parentNode;
      if (!p) return;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
      p.normalize();
    });
    spans = [];
    falling = [];
    landed = [];
    global.removeEventListener('scroll', onScroll);
    candidates = [];
    total = 0;
    pile = new Float32Array(0);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (layer) { layer.remove(); layer = null; }
    return api;
  }

  var api = {
    start: start,
    stop: stop,
    reset: reset,
    defaults: DEFAULTS,
    get count() { return total; }
  };
  global.Fall = api;

  function autostart() {
    var o = Object.assign({}, DEFAULTS, scriptOptions());
    if (!o.autostart) return;
    if (o.respectReducedMotion && global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      console.info('fall.js: not starting because the system asks for reduced motion. Call Fall.start() to run anyway.');
      return;
    }
    setTimeout(function () { start(); }, o.delay);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autostart);
  else autostart();
})(window);
