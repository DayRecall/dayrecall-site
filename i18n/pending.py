"""What the other languages still need from the English, since their last batch translation.

    python i18n/pending.py          list keys added, changed or removed in strings/en.json
    python i18n/pending.py --done   after a batch: record the current English as translated

Day-to-day changes touch only en.json and zh-Hans.json; the other 11 languages are translated in
one batch later. Until then build.py shows the English for any key a language doesn't have yet.
batch-base/en.json is the English the last batch was translated from.
"""
import json
import pathlib
import shutil
import sys

I18N = pathlib.Path(__file__).resolve().parent
EN = I18N / 'strings' / 'en.json'
BASE = I18N / 'batch-base' / 'en.json'


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


if __name__ == '__main__':
    main()
