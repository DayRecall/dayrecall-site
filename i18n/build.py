"""Build the home page in every language from i18n/template.html and i18n/strings/<code>.json.

    python i18n/build.py          write the pages, sitemap.xml and the share-image sources
    python i18n/build.py --og     also render assets/og-<slug>.png with headless Microsoft Edge
                                  (needs the local preview server on 127.0.0.1:8765)

A language is built when its strings file exists; languages.json lists them all, in menu order.
Edit the English text in strings/en.json and the markup in template.html, never the generated
index.html files. Each run ends with tools/stamp-assets.py, so the pages link current assets.
"""
import html
import json
import pathlib
import re
import subprocess
import tempfile
import sys

I18N = pathlib.Path(__file__).resolve().parent
ROOT = I18N.parent
SITE = 'https://dayrecall.com'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

LANGS = json.loads((I18N / 'languages.json').read_text(encoding='utf-8'))
for lang in LANGS:
    lang['slug'] = lang['path'].strip('/') or 'en'
    lang['file'] = I18N / 'strings' / (lang['code'] + '.json')
BUILT = [lang for lang in LANGS if lang['file'].exists()]


DECIMAL_COMMA = {'da', 'de', 'es', 'fr', 'it', 'nl', 'pt-PT', 'sv', 'tr'}
SPACE_BEFORE_PERCENT = {'da', 'de', 'es', 'fr', 'sv'}


def percent(code, number):
    """A percentage as the language writes it: 0.9% in English, 0,9 % in German, %0,9 in Turkish."""
    n = number.replace('.', ',') if code in DECIMAL_COMMA else number
    if code == 'tr':
        return '%' + n
    return n + ('&nbsp;%' if code in SPACE_BEFORE_PERCENT else '%')


def plain(s):
    return html.unescape(s).replace('\u00a0', ' ')


def script_json(data):
    return json.dumps(data, ensure_ascii=False).replace('</', '<\\/')


def head(lang, s):
    url = SITE + lang['path']
    lines = [
        '<!doctype html>',
        f'<html lang="{lang["code"]}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{s["title"]}</title>',
        f'<meta name="description" content="{s["description"]}">',
    ]
    if s.get('keywords'):
        lines.append(f'<meta name="keywords" content="{s["keywords"]}">')
    lines.append(f'<link rel="canonical" href="{url}">')
    lines += [f'<link rel="alternate" hreflang="{o["code"]}" href="{SITE}{o["path"]}">' for o in BUILT]
    lines += [
        f'<link rel="alternate" hreflang="x-default" href="{SITE}/">',
        '<meta name="theme-color" content="#0B0C0E">',
        '<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">',
        '<link rel="icon" href="/assets/icon-96.png" sizes="96x96" type="image/png">',
        '<link rel="apple-touch-icon" href="/assets/icon-1024.png">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="DayRecall">',
        f'<meta property="og:title" content="{s["og_title"]}">',
        f'<meta property="og:description" content="{s["og_description"]}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE}/assets/og-{lang["slug"]}.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{s["og_image_alt"]}">',
        f'<meta property="og:locale" content="{lang["og"]}">',
    ]
    lines += [f'<meta property="og:locale:alternate" content="{o["og"]}">' for o in BUILT if o is not lang]
    lines.append('<meta name="twitter:card" content="summary_large_image">')
    lines.append('<script type="application/ld+json">\n' + json.dumps(structured(lang, s), ensure_ascii=False, indent=2)
                 .replace('</', '<\\/') + '\n</script>')
    lines.append('<script type="application/json" id="stage-words">' + script_json(s['stage']) + '</script>')
    lines += [
        '<link rel="stylesheet" href="/assets/site.css">',
        '<script src="/assets/stages.js" defer></script>',
        '<script src="/assets/store.js" defer></script>',
        '</head>',
    ]
    return '\n'.join(lines)


def structured(lang, s):
    url = SITE + lang['path']
    return {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'DayRecall', 'url': SITE + '/',
         'logo': SITE + '/assets/icon-1024.png', 'email': 'support@dayrecall.com'},
        {'@type': 'WebSite', '@id': SITE + '/#website', 'name': 'DayRecall', 'url': SITE + '/',
         'inLanguage': [o['code'] for o in BUILT], 'publisher': {'@id': SITE + '/#org'}},
        {'@type': 'MobileApplication', '@id': SITE + '/#app', 'name': 'DayRecall',
         'description': plain(s['app_description']), 'url': url, 'image': SITE + '/assets/icon-1024.png',
         'operatingSystem': 'iOS 26, watchOS 26', 'applicationCategory': 'UtilitiesApplication',
         'featureList': [plain(f) for f in s['app_features']], 'publisher': {'@id': SITE + '/#org'}},
        {'@type': 'FAQPage', '@id': url + '#faq', 'inLanguage': lang['code'],
         'mainEntity': [{'@type': 'Question', 'name': plain(item['q']),
                         'acceptedAnswer': {'@type': 'Answer', 'text': plain(item['a'])}} for item in s['faq']]},
    ]}


def language_links(lang, indent):
    out = []
    for o in BUILT:
        current = ' aria-current="page"' if o is lang else ''
        out.append(f'{indent}<a href="{o["path"]}" hreflang="{o["code"]}" lang="{o["code"]}"{current}>{o["name"]}</a>')
    return out


def language_menu(lang, s):
    items = [f'        <li>{a.strip()}</li>' for a in language_links(lang, '')]
    return '\n'.join([
        '<details class="langmenu">',
        f'      <summary aria-label="{s["lang_label"]}"><span class="ico" data-icon="globe"></span>'
        f'<span>{lang["name"]}</span></summary>',
        '      <ul>',
        *items,
        '      </ul>',
        '    </details>',
    ])


