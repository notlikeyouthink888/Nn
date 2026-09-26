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
                 elev: 'واجهة', site: 'موقع', arch: 'مسقط معماري' };
  const FLOORS = [['basement', 'السرداب'], ['ground', 'الأرضي'], ['mezzanine', 'الميزانين'], ['first', 'الأول'],
                  ['second', 'الثاني'], ['third', 'الثالث'], ['fourth', 'الرابع'], ['fifth', 'الخامس'],
                  ['sixth', 'السادس'], ['seventh', 'السابع'], ['eighth', 'الثامن'], ['ninth', 'التاسع'],
                  ['tenth', 'العاشر'], ['typical', 'المتكرر'], ['roof', 'السطح']];
  const TABS = [['file', '📂 الملف'], ['sheets', '🗺️ المخططات'], ['axes', '📏 المحاور'], ['tables', '📋 الجداول'],
                ['floors', '🏢 الطوابق'], ['layers', '🧠 الطبقات والتعريفات'], ['3d', '🧊 المجسم 3D'],
                ['send', '📤 إرسال للتحليل']];

  function css() {
    if (q('#cadcss')) return;
    const st = document.createElement('style');
    st.id = 'cadcss';
    st.textContent = `
#cad .ctabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
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
          <input type="file" id="cad_file" accept=".dwg,.dxf"></div></div>
        <div id="cad_msg" class="note" style="margin-top:8px">ارفع ملف المخططات: لوحات تسليح السقوف،
          مفاتيح الجسور والأعمدة، وجداول الجسور والأعمدة — يُقرأ كل شي ويُركّب المبنى تلقائياً.</div></div>
      <div class="ctabs">${TABS.map(([k, t]) => `<button data-t="${k}" class="${k === TAB ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${TABS.map(([k]) => `<div class="cp${k === TAB ? ' on' : ''}" data-p="${k}"></div>`).join('')}
    </div>`;
  }

  function init() {
    css();
    const f = q('#cad_file');
    if (f) f.addEventListener('change', () => f.files && f.files[0] && load(f.files[0]));
    qa('#cad .ctabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.t)));
    render();
    // مغادرة الصفحة = تحرير العارض (لا يبقى WebGL معلّقاً)
    window.addEventListener('hashchange', () => { if (location.hash !== '#cad') drop3d(); });
  }

  function msg(s, cls) {
    const m = q('#cad_msg');
    if (m) { m.innerHTML = s; m.style.color = cls === 'bad' ? '#fca5a5' : ''; }
  }

  async function load(file) {
    if (BUSY) return;
    BUSY = true;
    try {
      NAME = file.name;
      msg('قراءة الملف… (' + (file.size / 1048576).toFixed(2) + ' ميغا)');
      RAW = await PlanIO.read(file, t => msg(E(t)), { full: true });
      if (!RAW || !RAW.ents || !RAW.ents.length) throw new Error('الملف لا يحوي عناصر رسم مقروءة');
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
    const r = await fetch('/api/cad/read', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ents: RAW.ents, layers: RAW.layers, insunits: RAW.insunits, opts: OPTS }) });
    const j = await r.json();
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

  const cur = () => RES && RES.buildings && RES.buildings[BI];

  function tab(t) {
    TAB = t;
    qa('#cad .ctabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    qa('#cad .cp').forEach(p => p.classList.toggle('on', p.dataset.p === t));
    if (t === '3d') show3d(); else if (VIEW) { /* يبقى مبنياً لكن لا يُرسم وهو مخفي */ }
  }

  function render() {
    const P = k => q(`#cad .cp[data-p="${k}"]`);
    if (!P('file')) return;
    if (!RES) {
      P('file').innerHTML = `<div class="card"><h3>ماذا يفهم هذا القسم؟</h3>${dictHtml(true)}</div>`;
      ['sheets', 'axes', 'tables', 'floors', 'layers', '3d', 'send'].forEach(k =>
        P(k).innerHTML = '<div class="note">ارفع الملف أولاً.</div>');
      return;
    }
    P('file').innerHTML = fileTab();
    P('sheets').innerHTML = sheetsTab();
    P('axes').innerHTML = axesTab();
    P('tables').innerHTML = tablesTab();
    P('floors').innerHTML = floorsTab();
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
      h += `<div class="bsel">المبنى: ${bs.map((b, i) => `<button class="btn ${i === BI ? '' : 'gh'}" data-bi="${i}">
        ${E(b.name)} · <span class="ltr">${E(b.axes_sig)}</span> · ${b.floors.map(f => E(f.name)).join('/')}</button>`).join('')}</div>`;
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
        ${kpi('المقياس', N(RES.scale, 4) + ' م/وحدة', RES.scale_src === 'الأبعاد المكتوبة' ? 'ok' : 'warn')}
        ${kpi('أبعاد المبنى', B ? N(B.size[0], 1) + ' × ' + N(B.size[1], 1) + ' م' : '—')}
        ${kpi('الارتفاع', B ? N(B.height, 1) + ' م' : '—')}
      </div>
      <div class="note" style="margin-top:8px">مصدر المقياس: <b>${E(RES.scale_src)}</b>${RES.angle ? ' · دُوِّر ' + N(RES.angle, 1) + '°' : ''}
        · ${RES.n_ents.toLocaleString('en-US')} عنصر بفضاء النموذج (البلوكات مفكوكة، لوحات الورق مستبعدة).</div>
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
        ${['elev', 'section', 'detail', 'site'].includes(dw.kind)
          ? `<div class="note" style="margin-top:6px">${dw.kind === 'elev'
              ? 'واجهة' + ({ S: ' جنوبية', N: ' شمالية', E: ' شرقية', W: ' غربية' }[dw.view] || '') +
                (dw.view ? ' — تظهر على المبنى بالمجسم (🏛️ الواجهات على المبنى)' : ' — حدّد جهتها بعنوانها لتُركَّب على المبنى')
              : dw.kind === 'section' ? 'مقطع' + (dw.letter ? ' ' + dw.letter + '-' + dw.letter : '') +
                ' — يُركَّب على خط قطعه بالمسقط، ومنه تُقاس المناسيب وسماكة البلاطة'
              : 'لوحة عرض (تفصيلة) — مرجع للقراءة، لا تدخل تركيب العناصر'}${dw.levels && dw.levels.k
              ? `<div>📏 ${dw.levels.marks.filter(m => m.ok).length} علامة منسوب مقروءة${(dw.levels.slabs || []).length ? ' · ' + dw.levels.slabs.length + ' بلاطة مرسومة' : ''}${(dw.levels.axes || []).length ? ' · محاور ' + dw.levels.axes.map(a => a.name).join(' ') : ''}</div>` : ''}</div>`
          : `<div class="note" style="margin-top:6px">${dw.ax.x.length}×${dw.ax.y.length} محور · ${dw.columns.length} عمود ·
          ${dw.beams.length} بحر جسر (${dw.beams.filter(b => b.mark).length} بعلامة) · ${dw.openings.length} فتحة ·
          ${dw.callouts.length} نداء تسليح${(dw.walls || []).length && dw.kind === 'arch' ? ' · ' + dw.walls.length + ' جدار' : ''}${dw.thickness ? ' · بلاطة ' + dw.thickness + ' مم' : ''}</div>`}
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
    return (bt || ct) ? `<div class="note">عدّل مقطع أي جسر بالجدول (مثلاً 350x800) فيُعاد التركيب بمقطعك — تعديلك يتقدّم على الملف.</div>${bt}${ct}`
      : '<div class="note">ما لقيت جداول بالملف (SCHEDULE OF BEAMS / Columns Reinforcing Schedule).</div>';
  }

  function floorsTab() {
    const B = cur();
    if (!B) return '<div class="note">لا مبنى.</div>';
    const LV = z => `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block">${Math.abs(z) < 0.005 ? '±0.00' : (z > 0 ? '+' : '') + N(z, 2)}</span>`;
    const HS = { measured: '<span class="tag t-ok">📏 مقاس من الواجهة/المقطع</span>', user: '<span class="tag t-ok">✍️ تعديلك</span>',
                 default: '<span class="tag t-warn">افتراضي 3.5</span>' };
    const L = B.levels;
    const lvCard = L ? `<div class="card" style="margin-top:10px"><h3>📏 المناسيب مقاسة من الواجهة والمقطع (لوحة ${L.src.map(i => i + 1).join(' و')})</h3>
      <div class="scroll"><table><tr><th>الطابق</th><th>المنسوب</th><th>الارتفاع م</th><th>الصافي م</th><th>التحقق</th></tr>
      ${L.keys.map((k, i) => { const c = (L.checks || [])[i] || {}; const f = B.floors.find(q => q.key === k);
        return `<tr><td>${E(f ? f.name : k)}</td><td>${LV(L.chain[i])}${L.from_slab[i] ? ' ▭' : ''}</td>
          <td class="ltr">${N(L.heights[i], 2)}</td><td class="ltr">${c.clear != null ? N(c.clear, 2) : '—'}</td>
          <td>${c.h_dim || c.clear_dim ? '<span class="tag t-ok">✓ مطابق لبُعد مكتوب</span>' : '<span class="tag t-warn">من العلامات</span>'}</td></tr>`; }).join('')}
      <tr><td>السطح</td><td>${LV(L.chain[L.chain.length - 1])}${L.from_slab[L.chain.length - 1] ? ' ▭' : ''}</td><td colspan="3"></td></tr></table></div>
      <div class="note" style="margin-top:6px;line-height:1.9">
        ${L.t ? `سماكة البلاطة من المقطع <b class="ltr">${L.t} مم</b>${L.fin ? ' + تشطيبات <b class="ltr">' + L.fin + ' مم</b> (فرشة + بلاط)' : ''} · ` : ''}
        ${L.ngl && Math.abs(B.ffl0 || 0) > 0.005 ? `الأرض الطبيعية <b class="ltr">±0.00</b> والطابق الأرضي مرفوع <b class="ltr">${LV(B.ffl0)}</b> — الأساسات تُقاس من الأرض الطبيعية · ` : ''}
        ${(L.mids || []).length ? `بسطات درج: ${L.mids.map(LV).join(' · ')} · ` : ''}
        ${(L.extra || []).length ? `فوق السطح (غرفة درج/ستارة): ${L.extra.map(LV).join(' · ')}` : ''}
        ${(L.conflicts || []).map(c => `<div>⚠️ العلامة <b class="ltr">${LV(c.v)}</b> باللوحة ${c.src + 1} مرسومة فعلياً عند <b class="ltr">${LV(c.drawn)}</b> — اعتُمد الرسم.</div>`).join('')}
        <div>▭ = منسوب مؤكَّد ببلاطة مرسومة بالمقطع. غيّر أي ارتفاع أدناه ويُعاد التركيب (تعديلك يتقدّم على القياس).</div></div></div>` : '';
    return `<div class="card">${bsel()}</div>` + lvCard + B.floors.map(f => {
      const s = f.slab, m = s.mesh || {};
      return `<div class="card" style="margin-top:10px"><h3>سقف الطابق ${E(f.name)}
        <span class="tag t-ok">منسوب ${f.level >= 0 ? '+' : ''}${N(f.level, 2)} م</span> ${HS[f.h_src] || ''}</h3>
        <div class="f" style="margin-bottom:8px"><div><label>ارتفاع الطابق (م)</label>
          <input type="number" step="0.05" min="2.4" max="12" class="sm" data-fh="${f.key}" value="${f.h}"></div></div>
        ${f.beams_assumed ? '<div class="note" style="margin-bottom:6px">⚠️ لا مخطط جسور لهذا السقف — الجسور مفترضة بين الأعمدة (250 مم، عمق ≈ البحر/12) ومعلَّمة «تخمين». ارفع مخطط الجسور أو عرّفها بتبويب «التعريفات».</div>' : ''}
        <div class="kg">${kpi('أعمدة', f.columns.length)}${kpi('بحور جسور', f.beams.length, f.beams_assumed ? 'warn' : '')}
          ${(f.walls || []).length ? kpi('جدران', f.walls.length) : ''}
          ${kpi(f.t_src === 'section' ? 'بلاطة (من المقطع)' : 'بلاطة', s.t + ' مم', s.t_from_title || f.t_src === 'section' ? 'ok' : 'warn')}${kpi('فتحات', s.openings.length)}
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

  function view3dTab() {
    const B = cur();
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
    const B = cur(), host = q('#cad3d');
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

  function drop3d() { if (VIEW) { try { VIEW.dispose(); } catch (e) { /* */ } VIEW = null; } }

  function pick(u) {
    const el = q('#cad_pick');
    if (!el) return;
    if (!u) { el.innerHTML = 'اضغط على أي عنصر لترى تفاصيله.'; return; }
    const rb = u.rebar;
    const L = {
      col: () => `🟥 <b>عمود ${E(u.mark || '')}</b> · ${E(u.at)} · ${E(u.size)} مم · طابق ${E(u.floor)}<br>
        ${rb ? 'القضبان: <b class="ltr">' + bar(rb.main) + '</b> · الأتاري: <b class="ltr">' + tie(rb.ties) + '</b>' : 'الحديد غير مذكور بالجدول لهذا العمود'}`,
      beam: () => `🟩 <b>جسر ${E(u.mark || '(بلا علامة)')}</b> · محور ${E(AX(u.axis || '—'))} · بحر ${N(u.span, 2)} م · ${E(u.size)} مم
        ${u.guess ? '<span class="tag t-warn">العمق تخمين</span>' : ''}<br>
        ${rb ? 'سفلي <b class="ltr">' + bar(rb.bot.cont) + (rb.bot.extra ? ' + ' + bar(rb.bot.extra) : '') + '</b> · علوي <b class="ltr">' +
          bar(rb.top.cont) + (rb.top.sup ? ' + ' + bar(rb.top.sup) : '') + '</b> · أتاري <b class="ltr">' + tie(rb.stir.end) + ' / ' + tie(rb.stir.mid) + '</b>'
          : 'لا حديد بالجدول لهذه العلامة'}`,
      slab: () => `⬜ <b>بلاطة سقف ${E(u.floor)}</b> · ${u.t} مم · سفلي ${u.mesh && u.mesh.bot ? 'Ø' + u.mesh.bot.d + '@' + u.mesh.bot.s : '—'}
        · علوي ${u.mesh && u.mesh.top ? 'Ø' + u.mesh.top.d + '@' + u.mesh.top.s : '—'}`,
      wall: () => u.parapet ? `🧱 <b>ستارة السطح</b> · ارتفاع ${N(u.parapet, 2)} م (مقاس من المقطع/الواجهة) · سماكة ${u.t} مم`
                            : `🧱 <b>جدار</b> · سماكة ${u.t} مم · طول ${N(u.L, 2)} م · طابق ${E(u.floor)}`,
      foot: () => `🟫 <b>أساس ${E(u.mark || '')}</b> · ${E(u.size)} · PD ${N(u.PD, 0)} / PL ${N(u.PL, 0)} كن · Pu ${N(u.Pu, 0)} كن ·
        ${E(u.bars)} · ${u.ok ? '✓ القص مقبول' : '✗ راجع'} <span class="tag t-warn">مصمَّم بالكود</span>`
    }[u.kind];
    el.innerHTML = L ? L() : '';
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
    qa('#cad [data-bi]').forEach(b => b.addEventListener('click', () => { BI = +b.dataset.bi; drop3d(); render(); }));
    const mg = q('#cad_merge');
    if (mg) mg.addEventListener('click', async () => { OPTS.merge = !RES.merged; BI = 0; await safeRun(); });
    qa('#cad [data-dk]').forEach(s => s.addEventListener('change', async () => {
      const id = s.dataset.dk; OPTS.drawings[id] = Object.assign({}, OPTS.drawings[id], { kind: s.value || null }); await safeRun();
    }));
    qa('#cad [data-df]').forEach(s => s.addEventListener('change', async () => {
      const id = s.dataset.df; OPTS.drawings[id] = Object.assign({}, OPTS.drawings[id], { floor: s.value || null }); await safeRun();
    }));
    qa('#cad [data-fh]').forEach(i => i.addEventListener('change', async () => {
      const v = parseFloat(i.value); if (v >= 2.4 && v <= 12) { OPTS.floor_h[i.dataset.fh] = v; await safeRun(); }
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
  }

  async function safeRun() {
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
