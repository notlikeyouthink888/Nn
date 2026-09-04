/* قراءة مخططات AutoCAD داخل المتصفح.
   DWG → محرّك LibreDWG المُصرَّف إلى WebAssembly (يُحمَّل كسولاً عند أول استعمال)
   DXF → قارئ أزواج «رمز، قيمة» مختصر هنا
   المخرج بالصيغة الموحّدة التي يحلّلها civil/plan.py — الملف لا يغادر جهازك. */

const PlanIO = (() => {
  const WASM = '/vendor/libredwg/wasm/libredwg-web.wasm.gz';
  const GLUE = '/vendor/libredwg/dist/libredwg-web.js';
  let eng = null, loading = null;

  /* أنواع لا تفيد التحليل الإنشائي وتضخّم الحمولة */
  const SKIP = new Set(['HATCH', 'DIMENSION', 'VIEWPORT', 'XLINE', 'RAY',
                        'SOLID', 'LEADER', 'MLEADER', 'SPLINE', 'IMAGE']);

  async function engine(onProgress) {
    if (eng) return eng;
    if (loading) return loading;
    loading = (async () => {
      onProgress && onProgress('تحميل محرّك قراءة DWG (مرة واحدة فقط)…');
      const mod = await import(GLUE);
      // المتصفح يفك ضغط gzip تلقائياً حسب ترويسة Content-Encoding
      const res = await fetch(WASM);
      if (!res.ok) throw new Error('تعذّر تحميل محرّك DWG (' + res.status +
        ') — تقدر تصدّر المخطط من الأوتوكاد بصيغة DXF وترفعه بدلاً عنه');
      const wasmBinary = await res.arrayBuffer();
      onProgress && onProgress('تهيئة المحرّك…');
      const inst = await mod.createModule({ wasmBinary });
      eng = { dwg: mod.LibreDwg.createByWasmInstance(inst), T: mod.Dwg_File_Type };
      return eng;
    })();
    return loading;
  }

  /* ---------------------------- DWG ---------------------------- */
  async function parseDWG(buf, onProgress) {
    const { dwg, T } = await engine(onProgress);
    onProgress && onProgress('قراءة الملف…');
    const ptr = dwg.dwg_read_data(buf, T.DWG);
    const db = dwg.convert(ptr);
    try { dwg.dwg_free(ptr); } catch (e) { /* لا يضر */ }
    return normalize(db, 'dwg');
  }

  function normalize(db, source) {
    const ents = [], layers = {};
    (db.tables?.LAYER?.entries || []).forEach(l => {
      layers[l.name] = { name: l.name, color: l.colorIndex ?? 7, n: 0 };
    });
    const push = (t, lay, p, extra) => {
      const e = { t, l: lay || '0', p };
      if (extra) Object.assign(e, extra);
      ents.push(e);
      (layers[e.l] = layers[e.l] || { name: e.l, color: 7, n: 0 }).n++;
    };
    for (const e of (db.entities || [])) {
      if (SKIP.has(e.type)) continue;
      const lay = e.layer;
      switch (e.type) {
        case 'LINE':
          if (e.startPoint && e.endPoint)
            push('L', lay, [e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y]);
          break;
        case 'LWPOLYLINE': case 'POLYLINE': {
          const vs = e.vertices || [];
          if (vs.length < 2) break;
          const p = []; vs.forEach(v => p.push(v.x, v.y));
          push('P', lay, p, { closed: !!(e.closed ?? (e.flag & 1)) });
          break;
        }
        case 'CIRCLE':
          if (e.center) push('C', lay, [e.center.x, e.center.y, e.radius || 0]);
          break;
        case 'ARC':
          if (e.center) push('A', lay, [e.center.x, e.center.y, e.radius || 0,
            (e.startAngle || 0) * 180 / Math.PI, (e.endAngle || 0) * 180 / Math.PI]);
          break;
        case 'TEXT': case 'MTEXT': {
          const q = e.startPoint || e.insertionPoint;
          if (q) push('T', lay, [q.x, q.y, e.textHeight || e.height || 0.25],
                      { s: String(e.text || '').slice(0, 60) });
          break;
        }
        case 'INSERT':
          if (e.insertionPoint) push('C', lay, [e.insertionPoint.x, e.insertionPoint.y, 0]);
          break;
      }
    }
    return { source: source, insunits: db.header?.INSUNITS ?? 4, ents: ents,
             layers: Object.values(layers).filter(l => l.n > 0).sort((a, b) => b.n - a.n) };
  }

  /* ---------------------------- DXF ---------------------------- */
  function parseDXF(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const ents = [], layers = {};
    let sec = null, kind = null, cur = null, insunits = 4, hvar = null;
    const flush = () => {
      const e = finish(cur, kind);
      if (e) { ents.push(e); (layers[e.l] = layers[e.l] || { name: e.l, color: 7, n: 0 }).n++; }
      cur = null; kind = null;
    };
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i].trim(), 10);
      const val = lines[i + 1].trim();
      if (isNaN(code)) continue;
      if (code === 0) {
        if (sec === 'ENTITIES') flush();
        if (val === 'SECTION') { sec = '?'; continue; }
        if (val === 'ENDSEC') { sec = null; continue; }
        if (val === 'EOF') break;
        if (sec === 'ENTITIES') { kind = val; cur = { layer: '0', x: [], y: [] }; }
        continue;
      }
      if (sec === '?' && code === 2) { sec = val; continue; }
      if (sec === 'HEADER') {
        if (code === 9) hvar = val;
        else if (hvar === '$INSUNITS' && code === 70) insunits = parseInt(val, 10) || 4;
        continue;
      }
      if (sec === 'ENTITIES' && cur) {
        const f = parseFloat(val);
        if (code === 8) cur.layer = val;
        else if (code === 10 || code === 11) cur.x.push(f);
        else if (code === 20 || code === 21) cur.y.push(f);
        else if (code === 40) cur.r = f;
        else if (code === 50) cur.a0 = f;
        else if (code === 51) cur.a1 = f;
        else if (code === 70) cur.flag = parseInt(val, 10) || 0;
        else if (code === 1 || code === 3) cur.text = (cur.text || '') + val;
      }
    }
    if (sec === 'ENTITIES') flush();
    return { source: 'dxf', insunits: insunits, ents: ents,
             layers: Object.values(layers).sort((a, b) => b.n - a.n) };
  }

  function finish(cur, kind) {
    if (!cur || !kind) return null;
    const L = cur.layer, x = cur.x, y = cur.y;
    if (kind === 'LINE' && x.length >= 2 && y.length >= 2)
      return { t: 'L', l: L, p: [x[0], y[0], x[1], y[1]] };
    if ((kind === 'LWPOLYLINE' || kind === 'POLYLINE') && x.length >= 2) {
      const n = Math.min(x.length, y.length), p = [];
      for (let i = 0; i < n; i++) p.push(x[i], y[i]);
      return { t: 'P', l: L, p: p, closed: !!((cur.flag || 0) & 1) };
    }
    if (kind === 'CIRCLE' && x.length && y.length)
      return { t: 'C', l: L, p: [x[0], y[0], cur.r || 0] };
    if (kind === 'ARC' && x.length && y.length)
      return { t: 'A', l: L, p: [x[0], y[0], cur.r || 0, cur.a0 || 0, cur.a1 || 360] };
    if ((kind === 'TEXT' || kind === 'MTEXT') && x.length && y.length)
      return { t: 'T', l: L, p: [x[0], y[0], cur.r || 0.25], s: (cur.text || '').slice(0, 60) };
    if (kind === 'INSERT' && x.length && y.length)
      return { t: 'C', l: L, p: [x[0], y[0], 0] };
    return null;
  }

  /* ------------------------- الواجهة ------------------------- */
  async function read(file, onProgress) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.dxf')) {
      onProgress && onProgress('قراءة DXF…');
      return parseDXF(await file.text());
    }
    return parseDWG(await file.arrayBuffer(), onProgress);
  }

  return { read, parseDXF, parseDWG, engine };
})();
