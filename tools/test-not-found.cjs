const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'not-found.js'), 'utf8');

function visit({ pathname = '/missing', search = '', languages = [], saved = null, blocked = false } = {}) {
  const words = Object.fromEntries([
    ['en', '/'], ['zh-Hans', '/zh/'], ['zh-Hant', '/zh-hant/'], ['de', '/de/'], ['pt-PT', '/pt/']
  ].map(([code, route]) => [code, {
    path: route, title: code + ' title', heading: code + ' heading', home: code + ' home', languageLabel: code + ' language'
  }]));
  const nodes = Object.fromEntries(['not-found-heading', 'not-found-home', 'not-found-languages'].map(id => [id, {
    textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }
  }]));
  nodes['not-found-words'] = { textContent: JSON.stringify(words) };
  const document = { documentElement: { lang: 'en' }, title: '', getElementById: id => nodes[id] };
  const storage = { getItem() { if (blocked) throw new Error('Storage blocked'); return saved; } };
  const location = { pathname, search };
  vm.runInNewContext(source, { document, URLSearchParams, navigator: { languages, language: languages[0] || '' },
    window: { location, localStorage: storage, sessionStorage: storage } });
  return { document, nodes, location };
}

test('an explicit locale in the missing URL takes precedence over stored preferences', () => {
  const result = visit({ pathname: '/de/missing', saved: 'zh-Hans', languages: ['en-US'] });
  assert.equal(result.document.documentElement.lang, 'de');
  assert.equal(result.nodes['not-found-home'].attributes.href, '/de/');
  assert.equal(result.location.pathname, '/de/missing');
});

test('Traditional Chinese remains separate and explicit Simplified script wins over region', () => {
  for (const code of ['zh-TW', 'zh-Hant-HK', 'zh_HK']) {
    assert.equal(visit({ languages: [code] }).document.documentElement.lang, 'zh-Hant');
  }
  assert.equal(visit({ languages: ['zh-Hans-HK'] }).document.documentElement.lang, 'zh-Hans');
});

test('saved choice and manual English marker are respected', () => {
  assert.equal(visit({ saved: 'pt-PT', languages: ['de-DE'] }).document.documentElement.lang, 'pt-PT');
  const result = visit({ search: '?lang=en', saved: 'de' });
  assert.equal(result.document.documentElement.lang, 'en');
  assert.equal(result.nodes['not-found-home'].attributes.href, '/?lang=en');
});

test('blocked storage and unknown languages still produce a usable localized page', () => {
  const german = visit({ blocked: true, languages: ['pl-PL', 'de-AT'] });
  assert.equal(german.document.title, 'de title');
  assert.equal(german.nodes['not-found-heading'].textContent, 'de heading');
  assert.equal(german.nodes['not-found-languages'].attributes['aria-label'], 'de language');
  assert.equal(visit({ blocked: true, languages: ['pl-PL'] }).document.documentElement.lang, 'en');
});
