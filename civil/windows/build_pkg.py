"""يبني حزمة ويندوز الخفيفة اللي ينزّلها install_windows.bat:

    civil/windows/pkg/core.zip       ملفات المنصة (بلا محرّك DWG الثقيل ولا ملفات لينكس ولا الاختبارات)
    civil/windows/pkg/manifest.txt   SHA-256 والحجم للحزمة ولمحرّك DWG

ليش: أرشيف GitHub الكامل ~6 ميغا ويُولَّد لحظياً فما يدعم إكمال التحميل المقطوع، وعلى خط ضعيف
يبدي من الصفر كل مرة. هذي الحزمة ~1.2 ميغا، تنخدم من raw.githubusercontent.com (CDN يدعم Range)،
والمثبّت يكمّلها من مكان ما وقف ويتأكد منها بـ SHA-256.

    python3 civil/windows/build_pkg.py           يبني (شغّله بعد أي تعديل على ملفات civil/ وقبل الـcommit)
    python3 civil/windows/build_pkg.py --check   يتأكد إن الحزمة مطابقة للملفات الحالية (رمز خروج 1 إذا قديمة)

· الملفات المتتبَّعة بـ git فقط، وبامتدادات معروفة — فما يدخل الحزمة أي ملف محلي (مثل مخططات DWG).
· الناتج ثابت: نفس الملفات ← نفس البايتات (ترتيب وتواريخ ثابتة)، فما يتغيّر بلا سبب.
"""
import hashlib
import io
import os
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CIVIL = os.path.dirname(HERE)
PKG = os.path.join(HERE, 'pkg')
DWG = 'static/vendor/libredwg/wasm/libredwg-web.wasm.gz'
SKIP = {'install.sh', 'deploy.sh', 'build_installer.sh', 'civil5819.service', 'windows/.gitattributes',
        'windows/build_pkg.py', DWG}
EXT_OK = {'.py', '.js', '.css', '.html', '.md', '.bat', '.json', '.txt', '.svg', '.png', '.ico', '.woff2'}
NAME_OK = {'LICENSE'}


def files():
    out = subprocess.check_output(['git', 'ls-files', '-z', '--', '.'], cwd=CIVIL).decode('utf-8').split('\0')
    keep = []
    for f in sorted(x for x in out if x):
        base = os.path.basename(f)
        if f in SKIP or f.startswith('windows/pkg/') or base.startswith('tests_'):
            continue
        if os.path.splitext(base)[1].lower() not in EXT_OK and base not in NAME_OK:
            raise SystemExit('ملف بامتداد غير متوقع — أضفه لـ EXT_OK أو SKIP عن قصد: ' + f)
        keep.append(f)
    return keep


def build_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files():
            zi = zipfile.ZipInfo('civil/' + f, date_time=(2020, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.create_system = 3
            zi.external_attr = 0o644 << 16
            with open(os.path.join(CIVIL, f), 'rb') as fh:
                z.writestr(zi, fh.read(), compresslevel=9)
    return buf.getvalue()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def manifest(core):
    with open(os.path.join(CIVIL, DWG), 'rb') as fh:
        dwg = fh.read()
    return ('core_sha256=%s\ncore_size=%d\ndwg_sha256=%s\ndwg_size=%d\n' % (sha(core), len(core), sha(dwg), len(dwg))).encode('ascii')


def main():
    core = build_zip()
    man = manifest(core)
    zp, mp = os.path.join(PKG, 'core.zip'), os.path.join(PKG, 'manifest.txt')
    if '--check' in sys.argv:
        try:
            ok = open(zp, 'rb').read() == core and open(mp, 'rb').read() == man
        except OSError:
            ok = False
        print('pkg: %s' % ('مطابقة' if ok else 'قديمة — شغّل: python3 civil/windows/build_pkg.py'))
        return 0 if ok else 1
    os.makedirs(PKG, exist_ok=True)
    for path, data in ((zp, core), (mp, man)):
        try:
            same = open(path, 'rb').read() == data
        except OSError:
            same = False
        if not same:
            with open(path, 'wb') as fh:
                fh.write(data)
    print('core.zip: %d ملف · %d بايت (%.2f ميغا) · sha256 %s…' % (len(files()), len(core), len(core) / 1048576, sha(core)[:12]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
