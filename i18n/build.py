"""Build the site in every language from i18n/.

    python i18n/build.py          write the pages, sitemap.xml and the share-image sources
    python i18n/build.py --og     also render assets/og-<slug>.png with headless Microsoft Edge
                                  (needs the local preview server on 127.0.0.1:8765)

A language is built when i18n/strings/<code>.json exists; languages.json lists them all, in menu
order. Each language gets:
- the home page, from template.html filled with its strings;
- the FAQ page (<lang>/faq/), from the "faq" groups in its strings, once it has "faq_page_title";
- the What's new page (<lang>/updates/), from updates.json (versions and dates, newest first) and the
  "updates" words in its strings, once it has "updates_page_title"; the home page links its newest entry;
- the long pages (<lang>/privacy/, terms/, support/), from docs/<page>.<code>.html, when that exists.
All pages share the header and footer written here. A link to a page that a language doesn't have
goes to the English page. A key missing from a language's strings shows the English text, and the
build says how many, so a day-to-day change can touch only en.json and zh-Hans.json; pending.py
lists what the next batch translation needs. Never edit the generated pages. Each run ends with
tools/stamp-assets.py, so the pages link current assets.
"""
import html
from copy import deepcopy
import json
import pathlib
import re
import subprocess
import tempfile
import sys
from pending import document_locale, fallback_paths

I18N = pathlib.Path(__file__).resolve().parent
ROOT = I18N.parent
DOCS = I18N / 'docs'
# Each entry: the versions it covers (oldest first), the day the newest came out and where (beta).
UPDATES = json.loads((I18N / 'updates.json').read_text(encoding='utf-8'))
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
PAGES = ['home', 'faq', 'updates'] + DOC_PAGES
SECTIONS = [('how', 'nav_03'), ('devices', 'nav_04'), ('battery', 'nav_05'), ('voices', 'nav_06'),
            ('languages', 'nav_07'), ('privacy', 'nav_08')]
FOOT = [('updates', 'foot_updates'), ('faq', 'foot_faq'), ('support', 'foot_support'), ('privacy', 'foot_privacy'),
        ('terms', 'foot_terms')]

# Our accounts, with each platform's own monochrome glyph (from Simple Icons 16.35.0, CC0), drawn in
# the text colour and never redrawn or boxed, as the platforms' brand guidelines ask.
SOCIAL = [
    ('TikTok', 'https://www.tiktok.com/@dayrecall',
     'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35'
     '-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21'
     '-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44'
     ' 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14'
     ' 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01'
     '-8.05.02-12.07z'),
    ('X', 'https://x.com/DayRecall',
     'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm'
     '-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z'),
    ('Instagram', 'https://www.instagram.com/dayrecall/',
     'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127'
     '-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061'
     ' 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961'
     ' 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633'
     '.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809'
     '.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72'
     '-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236'
     '-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96'
     '-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079'
     '-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184'
     '-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495'
     '.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056'
     '.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294'
     '-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072'
     '-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424'
     'M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771'
     '-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077'),
]

DECIMAL_COMMA = {'da', 'de', 'es', 'fr', 'it', 'nl', 'pt-PT', 'sv', 'tr'}
SPACE_BEFORE_PERCENT = {'da', 'de', 'es', 'fr', 'sv'}


def percent(code, number):
    """A percentage as the language writes it: 0.9% in English, 0,9 % in German, %0,9 in Turkish."""
    n = number.replace('.', ',') if code in DECIMAL_COMMA else number
    if code == 'tr':
        return '%' + n
    return n + ('&nbsp;%' if code in SPACE_BEFORE_PERCENT else '%')


MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']


def date_text(code, iso, year=True):
    """A day as the language writes it: October 22, 2026 or 2026年10月22日. A language without its own
    words for the What's new lines shows them in English, so it is given 'en' here too; when a batch
    translates What's new into another language, add that language's way of writing a date here."""
    y, m, d = (int(part) for part in iso.split('-'))
    if code in ('zh-Hans', 'zh-Hant', 'ja'):
        return (f'{y}年' if year else '') + f'{m}月{d}日'
    return f'{MONTHS[m - 1]} {d}, {y}' if year else f'{MONTHS[m - 1]} {d}'


def version_label(entry):
    """1.3.3, or 0.2.21–0.2.28 for an entry that covers several versions."""
    v = entry['versions']
    return v[0] if len(v) == 1 else f'{v[0]}–{v[-1]}'


def release_anchor(entry):
    return 'v' + entry['versions'][0].replace('.', '-')


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


def apply_content_fallback(english, merged, code, missing):
    """Replace only explicitly pending wording, including entries inside FAQ lists."""
    merged = deepcopy(merged)
    for path in fallback_paths(code):
        keys = re.findall(r'[^.\[\]]+', path)
        original, target = english, merged
        try:
            for key in keys[:-1]:
                original = original[int(key)] if isinstance(original, list) else original[key]
                target = target[int(key)] if isinstance(target, list) else target[key]
            last = int(keys[-1]) if isinstance(target, list) else keys[-1]
            source_key = int(keys[-1]) if isinstance(original, list) else keys[-1]
            target[last] = deepcopy(original[source_key])
        except (KeyError, IndexError, TypeError):
            # An older language may still have a flat FAQ or a shorter list.
            # Its complete English section is safer than retaining stale copy.
            merged[keys[0]] = deepcopy(english[keys[0]])
        if path not in missing:
            missing.append(path)
    return merged


