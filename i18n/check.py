"""Check a translated strings file against the English one.

    python i18n/check.py ja        (or any code in languages.json)

Problems (exit 1): different keys, list lengths or nesting from strings/en.json; empty values; tags
or classes different from the English value, in any order (a <span class="nw"> phrase wrapper or
<br> may be added); <span> pairs that differ from the English; a number from the English missing;
a lost {n} placeholder; animation language rows that don't start with this language.
Warnings (exit 0): a brand or product name from the English missing, and animation text much
longer than the English. A reviewer should look at each warning.
"""
import collections
import json
import pathlib
import re
import sys

I18N = pathlib.Path(__file__).resolve().parent
NAMES = ['DayRecall', 'Apple Watch', 'iPhone', 'App Store', 'Apple', 'AMI', 'DEMAND', 'Series 11', 'Pro Max', 'AI']
TAG = re.compile(r'<[^>]*>|<[^>]*$')


def tags(value):
    out = []
    for t in TAG.findall(value):
        t = re.sub(r'aria-label="[^"]*"?', 'aria-label=""', t)
        if t.startswith('<a ') and not re.search(r'href="#', t):
            t = re.sub(r'href="[^"]*"', 'href=""', t)   # a web link may point to the page in this language
        if t in ('<span class="nw">', '<br>'):
            continue
        out.append(t)
    nw = value.count('<span class="nw">')
    closes = [t for t in out if t == '</span>']
    out = [t for t in out if t != '</span>'] + closes[:max(0, len(closes) - nw)]
    return collections.Counter(out)


def compare(path, en, tr, problems, warnings, lang):
    if isinstance(en, dict):
        if not isinstance(tr, dict):
            problems.append(f'{path}: should be an object')
            return
        for k in en:
            if k not in tr:
                problems.append(f'{path}.{k}: missing')
            else:
                compare(f'{path}.{k}', en[k], tr[k], problems, warnings, lang)
        for k in tr:
            if k not in en:
                problems.append(f'{path}.{k}: not in en.json')
        return
    if isinstance(en, list):
        if not isinstance(tr, list) or len(tr) != len(en):
            problems.append(f'{path}: should be a list of {len(en)}')
            return
        for i, (a, b) in enumerate(zip(en, tr)):
            compare(f'{path}[{i}]', a, b, problems, warnings, lang)
        return
    if not isinstance(tr, str):
        problems.append(f'{path}: should be text')
        return
    if path.endswith('.keywords'):
        return
    if en.strip() and not tr.strip():
        problems.append(f'{path}: empty')
        return
    if tags(en) != tags(tr):
        problems.append(f'{path}: tags differ from English: {sorted(tags(en).elements())} vs {sorted(tags(tr).elements())}')
    if tr.count('<span') - tr.count('</span>') != en.count('<span') - en.count('</span>'):
        problems.append(f'{path}: <span> and </span> do not pair up the way they do in English')
    for n in re.findall(r'\d+', re.sub(r'<[^>]*>', '', en)):
        if n not in re.findall(r'\d+', tr):
            problems.append(f'{path}: number {n} from English is missing')
    for name in NAMES:
        if re.search(r'\b' + re.escape(name) + r'\b', en) and name not in tr:
            warnings.append(f'{path}: "{name}" is in the English but not here; keep it unless the sentence reads better without it')
    if '{n}' in en and '{n}' not in tr:
        problems.append(f'{path}: keep the {{n}} placeholder')
    # A <span class="nw"> phrase never breaks, so it must fit a 320-pixel phone: about 6 full-width
    # characters in the big headline, 8 on the share image, 10 in section headings, 16 in body text.
    headings = {'.how_02', '.devices_02', '.battery_02', '.voices_02', '.languages_02', '.features_02',
                '.privacy_02', '.faq_heading'}
    limit = 6 if path == '.hero_02' else 8 if path == '.og_h1' else 10 if path in headings else 16
    for phrase in re.findall(r'<span class="nw">(.*?)</span>', tr):
        text = re.sub(r'<[^>]*>|&nbsp;', ' ', phrase).strip()
        width = sum(0.55 if ord(ch) < 0x2E80 else 1 for ch in text)
        if width > limit + 0.5:
            problems.append(f'{path}: the phrase "{text}" is too wide for a phone screen; split it into shorter '
                            f'<span class="nw"> phrases of at most about {limit} full-width characters')
    if path.startswith('.stage') and len(tr) > 1.6 * len(en) + 6:
        warnings.append(f'{path}: much longer than English ({len(tr)} vs {len(en)} characters); it will be shrunk to fit')


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    lang = sys.argv[1]
    en = json.loads((I18N / 'strings' / 'en.json').read_text(encoding='utf-8'))
    try:
        tr = json.loads((I18N / 'strings' / f'{lang}.json').read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise SystemExit(f'i18n/strings/{lang}.json does not exist yet')
    except json.JSONDecodeError as e:
        raise SystemExit(f'i18n/strings/{lang}.json is not valid JSON: {e}')
    problems, warnings = [], []
    compare('', en, tr, problems, warnings, lang)
    rows = tr.get('stage', {}).get('languages', {}).get('rows', [])
    if rows and rows[0].get('lang') != lang:
        problems.append(f'.stage.languages.rows[0].lang: should be "{lang}", the page language')
    if rows and any('tr' in r for r in rows[:1]):
        problems.append('.stage.languages.rows[0]: the page language needs no "tr" translation')
    for w in warnings:
        print('warning:', w)
    for p in problems:
        print('problem:', p)
    print(f'{lang}: {len(problems)} problems, {len(warnings)} warnings')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
