/*
 * DayRecall website animations.
 *
 * Ported from the app's animation library: OnboardingAnimations.swift (listening, tidying,
 * privacy, consent, voice) and Animations/AskDayAnimation.swift. As in the app, every frame is a
 * pure function of the time since the loop began, so a still frame can be drawn for people who
 * prefer less motion. Positions and moments are the app's own; the icons are drawn here because
 * SF Symbols may only be used in apps on Apple platforms.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var lang = document.documentElement.lang || 'en';

  // Words drawn inside the animations come from the page: i18n/build.py writes each language's
  // into <script id="stage-words"> from i18n/strings/<language>.json.
  var WORDS = (function () {
    var node = document.getElementById('stage-words');
    try { return node ? JSON.parse(node.textContent) : {}; } catch (err) { return {}; }
  })();

  // ---------------------------------------------------------------------------------------------
  // Motion: the app's IntroMotion helpers.

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function seg(t, a, b) { return clamp((t - a) / (b - a)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function lerp(a, b, x) { return a + (b - a) * x; }
  function pulse(t, a, b) { return Math.sin(Math.PI * seg(t, a, b)); }
  function spring(x) { var t = clamp(x); return t >= 1 ? 1 : 1 - Math.exp(-8 * t) * Math.cos(9 * t); }
  function typed(s, x) { var c = Array.from(s); return c.slice(0, Math.floor(c.length * clamp(x))).join(''); }
  /** A share as the page's language writes it: 8.1% in English, 8,1 % in German, %8,1 in Turkish. */
  function percent(value, digits) {
    try {
      return new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })
        .format(value / 100);
    } catch (err) {
      return value.toFixed(digits) + '%';
    }
  }
  /** The onboarding stages fade their picture in at the start of a loop and out at the end. */
  function loopFade(t, length) { return Math.min(seg(t, 0, 0.3), 1 - seg(t, length - 0.5, length)); }

  // ---------------------------------------------------------------------------------------------
  // SVG helpers. Colours are names of CSS variables (`hl` is var(--hl)), so one drawing works in
  // the light and the dark theme of its host.

  var uidCount = 0;
  function uid(p) { uidCount += 1; return 'dr-' + p + '-' + uidCount; }

  function put(e, attrs) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if ((k === 'fill' || k === 'stroke') && typeof v === 'string' && v !== 'none' && /^[a-z][a-z0-9-]*$/.test(v)) {
        e.style[k] = 'var(--' + v + ')';
      } else {
        e.setAttribute(k, v);
      }
    }
    return e;
  }

  function el(parent, tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) put(e, attrs);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** A capsule centred on (cx, cy), as SwiftUI's Capsule in a frame of w by h. */
  function cap(e, cx, cy, w, h) {
    w = Math.max(0, w);
    h = Math.max(0, h);
    var r = Math.min(w, h) / 2;
    e.setAttribute('x', cx - w / 2);
    e.setAttribute('y', cy - h / 2);
    e.setAttribute('width', w);
    e.setAttribute('height', h);
    e.setAttribute('rx', r);
    e.setAttribute('ry', r);
  }

  function op(e, v) { e.setAttribute('opacity', Math.max(0, Math.min(1, v))); }

  function move(e, x, y, s) {
    e.setAttribute('transform', 'translate(' + x + ' ' + y + ')' + (s != null && s !== 1 ? ' scale(' + s + ')' : ''));
  }

  function txt(parent, str, x, y, size, weight, fill, opts) {
    var e = el(parent, 'text', {
      x: x, y: y, 'font-size': size, 'font-weight': weight || 400, fill: fill, 'dominant-baseline': 'central'
    });
    if (opts && opts.anchor) e.setAttribute('text-anchor', opts.anchor);
    if (opts && opts.mono) e.setAttribute('class', 'mono');
    e.textContent = str;
    return e;
  }

  function width(e) {
    try { return e.getComputedTextLength(); } catch (err) { return 0; }
  }

  /** Shrinks a line that does not fit, like SwiftUI's minimumScaleFactor; returns its width. */
  function fit(e, maxW, minScale) {
    var w = width(e);
    if (!w || w <= maxW) return w;
    var size = parseFloat(e.getAttribute('font-size'));
    e.setAttribute('font-size', size * Math.max(minScale, maxW / w));
    var w2 = width(e);
    if (w2 > maxW) {
      e.setAttribute('textLength', maxW);
      e.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      w2 = maxW;
    }
    return w2;
  }

  /** A rectangle with its own radius at each corner. */
  function corners(x, y, w, h, tl, tr, br, bl) {
    return 'M' + (x + tl) + ' ' + y +
      'H' + (x + w - tr) + 'A' + tr + ' ' + tr + ' 0 0 1 ' + (x + w) + ' ' + (y + tr) +
      'V' + (y + h - br) + 'A' + br + ' ' + br + ' 0 0 1 ' + (x + w - br) + ' ' + (y + h) +
      'H' + (x + bl) + 'A' + bl + ' ' + bl + ' 0 0 1 ' + x + ' ' + (y + h - bl) +
      'V' + (y + tl) + 'A' + tl + ' ' + tl + ' 0 0 1 ' + (x + tl) + ' ' + y + 'Z';
  }

  // ---------------------------------------------------------------------------------------------
  // Icons, drawn on a 24-point grid. 's' strokes in the icon colour, 'f' fills with it, 'b' fills
  // with the colour behind the icon (to cut a shape out).

  var ICON = {
    wave: [['path', 's', { d: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3' }]],
    moon: [['circle', 'f', { cx: 11, cy: 13, r: 7.6 }], ['circle', 'b', { cx: 15.8, cy: 8.4, r: 6.4 }]],
    trash: [['path', 's', { d: 'M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17.5 7M10.2 11v5.5M13.8 11v5.5' }]],
    calendar: [['rect', 's', { x: 4, y: 5.5, width: 16, height: 14.5, rx: 2.5 }], ['path', 's', { d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4' }]],
    checkCircle: [['circle', 's', { cx: 12, cy: 12, r: 8.5 }], ['path', 's', { d: 'M8.4 12.2l2.5 2.5 4.8-5' }]],
    clock: [['circle', 's', { cx: 12, cy: 12, r: 8.5 }], ['path', 's', { d: 'M12 7.6V12l3 1.8' }]],
    lockClosed: [['rect', 'f', { x: 5.5, y: 10.5, width: 13, height: 9.5, rx: 2.2 }], ['path', 's', { d: 'M8.6 10.5V8.2a3.4 3.4 0 0 1 6.8 0v2.3' }]],
    lockOpen: [['rect', 'f', { x: 5.5, y: 10.5, width: 13, height: 9.5, rx: 2.2 }], ['path', 's', { d: 'M8.6 10.5V8.2a3.4 3.4 0 0 1 6.6-1.2' }]],
    cloudSlash: [['path', 's', { d: 'M7.4 18.5h9.4a3.7 3.7 0 0 0 .6-7.36 5.3 5.3 0 0 0-10.1-1.4 4.4 4.4 0 0 0 .1 8.76z' }], ['path', 's', { d: 'M4 4.5l16 15' }]],
    stop: [['path', 's', { d: 'M7.5 12h9' }]],
    person: [['circle', 'f', { cx: 12, cy: 8.2, r: 3.8 }], ['path', 'f', { d: 'M4.6 20.4c.6-4 3.6-6.6 7.4-6.6s6.8 2.6 7.4 6.6z' }]],
    watch: [['rect', 's', { x: 7, y: 6.5, width: 10, height: 11, rx: 3 }], ['path', 's', { d: 'M9.4 6.5l.6-3h4l.6 3M9.4 17.5l.6 3h4l.6-3' }]],
    arrowUp: [['path', 's', { d: 'M12 18.5V5.8M6.8 11l5.2-5.2 5.2 5.2' }]],
    arrowUpRight: [['path', 's', { d: 'M7.5 16.5l9-9M9.5 7.5h7v7' }]],
    chevronRight: [['path', 's', { d: 'M9.5 6.5L15 12l-5.5 5.5' }]],
    check: [['path', 's', { d: 'M5.5 12.5l4.2 4.2 8.8-9' }]],
    people: [
      ['circle', 'f', { cx: 9, cy: 8.6, r: 3.3 }], ['path', 'f', { d: 'M2.8 19.6c.5-3.4 3-5.5 6.2-5.5s5.7 2.1 6.2 5.5z' }],
      ['circle', 'f', { cx: 16.6, cy: 9.4, r: 2.6 }], ['path', 'f', { d: 'M15.6 14.4c.4-.1.7-.1 1-.1 2.6 0 4.5 1.8 4.9 4.8h-4.9c-.2-1.9-.5-3.4-1-4.7z' }]
    ],
    sun: [['circle', 's', { cx: 12, cy: 12, r: 3.8 }], ['path', 's', { d: 'M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6' }]],
    list: [['path', 's', { d: 'M10.5 7h9.5M10.5 12h9.5M10.5 17h9.5M4 7l1.3 1.3L7.6 6M4 12l1.3 1.3 2.3-2.3M4 17l1.3 1.3 2.3-2.3' }]],
    chat: [['path', 's', { d: 'M5 5.5h14a1.6 1.6 0 0 1 1.6 1.6v8.3a1.6 1.6 0 0 1-1.6 1.6h-6.8l-4.3 3.3V17H5a1.6 1.6 0 0 1-1.6-1.6V7.1A1.6 1.6 0 0 1 5 5.5z' }]],
    history: [['path', 's', { d: 'M4.6 12a7.4 7.4 0 1 0 2.2-5.3L4.5 9M4.5 4.8V9h4.2M12 8.2V12l2.8 1.8' }]],
    pin: [['path', 's', { d: 'M12 20.5s-6-5.2-6-10.2a6 6 0 0 1 12 0c0 5-6 10.2-6 10.2z' }], ['circle', 's', { cx: 12, cy: 10.3, r: 2.2 }]],
    share: [['path', 's', { d: 'M12 3.8v11M8 7.6l4-3.8 4 3.8M5.5 11.5v7.2c0 .8.7 1.5 1.5 1.5h10c.8 0 1.5-.7 1.5-1.5v-7.2' }]],
    globe: [['circle', 's', { cx: 12, cy: 12, r: 8.5 }], ['path', 's', { d: 'M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z' }]],
    week: [['rect', 's', { x: 4, y: 5.5, width: 16, height: 14.5, rx: 2.5 }], ['path', 's', { d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h2M11 14h2M14 14h2M8 17h2' }]],
    turn: [['path', 's', { d: 'M6.5 5.5v5.7a3.3 3.3 0 0 0 3.3 3.3H18M14.2 10.7l3.8 3.8-3.8 3.8' }]],
    mail: [['rect', 's', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 2.5 }], ['path', 's', { d: 'M4.5 7.5l7.5 5.6 7.5-5.6' }]],
    phone: [['rect', 's', { x: 6.5, y: 2.8, width: 11, height: 18.4, rx: 2.8 }], ['path', 's', { d: 'M10.6 5.8h2.8' }]],
    devices: [
      ['rect', 's', { x: 3, y: 3.5, width: 10.5, height: 17, rx: 2.5 }],
      ['rect', 's', { x: 15.5, y: 8.5, width: 6, height: 7.5, rx: 2 }],
      ['path', 's', { d: 'M16.9 8.5l.4-2.2h2.4l.4 2.2M16.9 16l.4 2.2h2.4l.4-2.2' }]
    ],
    x: [['path', 's', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
    doc: [['path', 's', { d: 'M6.5 3.5h7L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 .5-1.5zM13.5 3.5V8H18M9 13h6M9 16.5h6' }]],
    sparkle: [['path', 's', { d: 'M12 3.5c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z' }]],
    ellipsis: [['circle', 'f', { cx: 5.5, cy: 12, r: 1.7 }], ['circle', 'f', { cx: 12, cy: 12, r: 1.7 }], ['circle', 'f', { cx: 18.5, cy: 12, r: 1.7 }]],
    chevronLeft: [['path', 's', { d: 'M14.5 6.5L9 12l5.5 5.5' }]],
    calendarCheck: [['rect', 's', { x: 4, y: 5.5, width: 16, height: 14.5, rx: 2.5 }], ['path', 's', { d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4M9 15.2l2.1 2.1 3.9-4' }]],
    appForward: [['path', 's', { d: 'M10.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-3.5M13.5 4.5h6V10.5M19.5 4.5l-8 8' }]],
    magnifier: [['circle', 's', { cx: 10.5, cy: 10.5, r: 6.5 }], ['path', 's', { d: 'M15.5 15.5L20 20' }]],
    bed: [['path', 's', { d: 'M3.5 6v13M3.5 15h17v4M20.5 15v-3.2a3 3 0 0 0-3-3H11V15' }], ['circle', 's', { cx: 7.3, cy: 11.4, r: 1.9 }]],
    walk: [['circle', 'f', { cx: 13.4, cy: 4.6, r: 2 }], ['path', 's', { d: 'M10.6 20.6l2.2-5.4-2.7-2.7 1.3-4.7 4 2.3 2.7.9M8.2 12.2l2.9-3.4' }]],
    heart: [['path', 's', { d: 'M12 19.8s-7.6-4.6-7.6-10.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.6 2.5c0 5.7-7.6 10.3-7.6 10.3z' }]],
    heartFill: [['path', 'f', { d: 'M12 19.8s-7.6-4.6-7.6-10.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.6 2.5c0 5.7-7.6 10.3-7.6 10.3z' }]],
    steps: [['path', 's', { d: 'M8.2 4.5c1.6 0 2.4 1.4 2.4 3.2 0 2-.9 3.4-2.5 3.4S5.8 9.7 5.8 7.8c0-1.8.8-3.3 2.4-3.3zM15.6 11.8c1.6 0 2.5 1.4 2.5 3.3 0 2-.9 3.4-2.5 3.4s-2.4-1.4-2.4-3.3c0-1.8.8-3.4 2.4-3.4z' }]],
    dumbbell: [['path', 's', { d: 'M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11' }]],
    arrowRight: [['path', 's', { d: 'M5 12h14M13 6l6 6-6 6' }]],
    poster: [['rect', 's', { x: 5.5, y: 3, width: 13, height: 18, rx: 2.5 }], ['path', 's', { d: 'M9 16.5V14M12 16.5v-6M15 16.5v-4' }]],
    video: [['rect', 's', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 3 }], ['path', 'f', { d: 'M10.2 9.4v5.2l4.4-2.6z' }]]
  };

  /** An icon centred on the origin of a new group; `size` is the side of its 24-point box. */
  function icon(parent, name, size, color, bg) {
    var g = el(parent, 'g');
    var inner = el(g, 'g', { transform: 'scale(' + (size / 24) + ') translate(-12 -12)' });
    ICON[name].forEach(function (part) {
      var a = {};
      for (var k in part[2]) a[k] = part[2][k];
      if (part[1] === 's') {
        a.fill = 'none';
        a.stroke = color;
        a['stroke-width'] = 2;
        a['stroke-linecap'] = 'round';
        a['stroke-linejoin'] = 'round';
      } else if (part[1] === 'f') {
        a.fill = color;
      } else {
        a.fill = bg || 'card';
      }
      el(inner, part[0], a);
    });
    return g;
  }

  /** Icons in the page itself, in the text colour of where they sit. */
  function pageIcon(host) {
    var name = host.getAttribute('data-icon');
    if (!ICON[name]) return;
    var svg = el(null, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    ICON[name].forEach(function (part) {
      var a = {};
      for (var k in part[2]) a[k] = part[2][k];
      if (part[1] === 's') {
        a.fill = 'none';
        a.stroke = 'currentColor';
        a['stroke-width'] = 2;
        a['stroke-linecap'] = 'round';
        a['stroke-linejoin'] = 'round';
      } else {
        a.fill = 'currentColor';
      }
      el(svg, part[0], a);
    });
    host.appendChild(svg);
  }

  function card(svg, w, h, r) {
    return el(svg, 'rect', { x: 0, y: 0, width: w, height: h, rx: r, fill: 'card' });
  }

  // ---------------------------------------------------------------------------------------------
  // Pieces of interface the feature animations share (AnimationKit.swift: tiles, switch, tab bar,
  // the finger). Each draws once and returns what the frame needs to move it.

  /** How wide `str` sets at this size, measured on a line that is taken away again. */
  function measure(parent, str, size, weight, mono) {
    var e = txt(parent, str, 0, 0, size, weight, 'ink', mono ? { mono: true } : null);
    var w = width(e);
    parent.removeChild(e);
    return w;
  }

  /** An icon on a rounded tile, centred on the origin of a new group. */
  function tile(parent, name, size, fg, bg) {
    var g = el(parent, 'g');
    el(g, 'rect', { x: -size / 2, y: -size / 2, width: size, height: size, rx: size * 0.31, fill: bg });
    icon(g, name, size * 0.5, fg, bg);
    return g;
  }

  /** `str` set in lines no wider than `maxW`, from `top`; returns the height. Latin text breaks between
   *  words, Chinese and Japanese anywhere. */
  function wrap(parent, str, x, top, size, weight, fill, maxW, lineH, anchor) {
    var parts = str.match(/[^\s⺀-鿿＀-￯]+|\s+|[\s\S]/g) || [];
    var probe = txt(parent, '', x, top, size, weight, fill);
    var lines = [], line = '';
    parts.forEach(function (p) {
      var blank = /^\s+$/.test(p);
      probe.textContent = (line + p).replace(/\s+$/, '');
      if (line && !blank && width(probe) > maxW) {
        lines.push(line.replace(/\s+$/, ''));
        line = p;
      } else {
        line += p;
      }
    });
    if (line) lines.push(line.replace(/\s+$/, ''));
    parent.removeChild(probe);
    lines.forEach(function (l, i) {
      txt(parent, l, x, top + lineH * (i + 0.5), size, weight, fill, anchor ? { anchor: anchor } : null);
    });
    return lines.length * lineH;
  }

  /** Fades `e` in and moves it up into place at (x, y) over `over` seconds from `start`; returns how far. */
  function rise(e, t, start, x, y, from, over) {
    var k = easeOut(seg(t, start, start + (over || 0.3)));
    e.setAttribute('transform', 'translate(' + x + ' ' + (y + (1 - k) * (from == null ? 8 : from)) + ')');
    op(e, k);
    return k;
  }

  /** A settings switch at the origin of a new group; the returned function sets it, 0 (off) to 1 (on). */
  function toggle(parent) {
    var g = el(parent, 'g');
    el(g, 'rect', { x: 0, y: 0, width: 40, height: 23, rx: 11.5, fill: 'track' });
    var on = el(g, 'rect', { x: 0, y: 0, width: 40, height: 23, rx: 11.5, fill: 'accent' });
    var thumb = el(g, 'circle', { cy: 11.5, r: 9.5, fill: '#fff' });
    thumb.style.filter = 'drop-shadow(0 1px 1px rgba(0,0,0,0.22))';
    var set = function (v) {
      op(on, v);
      thumb.setAttribute('cx', 2 + 9.5 + 17 * Math.min(Math.max(v, 0), 1.06));
    };
    set(0);
    return { g: g, set: set };
  }

  /** The four tabs along the bottom of the app, at height y. `set(selected, badge, pop)` for each frame. */
  function tabBar(parent, labels, y) {
    var g = el(parent, 'g', { transform: 'translate(0 ' + y + ')' });
    el(g, 'rect', { x: 0, y: 0, width: 342, height: 50, fill: 'card' });
    el(g, 'rect', { x: 0, y: 0, width: 342, height: 1, fill: 'hair' });
    var tabs = ['sun', 'list', 'chat', 'history'].map(function (name, i) {
      var cx = 42.75 + 85.5 * i;
      var off = el(g, 'g'), on = el(g, 'g');
      move(icon(off, name, 20, 'ink3'), cx, 18.5);
      txt(off, labels[i], cx, 37, 9.5, 500, 'ink3', { anchor: 'middle' });
      move(icon(on, name, 20, 'on-hl-soft'), cx, 18.5);
      txt(on, labels[i], cx, 37, 9.5, 500, 'on-hl-soft', { anchor: 'middle' });
      return { on: on, off: off };
    });
    var badge = el(g, 'g');
    el(badge, 'circle', { r: 7, fill: 'hl' });
    var badgeText = txt(badge, '', 0, 0.5, 8.5, 700, 'on-hl', { anchor: 'middle', mono: true });
    var shown = '';
    return {
      g: g,
      set: function (selected, badgeValue, pop) {
        tabs.forEach(function (tab, i) { op(tab.on, i === selected ? 1 : 0); op(tab.off, i === selected ? 0 : 1); });
        if (badgeValue !== shown) {
          badgeText.textContent = badgeValue;
          shown = badgeValue;
        }
        var k = clamp(pop || 0);
        move(badge, 128.25 + 12, 10, lerp(0.3, 1, k) * (1 + 0.25 * Math.max(0, (pop || 0) - 1)));
        op(badge, k);
      }
    };
  }

  /** The fingertip that shows where to tap (AnimationKit.swift's FingerLayer): it comes into view,
   *  presses each place in turn with a ripple, and leaves again. `taps` is [{ x, y, at }]. */
  function finger(parent, taps) {
    var layer = el(parent, 'g', { 'pointer-events': 'none' });
    var ripples = taps.map(function () {
      return el(layer, 'circle', { r: 15, fill: 'none', stroke: 'ink', 'stroke-opacity': 0.4, 'stroke-width': 2 });
    });
    var tip = el(layer, 'g');
    el(tip, 'circle', { r: 14, fill: 'ink', 'fill-opacity': 0.16 });
    el(tip, 'circle', { r: 13, fill: 'none', stroke: 'ink', 'stroke-opacity': 0.5, 'stroke-width': 2 });
    var comeIn = 0.5, settle = 0.14, linger = 0.2, travelGap = 1.0;
    function pose(t) {
      var first = taps[0], last = taps[taps.length - 1];
      var firstArrives = first.at - settle;
      if (t < firstArrives) {
        var k0 = ease(seg(t, firstArrives - comeIn, firstArrives));
        return [lerp(first.x + 22, first.x, k0), lerp(first.y + 28, first.y, k0), k0];
      }
      for (var i = 0; i < taps.length; i++) {
        var tap = taps[i];
        var leaves = tap.at + linger;
        if (t <= leaves) return [tap.x, tap.y, 1];
        if (i + 1 >= taps.length) break;
        var next = taps[i + 1];
        var nextArrives = next.at - settle;
        if (t >= nextArrives) continue;
        if (nextArrives - leaves <= travelGap) {
          var k1 = ease(seg(t, leaves, nextArrives));
          return [lerp(tap.x, next.x, k1), lerp(tap.y, next.y, k1), 1];
        }
        var out = seg(t, leaves, leaves + 0.35);
        if (t < leaves + 0.35) return [tap.x + 14 * out, tap.y + 18 * out, 1 - out];
        var k2 = ease(seg(t, nextArrives - comeIn, nextArrives));
        return [lerp(next.x + 22, next.x, k2), lerp(next.y + 28, next.y, k2), k2];
      }
      var gone = seg(t, last.at + linger, last.at + linger + 0.35);
      return [last.x + 14 * gone, last.y + 18 * gone, 1 - gone];
    }
    function press(t) {
      var sunk = 0;
      taps.forEach(function (tap) { sunk += seg(t, tap.at - 0.08, tap.at) * (1 - seg(t, tap.at, tap.at + 0.14)); });
      return 1 - 0.16 * Math.min(sunk, 1);
    }
    return function (t) {
      var p = pose(t);
      move(tip, p[0], p[1], press(t));
      op(tip, p[2]);
      taps.forEach(function (tap, i) {
        var k = seg(t, tap.at, tap.at + 0.45);
        var c = ripples[i];
        c.setAttribute('cx', tap.x);
        c.setAttribute('cy', tap.y);
        c.setAttribute('r', 15 * lerp(0.5, 2.0, easeOut(k)));
        op(c, k > 0 && k < 1 ? (1 - k) * 0.6 : 0);
      });
    };
  }

  /** What a stage needs to start: a clip to its rounded card, and a group whose opacity is the loop's fade. */
  function canvas(svg, length, fadeIn, fadeOut) {
    var defs = el(svg, 'defs');
    var clipId = uid('clip');
    el(el(defs, 'clipPath', { id: clipId }), 'rect', { x: 0, y: 0, width: 342, height: 320, rx: 24 });
    card(svg, 342, 320, 24);
    var root = el(svg, 'g', { 'clip-path': 'url(#' + clipId + ')' });
    var content = el(root, 'g');
    return {
      content: content,
      fade: function (t) {
        op(content, Math.min(seg(t, 0, fadeIn || 0.3), 1 - seg(t, length - (fadeOut || 0.4), length)));
      }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // 1. The watch listens, and keeps only the speech (ListeningStage). Below, the detector sleeps in
  //    the quiet and wakes for speech, and the battery barely moves.

  var Listening = {
    w: 330, h: 230, length: 8, still: 5.9,
    build: function (svg) {
      var levels = [
        0.08, 0.06, 0.10, 0.07,
        0.45, 0.70, 0.95, 0.60, 0.85, 0.55, 0.35,
        0.09, 0.07, 0.06, 0.10, 0.08, 0.07,
        0.40, 0.80, 1.00, 0.70, 0.90, 0.60, 0.75, 0.30,
        0.07, 0.09, 0.06, 0.08, 0.10,
        0.50, 0.85, 0.65, 0.40, 0.20,
        0.07
      ];
      var bursts = [[4, 10], [17, 24], [30, 34]];
      var left = 24, span = 282, step = span / 36, scanStart = 0.6, scanEnd = 5.4;
      function x(i) { return left + step * (i + 0.5); }
      function pass(i) { return lerp(scanStart, scanEnd, (x(i) - left) / span); }

      var defs = el(svg, 'defs');
      var gid = uid('scan');
      var grad = el(defs, 'linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 0 });
      el(grad, 'stop', { offset: 0, style: 'stop-color:var(--hl);stop-opacity:0' });
      el(grad, 'stop', { offset: 1, style: 'stop-color:var(--hl);stop-opacity:0.25' });

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var bars = levels.map(function (level, i) {
        return {
          level: level, i: i, speech: level > 0.15,
          grey: el(root, 'rect', { fill: 'ink3' }),
          lime: level > 0.15 ? el(root, 'rect', { fill: 'hl' }) : null
        };
      });
      var scan = el(root, 'g');
      var glow = el(scan, 'rect', { width: 36, height: 96, y: 24, fill: 'url(#' + gid + ')' });
      var beam = el(scan, 'rect', { fill: 'hl' });
      el(root, 'rect', { x: left, y: 141, width: span, height: 18, rx: 9, fill: 'tile' });
      var blocks = bursts.map(function () { return el(root, 'rect', { fill: 'hl' }); });
      var det = el(root, 'g');
      el(det, 'rect', { x: -18, y: -18, width: 36, height: 36, rx: 11, fill: 'tile' });
      var detOn = el(det, 'rect', { x: -18, y: -18, width: 36, height: 36, rx: 11, fill: 'hl' });
      var moon = icon(det, 'moon', 20, 'ink2', 'tile');
      var wave = icon(det, 'wave', 21, 'on-hl');
      el(root, 'rect', { x: 90, y: 199, width: 150, height: 2, rx: 1, fill: 'hair' });
      el(root, 'rect', { x: 266.25, y: 190.75, width: 38.5, height: 18.5, rx: 5.25, fill: 'none', stroke: 'ink2', 'stroke-width': 1.5 });
      el(root, 'rect', { x: 307.5, y: 196, width: 3, height: 8, rx: 1.5, fill: 'ink2' });
      var charge = el(root, 'rect', { x: 268.5, y: 194, height: 12, rx: 3, fill: 'hl' });

      return function (t) {
        op(root, loopFade(t, 8));
        bars.forEach(function (b) {
          var p = pass(b.i);
          var seen = easeOut(seg(t, p - 0.05, p + 0.3));
          var appear = easeOut(seg(t, 0.05 + 0.012 * b.i, 0.45 + 0.012 * b.i));
          var wobble = 1 + 0.08 * (1 - seen) * Math.sin(t * 6 + b.i);
          var h = Math.max(4, b.level * 64 * wobble) * appear;
          cap(b.grey, x(b.i), 72, 5, h);
          op(b.grey, b.speech ? 1 - seen : 1 - 0.65 * seen);
          if (b.lime) {
            cap(b.lime, x(b.i), 72, 5, h);
            op(b.lime, seen);
          }
        });
        var sx = lerp(left, left + span, seg(t, scanStart, scanEnd));
        op(scan, seg(t, scanStart - 0.2, scanStart) * (1 - seg(t, scanEnd, scanEnd + 0.3)));
        glow.setAttribute('x', sx - 36);
        cap(beam, sx, 72, 2.5, 96);
        var packed = 0;
        bursts.forEach(function (r, k) {
          var w = (r[1] - r[0] + 1) * step - 2;
          var fromX = x(r[0]) - step / 2 + w / 2;
          var toX = left + 6 + packed + w / 2;
          packed += w + 6;
          var done = pass(r[1]);
          var p = ease(seg(t, done, done + 0.55));
          cap(blocks[k], lerp(fromX, toX, p), lerp(112, 150, p), w, lerp(6, 12, p));
          op(blocks[k], seg(t, done, done + 0.1));
        });
        var active = 0;
        bursts.forEach(function (r) {
          var s = pass(r[0]), e = pass(r[1]);
          active = Math.max(active, seg(t, s - 0.1, s + 0.1) * (1 - seg(t, e, e + 0.2)));
        });
        move(det, 42, 200, 1 + 0.08 * active);
        op(detOn, active);
        op(moon, 1 - active);
        op(wave, active);
        charge.setAttribute('width', 34 * lerp(0.9, 0.86, seg(t, 0, 8)));
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 2. Speech becomes text, the audio goes, the details are picked out (TidyingStage).

  var Tidying = {
    w: 330, h: 230, length: 9, still: 7.2,
    build: function (svg, ctx) {
      var wave = [0.30, 0.50, 0.80, 0.60, 0.90, 0.70, 0.40, 0.25, 0.50, 0.85, 1.00,
        0.70, 0.55, 0.80, 0.60, 0.35, 0.50, 0.75, 0.90, 0.60, 0.40, 0.25];
      var waveLeft = 30, waveStep = 9.5, waveY = 48, binX = 292, tileX = 292;
      var rowYs = [116, 160, 204];
      var icons = ['calendar', 'checkCircle', 'clock'];
      var textLeft = 96, lengths = [140, 118, 92];

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var bars = wave.map(function () { return el(root, 'rect', { fill: 'hl' }); });
      var bin = el(root, 'g');
      el(bin, 'rect', { x: -18, y: -18, width: 36, height: 36, rx: 11, fill: 'tile' });
      icon(bin, 'trash', 21, 'ink2');
      var rowsG = el(root, 'g');
      var rows = rowYs.map(function (y, i) {
        var g = el(rowsG, 'g');
        var mine = i % 2 === 0;
        var tag = el(g, 'g');
        el(tag, 'rect', { x: -30, y: -11, width: 60, height: 22, rx: 11, fill: mine ? 'hl' : 'tile' });
        var label = txt(tag, mine ? ctx.words.me : ctx.words.other, 0, 0.5, 11, 700, mine ? 'on-hl' : 'ink', { anchor: 'middle' });
        fit(label, 52, 0.7);
        var tile = el(null, 'g');
        var r = {
          y: y, i: i, tag: tag,
          l1: el(g, 'rect', { fill: 'ink' }),
          l2: el(g, 'rect', { fill: 'ink' }),
          span: el(g, 'rect', { fill: 'hl' }),
          dot: el(g, 'circle', { r: 4.5, fill: 'hl' }),
          tile: tile
        };
        g.appendChild(tile);
        el(tile, 'rect', { x: -17, y: -17, width: 34, height: 34, rx: 11, fill: 'tile' });
        r.lit = el(tile, 'rect', { x: -17, y: -17, width: 34, height: 34, rx: 11, fill: 'hl' });
        r.off = icon(tile, icons[i], 19, 'ink3');
        r.on = icon(tile, icons[i], 19, 'on-hl');
        return r;
      });

      return function (t) {
        op(root, loopFade(t, 9));
        bars.forEach(function (b, i) {
          var appear = easeOut(seg(t, 0.1 + 0.02 * i, 0.5 + 0.02 * i));
          var live = 1 + 0.2 * Math.sin(t * 7 + i * 0.9);
          var go = ease(seg(t, 1.3 + 0.025 * i, 1.9 + 0.025 * i));
          var home = waveLeft + waveStep * i;
          var h = Math.max(3, wave[i] * 38 * live) * appear * (1 - 0.85 * go);
          cap(b, lerp(home, binX, go), waveY, 5, h);
          op(b, 1 - seg(t, 1.75 + 0.025 * i, 1.95 + 0.025 * i));
        });
        move(bin, binX, waveY, 1 + 0.16 * pulse(t, 1.7, 2.3));
        op(bin, easeOut(seg(t, 0.3, 0.7)) * (1 - seg(t, 2.4, 2.9)));
        rowsG.setAttribute('transform', 'translate(0 ' + (-36 * ease(seg(t, 2.5, 3.1))) + ')');
        rows.forEach(function (r) {
          var i = r.i, y = r.y, len = lengths[i];
          var start = 1.6 + 0.35 * i;
          var first = easeOut(seg(t, start, start + 0.5));
          var second = easeOut(seg(t, start + 0.15, start + 0.6));
          var pick = 3.4 + 0.9 * i;
          var span = easeOut(seg(t, pick, pick + 0.4));
          var travel = ease(seg(t, pick + 0.35, pick + 0.8));
          var travelShown = seg(t, pick + 0.35, pick + 0.42) * (1 - seg(t, pick + 0.72, pick + 0.8));
          var lit = easeOut(seg(t, pick + 0.75, pick + 1.1));
          var tag = easeOut(seg(t, 2.4 + 0.15 * i, 2.75 + 0.15 * i));
          move(r.tag, 58, y, 0.6 + 0.4 * tag);
          op(r.tag, tag);
          cap(r.l1, textLeft + len * first / 2, y - 7, len * first, 8);
          cap(r.l2, textLeft + len * 0.62 * second / 2, y + 7, len * 0.62 * second, 8);
          cap(r.span, textLeft + len - 25 * span, y - 7, 50 * span, 8);
          r.dot.setAttribute('cx', lerp(textLeft + len - 10, tileX - 24, travel));
          r.dot.setAttribute('cy', lerp(y - 7, y, travel));
          op(r.dot, travelShown);
          move(r.tile, tileX, y, 0.8 + 0.2 * lit + 0.12 * pulse(t, pick + 0.75, pick + 1.15));
          op(r.tile, seg(t, 3.0, 3.3));
          op(r.lit, lit);
          op(r.off, lit > 0.5 ? 0 : 1);
          op(r.on, lit > 0.5 ? 1 : 0);
        });
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 3. It all stays on the iPhone (PrivacyStage). The phone is a plain rounded shape.

  var Privacy = {
    w: 330, h: 230, length: 8, still: 5.0,
    build: function (svg) {
      var phone = { x: 112, y: 120 }, leaving = { x: 160, y: 118 }, edge = { x: 246, y: 78 }, cloudAt = { x: 272, y: 66 };
      var packets = [3.2, 4.7];
      function along(s) { return [lerp(leaving.x, edge.x, s), lerp(leaving.y, edge.y, s)]; }

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var path = el(root, 'line', {
        x1: leaving.x, y1: leaving.y, stroke: 'ink3', 'stroke-opacity': 0.7, 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-dasharray': '2 6'
      });
      var cloud = icon(root, 'cloudSlash', 52, 'ink3');
      move(cloud, cloudAt.x, cloudAt.y);
      el(root, 'rect', { x: phone.x - 47.5, y: phone.y - 82.5, width: 95, height: 165, rx: 24.5, fill: 'tile', stroke: 'ink3', 'stroke-width': 3 });
      el(root, 'rect', { x: phone.x - 14, y: phone.y - 71, width: 28, height: 6, rx: 3, fill: 'ink3' });
      var memories = [0, 1, 2].map(function () {
        var g = el(root, 'g');
        el(g, 'rect', { x: -35, y: -11, width: 70, height: 22, rx: 8, fill: 'card' });
        el(g, 'circle', { cx: -22.5, cy: 0, r: 3.5, fill: 'hl' });
        el(g, 'rect', { x: -13, y: -2.5, width: 34, height: 5, rx: 2.5, fill: 'ink2' });
        return g;
      });
      var lock = el(root, 'g');
      el(lock, 'circle', { r: 19, fill: 'hl' });
      var lockOpen = icon(lock, 'lockOpen', 20, 'on-hl');
      var lockShut = icon(lock, 'lockClosed', 20, 'on-hl');
      var gate = el(root, 'g');
      el(gate, 'circle', { r: 15, fill: 'hl' });
      icon(gate, 'stop', 20, 'on-hl');
      var dots = packets.map(function () { return el(root, 'circle', { r: 4.5, fill: 'hl' }); });

      return function (t) {
        op(root, loopFade(t, 8));
        var drawn = ease(seg(t, 2.4, 3.0));
        var end = along(drawn);
        path.setAttribute('x2', end[0]);
        path.setAttribute('y2', end[1]);
        op(path, drawn > 0 ? 1 : 0);
        op(cloud, easeOut(seg(t, 2.2, 2.7)));
        memories.forEach(function (g, i) {
          var s = 0.4 + 0.35 * i;
          var p = ease(seg(t, s, s + 0.7));
          move(g, lerp(30, phone.x, p), 84 + 28 * i);
          op(g, seg(t, s, s + 0.2));
        });
        var closed = seg(t, 2.0, 2.35);
        move(lock, phone.x, 176, 1 + 0.25 * pulse(t, 2.0, 2.5));
        op(lockOpen, 1 - closed);
        op(lockShut, closed);
        var jolt = 0;
        packets.forEach(function (p) { jolt = Math.max(jolt, pulse(t, p + 0.45, p + 0.7)); });
        var appear = easeOut(seg(t, 2.6, 3.0));
        var at = along(0.5);
        move(gate, at[0], at[1], (0.5 + 0.5 * appear) * (1 + 0.2 * jolt));
        op(gate, seg(t, 2.6, 2.9));
        packets.forEach(function (s, k) {
          var out = ease(seg(t, s, s + 0.55)), back = ease(seg(t, s + 0.55, s + 1.05));
          var pos = along(0.4 * (out - back));
          dots[k].setAttribute('cx', pos[0]);
          dots[k].setAttribute('cy', pos[1]);
          op(dots[k], seg(t, s, s + 0.1) * (1 - seg(t, s + 0.95, s + 1.05)));
        });
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 4. Tell the people around you (ConsentStage).

  var Consent = {
    w: 330, h: 230, length: 8, still: 5.6,
    build: function (svg) {
      var you = { x: 86, y: 150 }, other = { x: 244, y: 150 };
      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var link = el(root, 'line', { x1: you.x + 40, y1: you.y, y2: you.y, stroke: 'hl', 'stroke-width': 3, 'stroke-linecap': 'round' });
      var runners = [0, 1, 2].map(function () { return el(root, 'circle', { r: 4, cy: you.y, fill: 'hl' }); });
      function avatar(isYou) {
        var g = el(root, 'g');
        el(g, 'circle', { r: 32, fill: 'tile' });
        el(g, 'circle', { r: 30.5, fill: 'none', stroke: 'hair', 'stroke-width': 3 });
        var ring = el(g, 'circle', { r: 30.5, fill: 'none', stroke: 'hl', 'stroke-width': 3 });
        icon(g, 'person', 36, isYou ? 'ink' : 'ink2');
        if (isYou) {
          var b = el(g, 'g', { transform: 'translate(22 22)' });
          el(b, 'circle', { r: 12, fill: 'hl' });
          icon(b, 'watch', 16, 'on-hl');
        }
        return { g: g, ring: ring };
      }
      var a = avatar(true), b = avatar(false);
      function bubble(fill, leading) {
        var outer = el(root, 'g');
        var tx = leading ? -24 : 24;
        el(outer, 'rect', { x: tx - 7, y: 15, width: 14, height: 14, rx: 3, fill: fill, transform: 'rotate(45 ' + tx + ' 22)' });
        el(outer, 'rect', { x: -44, y: -23, width: 88, height: 46, rx: 16, fill: fill });
        return outer;
      }
      function place(g, cx, cy, s, leading) {
        var ax = leading ? -44 : 44;
        g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') translate(' + ax + ' 23) scale(' + s + ') translate(' + (-ax) + ' -23)');
      }
      var yourBubble = bubble('hl', true);
      var talk = [0, 1, 2, 3, 4].map(function () { return el(yourBubble, 'rect', { fill: 'on-hl' }); });
      var theirBubble = bubble('tile', false);
      var tick = el(theirBubble, 'g');
      icon(tick, 'check', 26, 'ink');

      return function (t) {
        op(root, loopFade(t, 8));
        var drawn = ease(seg(t, 3.6, 4.2)), running = seg(t, 4.2, 4.5);
        link.setAttribute('x2', lerp(you.x + 40, other.x - 40, drawn));
        op(link, drawn > 0 ? 1 : 0);
        runners.forEach(function (c, i) {
          var phase = Math.max(0, ((t - 4.2) * 0.5 + i / 3) % 1);
          c.setAttribute('cx', lerp(you.x + 40, other.x - 40, phase));
          op(c, running * Math.sin(Math.PI * phase));
        });
        var ya = easeOut(seg(t, 0.1, 0.5));
        move(a.g, you.x, you.y, 0.7 + 0.3 * ya);
        op(a.g, ya);
        var oa = easeOut(seg(t, 0.25, 0.65));
        move(b.g, other.x, other.y, 0.7 + 0.3 * oa);
        op(b.g, oa);
        op(b.ring, easeOut(seg(t, 3.4, 3.9)));
        var yp = easeOut(seg(t, 0.7, 1.2));
        place(yourBubble, 112, 76, 0.6 + 0.4 * yp, true);
        op(yourBubble, yp);
        var talking = seg(t, 1.0, 1.2) * (1 - 0.6 * seg(t, 3.4, 3.8));
        talk.forEach(function (r, i) {
          cap(r, -16 + 8 * i, 0, 4, 8 + 14 * talking * Math.abs(Math.sin(t * 5 + i * 0.9)));
        });
        var tp = easeOut(seg(t, 2.4, 2.9));
        place(theirBubble, 218, 76, 0.6 + 0.4 * tp, false);
        op(theirBubble, tp);
        move(tick, 0, 0, 0.4 + 0.6 * easeOut(seg(t, 2.9, 3.2)));
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 5. Your own voice: lines tagged with who said them (VoiceStage).

  var Voice = {
    w: 330, h: 230, length: 7, still: 5.6,
    build: function (svg, ctx) {
      var specs = [[true, 190, 140], [false, 170, 90], [true, 200, 120], [false, 150, 110]];
      var ys = [62, 106, 150, 194];
      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var rows = specs.map(function (s, i) {
        var mine = s[0];
        var g = el(root, 'g');
        var ripple = null;
        if (mine) {
          ripple = el(g, 'g');
          el(ripple, 'rect', { x: -33, y: -11, width: 66, height: 22, rx: 11, fill: 'none', stroke: 'hl', 'stroke-width': 2 });
        }
        var tag = el(g, 'g');
        el(tag, 'rect', { x: -34, y: -12, width: 68, height: 24, rx: 12, fill: mine ? 'hl' : 'tile' });
        var label = txt(tag, mine ? ctx.words.me : ctx.words.other, 0, 0.5, 12, 700, mine ? 'on-hl' : 'ink', { anchor: 'middle' });
        fit(label, 60, 0.7);
        return {
          i: i, mine: mine, first: s[1], second: s[2], y: ys[i], ripple: ripple, tag: tag,
          l1: el(g, 'rect', { fill: mine ? 'ink' : 'ink3' }),
          l2: el(g, 'rect', { fill: mine ? 'ink' : 'ink3' })
        };
      });

      return function (t) {
        op(root, loopFade(t, 7));
        rows.forEach(function (r) {
          var start = 0.4 + 1.2 * r.i;
          var pop = easeOut(seg(t, start, start + 0.35));
          var first = easeOut(seg(t, start + 0.15, start + 0.65));
          var second = easeOut(seg(t, start + 0.5, start + 0.95));
          var ripple = seg(t, start + 0.1, start + 0.8);
          if (r.ripple) {
            move(r.ripple, 58, r.y, 1 + 0.45 * ripple);
            op(r.ripple, 0.8 * Math.sin(Math.PI * ripple));
          }
          move(r.tag, 58, r.y, 0.6 + 0.4 * pop);
          op(r.tag, pop);
          cap(r.l1, 104 + r.first * first / 2, r.y - 8, r.first * first, 9);
          cap(r.l2, 104 + r.second * second / 2, r.y + 8, r.second * second, 9);
        });
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 6. Asking about the day (AskDayStage): a question typed into the Ask page, the answer with the
  //    recordings it comes from marked by numbers, and a number opened on the line that was said.

  var AskDay = {
    w: 342, h: 320, length: 9.8, still: 5.9,
    build: function (svg, ctx) {
      var W = ctx.words.ask;
      var M = {
        focus: 0.7, typing: 1.0, typingEnd: 2.15, send: 2.45, bubble: 2.65, thinking: 3.0, answer: 4.0,
        lines: [4.15, 4.5], chips: [4.45, 4.8], sources: 5.0, scroll: 5.45, open: 6.5, sweep: 7.25
      };
      var scrolled = 48;

      var defs = el(svg, 'defs');
      var clipId = uid('clip'), maskId = uid('mask'), gradId = uid('fade');
      el(el(defs, 'clipPath', { id: clipId }), 'rect', { x: 0, y: 0, width: 342, height: 320, rx: 24 });
      var grad = el(defs, 'linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
      el(grad, 'stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 });
      el(grad, 'stop', { offset: 0.08, 'stop-color': '#fff', 'stop-opacity': 1 });
      el(grad, 'stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 });
      var mask = el(defs, 'mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 342, height: 320 });
      el(mask, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'url(#' + gradId + ')' });

      card(svg, 342, 320, 24);
      var root = el(svg, 'g', { 'clip-path': 'url(#' + clipId + ')' });
      var content = el(root, 'g');

      // The Ask page.
      var askPage = el(content, 'g');
      el(askPage, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      var home = el(askPage, 'g');
      fit(txt(home, W.title, 20, 31.8, 23, 700, 'ink'), 302, 0.7);
      fit(txt(home, W.sub, 20, 59.2, 12, 400, 'ink2'), 302, 0.8);
      txt(home, W.tryAsking, 20, 99.8, 13, 700, 'ink');
      function suggestion(name, str) {
        var s = el(home, 'g');
        el(s, 'rect', { x: 0, y: 0, width: 310, height: 44, rx: 16, fill: 'card' });
        el(s, 'rect', { x: 10, y: 8, width: 28, height: 28, rx: 8.7, fill: 'hl-soft' });
        move(icon(s, name, 17, 'on-hl-soft'), 24, 22);
        fit(txt(s, str, 48, 22, 11.5, 500, 'ink'), 228, 0.8);
        move(icon(s, 'arrowUpRight', 13, 'ink3'), 291, 22);
        return s;
      }
      var s1 = suggestion('calendar', W.s1), s2 = suggestion('people', W.s2);

      // The conversation, which scrolls under a soft top edge.
      var conv = el(el(askPage, 'g', { mask: 'url(#' + maskId + ')' }), 'g');
      var question = el(conv, 'g');
      var bubblePath = el(question, 'path', { fill: 'accent' });
      var qText = txt(question, W.question, 0, 16.5, 12.5, 400, 'on-accent');
      var qWidth = fit(qText, 260, 0.8);
      var bubbleW = qWidth + 28, bubbleX = 326 - bubbleW;
      bubblePath.setAttribute('d', corners(bubbleX, 0, bubbleW, 33, 18, 18, 5, 18));
      qText.setAttribute('x', bubbleX + 14);

      var thinking = el(conv, 'g', { transform: 'translate(20 62)' });
      var thinkDots = [0, 1, 2].map(function (i) { return el(thinking, 'circle', { cx: 2.75 + 9.5 * i, cy: 7.2, r: 2.75, fill: 'ink' }); });
      txt(thinking, W.thinking, 32.5, 7.2, 12, 400, 'ink2');

      var fromRow = el(conv, 'g');
      move(icon(fromRow, 'lockClosed', 12, 'ink2'), 6, 6.3);
      txt(fromRow, W.from, 16, 6.3, 10.5, 500, 'ink2');

      var answers = [W.a1, W.a2].map(function (str, k) {
        var g = el(conv, 'g');
        var w = fit(txt(g, str, 0, 9, 12.5, 400, 'ink'), 276, 0.8);
        var chip = el(g, 'g');
        el(chip, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 6, fill: 'hl' });
        txt(chip, String(k + 1), 0, 0.5, 9.5, 600, 'on-hl', { anchor: 'middle', mono: true });
        return { g: g, chip: chip, cx: w + 15, top: k === 0 ? 86 : 110 };
      });

      var sourcesLabel = txt(conv, W.sources, 20, 140.6, 11, 600, 'ink2');
      function sourceCard(num, when, snippet) {
        var c = el(conv, 'g');
        el(c, 'rect', { x: 0, y: 0, width: 310, height: 54, rx: 16, fill: 'card' });
        var chip = el(c, 'g', { transform: 'translate(21 18)' });
        el(chip, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 6, fill: 'hl' });
        txt(chip, num, 0, 0.5, 9.5, 600, 'on-hl', { anchor: 'middle', mono: true });
        var whenW = width(txt(c, when, 37, 18, 10.5, 600, 'ink'));
        var wx = 37 + whenW + 7;
        move(icon(c, 'watch', 12, 'ink2'), wx + 6, 18);
        txt(c, W.watch, wx + 14, 18, 9.5, 400, 'ink2');
        move(icon(c, 'chevronRight', 11, 'ink3'), 294, 18);
        var sn = txt(c, snippet, 12, 38.3, 10.5, 400, 'ink');
        sn.setAttribute('fill-opacity', 0.85);
        fit(sn, 286, 0.85);
        return c;
      }
      var card1 = sourceCard('1', W.today + ' 14:10', W.snip1);
      var card2 = sourceCard('2', W.today + ' 14:11', W.snip2);

      // The input bar, above the conversation.
      var bar = el(askPage, 'g', { transform: 'translate(16 218)' });
      el(bar, 'rect', { x: 0.5, y: 0.5, width: 309, height: 43, rx: 21.5, fill: 'card', stroke: 'hair', 'stroke-width': 1 });
      var placeholder = txt(bar, W.placeholder, 16, 22, 12.5, 400, 'ink3');
      var typedText = txt(bar, '', 16, 22, 12.5, 400, 'ink');
      var measure = txt(bar, W.question, 16, 22, 12.5, 400, 'ink');
      op(measure, 0);
      var chars = Array.from(W.question);
      var full = width(measure);
      var prefix = chars.map(function (c, k) {
        try { return measure.getSubStringLength(0, k); } catch (err) { return full * k / chars.length; }
      });
      prefix.push(full);
      bar.removeChild(measure);
      var caret = el(bar, 'rect', { y: 14.5, width: 1.5, height: 15, fill: 'ink' });
      var send = el(bar, 'g');
      el(send, 'circle', { r: 16, fill: 'tile' });
      var sendOn = el(send, 'circle', { r: 16, fill: 'accent' });
      var arrowOff = icon(send, 'arrowUp', 15, 'ink3');
      var arrowOn = icon(send, 'arrowUp', 15, 'on-accent');
      var lastTyped = null;

      // The recording a source opens.
      var detail = el(content, 'g');
      el(detail, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      fit(txt(detail, W.office, 20, 26.5, 17, 700, 'ink'), 200, 0.8);
      txt(detail, '14:10–14:25', 322, 28, 10.5, 400, 'ink2', { anchor: 'end', mono: true });
      var transcript = [
        { time: '14:09', who: ctx.words.me, mine: true, line: W.row0 },
        { time: '14:10', who: ctx.words.other, mine: false, line: W.snip1, cited: true },
        { time: '14:11', who: ctx.words.me, mine: true, line: W.snip2 }
      ].map(function (r, k) {
        var g = el(detail, 'g', { transform: 'translate(16 ' + (56 + 50 * k) + ')' });
        var out = {};
        if (r.cited) out.mark = el(g, 'rect', { x: 0, y: 0, height: 48, rx: 12, fill: 'hl-soft' });
        out.time = txt(g, r.time, 10, 14, 10, 400, 'ink2', { mono: true });
        if (r.cited) out.timeOn = txt(g, r.time, 10, 14, 10, 400, 'on-hl-soft', { mono: true });
        var tag = el(g, 'g', { transform: 'translate(54 7)' });
        var tagBox = el(tag, 'rect', { x: 0, y: 0, height: 13.8, rx: 5, fill: r.mine ? 'hl-soft' : 'tile' });
        var tagW = width(txt(tag, r.who, 5, 6.9, 9, 600, r.mine ? 'on-hl-soft' : 'ink2'));
        tagBox.setAttribute('width', tagW + 10);
        if (r.cited) {
          out.cite = el(g, 'g', { transform: 'translate(' + (54 + tagW + 15) + ' 7)' });
          var citeBox = el(out.cite, 'rect', { x: 0, y: 0, height: 13.8, rx: 5, fill: 'hl' });
          citeBox.setAttribute('width', width(txt(out.cite, W.cited, 5, 6.9, 9, 600, 'on-hl')) + 10);
        }
        fit(txt(g, r.line, 54, 32, 12, 400, 'ink'), 246, 0.8);
        return out;
      })[1];

      // The tab bar.
      var tabs = el(content, 'g', { transform: 'translate(0 270)' });
      el(tabs, 'rect', { x: 0, y: 0, width: 342, height: 50, fill: 'card' });
      el(tabs, 'rect', { x: 0, y: 0, width: 342, height: 1, fill: 'hair' });
      ['sun', 'list', 'chat', 'history'].forEach(function (name, i) {
        var cx = 42.75 + 85.5 * i;
        var color = i === 2 ? 'on-hl-soft' : 'ink3';
        move(icon(tabs, name, 20, color), cx, 18.5);
        txt(tabs, W.tabs[i], cx, 37, 9.5, 500, color, { anchor: 'middle' });
      });

      // The finger.
      var taps = [
        { x: 171, y: 240, at: M.focus },
        { x: 303, y: 240, at: M.send },
        { x: 171, y: 152 + 25 - scrolled, at: M.open }
      ];
      var fingerLayer = el(content, 'g');
      var ripples = taps.map(function () {
        return el(fingerLayer, 'circle', { r: 15, fill: 'none', stroke: 'ink', 'stroke-opacity': 0.4, 'stroke-width': 2 });
      });
      var tip = el(fingerLayer, 'g');
      el(tip, 'circle', { r: 14, fill: 'ink', 'fill-opacity': 0.16 });
      el(tip, 'circle', { r: 13, fill: 'none', stroke: 'ink', 'stroke-opacity': 0.5, 'stroke-width': 2 });

      var comeIn = 0.5, settle = 0.14, linger = 0.2, travelGap = 1.0;
      function pose(t) {
        var first = taps[0], last = taps[taps.length - 1];
        var firstArrives = first.at - settle;
        if (t < firstArrives) {
          var k0 = ease(seg(t, firstArrives - comeIn, firstArrives));
          return [lerp(first.x + 22, first.x, k0), lerp(first.y + 28, first.y, k0), k0];
        }
        for (var i = 0; i < taps.length; i++) {
          var tap = taps[i];
          var leaves = tap.at + linger;
          if (t <= leaves) return [tap.x, tap.y, 1];
          if (i + 1 >= taps.length) break;
          var next = taps[i + 1];
          var nextArrives = next.at - settle;
          if (t >= nextArrives) continue;
          if (nextArrives - leaves <= travelGap) {
            var k1 = ease(seg(t, leaves, nextArrives));
            return [lerp(tap.x, next.x, k1), lerp(tap.y, next.y, k1), 1];
          }
          var out = seg(t, leaves, leaves + 0.35);
          if (t < leaves + 0.35) return [tap.x + 14 * out, tap.y + 18 * out, 1 - out];
          var k2 = ease(seg(t, nextArrives - comeIn, nextArrives));
          return [lerp(next.x + 22, next.x, k2), lerp(next.y + 28, next.y, k2), k2];
        }
        var gone = seg(t, last.at + linger, last.at + linger + 0.35);
        return [last.x + 14 * gone, last.y + 18 * gone, 1 - gone];
      }
      function press(t) {
        var sunk = 0;
        taps.forEach(function (tap) { sunk += seg(t, tap.at - 0.08, tap.at) * (1 - seg(t, tap.at, tap.at + 0.14)); });
        return 1 - 0.16 * Math.min(sunk, 1);
      }

      return function (t) {
        op(content, Math.min(seg(t, 0, 0.3), 1 - seg(t, AskDay.length - 0.4, AskDay.length)));

        var push = ease(seg(t, M.open + 0.1, M.open + 0.5));
        askPage.setAttribute('transform', 'translate(' + (-push * 342 * 0.28) + ' 0)');
        op(askPage, 1 - seg(push, 0.85, 1));
        op(home, 1 - seg(t, M.send + 0.05, M.send + 0.35));
        [[s1, 114, 0.35], [s2, 164, 0.5]].forEach(function (s) {
          var x = easeOut(seg(t, s[2], s[2] + 0.3));
          s[0].setAttribute('transform', 'translate(16 ' + (s[1] + (1 - x) * 8) + ')');
          op(s[0], x);
        });

        conv.setAttribute('transform', 'translate(0 ' + (-scrolled * ease(seg(t, M.scroll, M.scroll + 0.5))) + ')');
        var bubbleIn = easeOut(seg(t, M.bubble, M.bubble + 0.3));
        question.setAttribute('transform', 'translate(0 ' + (16 + (1 - bubbleIn) * 10) + ')');
        op(question, bubbleIn);
        op(thinking, seg(t, M.thinking, M.thinking + 0.15) * (1 - seg(t, M.answer - 0.1, M.answer + 0.05)));
        thinkDots.forEach(function (d, i) { op(d, 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 8 - i * 1.1))); });
        var intro = seg(t, M.answer, M.answer + 0.3);
        fromRow.setAttribute('transform', 'translate(20 ' + (62 + (1 - intro) * 6) + ')');
        op(fromRow, intro);
        answers.forEach(function (a, k) {
          var x = easeOut(seg(t, M.lines[k], M.lines[k] + 0.3));
          a.g.setAttribute('transform', 'translate(20 ' + (a.top + (1 - x) * 6) + ')');
          op(a.g, x);
          var chip = spring(seg(t, M.chips[k], M.chips[k] + 0.35));
          move(a.chip, a.cx, 9, lerp(0.4, 1, chip));
          op(a.chip, chip);
        });
        var sources = easeOut(seg(t, M.sources, M.sources + 0.3));
        var sources2 = easeOut(seg(t, M.sources + 0.2, M.sources + 0.5));
        op(sourcesLabel, sources);
        card1.setAttribute('transform', 'translate(16 ' + (152 + (1 - sources) * 8) + ')');
        op(card1, sources);
        card2.setAttribute('transform', 'translate(16 ' + (208 + (1 - sources2) * 8) + ')');
        op(card2, sources2);

        var sending = t >= M.send + 0.05;
        var shown = sending ? '' : typed(W.question, seg(t, M.typing, M.typingEnd));
        if (shown !== lastTyped) {
          typedText.textContent = shown;
          lastTyped = shown;
        }
        var count = Array.from(shown).length;
        op(placeholder, count ? 0 : 1);
        caret.setAttribute('x', 16 + prefix[count] + 1);
        op(caret, t >= M.focus && !sending && Math.sin(t * 9) > -0.2 ? 1 : 0);
        move(send, 288, 22, 1 - 0.14 * pulse(t, M.send - 0.05, M.send + 0.2));
        op(sendOn, count ? 1 : 0);
        op(arrowOn, count ? 1 : 0);
        op(arrowOff, count ? 0 : 1);

        detail.setAttribute('transform', 'translate(' + ((1 - push) * 342) + ' 0)');
        op(detail, push > 0 ? 1 : 0);
        var marked = ease(seg(t, M.sweep, M.sweep + 0.45));
        transcript.mark.setAttribute('width', 310 * Math.max(0.001, marked));
        op(transcript.time, marked > 0.5 ? 0 : 1);
        op(transcript.timeOn, marked > 0.5 ? 1 : 0);
        op(transcript.cite, seg(t, M.sweep + 0.35, M.sweep + 0.6));

        var p = pose(t);
        move(tip, p[0], p[1], press(t));
        op(tip, p[2]);
        taps.forEach(function (tap, i) {
          var k = seg(t, tap.at, tap.at + 0.45);
          var c = ripples[i];
          c.setAttribute('cx', tap.x);
          c.setAttribute('cy', tap.y);
          c.setAttribute('r', 15 * lerp(0.5, 2.0, easeOut(k)));
          op(c, k > 0 && k < 1 ? (1 - k) * 0.6 : 0);
        });
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // The site's own pictures for the highlights, in the same style.

  /** Sets a line's size so its whole text fits in `maxW`, before it is typed in. */
  function fitTyped(e, str, maxW) {
    e.textContent = str;
    var w = width(e);
    if (w > maxW) e.setAttribute('font-size', parseFloat(e.getAttribute('font-size')) * Math.max(0.72, maxW / w));
    e.textContent = '';
  }

  // 7. A workday on the watch: the talking is kept as the day goes by, and the share of the
  //    battery that listening takes grows only a sliver. The extra use per hour comes from the
  //    page (data-per-hour), which says how it was measured.

  var Battery = {
    w: 330, h: 230, length: 8.5, still: 6.6,
    build: function (svg, ctx) {
      var B = ctx.words.battery;
      var perHour = parseFloat(ctx.host.getAttribute('data-per-hour')) || 0.9;
      var left = 24, span = 282, hours = 9, from = 0.9, to = 5.9;
      var talks = [[0.35, 1.15], [1.9, 2.3], [4.5, 5.45], [6.05, 6.35], [7.3, 8.3]];
      function hx(h) { return left + span * h / hours; }

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      el(root, 'rect', { x: 20, y: 21, width: 34, height: 34, rx: 11, fill: 'hl' });
      move(icon(root, 'watch', 20, 'on-hl'), 37, 38);
      fit(txt(root, B.title, 66, 31, 13.5, 700, 'ink'), 130, 0.8);
      txt(root, B.hours, 66, 47, 10.5, 500, 'ink2', { mono: true });
      var clock = txt(root, '9:00', 308, 38.5, 22, 600, 'ink', { anchor: 'end', mono: true });

      el(root, 'rect', { x: left, y: 111, width: span, height: 2, rx: 1, fill: 'hair' });
      var passed = el(root, 'rect', { x: left, y: 111, height: 2, rx: 1, fill: 'ink3' });
      var blocks = talks.map(function () { return el(root, 'rect', { fill: 'hl' }); });
      B.ticks.forEach(function (label, i) {
        el(root, 'rect', { x: hx(3 * i) - 0.75, y: 124, width: 1.5, height: 5, rx: 0.75, fill: 'ink3' });
        txt(root, label, hx(3 * i), 141, 10, 500, 'ink3', { anchor: i === 0 ? 'start' : i === 3 ? 'end' : 'middle', mono: true });
      });
      var head = el(root, 'g');
      el(head, 'rect', { x: -1.25, y: -22, width: 2.5, height: 44, rx: 1.25, fill: 'accent' });
      el(head, 'circle', { cx: 0, cy: -22, r: 4, fill: 'accent' });

      // The whole track is a full battery; the lime part is what listening has used so far.
      fit(txt(root, B.used, left, 169, 11, 600, 'ink2'), 200, 0.8);
      var readout = txt(root, percent(0, 1), 306, 169, 15, 700, 'ink', { anchor: 'end' });
      readout.style.fontVariantNumeric = 'tabular-nums';
      el(root, 'rect', { x: left, y: 182, width: span, height: 12, rx: 6, fill: 'tile' });
      var share = el(root, 'rect', { x: left, y: 182, height: 12, rx: 6, fill: 'hl' });
      txt(root, percent(0, 0), left, 207, 9.5, 500, 'ink3', { mono: true });
      txt(root, percent(100, 0), 306, 207, 9.5, 500, 'ink3', { anchor: 'end', mono: true });
      var lastClock = '', lastReadout = '';

      return function (t) {
        op(root, loopFade(t, Battery.length));
        var now = hours * seg(t, from, to);
        var x = hx(now);
        passed.setAttribute('width', Math.max(0, x - left));
        talks.forEach(function (r, k) {
          var a = hx(r[0]), b = hx(Math.min(r[1], Math.max(r[0], now)));
          cap(blocks[k], (a + b) / 2, 112, b - a, lerp(4, 18, easeOut(seg(now, r[0], r[0] + 0.3))));
          op(blocks[k], now > r[0] ? 1 : 0);
        });
        move(head, x, 112);
        op(head, seg(t, from - 0.3, from) * (1 - seg(t, to + 0.2, to + 0.6)));
        var minutes = Math.floor(now * 60 + 1e-6);
        var hhmm = (9 + Math.floor(minutes / 60)) + ':' + ('0' + (minutes % 60)).slice(-2);
        if (hhmm !== lastClock) {
          clock.textContent = hhmm;
          lastClock = hhmm;
        }
        var used = perHour * now;
        share.setAttribute('width', used > 0 ? Math.max(12, span * used / 100) : 0);
        var shown = percent(used, 1);
        if (shown !== lastReadout) {
          readout.textContent = shown;
          lastReadout = shown;
        }
      };
    }
  };

  // 8. Several voices in one conversation: each line is heard, then marked Me, Other 1 or Other 2,
  //    and the voices met so far gather at the top.

  var Speakers = {
    w: 330, h: 230, length: 9, still: 7.2,
    build: function (svg, ctx) {
      var S = ctx.words.speakers;
      var names = [ctx.words.me, ctx.words.other, ctx.words.other2];
      var who = [0, 1, 2, 0], ys = [80, 118, 156, 194], starts = [0.5, 1.75, 3.0, 4.25];

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var placeW = fit(txt(root, S.place, 20, 36, 14, 700, 'ink'), 150, 0.8);
      txt(root, S.time, 20 + placeW + 8, 36.5, 10.5, 400, 'ink2', { mono: true });
      var faces = [0, 1, 2].map(function (k) {
        var g = el(root, 'g');
        el(g, 'circle', { r: 14, fill: 'card' });
        el(g, 'circle', { r: 12, fill: k === 0 ? 'hl' : 'tile' });
        icon(g, 'person', 15, k === 0 ? 'on-hl' : 'ink2');
        return g;
      });

      var rows = who.map(function (k, i) {
        var g = el(root, 'g');
        var ripple = el(g, 'rect', { fill: 'none', stroke: k === 0 ? 'hl' : 'ink3', 'stroke-width': 2 });
        var tag = el(g, 'g');
        var box = el(tag, 'rect', { fill: k === 0 ? 'hl' : 'tile' });
        var label = txt(tag, names[k], 0, 0.5, 11, 700, k === 0 ? 'on-hl' : 'ink', { anchor: 'middle' });
        var w = fit(label, 64, 0.7) + 18;
        [box, ripple].forEach(function (r) { put(r, { x: -w / 2, y: -11, width: w, height: 22, rx: 11 }); });
        return {
          k: k, i: i, y: ys[i], s: starts[i], w: w, ripple: ripple, tag: tag, text: S.lines[i], last: null,
          bars: [0, 1, 2, 3, 4, 5, 6].map(function () { return el(g, 'rect', { fill: 'ink3' }); }),
          line: txt(g, '', 0, ys[i] + 0.5, 12.5, 400, 'ink')
        };
      });
      var textX = 20 + Math.max.apply(null, rows.map(function (r) { return r.w; })) + 10;
      rows.forEach(function (r) {
        r.line.setAttribute('x', textX);
        fitTyped(r.line, r.text, 310 - textX);
      });

      return function (t) {
        op(root, loopFade(t, Speakers.length));
        rows.forEach(function (r) {
          var s = r.s;
          var heard = seg(t, s, s + 0.12) * (1 - seg(t, s + 0.5, s + 0.7));
          r.bars.forEach(function (b, j) {
            cap(b, textX + 4 + 9 * j, r.y, 4, (4 + 12 * Math.abs(Math.sin(t * 9 + j * 1.3 + r.i))) * seg(t, s, s + 0.2));
            op(b, heard);
          });
          var pop = easeOut(seg(t, s + 0.35, s + 0.7));
          move(r.tag, 20 + r.w / 2, r.y, 0.6 + 0.4 * pop);
          op(r.tag, pop);
          var rip = seg(t, s + 0.4, s + 1.0);
          move(r.ripple, 20 + r.w / 2, r.y, 1 + 0.35 * rip);
          op(r.ripple, 0.8 * Math.sin(Math.PI * rip));
          var shown = typed(r.text, seg(t, s + 0.55, s + 1.15));
          if (shown !== r.last) {
            r.line.textContent = shown;
            r.last = shown;
          }
        });
        faces.forEach(function (f, k) {
          var first = starts[who.indexOf(k)];
          move(f, 266 + 18 * k, 36, lerp(0.3, 1, spring(seg(t, first + 0.4, first + 0.8))));
          op(f, seg(t, first + 0.4, first + 0.55));
        });
      };
    }
  };

  // 9. Languages: the working language in use lights up as the talk switches; each part is
  //    written in the language it was spoken in, and the other languages are translated into
  //    yours (data-translate="off" leaves the translations out).

  var Languages = {
    w: 330, h: 230, length: 10, still: 7.6,
    build: function (svg, ctx) {
      var L = ctx.words.languages;
      var translate = ctx.host.getAttribute('data-translate') !== 'off';
      var starts = [0.8, 2.2, 3.6], turns = [5.2, 5.8];
      var ys = translate ? [100, 136, 186] : [104, 144, 184];
      var lit = translate ?
        [[0, 0.8, 2.2], [1, 2.2, 3.6], [2, 3.6, 5.0], [0, 5.0, 9.6]] :
        [[0, 0.8, 2.2], [1, 2.2, 3.6], [2, 3.6, 9.6]];

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      txt(root, L.label, 20, 28, 10.5, 600, 'ink2');
      var cx = 20;
      var chips = L.names.map(function (name) {
        var g = el(root, 'g');
        var box = el(g, 'rect', { x: 0, y: -12, height: 24, rx: 12, fill: 'tile' });
        var on = el(g, 'rect', { x: 0, y: -12, height: 24, rx: 12, fill: 'hl' });
        var off = txt(g, name, 12, 0.5, 11.5, 600, 'ink2');
        var onText = txt(g, name, 12, 0.5, 11.5, 600, 'on-hl');
        var w = width(off) + 24;
        box.setAttribute('width', w);
        on.setAttribute('width', w);
        var chip = { g: g, on: on, off: off, onText: onText, x: cx };
        cx += w + 8;
        return chip;
      });
      el(root, 'rect', { x: 20, y: 76, width: 290, height: 1, fill: 'hair' });

      var rows = L.rows.map(function (r, k) {
        var g = el(root, 'g', { transform: 'translate(0 ' + ys[k] + ')' });
        var x = 20, tag = null;
        if (k > 0) {
          tag = el(g, 'g');
          var tagBox = el(tag, 'rect', { x: 20, y: -8.5, height: 17, rx: 6, fill: 'tile' });
          var tagW = width(txt(tag, L.names[k], 27, 0.5, 9.5, 600, 'ink2')) + 14;
          tagBox.setAttribute('width', tagW);
          x += tagW + 8;
        }
        var line = txt(g, '', x, 0.5, 12.5, 400, 'ink');
        line.setAttribute('lang', r.lang);
        fitTyped(line, r.text, 310 - x);
        var row = { tag: tag, line: line, text: r.text, last: null };
        if (translate && r.tr) {
          row.turn = el(g, 'g');
          move(icon(row.turn, 'turn', 13, 'ink3'), x + 6, 20.5);
          row.trLine = txt(g, '', x + 18, 21, 11.5, 500, 'ink2');
          row.trLine.setAttribute('lang', ctx.lang);
          fitTyped(row.trLine, r.tr, 310 - x - 18);
          row.trText = r.tr;
          row.trLast = null;
        }
        return row;
      });

      return function (t) {
        op(root, loopFade(t, Languages.length));
        chips.forEach(function (c, k) {
          var a = easeOut(seg(t, 0.2 + 0.12 * k, 0.55 + 0.12 * k));
          move(c.g, c.x, 52 + (1 - a) * 6);
          op(c.g, a);
          var on = 0;
          lit.forEach(function (s) {
            if (s[0] === k) on = Math.max(on, seg(t, s[1], s[1] + 0.2) * (1 - seg(t, s[2], s[2] + 0.2)));
          });
          op(c.on, on);
          op(c.onText, on);
          op(c.off, 1 - on);
        });
        rows.forEach(function (r, k) {
          var s = starts[k];
          if (r.tag) {
            var pop = easeOut(seg(t, s, s + 0.3));
            r.tag.setAttribute('transform', 'translate(20 0) scale(' + (0.6 + 0.4 * pop) + ') translate(-20 0)');
            op(r.tag, pop);
          }
          var shown = typed(r.text, seg(t, s + 0.15, s + 0.85));
          if (shown !== r.last) {
            r.line.textContent = shown;
            r.last = shown;
          }
          if (r.trLine) {
            var a = turns[k - 1];
            op(r.turn, easeOut(seg(t, a, a + 0.25)));
            var trShown = typed(r.trText, seg(t, a + 0.1, a + 0.7));
            if (trShown !== r.trLast) {
              r.trLine.textContent = trShown;
              r.trLast = trShown;
            }
          }
        });
      };
    }
  };

  // 10. The watch on its own: with the iPhone away it keeps listening and holds the clips, then
  //     hands them over at the two-hour sync once the iPhone is back, where they become text.

  var Sync = {
    w: 330, h: 230, length: 9, still: 7.2,
    build: function (svg, ctx) {
      var S = ctx.words.sync;
      var watch = { x: 84, y: 140 }, phone = { x: 250, y: 140 };
      var clips = [1.3, 2.3, 3.3], back = 4.4, sends = [4.9, 5.25, 5.6];
      var from = 0.6, to = 4.2;

      card(svg, 330, 230, 28);
      var root = el(svg, 'g');
      var clock = txt(root, '9:00', 20, 34, 20, 600, 'ink', { mono: true });
      var status = txt(root, S.away, 20, 58, 11.5, 600, 'ink2');
      el(root, 'line', {
        x1: watch.x + 46, y1: watch.y, x2: phone.x - 42, y2: phone.y, stroke: 'ink3', 'stroke-opacity': 0.7,
        'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '2 6'
      });

      var ph = el(root, 'g');
      el(ph, 'rect', { x: -31, y: -58, width: 62, height: 116, rx: 16, fill: 'tile', stroke: 'ink3', 'stroke-width': 2.5 });
      el(ph, 'rect', { x: -9, y: -49, width: 18, height: 4, rx: 2, fill: 'ink3' });
      var rows = [34, 26, 30].map(function (w, i) {
        var g = el(ph, 'g', { transform: 'translate(0 ' + (-24 + 17 * i) + ')' });
        el(g, 'circle', { cx: -16, cy: 0, r: 3, fill: 'hl' });
        el(g, 'rect', { x: -9, y: -3, width: w, height: 6, rx: 3, fill: 'ink2' });
        return g;
      });

      var tile = el(root, 'g');
      el(tile, 'rect', { x: -38, y: -38, width: 76, height: 76, rx: 23, fill: 'tile' });
      var lit = el(tile, 'rect', { x: -38, y: -38, width: 76, height: 76, rx: 23, fill: 'hl' });
      var idle = icon(tile, 'watch', 36, 'ink2', 'tile');
      var busy = icon(tile, 'watch', 36, 'on-hl');
      var badge = el(root, 'g');
      el(badge, 'circle', { r: 12.5, fill: 'accent' });
      var count = txt(badge, '0', 0, 0.5, 11.5, 700, 'on-accent', { anchor: 'middle' });
      var packets = sends.map(function () { return el(root, 'circle', { r: 5, fill: 'hl' }); });
      var lastClock = '', lastStatus = '', lastCount = '';

      return function (t) {
        op(root, loopFade(t, Sync.length));
        var minutes = Math.floor(120 * seg(t, from, to) + 1e-6);
        var hhmm = (9 + Math.floor(minutes / 60)) + ':' + ('0' + (minutes % 60)).slice(-2);
        if (hhmm !== lastClock) {
          clock.textContent = hhmm;
          lastClock = hhmm;
        }
        var recorded = clips.filter(function (c) { return t >= c + 0.3; }).length;
        var sent = sends.filter(function (s) { return t >= s + 0.5; }).length;
        var waiting = recorded - sent;
        var word = t >= sends[2] + 0.6 ? S.synced : t >= back ? S.syncing :
          waiting > 0 ? S.waiting.replace('{n}', waiting) + ' · ' + S.away : S.away;
        if (word !== lastStatus) {
          status.textContent = word;
          lastStatus = word;
        }
        var active = 0;
        clips.forEach(function (c) { active = Math.max(active, seg(t, c - 0.1, c + 0.1) * (1 - seg(t, c + 0.5, c + 0.8))); });
        move(tile, watch.x, watch.y, 1 + 0.06 * active);
        op(lit, active);
        op(idle, 1 - active);
        op(busy, active);
        move(badge, watch.x + 34, watch.y - 34, waiting > 0 ? 1 : 0.6);
        op(badge, waiting > 0 ? 1 : 0);
        if (String(waiting) !== lastCount) {
          count.textContent = String(waiting);
          lastCount = String(waiting);
        }
        var near = ease(seg(t, back, back + 0.5));
        move(ph, phone.x + 12 * (1 - near), phone.y);
        op(ph, 0.3 + 0.7 * near);
        rows.forEach(function (r, i) { op(r, easeOut(seg(t, sends[i] + 0.5, sends[i] + 0.8))); });
        packets.forEach(function (p, i) {
          var k = ease(seg(t, sends[i], sends[i] + 0.5));
          p.setAttribute('cx', lerp(watch.x + 40, phone.x - 34, k));
          p.setAttribute('cy', watch.y);
          op(p, k > 0 && k < 1 ? 1 : 0);
        });
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // The features, ported from the app's animation library (Animations/*.swift) so the page can
  // show what each one does: the same moments, positions and steps. `steps` are where each step
  // begins and the moment that shows it best; `preview` stands for the animation when it holds still.

  /** A line of a transcript (MiniTranscriptRow): time, who, the words; the marker sweeps over it. */
  function transcriptRow(parent, time, who, mine, str, maxW) {
    var g = el(parent, 'g');
    var o = { g: g };
    o.mark = el(g, 'rect', { x: 0, y: 0, width: 0.31, height: 48, rx: 12, fill: 'hl-soft' });
    o.time = txt(g, time, 10, 14, 10, 400, 'ink2', { mono: true });
    o.timeOn = txt(g, time, 10, 14, 10, 400, 'on-hl-soft', { mono: true });
    var tag = el(g, 'g', { transform: 'translate(54 7)' });
    var box = el(tag, 'rect', { x: 0, y: 0, height: 13.8, rx: 5, fill: mine ? 'hl-soft' : 'tile' });
    box.setAttribute('width', width(txt(tag, who, 5, 6.9, 9, 600, mine ? 'on-hl-soft' : 'ink2')) + 10);
    fit(txt(g, str, 54, 32, 12, 400, 'ink'), maxW || 246, 0.8);
    return o;
  }

  /** A heading of a card on a page, with a count after it. */
  function heading(parent, str, count) {
    var g = el(parent, 'g');
    var title = txt(g, str, 0, 0, 14, 700, 'ink');
    if (count == null) return { g: g };
    var w = width(title);
    var c = el(g, 'g', { transform: 'translate(' + (w + 6) + ' 0)' });
    var cw = 18;
    el(c, 'rect', { x: 0, y: -7.5, width: cw, height: 15, rx: 7.5, fill: 'hl' });
    var number = txt(c, count, cw / 2, 0.5, 10.5, 700, 'on-hl', { anchor: 'middle', mono: true });
    return {
      g: g, count: c,
      setCount: function (v) { if (number.textContent !== v) number.textContent = v; },
      pop: function (k) { c.setAttribute('transform', 'translate(' + (w + 6 + cw / 2 * (1 - lerp(0.4, 1, clamp(k)))) + ' 0) scale(' + lerp(0.4, 1, clamp(k)) + ')'); op(c, k); }
    };
  }

  /** A row of To confirm: what was picked up, with the check mark that accepts it. */
  function suggestedRow(parent, name, title, meta) {
    var g = el(parent, 'g');
    move(tile(g, name, 30, 'on-hl-soft', 'hl-soft'), 27, 28);
    fit(txt(g, title, 52, 21.3, 12, 600, 'ink'), 168, 0.8);
    fit(txt(g, meta, 52, 36.3, 9.5, 400, 'ink2'), 168, 0.8);
    var ck = el(g, 'g');
    el(ck, 'circle', { r: 15, fill: 'accent' });
    icon(ck, 'check', 13, 'on-accent');
    var no = el(g, 'g');
    move(no, 283, 28);
    el(no, 'circle', { r: 15, fill: 'tile' });
    icon(no, 'x', 12, 'ink2');
    var press = function (p) { move(ck, 243, 28, 1 - 0.15 * p); };
    press(0);
    return { g: g, press: press };
  }

  /** A row of what was accepted: a to-do with the line that says it is in Reminders, or an event. */
  function acceptedRow(parent, name, title, meta, reminderLabel) {
    var g = el(parent, 'g');
    move(tile(g, name, 30, 'on-hl-soft', 'hl-soft'), 27, 28);
    var o = { g: g };
    if (reminderLabel) {
      fit(txt(g, title, 52, 14.75, 12, 600, 'ink'), 168, 0.8);
      fit(txt(g, meta, 52, 29.75, 9.5, 400, 'ink2'), 168, 0.8);
      o.label = el(g, 'g');
      move(icon(o.label, 'list', 11, 'success'), 57.5, 43);
      txt(o.label, reminderLabel, 65, 43, 9, 600, 'success');
      move(el(g, 'circle', { r: 11, fill: 'none', stroke: 'ink3', 'stroke-width': 1.5 }), 283, 28);
    } else {
      fit(txt(g, title, 52, 21.3, 12, 600, 'ink'), 168, 0.8);
      fit(txt(g, meta, 52, 36.3, 9.5, 400, 'ink2'), 168, 0.8);
      move(icon(g, 'calendarCheck', 17, 'success'), 283, 28);
    }
    return o;
  }

  // 11. Confirm to-dos (ConfirmTodosAnimation.swift): picked out of the lines, waiting in To confirm,
  //     accepted into Reminders and the calendar.

  var Todos = {
    w: 342, h: 320, length: 10.6, preview: 4.2, still: 4.2,
    steps: [{ start: 0, still: 2.6 }, { start: 3.4, still: 5.9 }, { start: 6.4, still: 10.0 }],
    build: function (svg, ctx) {
      var W = ctx.words.todos, ME = ctx.words.me, OTHER = ctx.words.other;
      var M = {
        markTodo: 1.25, markEvent: 1.9, flyTodo: 2.65, flyEvent: 2.8, badge: 3.3, tab: 3.5,
        acceptTodo: 4.5, acceptEvent: 6.9, sheetIn: 7.0, add: 8.4, sheetOut: 8.55, eventMoves: 9.0
      };
      var tabPoint = [128, 287];
      var c = canvas(svg, Todos.length, 0.15, 0.35);
      var content = c.content;

      // A recording: the four lines, two of them picked from.
      var rec = el(content, 'g');
      el(rec, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      fit(txt(rec, W.office, 20, 26, 17, 700, 'ink'), 200, 0.8);
      txt(rec, '14:10–14:25', 322, 27, 10.5, 400, 'ink2', { anchor: 'end', mono: true });
      var rows = [['14:10', OTHER, false, W.l0], ['14:11', ME, true, W.l1], ['14:11', OTHER, false, W.l2], ['14:12', ME, true, W.l3]]
        .map(function (r, i) {
          var o = transcriptRow(rec, r[0], r[1], r[2], r[3], i === 1 || i === 2 ? 214 : 246);
          o.base = 56 + 50 * i;
          if (i === 1 || i === 2) o.tile = tile(o.g, i === 1 ? 'list' : 'calendar', 24, 'on-hl', 'hl');
          return o;
        });

      // To-dos: what waits to be confirmed, what was accepted.
      var tp = el(content, 'g');
      el(tp, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(tp, W.todos, 20, 24.5, 21, 700, 'ink');

      var confirmG = el(tp, 'g');
      var confirmHead = heading(confirmG, W.toConfirm, '2');
      move(confirmHead.g, 20, 64.5);
      txt(confirmG, ctx.words.ask.today, 20, 87, 11, 600, 'ink2');
      var confirmCard = el(confirmG, 'rect', { x: 16, y: 98, width: 310, height: 112, rx: 20, fill: 'card' });
      var hair = el(confirmG, 'rect', { x: 74, y: 153, width: 252, height: 1, fill: 'hair' });
      var sTodo = suggestedRow(confirmG, 'list', W.quote, W.dueMeta);
      var sEvent = suggestedRow(confirmG, 'calendar', W.sync, W.eventMeta);

      var myG = el(tp, 'g');
      move(heading(myG, W.myTodos).g, 20, 8.5);
      el(myG, 'rect', { x: 16, y: 20, width: 310, height: 56, rx: 20, fill: 'card' });
      var aTodo = acceptedRow(myG, 'list', W.quote, W.dueMeta, W.inReminders);
      aTodo.g.setAttribute('transform', 'translate(16 20)');
      var evG = el(tp, 'g');
      move(heading(evG, W.events).g, 20, 8.5);
      el(evG, 'rect', { x: 16, y: 20, width: 310, height: 56, rx: 20, fill: 'card' });
      var aEvent = acceptedRow(evG, 'calendar', W.sync, W.eventMeta, null);
      aEvent.g.setAttribute('transform', 'translate(16 20)');

      var tabs = tabBar(content, ctx.words.ask.tabs, 270);

      // The two things picked up, on their way to the To-dos tab.
      var flights = [[304, 133, M.flyTodo, 'list'], [304, 183, M.flyEvent, 'calendar']].map(function (f) {
        return { from: f, g: tile(content, f[3], 24, 'on-hl', 'hl') };
      });

      // The system's add-event sheet.
      var sheetG = el(content, 'g');
      var dim = el(sheetG, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: '#050505' });
      var sheet = el(sheetG, 'g');
      el(sheet, 'path', { d: corners(0, 0, 342, 252, 26, 26, 0, 0), fill: 'ground', stroke: 'hair', 'stroke-width': 1 });
      el(sheet, 'rect', { x: 154, y: 6, width: 34, height: 4, rx: 2, fill: 'ink3', 'fill-opacity': 0.5 });
      txt(sheet, W.cancel, 18, 31, 12.5, 400, 'ink');
      var addW = measure(sheet, W.add, 13, 600) + 16;
      var addPress = el(sheet, 'rect', { x: 324 - addW, y: 20, width: addW, height: 22, rx: 11, fill: 'tile' });
      txt(sheet, W.add, 316, 31, 13, 600, 'ink', { anchor: 'end' });
      txt(sheet, W.newEvent, 171, 32, 13, 600, 'ink', { anchor: 'middle' });
      var fields = el(sheet, 'g', { transform: 'translate(16 56)' });
      el(fields, 'rect', { x: 0, y: 0, width: 310, height: 167, rx: 16, fill: 'card' });
      fit(txt(fields, W.sync, 14, 22, 13, 500, 'ink'), 282, 0.8);
      [0, 1, 2].forEach(function (i) {
        var y = 44 + 41 * i;
        el(fields, 'rect', { x: 14, y: y, width: 296, height: 1, fill: 'hair' });
        var cy = y + 1 + 20;
        if (i === 2) el(fields, 'circle', { cx: 19, cy: cy, r: 5, fill: 'hl' });
        cap(el(fields, 'rect', { fill: 'track' }), (i === 2 ? 34 : 14) + (i === 2 ? 35 : 23), cy, i === 2 ? 70 : 46, 7);
        cap(el(fields, 'rect', { fill: 'tile' }), 296 - (i === 2 ? 10 : 39), cy, i === 2 ? 20 : 78, 7);
      });

      var fing = finger(content, [
        { x: tabPoint[0], y: tabPoint[1], at: M.tab }, { x: 259, y: 126, at: M.acceptTodo },
        { x: 259, y: 126, at: M.acceptEvent }, { x: 299, y: 96, at: M.add }
      ]);

      return function (t) {
        c.fade(t);
        var toTodos = seg(t, M.tab, M.tab + 0.3);
        op(rec, 1 - toTodos);
        op(tp, toTodos);

        rows.forEach(function (o, i) {
          var picks = i === 1 || i === 2;
          var start = i === 1 ? M.markTodo : M.markEvent, fly = i === 1 ? M.flyTodo : M.flyEvent;
          var marked = picks ? ease(seg(t, start, start + 0.45)) : 0;
          var picked = picks ? spring(seg(t, start + 0.4, start + 0.75)) * (1 - seg(t, fly, fly + 0.05)) : 0;
          rise(o.g, t, 0.3 + 0.15 * i, 16, o.base, 8, 0.3);
          o.mark.setAttribute('width', 310 * Math.max(0.001, marked));
          op(o.time, marked > 0.5 ? 0 : 1);
          op(o.timeOn, marked > 0.5 ? 1 : 0);
          if (o.tile) {
            var k = clamp(picked);
            move(o.tile, 288, 27, lerp(0.4, 1, k));
            op(o.tile, k);
          }
        });
        flights.forEach(function (f) {
          var k = ease(seg(t, f.from[2], f.from[2] + 0.55));
          var x = lerp(f.from[0], tabPoint[0] + 6, k);
          var y = lerp(f.from[1], tabPoint[1] - 4, k) - 34 * Math.sin(Math.PI * k);
          move(f.g, x, y, lerp(1, 0.55, k));
          op(f.g, k > 0 && k < 0.97 ? 1 : 0);
        });
        tabs.set(t < M.tab + 0.05 ? 0 : 1, t < M.acceptTodo + 0.4 ? '2' : '1',
          spring(seg(t, M.badge, M.badge + 0.35)) * (1 - seg(t, M.eventMoves, M.eventMoves + 0.3)));

        var a1 = ease(seg(t, M.acceptTodo + 0.2, M.acceptTodo + 0.55));
        var b1 = ease(seg(t, M.eventMoves, M.eventMoves + 0.35));
        var a2 = ease(seg(t, M.acceptTodo + 0.55, M.acceptTodo + 0.9));
        var b2 = ease(seg(t, M.eventMoves + 0.35, M.eventMoves + 0.7));
        var waiting = 56 * (2 - a1 - b1);
        var todosY = lerp(98 + waiting + 26, 62, b1);
        var eventsY = todosY + 20 + 56 + 26;
        var enter = easeOut(seg(t, 3.7, 4.05));
        confirmG.setAttribute('transform', 'translate(0 ' + ((1 - enter) * 10) + ')');
        op(confirmG, enter * (1 - b1));
        confirmHead.setCount(t < M.acceptTodo + 0.4 ? '2' : '1');
        confirmCard.setAttribute('height', Math.max(0, waiting));
        op(hair, (1 - a1) * (1 - b1));
        sTodo.g.setAttribute('transform', 'translate(' + (16 + 30 * a1) + ' 98)');
        op(sTodo.g, 1 - a1);
        sTodo.press(pulse(t, M.acceptTodo - 0.05, M.acceptTodo + 0.2));
        sEvent.g.setAttribute('transform', 'translate(' + (16 + 30 * b1) + ' ' + (98 + 56 * (1 - a1)) + ')');
        op(sEvent.g, 1 - b1);
        sEvent.press(pulse(t, M.acceptEvent - 0.05, M.acceptEvent + 0.2));
        myG.setAttribute('transform', 'translate(0 ' + todosY + ')');
        op(myG, a2);
        op(aTodo.label, seg(t, M.acceptTodo + 0.9, M.acceptTodo + 1.2));
        evG.setAttribute('transform', 'translate(0 ' + eventsY + ')');
        op(evG, b2);

        var shown = ease(seg(t, M.sheetIn, M.sheetIn + 0.45)) * (1 - ease(seg(t, M.sheetOut, M.sheetOut + 0.4)));
        op(dim, 0.2 * shown);
        sheet.setAttribute('transform', 'translate(0 ' + (68 + (1 - shown) * 260) + ')');
        op(addPress, pulse(t, M.add - 0.05, M.add + 0.2));
        op(sheetG, shown > 0.001 ? 1 : 0);
        fing(t);
      };
    }
  };

  // 12. Places on a map (DayMapAnimation.swift): the switch in Settings, the day's places numbered in
  //     the order they were reached, and one opened on the map with what was said there.

  var Places = {
    w: 342, h: 320, length: 10.8, preview: 5.4, still: 5.4,
    steps: [{ start: 0, still: 2.8 }, { start: 3.3, still: 5.4 }, { start: 7.0, still: 9.6 }],
    build: function (svg, ctx) {
      var W = ctx.words.places;
      var M = { toggle: 0.85, alert: 0.95, turnOn: 1.95, switchOn: 2.15, source: 2.4, day: 3.3,
                pins: [3.95, 4.4, 4.85], open: 7.3, zoom: 7.85, panel: 8.3 };
      var places = [[70, 175], [170, 100], [268, 150]];
      var stays = ['09:02–09:41', '14:10–14:25', '19:30–19:48'];
      var c = canvas(svg, Places.length, 0.3, 0.4);
      var content = c.content;
      var defs = svg.querySelector('defs');

      function mapArt(parent) {
        var g = el(parent, 'g');
        el(g, 'rect', { x: 0, y: 0, width: 342, height: 300, fill: 'tile' });
        el(g, 'rect', { x: 214, y: 176, width: 96, height: 72, rx: 26, fill: 'hl-soft' });
        el(g, 'path', { d: 'M-10 262C100 300 250 196 352 226', fill: 'none', stroke: 'track', 'stroke-width': 24, 'stroke-linecap': 'round' });
        el(g, 'path', { d: 'M-10 70L352 40M96 -10L128 310M292 -10L236 310M-10 150L352 128', fill: 'none', stroke: 'card', 'stroke-width': 7, 'stroke-linecap': 'round' });
        el(g, 'path', { d: 'M20 -10L30 310M190 -10L176 310M-10 108L352 90M-10 206L352 180', fill: 'none', stroke: 'card', 'stroke-opacity': 0.7, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
        return g;
      }
      function route(parent, w) {
        var g = el(parent, 'g');
        var legs = [0, 1].map(function (i) {
          return el(g, 'line', {
            x1: places[i][0], y1: places[i][1], x2: places[i][0], y2: places[i][1], stroke: 'ink', 'stroke-opacity': 0.55,
            'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': '5 6'
          });
        });
        return {
          g: g,
          set: function (p) {   // 0 to 2 places reached
            legs.forEach(function (leg, i) {
              var k = clamp(p - i);
              leg.setAttribute('x2', lerp(places[i][0], places[i + 1][0], k));
              leg.setAttribute('y2', lerp(places[i][1], places[i + 1][1], k));
              op(leg, k > 0 ? 1 : 0);
            });
          }
        };
      }
      function pin(parent, number, ring) {
        var g = el(parent, 'g');
        el(g, 'circle', { cy: 1.2, r: 13.2, fill: '#000', 'fill-opacity': 0.14 });
        el(g, 'circle', { r: 12, fill: 'accent', stroke: 'ground', 'stroke-width': ring || 2 });
        txt(g, String(number), 0, 0.5, 11, 700, 'on-accent', { anchor: 'middle', mono: true });
        return g;
      }

      // Settings › Places.
      var settings = el(content, 'g');
      el(settings, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(settings, W.settings, 171, 20, 13, 600, 'ink', { anchor: 'middle' });
      txt(settings, W.places, 20, 59.5, 12, 600, 'ink2');
      var sCard = el(settings, 'g', { transform: 'translate(16 72)' });
      var sBg = el(sCard, 'rect', { x: 0, y: 0, width: 310, height: 170, rx: 20, fill: 'card' });
      fit(txt(sCard, W.show, 14, 24, 13.5, 600, 'ink'), 226, 0.8);
      cap(el(sCard, 'rect', { fill: 'track' }), 14 + 95, 40.75, 190, 5);
      cap(el(sCard, 'rect', { fill: 'track' }), 14 + 64, 51.75, 128, 5);
      var sw = toggle(sCard);
      move(sw.g, 256, 23.5);
      var clipId = uid('src');
      var srcClip = el(el(defs, 'clipPath', { id: clipId }), 'rect', { x: 0, y: 70, width: 310, height: 100 });
      var src = el(sCard, 'g', { 'clip-path': 'url(#' + clipId + ')' });
      el(src, 'rect', { x: 0, y: 70, width: 310, height: 1, fill: 'hair' });
      txt(src, W.recordWith, 14, 87.75, 11, 600, 'ink2');
      move(tile(src, 'phone', 34, 'on-hl-soft', 'hl-soft'), 31, 125.5);
      txt(src, W.iphone, 60, 120.5, 13, 600, 'ink');
      var iw = measure(src, W.iphone, 13, 600);
      var recW = measure(src, W.recommended, 9, 600) + 12;
      el(src, 'rect', { x: 60 + iw + 8, y: 113.5, width: recW, height: 14, rx: 7, fill: 'success', 'fill-opacity': 0.15 });
      txt(src, W.recommended, 60 + iw + 8 + recW / 2, 120.5, 9, 600, 'success', { anchor: 'middle' });
      cap(el(src, 'rect', { fill: 'track' }), 60 + 75, 136, 150, 5);
      el(src, 'circle', { cx: 287, cy: 125.5, r: 9, fill: 'accent' });
      move(icon(src, 'check', 11, 'on-accent'), 287, 125.5);

      // The day's page: the places on a map above the list.
      var day = el(content, 'g');
      el(day, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      var dayHead = heading(day, W.places, '3');
      move(dayHead.g, 20, 20.5);
      var dCard = el(day, 'g', { transform: 'translate(16 40)' });
      el(dCard, 'rect', { x: 0, y: 0, width: 310, height: 270, rx: 20, fill: 'card' });
      var mapClip = uid('top');
      el(el(defs, 'clipPath', { id: mapClip }), 'path', { d: corners(0, 0, 310, 130, 20, 20, 0, 0) });
      var mini = el(dCard, 'g', { 'clip-path': 'url(#' + mapClip + ')' });
      var miniMap = el(mini, 'g', { transform: 'translate(-16 -75)' });
      mapArt(miniMap);
      var miniRoute = route(miniMap, 2.5);
      var miniPins = places.map(function (p, i) {
        var g = pin(miniMap, i + 1);
        return g;
      });
      var list = el(dCard, 'g', { transform: 'translate(0 130)' });
      var placeRows = [0, 1, 2].map(function (i) {
        var y = i * 45;
        var g = el(list, 'g');
        var o = { g: g, y: y };
        if (i > 0) el(g, 'rect', { x: 50, y: -1, width: 260, height: 1, fill: 'hair' });
        o.press = el(g, 'rect', { x: 0, y: 0, width: 310, height: 44, fill: 'tile' });
        move(pin(g, i + 1), 26, 22);
        fit(txt(g, W.names[i], 50, 15.25, 12.5, 600, 'ink'), 220, 0.8);
        fit(txt(g, stays[i] + ' · ' + W.parts[i], 50, 30.5, 9.5, 400, 'ink2', { mono: true }), 232, 0.8);
        move(icon(g, 'chevronRight', 11, 'ink3'), 294, 22);
        return o;
      });

      // The full map, with the picked place and what was said there.
      var mapPage = el(content, 'g');
      el(mapPage, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      var mapClipId = uid('full');
      el(el(defs, 'clipPath', { id: mapClipId }), 'rect', { x: 0, y: 40, width: 342, height: 280 });
      var mapHost = el(mapPage, 'g', { 'clip-path': 'url(#' + mapClipId + ')' });
      var zoomG = el(mapHost, 'g');
      var fullMap = el(zoomG, 'g', { transform: 'translate(0 40)' });
      mapArt(fullMap);
      var fullRoute = route(fullMap, 3);
      fullRoute.set(2);
      var bigPins = places.map(function (p, i) {
        var outer = el(fullMap, 'g');
        return { outer: outer, inner: pin(outer, i + 1, i === 1 ? 3 : 2) };
      });
      el(mapPage, 'rect', { x: 0, y: 0, width: 342, height: 40, fill: 'ground', 'fill-opacity': 0.92 });
      txt(mapPage, W.today, 171, 20, 13, 600, 'ink', { anchor: 'middle' });
      move(icon(mapPage, 'chevronLeft', 14, 'ink'), 24, 20);
      var panel = el(mapPage, 'g');
      el(panel, 'rect', { x: 0, y: 0, width: 318, height: 120, rx: 24, fill: 'card', stroke: 'hair', 'stroke-width': 1 });
      pin(panel, 2, 2.5).setAttribute('transform', 'translate(29 29) scale(1.25)');
      txt(panel, W.names[1], 14 + 30 + 10, 14 + 8.5, 14, 700, 'ink');
      txt(panel, stays[1], 14 + 30 + 10, 14 + 25, 10.5, 400, 'ink2', { mono: true });
      el(panel, 'circle', { cx: 318 - 14 - 13, cy: 14 + 13, r: 13, fill: 'tile' });
      move(icon(panel, 'x', 10, 'ink2'), 318 - 14 - 13, 14 + 13);
      txt(panel, W.heard, 14, 14 + 32 + 8 + 6.5, 10.5, 600, 'ink2');
      el(panel, 'rect', { x: 14, y: 14 + 32 + 8 + 13 + 8, width: 290, height: 31, rx: 12, fill: 'tile' });
      txt(panel, '14:10', 24, 14 + 32 + 8 + 13 + 8 + 15.5, 10, 400, 'ink2', { mono: true });
      fit(txt(panel, W.snippet, 58, 14 + 32 + 8 + 13 + 8 + 15.5, 11.5, 400, 'ink'), 214, 0.8);
      move(icon(panel, 'chevronRight', 11, 'ink3'), 304 - 8, 14 + 32 + 8 + 13 + 8 + 15.5);

      // The alert iOS asks with, drawn in the app's words.
      var alertG = el(content, 'g');
      var adim = el(alertG, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: '#050505' });
      var box = el(alertG, 'g');
      var boxBg = el(box, 'rect', { x: 0, y: 0, width: 244, rx: 22, fill: 'card', stroke: 'hair', 'stroke-width': 1 });
      txt(box, W.alertTitle, 122, 24, 13, 600, 'ink', { anchor: 'middle' });
      var mh = wrap(box, W.alertMessage, 122, 38, 10.5, 400, 'ink2', 212, 12.8, 'middle');
      var y1 = 38 + mh + 14;
      el(box, 'rect', { x: 0, y: y1, width: 244, height: 1, fill: 'hair' });
      var primary = el(box, 'rect', { x: 0, y: y1 + 1, width: 244, height: 36, fill: 'tile' });
      txt(box, W.turnOn, 122, y1 + 19, 13, 600, 'ink', { anchor: 'middle' });
      el(box, 'rect', { x: 0, y: y1 + 37, width: 244, height: 1, fill: 'hair' });
      txt(box, W.notNow, 122, y1 + 56, 13, 400, 'ink2', { anchor: 'middle' });
      var boxH = y1 + 74;
      boxBg.setAttribute('height', boxH);
      var boxTop = 160 - boxH / 2;

      var fing = finger(content, [
        { x: 292, y: 107, at: M.toggle }, { x: 171, y: boxTop + y1 + 19, at: M.turnOn }, { x: 171, y: 232, at: M.open }
      ]);

      return function (t) {
        c.fade(t);
        // Settings
        var on = spring(seg(t, M.switchOn, M.switchOn + 0.35));
        var source = ease(seg(t, M.source, M.source + 0.4));
        sw.set(on);
        sBg.setAttribute('height', 70 + 100 * source);
        srcClip.setAttribute('height', 100 * source);
        op(src, source);
        op(settings, 1 - seg(t, M.day - 0.1, M.day + 0.15));

        // The day's page
        var progress = seg(t, M.pins[0] + 0.2, M.pins[2]);
        var push = ease(seg(t, M.open + 0.1, M.open + 0.5));
        day.setAttribute('transform', 'translate(' + (-push * 342 * 0.28) + ' 0)');
        op(day, seg(t, M.day, M.day + 0.3) * (1 - seg(push, 0.85, 1)));
        dayHead.pop(spring(seg(t, M.pins[2], M.pins[2] + 0.35)));
        rise(dCard, t, M.day + 0.15, 16, 40, 10, 0.35);
        miniRoute.set(progress * 2);
        miniPins.forEach(function (g, i) {
          var pop = spring(seg(t, M.pins[i], M.pins[i] + 0.35));
          move(g, places[i][0], places[i][1], lerp(0.3, 1, pop));
          op(g, Math.min(pop, 1));
        });
        placeRows.forEach(function (o, i) {
          rise(o.g, t, M.pins[i] + 0.1, 0, o.y, 6, 0.3);
          op(o.press, i === 1 ? pulse(t, M.open - 0.05, M.open + 0.25) : 0);
        });

        // The full map
        var zoom = ease(seg(t, M.zoom, M.zoom + 0.6));
        var pn = ease(seg(t, M.panel, M.panel + 0.4));
        var scale = lerp(1, 2.0, zoom);
        zoomG.setAttribute('transform', 'translate(' + (places[1][0] * (1 - scale)) + ' ' + ((places[1][1] + 40) * (1 - scale)) + ') scale(' + scale + ')');
        bigPins.forEach(function (b, i) {
          var picked = i === 1;
          var size = picked ? lerp(1, 34 / 24, spring(seg(t, M.zoom, M.zoom + 0.4))) : 1;
          b.outer.setAttribute('transform', 'translate(' + places[i][0] + ' ' + places[i][1] + ') scale(' + (size / scale) + ')');
        });
        mapPage.setAttribute('transform', 'translate(' + ((1 - push) * 342) + ' 0)');
        op(mapPage, push > 0 ? 1 : 0);
        panel.setAttribute('transform', 'translate(12 ' + (196 + (1 - pn) * 130) + ')');
        op(panel, pn);

        // The alert
        var appear = seg(t, M.alert, M.alert + 0.2) * (1 - seg(t, M.turnOn + 0.1, M.turnOn + 0.28));
        var pop = spring(seg(t, M.alert, M.alert + 0.4));
        op(adim, 0.28 * appear);
        box.setAttribute('transform', 'translate(171 160) scale(' + lerp(0.9, 1, pop) + ') translate(-122 ' + (-boxH / 2) + ')');
        op(box, appear);
        op(primary, pulse(t, M.turnOn - 0.05, M.turnOn + 0.2));
        op(alertG, appear > 0.001 ? 1 : 0);
        fing(t);
      };
    }
  };

  // 13. Handing the day to an AI app (ExportIntroAnimation.swift): the day becomes a text file, the
  //     file goes to the app picked in the share sheet, and the answer comes back.

  var Export = {
    w: 342, h: 320, length: 9.5, preview: 2.95, still: 2.95,
    steps: [{ start: 0, still: 2.2 }, { start: 2.25, still: 2.95 }, { start: 5.55, still: 9.0 }],
    build: function (svg, ctx) {
      var W = ctx.words.handoff;
      var now = new Date();
      var fileName = 'DayRecall ' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2) + '.txt';
      var c = canvas(svg, Export.length, 0.15, 0.35);
      var content = c.content;

      // Step 1: the day's conversations and the button.
      var dayLayer = el(content, 'g');
      var cards = [0, 1, 2].map(function (i) {
        var g = el(dayLayer, 'g');
        el(g, 'rect', { x: -143, y: -27, width: 286, height: 54, rx: 14, fill: 'tile' });
        var card = W.cards[i];
        txt(g, card.time, -131, -11, 10.5, 500, 'ink2', { mono: true });
        var tw = measure(g, card.time, 10.5, 500, true);
        var px = -131 + tw + 6, pw = measure(g, card.place, 10, 500) + 12;
        el(g, 'rect', { x: px, y: -18, width: pw, height: 14, rx: 7, fill: 'card' });
        txt(g, card.place, px + 6, -11, 10, 500, 'ink2');
        fit(txt(g, card.line, -131, 9, 12.5, 400, 'ink'), 262, 0.8);
        return g;
      });
      var hand = el(dayLayer, 'g');
      el(hand, 'rect', { x: -100, y: -22, width: 200, height: 44, rx: 22, fill: 'accent' });
      var label = txt(hand, W.handButton, 0, 0.5, 14, 600, 'on-accent');
      var hw = fit(label, 160, 0.7);
      move(icon(hand, 'appForward', 14, 'on-accent'), -(hw + 20) / 2 + 7, 0);
      label.setAttribute('x', -(hw + 20) / 2 + 20);

      // The file it becomes.
      var file = el(content, 'g');
      el(file, 'rect', { x: -36, y: -53.5, width: 72, height: 88, rx: 14, fill: 'tile', stroke: 'hair', 'stroke-width': 1 });
      move(icon(file, 'doc', 30, 'ink'), 0, -22);
      el(file, 'rect', { x: -14, y: -2, width: 28, height: 15, rx: 7.5, fill: 'hl' });
      txt(file, 'TXT', 0, 5.5, 9, 700, 'on-hl', { anchor: 'middle', mono: true });
      fit(txt(file, fileName, 0, 47, 11, 500, 'ink2', { anchor: 'middle' }), 200, 0.8);

      // Step 2: the share sheet.
      var sheet = el(content, 'g');
      el(sheet, 'rect', { x: 0.5, y: 0.5, width: 341, height: 149, rx: 22, fill: 'tile', stroke: 'hair', 'stroke-width': 1 });
      move(icon(sheet, 'doc', 14, 'ink2'), 25, 25.5);
      fit(txt(sheet, fileName, 36, 25.5, 11.5, 500, 'ink'), 250, 0.8);
      var apps = [['mail', W.appMail, false], ['doc', W.appNotes, false], ['sparkle', W.appAI, true], ['ellipsis', W.appMore, false]];
      var appTiles = apps.map(function (a, i) {
        var cx = 16 + 77.5 * (i + 0.5);
        var g = el(sheet, 'g', { transform: 'translate(' + cx + ' 73)' });
        var holder = el(g, 'g');
        el(holder, 'rect', { x: -26, y: -26, width: 52, height: 52, rx: 14, fill: a[2] ? 'hl' : 'card' });
        icon(holder, a[0], 22, a[2] ? 'on-hl' : 'ink', a[2] ? 'hl' : 'card');
        fit(txt(g, a[1], 0, 37, 10, 400, 'ink2', { anchor: 'middle' }), 70, 0.75);
        return holder;
      });

      // The AI app: a message box, then the answer.
      var ai = el(content, 'g');
      el(ai, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'card' });
      var chatClip = uid('chat');
      el(el(svg.querySelector('defs'), 'clipPath', { id: chatClip }), 'rect', { x: 0, y: 36, width: 342, height: 224 });
      var chat = el(ai, 'g', { 'clip-path': 'url(#' + chatClip + ')' });
      var chipBody = function (parent) {
        var g = el(parent, 'g');
        el(g, 'rect', { x: -98, y: -15, width: 196, height: 30, rx: 15, fill: 'hl-soft' });
        var label = txt(g, W.chip, 0, 0.5, 11.5, 500, 'on-hl-soft');
        var w = fit(label, 160, 0.8);
        label.setAttribute('x', -(w + 19) / 2 + 19);
        move(icon(g, 'doc', 13, 'on-hl-soft'), -(w + 19) / 2 + 6.5, 0);
        return g;
      };
      var sent = chipBody(chat);
      move(sent, 228, 61);
      var thinking = el(chat, 'g', { transform: 'translate(16 88)' });
      var dots = [0, 1, 2].map(function (i) { return el(thinking, 'circle', { cx: 3 + 11 * i, cy: 0, r: 3, fill: 'ink3' }); });
      var reveal = [];
      function revealed(start, build) {
        var g = el(chat, 'g');
        build(g);
        reveal.push({ g: g, start: start });
        return g;
      }
      var top = 86;
      revealed(6.1, function (g) { txt(g, W.answerTitle, 16, top + 8.5, 14, 700, 'ink'); });
      [0, 1, 2].forEach(function (i) {
        revealed(6.4 + 0.3 * i, function (g) {
          el(g, 'circle', { cx: 18, cy: top + 27.5 + 18 * i, r: 2, fill: 'ink3' });
          fit(txt(g, W.bullets[i], 27, top + 27.5 + 18 * i, 12.5, 400, 'ink'), 290, 0.8);
        });
      });
      var sweep;
      function promise(y, str, highlighted) {
        var g = el(chat, 'g');
        var tw = measure(g, str, 12.5, 500);
        var rw = 6 + 13 + 8 + Math.min(tw, 276) + 6;
        var mark = highlighted ? el(g, 'rect', { x: 16, y: y - 10.5, width: rw, height: 21, rx: 7, fill: 'hl-soft' }) : null;
        el(g, 'rect', { x: 22.5, y: y - 6, width: 12, height: 12, rx: 3, fill: 'none', stroke: 'ink2', 'stroke-width': 1.4 });
        txt(g, str, 22 + 13 + 8, y, 12.5, 500, highlighted ? 'on-hl-soft' : 'ink');
        return { g: g, mark: mark, w: rw };
      }
      revealed(7.3, function (g) { txt(g, W.promised, 22, top + 84.5, 10.5, 600, 'ink2'); });
      var p1, p2;
      reveal.push({ g: (p1 = promise(top + 104.5, W.promisedItem, true)).g, start: 7.5 });
      revealed(8.15, function (g) { txt(g, W.promisedToYou, 22, top + 128.5, 10.5, 600, 'ink2'); });
      reveal.push({ g: (p2 = promise(top + 148.5, W.promisedToYouItem, false)).g, start: 8.35 });
      var head = el(ai, 'g');
      el(head, 'rect', { x: 0, y: 0, width: 342, height: 36, fill: 'card' });
      el(head, 'rect', { x: 0, y: 35, width: 342, height: 1, fill: 'hair' });
      move(tile(head, 'sparkle', 22, 'on-hl-soft', 'hl-soft'), 25, 17.5);
      txt(head, W.appAI, 44, 17.5, 13, 600, 'ink');
      var bar = el(ai, 'g', { transform: 'translate(14 264)' });
      el(bar, 'rect', { x: 0, y: 0, width: 314, height: 44, rx: 22, fill: 'tile' });
      var placeholder = txt(bar, W.placeholder, 16, 22, 13, 400, 'ink3');
      var send = el(bar, 'g');
      el(send, 'circle', { r: 15, fill: 'card' });
      var sendOn = el(send, 'circle', { r: 15, fill: 'accent' });
      var arrowOff = icon(send, 'arrowUp', 14, 'ink3');
      var arrowOn = icon(send, 'arrowUp', 14, 'on-accent');

      // The file as a chip: out of the file icon, into the message box, up as the user's message.
      var chip = chipBody(content);

      var fing = finger(content, [{ x: 171, y: 258, at: 1.25 }, { x: 210, y: 244, at: 3.2 }, { x: 306, y: 286, at: 4.95 }]);

      return function (t) {
        c.fade(t);
        cards.forEach(function (g, i) {
          var start = 0.05 + 0.12 * i;
          var appear = easeOut(seg(t, start, start + 0.5));
          var merge = ease(seg(t, 1.5, 2.15));
          var fade = 1 - seg(t, 1.85, 2.15);
          move(g, 171, lerp(45 + 62 * i, 100, merge) + (1 - appear) * 16, lerp(1, 0.9, merge));
          op(g, appear * fade);
        });
        var handIn = easeOut(seg(t, 0.35, 0.8)) * (1 - seg(t, 2.25, 2.6));
        move(hand, 171, 254, 1 - 0.05 * pulse(t, 1.25, 1.4));
        op(hand, handIn);

        var formed = easeOut(seg(t, 1.8, 2.25));
        var toChip = ease(seg(t, 3.3, 3.6));
        move(file, 171, 100, lerp(0.85, 1, formed) * lerp(1, 0.3, toChip));
        op(file, formed * (1 - toChip));

        var shown = ease(seg(t, 2.25, 2.75)) * (1 - ease(seg(t, 3.25, 3.55)));
        sheet.setAttribute('transform', 'translate(0 ' + (lerp(395, 245, shown) - 75) + ')');
        op(sheet, shown > 0.001 ? 1 : 0);
        appTiles.forEach(function (h, i) { move(h, 0, 0, i === 2 ? 1 - 0.08 * pulse(t, 3.2, 3.34) : 1); });

        var slide = ease(seg(t, 3.4, 3.95));
        ai.setAttribute('transform', 'translate(' + ((1 - slide) * 342) + ' 0)');
        op(ai, slide > 0 ? 1 : 0);
        op(sent, t >= 5.55 ? 1 : 0);
        var dotsOn = seg(t, 5.6, 5.7) * (1 - seg(t, 6.05, 6.15));
        op(thinking, dotsOn);
        dots.forEach(function (d, i) { op(d, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 9 - i * 1.2))); });
        reveal.forEach(function (r) {
          var k = easeOut(seg(t, r.start, r.start + 0.25));
          r.g.setAttribute('transform', 'translate(0 ' + ((1 - k) * 6) + ')');
          op(r.g, k);
        });
        var swept = seg(t, 7.9, 8.35);
        p1.mark.setAttribute('width', Math.max(0.01, p1.w * swept));
        var sendK = seg(t, 4.45, 4.6) * (1 - seg(t, 5.15, 5.3));
        var away = seg(t, 4.3, 4.45) * (1 - seg(t, 5.55, 5.8));
        op(placeholder, 1 - away);
        move(send, 314 - 7 - 15, 22, 1 - 0.12 * pulse(t, 4.95, 5.1));
        op(sendOn, sendK);
        op(arrowOn, sendK);
        op(arrowOff, 1 - sendK);

        var appearC = easeOut(seg(t, 3.3, 3.6));
        var toInput = ease(seg(t, 3.95, 4.5));
        var toChat = ease(seg(t, 5.0, 5.55));
        var ix = lerp(171, 122, toInput), iy = lerp(100, 286, toInput);
        move(chip, lerp(ix, 228, toChat), lerp(iy, 61, toChat), lerp(0.5, 1, appearC));
        op(chip, t < 5.55 ? appearC : 0);
        fing(t);
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Drawn for the site: the app's library has no animation of these yet. Same kit, same style, and
  // only screens that exist in the app (TodayView's timeline and week strip, the Library's search,
  // WeeklyPlanView, the Health switch and its labels on the timeline).

  /** A span of the day on the timeline's rail (SpanCard): time, how long, the words. */
  function spanCard(parent, y, time, dur, line, chip) {
    var g = el(parent, 'g');
    var h = chip ? 64 : 48;
    el(g, 'circle', { cx: 26, cy: 16, r: 6, fill: 'ink', stroke: 'ground', 'stroke-width': 2 });
    el(g, 'rect', { x: 42, y: 0, width: 280, height: h, rx: 16, fill: 'card' });
    txt(g, time + ' · ' + dur, 54, 14, 10, 400, 'ink2', { mono: true });
    if (chip) {
      var cx = 54, cy = 32, w = 7 + 10 + 4 + measure(g, chip[1], 9.5, 500) + 7;
      el(g, 'rect', { x: cx, y: cy - 8, width: w, height: 16, rx: 8, fill: 'tile' });
      move(icon(g, chip[0], 10, 'ink2'), cx + 7 + 5, cy);
      txt(g, chip[1], cx + 7 + 10 + 4, cy + 0.5, 9.5, 500, 'ink2');
    }
    fit(txt(g, line, 54, chip ? 51 : 33, 12, 400, 'ink'), 256, 0.8);
    g.setAttribute('transform', 'translate(0 ' + y + ')');
    return g;
  }

  /** A quiet line on the rail between spans (TimelineMarker). */
  function railMarker(parent, str, symbol) {
    var g = el(parent, 'g');
    el(g, 'circle', { cx: 26, cy: 0, r: 5, fill: 'ink', stroke: 'ground', 'stroke-width': 2 });
    var x = 42;
    if (symbol) {
      move(icon(g, symbol, 11, 'ink3'), 47.5, 0);
      x = 57;
    }
    fit(txt(g, str, x, 0.5, 10.5, 400, 'ink3'), 322 - x, 0.8);
    return g;
  }

  // 14. Any day at a glance: the day on a timeline, flipping back through the week, searching
  //     everything that was heard (TodayView, WeekStrip, LibraryView).

  var Day = {
    w: 342, h: 320, length: 11.4, preview: 2.9, still: 2.9,
    steps: [{ start: 0, still: 2.9 }, { start: 3.7, still: 6.1 }, { start: 7.3, still: 10.3 }],
    build: function (svg, ctx) {
      var W = ctx.words.day, TABS = ctx.words.ask.tabs;
      var M = { a: 0.4, quiet: 0.7, b: 0.85, tap: 4.2, inn: 4.7, lib: 7.6, focus: 8.35, typing: 8.6, typingEnd: 9.5, results: 9.75 };
      var cellW = 298 / 7;
      var c = canvas(svg, Day.length, 0.3, 0.4);
      var content = c.content;

      // Today: title, the week, the timeline.
      var today = el(content, 'g');
      el(today, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      var title1 = txt(today, W.today, 20, 30, 23, 700, 'ink');
      var title2 = txt(today, W.title2, 20, 30, 23, 700, 'ink');
      var sub2 = txt(today, W.sub2, 20, 50.5, 11, 400, 'ink2');
      var back = el(today, 'g');
      var bw = measure(today, W.today, 11.5, 600) + 38;
      el(back, 'rect', { x: -bw, y: -12, width: bw, height: 24, rx: 12, fill: 'tile' });
      txt(back, W.today, -bw + 13, 0.5, 11.5, 600, 'ink');
      move(icon(back, 'arrowRight', 11, 'ink'), -13, 0);
      move(back, 326, 30);

      var strip = el(today, 'g', { transform: 'translate(16 66)' });
      el(strip, 'rect', { x: 0, y: 0, width: 310, height: 56, rx: 20, fill: 'card' });
      var heat = [2, 4, 3, 3, 0, 0, 0];
      var days = W.weekdays.map(function (name, i) {
        var cx = 6 + cellW * (i + 0.5), future = i > 3, o = { cx: cx };
        txt(strip, name, cx, 15, 8, 400, future ? 'ink3' : 'ink2', { anchor: 'middle', mono: true });
        if (future) {
          txt(strip, String(12 + i), cx, 38.5, 12, 500, 'ink3', { anchor: 'middle' });
          return o;
        }
        el(strip, 'circle', { cx: cx, cy: 38, r: 15, fill: 'heat' + heat[i] });
        o.sel = el(strip, 'circle', { cx: cx, cy: 38, r: 15, fill: 'accent' });
        o.num = txt(strip, String(12 + i), cx, 38.5, 12, 700, 'on-hl', { anchor: 'middle' });
        o.numOn = txt(strip, String(12 + i), cx, 38.5, 12, 700, 'on-accent', { anchor: 'middle' });
        return o;
      });

      txt(today, W.timeline, 20, 138, 14, 700, 'ink');
      txt(today, W.newest, 322, 138, 10, 400, 'ink2', { anchor: 'end' });
      el(today, 'rect', { x: 25, y: 148, width: 2, height: 122, rx: 1, fill: 'hair' });
      var tl1 = el(today, 'g'), tl2 = el(today, 'g');
      var one = [spanCard(tl1, 0, W.a.time, W.a.dur, W.a.line), railMarker(tl1, W.a.quiet), spanCard(tl1, 0, W.b.time, W.b.dur, W.b.line)];
      var two = [spanCard(tl2, 0, W.c.time, W.c.dur, W.c.line), railMarker(tl2, W.c.quiet), spanCard(tl2, 0, W.d.time, W.d.dur, W.d.line)];
      var tops = [150, 208, 218];

      // Library: the weeks, then a search.
      var lib = el(content, 'g');
      el(lib, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(lib, TABS[3], 20, 30, 23, 700, 'ink');
      var field = el(lib, 'g', { transform: 'translate(16 46)' });
      el(field, 'rect', { x: 0.5, y: 0.5, width: 309, height: 33, rx: 16.5, fill: 'card', stroke: 'hair', 'stroke-width': 1 });
      move(icon(field, 'magnifier', 14, 'ink3'), 18, 17);
      var placeholder = txt(field, W.searchPrompt, 34, 17, 12.5, 400, 'ink3');
      var typedText = txt(field, '', 34, 17, 12.5, 400, 'ink');
      var typedChars = Array.from(W.query);
      var prefix = [0];
      typedChars.forEach(function (ch, k) { prefix.push(measure(field, typedChars.slice(0, k + 1).join(''), 12.5, 400)); });
      var caret = el(field, 'rect', { y: 9, width: 1.5, height: 16, fill: 'ink' });

      var weeks = el(lib, 'g');
      txt(weeks, W.thisWeek, 20, 98, 14, 700, 'ink');
      var weekRows = W.weekRows.map(function (r, i) {
        var g = el(weeks, 'g');
        el(g, 'rect', { x: 16, y: 0, width: 310, height: 46, rx: 20, fill: 'card' });
        var d = 3 - i;
        el(g, 'rect', { x: 25, y: 6, width: 34, height: 34, rx: 11, fill: i === 0 ? 'accent' : 'heat' + [3, 4, 2][i] });
        txt(g, W.weekdays[d], 42, 17, 7.5, 400, i === 0 ? 'on-accent' : 'on-hl', { anchor: 'middle', mono: true });
        txt(g, String(12 + d), 42, 30, 13, 700, i === 0 ? 'on-accent' : 'on-hl', { anchor: 'middle' });
        fit(txt(g, r, 72, 23, 12, 600, 'ink'), 220, 0.8);
        move(icon(g, 'chevronRight', 11, 'ink3'), 308, 23);
        return g;
      });

      var results = el(lib, 'g');
      txt(results, W.matches, 20, 98, 11, 600, 'ink2');
      var resCard = el(results, 'g');
      el(resCard, 'rect', { x: 16, y: 112, width: 310, height: 150, rx: 20, fill: 'card' });
      var resRows = W.results.map(function (r, i) {
        var g = el(results, 'g');
        if (i > 0) el(g, 'rect', { x: 30, y: -1, width: 282, height: 1, fill: 'hair' });
        txt(g, r.when, 30, 14, 9.5, 400, 'ink2', { mono: true });
        var wp = measure(g, r.pre, 12.5, 400), wh = measure(g, r.hit, 12.5, 600);
        el(g, 'rect', { x: 30 + wp - 3, y: 24, width: wh + 6, height: 19, rx: 5, fill: 'hl-soft' });
        txt(g, r.pre, 30, 33.5, 12.5, 400, 'ink');
        txt(g, r.hit, 30 + wp, 33.5, 12.5, 600, 'on-hl-soft');
        txt(g, r.post, 30 + wp + wh, 33.5, 12.5, 400, 'ink');
        return g;
      });

      var tabs = tabBar(content, TABS, 270);
      var fing = finger(content, [
        { x: 16 + 6 + cellW * 1.5, y: 66 + 38, at: M.tap }, { x: 299.25, y: 287, at: M.lib }, { x: 171, y: 63, at: M.focus }
      ]);
      var lastTyped = null;

      return function (t) {
        c.fade(t);
        var swap = ease(seg(t, M.tap + 0.1, M.tap + 0.5));
        var pick = spring(seg(t, M.tap, M.tap + 0.35));
        var leave = seg(t, M.tap, M.tap + 0.2);
        days.forEach(function (d, i) {
          if (!d.sel) return;
          var on = i === 3 ? 1 - leave : i === 1 ? Math.min(pick, 1) : 0;
          d.sel.setAttribute('r', 15 * (i === 1 ? lerp(0.6, 1, pick) : 1));
          op(d.sel, on);
          op(d.numOn, on > 0.5 ? 1 : 0);
          op(d.num, on > 0.5 ? 0 : 1);
        });
        op(title1, 1 - swap);
        op(title2, swap);
        op(sub2, swap);
        op(back, swap);
        tl1.setAttribute('transform', 'translate(' + (-16 * swap) + ' 0)');
        op(tl1, 1 - swap);
        tl2.setAttribute('transform', 'translate(' + (16 * (1 - swap)) + ' 0)');
        op(tl2, swap);
        var starts = [M.a, M.quiet, M.b];
        one.forEach(function (g, i) { rise(g, t, starts[i], 0, tops[i], 10, 0.35); });
        two.forEach(function (g, i) { rise(g, t, M.inn + 0.15 * i, 0, tops[i], 10, 0.35); });

        var toLib = seg(t, M.lib, M.lib + 0.3);
        op(today, 1 - toLib);
        op(lib, toLib);
        tabs.set(t < M.lib + 0.05 ? 0 : 3, '', 0);

        var shown = typed(W.query, seg(t, M.typing, M.typingEnd));
        if (shown !== lastTyped) {
          typedText.textContent = shown;
          lastTyped = shown;
        }
        var n = Array.from(shown).length;
        op(placeholder, n ? 0 : 1);
        caret.setAttribute('x', 34 + prefix[n] + 1);
        op(caret, t >= M.focus && t < M.results + 0.1 && Math.sin(t * 9) > -0.2 ? 1 : 0);
        var listOff = seg(t, M.typing + 0.3, M.typing + 0.65);
        weekRows.forEach(function (g, i) { rise(g, t, M.lib + 0.15 + 0.1 * i, 0, 112 + 52 * i, 8, 0.3); });
        op(weeks, 1 - listOff);
        op(results, seg(t, M.results, M.results + 0.2));
        resRows.forEach(function (g, i) { rise(g, t, M.results + 0.12 * i, 0, 112 + 50 * i, 6, 0.3); });
        fing(t);
      };
    }
  };

  // 15. A plan for the week (WeeklyPlanView): everything due in the next seven days, ticked, and the
  //     ones that were picked go to the calendar and Reminders while the rest stay in To confirm.

  var Week = {
    w: 342, h: 320, length: 10.6, preview: 5.2, still: 5.2,
    steps: [{ start: 0, still: 2.8 }, { start: 3.4, still: 5.2 }, { start: 6.0, still: 9.4 }],
    build: function (svg, ctx) {
      var W = ctx.words.week, T = ctx.words.todos;
      var M = { rows: [0.4, 0.6, 0.8], ticks: [1.1, 1.25, 1.4], untick: 4.5, add: 6.9, push: 7.15, a: 7.95, b: 8.35, label: 8.75 };
      var c = canvas(svg, Week.length, 0.3, 0.4);
      var content = c.content;

      // Where the items land: To-dos.
      var td = el(content, 'g');
      el(td, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(td, T.todos, 20, 24.5, 21, 700, 'ink');
      var h1 = heading(td, T.toConfirm, '1');
      move(h1.g, 20, 64.5);
      el(td, 'rect', { x: 16, y: 76, width: 310, height: 56, rx: 20, fill: 'card' });
      var waits = suggestedRow(td, 'list', W.t2.title, W.t2.meta);
      waits.g.setAttribute('transform', 'translate(16 76)');
      var mineG = el(td, 'g');
      move(heading(mineG, T.myTodos).g, 20, 146);
      el(mineG, 'rect', { x: 16, y: 158, width: 310, height: 56, rx: 20, fill: 'card' });
      var mine = acceptedRow(mineG, 'list', T.quote, T.dueMeta, T.inReminders);
      mine.g.setAttribute('transform', 'translate(16 158)');
      var evG = el(td, 'g');
      move(heading(evG, T.events).g, 20, 232);
      el(evG, 'rect', { x: 16, y: 244, width: 310, height: 56, rx: 20, fill: 'card' });
      var ev = acceptedRow(evG, 'calendar', T.sync, T.eventMeta, null);
      ev.g.setAttribute('transform', 'translate(16 244)');

      // The plan.
      var plan = el(content, 'g');
      el(plan, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      move(icon(plan, 'chevronLeft', 14, 'ink'), 24, 20);
      txt(plan, W.nav, 171, 20, 13, 600, 'ink', { anchor: 'middle' });
      txt(plan, W.range, 20, 46, 9.5, 400, 'ink2', { mono: true });
      fit(txt(plan, W.title, 20, 67, 17, 700, 'ink'), 302, 0.7);

      function planRow(parent, y, title, meta) {
        var g = el(parent, 'g', { transform: 'translate(0 ' + y + ')' });
        var box = el(g, 'g', { transform: 'translate(39 23)' });
        el(box, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 5, fill: 'none', stroke: 'ink3', 'stroke-width': 1.6 });
        var on = el(box, 'g');
        el(on, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 5, fill: 'accent' });
        icon(on, 'check', 13, 'on-accent');
        fit(txt(g, title, 60, 18, 12, 600, 'ink'), 254, 0.8);
        fit(txt(g, meta, 60, 33, 9.5, 400, 'ink2'), 254, 0.8);
        return { box: box, on: on };
      }
      function group(y, symbol, label, rows) {
        var g = el(plan, 'g');
        move(icon(g, symbol, 11, 'ink2'), 25, y + 5);
        fit(txt(g, label, 36, y + 5, 10.5, 600, 'ink2'), 286, 0.8);
        var card = el(g, 'g');
        el(card, 'rect', { x: 16, y: y + 16, width: 310, height: rows.length * 47 - 1, rx: 20, fill: 'card' });
        var rs = rows.map(function (r, i) {
          if (i > 0) el(card, 'rect', { x: 50, y: y + 16 + i * 47 - 1, width: 276, height: 1, fill: 'hair' });
          var o = planRow(card, y + 16 + i * 47, r[0], r[1]);
          o.x = 16;
          return o;
        });
        return { g: g, rows: rs };
      }
      var g1 = group(82, 'calendar', W.events, [[T.sync, T.eventMeta]]);
      var g2 = group(154, 'list', W.todos, [[T.quote, T.dueMeta], [W.t2.title, W.t2.meta]]);
      var all = [g1.rows[0], g2.rows[0], g2.rows[1]];

      var btn = el(plan, 'g', { transform: 'translate(16 272)' });
      el(btn, 'rect', { x: 0, y: 0, width: 310, height: 36, rx: 18, fill: 'accent' });
      var add3 = txt(btn, W.add.replace('{n}', '3'), 155, 18.5, 13, 600, 'on-accent', { anchor: 'middle' });
      var add2 = txt(btn, W.add.replace('{n}', '2'), 155, 18.5, 13, 600, 'on-accent', { anchor: 'middle' });

      var fing = finger(content, [{ x: 39, y: 240, at: M.untick }, { x: 171, y: 290, at: M.add }]);

      return function (t) {
        c.fade(t);
        var push = ease(seg(t, M.push, M.push + 0.55));
        plan.setAttribute('transform', 'translate(' + (push * 342) + ' 0)');
        op(plan, push < 1 ? 1 : 0);
        [g1.g, g2.g].forEach(function (g, i) { rise(g, t, M.rows[i], 0, 0, 8, 0.35); });
        all.forEach(function (r, i) {
          var k = spring(seg(t, M.ticks[i], M.ticks[i] + 0.3));
          if (i === 2) k = Math.min(k, 1) * (1 - ease(seg(t, M.untick, M.untick + 0.2)));
          op(r.on, clamp(k));
          r.on.setAttribute('transform', 'scale(' + lerp(0.5, 1, Math.min(k, 1.2)) + ')');
        });
        var two = t >= M.untick + 0.1;
        op(add3, two ? 0 : 1);
        op(add2, two ? 1 : 0);
        var press = pulse(t, M.add - 0.05, M.add + 0.2);
        var bs = 1 - 0.04 * press;
        btn.setAttribute('transform', 'translate(' + (16 + 155 * (1 - bs)) + ' ' + (272 + 18 * (1 - bs)) + ') scale(' + bs + ')');
        op(btn, easeOut(seg(t, 0.9, 1.2)));

        rise(mine.g, t, M.a, 16, 158, 8, 0.35);
        op(mineG, push > 0 ? easeOut(seg(t, M.a, M.a + 0.3)) : 0);
        rise(ev.g, t, M.b, 16, 244, 8, 0.35);
        op(evG, push > 0 ? easeOut(seg(t, M.b, M.b + 0.3)) : 0);
        op(mine.label, seg(t, M.label, M.label + 0.3));
        fing(t);
      };
    }
  };

  // 16. Health as a clue (HealthSection, the timeline, AskView): off until the switch is turned on,
  //     then a small label on what happened while walking or after a workout, and questions that
  //     ask for a time by what you were doing.

  var Health = {
    w: 342, h: 320, length: 12.4, preview: 5.6, still: 5.6,
    steps: [{ start: 0, still: 2.8 }, { start: 3.5, still: 5.6 }, { start: 7.6, still: 11.2 }],
    build: function (svg, ctx) {
      var W = ctx.words.health, A = ctx.words.ask, ME = ctx.words.me, T = ctx.words.todos;
      var M = { toggle: 0.9, on: 1.15, found: 1.9, tab: 3.5, a: 3.9, b: 4.25, marker: 4.6, open: 6.1,
                askTab: 7.7, focus: 8.2, typing: 8.4, typingEnd: 9.4, send: 9.6, bubble: 9.8, thinking: 10.1,
                answer: 10.7, chip: 10.9, source: 11.1 };
      var c = canvas(svg, Health.length, 0.3, 0.4);
      var content = c.content;

      // Settings › Health.
      var settings = el(content, 'g');
      el(settings, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(settings, W.settings, 171, 20, 13, 600, 'ink', { anchor: 'middle' });
      txt(settings, W.label, 20, 59.5, 12, 600, 'ink2');
      var sCard = el(settings, 'g', { transform: 'translate(16 72)' });
      el(sCard, 'rect', { x: 0, y: 0, width: 310, height: 78, rx: 20, fill: 'card' });
      fit(txt(sCard, W.show, 14, 24, 13, 600, 'ink'), 226, 0.8);
      cap(el(sCard, 'rect', { fill: 'track' }), 14 + 100, 42, 200, 5);
      cap(el(sCard, 'rect', { fill: 'track' }), 14 + 70, 53, 140, 5);
      cap(el(sCard, 'rect', { fill: 'track' }), 14 + 42, 64, 84, 5);
      var sw = toggle(sCard);
      move(sw.g, 256, 27.5);
      var found = el(settings, 'g');
      move(icon(found, 'checkCircle', 12, 'ink2'), 26, 166);
      txt(found, W.found, 38, 166, 10.5, 400, 'ink2');
      wrap(settings, W.note, 20, 188, 10.5, 400, 'ink3', 302, 13.5);

      // The day: a label on the part of it that happened while walking, a heart rate above usual,
      // and the night's sleep on the rail.
      var day = el(content, 'g');
      el(day, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(day, W.today, 20, 30, 23, 700, 'ink');
      txt(day, W.timeline, 20, 62, 14, 700, 'ink');
      txt(day, W.newest, 322, 62, 10, 400, 'ink2', { anchor: 'end' });
      el(day, 'rect', { x: 25, y: 74, width: 2, height: 196, rx: 1, fill: 'hair' });
      var cardA = spanCard(day, 0, W.a.time, W.a.dur, T.l0, ['walk', W.walking]);
      var cardB = spanCard(day, 0, W.b.time, W.b.dur, T.l1, ['heartFill', W.heartAbove]);
      var sleep = railMarker(day, W.sleep, 'bed');

      // A part of the day, opened: the numbers behind its label.
      var detail = el(content, 'g');
      el(detail, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      txt(detail, W.b.time, 20, 26.5, 17, 700, 'ink');
      txt(detail, W.b.dur, 322, 28, 10.5, 400, 'ink2', { anchor: 'end', mono: true });
      el(detail, 'rect', { x: 16, y: 56, width: 310, height: 56, rx: 20, fill: 'card' });
      move(tile(detail, 'heartFill', 30, 'on-hl', 'hl'), 16 + 27, 56 + 28);
      txt(detail, W.factTitle, 16 + 52, 56 + 21.3, 12, 600, 'ink');
      fit(txt(detail, W.factDetail, 16 + 52, 56 + 36.3, 9.5, 400, 'ink2'), 244, 0.8);
      var row = transcriptRow(detail, W.b.time.slice(0, 5), ME, true, T.l1);
      row.g.setAttribute('transform', 'translate(16 124)');

      // Ask: the question names an activity, and the answer comes with the recording it is from.
      var ask = el(content, 'g');
      el(ask, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });
      fit(txt(ask, A.title, 20, 28, 23, 700, 'ink'), 302, 0.7);
      var question = el(ask, 'g');
      var qBubble = el(question, 'path', { fill: 'accent' });
      var qText = txt(question, W.question, 0, 16.5, 12.5, 400, 'on-accent');
      var qw = fit(qText, 270, 0.8);
      var bw = qw + 28, bx = 326 - bw;
      qBubble.setAttribute('d', corners(bx, 0, bw, 33, 18, 18, 5, 18));
      qText.setAttribute('x', bx + 14);
      var thinking = el(ask, 'g', { transform: 'translate(20 104)' });
      var dots = [0, 1, 2].map(function (i) { return el(thinking, 'circle', { cx: 2.75 + 9.5 * i, cy: 0, r: 2.75, fill: 'ink' }); });
      txt(thinking, A.thinking, 32.5, 0, 12, 400, 'ink2');
      var from = el(ask, 'g');
      move(icon(from, 'lockClosed', 12, 'ink2'), 26, 104);
      txt(from, A.from, 36, 104, 10.5, 500, 'ink2');
      var answer = el(ask, 'g');
      var aw = fit(txt(answer, W.answer, 20, 128, 12.5, 400, 'ink'), 276, 0.8);
      var chipG = el(answer, 'g');
      el(chipG, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 6, fill: 'hl' });
      txt(chipG, '1', 0, 0.5, 9.5, 600, 'on-hl', { anchor: 'middle', mono: true });
      move(chipG, 20 + aw + 15, 128);
      var srcLabel = txt(ask, W.source1, 20, 154, 11, 600, 'ink2');
      var srcCard = el(ask, 'g');
      el(srcCard, 'rect', { x: 0, y: 0, width: 310, height: 54, rx: 16, fill: 'card' });
      var sc = el(srcCard, 'g', { transform: 'translate(21 18)' });
      el(sc, 'rect', { x: -9, y: -9, width: 18, height: 18, rx: 6, fill: 'hl' });
      txt(sc, '1', 0, 0.5, 9.5, 600, 'on-hl', { anchor: 'middle', mono: true });
      var whenW = width(txt(srcCard, W.when, 37, 18, 10.5, 600, 'ink'));
      move(icon(srcCard, 'watch', 12, 'ink2'), 37 + whenW + 13, 18);
      txt(srcCard, A.watch, 37 + whenW + 21, 18, 9.5, 400, 'ink2');
      move(icon(srcCard, 'chevronRight', 11, 'ink3'), 294, 18);
      fit(txt(srcCard, W.snippet, 12, 38.3, 10.5, 400, 'ink'), 286, 0.85);

      var bar = el(ask, 'g', { transform: 'translate(16 224)' });
      el(bar, 'rect', { x: 0.5, y: 0.5, width: 309, height: 43, rx: 21.5, fill: 'card', stroke: 'hair', 'stroke-width': 1 });
      var placeholder = txt(bar, A.placeholder, 16, 22, 12.5, 400, 'ink3');
      var typedText = txt(bar, '', 16, 22, 12.5, 400, 'ink');
      var chars = Array.from(W.question), prefix = [0];
      chars.forEach(function (ch, k) { prefix.push(measure(bar, chars.slice(0, k + 1).join(''), 12.5, 400)); });
      var caret = el(bar, 'rect', { y: 14.5, width: 1.5, height: 15, fill: 'ink' });
      var send = el(bar, 'g');
      el(send, 'circle', { r: 16, fill: 'tile' });
      var sendOn = el(send, 'circle', { r: 16, fill: 'accent' });
      var arrowOff = icon(send, 'arrowUp', 15, 'ink3');
      var arrowOn = icon(send, 'arrowUp', 15, 'on-accent');
      var lastTyped = null;

      var tabs = tabBar(content, A.tabs, 270);
      var fing = finger(content, [
        { x: 292, y: 111, at: M.toggle }, { x: 171, y: 182, at: M.open }, { x: 213.75, y: 287, at: M.askTab },
        { x: 171, y: 246, at: M.focus }, { x: 304, y: 246, at: M.send }
      ]);

      return function (t) {
        c.fade(t);
        sw.set(spring(seg(t, M.on, M.on + 0.35)));
        op(found, seg(t, M.found, M.found + 0.3));

        var toDay = seg(t, M.tab, M.tab + 0.3);
        rise(cardA, t, M.a, 0, 76, 10, 0.35);
        rise(cardB, t, M.b, 0, 150, 10, 0.35);
        rise(sleep, t, M.marker, 0, 234, 8, 0.3);
        var push = ease(seg(t, M.open + 0.1, M.open + 0.5));
        day.setAttribute('transform', 'translate(' + (-push * 342 * 0.28) + ' 0)');
        op(day, toDay * (1 - seg(push, 0.85, 1)) * (1 - seg(t, M.askTab, M.askTab + 0.3)));
        op(settings, 1 - seg(t, M.tab - 0.1, M.tab + 0.2));
        detail.setAttribute('transform', 'translate(' + ((1 - push) * 342) + ' 0)');
        op(detail, push > 0 ? 1 - seg(t, M.askTab, M.askTab + 0.3) : 0);

        var toAsk = seg(t, M.askTab, M.askTab + 0.3);
        op(ask, toAsk);
        var sending = t >= M.send + 0.05;
        var shown = sending ? '' : typed(W.question, seg(t, M.typing, M.typingEnd));
        if (shown !== lastTyped) {
          typedText.textContent = shown;
          lastTyped = shown;
        }
        var n = Array.from(shown).length;
        op(placeholder, n ? 0 : 1);
        caret.setAttribute('x', 16 + prefix[n] + 1);
        op(caret, t >= M.focus && !sending && Math.sin(t * 9) > -0.2 ? 1 : 0);
        move(send, 288, 22, 1 - 0.14 * pulse(t, M.send - 0.05, M.send + 0.2));
        op(sendOn, n ? 1 : 0);
        op(arrowOn, n ? 1 : 0);
        op(arrowOff, n ? 0 : 1);
        var bubbleIn = easeOut(seg(t, M.bubble, M.bubble + 0.3));
        question.setAttribute('transform', 'translate(0 ' + (52 + (1 - bubbleIn) * 10) + ')');
        op(question, bubbleIn);
        op(thinking, seg(t, M.thinking, M.thinking + 0.15) * (1 - seg(t, M.answer - 0.1, M.answer + 0.05)));
        dots.forEach(function (d, i) { op(d, 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 8 - i * 1.1))); });
        op(from, seg(t, M.answer, M.answer + 0.3));
        var ans = easeOut(seg(t, M.answer + 0.1, M.answer + 0.4));
        answer.setAttribute('transform', 'translate(0 ' + ((1 - ans) * 6) + ')');
        op(answer, ans);
        var chipK = spring(seg(t, M.chip, M.chip + 0.35));
        var cp = [20 + aw + 15, 128];
        move(chipG, cp[0], cp[1], lerp(0.4, 1, chipK));
        op(chipG, chipK);
        var src = easeOut(seg(t, M.source, M.source + 0.3));
        op(srcLabel, src);
        srcCard.setAttribute('transform', 'translate(16 ' + (164 + (1 - src) * 8) + ')');
        op(srcCard, src);
        tabs.set(t < M.askTab + 0.05 ? 0 : 2, '', 0);
        op(tabs.g, t >= M.tab ? 1 : 0);
        fing(t);
      };
    }
  };

  // 17. A poster of the day (PosterEditorView, PosterCanvas.swift): the day as a dark poster with how long
  //     the talking took, a name for the day and when it happened; then a line picked from it, swept by the
  //     highlighter; then the day as a till receipt, and a short video of it to share.

  /** The poster's own colours (PosterPalette): the same in the light and the dark theme of the page. */
  var PP = {
    ink: '#111318', white: '#FFFFFF', lime: '#CDF04A', muted: '#9AA0AA', faint: '#6E747E', tile: '#24272C',
    paperMuted: '#5E636E', rule: '#B9BEC6', levels: ['#24272C', '#2F3B12', '#536A17', '#87A81A', '#CDF04A']
  };
  /** How much was said in each half hour of the poster's day, from 0 (nothing) to 4 (the most). */
  var POSTER_DAY = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 2, 1, 4, 2, 3, 3, 4, 1, 0, 4, 2, 1, 2, 0, 1, 3, 2, 1, 0, 2, 4, 2, 1, 0, 0, 0, 0, 0, 0];

  /** The app icon in small: lime bars on a dark tile, and the name after it unless `bare`. */
  function posterMark(parent, x, y, onInk, bare) {
    var g = el(parent, 'g', { transform: 'translate(' + x + ' ' + y + ')' });
    el(g, 'rect', { x: 0, y: -5.5, width: 11, height: 11, rx: 2.6, fill: onInk ? PP.tile : PP.ink });
    [0.22, 0.44, 0.3, 0.56, 0.36, 0.18].forEach(function (h, i) {
      el(g, 'rect', { x: 2.05 + i * 1.25, y: -h * 5.5, width: 0.8, height: h * 11, rx: 0.4, fill: PP.lime });
    });
    if (!bare) txt(g, 'DayRecall', 15, 0.5, 8, 700, onInk ? PP.white : PP.ink);
    return g;
  }

  /** A QR code in the corner: its three finder squares and a scatter of modules, enough to read as one. */
  function qrTile(parent, x, y, side, onPaper) {
    var g = el(parent, 'g', { transform: 'translate(' + x + ' ' + y + ')' });
    el(g, 'rect', { x: 0, y: 0, width: side, height: side, rx: side * 0.14, fill: PP.white, stroke: onPaper ? '#E4E6EA' : 'none', 'stroke-width': 0.8 });
    var cell = (side - 4) / 9;
    function at(cx, cy, w, fill) { el(g, 'rect', { x: 2 + cx * cell, y: 2 + cy * cell, width: cell * w, height: cell * w, fill: fill }); }
    [[0, 0], [6, 0], [0, 6]].forEach(function (p) {
      at(p[0], p[1], 3, PP.ink);
      at(p[0] + 0.55, p[1] + 0.55, 1.9, PP.white);
      at(p[0] + 1, p[1] + 1, 1, PP.ink);
    });
    [[4, 0], [4, 2], [3, 4], [5, 4], [4, 5], [7, 4], [8, 5], [6, 6], [8, 7], [4, 7], [5, 8], [7, 8], [3, 3], [8, 3]].forEach(function (p) {
      at(p[0], p[1], 1, PP.ink);
    });
    return g;
  }

  var Poster = {
    w: 342, h: 320, length: 13.8, preview: 3.9, still: 3.9,
    steps: [{ start: 0, still: 3.9 }, { start: 4.1, still: 7.5 }, { start: 7.8, still: 13.1 }],
    build: function (svg, ctx) {
      var W = ctx.words.poster;
      var M = { line: 4.3, receipt: 7.9, video: 11.6 };
      var c = canvas(svg, Poster.length, 0.3, 0.4);
      var content = c.content;
      el(content, 'rect', { x: 0, y: 0, width: 342, height: 320, fill: 'ground' });

      // The preview: a 9:16 poster on the left of the editor.
      var PW = 160, PH = 288, SX = 12, SW = 136, pitch = SW / POSTER_DAY.length;
      var clip = uid('poster');
      el(el(el(svg, 'defs'), 'clipPath', { id: clip }), 'rect', { x: 0, y: 0, width: PW, height: PH, rx: 14 });
      // A still shadow under the poster, so the moving picture above it is not filtered on every frame.
      var shadow = el(content, 'rect', { x: 20, y: 24, width: PW - 8, height: PH - 4, rx: 14, fill: PP.ink, opacity: 0.16 });
      shadow.style.filter = 'blur(7px)';
      var frame = el(content, 'g', { transform: 'translate(16 16)' });
      var pic = el(frame, 'g', { 'clip-path': 'url(#' + clip + ')' });

      // The day: dark, the length of the talk counted up, the name of the day, the day as a strip of bars.
      var dayG = el(pic, 'g');
      el(dayG, 'rect', { x: 0, y: 0, width: PW, height: PH, fill: PP.ink });
      var dHead = el(dayG, 'g');
      posterMark(dHead, 12, 18, true);
      txt(dHead, W.date, PW - 12, 18.5, 7, 500, PP.muted, { anchor: 'end' });
      var big = el(dayG, 'g');
      var hN = txt(big, '3', 0, 0, 34, 600, PP.white), hU = txt(big, W.hours, 0, 8, 12, 500, PP.muted);
      var mN = txt(big, '02', 0, 0, 34, 600, PP.white), mU = txt(big, W.minutes, 0, 8, 12, 500, PP.muted);
      hN.style.fontVariantNumeric = mN.style.fontVariantNumeric = 'tabular-nums';
      var bx = 12 + width(hN) + 2;
      hN.setAttribute('x', 12);
      hU.setAttribute('x', bx);
      bx += width(hU) + 5;
      mN.setAttribute('x', bx);
      mU.setAttribute('x', bx + width(mN) + 2);
      var shownMinutes = -1;
      var caption = txt(dayG, W.caption, 0, 0, 8, 400, PP.muted);
      fit(caption, SW, 0.7);
      var chip = el(dayG, 'g');
      var chipW = measure(dayG, W.dayName, 8, 650) + 16;
      el(chip, 'rect', { x: 0, y: -7.5, width: chipW, height: 15, rx: 7.5, fill: PP.lime });
      txt(chip, W.dayName, 8, 0.5, 8, 650, PP.ink);
      var HT = [3, 8, 14, 22, 32], base = 190;
      var dayBars = POSTER_DAY.map(function (lv, i) {
        return el(dayG, 'rect', { x: SX + i * pitch, y: base, width: pitch - 0.8, height: 0, rx: 0.8, fill: PP.levels[lv] });
      });
      var cursor = el(dayG, 'rect', { x: SX, y: base - 36, width: 1.2, height: 38, rx: 0.6, fill: PP.lime });
      var hours = el(dayG, 'g');
      ['6:00', '12:00', '18:00'].forEach(function (m, i) {
        txt(hours, m, SX + SW * (i + 1) / 4, base + 9, 6.5, 500, PP.faint, { anchor: 'middle' });
      });
      var stats = W.stats.map(function (st) {
        var g = el(dayG, 'g');
        txt(g, st.v, 0, 0, 13, 650, PP.white);
        fit(txt(g, st.l, 0, 13, 7, 400, PP.muted), 42, 0.7);
        return g;
      });
      var dFoot = el(dayG, 'g');
      txt(dFoot, W.address, 12, 270, 7.5, 650, PP.white);
      qrTile(dFoot, PW - 34, 254, 22, false);

      // A line: white, the line you picked swept by the highlighter, and the moment it was said.
      var lineG = el(pic, 'g');
      el(lineG, 'rect', { x: 0, y: 0, width: PW, height: PH, fill: PP.white });
      var lHead = el(lineG, 'g');
      fit(txt(lHead, W.kicker, 12, 18.5, 7, 500, PP.paperMuted), 84, 0.7);
      txt(lHead, W.date, PW - 12, 18.5, 7, 500, PP.paperMuted, { anchor: 'end' });
      var quote = el(lineG, 'g');
      [0, 11].forEach(function (dx) {
        el(quote, 'circle', { cx: 17.5 + dx, cy: 61, r: 4.4, fill: PP.ink });
        el(quote, 'path', { d: 'M' + (13.2 + dx) + ' 61.5C' + (13.2 + dx) + ' 55 ' + (15.8 + dx) + ' 51.5 ' + (20.4 + dx) + ' 50',
          fill: 'none', stroke: PP.ink, 'stroke-width': 3, 'stroke-linecap': 'round' });
      });
      var lineSize = /[⺀-鿿]/.test(W.line) ? 18 : 20, lineH = lineSize * 1.34;
      var parts = W.line.match(/[^\s⺀-鿿＀-￯]+|\s+|[\s\S]/g) || [];
      var probe = txt(lineG, '', 12, 0, lineSize, 750, PP.ink);
      var lines = [], line = '';
      parts.forEach(function (p) {
        probe.textContent = (line + p).replace(/\s+$/, '');
        if (line && !/^\s+$/.test(p) && width(probe) > SW) {
          lines.push(line.replace(/\s+$/, ''));
          line = p;
        } else {
          line += p;
        }
      });
      if (line) lines.push(line.replace(/\s+$/, ''));
      lineG.removeChild(probe);
      var marked = lines.map(function (l, i) {
        var y = 90 + lineH * i;
        var mark = el(lineG, 'rect', { x: 10, y: y - lineSize * 0.44, width: 0, height: lineSize * 0.88, rx: 3, fill: PP.lime });
        return { mark: mark, w: width(txt(lineG, l, 12, y, lineSize, 750, PP.ink)) + 4 };
      });
      var lBase = 222, MI = 39;
      var lineBars = POSTER_DAY.map(function (lv, i) {
        var h = [2, 4, 6, 8, 10][lv];
        return el(lineG, 'rect', { x: SX + i * pitch, y: lBase - h, width: pitch - 0.8, height: h, rx: 0.6, fill: PP.ink, 'fill-opacity': i === MI ? 0 : 0.16 });
      });
      var marker = el(lineG, 'rect', { x: SX + MI * pitch, y: lBase - 10, width: pitch - 0.8, height: 10, rx: 0.6, fill: PP.ink });
      var lineTime = txt(lineG, W.lineTime, SX + MI * pitch + pitch / 2, lBase + 9, 7, 650, PP.ink, { anchor: 'middle' });
      var lFoot = el(lineG, 'g');
      txt(lFoot, W.address, 12, 270, 7.5, 650, PP.ink);
      qrTile(lFoot, PW - 34, 254, 22, true);

      // A receipt: the day's numbers as items on a till receipt on a lime table, the day itself as the barcode.
      var recG = el(pic, 'g');
      el(recG, 'rect', { x: 0, y: 0, width: PW, height: PH, fill: PP.lime });
      var paper = el(recG, 'g');
      var RX = 14, RW = 132, RT = 24, RH = 200, teeth = 12, tw = RW / teeth;
      var d = 'M' + RX + ' ' + (RT + 3);
      for (var i = 0; i < teeth; i++) d += 'L' + (RX + tw * (i + 0.5)) + ' ' + RT + 'L' + (RX + tw * (i + 1)) + ' ' + (RT + 3);
      d += 'L' + (RX + RW) + ' ' + (RT + RH - 3);
      for (var j = teeth; j > 0; j--) d += 'L' + (RX + tw * (j - 0.5)) + ' ' + (RT + RH) + 'L' + (RX + tw * (j - 1)) + ' ' + (RT + RH - 3);
      el(paper, 'path', { d: d + 'Z', fill: PP.white });
      var mid = RX + RW / 2;
      posterMark(paper, mid - 5.5, RT + 17, false, true);
      txt(paper, 'DayRecall', mid, RT + 33, 8, 650, PP.ink, { anchor: 'middle', mono: true });
      txt(paper, W.date, mid, RT + 43, 6.5, 400, PP.paperMuted, { anchor: 'middle', mono: true });
      function rule(y) {
        el(paper, 'line', { x1: RX + 10, y1: y, x2: RX + RW - 10, y2: y, stroke: PP.rule, 'stroke-width': 0.8, 'stroke-dasharray': '2.5 2' });
      }
      rule(RT + 53);
      var rows = W.rows.map(function (r, k) {
        var g = el(paper, 'g');
        var y = RT + 65 + 12.5 * k;
        var lw = width(txt(g, r[0], RX + 10, y, 7, 400, PP.ink, { mono: true }));
        var vw = width(txt(g, r[1], RX + RW - 10, y, 7, 400, PP.ink, { anchor: 'end', mono: true }));
        el(g, 'line', { x1: RX + 13 + lw, y1: y + 2, x2: RX + RW - 13 - vw, y2: y + 2, stroke: PP.rule, 'stroke-width': 0.9,
          'stroke-dasharray': '0.1 2', 'stroke-linecap': 'round' });
        return g;
      });
      var afterRows = RT + 65 + 12.5 * rows.length;
      rule(afterRows - 2);
      var total = el(paper, 'g');
      txt(total, W.total[0], RX + 10, afterRows + 10, 7.5, 700, PP.ink, { mono: true });
      fit(txt(total, W.total[1], RX + RW - 10, afterRows + 10, 7.5, 700, PP.ink, { anchor: 'end', mono: true }), RW - 56, 0.7);
      var codeBars = [], cx = RX + 12;
      POSTER_DAY.slice(18, 42).forEach(function (lv) {
        var w = 0.8 + 0.7 * lv;
        codeBars.push(el(paper, 'rect', { x: cx, y: afterRows + 22, width: w, height: 22, fill: PP.ink }));
        cx += (RW - 24) / 24;
      });
      var address = txt(paper, W.address, mid, afterRows + 53, 6, 400, PP.paperMuted, { anchor: 'middle', mono: true });
      var rFoot = el(recG, 'g');
      txt(rFoot, W.address, 12, 270, 7.5, 650, PP.ink);
      qrTile(rFoot, PW - 34, 254, 22, false);

      // The editor's controls on the right: the look, then sharing a picture or a video.
      txt(content, W.title, 190, 30, 19, 700, 'ink');
      el(content, 'rect', { x: 190, y: 48, width: 136, height: 120, rx: 18, fill: 'card' });
      var swatch = [PP.ink, PP.white, PP.lime];
      var looks = W.looks.map(function (name, k) {
        var y = 68 + 40 * k;
        if (k) el(content, 'rect', { x: 228, y: y - 20, width: 98, height: 1, fill: 'hair' });
        el(content, 'rect', { x: 203, y: y - 11, width: 16, height: 22, rx: 4, fill: swatch[k], stroke: k === 1 ? '#E4E6EA' : 'none', 'stroke-width': 1 });
        var off = txt(content, name, 229, y + 0.5, 12, 500, 'ink2');
        fit(off, 70, 0.75);
        var on = el(content, 'g');
        fit(txt(on, name, 229, y + 0.5, 12, 650, 'ink'), 70, 0.75);
        var tick = el(on, 'g');
        icon(tick, 'check', 13, 'accent');
        move(tick, 312, y);
        return { on: on, off: off, tick: tick, y: y };
      });
      var picBtn = el(content, 'g', { transform: 'translate(190 182)' });
      el(picBtn, 'rect', { x: 0, y: 0, width: 136, height: 36, rx: 18, fill: 'accent' });
      move(icon(picBtn, 'share', 13, 'on-accent'), 20, 18);
      fit(txt(picBtn, W.picture, 34, 18.5, 11.5, 600, 'on-accent'), 92, 0.75);
      var vidBtn = el(content, 'g', { transform: 'translate(190 226)' });
      el(vidBtn, 'rect', { x: 0, y: 0, width: 136, height: 36, rx: 18, fill: 'card' });
      var vidIcon = el(vidBtn, 'g');
      move(icon(vidIcon, 'video', 14, 'ink'), 20, 18);
      var vidDone = el(vidBtn, 'g');
      move(icon(vidDone, 'check', 14, 'success'), 20, 18);
      fit(txt(vidBtn, W.video, 34, 18.5, 11.5, 600, 'ink'), 92, 0.75);
      var making = el(content, 'g');
      fit(txt(making, W.making, 190, 281, 10, 500, 'ink2'), 136, 0.75);
      el(making, 'rect', { x: 190, y: 291, width: 136, height: 5, rx: 2.5, fill: 'track' });
      var bar = el(making, 'rect', { x: 190, y: 291, width: 0, height: 5, rx: 2.5, fill: 'accent' });

      var fing = finger(content, [{ x: 262, y: 108, at: M.line }, { x: 262, y: 148, at: M.receipt }, { x: 258, y: 244, at: M.video }]);
      // A look that cannot be seen is not drawn at all.
      function shown(g, v) {
        op(g, v);
        g.style.display = v > 0 ? '' : 'none';
      }

      return function (t) {
        c.fade(t);
        var toLine = ease(seg(t, M.line + 0.05, M.line + 0.3)), toReceipt = ease(seg(t, M.receipt + 0.05, M.receipt + 0.3));
        shown(dayG, 1 - toLine);
        shown(lineG, toLine * (1 - toReceipt));
        shown(recG, toReceipt);

        // The day.
        var td = t - 0.2;
        rise(dHead, td, 0, 0, 0, 6, 0.4);
        rise(big, td, 0.2, 0, 74, 12, 0.5);
        var minutes = Math.round(182 * easeOut(seg(td, 0.3, 1.9)));
        if (minutes !== shownMinutes) {
          shownMinutes = minutes;
          hN.textContent = String(Math.floor(minutes / 60));
          mN.textContent = (minutes % 60 < 10 ? '0' : '') + (minutes % 60);
        }
        rise(caption, td, 1.4, 12, 100, 6, 0.4);
        var pop = seg(td, 1.6, 2.1);
        move(chip, 12, 122, lerp(0.6, 1, spring(pop)));
        op(chip, seg(td, 1.6, 1.8));
        var sweep = ease(seg(td, 1.9, 3.2)), edge = SX + SW * sweep;
        dayBars.forEach(function (b, i) {
          var x = SX + i * pitch, h = HT[POSTER_DAY[i]] * clamp((edge - x) / (pitch * 3));
          b.setAttribute('y', base - h);
          b.setAttribute('height', h);
        });
        cursor.setAttribute('x', edge - 0.6);
        op(cursor, sweep > 0 && sweep < 1 ? 1 : 0);
        op(hours, seg(td, 1.9, 2.2));
        stats.forEach(function (g, i) { rise(g, td, 2.9 + 0.15 * i, 12 + 46 * i, 220, 8, 0.35); });
        rise(dFoot, td, 3.3, 0, 0, 6, 0.4);

        // A line.
        var tl = t - (M.line + 0.15);
        rise(lHead, tl, 0, 0, 0, 6, 0.4);
        rise(quote, tl, 0.15, 0, 0, 6, 0.4);
        var swept = ease(seg(tl, 0.4, 1.8)) * marked.length;
        marked.forEach(function (m, i) { m.mark.setAttribute('width', m.w * clamp(swept - i)); });
        var shownBars = seg(tl, 1.9, 2.4);
        lineBars.forEach(function (b, i) { op(b, clamp(shownBars * 48 - i) > 0 ? 1 : 0); });
        var grow = easeOut(seg(tl, 2.4, 2.8));
        marker.setAttribute('height', lerp(10, 26, grow));
        marker.setAttribute('y', lBase - lerp(10, 26, grow));
        op(marker, shownBars > 0.8 ? 1 : 0);
        op(lineTime, seg(tl, 2.6, 2.8));
        rise(lFoot, tl, 2.6, 0, 0, 6, 0.4);

        // A receipt.
        var tr = t - (M.receipt + 0.15);
        paper.setAttribute('transform', 'translate(0 ' + ((1 - easeOut(seg(tr, 0, 0.9))) * 300) + ')');
        rows.forEach(function (g, k) { rise(g, tr, 0.8 + 0.22 * k, 0, 0, 4, 0.25); });
        rise(total, tr, 1.9, 0, 0, 4, 0.3);
        var printed = seg(tr, 2.1, 2.8) * codeBars.length;
        codeBars.forEach(function (b, k) { op(b, printed > k ? 1 : 0); });
        op(address, seg(tr, 2.7, 3.0));
        rise(rFoot, tr, 2.9, 0, 0, 6, 0.4);

        // The controls.
        var chosen = t < M.line ? 0 : t < M.receipt ? 1 : 2;
        looks.forEach(function (l, k) {
          var at = k === 0 ? 0 : k === 1 ? M.line : M.receipt;
          op(l.on, k === chosen ? 1 : 0);
          op(l.off, k === chosen ? 0 : 1);
          var s = k === chosen ? (k === 0 ? 1 : spring(seg(t, at, at + 0.35))) : 0;
          l.tick.setAttribute('transform', 'translate(312 ' + l.y + ') scale(' + lerp(0.4, 1, Math.min(s, 1.15)) + ')');
        });
        var press = pulse(t, M.video - 0.05, M.video + 0.2), bs = 1 - 0.04 * press;
        vidBtn.setAttribute('transform', 'translate(' + (190 + 68 * (1 - bs)) + ' ' + (226 + 18 * (1 - bs)) + ') scale(' + bs + ')');
        var made = seg(t, M.video + 0.15, M.video + 1.15), done = seg(t, M.video + 1.25, M.video + 1.45);
        op(making, seg(t, M.video + 0.1, M.video + 0.3) * (1 - done));
        bar.setAttribute('width', 136 * made);
        op(vidIcon, 1 - done);
        op(vidDone, done);
        fing(t);
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Playing: only the animations on screen run; with Reduce Motion each shows its still frame.

  var STAGES = {
    listening: Listening, tidying: Tidying, privacy: Privacy, consent: Consent, voice: Voice, ask: AskDay,
    battery: Battery, speakers: Speakers, languages: Languages, sync: Sync,
    todos: Todos, places: Places, day: Day, week: Week, handoff: Export, health: Health, poster: Poster
  };
  // The steps of the longer ones, for the pages that explain them: where each begins and its best moment.
  AskDay.preview = AskDay.still;
  AskDay.steps = [{ start: 0, still: 2.3 }, { start: 3.0, still: 5.9 }, { start: 6.2, still: 8.6 }];
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var items = [];
  var frameId = 0;

  // A fixed frame for screenshots and promo images: ?still shows every animation's still frame,
  // ?t=4.5 the frame 4.5 seconds into each loop. Nothing moves then.
  var query = window.URLSearchParams ? new URLSearchParams(location.search) : null;
  var fixedAt = !query ? null : query.has('t') ? parseFloat(query.get('t')) : query.has('still') ? 'still' : null;
  if (fixedAt !== null && fixedAt !== 'still' && !(fixedAt >= 0)) fixedAt = null;
  if (fixedAt !== null) calm = { matches: true };

  /** Draws a stage into `host` without playing it; returns it for whoever plays it (mount, features.js). */
  function create(host, name) {
    var def = STAGES[name];
    if (!def) return null;
    host.style.aspectRatio = def.w + ' / ' + def.h;
    if (def.w === 342) host.style.borderRadius = (24 / def.w * 100) + '% / ' + (24 / def.h * 100) + '%';
    var svg = el(null, 'svg', { viewBox: '0 0 ' + def.w + ' ' + def.h, 'aria-hidden': 'true', focusable: 'false', class: 'stage-svg' });
    host.appendChild(svg);
    var render;
    try {
      render = def.build(svg, { words: WORDS, host: host, lang: lang });
    } catch (err) {
      if (window.console) console.error(err);
      host.removeChild(svg);
      return null;
    }
    return { def: def, render: render, svg: svg };
  }

  function mount(host) {
    var made = create(host, host.getAttribute('data-stage'));
    if (!made) return;
    made.render(typeof fixedAt === 'number' ? Math.min(fixedAt, made.def.length - 0.01) : made.def.still);
    items.push({ host: host, def: made.def, render: made.render, visible: false, start: 0 });
  }

  function frame(now) {
    frameId = 0;
    if (calm.matches) return;
    var any = false;
    items.forEach(function (it) {
      if (!it.visible) return;
      any = true;
      it.render(((now - it.start) / 1000) % it.def.length);
    });
    if (any) frameId = requestAnimationFrame(frame);
  }

  function kick() {
    if (!frameId && !calm.matches) frameId = requestAnimationFrame(frame);
  }

  function rest() {
    items.forEach(function (it) { it.render(it.def.still); });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), pageIcon);
    Array.prototype.forEach.call(document.querySelectorAll('[data-stage]'), mount);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          items.forEach(function (it) {
            if (it.host !== entry.target) return;
            if (entry.isIntersecting && !it.visible) it.start = performance.now();
            it.visible = entry.isIntersecting;
          });
        });
        kick();
      }, { rootMargin: '60px 0px' });
      items.forEach(function (it) { io.observe(it.host); });
    } else {
      items.forEach(function (it) { it.visible = true; it.start = performance.now(); });
      kick();
    }
    var onChange = function () { if (calm.matches) rest(); else kick(); };
    if (calm.addEventListener) calm.addEventListener('change', onChange);
    else if (calm.addListener) calm.addListener(onChange);
  }

  // What features.js needs: stages to draw and play themselves, in the page's words.
  window.DayRecallStages = {
    create: create,
    words: WORDS,
    reduced: function () { return calm.matches; },
    ready: new Promise(function (resolve) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(resolve, resolve); })
  };

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  function start() { fontsReady.then(init, init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
