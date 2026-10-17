/* Choose an existing translation for visitors to an English default URL. */
(function () {
  'use strict';

  var STORAGE_KEY = 'dayrecall-language';

  function remember(language) {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
      return;
    } catch (_) {
      // A session choice still works when persistent storage is disabled.
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, language);
    } catch (_) {
      // The clicked link itself works when both storage types are disabled.
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var link = target && target.closest && target.closest('.langmenu a[hreflang], .foot-langs a[hreflang]');
    if (!link) return;
    var language = link.getAttribute('hreflang');
    if (language && language.toLowerCase() !== 'x-default') remember(language);
  });

  // A language-specific URL is an explicit choice, including a shared link.
  if (document.documentElement.lang.toLowerCase() !== 'en') return;

  // English menu links use this marker so they work even when storage is blocked.
  if (new URLSearchParams(window.location.search).get('lang') === 'en') {
    return;
  }

  var routes = Object.create(null);
  var alternates = document.querySelectorAll('link[rel="alternate"][hreflang]');
  for (var i = 0; i < alternates.length; i++) {
    var code = alternates[i].getAttribute('hreflang').toLowerCase();
    if (code === 'x-default') continue;
    routes[code] = new URL(alternates[i].getAttribute('href'), window.location.href).pathname;
  }

  function routeFor(language) {
    if (typeof language !== 'string') return null;
    var code = language.trim().replace(/_/g, '-').toLowerCase();
    if (!code) return null;
    if (routes[code]) return routes[code];
    var primary = code.split('-')[0];
    var available = Object.keys(routes);
    for (var j = 0; j < available.length; j++) {
      if (available[j].split('-')[0] === primary) return routes[available[j]];
    }
    return null;
  }

  var chosen = null;
  var saved = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    // Try session storage below.
  }
  if (!saved) {
    try {
      saved = window.sessionStorage.getItem(STORAGE_KEY);
    } catch (_) {
      // Use browser preferences when storage is unavailable.
    }
  }

  if (saved) {
    chosen = routeFor(saved);
    // A saved language with no translation on this page falls back to English.
  } else {
    var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [];
    for (var k = 0; k < preferred.length && !chosen; k++) chosen = routeFor(preferred[k]);
    if (!chosen) chosen = routeFor(navigator.language);
  }

  if (chosen && chosen !== window.location.pathname) {
    window.location.replace(chosen + window.location.search + window.location.hash);
  }
})();
