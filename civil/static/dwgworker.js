/* قراءة ملف DWG/DXF داخل Web Worker مستقل — لقسم الأوتوكاد.
   ليش؟ ملف مستشفى 10 ميغا = 330 ألف عنصر: محرّك LibreDWG (WebAssembly) يحوّل الملف كاملاً
   لكائنات، وذاكرة المحرّك لا ترجع للنظام أبداً ما دام حيّاً. بالخيط الرئيسي كان هذا يوصّل
   الصفحة لـ 1.2 غيغا فيقتلها متصفح الموبايل. هنا:
     ١) نفس قارئ plan.js (نفس النتيجة حرفياً) يشتغل بالعامل،
     ٢) العناصر تتحوّل لـ JSON على دفعات وتُضغط gzip مباشرة (بلا نص 40 ميغا بالذاكرة)،
     ٣) يُرجَع للصفحة ~6 ميغا مضغوطة + ملخص صغير، ثم تُنهى العامل فتتحرّر كل ذاكرته. */
let PIO = null;
async function planio() {
  if (PIO) return PIO;
  const src = await (await fetch('/plan.js')).text();
  PIO = new Function(src + '\n;return PlanIO;')();
  return PIO;
}

async function gzipEnts(r, post) {
  const cs = new CompressionStream('gzip'), w = cs.writable.getWriter(), rd = cs.readable.getReader();
  const out = []; let bytes = 0;
  const pump = (async () => { for (;;) { const { done, value } = await rd.read(); if (done) break; out.push(value); } })();
  const enc = new TextEncoder(), ents = r.ents, n = ents.length, B = 5000;
  await w.write(enc.encode('"ents":['));
  for (let i = 0; i < n; i += B) {
    const parts = [];
    for (let j = i; j < Math.min(n, i + B); j++) parts.push(JSON.stringify(ents[j]));
    const s = (i ? ',' : '') + parts.join(',');
    bytes += s.length;
    await w.write(enc.encode(s));
    ents.fill(null, i, Math.min(n, i + B));                   // حرّر ما كُتب
    if (i % 50000 === 0) post({ type: 'progress', text: `تجهيز العناصر للرفع… ${Math.round(100 * i / n)}%` });
  }
  await w.write(enc.encode('],"layers":' + JSON.stringify(r.layers || []) + ',"insunits":' + JSON.stringify(r.insunits ?? 4)));
  await w.close(); await pump;
  const buf = await new Blob(out).arrayBuffer();
  return { buf, rawBytes: bytes };
}

self.onmessage = async ev => {
  const post = m => self.postMessage(m);
  try {
    const { buf, name } = ev.data;
    const P = await planio();
    let r;
    if (String(name || '').toLowerCase().endsWith('.dxf')) {
      post({ type: 'progress', text: 'قراءة DXF…' });
      r = P.parseDXFFull(new TextDecoder().decode(buf));
    } else {
      r = await P.parseDWGFull(buf, t => post({ type: 'progress', text: t }));
    }
    const n = (r.ents || []).length;
    if (!n) { post({ type: 'done', empty: true }); return; }
    post({ type: 'progress', text: `تجهيز ${n.toLocaleString('en-US')} عنصر للرفع…` });
    const { buf: gz, rawBytes } = await gzipEnts(r, post);
    post({ type: 'done', gz, meta: { n, rawBytes, gzBytes: gz.byteLength, insunits: r.insunits, truncated: r.truncated,
      bad: r.bad, collapsed: r.collapsed || [], layers: r.layers || [] } }, [gz]);
  } catch (e) {
    post({ type: 'error', message: String((e && e.message) || e) });
  }
};
