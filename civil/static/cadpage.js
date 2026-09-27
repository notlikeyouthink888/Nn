/* قسم «🧩 الأوتوكاد» — صفحة كاملة بالقائمة الجانبية (مثل «تحليل المشروع»).
   يرفع ملف DWG/DXF إنشائي متعدد اللوحات، يقرؤه القارئ الأمين (بلوكات مفكوكة، نصوص
   كاملة)، ويحلّله /api/cad/read: الرسمات والمحاور والعناوين والجداول والعناصر، ثم
   يركّب المبنى طابقاً طابقاً ويعرضه بعارض cad3d.js بمقاسات كل عنصر وحديده.
   كل نص قادم من الملف يُهرَّب قبل العرض. */
const CADPAGE = (() => {
  let RAW = null, RES = null, NAME = '', BI = 0, TAB = 'file', VIEW = null, BUSY = false;
  const OPTS = { merge: false, floor_h: {}, drawings: {}, definitions: [], qa: 150, LL: 3.0 };
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' :
    Number(x).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const AX = n => String(n || '').replace("'", '′');
  const bar = b => b ? b.n + 'Ø' + b.d : '—';
  const tie = t => t ? 'Ø' + t.d + '@' + t.s + (t.sets ? ' (' + t.sets + '/مجموعة)' : '') : '—';
  const KIND = { slab_rft: 'تسليح سقف', beams_key: 'مفتاح جسور', cols_key: 'مفتاح أعمدة', found: 'أساسات',
                 beam_sched: 'جدول جسور', col_sched: 'جدول أعمدة', section: 'مقطع', detail: 'تفصيلة',
                 elev: 'واجهة', site: 'موقع', arch: 'مسقط معماري', finish: 'مسقط تشطيبات/أثاث',
                 stair: 'تفصيلة درج', tank: 'خزان', fence: 'سور', joint: 'فاصل تمدد', landscape: 'تنسيق موقع' };
  const FLOORS = [['basement', 'السرداب'], ['ground', 'الأرضي'], ['mezzanine', 'الميزانين'], ['first', 'الأول'],
                  ['second', 'الثاني'], ['third', 'الثالث'], ['fourth', 'الرابع'], ['fifth', 'الخامس'],
                  ['sixth', 'السادس'], ['seventh', 'السابع'], ['eighth', 'الثامن'], ['ninth', 'التاسع'],
                  ['tenth', 'العاشر'], ['typical', 'المتكرر'], ['roof', 'السطح']];
  const TABS = [['file', '📂 الملف'], ['sheets', '🗺️ المخططات'], ['axes', '📏 المحاور'], ['tables', '📋 الجداول'], ['notes', '📝 الملاحظات'],
                ['floors', '🏢 الطوابق'], ['stairs', '🪜 الأدراج'], ['layers', '🧠 الطبقات والتعريفات'], ['3d', '🧊 المجسم 3D'],
                ['send', '📤 إرسال للتحليل']];

  function css() {
    if (q('#cadcss')) return;
    const st = document.createElement('style');
    st.id = 'cadcss';
    st.textContent = `
#cad .ctabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
#cad .nt{border-top:1px solid var(--line);padding:8px 0}
#cad .nt-t{font-size:13.5px;line-height:1.8;unicode-bidi:plaintext}
#cad .nt-m{margin-top:4px;display:flex;gap:4px;flex-wrap:wrap}
#cad .nt-o{font-size:11.5px;color:var(--mut);margin-top:3px;unicode-bidi:plaintext}
#cad .ctabs button{background:var(--panel2);border:1px solid var(--line);color:var(--tx);border-radius:10px;
  padding:7px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}
#cad .ctabs button.on{background:linear-gradient(135deg,#0ea5e9,#0891b2);border-color:transparent;color:#fff}
#cad .cp{display:none}#cad .cp.on{display:block}
#cad .kg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
#cad .sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
#cad .sheet{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px}
#cad .sheet svg{width:100%;height:auto;background:#0b1222;border-radius:8px;display:block}
#cad .sheet .t{font-size:11.5px;color:var(--mut);margin:6px 0;unicode-bidi:plaintext;text-align:left;direction:ltr}
#cad table{width:100%;border-collapse:collapse;font-size:12px}
#cad th,#cad td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:right;vertical-align:top}
#cad th{color:var(--mut);font-weight:600;position:sticky;top:0;background:var(--panel)}
#cad .scroll{max-height:420px;overflow:auto}
#cad .ltr{direction:ltr;unicode-bidi:plaintext}
#cad span.ltr,#cad b.ltr{display:inline-block}
#cad td.ltr{text-align:left;white-space:nowrap}
#cad .bar3d{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
#cad .bar3d button{background:var(--panel2);border:1px solid var(--line);color:var(--tx);border-radius:9px;
  padding:6px 11px;font-size:12px;cursor:pointer;font-family:inherit}
#cad .bar3d button.on{background:#0e7490;border-color:#22d3ee}
#cad .pick{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;
  font-size:12.5px;margin-top:8px;min-height:38px}
#cad .bsel button{margin:3px}
#cad .legend span{display:inline-flex;align-items:center;gap:5px;margin-left:12px;font-size:11.5px;color:var(--mut)}
#cad .legend i{width:14px;height:6px;border-radius:3px;display:inline-block}
#cad textarea{width:100%;min-height:90px;background:var(--bg2);color:var(--tx);border:1px solid var(--line);
  border-radius:9px;padding:8px;font-family:monospace;direction:ltr}
#cad .warn li{color:#fde68a;font-size:12.5px}
#cad input.sm{width:78px;padding:4px 6px;font-size:12px}
@media (max-width:560px){#cad .sg{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  function html() {
    return `<div id="cad">
      <div class="card"><h3>🧩 الأوتوكاد — اقرأ مجموعة مخططاتك وركّب المبنى</h3>
        <div class="f"><div><label>ملف DWG أو DXF إنشائي (عدة لوحات بملف واحد)</label>
          <input type="file" id="cad_file" accept=".dwg,.dxf" multiple></div></div>
        <div class="note" style="margin-top:6px">تقدر تختار <b>أكثر من ملف</b> مرة وحدة (معماري + إنشائي، أو مباني المشروع كلها) — تُدمج بمشروع واحد:
          لوحات المبنى الواحد تتجمّع بأسماء محاورها، والمباني المختلفة تظهر معاً بعرض «الموقع».
          <button class="btn gh" id="cad_add_btn" style="display:none;margin-inline-start:6px">➕ أضف ملفاً آخر للمشروع</button>
          <input type="file" id="cad_add" accept=".dwg,.dxf" multiple style="display:none"></div>
        <div id="cad_msg" class="note" style="margin-top:8px">ارفع ملف المخططات: لوحات تسليح السقوف،
          مفاتيح الجسور والأعمدة، وجداول الجسور والأعمدة — يُقرأ كل شي ويُركّب المبنى تلقائياً.</div></div>
      <div class="ctabs">${TABS.map(([k, t]) => `<button data-t="${k}" class="${k === TAB ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${TABS.map(([k]) => `<div class="cp${k === TAB ? ' on' : ''}" data-p="${k}"></div>`).join('')}
    </div>`;
  }

  function init() {
    css();
    const f = q('#cad_file');
    if (f) f.addEventListener('change', () => f.files && f.files.length && load(f.files, false));
    const ad = q('#cad_add'), ab = q('#cad_add_btn');
    if (ab && ad) ab.addEventListener('click', () => ad.click());
    if (ad) ad.addEventListener('change', () => ad.files && ad.files.length && load(ad.files, true));
    qa('#cad .ctabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.t)));
    render();
    // مغادرة الصفحة = تحرير العارض (لا يبقى WebGL معلّقاً)
    window.addEventListener('hashchange', () => { if (location.hash !== '#cad') drop3d(); });
  }

  function msg(s, cls) {
    const m = q('#cad_msg');
    if (m) { m.innerHTML = s; m.style.color = cls === 'bad' ? '#fca5a5' : ''; }
  }

  async function load(files, append) {
    if (BUSY) return;
    BUSY = true;
    try {
      files = files && files.length !== undefined ? Array.from(files) : [files];
      if (!append) RAWS = [];
      const bad = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i], tag = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
        msg(tag + 'قراءة ' + E(file.name) + '… (' + (file.size / 1048576).toFixed(2) + ' ميغا)');
        let r = null;
        try { r = await PlanIO.read(file, t => msg(tag + E(t)), { full: true }); } catch (e) { r = null; }
        if (!r || !r.ents || !r.ents.length) { bad.push(file.name); continue; }
        r.name = file.name;
        RAWS = RAWS.filter(x => x.name !== r.name).concat([r]);        // الملف نفسه مرتين = نسخة واحدة
      }
      if (!RAWS.length) throw new Error('الملف لا يحوي عناصر رسم مقروءة' + (bad.length > 1 ? ' (' + bad.map(E).join('، ') + ')' : ''));
      RAW = RAWS.length === 1 ? RAWS[0] : { ents: [].concat(...RAWS.map(r => r.ents)), collapsed: [].concat(...RAWS.map(r => r.collapsed || [])),
                                             layers: [].concat(...RAWS.map(r => r.layers || [])),
                                             truncated: RAWS.some(r => r.truncated) };
      NAME = RAWS.map(r => r.name).join(' + ');
      if (bad.length) msg('⚠️ تعذّرت قراءة: ' + bad.map(E).join('، ') + ' — أُكمل بالباقي.');
      const ab = q('#cad_add_btn'); if (ab) ab.style.display = '';
      SITE = false;
      KEY = [NAME, RAWS.length, Math.random().toString(36).slice(2)].join('|');
      SENT = false;
      Object.assign(OPTS, { merge: false, floor_h: {}, drawings: {}, definitions: [] });
      BI = 0;
      await run();
    } catch (e) {
      console.error(e);
      msg('✗ ' + E(e.message || e), 'bad');
    } finally { BUSY = false; }
  }

  async function run() {
    if (!RAW) return;
    msg('تحليل ' + RAW.ents.length.toLocaleString('en-US') + ' عنصر: المحاور، العناوين، الجداول، العناصر، ثم التركيب…');
    const t0 = performance.now();
    // الرفع مرة واحدة مضغوطاً؛ إعادة التحليل (تعديل ارتفاع/نوع لوحة) ترسل الخيارات فقط
    let r = null;
    // «Failed to fetch» = انقطع الاتصال قبل الرد (سيرفر أُعيد تشغيله/نفدت ذاكرته، أو شبكة الموبايل):
    // محاولة ثانية تلقائية بعد 4 ثوانٍ (الخدمة تعود خلال 3)، ثم رسالة واضحة بدل الخطأ الخام
    for (let attempt = 0; attempt < 2 && !r; attempt++) {
      try {
        r = SENT ? await post(false) : null;
        if (!r || r.status === 409) r = await post(true);
      } catch (e) {
        if (attempt === 0) { msg('⏳ انقطع الاتصال بالسيرفر أثناء التحليل — إعادة المحاولة…'); await new Promise(z => setTimeout(z, 4000)); SENT = false; continue; }
        throw new Error('انقطع الاتصال بالسيرفر قبل أن يرد (' + (e.message || e) + '). الأسباب المعتادة: ' +
          'السيرفر أُعيد تشغيله أو نفدت ذاكرته مع ملف ضخم، أو انقطعت شبكة الموبايل أثناء الرفع. ' +
          'حدّث السيرفر بآخر نسخة (الرفع صار مضغوطاً وأخفّ بكثير) ثم أعد المحاولة.');
      }
    }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('ردّ السيرفر غير مفهوم (الحالة ' + r.status + ')'); }
    if (r.ok) SENT = true;
    if (!r.ok) throw new Error(j.error || 'خطأ بالتحليل');
    RES = j;
    if (BI >= (RES.buildings || []).length) BI = 0;
    const B = cur();
    msg(RES.ok ? `✓ <b>${E(NAME)}</b> — ${RES.drawings.length} لوحة · ${RES.buildings.length} مبنى · ` +
        `${B ? B.floors.length : 0} طوابق · ${((performance.now() - t0) / 1000).toFixed(1)} ث`
      : '⚠️ قرأت الملف لكن ما قدرت أركّب مبنى — راجع التحذيرات بتبويب «الملف».', RES.ok ? '' : 'bad');
    drop3d();
    render();
  }

  let KEY = null, SENT = false, RAWS = [], SITE = false;
  async function post(full) {
    const body = !full ? { key: KEY, opts: OPTS }
      : RAWS.length > 1 ? { key: KEY, opts: OPTS, files: RAWS.map(r => ({ name: r.name, ents: r.ents, layers: r.layers, insunits: r.insunits })) }
      : { key: KEY, ents: RAW.ents, layers: RAW.layers, insunits: RAW.insunits, opts: OPTS };
    let data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (full && data.length > 200000 && window.CompressionStream) {
      try {
        const mb = (data.length / 1048576).toFixed(1);
        msg(`ضغط ${mb} ميغا قبل الرفع…`);
        const z = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        msg(`رفع ${(z.byteLength / 1048576).toFixed(1)} ميغا (بدل ${mb}) وتحليل ${RAW.ents.length.toLocaleString('en-US')} عنصر…`);
        data = z; headers['Content-Encoding'] = 'gzip';
      } catch (e) { /* متصفح بلا ضغط — يُرفع كما هو */ }
    }
    return fetch('/api/cad/read', { method: 'POST', headers, body: data });
  }

  const cur = () => RES && RES.buildings && RES.buildings[BI];

  function tab(t) {
    TAB = t;
    qa('#cad .ctabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    qa('#cad .cp').forEach(p => p.classList.toggle('on', p.dataset.p === t));
    if (t === '3d') show3d(); else if (VIEW) { /* يبقى مبنياً لكن لا يُرسم وهو مخفي */ }
    if (t === 'stairs' && !SVIEW && q('#cad_st3d')) showStair(STSEL);
  }

  function render() {
    const P = k => q(`#cad .cp[data-p="${k}"]`);
    if (!P('file')) return;
    if (!RES) {
      P('file').innerHTML = `<div class="card"><h3>ماذا يفهم هذا القسم؟</h3>${dictHtml(true)}</div>`;
      ['sheets', 'axes', 'tables', 'notes', 'floors', 'stairs', 'layers', '3d', 'send'].forEach(k =>
        P(k).innerHTML = '<div class="note">ارفع الملف أولاً.</div>');
      return;
    }
    P('file').innerHTML = fileTab();
    P('sheets').innerHTML = sheetsTab();
    P('axes').innerHTML = axesTab();
    P('tables').innerHTML = tablesTab();
    P('notes').innerHTML = notesTab();
    P('floors').innerHTML = floorsTab();
    P('stairs').innerHTML = stairsTab();
    P('layers').innerHTML = layersTab();
    P('3d').innerHTML = view3dTab();
    P('send').innerHTML = sendTab();
    bind();
    if (TAB === '3d') show3d();
  }

  const kpi = (l, v, c) => `<div class="kpi ${c || ''}"><div class="v">${v}</div><div class="l">${l}</div></div>`;

  function bsel() {
    const bs = RES.buildings || [];
    let h = '';
    if (bs.length > 1) {
      h += `<div class="bsel">المبنى: ${bs.map((b, i) => `<button class="btn ${i === BI && !SITE ? '' : 'gh'}" data-bi="${i}">
        ${E(b.name)}${b.file ? ' <small>(' + E(b.file) + ')</small>' : ''} · <span class="ltr">${E(b.axes_sig)}</span> · ${b.floors.map(f => E(f.name)).join('/')}</button>`).join('')}
        <button class="btn ${SITE ? '' : 'gh'}" data-site="1">🏘️ الموقع — كل المباني بمجسم واحد</button></div>`;
    }
    if (RES.can_merge || RES.merged) {
      h += `<div class="note" style="margin-top:6px">${RES.merged
        ? '🔗 اللوحات مدموجة مبنىً واحداً على شبكة محاور موحّدة.'
        : '💡 كل عناوين اللوحات تقول إنها <b>نفس المبنى</b> (' + E((RES.buildings[0] || {}).name) + ')، وأنظمة المحاور تشترك بأسمائها — ' +
          'تقدر تدمجها مبنىً واحداً بطوابقه كلها فوق بعض.'}
        <button class="btn gh" id="cad_merge" style="margin-inline-start:8px">${RES.merged ? '↩️ افصلها مباني' : '🔗 ادمجها مبنى واحد'}</button></div>`;
    }
    return h;
  }

  function fileTab() {
    const B = cur(), S = RES.schedules || {};
    const nC = B ? B.floors.reduce((a, f) => a + f.columns.length, 0) : 0;
    const nB = B ? B.floors.reduce((a, f) => a + f.beams.length, 0) : 0;
    const nO = B ? B.floors.reduce((a, f) => a + f.slab.openings.length, 0) : 0;
    return `<div class="card">${bsel()}
      <div class="kg" style="margin-top:10px">
        ${kpi('لوحات مقروءة', RES.drawings.length, 'ok')}
        ${kpi('مباني', RES.buildings.length)}
        ${kpi('طوابق المبنى', B ? B.floors.length : 0, 'ok')}
        ${kpi('أعمدة (كل الطوابق)', nC)}
        ${kpi('جسور (بحور)', nB)}
        ${kpi('فتحات سقف (X)', nO)}
        ${kpi('جداول جسور', (S.beam_tables || []).length, (S.beam_tables || []).length ? 'ok' : '')}
        ${kpi('أعمدة بالجدول', Object.keys(S.columns || {}).length, Object.keys(S.columns || {}).length ? 'ok' : '')}
        ${kpi('أساسات مصمَّمة', B ? B.footings.length : 0)}
        ${kpi('المقياس', N(RES.scale, 4) + ' م/وحدة', ['الأبعاد المكتوبة', 'مقاسات الغرف المكتوبة', 'يدوي'].includes(RES.scale_src) ? 'ok' : 'warn')}
        ${kpi('أبعاد المبنى', B ? N(B.size[0], 1) + ' × ' + N(B.size[1], 1) + ' م' : '—')}
        ${kpi('الارتفاع', B ? N(B.height, 1) + ' م' : '—')}
      </div>
      <div class="note" style="margin-top:8px">مصدر المقياس: <b>${E(RES.scale_src)}</b>${RES.angle ? ' · دُوِّر ' + N(RES.angle, 1) + '°' : ''}
        · ${RES.n_ents.toLocaleString('en-US')} عنصر بفضاء النموذج (البلوكات مفكوكة، لوحات الورق مستبعدة).
        ${RAW && (RAW.collapsed || []).length ? `<div>📦 ملف ضخم: ${RAW.collapsed.length} بلوك زخرفي ثقيل (أبواب/أشجار/أثاث — ${RAW.collapsed.reduce((a, c) => a + c.n, 0).toLocaleString('en-US')} نسخة)
          قُرئ كنقطة بدل عشرات الخطوط لكل نسخة، لتسريع القراءة — الأعمدة والمحاور والمناسيب والعناوين تُفكّ دائماً.</div>` : ''}
        ${RAW && RAW.truncated ? '<div>⚠️ تجاوز الملف الحد الأقصى للعناصر — قد تنقص بعض اللوحات الأخيرة.</div>' : ''}</div>
      ${unknownCard()}
      ${(RES.files || []).length > 1 ? `<div class="note" style="margin-top:8px">📂 مشروع من ${RES.files.length} ملفات مدموجة:
        ${RES.files.map(f => `<div>• <b>${E(f.name)}</b> — ${f.n_ents.toLocaleString('en-US')} عنصر · المقياس ${N(f.scale, 4)} م/وحدة (${E(f.scale_src)}) · ${f.drawings} لوحة</div>`).join('')}</div>` : ''}
      ${(RES.warnings || []).length ? `<ul class="warn">${RES.warnings.map(w => '<li>⚠️ ' + E(w) + '</li>').join('')}</ul>` : ''}
    </div>`;
  }

  // --------------------------- المخططات: مصغّر SVG لكل رسمة ---------------------------
  function sheetSvg(dw) {
    const [x0, y0, x1, y1] = dw.rect, w = x1 - x0, h = y1 - y0;
    const X = x => (x - x0).toFixed(2), Y = y => (y1 - y).toFixed(2);
    const k = Math.max(w, h) / 90;
    let s = `<svg viewBox="${-2 * k} ${-4 * k} ${(w + 4 * k).toFixed(2)} ${(h + 6 * k).toFixed(2)}" xmlns="http://www.w3.org/2000/svg">`;
    for (const l of dw.sketch || []) {
      const c = l[4] === 'a' ? '#1e4a6b' : (l[4] === 'c' ? '#7f1d1d' : '#475569');
      s += `<line x1="${X(l[0])}" y1="${Y(l[1])}" x2="${X(l[2])}" y2="${Y(l[3])}" stroke="${c}" stroke-width="${(k * 0.35).toFixed(3)}"/>`;
    }
    for (const op of dw.openings || []) {
      s += `<rect x="${X(op.x0)}" y="${Y(op.y1)}" width="${(op.x1 - op.x0).toFixed(2)}" height="${(op.y1 - op.y0).toFixed(2)}" fill="#d946ef" fill-opacity=".22" stroke="#e879f9" stroke-width="${(k * .5).toFixed(3)}"/>`;
    }
    for (const b of dw.beams || []) {
      const [a1, b1, a2, b2] = b.o === 'h' ? [b.a, b.c, b.b, b.c] : [b.c, b.a, b.c, b.b];
      s += `<line x1="${X(a1)}" y1="${Y(b1)}" x2="${X(a2)}" y2="${Y(b2)}" stroke="${b.mark ? '#22c55e' : '#f59e0b'}" stroke-opacity=".7" stroke-width="${Math.max(b.w / 1000, k * 0.8).toFixed(3)}"/>`;
    }
    for (const c of dw.columns || []) {
      const bw = c.b / 1000, bh = c.h / 1000;
      s += `<rect x="${(c.x - bw / 2 - x0).toFixed(2)}" y="${(y1 - c.y - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="#ef4444"/>`;
    }
    for (const a of dw.ax.x) s += `<text x="${X(a.pos)}" y="${(-1.2 * k).toFixed(2)}" font-size="${(2.6 * k).toFixed(2)}" fill="#38bdf8" text-anchor="middle">${E(AX(a.name))}</text>`;
    for (const a of dw.ax.y) s += `<text x="${(-0.6 * k).toFixed(2)}" y="${(y1 - a.pos + k).toFixed(2)}" font-size="${(2.6 * k).toFixed(2)}" fill="#38bdf8" text-anchor="end">${E(AX(a.name))}</text>`;
    return s + '</svg>';
  }

  function sheetsTab() {
    const B = cur();
    const ids = B ? new Set(B.drawings) : null;
    const list = RES.drawings.filter(d => !ids || ids.has(d.id));
    const others = RES.drawings.filter(d => ids && !ids.has(d.id));
    const card = dw => `<div class="sheet">
        <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;flex-wrap:wrap">
          <b>#${dw.id + 1}</b>
          <select data-dk="${dw.id}" style="width:auto;padding:3px 6px;font-size:11.5px">
            ${Object.entries(KIND).map(([k, t]) => `<option value="${k}" ${k === dw.kind ? 'selected' : ''}>${t}</option>`).join('')}
            <option value="" ${!dw.kind ? 'selected' : ''}>غير معروف</option></select>
          <select data-df="${dw.id}" style="width:auto;padding:3px 6px;font-size:11.5px">
            <option value="">— الطابق —</option>
            ${FLOORS.map(([k, t]) => `<option value="${k}" ${dw.floor && dw.floor.key === k ? 'selected' : ''}>سقف ${t}</option>`).join('')}</select>
          <span class="tag ${dw.title_trusted ? 't-ok' : 't-warn'}">${dw.title_trusted ? 'من العنوان ✓' : 'بلا عنوان — حدّده'}</span>
        </div>
        <div class="t">${E(dw.title || '—')}</div>
        ${sheetSvg(dw)}
        ${['elev', 'section', 'detail', 'site', 'finish', 'stair', 'tank', 'fence', 'joint', 'landscape'].includes(dw.kind)
          ? `<div class="note" style="margin-top:6px">${dw.kind === 'elev'
              ? 'واجهة' + ({ S: ' جنوبية', N: ' شمالية', E: ' شرقية', W: ' غربية' }[dw.view || dw.view_auto] || '') +
                (dw.view_auto && !dw.view ? ' (الجهة من ترتيب المحاور)' : '') +
                (dw.view || dw.view_auto ? ' — تظهر على المبنى بالمجسم (🏛️ الواجهات على المبنى)' : ' — حدّد جهتها بعنوانها لتُركَّب على المبنى')
              : dw.kind === 'section' ? 'مقطع' + (dw.letter ? ' ' + dw.letter + '-' + dw.letter : '') +
                ' — يُركَّب على خط قطعه بالمسقط، ومنه تُقاس المناسيب وسماكة البلاطة'
              : dw.kind === 'finish' ? 'مسقط تشطيبات/أثاث/سطح علوي — مرجع للقراءة، والمسقط المعماري للطابق هو الذي يُركَّب'
              : (KIND[dw.kind] || 'لوحة عرض (تفصيلة)') + ' — تُقرأ ملاحظاتها وجداولها ونظام بلاطتها، ولا تدخل تركيب المبنى'}
              ${dw.slab_type ? '<div>🧩 نظام البلاطة: <b>' + E(dw.slab_type.name) + '</b> (من ' + E(dw.slab_type.src) + ')</div>' : ''}
              ${(RES.notes || []).filter(n => n.drawing === dw.id).length ? '<div>📝 ' + RES.notes.filter(n => n.drawing === dw.id).length + ' ملاحظة — بتبويب «الملاحظات»</div>' : ''}${dw.levels && dw.levels.k
              ? `<div>📏 ${dw.levels.marks.filter(m => m.ok).length} علامة منسوب مقروءة${(dw.levels.slabs || []).length ? ' · ' + dw.levels.slabs.length + ' بلاطة مرسومة' : ''}${(dw.levels.axes || []).length ? ' · ' + dw.levels.axes.length + ' محور مطابَق مع المسقط' : ''}</div>` : ''}</div>`
          : `<div class="note" style="margin-top:6px">${dw.ax.x.length}×${dw.ax.y.length} محور · ${dw.columns.length} عمود ·
          ${dw.beams.length} بحر جسر (${dw.beams.filter(b => b.mark).length} بعلامة) · ${dw.openings.length} فتحة ·
          ${dw.callouts.length} نداء تسليح${(dw.walls || []).length && dw.kind === 'arch' ? ' · ' + dw.walls.length + ' جدار' : ''}${dw.thickness ? ' · بلاطة ' + dw.thickness + ' مم' : ''}${dw.slab_type ? ' · 🧩 ' + E(dw.slab_type.name) : ''}</div>`}
      </div>`;
    return `<div class="card">${bsel()}
      <div class="legend" style="margin:8px 0"><span><i style="background:#ef4444"></i>عمود</span>
        <span><i style="background:#22c55e"></i>جسر بعلامة</span><span><i style="background:#f59e0b"></i>جسر بلا علامة (تخمين المقطع)</span>
        <span><i style="background:#d946ef"></i>فتحة X</span><span><i style="background:#38bdf8"></i>محاور</span></div>
      <div class="sg">${list.map(card).join('')}</div>
      ${others.length ? `<details class="fold" style="margin-top:10px"><summary>لوحات المباني الأخرى (${others.length})</summary>
        <div class="sg">${others.map(card).join('')}</div></details>` : ''}
      <div class="note" style="margin-top:8px">غيّر نوع أي لوحة أو طابقها إن أخطأ العنوان — يُعاد التركيب فوراً.</div></div>`;
  }

  function axesTab() {
    const B = cur();
    if (!B) return '<div class="note">لا مبنى.</div>';
    const row = a => `<tr><td><b class="ltr">${E(AX(a.name))}</b></td><td>${a.prime ? '<span class="tag t-warn">ثانوي</span>' : 'رئيسي'}</td>
      <td class="ltr">${N(a.pos, 2)}</td><td class="ltr">${a.next == null ? '—' : N(a.next, 2) + ' م = ' + Math.round(a.next * 1000) + ' مم'}</td></tr>`;
    return `<div class="card">${bsel()}
      <div class="grid g2" style="margin-top:8px">
        <div><h3>محاور ${E(B.grid.x[0] && B.grid.x[0].name)}→${E(B.grid.x.slice(-1)[0] && B.grid.x.slice(-1)[0].name)} (عمودية)</h3>
          <div class="scroll"><table><tr><th>المحور</th><th>النوع</th><th>الموضع م</th><th>المسافة للتالي</th></tr>
          ${B.grid.x.map(row).join('')}</table></div></div>
        <div><h3>محاور ${E(B.grid.y[0] && B.grid.y[0].name)}→${E(B.grid.y.slice(-1)[0] && B.grid.y.slice(-1)[0].name)} (أفقية)</h3>
          <div class="scroll"><table><tr><th>المحور</th><th>النوع</th><th>الموضع م</th><th>المسافة للتالي</th></tr>
          ${B.grid.y.map(row).join('')}</table></div></div></div>
      <div class="note" style="margin-top:8px">المحور بشرطة (مثل H′) <b>ثانوي</b>: عنصر قريب من المحور الرئيسي
        (جسر ثانوي، حافة بلاطة) لا يستحق محوراً مستقلاً. المسافات بالمليمتر كما تُكتب بالمخطط (3300 = 3.3 م).
        كل موضع مأخوذ من خط المحور المارّ بمركز فقاعته، ومسجَّل على شبكة المبنى بأسماء المحاور.</div></div>`;
  }

  function tablesTab() {
    const S = RES.schedules || {};
    const bt = (S.beam_tables || []).map(t => {
      const near = RES.drawings.find(d => d.id === t.near);
      return `<div class="card" style="margin-top:10px"><h3>جدول الجسور #${t.id + 1}
        ${near ? `<span class="tag t-ok">لوحة #${near.id + 1} — سقف ${E((near.floor || {}).name || '')}</span>` : ''}</h3>
        <div class="scroll"><table><tr><th>النوع</th><th>المقطع b×h (مم)</th><th>سفلي مستمر</th><th>سفلي إضافي</th>
          <th>علوي مستمر</th><th>علوي فوق المسند</th><th>أتاري الأطراف (¼)</th><th>أتاري المنتصف (½)</th><th>جانبي</th></tr>
        ${Object.values(t.beams).map(b => `<tr><td><b>${E(b.mark)}</b></td>
          <td><input class="sm ltr" data-def="${E(b.mark)}" value="${b.b || ''}x${b.h || ''}"></td>
          <td class="ltr">${bar(b.bot.cont)}</td><td class="ltr">${bar(b.bot.extra)}</td>
          <td class="ltr">${bar(b.top.cont)}</td><td class="ltr">${bar(b.top.sup)}</td>
          <td class="ltr">${tie(b.stir.end)}</td><td class="ltr">${tie(b.stir.mid)}</td><td class="ltr">${bar(b.side)}</td></tr>`).join('')}
        </table></div></div>`;
    }).join('');
    const cols = S.columns || {};
    const fks = [...new Set(Object.values(cols).flatMap(v => Object.keys(v)))]
      .sort((a, b) => FLOORS.findIndex(f => f[0] === a) - FLOORS.findIndex(f => f[0] === b));
    const cname = k => (FLOORS.find(f => f[0] === k) || [k, k])[1];
    const ct = Object.keys(cols).length ? `<div class="card" style="margin-top:10px"><h3>جدول تسليح الأعمدة</h3>
      <div class="scroll"><table><tr><th>العمود</th>${fks.map(k => `<th>${cname(k)}</th>`).join('')}</tr>
      ${Object.entries(cols).map(([m, v]) => `<tr><td><b class="ltr">${E(m)}</b></td>${fks.map(k => {
        if (!(k in v)) return '<td>—</td>';
        if (v[k] === null) return '<td><span class="tag t-warn">غير موجود</span></td>';
        return `<td class="ltr">${bar(v[k].main)}<br><span style="color:var(--mut)">${tie(v[k].ties)}</span></td>`;
      }).join('')}</tr>`).join('')}</table></div>
      <div class="note">«غير موجود» = NOT PRESENT: العمود ينتهي تحت هذا الطابق فلا يُرسم فيه.</div></div>` : '';
    // كل الجداول المرسومة بالملف (أبواب/شبابيك، تشطيبات، أساسات…) كما هي — صفوفاً وأعمدة
    const TK = { openings: '🚪 أبواب وشبابيك', finishes: '🎨 تشطيبات', footings: '🧱 أساسات', beams: '📏 جسور',
                 columns: '🏛️ أعمدة', slabs: '▭ بلاطات', rooms: '🏠 فضاءات', other: '📋 جدول' };
    const all = RES.tables || [];
    const gt = all.length ? `<div class="card" style="margin-top:10px"><h3>📋 كل الجداول المرسومة بالملف (${all.length})</h3>
      <div class="note">كل شبكة خطوط فيها نصوص بخلاياها تُقرأ جدولاً (الجداول المكرّرة تُعرض مرة واحدة، وجداول إطار اللوحة تُستبعد).</div>
      ${all.map((t, i) => `<details class="fold"${i < 2 ? ' open' : ''}><summary>${TK[t.kind] || TK.other}${t.title ? ' — ' + E(t.title) : ''}
          <small>(${t.rows.length}×${Math.max(...t.rows.map(r => r.length))}${t.count > 1 ? ' · مكرّر ' + t.count + ' مرات' : ''})</small></summary>
        <div class="scroll"><table>${t.rows.map((r, ri) => `<tr>${r.map(c => ri === 0 ? `<th>${E(c)}</th>` : `<td>${E(c)}</td>`).join('')}</tr>`).join('')}</table></div></details>`).join('')}</div>` : '';
    return (bt || ct || gt) ? `${bt || ct ? '<div class="note">عدّل مقطع أي جسر بالجدول (مثلاً 350x800) فيُعاد التركيب بمقطعك — تعديلك يتقدّم على الملف.</div>' : ''}${bt}${ct}${gt}`
      : '<div class="note">ما لقيت جداول بالملف.</div>';
  }

  function floorsTab() {
    const B = cur();
    if (!B) return '<div class="note">لا مبنى.</div>';
    const LV = z => `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block">${Math.abs(z) < 0.005 ? '±0.00' : (z > 0 ? '+' : '') + N(z, 2)}</span>`;
    const HS = { measured: '<span class="tag t-ok">📏 مقاس من الواجهة/المقطع</span>', user: '<span class="tag t-ok">✍️ تعديلك</span>',
                 default: '<span class="tag t-warn">افتراضي 3.5</span>' };
    const L = B.levels;
    const lvCard = L ? `<div class="card" style="margin-top:10px"><h3>📏 المناسيب مقاسة من الواجهة والمقطع (لوحة ${L.src.filter(i => i >= 0).map(i => i + 1).join(' و')}${L.src.includes(-1) ? ' + منسوب F.F.L. بالمساقط' : ''})</h3>
      <div class="scroll"><table><tr><th>الطابق</th><th>المنسوب</th><th>الارتفاع م</th><th>الصافي م</th><th>التحقق</th></tr>
      ${L.keys.map((k, i) => { const c = (L.checks || [])[i] || {}; const f = B.floors.find(q => q.key === k);
        return `<tr><td>${E(f ? f.name : k)}</td><td>${LV(L.chain[i])}${L.from_slab[i] ? ' ▭' : ''}</td>
          <td class="ltr">${N(L.heights[i], 2)}</td><td class="ltr">${c.clear != null ? N(c.clear, 2) : '—'}</td>
          <td>${c.h_dim || c.clear_dim ? '<span class="tag t-ok">✓ مطابق لبُعد مكتوب</span>' : '<span class="tag t-warn">من العلامات</span>'}</td></tr>`; }).join('')}
      <tr><td>${L.keys[L.keys.length - 1] === 'roof' ? 'أعلى غرف السطح' : 'السطح'}</td><td>${LV(L.chain[L.chain.length - 1])}${L.from_slab[L.chain.length - 1] ? ' ▭' : ''}</td><td colspan="3"></td></tr></table></div>
      <div class="note" style="margin-top:6px;line-height:1.9">
        ${L.t ? `سماكة البلاطة من المقطع <b class="ltr">${L.t} مم</b>${L.fin ? ' + تشطيبات <b class="ltr">' + L.fin + ' مم</b> (فرشة + بلاط)' : ''} · ` : ''}
        ${L.ngl && Math.abs(B.ffl0 || 0) > 0.005 ? `الأرض الطبيعية <b class="ltr">±0.00</b> والطابق الأرضي مرفوع <b class="ltr">${LV(B.ffl0)}</b> — الأساسات تُقاس من الأرض الطبيعية · ` : ''}
        ${(L.mids || []).length ? `مناسيب وسطية (بسطات درج/أرضيات مرتفعة): ${L.mids.map(LV).join(' · ')} · ` : ''}
        ${(L.extra || []).length ? `فوق السطح (غرفة درج/ستارة): ${L.extra.map(LV).join(' · ')}` : ''}
        ${(L.conflicts || []).map(c => `<div>⚠️ العلامة <b class="ltr">${LV(c.v)}</b> باللوحة ${c.src + 1} مرسومة فعلياً عند <b class="ltr">${LV(c.drawn)}</b> — اعتُمد الرسم.</div>`).join('')}
        <div>▭ = منسوب مؤكَّد ببلاطة مرسومة بالمقطع. غيّر أي ارتفاع أدناه ويُعاد التركيب (تعديلك يتقدّم على القياس).</div></div></div>` : '';
    return `<div class="card">${bsel()}</div>` + lvCard + B.floors.map(f => {
      const s = f.slab, m = s.mesh || {};
      return `<div class="card" style="margin-top:10px"><h3>سقف الطابق ${E(f.name)}
        <span class="tag t-ok">منسوب ${f.level >= 0 ? '+' : ''}${N(f.level, 2)} م</span> ${HS[f.h_src] || ''}</h3>
        <div class="f" style="margin-bottom:8px"><div><label>ارتفاع الطابق (م)</label>
          <input type="number" step="0.05" min="2.4" max="12" class="sm" data-fh="${f.key}" value="${f.h}"></div></div>
        ${f.slab.system ? `<div class="note" style="margin-bottom:6px">🧩 <b>${E(f.slab.system.name)}</b> — ${E(f.slab.system.desc || '')}
          <br><small>المصدر: ${E(f.slab.system.src || '')} «${E((f.slab.system.evidence || '').slice(0, 90))}»${f.slab.beamless ? ' · لم تُفترض جسور لأن النظام بلا جسور' : ''}${(f.slab.drops || []).length ? ' · ' + f.slab.drops.length + ' تسقيط حول الأعمدة' : ''}</small></div>` : ''}
        ${f.beams_assumed ? '<div class="note" style="margin-bottom:6px">⚠️ لا مخطط جسور لهذا السقف — الجسور مفترضة بين الأعمدة (250 مم، عمق ≈ البحر/12) ومعلَّمة «تخمين». ارفع مخطط الجسور أو عرّفها بتبويب «التعريفات».</div>' : ''}
        <div class="kg">${kpi('أعمدة', f.columns.length)}${kpi('بحور جسور', f.beams.length, f.beams_assumed ? 'warn' : '')}
          ${(f.walls || []).length ? kpi('جدران', f.walls.length) : ''}
          ${kpi(f.t_src === 'section' ? 'بلاطة (من المقطع)' : f.t_src === 'system' ? 'بلاطة (نموذجية للنظام)' : 'بلاطة', s.t + ' مم', s.t_from_title || f.t_src === 'section' ? 'ok' : 'warn')}
          ${s.system ? kpi('نظام البلاطة', E(s.system.name), 'ok') : ''}${kpi('فتحات', s.openings.length)}
          ${kpi('شبكة سفلية', m.bot ? 'Ø' + m.bot.d + '@' + m.bot.s : '—')}${kpi('شبكة علوية', m.top ? 'Ø' + m.top.d + '@' + m.top.s : '—')}</div>
        ${s.openings.length ? `<div class="note" style="margin-top:6px">الفتحات: ${s.openings.map(o =>
          `<span class="ltr">${o.between && o.between.x ? E(AX(o.between.x[0])) + '→' + E(AX(o.between.x[1])) : ''} × ${o.between && o.between.y ? E(AX(o.between.y[0])) + '→' + E(AX(o.between.y[1])) : ''}</span>
           (${N(o.x1 - o.x0, 2)}×${N(o.y1 - o.y0, 2)} م)`).join(' · ')}</div>` : ''}
        <details class="fold"><summary>الأعمدة (${f.columns.length})</summary><div class="scroll"><table>
          <tr><th>العلامة</th><th>المحوران</th><th>المقطع مم</th><th>القضبان</th><th>الأتاري</th><th>المصدر</th></tr>
          ${f.columns.map(c => `<tr><td><b class="ltr">${E(c.mark || '—')}</b></td><td class="ltr">${E(AX(c.ax))}×${E(AX(c.ay))}</td>
            <td class="ltr">${c.shape === 'circ' ? 'Ø' + c.b : c.b + '×' + c.h}</td>
            <td class="ltr">${c.rebar ? bar(c.rebar.main) : '<span class="tag t-warn">من الجدول: —</span>'}</td>
            <td class="ltr">${c.rebar ? tie(c.rebar.ties) : '—'}</td><td>${E({ block: 'بلوك', outline: 'مضلع', 'two-lines': 'خطّان' }[c.how] || '')}</td></tr>`).join('')}
        </table></div></details>
        <details class="fold"><summary>الجسور (${f.beams.length})</summary><div class="scroll"><table>
          <tr><th>العلامة</th><th>المحور</th><th>البحر م</th><th>المقطع مم</th><th>سفلي</th><th>علوي</th><th>أتاري</th></tr>
          ${f.beams.map(b => `<tr><td><b class="ltr">${E(b.mark || '—')}</b>${b.guess ? ' <span class="tag t-warn">تخمين</span>' : ''}</td>
            <td class="ltr">${E(AX(b.axis || '—'))}</td><td class="ltr">${N(b.span, 2)}${b.cant ? ' ↦' : ''}</td><td class="ltr">${b.b}×${b.h}</td>
            <td class="ltr">${b.rebar ? bar(b.rebar.bot.cont) + (b.rebar.bot.extra ? ' + ' + bar(b.rebar.bot.extra) : '') : '—'}</td>
            <td class="ltr">${b.rebar ? bar(b.rebar.top.cont) + (b.rebar.top.sup ? ' + ' + bar(b.rebar.top.sup) : '') : '—'}</td>
            <td class="ltr">${b.rebar ? tie(b.rebar.stir.end) + ' / ' + tie(b.rebar.stir.mid) : '—'}</td></tr>`).join('')}
        </table></div></details></div>`;
    }).join('') + (B.footings.length ? `<div class="card" style="margin-top:10px"><h3>الأساسات — مصمَّمة بالكود (ACI 318-19)، ليست من الملف</h3>
      <div class="note">الحمل لكل عمود من مساحته الرافدة بكل طابق فوقه (بلاطة + جسور + تشطيب ${2.5} + حي ${OPTS.LL} كن/م²)،
        وقدرة التربة ${OPTS.qa} كن/م² (تقدر تغيّرها بتبويب «إرسال للتحليل»).</div>
      <div class="scroll"><table><tr><th>العمود</th><th>B×B م</th><th>السماكة مم</th><th>PD / PL كن</th><th>Pu كن</th><th>الحديد</th><th>القص</th></tr>
      ${B.footings.map(ft => `<tr><td class="ltr">${E(ft.col || '—')}</td><td class="ltr">${N(ft.B, 2)}</td><td>${ft.h}</td>
        <td class="ltr">${N(ft.PD, 0)} / ${N(ft.PL, 0)}</td><td class="ltr">${N(ft.Pu, 0)}</td><td class="ltr">${E(ft.bars)}</td>
        <td>${ft.ok ? '<span class="tag t-ok">✓</span>' : '<span class="tag t-bad">✗</span>'}</td></tr>`).join('')}</table></div></div>` : '');
  }

  // كل الملاحظات المكتوبة بالملف — مصلَحة اللغة، مصنَّفة، ومنسوبة لرسمتها
  function notesTab() {
    const NS = RES.notes || [], ST = RES.text_stats || {};
    const FIX = { keyboard: '⌨️ عربي بمواضع المفاتيح (خط SHX قديم) — فُكّ', reversed: '🔁 حروف مقلوبة — عُدّلت',
                  'word-order': '↔️ ترتيب كلمات مقلوب — قراءة مقترحة', undecodable: '❓ خط SHX خاص لا يُفكّ', codes: '🔣 رموز %%nnn — فُكّت' };
    const byDw = {};
    NS.forEach(n => { const k = n.drawing == null ? 'g' : n.drawing; (byDw[k] = byDw[k] || []).push(n); });
    const dname = k => k === 'g' ? 'ملاحظات عامة (خارج الرسمات)' : (() => { const d = RES.drawings.find(x => x.id === +k);
      return '#' + (+k + 1) + ' ' + (d ? E(d.title || d.kind_name || '') : ''); })();
    const tot = Object.entries(ST).filter(([k]) => k !== 'fixes').reduce((a, [, v]) => a + v, 0);
    const lab = { note_line: 'أسطر ملاحظات', title: 'عناوين', mark: 'علامات عناصر/محاور', number: 'أرقام وأبعاد', callout: 'نداءات تسليح',
                  label: 'تسميات قصيرة', room: 'أسماء فضاءات', table_cell: 'خلايا جداول', undecodable: 'غير مقروء', empty: 'فارغ' };
    return `<div class="card"><h3>📝 كل نص بالملف مقروء (${tot.toLocaleString('en-US')} نص)</h3>
      <div class="kg">${Object.entries(lab).filter(([k]) => ST[k]).map(([k, t]) => kpi(t, ST[k].toLocaleString('en-US'), k === 'undecodable' ? 'warn' : '')).join('')}</div>
      ${ST.fixes ? `<div class="note" style="margin-top:6px">إصلاح اللغة: ${Object.entries(ST.fixes).filter(([k]) => k !== 'ok').map(([k, v]) => (FIX[k] || k) + ': ' + v).join(' · ') || 'كل النصوص سليمة'}</div>` : ''}
    </div>` + Object.entries(byDw).map(([k, arr]) => `<div class="card" style="margin-top:10px"><h3>${dname(k)} <small>(${arr.length})</small></h3>
      ${arr.map(n => `<div class="nt"><div class="nt-t" dir="auto">${E(n.alt || n.text).replace(/\n/g, '<br>')}</div>
        <div class="nt-m">${(n.kinds || []).map(x => `<span class="tag">${E(x)}</span>`).join(' ')}
          ${n.slab ? '<span class="tag t-ok">نظام بلاطة</span>' : ''}${(n.fix || []).map(f => `<span class="tag t-warn">${FIX[f] || f}</span>`).join(' ')}</div>
        ${n.alt ? `<div class="nt-o" dir="auto">الأصل: ${E(n.text).replace(/\n/g, ' / ')}</div>` : ''}
        ${n.orig ? `<div class="nt-o ltr">الأصل بالملف: ${E(n.orig).replace(/\n/g, ' / ')}</div>` : ''}</div>`).join('')}</div>`).join('');
  }

  function unknownCard() {
    const U = RES.unknown || [];
    if (!U.length) return '<div class="card" style="margin-top:10px"><h3>🔍 ما لم أتعرّف عليه</h3><div class="note">لا شيء — كل الرسمات والنصوص والطبقات فُهمت.</div></div>';
    return `<div class="card" style="margin-top:10px"><h3>🔍 ما لم أتعرّف عليه (${U.length}) — راجعه أو أخبرني به</h3>
      ${U.map(u => `<div class="nt"><div class="nt-t"><b>${E(u.title)}</b></div><div class="note">${E(u.detail)}</div>
        ${(u.samples || []).length ? `<div class="nt-o">أمثلة: ${u.samples.map(x => '<span class="ltr" dir="auto">' + E(x) + '</span>').join(' · ')}</div>` : ''}</div>`).join('')}</div>`;
  }

  function dictHtml(short) {
    const D = RES ? RES.dictionary : null;
    const syms = D ? D.symbols : [];
    if (short && !D) {
      return `<ul style="padding-right:18px;line-height:1.9;font-size:13px">
        <li><b>العناوين</b>: «Slab Reinforcement Plan for Roof of Second Floor … Thickness 200 mm» → نوع اللوحة والطابق والسماكة.</li>
        <li><b>المحاور</b>: الفقاعات (A · 17) والمحاور الثانوية بشرطة (H′) والمسافات بالمليمتر (3300).</li>
        <li><b>الأعمدة</b>: بلوك «col 60x60» أو مضلع أو <b>خطّان</b> عند التقاطع، وعلاماتها C1… من مفتاح الأعمدة.</li>
        <li><b>الجسور</b>: <b>خطّان متوازيان</b> على المحور + علامة B1… ومقطعها وحديدها من جدول الجسور.</li>
        <li><b>علامة X</b>: فتحة بالسقف (منور/درج/مصعد) تُقطع من البلاطة.</li>
        <li><b>الجداول</b>: SCHEDULE OF BEAMS و Columns Reinforcing Schedule (NOT PRESENT = العمود غير موجود بالطابق).</li>
        <li><b>التسليح</b>: %%C16@200 T · 3%%C25 · Ties %%C10/250 (3/Set).</li>
        <li><b>تعريفاتك</b>: اكتب «C1 = 400x600» أو «B1 (350x800)» بالملف أو بالقسم — تتقدّم على الرسم.</li></ul>`;
    }
    return `<div class="scroll"><table><tr><th>الرمز</th><th>كيف يُرسم</th><th>معناه</th></tr>
      ${syms.map(s => `<tr><td><b>${E(s.name)}</b></td><td>${E(s.how)}</td><td>${E(s.means)}</td></tr>`).join('')}</table></div>`;
  }

  function layersTab() {
    const lays = (RAW && RAW.layers) || [];
    const defs = RES.definitions || [];
    return `<div class="card"><h3>🧠 تعريفاتك (تتقدّم على الملف والقاعدة)</h3>
      <div class="note">سطر لكل تعريف: <span class="ltr">C1 = 400x600</span> · <span class="ltr">B2 = 300x900</span> ·
        <span class="ltr">C5A = 700x700</span>. تعريفات موجودة داخل الملف تُقرأ تلقائياً وتظهر أدناه.</div>
      <textarea id="cad_defs" placeholder="C1 = 400x600">${E(OPTS.definitions.join('\n'))}</textarea>
      <button class="btn" id="cad_defs_go" style="margin-top:6px">✅ طبّق التعريفات وأعد التركيب</button>
      ${defs.length ? `<div class="scroll" style="margin-top:8px"><table><tr><th>العلامة</th><th>النوع</th><th>المقطع</th><th>المصدر</th></tr>
        ${defs.map(d => `<tr><td class="ltr">${E(d.mark)}</td><td>${E(d.kind)}</td><td class="ltr">${d.size ? d.size.b + '×' + d.size.h : '—'}</td>
          <td>${d.user ? 'منك' : 'من الملف'}</td></tr>`).join('')}</table></div>` : ''}</div>
      <div class="card" style="margin-top:10px"><h3>طبقات الملف (${lays.length})</h3>
        <div class="scroll"><table><tr><th>الطبقة</th><th>العناصر</th><th>نوع الخط</th></tr>
        ${lays.map(l => `<tr><td class="ltr">${E(l.name)}</td><td>${l.n}</td><td class="ltr">${E(l.lt || '')}</td></tr>`).join('')}</table></div></div>
      <div class="card" style="margin-top:10px"><h3>📖 قاموس الرموز — ما يعرفه القسم عن اصطلاحات المهندس المدني</h3>
        ${dictHtml(false)}
        <div class="note" style="margin-top:6px">الأسبقية: ${E(RES.dictionary.precedence)}.</div></div>`;
  }

  // الموقع: كل المباني بمجسم واحد، متجاورة بفاصل 12 م (لكل مبنى إحداثياته المحلية من ملفه)
  function siteB() {
    const bs = RES.buildings || [];
    let dx = 0, W = 0, D = 0, H = 0;
    const floors = [], footings = [], strips = [];
    const X = (o, ks) => { const c = Object.assign({}, o); ks.forEach(k => { if (typeof c[k] === 'number') c[k] += dx; }); return c; };
    bs.forEach((b, i) => {
      b.floors.forEach(f => floors.push(Object.assign({}, f, {
        key: f.key + '@' + i, name: b.name + ' · ' + f.name,
        columns: f.columns.map(c => X(c, ['x'])), beams: f.beams.map(m => X(m, ['x1', 'x2'])),
        walls: (f.walls || []).map(w => X(w, ['x1', 'x2'])),
        slab: Object.assign({}, f.slab, { rects: f.slab.rects.map(r => [r[0] + dx, r[1], r[2] + dx, r[3]]),
                                          openings: f.slab.openings.map(o => X(o, ['x0', 'x1'])), callouts: [] }) })));
      footings.push(...(b.footings || []).map(ft => X(ft, ['x'])));
      strips.push(...(b.strips || []).map(st => X(st, ['x1', 'x2'])));
      W = dx + b.size[0]; D = Math.max(D, b.size[1]); H = Math.max(H, b.height || 3.5);
      dx += b.size[0] + 12;
    });
    floors.sort((a, b) => a.level - b.level);
    return { name: 'الموقع', site: true, floors, footings, strips, views: [], grid: { x: [], y: [] }, size: [W, D], height: H };
  }

  function view3dTab() {
    const B = SITE ? siteB() : cur();
    if (!B) return '<div class="note">لا مبنى.</div>';
    return `<div class="card">${bsel()}
      <div class="bar3d" style="margin-top:8px">
        <select id="cad_fl" style="width:auto;padding:5px 8px"><option value="all">كل الطوابق</option>
          ${B.floors.map(f => `<option value="${f.key}">سقف ${E(f.name)}</option>`).join('')}</select>
        <button data-v="rebar">🧵 إظهار التسليح</button><button data-v="only">🔩 التسليح فقط</button>
        <button data-v="xray">🩻 أشعة</button>
        ${(B.views || []).some(v => v.view || v.fit) ? '<button data-v="views">🏛️ الواجهات والمقطع على المبنى</button>' : ''}
        <button data-v="reset">🎯 إعادة الكاميرا</button>
      </div>
      <div id="cad3d"></div>
      <div class="pick" id="cad_pick">اضغط على أي عمود أو جسر أو بلاطة أو أساس لترى علامته ومقطعه وحديده.</div>
      <div class="legend" style="margin-top:8px"><span><i style="background:#ef4444"></i>قضبان رئيسية</span>
        <span><i style="background:#f59e0b"></i>أتاري</span><span><i style="background:#3b82f6"></i>شبكة سفلية</span>
        <span><i style="background:#22c55e"></i>شبكة علوية</span><span><i style="background:#a855f7"></i>جانبي</span>
        <span><i style="background:#b8894a"></i>جسر مقطعه تخمين</span></div></div>`;
  }

  function show3d() {
    const B = SITE ? siteB() : cur(), host = q('#cad3d');
    if (!B || !host || VIEW || !window.CAD3D) return;
    VIEW = CAD3D.mount(host, B, { onPick: pick });
    const st = { rebar: false, only: false, xray: false, views: false };
    qa('#cad .bar3d button').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.v;
      if (v === 'reset') return VIEW && VIEW.reset();
      st[v] = !st[v];
      b.classList.toggle('on', st[v]);
      VIEW && VIEW[v === 'only' ? 'only' : v](st[v]);
    }));
    const fs = q('#cad_fl');
    if (fs) fs.addEventListener('change', () => VIEW && VIEW.floor(fs.value));
  }

  function drop3d() {
    if (VIEW) { try { VIEW.dispose(); } catch (e) { /* */ } VIEW = null; }
    if (SVIEW) { try { SVIEW.dispose(); } catch (e) { /* */ } SVIEW = null; }
  }

  // ---------------- الأدراج ----------------
  let SVIEW = null, STSEL = null;
  const TYPE = { waist: 'بلاطة مائلة بين جسرين', cantilever: 'كابولي من جسر مائل', spiral: 'حلزوني' };
  function allStairs() {
    const L = [];
    (RES.stairs || []).forEach((st, i) => L.push({ key: 's' + i, st, sec: true }));
    (RES.buildings || []).forEach((b, bi) => b.floors.forEach(f => (f.stairs || []).forEach((st, j) =>
      L.push({ key: 'p' + bi + '_' + f.key + '_' + j, st, b, f }))));
    return L;
  }
  // الدرج بإحداثيات موضعية (يبدأ من 0.8 م) ليُعرض منفرداً بالعارض
  function stairB(it) {
    const st = it.st, pts = [];
    (st.flights3d || st.flights || []).forEach(q => {
      const se = (q.n - 1) * q.T;
      [[0, 0], [se, 0], [0, q.w], [se, q.w]].forEach(([a, d]) => pts.push([q.p0[0] + q.u[0] * a + q.v[0] * d, q.p0[1] + q.u[1] * a + q.v[1] * d]));
    });
    (st.landings || []).forEach(l => pts.push([l.x0, l.y0], [l.x1, l.y1]));
    if (st.spiral) pts.push([st.spiral.x - st.spiral.r_out, st.spiral.y - st.spiral.r_out], [st.spiral.x + st.spiral.r_out, st.spiral.y + st.spiral.r_out]);
    if (!pts.length) return null;
    const x0 = Math.min(...pts.map(p => p[0])) - 0.8, y0 = Math.min(...pts.map(p => p[1])) - 0.8;
    const x1 = Math.max(...pts.map(p => p[0])) + 0.8, y1 = Math.max(...pts.map(p => p[1])) + 0.8;
    const sh = p => [p[0] - x0, p[1] - y0];
    const s2 = Object.assign({}, st, {
      title: st.title || ('درج ' + (it.f ? it.f.name : '')),
      flights3d: (st.flights3d || st.flights || []).map(q => Object.assign({}, q, { p0: sh(q.p0) })),
      landings: (st.landings || []).map(l => Object.assign({}, l, { x0: l.x0 - x0, x1: l.x1 - x0, y0: l.y0 - y0, y1: l.y1 - y0 })),
      beams3d: (st.beams3d || []).map(b => Object.assign({}, b, { a: [b.a[0] - x0, b.a[1] - y0, b.a[2]], b: [b.b[0] - x0, b.b[1] - y0, b.b[2]] })),
      spiral: st.spiral ? Object.assign({}, st.spiral, { x: st.spiral.x - x0, y: st.spiral.y - y0 }) : null });
    s2.flights = undefined;
    return { name: s2.title, floors: [], stairs: [s2], grid: { x: [], y: [] }, size: [x1 - x0, y1 - y0], height: st.H || 3.5 };
  }
  function showStair(key) {
    const L = allStairs(), it = L.find(x => x.key === key) || L[0], host = q('#cad_st3d');
    if (!it || !host || !window.CAD3D) return;
    STSEL = it.key;
    if (SVIEW) { try { SVIEW.dispose(); } catch (e) { /* */ } SVIEW = null; }
    const B = stairB(it);
    if (!B) return;
    SVIEW = CAD3D.mount(host, B, { onPick: u => { const el = q('#cad_st_pick'); if (el) el.innerHTML = u ? pickHtml(u) : ''; } });
    const t = q('#cad_st_name');
    if (t) t.innerHTML = '🧊 ' + E(B.name) + ' — من ' + lv(it.st.z_floor != null ? it.st.z_floor : (it.f ? it.f.level : 0)) +
      ' حتى ' + lv((it.st.z_floor != null ? it.st.z_floor : (it.f ? it.f.level : 0)) + it.st.H);
    qa('#cad [data-stv]').forEach(b => b.classList.toggle('on', b.dataset.stv === it.key));
  }
  const lv = z => (Math.abs(z) < 0.005 ? '±0.00' : (z > 0 ? '+' : '') + Number(z).toFixed(2));
  // مقطع جانبي للدرج كاملاً: القلبات بترتيبها، والحارة الخلفية منقّطة، وخطا منسوب الطابقين
  function stairSvg(st) {
    const FL = st.flights3d || st.flights || [];
    if (st.spiral || !FL.length) return '';
    const segs = [], z0 = st.z_floor != null ? st.z_floor : Math.min(...FL.map(q => q.z0)), H = st.H || 3;
    let xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
    const ax = (q, s0) => q.p0[along] + q.u[along] * s0;
    const main0 = FL.find(q => Math.abs(q.u[0]) >= Math.abs(q.u[1])) || FL[0];
    const along = Math.abs(main0.u[0]) >= Math.abs(main0.u[1]) ? 0 : 1;
    FL.forEach(q => {
      if (Math.abs(q.u[along]) < 0.5) {                // قلبة متعامدة على المقطع: تُرى من طرفها كتلة درجات
        const a = [q.p0[along], q.p0[along] + q.v[along] * q.w].sort((m, n) => m - n);
        const pts = [[a[0], q.z0], [a[0], q.z0 + q.n * q.R], [a[1], q.z0 + q.n * q.R], [a[1], q.z0]];
        segs.push({ pts, sof: [[a[1], q.z0 - 0.12], [a[0], q.z0 - 0.12]], back: false, read: q.read !== false, perp: true });
        pts.forEach(p => { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); });
        return;
      }
      const pts = [[ax(q, 0), q.z0]];
      for (let k = 0; k < q.n; k++) { pts.push([ax(q, k * q.T), q.z0 + (k + 1) * q.R]); if (k < q.n - 1) pts.push([ax(q, (k + 1) * q.T), q.z0 + (k + 1) * q.R]); }
      const th = Math.atan2(q.R, q.T), wv = (q.waist || 150) / 1000 / Math.cos(th), se = (q.n - 1) * q.T;
      const sof = [[ax(q, 0), q.z0 - wv], [ax(q, se), q.z0 + (q.n - 1) * q.R - wv]];
      segs.push({ pts, sof, back: (q.lane || 0) === 1, read: q.read !== false });
      pts.concat(sof).forEach(p => { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); });
    });
    const LD = (st.landings || []).map(l => {
      const a = along === 0 ? [l.x0, l.x1] : [l.y0, l.y1];
      xmin = Math.min(xmin, a[0]); xmax = Math.max(xmax, a[1]);
      return { a, z: l.z, t: (l.t || 150) / 1000 };
    });
    zmin = Math.min(zmin, z0 - 0.3); zmax = Math.max(zmax, z0 + H + 0.2);
    const W = 320, pad = 34, sc = Math.min((W - 2 * pad) / Math.max(xmax - xmin, 0.5), 190 / Math.max(zmax - zmin, 0.5));
    const Hh = Math.round((zmax - zmin) * sc + 30);
    const X = x => pad + (x - xmin) * sc, Z = z => Hh - 15 - (z - zmin) * sc;
    const pl = a => a.map(p => X(p[0]).toFixed(1) + ',' + Z(p[1]).toFixed(1)).join(' ');
    let g = '';
    [[z0, lv(z0)], [z0 + H, lv(z0 + H)]].forEach(([z, t]) => {
      g += `<line x1="4" x2="${W - 4}" y1="${Z(z)}" y2="${Z(z)}" stroke="#fbbf24" stroke-dasharray="4 3" stroke-width="1"/>
            <text x="4" y="${Z(z) - 3}" fill="#fbbf24" font-size="10" direction="ltr">${t}</text>`; });
    LD.forEach(l => { g += `<rect x="${X(l.a[0])}" y="${Z(l.z)}" width="${Math.max(1, (l.a[1] - l.a[0]) * sc)}" height="${l.t * sc}" fill="#64748b" opacity=".75"/>`; });
    segs.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0)).forEach(s0 => {
      const col = s0.read ? '#e2e8f0' : '#a5b4fc';
      g += `<polygon points="${pl(s0.pts.concat([s0.sof[1], s0.sof[0]]))}" fill="${s0.back ? 'none' : (s0.read ? '#334155' : '#312e81')}" stroke="${col}"
              stroke-width="${s0.back ? 1 : 1.4}" ${s0.back ? 'stroke-dasharray="3 2" opacity=".7"' : ''}/>`; });
    return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%;background:#0b1222;border-radius:8px">${g}</svg>`;
  }
  function chkRows(C) {
    return `<table><tr><th>الفحص</th><th>القيمة</th><th>الحد</th><th>البند</th></tr>${C.map(c => `<tr>
      <td>${c.ok ? '<span class="tag t-ok">✓</span>' : c.warn ? '<span class="tag t-warn">⚠</span>' : '<span class="tag t-bad">✗</span>'} ${E(c.name)}</td>
      <td class="ltr">${E(c.val)}</td><td>${E(c.lim)}</td><td style="font-size:11px;color:var(--mut)">${E(c.clause)}</td></tr>`).join('')}</table>`;
  }
  const rbl = b => !b ? '—' : (b.n && b.s && Math.abs(1000 / b.n - b.s) < 2 ? b.n + 'Ø' + b.d + '/م (@' + b.s + ')' : b.s ? 'Ø' + b.d + '@' + b.s : (b.n || '') + 'Ø' + b.d);
  function stairsTab() {
    const L = allStairs();
    if (!L.length) return `<div class="card"><h3>🪜 الأدراج</h3><div class="note">ما لقيت درجاً بالملف — لا مقاطع «أبعاد وتسليح السلم»
      (درجات قائمة/نائمة) ولا قلبات بالمساقط (خطوط نائمات متوازية متساوية).</div></div>`;
    const secs = L.filter(x => x.sec), plans = L.filter(x => !x.sec);
    const nb = L.reduce((a, x) => a + (x.st.checks || []).filter(c => !c.ok && !c.warn).length, 0);
    const ni = L.reduce((a, x) => a + (x.st.issues || []).length, 0);
    return `<div class="card"><h3>🪜 الأدراج (${L.length}) — كل درج من منسوب طابقه حتى الطابق الذي فوقه</h3>
      <div class="kg">${kpi('من المقاطع', secs.length)}${kpi('من المساقط', plans.length)}${kpi('فحص لم يتحقق', nb, nb ? 'warn' : '')}${kpi('تعارض مكتوب/مرسوم', ni, ni ? 'warn' : '')}</div>
      <div class="note" style="margin-top:6px">المقطع: الدرجات (قائمة/نائمة) والبطن والبسطات والمناسيب والتسليح وجسور الإسناد تُقرأ من الرسم،
        وإذا المرسوم نصف طابق (قلبة حتى بسطة) <b>يُكمَّل</b> بقلبات بنفس القائمة والنائمة حتى منسوب الطابق الذي فوقه (القلبات المكمَّلة بلون بنفسجي).
        المسقط: القلبات من خطوط النائمات، واتجاه الصعود من أرقام الدرجات أو كلمة UP، والارتفاع من مناسيب الطوابق — وفتحة الدرج تُقطع من السقف.</div></div>
      <div class="card" style="margin-top:10px"><h3 id="cad_st_name">🧊 المجسم</h3>
        <div class="bar3d"><button data-sv="rebar">🧵 التسليح</button><button data-sv="only">🔩 التسليح فقط</button>
          <button data-sv="xray">🩻 أشعة</button><button data-sv="reset">🎯 الكاميرا</button></div>
        <div id="cad_st3d"></div><div class="pick" id="cad_st_pick">اضغط على قلبة أو بسطة أو جسر لترى تفاصيلها.</div>
        <div class="legend" style="margin-top:6px"><span><i style="background:#d9d4ca"></i>مقروء من اللوحة</span>
          <span><i style="background:#c7d2fe"></i>مكمَّل حتى منسوب الطابق</span><span><i style="background:#ef4444"></i>رئيسي</span>
          <span><i style="background:#3b82f6"></i>توزيع</span><span><i style="background:#22c55e"></i>علوي عند الانكسار</span></div></div>
      ${plans.length ? `<div class="card" style="margin-top:10px"><h3>🏢 أدراج المباني (من المساقط)</h3><div class="scroll"><table>
        <tr><th></th><th>المبنى · الطابق</th><th>من → إلى</th><th>القلبات</th><th>القائمة × العدد</th><th>النائمة</th><th>العرض</th><th>السماكة والحديد</th><th>المصدر</th></tr>
        ${plans.map(x => `<tr><td><button class="btn gh" style="padding:3px 8px" data-stv="${x.key}">🧊</button></td>
          <td>${E(x.b.name)} · ${E(x.f.name)}</td><td class="ltr">${lv(x.f.level)} → ${lv(x.f.level + x.st.H)}</td>
          <td>${x.st.flights.length}${x.st.completed ? ' <span class="tag t-warn">مكمَّل</span>' : ''}</td>
          <td class="ltr">${x.st.N} × ${N(x.st.R * 1000, 0)}</td><td class="ltr">${N(x.st.T * 1000, 0)}</td><td class="ltr">${N(x.st.width, 2)}</td>
          <td>${x.st.design ? E(x.st.design.waist + ' مم · ' + x.st.design.main + ' · توزيع ' + x.st.design.dist) : '—'}</td>
          <td style="font-size:11px">${E(x.st.src)}</td></tr>`).join('')}</table></div></div>` : ''}
      ${secs.length ? `<div class="sg" style="margin-top:10px">${secs.map(x => stairCard(x)).join('')}</div>` : ''}`;
  }
  function stairCard(x) {
    const st = x.st, C = st.checks || [];
    const bad = C.filter(c => !c.ok && !c.warn).length, wr = C.filter(c => c.warn).length;
    const rb = st.rebar || {}, FL = st.flights || [];
    return `<div class="sheet"><div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start">
        <b style="font-size:13px" dir="auto">🪜 ${E(st.title)}</b>
        <button class="btn gh" style="padding:3px 8px;white-space:nowrap" data-stv="${x.key}">🧊 المجسم</button></div>
      <div class="nt-m"><span class="tag">${E(TYPE[st.type] || st.type)}</span>${st.floor ? `<span class="tag">${E((FLOORS.find(f => f[0] === st.floor) || [0, st.floor])[1])}</span>` : ''}
        <span class="tag ${bad ? 't-bad' : 't-ok'}">${bad ? '✗ ' + bad : '✓'} فحوص</span>${wr ? `<span class="tag t-warn">⚠ ${wr}</span>` : ''}
        ${(st.issues || []).length ? `<span class="tag t-warn">تعارض ${st.issues.length}</span>` : ''}</div>
      <div class="note" style="margin:6px 0">الارتفاع <b class="ltr">${lv(st.z_floor)} → ${lv(st.z_floor + st.H)}</b> (${N(st.H, 2)} م) — ${E(st.H_src)}<br>
        ${st.n_risers} قائمة × <b class="ltr">${N(st.R * 1000, 0)}</b> مم · نائمة <b class="ltr">${N(st.T * 1000, 0)}</b> مم · العرض ${N(st.width, 2)} م (${E(st.width_src)})</div>
      ${stairSvg(Object.assign({}, st, { flights3d: st.flights3d }))}
      <div class="scroll" style="max-height:220px;margin-top:6px"><table><tr><th>#</th><th>قائمات</th><th>R×T مم</th><th>من → إلى</th><th>البطن</th><th>البسطة</th><th></th></tr>
        ${FL.map((f, i) => `<tr><td>${i + 1}</td><td>${f.n} ${f.s > 0 ? '↗' : '↖'}</td><td class="ltr">${N(f.R * 1000, 0)}×${N(f.T * 1000, 0)}</td>
          <td class="ltr">${lv(f.z0)} → ${lv(f.z1)}</td><td>${f.waist ? f.waist + ' مم' : '—'}</td><td>${f.land_top ? N(f.land_top, 2) + ' م' : '—'}</td>
          <td>${f.read ? '<span class="tag t-ok">مقروء</span>' : '<span class="tag t-warn">مكمَّل</span>'}</td></tr>`).join('')}</table></div>
      <div class="note" style="margin-top:6px">🧵 الحديد: رئيسي <b class="ltr">${rbl(rb.main)}</b> · توزيع <b class="ltr">${rbl(rb.dist)}</b> ·
        علوي <b class="ltr">${rbl(rb.top)}</b>${rb.stir ? ' · أتاري الجسر <b class="ltr">' + rbl(rb.stir) + '</b>' : ''}
        ${(st.beams || []).filter(b => b.h || b.desc).length ? '<br>🟩 جسور الإسناد: ' + st.beams.filter(b => b.h || b.desc).map(b =>
          E((b.mark || '') + ' ' + (b.h ? b.b + '×' + b.h : '') + (b.bars && b.bars.length ? ' ' + b.bars.join('+') : '') +
            (b.desc ? ' (علوي ' + (b.desc.top || '—') + ' / سفلي ' + (b.desc.bot || '—') + (b.desc.kind === 'cantilever' ? '، كابولي' : '') + ')' : ''))).join(' · ') : ''}
        ${(st.marks || []).length ? '<br>🏷️ علامات: <span class="ltr">' + E(st.marks.join(' · ')) + '</span>' : ''}
        ${st.design ? `<br>📐 التصميم بالكود: Mu=${N(st.design.Mu, 1)} kN·m/م · المطلوب ${E(st.design.main)} · توزيع ${E(st.design.dist)}` : ''}</div>
      <details style="margin-top:6px"><summary style="cursor:pointer;font-size:12.5px">فحوص ACI 318-19 والراحة (${C.length})</summary>${chkRows(C)}</details>
      ${(st.issues || []).length ? `<div class="warn" style="margin-top:6px"><b>⚠️ أخطاء/تعارضات باللوحة:</b><ul>${st.issues.map(i => `<li>${E(i)}</li>`).join('')}</ul></div>` : ''}
      ${(st.notes || []).length ? `<div class="note" style="margin-top:4px">${st.notes.map(E).join('<br>')}</div>` : ''}</div>`;
  }

  function pick(u) {
    const el = q('#cad_pick');
    if (!el) return;
    if (!u) { el.innerHTML = 'اضغط على أي عنصر لترى تفاصيله.'; return; }
    el.innerHTML = pickHtml(u);
  }
  function pickHtml(u) {
    const rb = u.rebar;
    const L = {
      col: () => `🟥 <b>عمود ${E(u.mark || '')}</b> · ${E(u.at)} · ${E(u.size)} مم · طابق ${E(u.floor)}<br>
        ${rb ? 'القضبان: <b class="ltr">' + bar(rb.main) + '</b> · الأتاري: <b class="ltr">' + tie(rb.ties) + '</b>' : 'الحديد غير مذكور بالجدول لهذا العمود'}
        ${u.how === 'assumed' ? '<br><span class="tag t-warn">مقترح على تقاطع محاور</span>' : u.how === 'in-wall' ? '<br><span class="tag t-ok">عمود ربط مغروس بالجدار</span>' : ''}
        ${u.outside ? '<br>ℹ️ أبعد من متر عن أي بلاطة مقروءة — مرسوم بالمسقط (عمود مدخل/مظلة أو حول فناء/فتحة) وما فوقه غير مرسوم كبلاطة' : ''}`,
      beam: () => `🟩 <b>جسر ${E(u.mark || '(بلا علامة)')}</b> · محور ${E(AX(u.axis || '—'))} · بحر ${N(u.span, 2)} م · ${E(u.size)} مم
        ${u.guess ? '<span class="tag t-warn">العمق تخمين</span>' : ''}<br>
        ${rb ? 'سفلي <b class="ltr">' + bar(rb.bot.cont) + (rb.bot.extra ? ' + ' + bar(rb.bot.extra) : '') + '</b> · علوي <b class="ltr">' +
          bar(rb.top.cont) + (rb.top.sup ? ' + ' + bar(rb.top.sup) : '') + '</b> · أتاري <b class="ltr">' + tie(rb.stir.end) + ' / ' + tie(rb.stir.mid) + '</b>'
          : 'لا حديد بالجدول لهذه العلامة'}`,
      slab: () => `⬜ <b>${u.drop ? 'تسقيط حول العمود (Drop Panel) ' + N(u.drop.s, 2) + '×' + N(u.drop.s, 2) + ' م × ' + u.drop.t + ' مم — ' : ''}بلاطة سقف ${E(u.floor)}</b> · ${u.t} مم
        ${u.sys ? '· <b>' + E(u.sys) + '</b>' : ''}${u.ribs ? ' · أعصاب ' + u.ribs.width + ' مم كل ' + N(u.ribs.spacing, 2) + ' م' + (u.ribs.two_way ? ' باتجاهين' : '') + ' + بلاطة علوية ' + u.ribs.topping + ' مم' : ''}
        · سفلي ${u.mesh && u.mesh.bot ? 'Ø' + u.mesh.bot.d + '@' + u.mesh.bot.s : '—'}
        · علوي ${u.mesh && u.mesh.top ? 'Ø' + u.mesh.top.d + '@' + u.mesh.top.s : '—'}`,
      strip: () => `🧱 <b>أساس شريطي</b> · العرض ${u.w} مم × السماكة ${u.h} مم · الطول ${N(u.L, 2)} م` +
        (u.P ? ` · الحمل الخدمي ${N(u.P, 0)} كن/م` : '') + (u.designed ? ' · <span class="tag t-warn">مصمَّم بالكود</span>' : ' · من الملف'),
      wall: () => u.parapet ? `🧱 <b>ستارة السطح</b> · ارتفاع ${N(u.parapet, 2)} م (مقاس من المقطع/الواجهة) · سماكة ${u.t} مم`
                            : `🧱 <b>جدار</b> · سماكة ${u.t} مم · طول ${N(u.L, 2)} م · طابق ${E(u.floor)}`,
      foot: () => `🟫 <b>أساس ${E(u.mark || '')}</b> · ${E(u.size)} · PD ${N(u.PD, 0)} / PL ${N(u.PL, 0)} كن · Pu ${N(u.Pu, 0)} كن ·
        ${E(u.bars)} · ${u.ok ? '✓ القص مقبول' : '✗ راجع'} <span class="tag t-warn">مصمَّم بالكود</span>`,
      stair: () => `🪜 <b>${u.spiral ? 'درج حلزوني' : u.landing ? 'بسطة' : 'قلبة ' + (u.flight || '')}</b> ${u.title ? '· ' + E(u.title) : ''} · ${E(u.floor || '')}<br>
        ${u.landing ? 'منسوب ' + lv(u.z) + ' · سماكة ' + (u.t || '—') + ' مم' :
          u.spiral ? u.spiral.n + ' درجة · Ø العمود ' + Math.round(u.spiral.r_core * 2000) + ' مم · نصف القطر ' + N(u.spiral.r_out, 2) + ' م' :
          (u.n || '') + ' قائمة × ' + N((u.R || 0) * 1000, 0) + ' مم · نائمة ' + N((u.T || 0) * 1000, 0) + ' مم · من ' + lv(u.z0) + ' إلى ' + lv(u.z1) +
          ' · البطن ' + (u.waist || '—') + ' مم'}
        ${u.read === false ? ' <span class="tag t-warn">مكمَّل حتى منسوب الطابق</span>' : ' <span class="tag t-ok">مقروء</span>'}
        ${u.rebar && u.rebar.main ? '<br>الحديد: رئيسي <b class="ltr">' + rbl(u.rebar.main) + '</b> · توزيع <b class="ltr">' + rbl(u.rebar.dist) + '</b>' : ''}
        ${u.design ? '<br>التصميم: ' + E(u.design.main) + ' · Mu=' + N(u.design.Mu, 1) + ' kN·m/م' : ''}`
    }[u.kind];
    return L ? L() : '';
  }

  function sendTab() {
    const B = cur();
    if (!B) return '<div class="note">لا مبنى.</div>';
    return `<div class="card"><h3>📤 أرسل المبنى لمعالج المشروع والتحليل</h3>
      <div class="f"><div><label>قدرة تحمّل التربة qa (كن/م²)</label><input type="number" id="cad_qa" value="${OPTS.qa}"></div>
        <div><label>الحمل الحي (كن/م²)</label><input type="number" step="0.5" id="cad_ll" value="${OPTS.LL}"></div></div>
      <button class="btn gh" id="cad_redesign" style="margin-top:6px">↻ أعد تصميم الأساسات بهذه القيم</button>
      <div class="note" style="margin-top:10px">الإرسال يبني مشروع المعالج على <b>مواقع أعمدة وجسور الطابق الأسفل</b> من هذا المبنى
        (${B.floors[0] ? B.floors[0].columns.length : 0} عمود) وعدد طوابقه (${B.floors.length}) وارتفاعها.
        تنبيه صريح: المعالج يصمّم بمقطع موحّد للأعمدة ولكل اتجاه جسور — التفاصيل الكاملة لكل عنصر تبقى هنا بهذا القسم.</div>
      <button class="btn" id="cad_send" style="margin-top:8px">📤 ابنِ مشروع المعالج على هذا المبنى</button></div>`;
  }

  function bind() {
    qa('#cad [data-bi]').forEach(b => b.addEventListener('click', () => { BI = +b.dataset.bi; SITE = false; drop3d(); render(); }));
    qa('#cad [data-site]').forEach(b => b.addEventListener('click', () => { SITE = true; drop3d(); TAB = '3d'; render(); tab('3d'); }));
    const mg = q('#cad_merge');
    if (mg) mg.addEventListener('click', async () => { OPTS.merge = !RES.merged; BI = 0; await safeRun(); });
    qa('#cad [data-dk]').forEach(s => s.addEventListener('change', async () => {
      const id = s.dataset.dk; OPTS.drawings[id] = Object.assign({}, OPTS.drawings[id], { kind: s.value || null }); await safeRun();
    }));
    qa('#cad [data-df]').forEach(s => s.addEventListener('change', async () => {
      const id = s.dataset.df; OPTS.drawings[id] = Object.assign({}, OPTS.drawings[id], { floor: s.value || null }); await safeRun();
    }));
    qa('#cad [data-fh]').forEach(i => i.addEventListener('change', async () => {
      const v = parseFloat(i.value);
      if (v >= 2.4 && v <= 12 && OPTS.floor_h[i.dataset.fh] !== v) { OPTS.floor_h[i.dataset.fh] = v; await safeRun(); }
    }));
    qa('#cad [data-def]').forEach(i => i.addEventListener('change', async () => {
      const m = i.dataset.def, v = i.value.trim();
      if (!/^\d{2,4}\s*[xX×*]\s*\d{2,4}$/.test(v)) { i.style.borderColor = '#f87171'; return; }
      OPTS.definitions = OPTS.definitions.filter(d => !d.toUpperCase().startsWith(m.toUpperCase() + ' ')).concat([m + ' = ' + v]);
      await safeRun();
    }));
    const dg = q('#cad_defs_go');
    if (dg) dg.addEventListener('click', async () => {
      OPTS.definitions = q('#cad_defs').value.split('\n').map(s => s.trim()).filter(Boolean);
      await safeRun();
    });
    const rd = q('#cad_redesign');
    if (rd) rd.addEventListener('click', async () => {
      OPTS.qa = parseFloat(q('#cad_qa').value) || 150; OPTS.LL = parseFloat(q('#cad_ll').value) || 3; await safeRun();
    });
    const sd = q('#cad_send');
    if (sd) sd.addEventListener('click', sendToWizard);
    qa('#cad [data-stv]').forEach(b => b.addEventListener('click', () => {
      showStair(b.dataset.stv); const h = q('#cad_st3d'); if (h && h.scrollIntoView) h.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const sst = { rebar: false, only: false, xray: false };
    qa('#cad [data-sv]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.sv;
      if (v === 'reset') return SVIEW && SVIEW.reset();
      sst[v] = !sst[v]; b.classList.toggle('on', sst[v]); SVIEW && SVIEW[v](sst[v]);
    }));
    if (TAB === 'stairs' && q('#cad_st3d')) showStair(STSEL);
  }

  let RUNNING = null;
  async function safeRun() {
    if (RUNNING) { await RUNNING; }                    // لا تحليلان متداخلان (ملف ضخم = ثوانٍ لكل تحليل)
    RUNNING = safeRun0();
    try { await RUNNING; } finally { RUNNING = null; }
  }
  async function safeRun0() {
    try { await run(); } catch (e) { console.error(e); msg('✗ ' + E(e.message || e), 'bad'); }
  }

  async function sendToWizard() {
    const B = cur();
    if (!B || !B.floors.length) return;
    // الطابق الأرضي (فوق السرداب إن وُجد) — ارتفاعه هو الطابق النموذجي المقاس
    const f = B.floors.find(q => q.level >= (B.ffl0 || 0) - 0.01) || B.floors[0];
    // عقد وجسور الطابق الأسفل بإحداثيات المبنى — نفس صيغة __frame_override التي يقبلها المعالج
    const nodes = f.columns.map((c, k) => ({ k: k, x: c.x, y: c.y, b: c.b, h: c.h, shape: c.shape, D: c.shape === 'circ' ? c.b / 1000 : null }));
    const near = (x, y) => { let bi = -1, bd = 1e9; nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; bi = i; } }); return bd < 0.8 ? bi : -1; };
    const beams = [];
    f.beams.forEach(b => {
      const a = near(b.x1, b.y1), c = near(b.x2, b.y2);
      if (a >= 0 && c >= 0 && a !== c) beams.push({ dir: b.o === 'h' ? 'x' : 'y', a: a, b: c, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, span: b.span });
    });
    const area = f.slab.rects.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0);
    const xs = B.grid.x.map(a => a.pos), ys = B.grid.y.map(a => a.pos);
    window.__frame_override = { nodes, beams, lines: [], axes_x: xs, axes_y: ys,
      boundary: [[0, 0], [B.size[0], 0], [B.size[0], B.size[1]], [0, B.size[1]]] };
    window.__grid_override = null;
    window.__footprint_override = Math.round(area * 100) / 100;
    window.__stairs = []; window.__shafts = [];
    drop3d();
    if (typeof go === 'function') go('wizard'); else location.hash = '#wizard';
    await new Promise(r => setTimeout(r, 300));
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('w_area', Math.round(area)); set('w_cov', 1); set('w_floors', B.floors.length); set('w_hs', f.h);
    // PAGES ثابت عام بـapp.js (ليس خاصية على window) — يُقرأ مباشرة وقت الضغط
    if (typeof PAGES !== 'undefined' && PAGES.wizard && PAGES.wizard.run) await PAGES.wizard.run();
  }

  return { html, init, load, state: () => ({ RES, BI, OPTS }), view: () => VIEW, tab };
})();

window.CADPAGE = CADPAGE;
