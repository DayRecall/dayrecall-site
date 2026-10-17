"""Build the site in every language from i18n/.

    python i18n/build.py          write the pages, sitemap.xml and the share-image sources
    python i18n/build.py --og     also render assets/og-<slug>.png with headless Microsoft Edge
                                  (needs the local preview server on 127.0.0.1:8765)

A language is built when i18n/strings/<code>.json exists; languages.json lists them all, in menu
order. Each language gets:
- the home page, from template.html filled with its strings;
- the FAQ page (<lang>/faq/), from the "faq" groups in its strings, once it has "faq_page_title";
- the long pages (<lang>/privacy/, terms/, support/), from docs/<page>.<code>.html, when that exists.
All pages share the header and footer written here. A link to a page that a language doesn't have
goes to the English page. A key missing from a language's strings shows the English text, and the
build says how many, so a day-to-day change can touch only en.json and zh-Hans.json; pending.py
lists what the next batch translation needs. Never edit the generated pages. Each run ends with
tools/stamp-assets.py, so the pages link current assets.
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
DOCS = I18N / 'docs'
SITE = 'https://dayrecall.com'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

LANGS = json.loads((I18N / 'languages.json').read_text(encoding='utf-8'))
for lang in LANGS:
    lang['slug'] = lang['path'].strip('/') or 'en'
    lang['file'] = I18N / 'strings' / (lang['code'] + '.json')
BUILT = [lang for lang in LANGS if lang['file'].exists()]
EN = LANGS[0]
assert EN['code'] == 'en', 'languages.json must list English first'

DOC_PAGES = ['privacy', 'terms', 'support']
PAGES = ['home', 'faq'] + DOC_PAGES
SECTIONS = [('how', 'nav_03'), ('devices', 'nav_04'), ('battery', 'nav_05'), ('voices', 'nav_06'),
            ('languages', 'nav_07'), ('privacy', 'nav_08')]
FOOT = [('faq', 'foot_faq'), ('support', 'foot_support'), ('privacy', 'foot_privacy'), ('terms', 'foot_terms')]

DECIMAL_COMMA = {'da', 'de', 'es', 'fr', 'it', 'nl', 'pt-PT', 'sv', 'tr'}
SPACE_BEFORE_PERCENT = {'da', 'de', 'es', 'fr', 'sv'}


def percent(code, number):
    """A percentage as the language writes it: 0.9% in English, 0,9 % in German, %0,9 in Turkish."""
    n = number.replace('.', ',') if code in DECIMAL_COMMA else number
    if code == 'tr':
        return '%' + n
    return n + ('&nbsp;%' if code in SPACE_BEFORE_PERCENT else '%')


def plain(s):
    return html.unescape(re.sub(r'<[^>]*>', '', s)).replace('\u00a0', ' ')


def script_json(data):
    return json.dumps(data, ensure_ascii=False).replace('</', '<\\/')


def merge(english, own, path, missing):
    """The language's own strings, with the English for any key it doesn't have yet."""
    if not (isinstance(english, dict) and isinstance(own, dict)):
        return own
    out = {}
    for key, value in english.items():
        if key in own:
            out[key] = merge(value, own[key], f'{path}.{key}', missing)
        else:
            out[key] = value
            missing.append(f'{path}.{key}')
    return out


def has(lang, page):
    if page == 'home':
        return True
    if page == 'faq':
        return 'faq_page_title' in lang['own']
    return (DOCS / f'{page}.{lang["code"]}.html').exists()


def url(lang, page):
    return lang['path'] if page == 'home' else f'{lang["path"]}{page}/'


def href(lang, page):
    """A link from a page in this language: its own version of the page, or else the English one."""
    if has(lang, page):
        return f'href="{url(lang, page)}"'
    return f'href="{url(EN, page)}" hreflang="en"'


def versions(page):
    return [o for o in BUILT if has(o, page)]


def faq_groups(s):
    """The FAQ as groups of questions. A language not yet translated in groups has one flat list."""
    if s['faq'] and 'items' in s['faq'][0]:
        groups = s['faq']
    else:
        groups = [{'title': s['faq_heading'], 'items': s['faq']}]
    english = EN['strings']['faq']
    for i, group in enumerate(groups):
        title = english[i]['title'] if i < len(english) and 'title' in english[i] else group['title']
        group['id'] = re.sub(r'[^a-z0-9]+', '-', plain(title).lower()).strip('-')
    return groups


def head(lang, s, page, title, description, graph=None):
    page_url = SITE + url(lang, page)
    home = page == 'home'
    lines = [
        '<!doctype html>',
        f'<html lang="{lang["code"]}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{title}</title>',
        f'<meta name="description" content="{description}">',
    ]
    if home and s.get('keywords'):
        lines.append(f'<meta name="keywords" content="{s["keywords"]}">')
    lines.append(f'<link rel="canonical" href="{page_url}">')
    lines += [f'<link rel="alternate" hreflang="{o["code"]}" href="{SITE}{url(o, page)}">' for o in versions(page)]
    lines += [
        f'<link rel="alternate" hreflang="x-default" href="{SITE}{url(EN, page)}">',
        '<meta name="theme-color" content="#0B0C0E">',
        '<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">',
        '<link rel="icon" href="/assets/icon-96.png" sizes="96x96" type="image/png">',
        '<link rel="apple-touch-icon" href="/assets/icon-1024.png">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="DayRecall">',
        f'<meta property="og:title" content="{s["og_title"] if home else title}">',
        f'<meta property="og:description" content="{s["og_description"] if home else description}">',
        f'<meta property="og:url" content="{page_url}">',
        f'<meta property="og:image" content="{SITE}/assets/og-{lang["slug"]}.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{s["og_image_alt"]}">',
        f'<meta property="og:locale" content="{lang["og"]}">',
    ]
    lines += [f'<meta property="og:locale:alternate" content="{o["og"]}">' for o in versions(page) if o is not lang]
    lines.append('<meta name="twitter:card" content="summary_large_image">')
    if graph:
        lines.append('<script type="application/ld+json">\n' + json.dumps(
            {'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, indent=2)
            .replace('</', '<\\/') + '\n</script>')
    if home:
        lines.append('<script type="application/json" id="stage-words">' + script_json(s['stage']) + '</script>')
    lines += ['<link rel="stylesheet" href="/assets/site.css">', '<script src="/assets/stages.js" defer></script>']
    if home:
        lines.append('<script src="/assets/store.js" defer></script>')
    lines.append('</head>')
    return '\n'.join(lines)


def faq_graph(lang, s, page):
    return {'@type': 'FAQPage', '@id': SITE + url(lang, page) + '#faq', 'inLanguage': lang['code'],
            'mainEntity': [{'@type': 'Question', 'name': plain(item['q']),
                            'acceptedAnswer': {'@type': 'Answer', 'text': plain(item['a'])}}
                           for group in faq_groups(s) for item in group['items']]}


def home_graph(lang, s):
    graph = [
        {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'DayRecall', 'url': SITE + '/',
         'logo': SITE + '/assets/icon-1024.png', 'email': 'support@dayrecall.com'},
        {'@type': 'WebSite', '@id': SITE + '/#website', 'name': 'DayRecall', 'url': SITE + '/',
         'inLanguage': [o['code'] for o in BUILT], 'publisher': {'@id': SITE + '/#org'}},
        {'@type': 'MobileApplication', '@id': SITE + '/#app', 'name': 'DayRecall',
         'description': plain(s['app_description']), 'url': SITE + lang['path'],
         'image': SITE + '/assets/icon-1024.png', 'operatingSystem': 'iOS 26, watchOS 26',
         'applicationCategory': 'UtilitiesApplication', 'featureList': [plain(f) for f in s['app_features']],
         'publisher': {'@id': SITE + '/#org'}},
    ]
    if not has(lang, 'faq'):   # the questions are answered on the home page itself
        graph.append(faq_graph(lang, s, 'home'))
    return graph


def language_links(lang, page, indent):
    out = []
    for o in versions(page):
        current = ' aria-current="page"' if o is lang else ''
        out.append(f'{indent}<a href="{url(o, page)}" hreflang="{o["code"]}" lang="{o["code"]}"{current}>{o["name"]}</a>')
    return out


def language_menu(lang, s, page):
    items = [f'        <li>{a.strip()}</li>' for a in language_links(lang, page, '')]
    return '\n'.join([
        '<details class="langmenu">',
        f'      <summary aria-label="{s["lang_label"]}"><span class="ico" data-icon="globe"></span>'
        f'<span>{lang["name"]}</span></summary>',
        '      <ul>',
        *items,
        '      </ul>',
        '    </details>',
    ])


def header(lang, s, page):
    home = '' if page == 'home' else lang['path']
    links = [f'      <a href="{home}#{anchor}">{s[key]}</a>' for anchor, key in SECTIONS]
    current = ' aria-current="page"' if page == 'faq' else ''
    links.append(f'      <a {href(lang, "faq")}{current}>{s["nav_09"]}</a>')
    return '\n'.join([
        f'<a class="skip" href="#main">{s["top_01"]}</a>',
        '',
        '<header class="nav">',
        '  <div class="wrap">',
        f'    <a class="brand" href="{lang["path"]}" aria-label="{s["nav_01"]}"><img src="/assets/icon.svg" alt="" '
        'width="30" height="30"><span>DayRecall</span></a>',
        f'    <nav class="nav-links" aria-label="{s["nav_02"]}">',
        *links,
        '    </nav>',
        '    ' + language_menu(lang, s, page),
        '  </div>',
        '</header>',
    ])


def footer(lang, s, page):
    current = {page: ' aria-current="page"'}
    links = [f'      <a {href(lang, p)}{current.get(p, "")}>{s[key]}</a>' for p, key in FOOT]
    return '\n'.join([
        '<footer class="foot">',
        '  <div class="wrap">',
        '    <span>© 2026 DayRecall</span>',
        f'    <span class="tm">{s["foot_01"]}</span>',
        f'    <nav class="foot-links" aria-label="{s["foot_label"]}">',
        *links,
        '    </nav>',
        f'    <nav class="foot-langs" aria-label="{s["lang_label"]}">',
        *language_links(lang, page, '      '),
        '    </nav>',
        '  </div>',
        '</footer>',
    ])


def assemble(lang, s, page, title, description, main, graph=None):
    return '\n'.join([head(lang, s, page, title, description, graph), '<body>', header(lang, s, page), '',
                      main.strip('\n'), '', footer(lang, s, page), '</body>', '</html>', ''])


def questions(items, indent, first_open=False):
    out = []
    for i, item in enumerate(items):
        out.append(f'{indent}<details{" open" if first_open and i == 0 else ""}>\n{indent}  <summary>{item["q"]}</summary>\n'
                   f'{indent}  <p>{item["a"]}</p>\n{indent}</details>')
    return '\n'.join(out)


def faq_section(lang, s):
    """The home page's questions: the first group, or every question if the language has no FAQ page yet."""
    groups = faq_groups(s)
    items = groups[0]['items'] if has(lang, 'faq') else [i for g in groups for i in g['items']]
    return ('  <section class="faq" id="faq">\n    <div class="wrap">\n      <div class="faq-head">\n'
            f'        <p class="kicker">{s["faq_kicker"]}</p>\n        <h2>{s["faq_heading"]}</h2>\n'
            f'        <p class="faq-all"><a {href(lang, "faq")}>{s["faq_all"]}<span class="arrow" aria-hidden="true">→</span></a></p>\n'
            '      </div>\n      <div class="qa">\n' + questions(items, '        ', True) + '\n      </div>\n    </div>\n  </section>\n')


