const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'locale.js'), 'utf8');

function visit({
  pathname = '/', search = '', hash = '', htmlLanguage = 'en',
  alternates = { en: '/', 'zh-Hans': '/zh/', 'zh-Hant': '/zh-hant/', de: '/de/', 'pt-PT': '/pt/' },
  languages = [], language = '', saved = null, sessionSaved = null,
  localStorageBlocked = false, sessionStorageBlocked = false
} = {}) {
  const values = new Map(saved === null ? [] : [['dayrecall-language', saved]]);
  const sessionValues = new Map(sessionSaved === null ? [] : [['dayrecall-language', sessionSaved]]);
  const redirects = [];
  const listeners = {};
  const location = {
    pathname, search, hash,
    href: `https://dayrecall.com${pathname}${search}${hash}`,
    replace(value) { redirects.push(value); }
  };
  const localStorage = {
    getItem(key) {
      if (localStorageBlocked) throw new Error('Storage blocked');
      return values.get(key) || null;
    },
    setItem(key, value) {
      if (localStorageBlocked) throw new Error('Storage blocked');
      values.set(key, value);
    }
  };
  const sessionStorage = {
    getItem(key) {
      if (sessionStorageBlocked) throw new Error('Session storage blocked');
      return sessionValues.get(key) || null;
    },
    setItem(key, value) {
      if (sessionStorageBlocked) throw new Error('Session storage blocked');
      sessionValues.set(key, value);
    }
  };
  const document = {
    documentElement: { lang: htmlLanguage },
    addEventListener(type, callback) { listeners[type] = callback; },
    querySelectorAll() {
      return Object.entries(alternates).map(([code, href]) => ({
        getAttribute(attribute) { return attribute === 'hreflang' ? code : href; }
      }));
    }
  };
  vm.runInNewContext(source, {
    URL, URLSearchParams, document, navigator: { languages, language },
    window: { location, localStorage, sessionStorage }
  });
  return { redirects, values, sessionValues, listeners };
}

test('uses browser preferences in order and preserves query and hash', () => {
  const result = visit({
    search: '?campaign=watch', hash: '#privacy',
    languages: ['pl-PL', 'zh-CN', 'de-DE'], language: 'en-US'
  });
  assert.deepEqual(result.redirects, ['/zh/?campaign=watch#privacy']);
});

test('matches a regional language to the available translation', () => {
  assert.deepEqual(visit({ languages: ['pt-BR'] }).redirects, ['/pt/']);
  assert.deepEqual(visit({ languages: [], language: 'de-AT' }).redirects, ['/de/']);
});

test('routes Traditional and Simplified Chinese preferences separately', () => {
  for (const code of ['zh-Hant', 'zh-Hant-HK', 'zh-TW', 'zh-HK', 'zh-MO', 'zh_TW']) {
    assert.deepEqual(visit({ languages: [code] }).redirects, ['/zh-hant/'], code);
  }
  for (const code of ['zh-Hans', 'zh-Hans-SG', 'zh-CN', 'zh-SG', 'zh']) {
    assert.deepEqual(visit({ languages: [code] }).redirects, ['/zh/'], code);
  }
});

test('respects a saved manual choice and falls back to English for missing pages', () => {
  assert.deepEqual(visit({ saved: 'en', languages: ['zh-CN'] }).redirects, []);
  assert.deepEqual(visit({ saved: 'de', languages: ['zh-CN'] }).redirects, ['/de/']);
  assert.deepEqual(visit({ saved: 'zh-Hant', languages: ['zh-CN'] }).redirects, ['/zh-hant/']);
  assert.deepEqual(visit({ saved: 'zh-Hans', languages: ['zh-TW'] }).redirects, ['/zh/']);
  assert.deepEqual(visit({
    pathname: '/privacy/', alternates: { en: '/privacy/', 'zh-Hans': '/zh/privacy/' },
    saved: 'pl', languages: ['zh-CN']
  }).redirects, []);
});