def has(lang, page):
    if page == 'home':
        return True
    if page == 'faq':
        return 'faq_page_title' in lang['own']
    if page == 'updates':
        return 'updates_page_title' in lang['own']
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
        '<script src="/assets/locale.js"></script>',
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
        lines.append('<script src="/assets/features.js" defer></script>')
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
         'logo': SITE + '/assets/icon-1024.png', 'email': 'support@dayrecall.com',
         'sameAs': [link for _, link, _ in SOCIAL]},
        {'@type': 'WebSite', '@id': SITE + '/#website', 'name': 'DayRecall', 'url': SITE + '/',
         'inLanguage': [o['code'] for o in BUILT], 'publisher': {'@id': SITE + '/#org'}},
        {'@type': 'MobileApplication', '@id': SITE + '/#app', 'name': 'DayRecall',
         'description': plain(s['app_description']), 'url': SITE + lang['path'],
         'image': SITE + '/assets/icon-1024.png', 'operatingSystem': 'iOS 26, watchOS 26',
         'applicationCategory': 'UtilitiesApplication', 'featureList': [plain(f) for f in s['app_features']],
         'softwareVersion': UPDATES[0]['versions'][-1],
         'releaseNotes': SITE + url(lang if has(lang, 'updates') else EN, 'updates'),
         'publisher': {'@id': SITE + '/#org'}},
    ]
    if not has(lang, 'faq'):   # the questions are answered on the home page itself
        graph.append(faq_graph(lang, s, 'home'))
    return graph


def language_links(lang, page, indent):
    out = []
    for o in versions(page):
        current = ' aria-current="page"' if o is lang else ''
        # English shares the default URL, so mark an explicit English choice for browsers
        # that cannot save the preference before following the link.
        target = url(o, page) + ('?lang=en' if o is EN else '')
        out.append(f'{indent}<a href="{target}" hreflang="{o["code"]}" lang="{o["code"]}"{current}>{o["name"]}</a>')
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


def social_nav(s, indent):
    """Our accounts as icon links: in every footer, and wherever a long page writes {{@social}}."""
    links = [f'{indent}  <a href="{link}" rel="me" aria-label="{name}" title="{name}"><svg viewBox="0 0 24 24" '
             f'aria-hidden="true" focusable="false"><path d="{path}"/></svg></a>' for name, link, path in SOCIAL]
    return '\n'.join([f'<nav class="social" aria-label="{s["foot_social"]}">', *links, f'{indent}</nav>'])


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
        '    ' + social_nav(s, '    '),
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


def latest_link(lang, s):
    """Under the hero's buttons: the newest entry of What's new, with its day, so a visitor sees how recent it is."""
    entry = UPDATES[0]
    code = lang['code'] if 'updates_latest' in lang['own'] else 'en'
    text = (s['updates_latest'].replace('{date}', date_text(code, entry['date'], year=False))
            .replace('{title}', s['updates'][entry['id']]['title']))
    return (f'<a class="latest" {href(lang, "updates")}><span class="latest-ver">{version_label(entry)}</span>'
            f'<span class="latest-text">{text}</span><span class="arrow" aria-hidden="true">→</span></a>')


