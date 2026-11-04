"""اختبارات المساعد الذكي — python3 civil/tests_ai.py

تشغّل خادم المنصة الحقيقي على منفذ عشوائي، ومعه «محاكي» محلي بنفس واجهة OpenRouter
(/models و /key و /credits و /chat/completions بالتدفّق SSE واستدعاء الأدوات مقسّماً).
المحاكي أداة اختبار فقط — ما فيه ذكاء؛ يفحص المسار: الصلاحيات، حماية المفتاح، الحدود،
البحث بالمراجع، تنفيذ أدوات المنصة، والتدفّق للمتصفح. لا يحتاج إنترنت ولا مفتاحاً حقيقياً.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
GOOD = 'sk-or-v1-' + 'a' * 64
SEEN = []                                    # الطلبات اللي وصلت المحاكي (لفحص ما يُرسل للنموذج)


def _sse(h, chunks):
    h.send_response(200)
    h.send_header('Content-Type', 'text/event-stream')
    h.end_headers()
    for c in chunks:
        h.wfile.write((': OPENROUTER PROCESSING\n\n' if c is None else 'data: ' + json.dumps(c, ensure_ascii=False) + '\n\n').encode('utf-8'))
        h.wfile.flush()
    h.wfile.write(b'data: [DONE]\n\n')


class Upstream(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _auth(self):
        return self.headers.get('Authorization') == 'Bearer ' + GOOD or (self.headers.get('Authorization') or '').endswith('b' * 64)

    def _j(self, code, obj):
        b = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == '/models':
            return self._j(200, dict(data=[
                dict(id='test/tools-model', name='Test · tools', context_length=128000, pricing=dict(prompt='0.000001', completion='0.000002'),
                     supported_parameters=['tools', 'temperature']),
                dict(id='test/notools', name='Test · no tools', context_length=32000, pricing=dict(prompt='0', completion='0'),
                     supported_parameters=['temperature'])]))
        if not self._auth():
            return self._j(401, dict(error=dict(message='No auth credentials found', code=401)))
        if self.path == '/key':
            return self._j(200, dict(data=dict(label='test', usage=0.25, limit=None, limit_remaining=None, is_free_tier=False)))
        if self.path == '/credits':
            return self._j(200, dict(data=dict(total_credits=10, total_usage=0.25)))
        self._j(404, dict(error=dict(message='nf')))

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}')
        SEEN.append(dict(headers=dict(self.headers), body=body))
        if not self._auth():
            return self._j(401, dict(error=dict(message='User not found.', code=401)))
        if body.get('model') == 'test/notools' and body.get('tools'):
            return self._j(404, dict(error=dict(message='No endpoints found that support tool use.', code=404)))
        msgs = body.get('messages') or []
        tool_msgs = [m for m in msgs if m.get('role') == 'tool']
        last = next((m['content'] for m in reversed(msgs) if m.get('role') == 'user'), '')
        model = body.get('model')
        if body.get('tools') and not tool_msgs and 'طول' in last:
            args = json.dumps(dict(db=25, fc=28, top=True))
            return _sse(self, [None,
                               dict(model=model, choices=[dict(index=0, delta=dict(role='assistant', content='خلّي أحسبها بحاسبة المنصة… '))]),
                               dict(model=model, choices=[dict(index=0, delta=dict(tool_calls=[dict(index=0, id='call_1', type='function',
                                                                                                    function=dict(name='development_length', arguments=args[:9]))]))]),
                               dict(model=model, choices=[dict(index=0, delta=dict(tool_calls=[dict(index=0, function=dict(arguments=args[9:]))]))]),
                               dict(model=model, choices=[dict(index=0, delta={}, finish_reason='tool_calls')],
                                    usage=dict(prompt_tokens=900, completion_tokens=40, total_tokens=940, cost=0.001))])
        if tool_msgs:
            res = json.loads(tool_msgs[-1]['content'])
            txt = '[محاكي اختبار] حسب أداة المنصة: ld = %s مم و ldh = %s مم (ACI 318-19 §25.4.2.4).' % (res.get('ld_mm'), res.get('ldh_mm'))
        else:
            txt = '[محاكي اختبار] وصلني سؤالك: ' + last[:60]
        parts = [txt[i:i + 12] for i in range(0, len(txt), 12)]
        return _sse(self, [dict(model=model, choices=[dict(index=0, delta=dict(content=p))]) for p in parts] +
                    [dict(model=model, choices=[dict(index=0, delta={}, finish_reason='stop')],
                          usage=dict(prompt_tokens=1200, completion_tokens=60, total_tokens=1260, cost=0.002))])


def _serve(handler):
    s = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='civil_ai_')
        cls.up = _serve(Upstream)
        os.environ['OPENROUTER_BASE'] = 'http://127.0.0.1:%d' % cls.up.server_address[1]
        os.environ['CIVIL_DATA'] = cls.tmp
        import app
        cls.srv = _serve(app.H)
        cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.up.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def req(self, path, body=None, headers=None, raw=False):
        h = {'Host': 'localhost'}
        if body is not None:
            h['Content-Type'] = 'application/json'
        h.update(headers or {})
        r = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode('utf-8'), headers=h,
                                   method='GET' if body is None else 'POST')
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                data = resp.read().decode('utf-8')
                return resp.status, (data if raw else json.loads(data))
        except urllib.error.HTTPError as e:
            data = e.read().decode('utf-8')
            return e.code, (data if raw else json.loads(data or '{}'))

    def events(self, body, headers=None):
        code, txt = self.req('/api/ai/chat', body, headers, raw=True)
        if code != 200:
            return code, json.loads(txt)
        return code, [json.loads(l[5:]) for l in txt.splitlines() if l.startswith('data:')]

    REMOTE = {'Host': 'ourchess.site', 'CF-Connecting-IP': '203.0.113.7', 'CF-Ray': 'x1'}

    def test_1_local_is_admin_and_key_is_masked(self):
        c, v = self.req('/api/ai/config')
        self.assertEqual(c, 200)
        self.assertTrue(v['is_admin'] and v['is_local'])
        c, r = self.req('/api/ai/config', dict(key=GOOD, model='test/tools-model'))
        self.assertEqual(c, 200, r)
        c, v = self.req('/api/ai/config')
        self.assertTrue(v['has_key'])
        self.assertNotIn(GOOD, json.dumps(v))
        self.assertTrue(v['key_hint'].startswith('sk-or-') and v['key_hint'].endswith('aaaa'))
        with open(os.path.join(self.tmp, 'ai.json'), encoding='utf-8') as f:
            self.assertEqual(json.load(f)['key'], GOOD)
        if os.name == 'posix':
            self.assertEqual(os.stat(os.path.join(self.tmp, 'ai.json')).st_mode & 0o777, 0o600)

    def test_2_remote_cannot_manage_and_csrf_blocked(self):
        c, v = self.req('/api/ai/config', headers=self.REMOTE)
        self.assertFalse(v['is_admin'])
        c, r = self.req('/api/ai/config', dict(key=''), headers=self.REMOTE)
        self.assertEqual(c, 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Origin': 'http://evil.example'})
        self.assertEqual(c, 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(c, 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Content-Type': 'text/plain'})
        self.assertEqual(c, 415)
        # عنوان loopback لكن مضيف غريب (DNS rebinding) ← ليس مشرفاً
        c, v = self.req('/api/ai/config', headers={'Host': 'attacker.example'})
        self.assertFalse(v['is_admin'])

    def test_3_models_and_key_test(self):
        self.req('/api/ai/config', dict(key=GOOD))
        c, m = self.req('/api/ai/models')
        self.assertEqual(c, 200)
        ids = {x['id']: x for x in m['models']}
        self.assertTrue(ids['test/tools-model']['tools'] and not ids['test/notools']['tools'])
        self.assertTrue(ids['test/notools']['free'])
        self.assertAlmostEqual(ids['test/tools-model']['pin'], 1.0)
        c, k = self.req('/api/ai/test', {})
        self.assertTrue(k['ok'], k)
        self.assertEqual(k['credits']['left'], 9.75)
        c, k = self.req('/api/ai/test', dict(key='sk-or-v1-' + 'z' * 64))
        self.assertFalse(k['ok'])
        self.assertIn('المفتاح', k['error'])

    def test_4_chat_runs_platform_tool_and_streams(self):
        import engine as E
        self.req('/api/ai/config', dict(key=GOOD, model='test/tools-model'))
        ctx = dict(page=dict(id='wizard', name='معالج المشروع'), project=dict(fc=28, fy=420))
        c, ev = self.events(dict(messages=[dict(role='user', content='شكد طول التماسك لشيش 25 علوي؟')], context=ctx))
        self.assertEqual(c, 200, ev)
        kinds = [e['t'] for e in ev]
        self.assertEqual(kinds[0], 'meta')
        self.assertIn('tool', kinds)
        self.assertEqual(kinds[-1], 'done')
        tool = next(e for e in ev if e['t'] == 'tool')
        self.assertEqual(tool['name'], 'development_length')
        self.assertAlmostEqual(tool['result']['ld_mm'], round(E.dev_length(25, 28, 420, top=True)), delta=1)
        text = ''.join(e['c'] for e in ev if e['t'] == 'delta')
        self.assertIn('ld = 1117', text)
        done = ev[-1]
        self.assertAlmostEqual(done['usage']['cost'], 0.003)
        # ما وصل للنموذج: تعليمات النظام فيها السياق والمراجع، والمفتاح بالرأس فقط
        sent = SEEN[-1]['body']
        sysmsg = sent['messages'][0]['content']
        self.assertIn('ACI 318-19', sysmsg)
        self.assertIn('معالج المشروع', sysmsg)
        self.assertIn('حصراً', sysmsg)
        self.assertTrue(any(m.get('role') == 'tool' for m in sent['messages']))
        self.assertNotIn(GOOD, json.dumps(sent))
        self.assertEqual(SEEN[-1]['headers'].get('X-Title'), 'Civil Engineering Platform 5819')

    def test_5_model_without_tools_falls_back(self):
        self.req('/api/ai/config', dict(key=GOOD, model='test/tools-model'))
        c, ev = self.events(dict(messages=[dict(role='user', content='شكد طول التماسك؟')], model='test/notools', tools=True))
        self.assertEqual(c, 200)
        txt = ''.join(e['c'] for e in ev if e['t'] == 'delta')
        self.assertIn('محاكي', txt)
        self.assertEqual(ev[-1]['t'], 'done')

    def test_6_visitors_limits_and_own_key(self):
        self.req('/api/ai/config', dict(key=GOOD, allow_public=False))
        q = dict(messages=[dict(role='user', content='مرحبا')])
        c, r = self.events(q, headers=self.REMOTE)
        self.assertEqual(c, 403)
        own = dict(self.REMOTE, **{'X-OpenRouter-Key': 'sk-or-v1-' + 'b' * 64})
        c, ev = self.events(q, headers=own)
        self.assertEqual(c, 200, ev)
        self.assertEqual(ev[-1]['t'], 'done')
        self.req('/api/ai/config', dict(allow_public=True, public_per_hour=2, public_per_day=100))
        remote2 = dict(self.REMOTE, **{'CF-Connecting-IP': '198.51.100.9'})
        codes = [self.events(q, headers=remote2)[0] for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])
        self.req('/api/ai/config', dict(allow_public=False))

    def test_7_bad_key_gives_arabic_error_event(self):
        self.req('/api/ai/config', dict(key='sk-or-v1-' + 'c' * 64))
        c, ev = self.events(dict(messages=[dict(role='user', content='اشرح الكانات')]))
        self.assertEqual(c, 200)
        err = next(e for e in ev if e['t'] == 'error')
        self.assertEqual(err['code'], 401)
        self.assertIn('المفتاح', err['c'])
        self.req('/api/ai/config', dict(key=GOOD))

    def test_8_admin_password(self):
        c, r = self.req('/api/ai/config', dict(admin_pass='abc'))
        self.assertEqual(c, 400)
        c, r = self.req('/api/ai/config', dict(admin_pass='s3cret-pass'))
        self.assertEqual(c, 200)
        c, v = self.req('/api/ai/config', headers=dict(self.REMOTE, **{'X-Admin-Pass': 's3cret-pass'}))
        self.assertTrue(v['is_admin'])
        c, r = self.req('/api/ai/config', dict(model='test/notools'), headers=dict(self.REMOTE, **{'X-Admin-Pass': 's3cret-pass'}))
        self.assertEqual(c, 200)
        bad = dict(self.REMOTE, **{'CF-Connecting-IP': '192.0.2.50', 'X-Admin-Pass': 'wrong'})
        for _ in range(8):
            self.assertFalse(self.req('/api/ai/config', headers=bad)[1]['is_admin'])
        lock = dict(bad, **{'X-Admin-Pass': 's3cret-pass'})
        self.assertFalse(self.req('/api/ai/config', headers=lock)[1]['is_admin'], 'IP locked after 8 failures')
        c, r = self.req('/api/ai/config', dict(clear_admin_pass=True), headers=dict(self.REMOTE, **{'X-Admin-Pass': 's3cret-pass'}))
        self.assertEqual(c, 403, 'clearing the password needs the local machine')
        self.req('/api/ai/config', dict(clear_admin_pass=True, model='test/tools-model'))
        self.assertFalse(self.req('/api/ai/config')[1]['has_admin_pass'])

    def test_9_knowledge_base(self):
        import aikb
        st = aikb.stats()
        self.assertGreater(st['chunks'], 120)
        for q, want in [('طول التماسك', 'تماسك'), ('الحمل الحي للمكاتب الكود العراقي', 'مكاتب = 2.5'),
                        ('25.4.2.4', '25.4.2.4'), ('Ss اربيل', 'أربيل: Ss=0.40')]:
            r = aikb.search(q, k=4)
            self.assertTrue(any(want in (x['title'] + x['text']) for x in r), (q, [x['title'] for x in r]))
        c, r = self.req('/api/ai/search', dict(q='قص الثقب'))
        self.assertEqual(c, 200)
        self.assertTrue(r['results'])

    def test_10_tools_match_engine(self):
        import aitools as T
        import engine as E
        r, _, _ = T.run('beam_flexure', dict(Mu=150, b=300, h=600))
        self.assertAlmostEqual(r['As_req'], E.flexure(150, 300, 535, 28, 420, h=600)['As_req'], delta=1)
        r, _, _ = T.run('iraqi_live_load', dict(occupancy='مكاتب'))
        self.assertEqual(r['rows'][0]['live_kN_m2'], 2.5)
        r, _, s = T.run('development_length', dict(db=999))
        self.assertIn('error', r)
        self.assertEqual(len(T.schema()), len(T.TOOLS))
        for t in T.schema():
            self.assertTrue(t['function']['name'] and t['function']['parameters']['type'] == 'object')


if __name__ == '__main__':
    unittest.main(verbosity=2)
