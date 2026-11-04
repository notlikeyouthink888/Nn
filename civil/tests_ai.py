"""اختبارات المساعد الذكي — python3 civil/tests_ai.py

تشغّل خادم المنصة الحقيقي على منفذ عشوائي، ومعه «محاكي» محلي بنفس واجهة OpenRouter
(/models و /key و /credits و /chat/completions بالتدفّق SSE واستدعاء الأدوات مقسّماً).
المحاكي أداة اختبار فقط — ما فيه ذكاء؛ يفحص المسار: الصلاحيات، حماية المفتاح، الحدود،
البحث بالمراجع، تنفيذ أدوات المنصة، والتدفّق للمتصفح. لا يحتاج إنترنت ولا مفتاحاً حقيقياً.
"""
import contextlib
import json
import os
import re
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


LSEEN = []                                   # الطلبات اللي وصلت محاكي Ollama
OLL = dict(loaded=set())


class Ollama(BaseHTTPRequestHandler):
    """محاكي لواجهة Ollama الأصلية (/api/tags و/api/show و/api/ps و/api/chat بتدفّق NDJSON) — أداة اختبار، ما بيه ذكاء.
       llama3 بلا أدوات (يرفضها بـ 400 مثل Ollama الحقيقي)، qwen2.5 بأدوات ويطلع <think> مقسوماً."""
    protocol_version = 'HTTP/1.1'
    MODELS = [dict(name='llama3:latest', model='llama3:latest', size=4661224676, digest='365c0bd3c000', modified_at='2026-10-30T20:00:00Z',
                   details=dict(family='llama', parameter_size='8.0B', quantization_level='Q4_0')),
              dict(name='qwen2.5:7b', model='qwen2.5:7b', size=4683087332, digest='845dbda0ea48', modified_at='2026-03-01T10:00:00Z',
                   details=dict(family='qwen2', parameter_size='7.6B', quantization_level='Q4_K_M')),
              dict(name='nomic-embed-text:latest', model='nomic-embed-text:latest', size=274302450, digest='0a109f422b47',
                   modified_at='2026-11-01T10:00:00Z', details=dict(family='nomic-bert', parameter_size='137M', quantization_level='F16'))]
    CAPS = {'llama3:latest': ['completion'], 'qwen2.5:7b': ['completion', 'tools'], 'nomic-embed-text:latest': ['embedding']}
    CTX = {'llama3:latest': 8192, 'qwen2.5:7b': 32768, 'nomic-embed-text:latest': 2048}

    def log_message(self, *a):
        pass

    def _j(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _nd(self, model, chunks):
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.send_header('Transfer-Encoding', 'chunked')
        self.end_headers()
        for c in chunks:
            c = dict(dict(model=model, created_at='2026-11-04T20:00:00Z', done=False), **c)
            b = (json.dumps(c, ensure_ascii=False) + '\n').encode('utf-8')
            self.wfile.write(b'%x\r\n%s\r\n' % (len(b), b))
            self.wfile.flush()
        self.wfile.write(b'0\r\n\r\n')

    def _full(self, n):
        n = str(n or '')
        names = [m['name'] for m in self.MODELS]
        return n if n in names else (n + ':latest' if n + ':latest' in names else '')

    def do_GET(self):
        if self.path == '/api/version':
            return self._j(200, dict(version='0.12.6'))
        if self.path == '/api/tags':
            return self._j(200, dict(models=self.MODELS))
        if self.path == '/api/ps':
            return self._j(200, dict(models=[dict(name=n, model=n) for n in OLL['loaded']]))
        self._j(404, dict(error='404 page not found'))

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.path == '/api/show':
            n = self._full(body.get('model') or body.get('name'))
            if not n:
                return self._j(404, dict(error="model '%s' not found" % body.get('model')))
            return self._j(200, dict(template='{{ .Prompt }}', capabilities=self.CAPS[n], details={},
                                     model_info={'general.architecture': 'x', 'x.context_length': self.CTX[n]}))
        if self.path != '/api/chat':
            return self._j(404, dict(error='404 page not found'))
        LSEEN.append(body)
        n = self._full(body.get('model'))
        if not n:
            return self._j(404, dict(error='model "%s" not found, try pulling it first' % body.get('model')))
        if body.get('tools') and 'tools' not in self.CAPS[n]:
            return self._j(400, dict(error='registry.ollama.ai/library/%s does not support tools' % n))
        OLL['loaded'].add(n)
        msgs = body.get('messages') or []
        users = [m['content'] for m in msgs if m.get('role') == 'user']
        question = next((u for u in reversed(users) if not u.startswith('(Platform')), '')
        if body.get('format'):                                   # خطوة التوجيه: JSON مقيّد بالمخطط
            calls = [dict(name='development_length', args=dict(db=25, fc=28, top=True))] if 'طول' in question else []
            return self._j(200, dict(model=n, message=dict(role='assistant', content=json.dumps(dict(calls=calls))), done=True,
                                     done_reason='stop', prompt_eval_count=700, eval_count=30, eval_duration=1500000000))
        tool_msgs = [m for m in msgs if m.get('role') == 'tool']
        note = users[-1] if users and users[-1].startswith('(Platform note') else ''
        if body.get('tools') and not tool_msgs and 'طول' in question:
            return self._nd(n, [dict(message=dict(role='assistant', content='<thi')),
                                dict(message=dict(role='assistant', content='nk>planning the call…</think>\n')),
                                dict(message=dict(role='assistant', content='', tool_calls=[dict(function=dict(
                                    name='development_length', arguments=dict(db=25, fc=28, top=True)))])),
                                dict(message=dict(role='assistant', content=''), done=True, done_reason='stop',
                                     prompt_eval_count=900, eval_count=20, eval_duration=1000000000)])
        src = tool_msgs[-1]['content'] if tool_msgs else note
        ld = re.search(r'"ld_mm":\s*([\d.]+)', src)
        ldh = re.search(r'"ldh_mm":\s*([\d.]+)', src)
        if ld:
            txt = '[محاكي Ollama] حسب حاسبة المنصة: ld = %s مم و ldh = %s مم (ACI 318-19 §25.4.2.4).' % (ld.group(1), ldh.group(1) if ldh else '?')
        else:
            txt = '[محاكي Ollama] وصلني سؤالك: ' + question[:60]
        if n == 'qwen2.5:7b':
            txt = '<think>hidden</think>' + txt
        parts = [txt[i:i + 9] for i in range(0, len(txt), 9)]
        self._nd(n, [dict(message=dict(role='assistant', content=p)) for p in parts] +
                 [dict(message=dict(role='assistant', content=''), done=True, done_reason='stop', prompt_eval_count=1500,
                       eval_count=80, eval_duration=4000000000)])


def _serve(handler):
    s = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def _closed_url():
    import socket
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return 'http://127.0.0.1:%d' % port


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='civil_ai_')
        cls.up = _serve(Upstream)
        cls.oll = _serve(Ollama)
        cls.oll_url = 'http://127.0.0.1:%d' % cls.oll.server_address[1]
        cls.down_url = _closed_url()                 # افتراضياً Ollama «طافي» حتى لو شغّال بحاسبة المطوّر
        os.environ['CIVIL_OLLAMA'] = cls.down_url
        os.environ['OPENROUTER_BASE'] = 'http://127.0.0.1:%d' % cls.up.server_address[1]
        os.environ['CIVIL_DATA'] = cls.tmp
        import app
        cls.srv = _serve(app.H)
        cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.up.shutdown()
        cls.oll.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @contextlib.contextmanager
    def ollama(self):
        os.environ['CIVIL_OLLAMA'] = self.oll_url
        try:
            yield
        finally:
            os.environ['CIVIL_OLLAMA'] = self.down_url

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

    # ------------------------------------------------------------ النموذج المحلي (Ollama) — احتياط
    CTX = dict(page=dict(id='rebar', name='حديد التسليح'), project=dict(input=dict(fc=28, fy=420)))

    def test_11_local_config_and_status(self):
        for bad in ('http://8.8.8.8:11434', 'file:///etc/passwd', 'http://127.0.0.1:11434/api/chat', 'http://u:p@127.0.0.1:11434',
                    'ftp://127.0.0.1', 'http://example.com:11434', 'http://127.0.0.1:99999'):
            self.assertEqual(self.req('/api/ai/config', dict(local_url=bad))[0], 400, bad)
        self.assertEqual(self.req('/api/ai/config', dict(local_url='http://192.168.1.20:11434'))[0], 200)
        self.assertEqual(self.req('/api/ai/config', dict(local_mode='weird'))[0], 400)
        c, r = self.req('/api/ai/config', dict(local_url='', local_mode='fallback', local_model='', local_ctx=999999))
        self.assertEqual(c, 200)
        self.assertEqual(r['config']['local_ctx'], 32768)
        self.assertEqual(self.req('/api/ai/local', {}, headers=self.REMOTE)[0], 403)
        self.assertEqual(self.req('/api/ai/local', dict(url='http://8.8.8.8'))[0], 400)
        c, st = self.req('/api/ai/local', {})
        self.assertFalse(st['ok'])
        self.assertIn('Ollama مو شغّال', st['error'])
        with self.ollama():
            c, st = self.req('/api/ai/local', {})
        self.assertTrue(st['ok'], st)
        self.assertEqual(st['version'], '0.12.6')
        rows = {m['name']: m for m in st['models']}
        self.assertFalse(rows['llama3:latest']['tools'])
        self.assertTrue(rows['qwen2.5:7b']['tools'])
        self.assertTrue(rows['nomic-embed-text:latest']['embed'])
        self.assertEqual(rows['llama3:latest']['ctx'], 8192)
        self.assertEqual(st['chosen'], 'llama3:latest', 'newest chat model, never the embedding model')
        c, v = self.req('/api/ai/config', headers=self.REMOTE)
        self.assertEqual(v['local_url'], '')
        self.assertEqual(v['local_mode'], 'fallback')

    def test_12_fallback_when_openrouter_fails(self):
        import engine as E
        self.req('/api/ai/config', dict(key='sk-or-v1-' + 'c' * 64, local_mode='fallback', local_model='llama3'))
        del LSEEN[:]
        with self.ollama():
            c, ev = self.events(dict(messages=[dict(role='user', content='شكد طول التماسك لشيش 25 علوي؟')], context=self.CTX))
        self.req('/api/ai/config', dict(key=GOOD))
        self.assertEqual(c, 200, ev)
        st = [e['c'] for e in ev if e['t'] == 'status']
        self.assertTrue(any('حوّلت للنموذج المحلي' in s and 'المفتاح' in s for s in st), st)
        self.assertFalse([e for e in ev if e['t'] == 'error'], ev)
        tool = next(e for e in ev if e['t'] == 'tool')
        self.assertEqual(tool['name'], 'development_length')
        self.assertAlmostEqual(tool['result']['ld_mm'], round(E.dev_length(25, 28, 420, top=True)), delta=1)
        text = ''.join(e['c'] for e in ev if e['t'] == 'delta')
        self.assertIn('ld = %d مم' % round(tool['result']['ld_mm']), text, 'numbers reach the small model as integers')
        self.assertTrue(any(s.startswith('⚠️ المفتاح غير صحيح أو ملغي — حوّلت') for s in st), st)
        done = ev[-1]
        self.assertEqual(done['t'], 'done')
        self.assertTrue(done['local'])
        self.assertEqual(done['model'], 'llama3:latest')
        self.assertEqual(done['usage']['completion_tokens'], 110)
        self.assertEqual(done['tps'], 20.0)
        # llama3 ما يدعم الأدوات: ولا طلب فيه tools؛ خطوة توجيه وحدة بمخطط JSON، والجواب فيه نتائج المنصة
        self.assertTrue(LSEEN and all('tools' not in b for b in LSEEN))
        plans = [b for b in LSEEN if b.get('format')]
        self.assertEqual(len(plans), 1)
        self.assertIn('development_length', plans[0]['format']['properties']['calls']['items']['properties']['name']['enum'])
        final = LSEEN[-1]
        self.assertTrue(final['stream'])
        self.assertEqual(final['options']['num_ctx'], 8192)
        self.assertTrue(final['messages'][-1]['content'].startswith('(Platform note'))
        self.assertIn('ACI 318-19', final['messages'][0]['content'])
        self.assertIn('حديد التسليح', final['messages'][0]['content'])
        self.assertNotIn('sk-or-', json.dumps(LSEEN))

    def test_13_always_local_native_tools_and_think_stripped(self):
        self.req('/api/ai/config', dict(key=GOOD, local_mode='always', local_model='qwen2.5:7b'))
        del LSEEN[:]
        n_up = len(SEEN)
        with self.ollama():
            c, ev = self.events(dict(messages=[dict(role='user', content='احسب طول التماسك لـ Ø25 علوي')], context=self.CTX))
        self.req('/api/ai/config', dict(local_mode='fallback', local_model=''))
        self.assertEqual(c, 200, ev)
        self.assertEqual(len(SEEN), n_up, 'always-local must not call OpenRouter')
        text = ''.join(e['c'] for e in ev if e['t'] == 'delta')
        self.assertNotIn('think', text)
        self.assertNotIn('planning', text)
        self.assertIn('ld = ', text)
        self.assertTrue(text.startswith('[محاكي Ollama]'), text[:40])
        self.assertTrue(LSEEN[0].get('tools'), 'qwen2.5 gets native tools')
        tmsg = [m for m in LSEEN[-1]['messages'] if m.get('role') == 'tool']
        self.assertEqual(tmsg[0]['tool_name'], 'development_length')
        self.assertTrue(ev[-1]['local'])

    def test_14_no_key_uses_local_or_explains(self):
        self.req('/api/ai/config', dict(key='', local_mode='fallback', local_model=''))
        q = dict(messages=[dict(role='user', content='اشرح لي الكانات')])
        with self.ollama():
            c, ev = self.events(q)
        self.assertEqual(c, 200, ev)
        self.assertTrue(any('ما مضاف مفتاح OpenRouter' in e.get('c', '') for e in ev if e['t'] == 'status'))
        self.assertTrue(ev[-1]['local'])
        self.assertEqual(ev[-1]['model'], 'llama3:latest')
        self.assertFalse([b for b in LSEEN[-1:] if b.get('format')], 'no digits/calc words → no router step')
        c, r = self.events(q)                                  # Ollama طافي ← نفس رسالة «ماكو مفتاح» مع ملاحظة
        self.assertEqual(c, 403)
        self.assertEqual(r['need'], 'key')
        self.assertIn('Ollama', r['error'])
        self.req('/api/ai/config', dict(local_mode='off'))
        c, r = self.events(q)
        self.assertEqual(c, 403)
        self.assertNotIn('Ollama', r['error'])
        self.req('/api/ai/config', dict(key=GOOD, local_mode='fallback'))

    def test_15_ollama_down_keeps_openrouter_error(self):
        self.req('/api/ai/config', dict(key='sk-or-v1-' + 'c' * 64, local_mode='fallback'))
        c, ev = self.events(dict(messages=[dict(role='user', content='اشرح الكانات')]))
        self.req('/api/ai/config', dict(key=GOOD))
        err = next(e for e in ev if e['t'] == 'error')
        self.assertEqual(err['code'], 401)
        self.assertIn('المفتاح', err['c'])
        self.assertIn('الاحتياط المحلي', err['c'])

    def test_16_visitors_and_local(self):
        self.req('/api/ai/config', dict(key='', allow_public=False, local_mode='fallback'))
        q = dict(messages=[dict(role='user', content='مرحبا')])
        remote = dict(self.REMOTE, **{'CF-Connecting-IP': '198.51.100.77'})
        with self.ollama():
            c, r = self.events(q, headers=remote)
            self.assertEqual(c, 403, 'locked platform: visitors never reach the local model')
            self.req('/api/ai/config', dict(allow_public=True, public_per_hour=5, public_per_day=50))
            c, ev = self.events(q, headers=remote)
        self.req('/api/ai/config', dict(key=GOOD, allow_public=False))
        self.assertEqual(c, 200, ev)
        self.assertTrue(ev[-1]['local'])
        self.assertFalse(any('ما مضاف مفتاح' in e.get('c', '') for e in ev), 'visitors are not told about the owner key')

    def test_17_missing_model_and_helpers(self):
        import ailocal as L
        self.req('/api/ai/config', dict(key='', local_mode='fallback', local_model='mistral'))
        with self.ollama():
            c, ev = self.events(dict(messages=[dict(role='user', content='مرحبا')]))
        self.req('/api/ai/config', dict(key=GOOD, local_model=''))
        self.assertTrue(any('«mistral» مو موجود' in e.get('c', '') for e in ev if e['t'] == 'status'), ev)
        self.assertEqual(ev[-1]['model'], 'llama3:latest')
        f = L.Think()
        got = ''.join(f.feed(p) for p in ['أهلاً <th', 'ink>سر', 'ي</thi', 'nk> بيك <', 'b>']) + f.flush()
        self.assertEqual(got, 'أهلاً  بيك <b>')
        self.assertTrue(L.valid_url('http://localhost:11434') and L.valid_url('http://[::1]:11434') and L.valid_url('http://10.0.0.5:11434/'))
        self.assertFalse(L.valid_url('http://1.1.1.1:11434') or L.valid_url('http://ollama.example.com'))
        self.assertTrue(L.needs_calc('شكد الغطاء؟') and L.needs_calc('Ø25') and not L.needs_calc('اشرح الكانات'))
        h = L.history([dict(role='user', content='س' * 5000), dict(role='assistant', content='ج' * 5000), dict(role='user', content='آخر')])
        self.assertEqual(h[-1]['content'], 'آخر')
        self.assertEqual(h[0]['role'], 'user')
        self.assertLessEqual(sum(len(m['content']) for m in h), 3600 + 1500)


if __name__ == '__main__':
    unittest.main(verbosity=2)
