"""What the other languages still need from the English, since their last batch translation.

    python i18n/pending.py          list string changes and pending document sections
    python i18n/pending.py --done   after a batch: record the current English as translated

Day-to-day changes touch English and Simplified Chinese; the other 12 languages
are translated in a later batch. pending-content.json explicitly records wording
that must use current English until its translations are reviewed. This also
covers legal and support documents, which are not part of strings/en.json.
batch-base/en.json is the English the last batch was translated from.
"""
import json
import pathlib
import shutil
import sys

I18N = pathlib.Path(__file__).resolve().parent
EN = I18N / 'strings' / 'en.json'
BASE = I18N / 'batch-base' / 'en.json'
CONTENT = I18N / 'pending-content.json'


def pending_content():
    return json.loads(CONTENT.read_text(encoding='utf-8')) if CONTENT.exists() else {}


def fallback_paths(code):
    pending = pending_content()
    return pending.get('strings', []) if code in pending.get('locales', []) else []


def document_locale(page, code):
    pending = pending_content()
    if code in pending.get('locales', []) and page in pending.get('documents', {}):
        return 'en'
    return code


def flat(value, prefix=''):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            out.update(flat(v, f'{prefix}.{k}' if prefix else k))
        return out
    if isinstance(value, list):
        out = {}
        for i, v in enumerate(value):
            out.update(flat(v, f'{prefix}[{i}]'))
        return out
    return {prefix: value}


def main():
    if '--done' in sys.argv[1:]:
        BASE.parent.mkdir(exist_ok=True)
        shutil.copyfile(EN, BASE)
        print('Recorded the current English as translated.')
        if CONTENT.exists():
            pending = pending_content()
            pending['locales'] = []
            CONTENT.write_text(json.dumps(pending, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print('Cleared the reviewed content fallback after the translation batch.')
        return
    now = flat(json.loads(EN.read_text(encoding='utf-8')))
    then = flat(json.loads(BASE.read_text(encoding='utf-8')))
    added = [k for k in now if k not in then]
    changed = [k for k in now if k in then and now[k] != then[k]]
    removed = [k for k in then if k not in now]
    for title, keys in (('added', added), ('changed', changed), ('removed', removed)):
        for k in keys:
            print(f'{title}: {k}')
    print(f'{len(added)} added, {len(changed)} changed, {len(removed)} removed since the last batch')
    pending = pending_content()
    locales = pending.get('locales', [])
    if locales:
        print('Pending content translations: ' + ', '.join(locales))
        for key in pending.get('strings', []):
            print('English fallback: ' + key)
        for page, sections in pending.get('documents', {}).items():
            print(f'Pending document: {page}: ' + ', '.join(sections))


if __name__ == '__main__':
    main()