def home_page(lang, s, template):
    body = template
    for key, value in s.items():
        if isinstance(value, str):
            body = body.replace('{{' + key + '}}', value)
    body = (body.replace('{{@home}}', lang['path'])
                .replace('{{@home_url}}', SITE + lang['path'])
                .replace('{{@latest}}', latest_link(lang, s))
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


def updates_page(lang, s):
    """What's new: every entry of updates.json, newest first and open, the older ones folded to a line each."""
    code = lang['code']
    total = sum(len(entry['versions']) for entry in UPDATES)
    summary = s['updates_summary'].replace('{n}', str(total)).replace('{date}', date_text(code, UPDATES[-1]['date']))
    entries = []
    for i, entry in enumerate(UPDATES):
        words = s['updates'][entry['id']]
        items = '\n'.join(f'            <li>{item}</li>' for item in words['items'])
        entries.append(
            f'        <details id="{release_anchor(entry)}"{" open" if i == 0 else ""}>\n'
            '          <summary><span class="rel-head"><span class="rel-meta">'
            f'<time datetime="{entry["date"]}">{date_text(code, entry["date"])}</time>'
            f'<span class="rel-ver">{version_label(entry)}</span>'
            f'<span class="rel-tag">{s["updates_" + entry["channel"]]}</span></span>'
            f'<span class="rel-title">{words["title"]}</span></span></summary>\n'
            f'          <ul class="rel-items">\n{items}\n          </ul>\n'
            '        </details>')
    entries = '\n'.join(entries)
    main = f'''<main id="main">
  <section class="page-head">
    <div class="wrap">
      <p class="kicker">{s["updates_kicker"]}</p>
      <h1>{s["updates_heading"]}</h1>
      <p class="lead">{s["updates_lead"]}</p>
      <p class="meta">{summary}</p>
    </div>
  </section>

  <section class="doc releases-doc">
    <div class="wrap">
      <div class="qa releases">
{entries}
      </div>
    </div>
  </section>

  <section class="dark help-more">
    <div class="wrap">
      <div>
        <p class="kicker">{s["updates_kicker"]}</p>
        <h2>{s["foot_social"]}</h2>
        <p>{s["updates_follow_text"]}</p>
      </div>
      {social_nav(s, "      ")}
    </div>
  </section>
</main>'''
    return assemble(lang, s, 'updates', s['updates_page_title'], s['updates_page_description'], main)


def read_doc(page, code):
    text = (DOCS / f'{page}.{code}.html').read_text(encoding='utf-8')
    m = re.match(r'\s*<!--(.*?)-->\s*', text, re.S)
    if not m:
        raise SystemExit(f'docs/{page}.{code}.html: should start with a <!-- {{"title": ..., "description": ...}} --> comment')
    return json.loads(m.group(1)), text[m.end():]


def doc_page(lang, s, page):
    code = document_locale(page, lang['code'])
    meta, body = read_doc(page, code)
    body = re.sub(r'( *)\{\{@social\}\}', lambda m: m.group(1) + social_nav(s, m.group(1)), body)
    body_language = ' lang="en"' if code != lang['code'] else ''
    main = f'<main id="main"{body_language}>\n' + body.rstrip() + '\n</main>'
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
    if path.exists():
        existing = path.read_text(encoding='utf-8')
        # The final asset-stamping step refreshes these versions independently.
        unstamped = re.sub(r'(/assets/[\w.-]+\.(?:css|js))\?v=[0-9a-f]+(?=")', r'\1', existing)
        if existing == text or (path.suffix == '.html' and unstamped == text):
            return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def not_found_page():
    """One GitHub Pages error document, with the same locale sources as the site."""
    words = {lang['code']: {
        'path': lang['path'], 'title': lang['strings']['not_found_title'],
        'heading': lang['strings']['not_found_heading'],
        'home': lang['strings']['not_found_home'],
        'languageLabel': lang['strings']['lang_label']
    } for lang in BUILT}
    s = EN['strings']
    links = '\n'.join(
        f'      <a href="{lang["path"]}{"?lang=en" if lang is EN else ""}" '
        f'hreflang="{lang["code"]}" lang="{lang["code"]}">{html.escape(lang["name"])}</a>'
        for lang in BUILT)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(s['not_found_title'])}</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0B0C0E">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/icon-96.png" sizes="96x96" type="image/png">
<link rel="stylesheet" href="/assets/site.css">
<script type="application/json" id="not-found-words">{script_json(words)}</script>
<script src="/assets/locale.js"></script>
<script src="/assets/not-found.js" defer></script>
</head>
<body>
<main class="final missing">
  <div class="wrap">
    <img class="final-icon" src="/assets/icon.svg" alt="" width="96" height="96">
    <h1 id="not-found-heading">{html.escape(s['not_found_heading'])}</h1>
    <p class="links"><a class="pill" id="not-found-home" href="/?lang=en">{html.escape(s['not_found_home'])}</a></p>
    <nav class="foot-langs" id="not-found-languages" aria-label="{html.escape(s['lang_label'], quote=True)}">
{links}
    </nav>
  </div>
</main>
</body>
</html>
'''


def main():
    template = (I18N / 'template.html').read_text(encoding='utf-8')
    english = json.loads(EN['file'].read_text(encoding='utf-8'))
    for lang in BUILT:
        lang['own'] = json.loads(lang['file'].read_text(encoding='utf-8'))
        lang['missing'] = []
        lang['strings'] = apply_content_fallback(
            english, merge(english, lang['own'], '', lang['missing']), lang['code'], lang['missing'])
    for lang in BUILT:
        s = lang['strings']
        out = ROOT / lang['path'].lstrip('/')
        write(out / 'index.html', home_page(lang, s, template))
        built = ['home']
        for page in ['faq', 'updates'] + DOC_PAGES:
            if has(lang, page):
                text = (faq_page(lang, s) if page == 'faq' else updates_page(lang, s) if page == 'updates'
                        else doc_page(lang, s, page))
                write(out / page / 'index.html', text)
                built.append(page)
        write(ROOT / 'tools' / 'og' / f'{lang["slug"]}.html', og_page(lang, s))
        note = f'; {len(lang["missing"])} keys shown in English until the next batch' if lang['missing'] else ''
        print(f'built {lang["code"]}: {", ".join(built)}{note}')
    write(ROOT / '404.html', not_found_page())
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
