"""اختبارات المساعد الذكي — python3 civil/tests_ai.py

تشغّل خادم المنصة الحقيقي على منفذ عشوائي، ومعه «محاكيات» محلية:
· محاكي بواجهة OpenRouter (/models و /key و /credits و /chat/completions بالتدفّق SSE واستدعاء الأدوات مقسّماً).
· محاكيان بواجهة OpenAI العامة (مثل DeepSeek و Groq) تحت ‎/v1 — واحد منهما يرفض stream_options.
المحاكيات أدوات اختبار فقط — ما فيها ذكاء؛ تفحص المسار: الصلاحيات، حماية المفاتيح، تعدد المزوّدين والانتقال
بينهم، سجل استخدام الزوار وإيقافهم، الحدود، البحث بالمراجع، تنفيذ أدوات المنصة، والتدفّق للمتصفح.
لا تحتاج إنترنت ولا مفتاحاً حقيقياً.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
GOOD = 'sk-or-v1-' + 'a' * 64               # مفتاح محاكي OpenRouter
BAD = 'sk-or-v1-' + 'c' * 64
GOOD2 = 'sk-' + 'd' * 40                    # مفتاح المحاكي العام
SEEN = []                                    # الطلبات اللي وصلت محاكي OpenRouter (لفحص ما يُرسل للنموذج)


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
        return self.headers.get('Authorization') == 'Bearer ' + GOOD

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


def generic(no_stream_options=False):
    """محاكي بواجهة OpenAI العامة تحت ‎/v1 (مثل DeepSeek/Groq): قائمة النماذج تحتاج المفتاح، والاستهلاك بلا كلفة."""
    class G(BaseHTTPRequestHandler):
        seen = []

        def log_message(self, *a):
            pass

        def _j(self, code, obj):
            b = json.dumps(obj).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def _auth(self):
            return self.headers.get('Authorization') == 'Bearer ' + GOOD2

        def do_GET(self):
            if not self._auth():
                return self._j(401, dict(error=dict(message='Authentication Fails', type='authentication_error')))
            if self.path == '/v1/models':
                return self._j(200, dict(object='list', data=[dict(id='mock-chat', object='model'), dict(id='mock-reasoner', object='model')]))
            self._j(404, dict(error=dict(message='nf')))

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
            G.seen.append(dict(path=self.path, headers=dict(self.headers), body=body))
            if self.path != '/v1/chat/completions':
                return self._j(404, dict(error=dict(message='nf')))
            if not self._auth():
                return self._j(401, dict(error=dict(message='Authentication Fails')))
            if 'usage' in body:                                   # حقل خاص بـ OpenRouter — ما لازم يوصل لغيره
                return self._j(400, dict(error=dict(message='Unrecognized request argument supplied: usage')))
            if no_stream_options and 'stream_options' in body:
                return self._j(400, dict(error=dict(message='Unrecognized request argument supplied: stream_options')))
            last = next((m['content'] for m in reversed(body.get('messages') or []) if m.get('role') == 'user'), '')
            txt = '[المزوّد الثاني] وصلني سؤالك: ' + last[:60]
            return _sse(self, [dict(model=body.get('model'), choices=[dict(index=0, delta=dict(content=txt[i:i + 10]))]) for i in range(0, len(txt), 10)] +
                        [dict(model=body.get('model'), choices=[dict(index=0, delta={}, finish_reason='stop')]),
                         dict(model=body.get('model'), choices=[], usage=dict(prompt_tokens=500, completion_tokens=50, total_tokens=550))])
    return G


def _serve(handler):
    s = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='civil_ai_')
        cls.up = _serve(Upstream)
        cls.G2, cls.G3 = generic(), generic(no_stream_options=True)
        cls.up2, cls.up3 = _serve(cls.G2), _serve(cls.G3)
        cls.base2 = 'http://127.0.0.1:%d/v1' % cls.up2.server_address[1]
        cls.base3 = 'http://127.0.0.1:%d/v1' % cls.up3.server_address[1]
        os.environ['OPENROUTER_BASE'] = 'http://127.0.0.1:%d' % cls.up.server_address[1]
        os.environ['CIVIL_AI_ALLOW_HTTP'] = '1'             # يسمح للمزوّد المخصّص بـ http المحلي (للمحاكي فقط)
        os.environ['CIVIL_DATA'] = cls.tmp
        import app
        cls.srv = _serve(app.H)
        cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        for s in (cls.srv, cls.up, cls.up2, cls.up3):
            s.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        """كل اختبار يبدأ نظيفاً: مزوّد واحد (محاكي OpenRouter) بمفتاح صحيح، الزوار مسموحون، وسجل فارغ."""
        import ai
        cfg = ai.load()
        cfg.update(providers=[ai._clean_prov(dict(id='openrouter', kind='openrouter', key=GOOD, model='test/tools-model'))],
                   allow_public=True, public_per_hour=20, public_per_day=300, user_per_day=40, blocked=[], admin_hash='', admin_salt='')
        ai.save(cfg)
        ai._HITS.clear()
        ai._MC.clear()
        with ai._USE_LOCK:
            ai._use_users().clear()
            ai._use_save()

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
    Q = dict(messages=[dict(role='user', content='مرحبا')])

    def guest(self, ip, vid=None):
        h = dict(self.REMOTE, **{'CF-Connecting-IP': ip, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile'})
        if vid:
            h['X-Visitor'] = vid
        return h

    def add2(self, base=None, **kw):
        a = dict(kind='custom', base=base or self.base2, key=GOOD2, model='mock-chat', name='مزوّد تجريبي')
        a.update(kw)
        return self.req('/api/ai/config', dict(provider_add=a))

    def test_1_owner_adds_keys_and_they_stay_hidden(self):
        import ai
        c, v = self.req('/api/ai/config')
        self.assertEqual(c, 200)
        self.assertTrue(v['is_admin'] and v['is_local'] and v['ready'])
        self.assertEqual([p['id'] for p in v['providers']], ['openrouter'])
        self.assertEqual({p['kind'] for p in v['presets']}, {'openrouter', 'deepseek', 'groq', 'gemini', 'custom'})
        c, r = self.add2()
        self.assertEqual(c, 200, r)
        ps = r['config']['providers']
        self.assertEqual([(p['id'], p['name'], p['model'], p['on'], p['has_key']) for p in ps],
                         [('openrouter', 'OpenRouter', 'test/tools-model', True, True), ('custom', 'مزوّد تجريبي', 'mock-chat', True, True)])
        txt = json.dumps(self.req('/api/ai/config')[1])
        self.assertNotIn(GOOD, txt)
        self.assertNotIn(GOOD2, txt)
        self.assertTrue(ps[0]['key_hint'].startswith('sk-or-') and ps[0]['key_hint'].endswith('aaaa'))
        with open(os.path.join(self.tmp, 'ai.json'), encoding='utf-8') as f:
            saved = json.load(f)
        self.assertEqual([p['key'] for p in saved['providers']], [GOOD, GOOD2])
        self.assertNotIn('key', saved)
        self.assertFalse([k for k in saved if k.startswith('local')], 'no local-model settings remain')
        if os.name == 'posix':
            self.assertEqual(os.stat(os.path.join(self.tmp, 'ai.json')).st_mode & 0o777, 0o600)
        # ملف النسخة القديمة (مفتاح OpenRouter واحد، والزوار مقفولين) يترحّل: مزوّد واحد والزوار يسألون مباشرة
        old = tempfile.mkdtemp(prefix='civil_ai_old_')
        try:
            with open(os.path.join(old, 'ai.json'), 'w', encoding='utf-8') as f:
                json.dump(dict(key=GOOD, model='deepseek/deepseek-chat', allow_public=False, local_mode='fallback', local_model='llama3'), f)
            os.environ['CIVIL_DATA'] = old
            cfg = ai.load()
            self.assertEqual([(p['kind'], p['key'], p['model']) for p in cfg['providers']], [('openrouter', GOOD, 'deepseek/deepseek-chat')])
            self.assertTrue(cfg['allow_public'])
            self.assertNotIn('local_mode', cfg)
        finally:
            os.environ['CIVIL_DATA'] = self.tmp
            shutil.rmtree(old, ignore_errors=True)

    def test_2_remote_cannot_manage_and_csrf_blocked(self):
        c, v = self.req('/api/ai/config', headers=self.REMOTE)
        self.assertFalse(v['is_admin'])
        self.assertTrue(v['ready'])
        for hidden in ('providers', 'presets', 'public_per_hour', 'user_per_day', 'blocked', 'max_tokens', 'key_hint', 'model'):
            self.assertNotIn(hidden, v, 'visitors see no settings')
        self.assertNotIn('sk-or', json.dumps(v))
        self.assertEqual(v['me'], dict(blocked=False, left=40))
        for body in (dict(provider_del='openrouter'), dict(provider_add=dict(kind='groq', key='gsk_' + 'x' * 40)), dict(allow_public=False)):
            self.assertEqual(self.req('/api/ai/config', body, headers=self.REMOTE)[0], 403)
        self.assertEqual(self.req('/api/ai/models?p=openrouter', headers=self.REMOTE)[0], 403)
        self.assertEqual(self.req('/api/ai/usage', headers=self.REMOTE)[0], 403)
        self.assertEqual(self.req('/api/ai/usage', dict(clear=True), headers=self.REMOTE)[0], 403)
        self.assertEqual(self.req('/api/ai/test', dict(id='openrouter'), headers=self.REMOTE)[0], 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Origin': 'http://evil.example'})
        self.assertEqual(c, 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(c, 403)
        c, r = self.req('/api/ai/config', dict(allow_public=True), headers={'Content-Type': 'text/plain'})
        self.assertEqual(c, 415)
        # عنوان loopback لكن مضيف غريب (DNS rebinding) ← ليس مشرفاً
        c, v = self.req('/api/ai/config', headers={'Host': 'attacker.example'})
        self.assertFalse(v['is_admin'])
        self.assertEqual(len(self.req('/api/ai/config')[1]['providers']), 1, 'nothing changed')

    def test_3_models_and_key_test(self):
        c, m = self.req('/api/ai/models?p=openrouter')
        self.assertEqual(c, 200)
        ids = {x['id']: x for x in m['models']}
        self.assertTrue(ids['test/tools-model']['tools'] and not ids['test/notools']['tools'])
        self.assertTrue(ids['test/notools']['free'])
        self.assertAlmostEqual(ids['test/tools-model']['pin'], 1.0)
        c, k = self.req('/api/ai/test', dict(id='openrouter'))
        self.assertTrue(k['ok'], k)
        self.assertEqual(k['credits']['left'], 9.75)
        self.add2()
        c, m = self.req('/api/ai/models?p=custom')
        self.assertEqual([x['id'] for x in m['models']], ['mock-chat', 'mock-reasoner'])
        self.assertIsNone(m['models'][0]['tools'], 'unknown → the chat tries tools and falls back')
        self.assertFalse([x for x in self.G2.seen if x["path"] != "/v1/chat/completions"], "listing models never posts elsewhere")
        c, k = self.req('/api/ai/test', dict(id='custom'))
        self.assertTrue(k['ok'] and k['models'] == 2, k)
        self.req('/api/ai/config', dict(provider_set=dict(id='custom', key='sk-' + 'z' * 40)))
        c, k = self.req('/api/ai/test', dict(id='custom'))
        self.assertFalse(k['ok'])
        self.assertIn('المفتاح', k['error'])
        self.assertIn('مزوّد تجريبي', k['error'])
        self.assertEqual(self.req('/api/ai/models?p=nope')[0], 404)
        self.assertEqual(self.req('/api/ai/test', dict(id='nope'))[0], 400)

    def test_4_chat_runs_platform_tool_and_streams(self):
        import engine as E
        ctx = dict(page=dict(id='wizard', name='معالج المشروع'), project=dict(fc=28, fy=420))
        c, ev = self.events(dict(messages=[dict(role='user', content='شكد طول التماسك لشيش 25 علوي؟')], context=ctx))
        self.assertEqual(c, 200, ev)
        kinds = [e['t'] for e in ev]
        self.assertEqual(kinds[0], 'meta')
        self.assertEqual(ev[0]['provider'], 'OpenRouter')
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
        self.assertEqual(sent['usage'], dict(include=True))
        self.assertNotIn('stream_options', sent)
        self.assertEqual(SEEN[-1]['headers'].get('X-Title'), 'Civil Engineering Platform 5819')

    def test_5_model_without_tools_falls_back(self):
        c, r = self.req('/api/ai/config', dict(provider_set=dict(id='openrouter', model='test/notools')))
        self.assertEqual(c, 200, r)
        c, ev = self.events(dict(messages=[dict(role='user', content='شكد طول التماسك؟')]))
        self.assertEqual(c, 200)
        txt = ''.join(e['c'] for e in ev if e['t'] == 'delta')
        self.assertIn('محاكي', txt)
        self.assertEqual(ev[-1]['t'], 'done')
        self.assertTrue(any('ما يدعم الأدوات' in e.get('c', '') for e in ev if e['t'] == 'status'))

    def test_6_visitors_just_ask(self):
        # الزائر يسأل مباشرة بمفتاح صاحب المنصة — وما يشوف المزوّد ولا النموذج ولا الكلفة
        n = len(SEEN)
        c, ev = self.events(self.Q, headers=dict(self.guest('198.51.100.1', 'a' * 16), **{'X-OpenRouter-Key': BAD, 'X-Admin-Pass': 'guess'}))
        self.assertEqual(c, 200, ev)
        self.assertEqual(ev[-1], dict(t='done'))
        self.assertTrue(''.join(e['c'] for e in ev if e['t'] == 'delta').startswith('[محاكي اختبار]'))
        for e in ev:
            self.assertFalse({'provider', 'model', 'usage'} & set(e), e)
        self.assertEqual(SEEN[-1]['headers']['Authorization'], 'Bearer ' + GOOD, 'a visitor-supplied key is ignored')
        self.assertEqual(len(SEEN), n + 1)
        self.assertNotIn('test/tools-model', json.dumps(ev))
        # اختيار النموذج لصاحب المنصة فقط
        self.events(dict(self.Q, model='test/notools'), headers=self.guest('198.51.100.1', 'a' * 16))
        self.assertEqual(SEEN[-1]['body']['model'], 'test/tools-model')
        # حد الساعة لكل عنوان
        self.req('/api/ai/config', dict(public_per_hour=2))
        g = self.guest('198.51.100.9', 'b' * 16)
        self.assertEqual([self.events(self.Q, headers=g)[0] for _ in range(3)], [200, 200, 429])
        # الحد الكلي لليوم
        self.req('/api/ai/config', dict(public_per_hour=20, public_per_day=1))
        import ai
        ai._HITS.clear()
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.20'))[0], 200)
        c, r = self.events(self.Q, headers=self.guest('198.51.100.21'))
        self.assertEqual((c, r['need']), (429, 'limit'))
        self.assertEqual(self.events(self.Q)[0], 200, 'the owner is never limited by visitor caps')
        # قفل الزوار كلهم
        self.req('/api/ai/config', dict(allow_public=False, public_per_day=300))
        c, r = self.events(self.Q, headers=self.guest('198.51.100.30'))
        self.assertEqual((c, r['need']), (403, 'off'))
        self.assertFalse(self.req('/api/ai/config', headers=self.REMOTE)[1]['allow_public'])

    def test_7_errors_owner_sees_details_visitor_does_not(self):
        self.req('/api/ai/config', dict(provider_set=dict(id='openrouter', key=BAD)))
        c, ev = self.events(dict(messages=[dict(role='user', content='اشرح الكانات')]))
        self.assertEqual(c, 200)
        err = next(e for e in ev if e['t'] == 'error')
        self.assertEqual(err['code'], 401)
        self.assertIn('المفتاح', err['c'])
        self.assertIn('OpenRouter', err['c'])
        c, ev = self.events(self.Q, headers=self.guest('198.51.100.40'))
        err = next(e for e in ev if e['t'] == 'error')
        self.assertEqual(err, dict(t='error', c='المساعد ما يكدر يجاوب هسه — جرّب بعد شوي.'))
        self.assertNotIn('OpenRouter', json.dumps(ev, ensure_ascii=False))
        # ولا مزوّد ← رسالة مختلفة للمالك وللزائر
        self.req('/api/ai/config', dict(provider_del='openrouter'))
        c, r = self.events(self.Q)
        self.assertEqual((c, r['need']), (403, 'key'))
        c, r = self.events(self.Q, headers=self.guest('198.51.100.41'))
        self.assertEqual((c, r['need']), (403, 'off'))
        self.assertFalse(self.req('/api/ai/config', headers=self.REMOTE)[1]['ready'])

    def test_8_admin_password(self):
        c, r = self.req('/api/ai/config', dict(admin_pass='abc'))
        self.assertEqual(c, 400)
        c, r = self.req('/api/ai/config', dict(admin_pass='s3cret-pass'))
        self.assertEqual(c, 200)
        boss = dict(self.REMOTE, **{'X-Admin-Pass': 's3cret-pass'})
        c, v = self.req('/api/ai/config', headers=boss)
        self.assertTrue(v['is_admin'] and not v['is_local'])
        self.assertEqual(len(v['providers']), 1)
        c, r = self.req('/api/ai/config', dict(provider_set=dict(id='openrouter', model='test/notools')), headers=boss)
        self.assertEqual(c, 200)
        self.assertEqual(self.req('/api/ai/usage', headers=boss)[0], 200)
        bad = dict(self.REMOTE, **{'CF-Connecting-IP': '192.0.2.50', 'X-Admin-Pass': 'wrong'})
        for _ in range(8):
            self.assertFalse(self.req('/api/ai/config', headers=bad)[1]['is_admin'])
        lock = dict(bad, **{'X-Admin-Pass': 's3cret-pass'})
        self.assertFalse(self.req('/api/ai/config', headers=lock)[1]['is_admin'], 'IP locked after 8 failures')
        c, r = self.req('/api/ai/config', dict(clear_admin_pass=True), headers=boss)
        self.assertEqual(c, 403, 'clearing the password needs the local machine')
        self.req('/api/ai/config', dict(clear_admin_pass=True))
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

    # ------------------------------------------------------------ المزوّدون (OpenRouter، DeepSeek، Groq، Gemini، مخصّص)
    def test_11_providers_manage(self):
        import ai
        bad = [dict(kind='nope', key=GOOD2), dict(kind='deepseek', key='short'), dict(kind='deepseek', key='has space ' + 'x' * 30),
               dict(kind='custom', key=GOOD2, base='ftp://api.example.com/v1', model='m'), dict(kind='custom', key=GOOD2, base='', model='m'),
               dict(kind='custom', key=GOOD2, base=self.base2, model='bad model name')]
        for a in bad:
            self.assertEqual(self.req('/api/ai/config', dict(provider_add=a))[0], 400, a)
        for kind, key in (('deepseek', 'sk-' + 'e' * 32), ('groq', 'gsk_' + 'f' * 48), ('gemini', 'AIza' + 'g' * 35), ('openrouter', GOOD)):
            c, r = self.req('/api/ai/config', dict(provider_add=dict(kind=kind, key=key)))
            self.assertEqual(c, 200, r)
        ps = {p['id']: p for p in r['config']['providers']}
        self.assertEqual(list(ps), ['openrouter', 'deepseek', 'groq', 'gemini', 'openrouter2'])
        self.assertEqual(ps['deepseek']['base'], 'https://api.deepseek.com')
        self.assertEqual(ps['groq']['base'], 'https://api.groq.com/openai/v1')
        self.assertEqual(ps['gemini']['base'], 'https://generativelanguage.googleapis.com/v1beta/openai')
        self.assertEqual(ps['openrouter2']['name'], 'OpenRouter 2')
        self.assertTrue(all(p['model'] for p in ps.values()))
        self.assertEqual(self.add2()[0], 200)
        c, r = self.add2()
        self.assertEqual(c, 400, 'six providers at most')
        self.assertIn('الحد الأقصى', r['error'])
        # ترتيب، إيقاف، حذف
        c, r = self.req('/api/ai/config', dict(provider_set=dict(id='groq', first=True)))
        self.assertEqual(r['config']['providers'][0]['id'], 'groq')
        c, r = self.req('/api/ai/config', dict(provider_set=dict(id='groq', on=False)))
        self.assertFalse(r['config']['providers'][0]['on'])
        self.assertEqual([p['id'] for p in ai.chain(ai.load())], ['openrouter', 'deepseek', 'gemini', 'openrouter2', 'custom'])
        c, r = self.req('/api/ai/config', dict(provider_del='gemini'))
        self.assertNotIn('gemini', [p['id'] for p in r['config']['providers']])
        self.assertEqual(self.req('/api/ai/config', dict(provider_set=dict(id='gone', on=True)))[0], 400)
        # رابط المزوّد المخصّص: https عام فقط (خارج وضع الاختبار)
        os.environ.pop('CIVIL_AI_ALLOW_HTTP')
        try:
            for ok in ('https://api.example.com/v1', 'https://llm.example.org', 'https://api.example.com:8443/openai/v1'):
                self.assertTrue(ai.valid_base(ok), ok)
            for no in ('http://api.example.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://192.168.1.5/v1', 'https://10.0.0.1',
                       'https://u:p@api.example.com', 'https://api.example.com/v1?x=1', 'ftp://api.example.com', 'https://printer.local/v1',
                       'https://[::1]/v1', 'https://169.254.169.254/latest', 'https://nodots/v1', 'https://api.example.com:99999', '', None):
                self.assertFalse(ai.valid_base(no), no)
        finally:
            os.environ['CIVIL_AI_ALLOW_HTTP'] = '1'

    def test_12_next_provider_takes_over(self):
        self.req('/api/ai/config', dict(provider_set=dict(id='openrouter', key=BAD)))
        self.add2()
        del self.G2.seen[:]
        c, ev = self.events(dict(messages=[dict(role='user', content='اشرح الكانات')]))
        self.assertEqual(c, 200, ev)
        self.assertFalse([e for e in ev if e['t'] == 'error'], ev)
        st = [e['c'] for e in ev if e['t'] == 'status']
        self.assertTrue(any(s.startswith('⚠️ المفتاح غير صحيح أو ملغي (OpenRouter)') and 'مزوّد تجريبي' in s for s in st), st)
        self.assertTrue(''.join(e['c'] for e in ev if e['t'] == 'delta').startswith('[المزوّد الثاني]'))
        self.assertEqual((ev[-1]['t'], ev[-1]['provider'], ev[-1]['model']), ('done', 'مزوّد تجريبي', 'mock-chat'))
        self.assertEqual(ev[-1]['usage']['total_tokens'], 550)
        sent = self.G2.seen[-1]
        self.assertEqual(sent['path'], '/v1/chat/completions')
        self.assertEqual(sent['headers']['Authorization'], 'Bearer ' + GOOD2)
        self.assertEqual(sent['body']['stream_options'], dict(include_usage=True))
        self.assertNotIn('usage', sent['body'])
        self.assertTrue(sent['body']['tools'])
        self.assertNotIn(GOOD2, json.dumps(sent['body']))
        # الزائر: نفس الانتقال بصمت
        c, ev = self.events(self.Q, headers=self.guest('198.51.100.50', 'c' * 16))
        self.assertEqual(c, 200)
        self.assertTrue(''.join(e['c'] for e in ev if e['t'] == 'delta').startswith('[المزوّد الثاني]'))
        self.assertNotIn('مزوّد تجريبي', json.dumps(ev, ensure_ascii=False))
        self.assertNotIn('OpenRouter', json.dumps(ev, ensure_ascii=False))
        # المزوّد الموقوف يُتخطّى، وإذا الكل فشل يطلع آخر خطأ
        self.req('/api/ai/config', dict(provider_set=dict(id='custom', on=False)))
        c, ev = self.events(self.Q)
        self.assertEqual(next(e for e in ev if e['t'] == 'error')['code'], 401)
        self.req('/api/ai/config', dict(provider_set=dict(id='custom', on=True, key='sk-' + 'z' * 40)))
        c, ev = self.events(self.Q)
        err = next(e for e in ev if e['t'] == 'error')
        self.assertIn('مزوّد تجريبي', err['c'])
        # مزوّد ما يعرف stream_options ← يعيد الطلب بدونها
        self.req('/api/ai/config', dict(provider_del='custom'))
        self.assertEqual(self.add2(base=self.base3, name='قديم')[0], 200)
        del self.G3.seen[:]
        c, ev = self.events(self.Q)
        self.assertEqual(ev[-1]['t'], 'done', ev)
        self.assertEqual(['stream_options' in x['body'] for x in self.G3.seen], [True, False])

    # ------------------------------------------------------------ من يستخدم أكثر + الإيقاف
    def test_13_usage_shows_who_asks_most(self):
        heavy, light = self.guest('198.51.100.60', 'h' * 16), self.guest('198.51.100.61', 'l' * 16)
        secret = 'سؤال سري جداً عن مشروعي'
        for _ in range(4):
            self.assertEqual(self.events(dict(messages=[dict(role='user', content=secret)]), headers=heavy)[0], 200)
        self.assertEqual(self.events(self.Q, headers=light)[0], 200)
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.62'))[0], 200)      # متصفح بلا معرّف ← بعنوانه
        self.assertEqual(self.events(self.Q, headers={'X-Visitor': 'o' * 16})[0], 200)          # صاحب المنصة
        c, u = self.req('/api/ai/usage')
        self.assertEqual(c, 200)
        rows = u['users']
        self.assertEqual([(r['key'], r['today'], r['who']) for r in rows[:1]], [('v:' + 'h' * 16, 4, 'public')])
        self.assertEqual({r['key'] for r in rows}, {'v:' + 'h' * 16, 'v:' + 'l' * 16, '198.51.100.62', 'v:' + 'o' * 16})
        top = rows[0]
        self.assertEqual((top['ip'], top['total'], top['week'], top['blocked']), ('198.51.100.60', 4, 4, False))
        self.assertEqual(top['tokens'], 4 * 1260)
        self.assertAlmostEqual(top['cost'], 4 * 0.002)
        self.assertEqual(top['device'], 'أندرويد · Chrome')
        self.assertRegex(top['tag'], r'^[0-9A-F]{4}$')
        self.assertEqual(next(r for r in rows if r['who'] == 'owner')['ip'], '127.0.0.1')
        self.assertEqual((u['today_public'], u['visitors_today'], u['today_all'], u['blocked']), (6, 3, 7, 0))
        self.assertEqual(u['limits'], dict(user_per_day=40, public_per_day=300, public_per_hour=20))
        # السجل على القرص: أعداد فقط، بلا نص الأسئلة
        with open(os.path.join(self.tmp, 'ai_usage.json'), encoding='utf-8') as f:
            raw = f.read()
        self.assertNotIn('سري', raw)
        self.assertIn('198.51.100.60', raw)
        if os.name == 'posix':
            self.assertEqual(os.stat(os.path.join(self.tmp, 'ai_usage.json')).st_mode & 0o777, 0o600)
        c, u = self.req('/api/ai/usage', dict(clear=True))
        self.assertEqual(u['usage']['users'], [])

    def test_14_block_and_unblock_a_heavy_visitor(self):
        heavy, other = self.guest('198.51.100.70', 'x' * 16), self.guest('198.51.100.71', 'y' * 16)
        self.assertEqual(self.events(self.Q, headers=heavy)[0], 200)
        self.assertEqual(self.events(self.Q, headers=other)[0], 200)
        self.assertEqual(self.req('/api/ai/usage', dict(key='v:' + 'x' * 16, block=True), headers=other)[0], 403, 'visitors cannot block')
        self.assertEqual(self.req('/api/ai/usage', dict(key='../etc', block=True))[0], 400)
        c, r = self.req('/api/ai/usage', dict(key='v:' + 'x' * 16, block=True))
        self.assertEqual(c, 200, r)
        row = next(x for x in r['usage']['users'] if x['key'] == 'v:' + 'x' * 16)
        self.assertTrue(row['blocked'])
        self.assertEqual(r['usage']['blocked'], 1)
        n = len(SEEN)
        c, r = self.events(self.Q, headers=heavy)
        self.assertEqual((c, r['need']), (403, 'blocked'))
        self.assertIn('أوقف المساعد', r['error'])
        # نفس الشخص من متصفح ثاني (معرّف جديد) على نفس العنوان، أو بعنوان جديد بنفس المتصفح ← موقوف
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.70', 'n' * 16))[0], 403)
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.70'))[0], 403)
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.99', 'x' * 16))[0], 403)
        self.assertEqual(len(SEEN), n, 'a blocked visitor costs nothing')
        self.assertEqual(self.req('/api/ai/config', headers=heavy)[1]['me']['blocked'], True)
        self.assertEqual(self.req('/api/ai/config', headers=other)[1]['me']['blocked'], False)
        self.assertEqual(self.events(self.Q, headers=other)[0], 200, 'everyone else keeps working')
        self.assertEqual(self.events(self.Q)[0], 200)
        c, r = self.req('/api/ai/usage', dict(key='v:' + 'x' * 16, block=False))
        self.assertEqual(r['usage']['blocked'], 0)
        self.assertEqual(self.events(self.Q, headers=heavy)[0], 200)
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.70', 'n' * 16))[0], 200)
        with open(os.path.join(self.tmp, 'ai.json'), encoding='utf-8') as f:
            self.assertEqual(json.load(f)['blocked'], [])

    def test_15_daily_limit_per_visitor(self):
        self.req('/api/ai/config', dict(user_per_day=2))
        g = self.guest('198.51.100.80', 'd' * 16)
        self.assertEqual(self.req('/api/ai/config', headers=g)[1]['me']['left'], 2)
        self.assertEqual([self.events(self.Q, headers=g)[0] for _ in range(2)], [200, 200])
        c, r = self.events(self.Q, headers=g)
        self.assertEqual((c, r['need']), (429, 'limit'))
        self.assertIn('حدّك اليومي', r['error'])
        self.assertEqual(self.req('/api/ai/config', headers=g)[1]['me']['left'], 0)
        self.assertEqual(self.events(self.Q, headers=self.guest('198.51.100.81', 'e' * 16))[0], 200, 'other visitors have their own quota')
        # متصفح جديد بكل مرة على نفس العنوان ما يفلت: سقف للعنوان = 3 أضعاف حد الزائر
        codes = [self.events(self.Q, headers=self.guest('198.51.100.82', ('%02d' % i) * 8))[0] for i in range(8)]
        self.assertEqual(codes, [200] * 6 + [429] * 2)
        for i in range(5):
            self.assertEqual(self.events(self.Q)[0], 200, 'the owner has no daily limit')
        self.assertEqual(self.req('/api/ai/config', dict(user_per_day=-5))[1]['config']['user_per_day'], 0)

    def test_16_local_model_is_gone(self):
        self.assertFalse(os.path.exists(os.path.join(HERE, 'ailocal.py')))
        self.assertEqual(self.req('/api/ai/local', {})[0], 404)
        c, v = self.req('/api/ai/config')
        self.assertFalse([k for k in v if k.startswith('local')])
        c, r = self.req('/api/ai/config', dict(local_mode='always', local_model='llama3'))
        self.assertEqual(c, 200)
        self.assertFalse([k for k in r['config'] if k.startswith('local')])
        for fn in ('ai.py', 'static/ai.js', 'ai_knowledge.md', 'windows/README.md'):
            with open(os.path.join(HERE, fn), encoding='utf-8') as f:
                self.assertNotIn('ollama', f.read().lower(), fn)


if __name__ == '__main__':
    unittest.main(verbosity=2)