def home_page(lang, s, template):
    body = template
    for key, value in s.items():
        if isinstance(value, str):
            body = body.replace('{{' + key + '}}', value)
    body = (body.replace('{{@home}}', lang['path'])
                .replace('{{@home_url}}', SITE + lang['path'])
                .replace('{{@faq}}', faq_section(lang, s)))
    body = re.sub(r'\{\{@pct:([0-9.]+)\}\}', lambda m: percent(lang['code'], m.group(1)), body)
    if '{{' in body:
        missing = sorted({body[i:body.index('}}', i) + 2] for i in range(len(body)) if body.startswith('{{', i)})
        raise SystemExit(f'{lang["code"]}: unfilled slots {missing}')
    return assemble(lang, s, 'home', s['title'], s['description'], body, home_graph(lang, s))


def faq_page(lang, s):
    groups = faq_groups(s)
    toc = '\n'.join(f'          <li><a href="#{g["id"]}">{g["title"]}</a></li>' for g in groups)
    sections = '\n'.join(f'        <div class="faq-group" id="{g["id"]}">\n          <h2>{g["title"]}</h2>\n'
                         f'          <div class="qa">\n{questions(g["items"], "            ")}\n          </div>\n'
                         '        </div>' for g in groups)
    main = f'''<main id="main">
  <section class="page-head">
    <div class="wrap">
      <p class="kicker">{s["faq_kicker"]}</p>
      <h1>{s["faq_heading"]}</h1>
      <p class="lead">{s["faq_page_lead"]}</p>
    </div>
  </section>

  <section class="doc">
    <div class="wrap">
      <nav class="toc" aria-label="{s["faq_page_toc"]}">
        <p>{s["faq_page_toc"]}</p>
        <ol>
{toc}
        </ol>
      </nav>
      <div class="faq-groups">
{sections}
      </div>
    </div>
  </section>

  <section class="dark help-more">
    <div class="wrap">
      <div>
        <p class="kicker">{s["foot_support"]}</p>
        <h2>{s["faq_page_more"]}</h2>
        <p>{s["faq_page_more_text"]}</p>
      </div>
      <a class="help-pill" href="mailto:support@dayrecall.com"><span class="dot"></span>support@dayrecall.com</a>
    </div>
  </section>
</main>'''
    return assemble(lang, s, 'faq', s['faq_page_title'], s['faq_page_description'], main, [faq_graph(lang, s, 'faq')])


