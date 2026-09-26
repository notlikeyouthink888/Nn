# -*- coding: utf-8 -*-
"""HTTP server for the civil engineering platform (stdlib only)."""
import gzip, json, os, sys, threading, traceback
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import engine as E
import found as FD
import earth as EW
import survey as SV
import project as PJ
import dxf as DXF
import room as RM
import bbs as BBS
import detail as DT
import slabs as SL
import plan as PL
import cadread as CAD
import aci as ACI
import beamtype as BT
import mnl66 as MN
import calcdoc as CD
try:
    import opensees_check as OSC          # تحقّق متبادل مع OpenSees (اختياري)
except Exception:                          # noqa: BLE001
    OSC = None

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, 'static')
PORT = int(os.environ.get('PORT', '5819'))
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.json': 'application/json; charset=utf-8',
        '.wasm': 'application/wasm', '.gz': 'application/wasm'}

def meta():
    return dict(live=[dict(name=a, v=b) for a, b in E.LIVE],
                dens=[dict(name=a, v=b) for a, b in E.DENS],
                cities=[dict(name=k, Ss=v[0], S1=v[1]) for k, v in E.SEISMIC_CITIES.items()],
                systems=[dict(name=k, **v) for k, v in E.SYSTEMS.items()],
                bars=E.BARS, soils=[dict(name=n, qa=q, kind=k) for n, q, k in FD.SOILS],
                pile_types=FD.PILE_TYPES,
                walls=[dict(name=w[0]) for w in RM.WALLS],
                plan_roles=[dict(k=a, name=b) for a, b in PL.ROLES],
                plan_scales=[dict(v=a, name=b) for a, b in PL.SCALES],
                slab_types=[dict(k=a, name=b, span=c, note=d) for a, b, c, d in SL.TYPES],
                chairs=[dict(k=a, name=b, note=c) for a, b, c in DT.CHAIRS],
                lap_modes=[dict(k=a, name=b) for a, b in E.LAP_MODES],
                dowel_modes=[dict(k='code', name='محسوب وفق ACI 25.4.9'),
                             dict(k='16db', name='قاعدة الموقع 16·db'),
                             dict(k='40db', name='قاعدة الموقع 40·db')],
                exposures=[dict(k=a, name=b) for a, b in DT.EXPOSURES],
                exposure_classes=[dict(code=a, cat=b, desc=c, wcm=d, fc=e, note=f)
                                  for a, b, c, d, e, f in DT.EXPOSURE_CLASSES],
                exposure_default=list(DT.IRAQ_DEFAULT),
                defl_cases=[dict(k=a, name=b, den=c, what=d) for a, b, c, d in E.DEFL_CASES],
                canti_sides=[dict(k=a, name=b) for a, b in PJ.CANTI_SIDES],
                joint_conf=[dict(k=a, name=b, gamma=c) for a, b, c in E.JOINT_CONF],
                cover_table=[dict(name=a, v=b, ref=c) for a, b, c in DT.COVER_TABLE],
                bend_types=MN.BEND_TYPES,
                beam_types=[dict(k=t['k'], name=t['name'], short=t['short'],
                                 slab=t['slab'], torsion=t['torsion'],
                                 desc=t['desc'], pros=t['pros'], cons=t['cons'])
                            for t in BT.TYPES],
                hordi=SL.HORDI_DEFAULT, version="3.0")

ROUTES = {
    'meta': lambda p: meta(),
    'floor': E.floor_load,
    'seismic': E.seismic,
    'wind': E.wind,
    'beam': E.beam_module,
    'column': E.column_module,
    'footing': E.footing_module,
    'slab': E.slab_module,
    'xray': E.xray,
    'boq': E.boq,
    # --- حزمة ما تحت الصفر ---
    'wizard': PJ.wizard,
    'survey': SV.polygon,
    'traverse': SV.traverse,
    'levels': SV.levels,
    'cutfill': SV.cutfill,
    'earthwork': EW.earthwork,
    'foundation': FD.advisor,
    'raft': FD.raft,
    'pile': FD.pile,
    'bearing': FD.bearing_capacity,
    'project/save': PJ.save,
    'project/list': PJ.listing,
    'project/load': PJ.load,
    'project/delete': PJ.delete,
    'room': RM.room,
    'bbs': lambda p: BBS.schedule(p if 'model' in p else PJ.wizard(p)),
    'aci': lambda p: ACI.report(p if 'model' in p else PJ.wizard(p)),
    # طبقة التفصيل حسب ACI Detailing Manual MNL-66(20) — مستقلّة عن الأصل
    'mnl66': lambda p: MN.pack(p if 'model' in p else PJ.wizard(p)),
    # اشتقاق الحسابات خطوةً خطوة بالمعادلة ونصّ البند — مصدرٌ واحد للواجهتين
    'calcdoc': CD.build,
    # تحقّق متبادل: نفس النموذج يُحلّ في OpenSees (PEER/بيركلي) وتُقارن النتائج
    'opensees': (lambda p: OSC.run(p)) if OSC else
                (lambda p: dict(ok=False, error='OpenSeesPy غير منصَّب على الخادم')),
    # --- التفاصيل والتجربة وأنواع السقوف ---
    'lab': PJ.lab,
    'plan/parse': PL.analyze,
    'plan/dxf': PL.parse_dxf,
    'cad/read': lambda p: CAD.read_set(p, p.get('opts')),
    'lab/sweep': PJ.lab_sweep,
    'slabtypes': PJ.slabtypes,
    'slabtype': lambda p: SL.design(p.get('kind', 'hordi'), p),
    'detail/cover': lambda p: dict(
        cover=DT.cover(p.get('element', 'slab'), p.get('exposure', 'interior'),
                       float(p.get('db', 16))),
        table=[dict(name=a, v=b, ref=c) for a, b, c in DT.COVER_TABLE],
        exposures=[dict(k=a, name=b) for a, b in DT.EXPOSURES]),
}

