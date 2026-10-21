/* Localize the shared error page without redirecting or replacing its URL. */
(function () {
  'use strict';
  var source = document.getElementById('not-found-words');
  if (!source) return;
  var words = JSON.parse(source.textContent);
  var codes = Object.keys(words);

  function resolve(language) {
    if (typeof language !== 'string') return null;
    var code = language.trim().replace(/_/g, '-').toLowerCase();
    for (var i = 0; i < codes.length; i++) {
      if (codes[i].toLowerCase() === code) return codes[i];
    }
    if (code === 'zh' || code.indexOf('zh-') === 0) {
      if (code.indexOf('zh-hans') === 0) return 'zh-Hans';
      return code.indexOf('zh-hant') === 0 || /^zh-(tw|hk|mo)(-|$)/.test(code) ? 'zh-Hant' : 'zh-Hans';
    }
    for (var j = 0; j < codes.length; j++) {
      if (codes[j].split('-')[0].toLowerCase() === code.split('-')[0]) return codes[j];
    }
    return null;
  }

  var chosen = null;
  var pathname = window.location.pathname;
  for (var i = 0; i < codes.length; i++) {
    var prefix = words[codes[i]].path;
    if (prefix !== '/' && (pathname.indexOf(prefix) === 0 || pathname === prefix.slice(0, -1))) {
      chosen = codes[i];
      break;
    }
  }
  if (new URLSearchParams(window.location.search).get('lang') === 'en') chosen = 'en';
  var saved = null;
  try { saved = window.localStorage.getItem('dayrecall-language'); } catch (_) {}
  if (!saved) {
    try { saved = window.sessionStorage.getItem('dayrecall-language'); } catch (_) {}
  }
  if (!chosen && saved) chosen = resolve(saved) || 'en';
  var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (var j = 0; j < preferred.length && !chosen; j++) chosen = resolve(preferred[j]);
  chosen = chosen && words[chosen] ? chosen : 'en';
  var s = words[chosen];
  document.documentElement.lang = chosen;
  document.title = s.title;
  document.getElementById('not-found-heading').textContent = s.heading;
  var home = document.getElementById('not-found-home');
  home.textContent = s.home;
  home.setAttribute('href', s.path + (chosen === 'en' ? '?lang=en' : ''));
  document.getElementById('not-found-languages').setAttribute('aria-label', s.languageLabel);
})();