def read_doc(page, code):
    text = (DOCS / f'{page}.{code}.html').read_text(encoding='utf-8')
    m = re.match(r'\s*<!--(.*?)-->\s*', text, re.S)
    if not m:
        raise SystemExit(f'docs/{page}.{code}.html: should start with a <!-- {{"title": ..., "description": ...}} --> comment')
    return json.loads(m.group(1)), text[m.end():]


def doc_page(lang, s, page):
    meta, body = read_doc(page, lang['code'])
    main = '<main id="main">\n' + body.rstrip() + '\n</main>'
    return assemble(lang, s, page, meta['title'], meta['description'], main)


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
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page in PAGES:
        group = versions(page)
        for o in group:
            out += ['  <url>', f'    <loc>{SITE}{url(o, page)}</loc>']
            out += [f'    <xhtml:link rel="alternate" hreflang="{a["code"]}" href="{SITE}{url(a, page)}"/>' for a in group]
            out += [f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{url(EN, page)}"/>', '  </url>']
    out.append('</urlset>')
    return '\n'.join(out) + '\n'


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def main():
    template = (I18N / 'template.html').read_text(encoding='utf-8')
    english = json.loads(EN['file'].read_text(encoding='utf-8'))
    for lang in BUILT:
        lang['own'] = json.loads(lang['file'].read_text(encoding='utf-8'))
        lang['missing'] = []
        lang['strings'] = merge(english, lang['own'], '', lang['missing'])
    for lang in BUILT:
        s = lang['strings']
        out = ROOT / lang['path'].lstrip('/')
        write(out / 'index.html', home_page(lang, s, template))
        built = ['home']
        for page in ['faq'] + DOC_PAGES:
            if has(lang, page):
                write(out / page / 'index.html', faq_page(lang, s) if page == 'faq' else doc_page(lang, s, page))
                built.append(page)
        write(ROOT / 'tools' / 'og' / f'{lang["slug"]}.html', og_page(lang, s))
        note = f'; {len(lang["missing"])} keys shown in English until the next batch' if lang['missing'] else ''
        print(f'built {lang["code"]}: {", ".join(built)}{note}')
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