class H(BaseHTTPRequestHandler):
    server_version = "CivilEng/1.0"
    def log_message(self, fmt, *a):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % a))

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        if isinstance(body, str): body = body.encode('utf-8')
        gz = (len(body) > 65536 and ctype.startswith('application/json')
              and 'gzip' in (self.headers.get('Accept-Encoding') or ''))
        if gz: body = gzip.compress(body, 5)       # نتائج كبيرة (قسم الأوتوكاد) تُضغط للموبايل
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        if gz: self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try: self.wfile.write(body)
        except BrokenPipeError: pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/health':
            return self._send(200, json.dumps(dict(ok=True, port=PORT, app="civil")))
        if path == '/api/meta':
            return self._send(200, json.dumps(meta(), ensure_ascii=False))
        if path in ('/', '/index.html'): path = '/index.html'
        fn = os.path.normpath(os.path.join(STATIC, path.lstrip('/')))
        if not fn.startswith(STATIC) or not os.path.isfile(fn):
            return self._send(404, json.dumps(dict(error='not found')))
        ext = os.path.splitext(fn)[1]
        with open(fn, 'rb') as f: data = f.read()
        if ext == '.gz':                       # محرّك DWG مخزون مضغوطاً (10م → 2.3م)
            inner = os.path.splitext(fn)[0]
            ctype = MIME.get(os.path.splitext(inner)[1], 'application/octet-stream')
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'public, max-age=604800')
            self.end_headers()
            try: return self.wfile.write(data)
            except BrokenPipeError: return
        self._send(200, data, MIME.get(ext, 'application/octet-stream'))

    def do_POST(self):
        path = self.path.split('?')[0]
        name = path[5:] if path.startswith('/api/') else ''
        if name not in ROUTES and name not in ('dxf', 'bbs/csv'):
            return self._send(404, json.dumps(dict(error='unknown endpoint: %s' % name)))
        try:
            n = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(n) or b''
            zipped = (self.headers.get('Content-Encoding') or '').lower() == 'gzip'
            payload = json.loads((gzip.decompress(raw) if zipped else raw) or b'{}')
            if name == 'cad/read':
                payload = _cad_cache(payload, raw if zipped else None)
                if payload is None:                    # إعادة تحليل بمفتاح انتهى من الذاكرة
                    return self._send(409, json.dumps(dict(error='cache_miss')))
            if name == 'bbs/csv':
                body = BBS.csv(payload if 'model' in payload else PJ.wizard(payload))
                data = ('\ufeff' + body).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="bbs.csv"')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            if name == 'dxf':
                if 'grid' not in payload:          # يقبل مدخلات المعالج مباشرة
                    payload = PJ.wizard(payload)
                body = (DXF.rebar_details(payload) if self.path.endswith('kind=rebar')
                        else DXF.foundation_plan(payload))
                self.send_response(200)
                self.send_header('Content-Type', 'application/dxf')
                self.send_header('Content-Disposition', 'attachment; filename="foundation.dxf"')
                data = body.encode('utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            out = ROUTES[name](payload)
            self._send(200, json.dumps(out, ensure_ascii=False, default=float))
        except Exception as ex:
            traceback.print_exc()
            self._send(400, json.dumps(dict(error=str(ex), type=type(ex).__name__),
                                       ensure_ascii=False))

# ذاكرة ملفات الأوتوكاد: الرفع مرة واحدة، وإعادة التحليل (تعديل ارتفاع/نوع لوحة) ترسل
# الخيارات فقط. تُحفظ البيانات مضغوطة (بضع ميغا) لآخر 4 ملفات.
_CAD = OrderedDict()
_CAD_LOCK = threading.Lock()


def _cad_cache(payload, gz_raw):
    key = str(payload.get('key') or '')[:128]
    if payload.get('ents') is not None:
        if key:
            blob = gz_raw if gz_raw is not None else gzip.compress(
                json.dumps(payload, ensure_ascii=False).encode('utf-8'), 3)
            with _CAD_LOCK:
                _CAD[key] = blob
                _CAD.move_to_end(key)
                while len(_CAD) > 4:
                    _CAD.popitem(last=False)
        return payload
    with _CAD_LOCK:
        blob = _CAD.get(key) if key else None
        if blob is not None:
            _CAD.move_to_end(key)
    if blob is None:
        return None
    full = json.loads(gzip.decompress(blob))
    full['opts'] = payload.get('opts')
    return full


if __name__ == '__main__':
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), H)
    print("Civil Engineering platform  →  http://0.0.0.0:%d" % PORT, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