def foot_links(lang, s):
    english = LANGS[0]
    privacy = lang.get('privacy') or english['privacy']
    support = lang.get('support') or english['support']
    fallback = '' if lang.get('privacy') else ' hreflang="en"'
    return '\n'.join([
        f'<nav class="foot-links" aria-label="{s["foot_label"]}">',
        f'      <a href="{privacy}"{fallback}>{s["foot_privacy"]}</a>',
        f'      <a href="{support}"{fallback}>{s["foot_support"]}</a>',
        '    </nav>',
        f'    <nav class="foot-langs" aria-label="{s["lang_label"]}">',
        *language_links(lang, '      '),
        '    </nav>',
    ])


def faq_section(s):
    items = []
    for i, item in enumerate(s['faq']):
        items.append(f'        <details{" open" if i == 0 else ""}>\n          <summary>{item["q"]}</summary>\n'
                     f'          <p>{item["a"]}</p>\n        </details>')
    return ('  <section class="faq" id="faq">\n    <div class="wrap">\n      <div class="faq-head">\n'
            f'        <p class="kicker">{s["faq_kicker"]}</p>\n        <h2>{s["faq_heading"]}</h2>\n      </div>\n'
            '      <div class="qa">\n' + '\n'.join(items) + '\n      </div>\n    </div>\n  </section>\n')


def page(lang, s, template):
    body = template
    for key, value in s.items():
        if isinstance(value, str):
            body = body.replace('{{' + key + '}}', value)
    body = (body.replace('{{@home}}', lang['path'])
                .replace('{{@home_url}}', SITE + lang['path'])
                .replace('{{@langmenu}}', language_menu(lang, s))
                .replace('{{@footlinks}}', foot_links(lang, s))
                .replace('{{@faq}}', faq_section(s)))
    body = re.sub(r'\{\{@pct:([0-9.]+)\}\}', lambda m: percent(lang['code'], m.group(1)), body)
    if '{{' in body:
        missing = sorted({body[i:body.index('}}', i) + 2] for i in range(len(body)) if body.startswith('{{', i)})
        raise SystemExit(f'{lang["code"]}: unfilled slots {missing}')
    return head(lang, s) + '\n' + body


def og_page(lang, s):
    size = 74 if len(plain(s['og_h1'])) <= 34 else 64 if len(plain(s['og_h1'])) <= 48 else 56
    return f'''<!doctype html>
<html lang="{lang["code"]}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>DayRecall share image</title>
<!-- Generated by i18n/build.py: the source of assets/og-{lang["slug"]}.png (open with ?still at 1200x630). -->
<link rel="stylesheet" href="/assets/site.css">
<script type="application/json" id="stage-words">{script_json(s["stage"])}</script>
<script src="/assets/stages.js" defer></script>
<style>
  html, body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0B0C0E; }}
  .og {{
    width: 1200px; height: 630px; box-sizing: border-box; padding: 60px 72px;
    display: grid; grid-template-columns: minmax(0, 1fr) 430px; gap: 56px; align-items: center;
    background: radial-gradient(760px 520px at 84% 46%, rgba(205, 240, 74, 0.15), transparent 62%), var(--night);
    color: var(--night-ink);
  }}
  .og .brand {{ display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; }}
  .og .brand img {{ width: 54px; height: 54px; }}
  .og h1 {{ font-size: {size}px; margin: 44px 0 24px; }}
  .og p {{ font-size: 25px; color: var(--night-ink2); margin: 0; }}
  .og .url {{ margin-top: 34px; font-size: 22px; color: var(--lime); font-weight: 650; }}
</style>
</head>
<body>
<div class="og">
  <div>
    <div class="brand"><img src="/assets/icon.svg" alt=""><span>DayRecall</span></div>
    <h1>{s["og_h1"]}</h1>
    <p>{s["og_sub"]}</p>
    <p class="url">dayrecall.com</p>
  </div>
  <div class="stage ask t-dark" data-stage="ask"></div>
</div>
</body>
</html>
'''


def sitemap():
    groups = [[(o['code'], o['path']) for o in BUILT]]
    groups += [[('en', '/privacy/'), ('zh-Hans', '/zh/privacy/')], [('en', '/support/'), ('zh-Hans', '/zh/support/')]]
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for group in groups:
        for _, path in group:
            out += ['  <url>', f'    <loc>{SITE}{path}</loc>']
            out += [f'    <xhtml:link rel="alternate" hreflang="{c}" href="{SITE}{p}"/>' for c, p in group]
            out += [f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{group[0][1]}"/>', '  </url>']
    out.append('</urlset>')
    return '\n'.join(out) + '\n'


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def main():
    template = (I18N / 'template.html').read_text(encoding='utf-8')
    for lang in BUILT:
        s = json.loads(lang['file'].read_text(encoding='utf-8'))
        write(ROOT / lang['path'].lstrip('/') / 'index.html', page(lang, s, template))
        write(ROOT / 'tools' / 'og' / f'{lang["slug"]}.html', og_page(lang, s))
        print('built', lang['code'], lang['path'])
    write(ROOT / 'sitemap.xml', sitemap())
    if '--og' in sys.argv[1:]:
        profile = pathlib.Path(tempfile.gettempdir()) / 'dayrecall-og-edge'   # browser data stays out of the site
        for lang in BUILT:
            png = ROOT / 'assets' / f'og-{lang["slug"]}.png'
            subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
                            f'--user-data-dir={profile}', '--window-size=1200,630', '--virtual-time-budget=5000',
                            f'--screenshot={png}', f'http://127.0.0.1:8765/tools/og/{lang["slug"]}.html?still'],
                           check=True, capture_output=True)
            print('cover', png.name)
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'stamp-assets.py')], check=True)


if __name__ == '__main__':
    main()
