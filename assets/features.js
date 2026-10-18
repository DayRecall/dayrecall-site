/*
 * The feature cards of the home page: each shows its animation as a picture that plays while it is on
 * screen, and opens into a larger one with its steps, to watch, pause, step through and scrub, as the
 * app's animation library does. The animations themselves are in stages.js (window.DayRecallStages).
 */
(function () {
  'use strict';

  var API = window.DayRecallStages;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.feat[data-feature]'));
  if (!API || !cards.length) return;
  var root = document.documentElement;
  var UI = API.words.ui || {};
  var calmQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = function () { return calmQuery.matches || API.reduced(); };

  function fill(text, values) {
    return String(text).replace(/\{(\w+)\}/g, function (m, key) { return values[key] != null ? values[key] : m; });
  }

  function words(name) { return API.words[name] || {}; }

  // ---------------------------------------------------------------------------------------------
  // The pictures on the cards: drawn when they come near the screen, played while they are on it.

  var thumbs = cards.map(function (card) {
    return {
      card: card, name: card.getAttribute('data-feature'), host: card.querySelector('.feat-shot'),
      made: null, visible: false, t0: 0, last: 0, building: false
    };
  });
  var frameId = 0;
  var dialogOpen = false;

  function build(th) {
    if (th.made || th.building || !th.host) return;
    th.building = true;
    API.ready.then(function () {
      th.made = API.create(th.host, th.name);
      th.building = false;
      if (!th.made) return;
      th.t0 = performance.now();
      th.made.render(th.made.def.preview);
      kick();
    });
  }

  function tick(now) {
    frameId = 0;
    if (reduced() || dialogOpen) return;
    var any = false;
    thumbs.forEach(function (th) {
      if (!th.visible || !th.made) return;
      any = true;
      if (now - th.last < 33) return;   // thirty frames a second is plenty for a picture this size
      th.last = now;
      var def = th.made.def;
      th.made.render((def.preview + (now - th.t0) / 1000) % def.length);
    });
    if (any) frameId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!frameId && !reduced() && !dialogOpen) frameId = requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        thumbs.forEach(function (th) {
          if (th.host !== entry.target) return;
          if (entry.isIntersecting) {
            if (!th.visible) th.t0 = performance.now();
            build(th);
          }
          th.visible = entry.isIntersecting;
        });
      });
      kick();
    }, { rootMargin: '120px 0px' });
    thumbs.forEach(function (th) { if (th.host) seen.observe(th.host); });
  } else {
    thumbs.forEach(function (th) { th.visible = true; build(th); });
  }

  var onCalm = function () {
    thumbs.forEach(function (th) { if (th.made) th.made.render(th.made.def.preview); });
    kick();
  };
  if (calmQuery.addEventListener) calmQuery.addEventListener('change', onCalm);
  else if (calmQuery.addListener) calmQuery.addListener(onCalm);

  // ---------------------------------------------------------------------------------------------
  // The page that opens: the animation large, its steps, and the controls.

  var dlg = null, nodes = {}, cur = null, current = -1;

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/></svg>';
  var REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4.2h4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function ensureDialog() {
    if (dlg) return;
    dlg = el('dialog', { 'class': 'demo' });
    var panel = el('div', { 'class': 'demo-panel' }, dlg);
    nodes.close = el('button', { type: 'button', 'class': 'demo-close', 'aria-label': UI.close || 'Close' }, panel);
    nodes.close.innerHTML = CLOSE;

    var left = el('div', { 'class': 'demo-visual' }, panel);
    nodes.stage = el('div', { 'class': 'stage demo-stage t-light' }, left);

    var info = el('div', { 'class': 'demo-info' }, panel);
    var head = el('div', { 'class': 'demo-head' }, info);
    nodes.icon = el('span', { 'class': 'ico', 'aria-hidden': 'true' }, head);
    nodes.count = el('span', { 'class': 'demo-count' }, head);
    nodes.title = el('h3', { id: 'demo-title' }, info);
    nodes.lead = el('p', { 'class': 'demo-lead' }, info);
    dlg.setAttribute('aria-labelledby', 'demo-title');

    nodes.steps = el('ol', { 'class': 'demo-steps', 'aria-label': UI.steps || 'Steps' }, info);

    var controls = el('div', { 'class': 'demo-controls' }, info);
    nodes.play = el('button', { type: 'button', 'class': 'demo-btn demo-play' }, controls);
    nodes.replay = el('button', { type: 'button', 'class': 'demo-btn', 'aria-label': UI.replay || 'Replay' }, controls);
    nodes.replay.innerHTML = REPLAY;
    nodes.scrub = el('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'class': 'demo-scrub', 'aria-label': UI.progress || 'Position' }, controls);

    var nav = el('div', { 'class': 'demo-nav' }, info);
    nodes.prev = el('button', { type: 'button', 'class': 'demo-prev', 'aria-label': UI.prev || 'Previous' }, nav);
    nodes.prev.innerHTML = ARROW;
    nodes.next = el('button', { type: 'button', 'class': 'demo-next' }, nav);
    nodes.nextTitle = el('span', null, nodes.next);
    nodes.next.insertAdjacentHTML('beforeend', ARROW);

    nodes.close.addEventListener('click', closeDialog);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });
    nodes.play.addEventListener('click', function () {
      if (!cur) return;
      if (cur.playing) cur.playing = false; else { cur.playing = true; cur.last = performance.now(); }
      paint();
      loop();
    });
    nodes.replay.addEventListener('click', function () {
      if (!cur) return;
      cur.t = 0;
      cur.playing = true;
      cur.last = performance.now();
      paint();
      loop();
    });
    nodes.scrub.addEventListener('input', function () {
      if (!cur) return;
      cur.playing = false;
      cur.t = (nodes.scrub.value / 1000) * cur.made.def.length;
      paint();
    });
    nodes.prev.addEventListener('click', function () { go(-1); });
    nodes.next.addEventListener('click', function () { go(1); });
    document.body.appendChild(dlg);
  }

  function cardWords(i) {
    var card = cards[i];
    return {
      title: card.querySelector('h3').textContent.trim(),
      lead: card.querySelector('p').textContent.trim(),
      icon: card.querySelector('.ico'),
      name: card.getAttribute('data-feature')
    };
  }

  function stepAt(def, t) {
    var at = 0;
    def.steps.forEach(function (s, i) { if (t >= s.start) at = i; });
    return at;
  }

  /** Draws the frame and brings the steps, the slider and the buttons into step with it. */
  function paint() {
    if (!cur) return;
    var def = cur.made.def;
    var t = Math.min(Math.max(cur.t, 0), def.length - 0.001);
    cur.made.render(t);
    var step = stepAt(def, t);
    var end = step + 1 < def.steps.length ? def.steps[step + 1].start : def.length;
    var within = (t - def.steps[step].start) / (end - def.steps[step].start);
    cur.items.forEach(function (li, i) {
      li.classList.toggle('on', i === step);
      li.querySelector('.step-btn').setAttribute('aria-current', i === step ? 'step' : 'false');
      li.style.setProperty('--p', i === step ? Math.min(1, Math.max(0, within)).toFixed(3) : '0');
    });
    var v = Math.round((t / def.length) * 1000);
    nodes.scrub.value = v;
    nodes.scrub.style.setProperty('--p', (v / 1000).toFixed(3));
    nodes.scrub.setAttribute('aria-valuetext', fill(UI.step || '{n} / {total}', { n: step + 1, total: def.steps.length }));
    var label = cur.playing ? (UI.pause || 'Pause') : (UI.play || 'Play');
    nodes.play.innerHTML = cur.playing ? PAUSE : PLAY;
    nodes.play.setAttribute('aria-label', label);
  }

  function loop() {
    if (cur && cur.raf) return;
    var run = function (now) {
      if (!cur) return;
      cur.raf = 0;
      if (cur.playing) {
        cur.t += Math.min(0.1, (now - cur.last) / 1000);
        cur.last = now;
        if (cur.t >= cur.made.def.length) cur.t -= cur.made.def.length;
        paint();
        cur.raf = requestAnimationFrame(run);
      }
    };
    cur.raf = requestAnimationFrame(run);
  }

  function show(i) {
    current = (i + cards.length) % cards.length;
    var info = cardWords(current);
    if (cur && cur.raf) cancelAnimationFrame(cur.raf);
    cur = null;
    while (nodes.stage.firstChild) nodes.stage.removeChild(nodes.stage.firstChild);
    var made = API.create(nodes.stage, info.name);
    if (!made) return;
    var def = made.def;
    var w = words(info.name);
    nodes.title.textContent = info.title;
    nodes.lead.textContent = info.lead;
    nodes.icon.innerHTML = info.icon ? info.icon.innerHTML : '';
    nodes.count.textContent = fill(UI.count || '{n} / {total}', { n: current + 1, total: cards.length });
    nodes.steps.innerHTML = '';
    var items = (w.steps || []).map(function (s, k) {
      var li = el('li', null, nodes.steps);
      var b = el('button', { type: 'button', 'class': 'step-btn' }, li);
      el('span', { 'class': 'n', text: String(k + 1) }, b);
      el('span', { 'class': 't', text: s.t }, b);
      var wrap = el('div', { 'class': 'cap-wrap' }, li);
      el('p', { text: s.c }, el('div', null, wrap));
      el('i', { 'class': 'bar', 'aria-hidden': 'true' }, li);
      b.addEventListener('click', function () {
        if (!cur) return;
        if (reduced()) {
          cur.playing = false;
          cur.t = def.steps[k].still;
        } else {
          cur.t = def.steps[k].start + 0.02;
          cur.playing = true;
          cur.last = performance.now();
        }
        paint();
        loop();
      });
      return li;
    });
    var next = cardWords((current + 1) % cards.length);
    nodes.nextTitle.textContent = next.title;
    nodes.next.setAttribute('aria-label', (UI.next || 'Next') + ': ' + next.title);
    var still = reduced();
    cur = { made: made, items: items, t: still ? def.steps[def.steps.length - 1].still : 0, playing: !still, last: performance.now(), raf: 0 };
    paint();
    loop();
  }

  function go(by) { show(current + by); }

  function openDialog(i) {
    ensureDialog();
    dialogOpen = true;
    if (!dlg.open) dlg.showModal();
    dlg.classList.remove('closing');
    show(i);
    nodes.close.focus({ preventScroll: true });
  }

  function closeDialog() {
    if (!dlg || !dlg.open || dlg.classList.contains('closing')) return;
    var done = function () {
      dlg.classList.remove('closing');
      dlg.close();
      if (cur && cur.raf) cancelAnimationFrame(cur.raf);
      cur = null;
      while (nodes.stage.firstChild) nodes.stage.removeChild(nodes.stage.firstChild);
      dialogOpen = false;
      kick();
    };
    if (reduced()) { done(); return; }
    dlg.classList.add('closing');
    setTimeout(done, 200);
  }

  cards.forEach(function (card, i) {
    var open = card.querySelector('.feat-open');
    if (!open) return;
    open.addEventListener('click', function () { openDialog(i); });
  });

  root.classList.add('feat-js');
})();
