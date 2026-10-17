"""Check a translated long page (privacy policy, terms, support) against the English one.

    python i18n/check_doc.py privacy zh-Hans      (page name, then language code)

The pages live in i18n/docs/<page>.<code>.html: a JSON comment with the title and description,
then the page's sections. A translation must keep the English structure exactly.
Problems (exit 1): front matter that isn't JSON or has other keys; different tags, classes, ids
or numbers of headings, paragraphs, list items, table cells or bold passages; links that don't
match (site links must point to this language's pages when it has them); a number from the
English missing. A <span class="nw"> phrase wrapper may be added anywhere; aria-label and
data-label values are translated.
"""
import collections
import json
import pathlib
import re
import sys

I18N = pathlib.Path(__file__).resolve().parent
DOCS = I18N / 'docs'
LANGS = {lang['code']: lang for lang in json.loads((I18N / 'languages.json').read_text(encoding='utf-8'))}


def split(text, name):
    m = re.match(r'\s*<!--(.*?)-->\s*', text, re.S)
    if not m:
        raise SystemExit(f'{name}: should start with a <!-- {{"title": ..., "description": ...}} --> comment')
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise SystemExit(f'{name}: the comment at the top is not valid JSON: {e}')
    return meta, text[m.end():]


def tags(body):
    out = []
    for t in re.findall(r'<[^>]+>', body):
        if t.startswith('<a '):
            t = '<a>'
        t = re.sub(r'\b(aria-label|data-label)="[^"]*"', r'\1=""', t)   # labels are translated
        if t == '<span class="nw">':
            continue
        out.append(t)
    nw = body.count('<span class="nw">')
    closes = [t for t in out if t == '</span>']
    out = [t for t in out if t != '</span>'] + closes[:max(0, len(closes) - nw)]
    return collections.Counter(out)


def local_href(href, code):
    """Where an English site link should point on a page in this language."""
    if not href.startswith('/') or code == 'en':
        return href
    page = href.strip('/').split('/')[0].split('#')[0]
    prefix = LANGS[code]['path'].rstrip('/')
    if page and (DOCS / f'{page}.{code}.html').exists():
        return prefix + href
    if page == 'faq' and 'faq_page_title' in json.loads((I18N / 'strings' / f'{code}.json').read_text(encoding='utf-8')):
        return prefix + href
    return href


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    page, code = sys.argv[1], sys.argv[2]
    en_meta, en = split((DOCS / f'{page}.en.html').read_text(encoding='utf-8'), f'{page}.en.html')
    path = DOCS / f'{page}.{code}.html'
    if not path.exists():
        raise SystemExit(f'i18n/docs/{path.name} does not exist yet')
    tr_meta, tr = split(path.read_text(encoding='utf-8'), path.name)
    problems = []
    if sorted(en_meta) != sorted(tr_meta):
        problems.append(f'front matter keys {sorted(tr_meta)} should be {sorted(en_meta)}')
    for key, value in tr_meta.items():
        if not str(value).strip():
            problems.append(f'front matter "{key}" is empty')
    a, b = tags(en), tags(tr)
    for t in sorted(set(a) | set(b)):
        if a[t] != b[t]:
            problems.append(f'{t}: {a[t]} in English, {b[t]} here')
    en_ids, tr_ids = re.findall(r'\bid="([^"]+)"', en), re.findall(r'\bid="([^"]+)"', tr)
    if en_ids != tr_ids:
        problems.append(f'ids differ from English (keep them, in the same order): {en_ids} vs {tr_ids}')
    en_links = re.findall(r'<a [^>]*href="([^"]+)"', en)
    tr_links = re.findall(r'<a [^>]*href="([^"]+)"', tr)
    if len(en_links) != len(tr_links):
        problems.append(f'{len(tr_links)} links here, {len(en_links)} in English')
    else:
        for x, y in zip(en_links, tr_links):
            want = local_href(x, code)
            if x.startswith(('/', '#', 'mailto:')) and y != want:
                problems.append(f'link {y} should be {want}')
            elif x.startswith('http') and not y.startswith('http'):
                problems.append(f'link {y} should be a web address, like {x}')
    words = re.sub(r'<[^>]+>', ' ', tr)
    for n in sorted(set(re.findall(r'\d[\d,.]*\d|\d', re.sub(r'<[^>]+>', ' ', en)))):
        if n not in words and n.replace(',', '') not in words:
            problems.append(f'number {n} from English is missing')
    for p in problems:
        print('problem:', p)
    print(f'{page}.{code}: {len(problems)} problems')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