test('redirects a translated English subpage only when that translation exists', () => {
  const alternates = { en: '/faq/', 'zh-Hans': '/zh/faq/', 'zh-Hant': '/zh-hant/faq/' };
  assert.deepEqual(visit({ pathname: '/faq/', alternates, languages: ['zh-TW'] }).redirects, ['/zh-hant/faq/']);
  assert.deepEqual(visit({ pathname: '/faq/', alternates, languages: ['fr-FR'] }).redirects, []);
  assert.deepEqual(visit({
    pathname: '/support/',
    alternates: { en: '/support/', 'zh-Hans': '/zh/support/', 'zh-Hant': '/zh-hant/support/' },
    languages: ['zh-HK']
  }).redirects, ['/zh-hant/support/']);
});

test('routes every supported language to its legal pages', () => {
  const routes = {
    en: '', 'zh-Hans': 'zh', 'zh-Hant': 'zh-hant', da: 'da', de: 'de',
    es: 'es', fr: 'fr', it: 'it', ja: 'ja', ko: 'ko', nl: 'nl',
    'pt-PT': 'pt', sv: 'sv', tr: 'tr'
  };
  for (const page of ['privacy', 'terms']) {
    const pathname = `/${page}/`;
    const alternates = Object.fromEntries(Object.entries(routes).map(([code, slug]) =>
      [code, slug ? `/${slug}/${page}/` : pathname]));
    for (const [code, slug] of Object.entries(routes)) {
      if (code === 'en') continue;
      assert.deepEqual(visit({ pathname, alternates, languages: [code] }).redirects,
        [`/${slug}/${page}/`], `${page}: ${code}`);
    }
    for (const code of ['zh-TW', 'zh-HK', 'zh-MO']) {
      assert.deepEqual(visit({ pathname, alternates, languages: [code] }).redirects,
        [`/zh-hant/${page}/`], `${page}: ${code}`);
    }
    assert.deepEqual(visit({ pathname, alternates, languages: ['zh-TW', 'zh', 'en-US'] }).redirects,
      [`/zh-hant/${page}/`]);
    assert.deepEqual(visit({ pathname, alternates, saved: 'zh-Hant', languages: ['zh-CN'] }).redirects,
      [`/zh-hant/${page}/`]);
    assert.deepEqual(visit({ pathname, alternates, languages: ['zh-CN'] }).redirects,
      [`/zh/${page}/`]);
  }
});

test('never redirects an explicit localized URL', () => {
  assert.deepEqual(visit({
    pathname: '/zh/', htmlLanguage: 'zh-Hans', saved: 'en', languages: ['de-DE']
  }).redirects, []);
  assert.deepEqual(visit({
    pathname: '/zh-hant/', htmlLanguage: 'zh-Hant', saved: 'zh-Hans', languages: ['zh-CN']
  }).redirects, []);
});

test('English query override affects only this visit, including when storage is blocked', () => {
  const blocked = visit({
    search: '?lang=en&campaign=watch', languages: ['zh-CN'],
    localStorageBlocked: true, sessionStorageBlocked: true
  });
  assert.deepEqual(blocked.redirects, []);

  const result = visit({ search: '?lang=en', saved: 'de', languages: ['zh-CN'] });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.values.get('dayrecall-language'), 'de');
  assert.equal(result.sessionValues.size, 0);
});

test('menu clicks save a choice, using session storage when local storage is blocked', () => {
  const result = visit({ search: '?lang=en', languages: ['zh-CN'] });
  const link = { getAttribute() { return 'en'; } };
  result.listeners.click({ target: { closest() { return link; } } });
  assert.equal(result.values.get('dayrecall-language'), 'en');

  const fallback = visit({
    search: '?lang=en', languages: ['zh-CN'], localStorageBlocked: true
  });
  const german = { getAttribute() { return 'de'; } };
  fallback.listeners.click({ target: { closest() { return german; } } });
  assert.equal(fallback.sessionValues.get('dayrecall-language'), 'de');
  assert.deepEqual(visit({
    sessionSaved: fallback.sessionValues.get('dayrecall-language'),
    languages: ['zh-CN'], localStorageBlocked: true
  }).redirects, ['/de/']);
});

test('unsupported browser languages keep the English page', () => {
  assert.deepEqual(visit({ languages: ['pl-PL', 'fi-FI'], language: 'pl-PL' }).redirects, []);
});
