# -*- coding: utf-8 -*-
"""HTTP server for the civil engineering platform (stdlib only)."""
import json, os, sys, traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import engine as E
import found as FD
import earth as EW
import survey as SV
import project as PJ
import dxf as DXF

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, 'static')
PORT = int(os.environ.get('PORT', '5819'))
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.json': 'application/json; charset=utf-8'}

def meta():
    return dict(live=[dict(name=a, v=b) for a, b in E.LIVE],
                dens=[dict(name=a, v=b) for a, b in E.DENS],
                cities=[dict(name=k, Ss=v[0], S1=v[1]) for k, v in E.SEISMIC_CITIES.items()],
                systems=[dict(name=k, **v) for k, v in E.SYSTEMS.items()],
                bars=E.BARS, soils=[dict(name=n, qa=q, kind=k) for n, q, k in FD.SOILS],
                pile_types=FD.PILE_TYPES, version="2.0")

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
}

class H(BaseHTTPRequestHandler):
    server_version = "CivilEng/1.0"
    def log_message(self, fmt, *a):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % a))

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        if isinstance(body, str): body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
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
        self._send(200, data, MIME.get(ext, 'application/octet-stream'))

    def do_POST(self):
        path = self.path.split('?')[0]
        name = path[5:] if path.startswith('/api/') else ''
        if name not in ROUTES and name != 'dxf':
            return self._send(404, json.dumps(dict(error='unknown endpoint: %s' % name)))
        try:
            n = int(self.headers.get('Content-Length') or 0)
            payload = json.loads(self.rfile.read(n) or b'{}')
            if name == 'dxf':
                body = DXF.foundation_plan(payload)
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

if __name__ == '__main__':
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), H)
    print("Civil Engineering platform  →  http://0.0.0.0:%d" % PORT, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
