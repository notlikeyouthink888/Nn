"""اختبارات حزمة ويندوز الخفيفة وأدوات سكربتاتها — python3 civil/tests_winpkg.py

· الحزمة windows/pkg/core.zip لازم تطابق ملفات المشروع الحالية (وإلا المستخدم ينزّل نسخة قديمة):
  إذا فشل هذا الاختبار شغّل  python3 civil/windows/build_pkg.py  ثم أعد الـcommit.
· ما يدخل الحزمة أي مخطط أو بيانات محلية، والـmanifest يطابقها بالحجم والبصمة.
· سكربتات الباتش: نهايات CRLF، بلا BOM، والأجزاء المشتركة موجودة.
· util.py: إيجاد خادم المنصة من netstat وإيقاف بايثونه فقط، والتقاط رابط النفق السريع.
"""
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
WIN = os.path.join(HERE, 'windows')
sys.path.insert(0, WIN)
import build_pkg  # noqa: E402
import util  # noqa: E402


class T(unittest.TestCase):
    def test_1_package_is_fresh(self):
        core = build_pkg.build_zip()
        with open(os.path.join(WIN, 'pkg', 'core.zip'), 'rb') as f:
            self.assertEqual(f.read(), core, 'core.zip قديمة — شغّل: python3 civil/windows/build_pkg.py')
        with open(os.path.join(WIN, 'pkg', 'manifest.txt'), 'rb') as f:
            self.assertEqual(f.read(), build_pkg.manifest(core), 'manifest.txt قديم — شغّل build_pkg.py')

    def test_2_manifest_matches_files(self):
        m = dict(l.split('=', 1) for l in open(os.path.join(WIN, 'pkg', 'manifest.txt')).read().split())
        core = open(os.path.join(WIN, 'pkg', 'core.zip'), 'rb').read()
        dwg = open(os.path.join(HERE, build_pkg.DWG), 'rb').read()
        self.assertEqual(m['core_sha256'], hashlib.sha256(core).hexdigest())
        self.assertEqual(int(m['core_size']), len(core))
        self.assertEqual(m['dwg_sha256'], hashlib.sha256(dwg).hexdigest())
        self.assertEqual(int(m['dwg_size']), len(dwg))
        self.assertLess(len(core), 2 * 1024 * 1024, 'الحزمة الخفيفة لازم تبقى خفيفة')

    def test_3_package_contents(self):
        z = zipfile.ZipFile(os.path.join(WIN, 'pkg', 'core.zip'))
        names = z.namelist()
        self.assertIsNone(z.testzip())
        self.assertTrue(all(n.startswith('civil/') for n in names))
        for must in ('civil/app.py', 'civil/ai.py', 'civil/ailocal.py', 'civil/static/index.html', 'civil/static/vendor/libredwg/wasm/libredwg-web.js',
                     'civil/windows/start_windows.bat', 'civil/windows/domain_windows.bat', 'civil/windows/install_windows.bat', 'civil/windows/util.py'):
            self.assertIn(must, names)
        for n in names:
            low = n.lower()
            self.assertFalse(low.endswith(('.dwg', '.dxf', '.sh', '.gz', '.zip', '.pyc')), n)
            self.assertFalse('/data/' in low or '/pkg/' in low or '/tests_' in low or '/__pycache__/' in low, n)
        tracked = set(subprocess.check_output(['git', 'ls-files', '--', '.'], cwd=HERE, text=True).split())
        self.assertTrue(all(n[len('civil/'):] in tracked for n in names), 'كل ملف بالحزمة لازم يكون متتبَّعاً بـ git')

    def test_4_batch_files(self):
        for name in ('install_windows.bat', 'domain_windows.bat', 'start_windows.bat'):
            b = open(os.path.join(WIN, name), 'rb').read()
            self.assertFalse(b.startswith(b'\xef\xbb\xbf'), name)
            self.assertEqual(len(re.findall(rb'(?<!\r)\n', b)), 0, name + ': لازم CRLF')
            t = b.decode('utf-8')
            self.assertIn('chcp 65001', t)
            labels = set(re.findall(r'^:(\w+)', t, re.M))
            for g in re.findall(r'(?:goto|call) :(\w+)', t):
                self.assertIn(g, labels, '%s: الوسم :%s غير موجود' % (name, g))
        inst = open(os.path.join(WIN, 'install_windows.bat'), encoding='utf-8').read()
        self.assertIn('/windows/pkg/manifest.txt', inst)
        self.assertIn('/windows/pkg/core.zip', inst)
        self.assertIn('/XD data', inst)
        for code in ('E1', 'E2', 'E3', 'E4'):
            self.assertIn('ECODE=' + code, inst)
        dom = open(os.path.join(WIN, 'domain_windows.bat'), encoding='utf-8').read()
        for sub in (':fetch', ':curlflags', ':box', ':findpy'):
            self.assertIn('\n' + sub + '\n', inst.replace('\r\n', '\n'))
            self.assertIn('\n' + sub + '\n', dom.replace('\r\n', '\n'))
        # CIVIL_MSG يمر لنافذة الرسالة ولا يُطبع بـ echo: ما لازم يحتوي رموزاً تكسر cmd
        for t in (inst, dom):
            for m in re.findall(r'set "CIVIL_MSG=([^\r\n]*)"', t):
                self.assertFalse(re.search(r'[|&<>^!"]', m), m)

    def test_5_listener_and_chain(self):
        sample = ('\n  Proto  Local Address          Foreign Address        State           PID\n'
                  '  TCP    0.0.0.0:58190          0.0.0.0:0              LISTENING       777\n'
                  '  TCP    127.0.0.1:5819         127.0.0.1:53211        ESTABLISHED     4321\n'
                  '  TCP    0.0.0.0:5819           0.0.0.0:0              LISTENING       9876\n'
                  '  TCP    [::]:135               [::]:0                 LISTENING       1136\n')
        self.assertEqual(util.listener_pid(5819, sample), 9876)
        self.assertIsNone(util.listener_pid(4444, sample))
        self.assertEqual(util.listener_pid(5819, '  TCP    [::]:5819    [::]:0    استماع    42'), 42, 'حالة مترجمة')
        t = {10: (1, 'cmd.exe'), 20: (10, 'py.exe'), 30: (20, 'python.exe'), 50: (1, 'node.exe'), 60: (50, 'pythonw.exe'), 70: (1, 'explorer.exe'), 80: (70, 'Python3.12.exe')}
        self.assertEqual(util.chain(30, t), [30, 20], 'بايثون ومشغّل py فقط — نافذة cmd ما تنلمس')
        self.assertEqual(util.chain(50, t), [], 'برنامج ثاني على نفس المنفذ ما ينلمس')
        self.assertEqual(util.chain(80, t), [80], 'ولا يصعد لـ explorer')
        self.assertEqual(util.chain(999, t), [])

    def test_6_quick_url(self):
        fn = tempfile.mktemp()
        with open(fn, 'w') as f:
            f.write('{"message":"Requesting new quick Tunnel on trycloudflare.com..."}\n')
        def later():
            with open(fn, 'a') as f:
                f.write('{"message":"|  https://abc-def-123.trycloudflare.com  |"}\n')
        threading.Timer(1.1, later).start()
        try:
            self.assertEqual(util.quickurl(fn, seconds=8, show=False), 'https://abc-def-123.trycloudflare.com')
            self.assertEqual(util.quickurl(fn + '.missing', seconds=1, show=False), '')
        finally:
            os.remove(fn)
        # عنوان خدمة cloudflare نفسه (يطلع برسائل الفشل) مو رابط نفق
        self.assertIsNone(util.URL_RX.search('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
