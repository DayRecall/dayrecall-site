"""Give every page's stylesheet and script links a version taken from the file's content.

    python tools/stamp-assets.py          rewrite ?v= in every page from the files on disk
    python tools/stamp-assets.py --check  exit 1 if a staged page points at an old version

GitHub Pages lets browsers keep a file for 10 minutes, so a page that changed together with
its styles can otherwise arrive with the old styles. The version is the first 8 hex digits of
the file's SHA-1 (line endings as Git stores them), so it changes exactly when the file does.
The pre-commit hook runs --check; after changing a stylesheet or script, run this script and
stage the pages it lists.
"""
import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINK = re.compile(r'(/assets/[\w.-]+\.(?:css|js))(\?v=[0-9a-f]*)?(?=")')


def version(data):
    return '?v=' + hashlib.sha1(data.replace(b'\r\n', b'\n')).hexdigest()[:8]


def stamp():
    changed = []
    for page in sorted(ROOT.rglob('*.html')):
        if '.git' in page.parts:
            continue
        text = page.read_text(encoding='utf-8')

        def sub(m):
            asset = ROOT / m.group(1).lstrip('/')
            return m.group(1) + version(asset.read_bytes()) if asset.exists() else m.group(0)

        new = LINK.sub(sub, text)
        if new != text:
            with open(page, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new)
            changed.append(page.relative_to(ROOT).as_posix())
    print('\n'.join(changed) if changed else 'All pages are up to date.')


def staged(path):
    return subprocess.run(['git', 'show', ':' + path], cwd=ROOT, capture_output=True).stdout


def check():
    files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    stale = []
    for page in (f for f in files if f.endswith('.html')):
        for m in LINK.finditer(staged(page).decode('utf-8')):
            if m.group(2) != version(staged(m.group(1).lstrip('/'))):
                stale.append(page + ': ' + m.group(1))
    if stale:
        print('These pages point at an old version of a stylesheet or script:')
        print('\n'.join('  ' + s for s in stale))
        print('Run `python tools/stamp-assets.py`, stage the pages it lists, and commit again.')
        sys.exit(1)


if __name__ == '__main__':
    check() if '--check' in sys.argv[1:] else stamp()
