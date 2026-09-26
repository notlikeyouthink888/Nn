/* قراءة مخططات AutoCAD داخل المتصفح.
   DWG → محرّك LibreDWG المُصرَّف إلى WebAssembly (يُحمَّل كسولاً عند أول استعمال)
   DXF → قارئ أزواج «رمز، قيمة» مختصر هنا
   المخرج بالصيغة الموحّدة التي يحلّلها civil/plan.py — الملف لا يغادر جهازك. */

const PlanIO = (() => {
  const WASM = '/vendor/libredwg/wasm/libredwg-web.wasm.gz';
  const GLUE = '/vendor/libredwg/dist/libredwg-web.js';
  let eng = null, loading = null;

  /* أنواع لا تفيد التحليل الإنشائي وتضخّم الحمولة.
     DIMENSION مستثناة عمداً: المسافات مكتوبة بالمخطط وهي أقوى دليل على المقياس.
     HATCH كذلك مستثناة: المساحات المظلَّلة هي كيف تُرسم الأعمدة والجدران
     بالمخططات الإنشائية، وحدودها تعطي مقطع العمود بالضبط. */
  const SKIP = new Set(['VIEWPORT', 'XLINE', 'RAY',
                        'LEADER', 'MLEADER', 'SPLINE', 'IMAGE']);

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
        case 'HATCH': case 'SOLID': {
          // حدود المساحة المظلَّلة = محيط العنصر المصمت (عمود · جدار · نواة)
          for (const bp of (e.boundaryPaths || e.paths || [])) {
            const p = [];
            for (const ed of (bp.edges || [])) {
              if (ed.start) p.push(ed.start.x, ed.start.y);
              else if (ed.center && ed.radius) {          // حافة قوسية
                p.push(ed.center.x + ed.radius, ed.center.y);
              }
            }
            if (bp.vertices) for (const v of bp.vertices) p.push(v.x, v.y);
            if (p.length >= 6) push('P', lay, p, { closed: true, hatch: 1 });
          }
          break;
        }
        case 'DIMENSION': {
          // القياس المكتوب + طرفا المسافة المقيسة — منه يُعرف المقياس يقيناً
          const a = e.subDefinitionPoint1, b2 = e.subDefinitionPoint2;
          const m = e.measurement;
          if (a && b2 && m > 0)
            push('D', lay, [a.x, a.y, b2.x, b2.y], { m: m, s: String(e.text || '') });
          break;
        }
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

  /* =================== القراءة الأمينة (قسم الأوتوكاد) ===================
     المسار أعلاه يبقى كما هو حرفياً لأجل المعالج. هذا مسار ثانٍ أوفى:
       • فضاء النموذج فقط (سجل *Model_Space) — لوحات الورق وإطاراتها خارج الرسم.
       • البلوكات تُفكّ إلى عناصرها الحقيقية: عمود مرسوم بلوكاً «col 60x60» يصير
         مستطيله الفعلي بمكانه، مع اسم البلوك ورقم الإدراج ليبقى وحدة واحدة.
       • النص كاملاً بعد إزالة رموز تنسيق MTEXT (كانت تأكل ثلث الستين حرفاً فيضيع
         اسم الطابق من العنوان)، مع دورانه — منه اتجاه قضبان البلاطة.
       • نوع الخط محسوماً (CENTER/HIDDEN…) — الخط المخفي جسرٌ تحت البلاطة.
       • POLYLINE2D/3D تُقرأ (كانت تُسقَط)، والإغلاق من البت الصحيح 512. */
  const MT_CODES = /\\[ACcFfHhLlOoKkQqTtWwpS][^;\\]*;|\\[LlOoKkPpNn~]|[{}]/g;
  function cleanMText(s) {
    return String(s || '')
      .replace(/\\P/g, ' ')
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\S([^;^]*)\^([^;]*);/g, '$1/$2')          // كسور مكدّسة
      .replace(MT_CODES, '')
      .replace(/\\\\/g, '\\')
      .replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  const R2D = 180 / Math.PI;

  function normalizeFull(db, source) {
    const ents = [], layers = {}, blocks = {};
    const brs = db.tables?.BLOCK_RECORD?.entries || [];
    const byName = {};
    brs.forEach(r => { if (r && r.name) byName[r.name] = r; });
    const layTab = {};
    (db.tables?.LAYER?.entries || []).forEach(l => {
      layTab[l.name] = l;
      layers[l.name] = { name: l.name, color: l.colorIndex ?? 7, n: 0, lt: l.lineType || '' };
    });
    const hidden = name => { const l = layTab[name]; return !!(l && (l.frozen || l.off)); };
    const ms = brs.find(r => (r.name || '').toUpperCase() === '*MODEL_SPACE');
    const top = ms ? (ms.entities || []) : (db.entities || []);
    const LIMIT = 600000, BUDGET = 350000;
    let nIns = 0, truncated = false;
    // ميزانية الفكّ: الملفات الضخمة (مستشفى 10 ميغا: أبواب وأشجار وأثاث بآلاف النسخ) تُفكّ
    // بلوكاتها الزخرفية الأثقل إلى نقطة واحدة بدل عشرات الخطوط — العناصر العليا لا تُقصّ أبداً،
    // وبلوكات الأعمدة والمحاور والمناسيب والعناوين تُفكّ دائماً.
    const KEEP_BLK = /col|colum|axis|axes|grid|beam|foot|level|lvl|sec|elev|title|board|frame|mark|bubble|عمود|محور|منسوب|جسر/i;
    const collapsed = new Set(), memo = {};
    const nOf = (e) => Math.max(1, e.columnCount || 1) * Math.max(1, e.rowCount || 1);
    const size = (name, d) => {
      if (collapsed.has(name)) return 1;
      if (memo[name] != null) return memo[name];
      const blk = byName[name];
      if (!blk || d > 6) return 1;
      memo[name] = 1;
      let n = 0;
      for (const be of (blk.entities || [])) {
        if (be.type === 'INSERT') n += size(be.name, d + 1) * nOf(be) + (be.attribs || []).length;
        else if (!SKIP.has(be.type) && be.type !== 'ATTDEF') n++;
      }
      return (memo[name] = Math.max(1, n));
    };
    const smallText = name => { const b = byName[name]; const es = (b && b.entities) || [];
      return es.length <= 30 && es.some(x => x.type === 'TEXT' || x.type === 'MTEXT' || x.type === 'ATTDEF'); };
    const insLay = {};
    for (const e of top) if (e.type === 'INSERT' && !(e.name in insLay)) insLay[e.name] = e.layer || '';
    for (let it = 0; it < 400; it++) {
      for (const k in memo) delete memo[k];
      const topCnt = {}; let total = 0;
      for (const e of top) {
        if (e.type === 'INSERT') { const n = size(e.name, 0) * nOf(e) + (e.attribs || []).length; total += n;
          if (!collapsed.has(e.name)) topCnt[e.name] = (topCnt[e.name] || 0) + n; }
        else total++;
      }
      if (total <= BUDGET) break;
      let best = null;
      for (const k in topCnt) {
        if (!byName[k] || KEEP_BLK.test(k) || KEEP_BLK.test(insLay[k] || '') || smallText(k)) continue;
        if (!best || topCnt[k] > topCnt[best]) best = k;
      }
      if (!best || topCnt[best] < 50) break;
      collapsed.add(best);
    }
    const LT_KEEP = /CENTER|DASH|HIDDEN|PHANTOM|DOT|DIVIDE|BORDER/i;

    // تحويل تآلفي [a,b,c,d,tx,ty]: x' = a·x + c·y + tx ، y' = b·x + d·y + ty
    const ID = [1, 0, 0, 1, 0, 0];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
                           m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
                           m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const rotOf = m => Math.atan2(m[1], m[0]) * R2D;
    const sclOf = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const mirrored = m => (m[0] * m[3] - m[1] * m[2]) < 0;
    const ocs = e => (e.extrusionDirection && e.extrusionDirection.z < 0) ? [-1, 0, 0, 1, 0, 0] : ID;

    const push = (t, lay, p, extra) => {
      if (ents.length >= LIMIT) { truncated = true; return; }
      const e = { t, l: lay || '0', p };             // الإحداثيات كما هي — التدوير يغيّر نتائج حدّية (يكفي الضغط)
      if (extra) {
        Object.assign(e, extra);
        if (e.lt !== undefined && !LT_KEEP.test(e.lt)) delete e.lt;   // «Continuous» لا يعني شيئاً — يُحذف لتصغير الرفع
      }
      ents.push(e);
      (layers[e.l] = layers[e.l] || { name: e.l, color: 7, n: 0, lt: '' }).n++;
    };

    function emit(e, m, ctx, depth) {
      if (!e || SKIP.has(e.type)) return;
      // الطبقة «0» داخل البلوك ترث طبقة الإدراج (قاعدة الأوتوكاد)
      const lay = (ctx.lay && (!e.layer || e.layer === '0')) ? ctx.lay : (e.layer || '0');
      if (hidden(lay)) return;
      let lt = e.lineType || '';
      if (!lt || /^bylayer$/i.test(lt)) lt = (layTab[lay] && layTab[lay].lineType) || '';
      if (/^byblock$/i.test(lt)) lt = ctx.lt || '';
      const ex = { lt: lt };
      if (ctx.blk) { ex.blk = ctx.blk; ex.bi = ctx.bi; }
      const mo = mul(m, ocs(e));
      switch (e.type) {
        case 'LINE':
          if (e.startPoint && e.endPoint) {
            const a = ap(m, e.startPoint.x, e.startPoint.y), b = ap(m, e.endPoint.x, e.endPoint.y);
            push('L', lay, [a[0], a[1], b[0], b[1]], ex);
          }
          break;
        case 'LWPOLYLINE': case 'POLYLINE2D': case 'POLYLINE3D': case 'POLYLINE': {
          const vs = e.vertices || [];
          if (vs.length < 2) break;
          const mm = e.type === 'LWPOLYLINE' ? mo : m;
          const p = []; vs.forEach(v => { const q = ap(mm, v.x, v.y); p.push(q[0], q[1]); });
          const closed = e.type === 'LWPOLYLINE' ? !!((e.flag || 0) & 512) : !!((e.flag || 0) & 1);
          push('P', lay, p, Object.assign({ closed: closed }, ex));
          break;
        }
        case 'CIRCLE':
          if (e.center) {
            const c = ap(mo, e.center.x, e.center.y);
            push('C', lay, [c[0], c[1], (e.radius || 0) * sclOf(m)], ex);
          }
          break;
        case 'ARC':
          if (e.center) {
            const c = ap(mo, e.center.x, e.center.y), r0 = rotOf(mo);
            let a0 = (e.startAngle || 0) * R2D, a1 = (e.endAngle || 0) * R2D;
            if (mirrored(mo)) { const t0 = 180 - a1, t1 = 180 - a0; a0 = t0; a1 = t1; }
            push('A', lay, [c[0], c[1], (e.radius || 0) * sclOf(m), a0 + r0, a1 + r0], ex);
          }
          break;
        case 'TEXT': case 'MTEXT': case 'ATTRIB': {
          let q, rot, h, s;
          if (e.type === 'ATTRIB') {
            const t = e.text || {};
            if (e.flags & 1) break;                               // صفة مخفية
            q = (t.halign || t.valign) && t.endPoint && (t.endPoint.x || t.endPoint.y) ? t.endPoint : t.startPoint;
            rot = (t.rotation || 0) * R2D; h = t.textHeight || 0.25; s = t.text;
            if (e.tag) ex.tag = e.tag;
            // ATTRIB بإحداثيات العالم أصلاً — لا يُطبَّق عليه تحويل البلوك
            if (q) push('T', lay, [q.x, q.y, h], Object.assign({ s: cleanMText(s), rot: rot }, ex));
            break;
          }
          if (e.type === 'MTEXT') {
            q = e.insertionPoint; h = e.textHeight || e.height || 0.25; s = e.text;
            rot = e.direction ? Math.atan2(e.direction.y, e.direction.x) * R2D : (e.rotation || 0) * R2D;
            if (e.attachmentPoint) ex.ap = e.attachmentPoint;
          } else {
            const al = (e.halign || e.valign) && e.endPoint && (e.endPoint.x || e.endPoint.y);
            q = al ? e.endPoint : e.startPoint; h = e.textHeight || 0.25; s = e.text;
            rot = (e.rotation || 0) * R2D;
          }
          if (!q) break;
          const w = ap(m, q.x, q.y);
          push('T', lay, [w[0], w[1], h * sclOf(m)], Object.assign({ s: cleanMText(s), rot: rot + rotOf(m) }, ex));
          break;
        }
        case 'HATCH': case 'SOLID': {
          for (const bp of (e.boundaryPaths || e.paths || [])) {
            const p = [];
            for (const ed of (bp.edges || [])) {
              if (ed.start) { const q = ap(mo, ed.start.x, ed.start.y); p.push(q[0], q[1]); }
              else if (ed.center && ed.radius) { const q = ap(mo, ed.center.x + ed.radius, ed.center.y); p.push(q[0], q[1]); }
            }
            if (bp.vertices) for (const v of bp.vertices) { const q = ap(mo, v.x, v.y); p.push(q[0], q[1]); }
            if (p.length >= 6) push('P', lay, p, Object.assign({ closed: true, hatch: 1 }, ex));
          }
          break;
        }
        case 'DIMENSION': {
          const a = e.subDefinitionPoint1, b2 = e.subDefinitionPoint2, mv = e.measurement;
          if (a && b2 && mv > 0) {
            const A = ap(m, a.x, a.y), B = ap(m, b2.x, b2.y);
            const txt = String(e.text || '');
            push('D', lay, [A[0], A[1], B[0], B[1]], Object.assign({ m: mv, s: txt === '<>' ? '' : cleanMText(txt) }, ex));
          }
          break;
        }
        case 'INSERT': {
          const blk = byName[e.name];
          const ip = e.insertionPoint || { x: 0, y: 0 };
          if (collapsed.has(e.name)) (blocks[e.name] = blocks[e.name] || { name: e.name, n: 0 }).n++;
          if (!blk || depth >= 6 || collapsed.has(e.name)) { const w = ap(m, ip.x, ip.y); push('C', lay, [w[0], w[1], 0], Object.assign({ blk: e.name }, ex)); break; }
          const base = blk.basePoint || { x: 0, y: 0 };
          const sx = e.xScale || 1, sy = e.yScale || 1, r = e.rotation || 0;
          const cs = Math.cos(r), sn = Math.sin(r);
          const nc = Math.max(1, e.columnCount || 1), nr = Math.max(1, e.rowCount || 1);
          const bi = ++nIns;
          const info = blocks[e.name] = blocks[e.name] || { name: e.name, n: 0 };
          info.n++;
          for (let ci = 0; ci < nc; ci++) for (let ri = 0; ri < nr; ri++) {
            const ox = ci * (e.columnSpacing || 0), oy = ri * (e.rowSpacing || 0);
            // ins · R(r) · (S(sx,sy)·(p − base) + (ox,oy))
            const L = [cs * sx, sn * sx, -sn * sy, cs * sy,
                       ip.x + cs * (ox - sx * base.x) - sn * (oy - sy * base.y),
                       ip.y + sn * (ox - sx * base.x) + cs * (oy - sy * base.y)];
            const M2 = mul(m, mul(ocs(e), L));
            const sub = { lay: lay, lt: lt, blk: ctx.blk || e.name, bi: ctx.blk ? ctx.bi : bi };
            for (const be of (blk.entities || [])) if (be.type !== 'ATTDEF') emit(be, M2, sub, depth + 1);
          }
          for (const at of (e.attribs || [])) emit(at, ID, { lay: lay, blk: e.name, bi: bi }, depth + 1);
          break;
        }
      }
    }
    for (const e of top) emit(e, ID, {}, 0);
    const hdr = db.header || {};
    return { source: source, mode: 'full', insunits: hdr.INSUNITS ?? 4,
             dimlfac: hdr.DIMLFAC ?? null, ents: ents, truncated: truncated,
             collapsed: [...collapsed].map(n => ({ name: n, n: (blocks[n] || {}).n || 0 })),
             blocks: Object.values(blocks).sort((a, b) => b.n - a.n),
             layers: Object.values(layers).filter(l => l.n > 0).sort((a, b) => b.n - a.n) };
  }

  async function parseDWGFull(buf, onProgress) {
    const { dwg, T } = await engine(onProgress);
    onProgress && onProgress('قراءة الملف…');
    const ptr = dwg.dwg_read_data(buf, T.DWG);
    const db = dwg.convert(ptr);
    try { dwg.dwg_free(ptr); } catch (e) { /* لا يضر */ }
    onProgress && onProgress('فكّ البلوكات وقراءة النصوص…');
    return normalizeFull(db, 'dwg');
  }

  /* DXF بالمستوى نفسه: قسم BLOCKS يُقرأ ويُفكّ عند كل INSERT، والنص كاملاً بدورانه،
     ونوع الخط (رمز 6) وجدول الطبقات (خط الطبقة). */
  function parseDXFFull(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i].trim(), 10);
      if (!isNaN(code)) pairs.push([code, lines[i + 1].replace(/\s+$/, '')]);
    }
    const header = {}, layTab = {}, blockDefs = {}, top = [];
    let sec = null, tbl = null, curBlock = null, obj = null, hvar = null;
    const newObj = t => ({ type: t, layer: '0', x: [], y: [], v: [] });
    const flushObj = () => {
      if (!obj) return;
      if (sec === 'TABLES' && obj.type === 'LAYER' && obj.name) layTab[obj.name] = obj;
      else if (sec === 'BLOCKS' && curBlock && obj.type !== 'BLOCK' && obj.type !== 'ENDBLK') curBlock.entities.push(obj);
      else if (sec === 'ENTITIES') top.push(obj);
      obj = null;
    };
    for (const [code, val] of pairs) {
      if (code === 0) {
        flushObj();
        if (val === 'SECTION') { sec = '?'; continue; }
        if (val === 'ENDSEC') { sec = null; continue; }
        if (val === 'EOF') break;
        if (sec === 'BLOCKS' && val === 'BLOCK') { curBlock = { name: '', base: { x: 0, y: 0 }, entities: [], _hdr: true }; continue; }
        if (sec === 'BLOCKS' && val === 'ENDBLK') { if (curBlock && curBlock.name) blockDefs[curBlock.name] = curBlock; curBlock = null; continue; }
        if (curBlock && curBlock._hdr) curBlock._hdr = false;
        obj = newObj(val);
        continue;
      }
      if (sec === '?' && code === 2) { sec = val; continue; }
      if (sec === 'HEADER') {
        if (code === 9) hvar = val;
        else if (hvar === '$INSUNITS' && code === 70) header.INSUNITS = parseInt(val, 10);
        else if (hvar === '$DIMLFAC' && code === 40) header.DIMLFAC = parseFloat(val);
        continue;
      }
      if (curBlock && curBlock._hdr) {                     // ترويسة BLOCK نفسها
        if (code === 2) curBlock.name = val;
        else if (code === 10) curBlock.base.x = parseFloat(val);
        else if (code === 20) curBlock.base.y = parseFloat(val);
        continue;
      }
      if (!obj) continue;
      const f = parseFloat(val);
      switch (code) {
        case 8: obj.layer = val; break;
        case 6: obj.lt = val; break;
        case 2: obj.name = val; break;
        case 1: case 3: obj.text = (obj.text || '') + val; break;
        case 10: obj.x.push(f); break;
        case 20: obj.y.push(f); break;
        case 11: obj.x2 = f; break;
        case 21: obj.y2 = f; break;
        case 40: obj.r = f; break;
        case 41: obj.sx = f; break;
        case 42: obj.sy = f; break;
        case 50: obj.a0 = f; break;
        case 51: obj.a1 = f; break;
        case 62: obj.color = parseInt(val, 10); break;
        case 70: obj.flag = parseInt(val, 10) || 0; break;
        case 71: obj.attach = parseInt(val, 10) || 0; break;
        case 72: obj.halign = parseInt(val, 10) || 0; break;
        case 73: obj.valign = parseInt(val, 10) || 0; break;
        case 230: obj.ez = f; break;                      // محور البثق Z (سالب = معكوس)
      }
      if (obj.type === 'LAYER' && code === 2) obj.name = val;
      if (obj.type === 'LAYER' && code === 6) obj.lineType = val;
      if (obj.type === 'LAYER' && code === 70) obj.frozen = !!(parseInt(val, 10) & 1);
      if (obj.type === 'LAYER' && code === 62) obj.off = parseInt(val, 10) < 0;
    }
    flushObj();
    // تحويل كائنات DXF الخام إلى شكل كائنات المحرّك ثم نفس normalizeFull
    const conv = o => {
      const P = (i) => ({ x: o.x[i] || 0, y: o.y[i] || 0 });
      const b = { type: o.type, layer: o.layer, lineType: o.lt || '' };
      if (o.ez != null && o.ez < 0) b.extrusionDirection = { x: 0, y: 0, z: -1 };
      switch (o.type) {
        case 'LINE': b.startPoint = P(0); b.endPoint = o.x2 != null ? { x: o.x2, y: o.y2 } : P(1); break;
        case 'LWPOLYLINE': b.vertices = o.x.map((_, i) => P(i)); b.flag = (o.flag & 1) ? 512 : 0; break;
        case 'CIRCLE': b.center = P(0); b.radius = o.r || 0; break;
        case 'ARC': b.center = P(0); b.radius = o.r || 0; b.startAngle = (o.a0 || 0) / R2D; b.endAngle = (o.a1 ?? 360) / R2D; break;
        case 'TEXT': b.startPoint = P(0); b.endPoint = o.x2 != null ? { x: o.x2, y: o.y2 } : null;
          b.textHeight = o.r || 0.25; b.rotation = (o.a0 || 0) / R2D; b.text = o.text; b.halign = o.halign; b.valign = o.valign; break;
        case 'MTEXT': b.insertionPoint = P(0); b.textHeight = o.r || 0.25; b.text = o.text;
          b.direction = o.x2 != null ? { x: o.x2, y: o.y2 } : { x: Math.cos((o.a0 || 0) / R2D), y: Math.sin((o.a0 || 0) / R2D) }; break;
        case 'INSERT': b.name = o.name; b.insertionPoint = P(0); b.xScale = o.sx || 1; b.yScale = o.sy || 1;
          b.rotation = (o.a0 || 0) / R2D; break;
        case 'ATTRIB': b.text = { text: o.text, startPoint: P(0), textHeight: o.r || 0.25, rotation: (o.a0 || 0) / R2D };
          b.flags = o.flag || 0; b.tag = o.name; break;
        default: return null;
      }
      return b;
    };
    // ATTRIB تتبع INSERT الذي قبلها مباشرةً
    const attach = list => {
      const out = [];
      for (const o of list) {
        if (o.type === 'ATTRIB' && out.length && out[out.length - 1].type === 'INSERT') {
          const a = conv(o); if (a) (out[out.length - 1].attribs = out[out.length - 1].attribs || []).push(a);
          continue;
        }
        if (o.type === 'SEQEND' || o.type === 'ATTRIB') continue;
        const c = conv(o); if (c) out.push(c);
      }
      return out;
    };
    const records = [{ name: '*Model_Space', entities: attach(top) }];
    for (const k in blockDefs) records.push({ name: k, basePoint: blockDefs[k].base, entities: attach(blockDefs[k].entities) });
    const db = { header: header, entities: records[0].entities,
                 tables: { BLOCK_RECORD: { entries: records },
                           LAYER: { entries: Object.values(layTab).map(l => ({ name: l.name, lineType: l.lineType || '',
                             frozen: !!l.frozen, off: !!l.off, colorIndex: Math.abs(l.color || 7) })) } } };
    return normalizeFull(db, 'dxf');
  }

  /* ------------------------- الواجهة ------------------------- */
  async function read(file, onProgress, opts) {
    const full = !!(opts && opts.full);
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.dxf')) {
      onProgress && onProgress('قراءة DXF…');
      const txt = await file.text();
      return full ? parseDXFFull(txt) : parseDXF(txt);
    }
    const buf = await file.arrayBuffer();
    return full ? parseDWGFull(buf, onProgress) : parseDWG(buf, onProgress);
  }

  return { read, parseDXF, parseDWG, parseDWGFull, parseDXFFull, normalizeFull, cleanMText, engine };
})();
