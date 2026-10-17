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
    ]
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
  // Playing: only the animations on screen run; with Reduce Motion each shows its still frame.

  var STAGES = {
    listening: Listening, tidying: Tidying, privacy: Privacy, consent: Consent, voice: Voice, ask: AskDay,
    battery: Battery, speakers: Speakers, languages: Languages, sync: Sync
  };
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var items = [];
  var frameId = 0;

  // A fixed frame for screenshots and promo images: ?still shows every animation's still frame,
  // ?t=4.5 the frame 4.5 seconds into each loop. Nothing moves then.
  var query = window.URLSearchParams ? new URLSearchParams(location.search) : null;
  var fixedAt = !query ? null : query.has('t') ? parseFloat(query.get('t')) : query.has('still') ? 'still' : null;
  if (fixedAt !== null && fixedAt !== 'still' && !(fixedAt >= 0)) fixedAt = null;
  if (fixedAt !== null) calm = { matches: true };

  function mount(host) {
    var def = STAGES[host.getAttribute('data-stage')];
    if (!def) return;
    host.style.aspectRatio = def.w + ' / ' + def.h;
    var svg = el(null, 'svg', { viewBox: '0 0 ' + def.w + ' ' + def.h, 'aria-hidden': 'true', focusable: 'false', class: 'stage-svg' });
    host.appendChild(svg);
    var render;
    try {
      render = def.build(svg, { words: WORDS, host: host, lang: lang });
    } catch (err) {
      if (window.console) console.error(err);
      return;
    }
    render(typeof fixedAt === 'number' ? Math.min(fixedAt, def.length - 0.01) : def.still);
    items.push({ host: host, def: def, render: render, visible: false, start: 0 });
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

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  function start() { fontsReady.then(init, init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
