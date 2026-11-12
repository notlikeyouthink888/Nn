/* تجربة قسم الأوتوكاد — طبقة إضافية فوق cadpage.js لا تغيّر أي قراءة ولا أي تبويب موجود:
     ١) منطقة رفع بالسحب والإفلات + «جرّب بملف تجريبي» (ملف من صنع المنصة عبر ‎/api/cad/demo)
     ٢) شريط تقدّم بالمراحل: قراءة ← رفع ← تحليل وتركيب ← جاهز (يقرأ نفس رسائل cadpage)
     ٣) «جودة القراءة»: فحص سريع لكل ما يعتمد عليه التركيب، وكل بند يودّيك لتبويبه
     ٤) تبويبات بصف واحد ينسحب، مثبّتة بالأعلى، وعلى كل تبويب عدّاد
     ٥) بحث بكل ما انقرأ من الملف (علامة، ملاحظة، خلية جدول…) مع تظليل النتائج
     ٦) تكبير أي لوحة: عجلة/قرص للتقريب، سحب للتحريك، ملء الشاشة
     ٧) المجسم: فصل الطوابق، حفظ صورة، ملء الشاشة
     ٨) تنزيل أي جدول CSV (يفتح بإكسل بالعربي)
   كل دالة هنا داخل try: أي خطأ يبقى داخل هذه الطبقة والصفحة الأصلية تكمل شغلها. */
const CADUX = (() => {
  const q = (s, r) => (r || document).querySelector(s), qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const safe = fn => function () { try { return fn.apply(this, arguments); } catch (e) { console.error('cadux', e); } };
  let H = null, T0 = 0, TICK = 0, STEP = -1, FIND = '', DEMO = false;
  const STEPS = ['قراءة الملف', 'الرفع', 'التحليل والتركيب', 'جاهز'];

  /* ------------------------------------------------------------ ١) منطقة الرفع */
  function uploadHtml() {
    return `<div class="card cx-up" id="cad_up"><h3>🧩 الأوتوكاد — اقرأ مجموعة مخططاتك وركّب المبنى</h3>
      <div class="cx-drop" id="cad_drop" tabindex="0" role="button" aria-label="اختيار ملفات المخططات">
        <div class="cx-ic">📐</div>
        <div class="cx-dt"><b>اسحب ملفات DWG أو DXF وأفلتها هنا</b>
          <small>تقدر تختار أكثر من ملف مرة وحدة (معماري + إنشائي، أو مباني المشروع كلها) — تندمج بمشروع واحد.</small></div>
        <div class="cx-db"><button class="btn" id="cad_pick_btn" type="button">📂 اختيار ملفات</button>
          <button class="btn gh" id="cad_demo_btn" type="button" title="مبنى مكاتب بطابقين من صنع المنصة — حتى تشوف القسم شلون يشتغل">🧪 جرّب بملف تجريبي</button>
          <button class="btn gh" id="cad_add_btn" type="button" style="display:none">➕ أضف ملفاً للمشروع</button></div>
        <input type="file" id="cad_file" accept=".dwg,.dxf" multiple class="cx-hide" aria-label="ملف DWG أو DXF">
        <input type="file" id="cad_add" accept=".dwg,.dxf" multiple class="cx-hide" aria-label="ملف إضافي">
      </div>
      <div class="cx-how" id="cad_how"><span><i>1</i>ارفع لوحات المشروع</span><span><i>2</i>المنصة تقرا المحاور والعناوين والجداول وتركّب المبنى</span><span><i>3</i>راجع، افحص الحديد، وأرسل للتحليل</span></div>
      <div class="cx-prog" id="cad_prog" hidden><div class="cx-steps">${STEPS.map((s, i) => `<span data-s="${i}"><i>${i + 1}</i>${s}</span>`).join('')}</div>
        <div class="cx-bar"><i></i></div><div class="cx-time" id="cad_time"></div></div>
      <div id="cad_msg" class="note cx-msg">ارفع ملف المخططات: لوحات تسليح السقوف، مفاتيح الجسور والأعمدة، وجداول الجسور والأعمدة — يُقرأ كل شي ويُركّب المبنى تلقائياً.</div></div>`;
  }
  const loadDemo = safe(async () => {
    const b = q('#cad_demo_btn'); if (b) b.disabled = true;
    try {
      progress('قراءة الملف التجريبي…');
      const r = await fetch('/api/cad/demo');
      if (!r.ok) throw new Error('الملف التجريبي غير متوفر (الحالة ' + r.status + ')');
      const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'demo.dxf';
      await H.load([new File([await r.blob()], name, { type: 'application/dxf' })], false);
      DEMO = true; afterRender(H.state().RES, (H.state().RES || {}).buildings ? H.state().RES.buildings[H.state().BI] : null);
    } catch (e) {
      const m = q('#cad_msg'); if (m) { m.textContent = '✗ ' + (e.message || e); m.style.color = '#fca5a5'; } progress('✗', 'bad');
    } finally { if (b) b.disabled = false; }
  });

  /* ------------------------------------------------------------ ٢) التقدّم بالمراحل */
  const progress = safe((text, cls) => {
    const box = q('#cad_prog'); if (!box) return;
    const t = String(text || '').replace(/<[^>]+>/g, '');
    let s = STEP;
    if (/^✓/.test(t)) s = 3;
    else if (/قراءة|فك|محرّك|تحويل/.test(t) && !/تحليل/.test(t)) s = 0;
    else if (/تجهيز الرفع|^رفع|ضغط/.test(t)) s = 1;
    else if (/تحليل|يحلّل|بانتظار|إعادة المحاولة/.test(t)) s = 2;
    const bad = cls === 'bad' || /^✗/.test(t), warn = /^⚠️/.test(t) && s < 0;
    if (s < 0 && !bad) return;
    if (STEP < 0 || (s === 0 && STEP >= 2)) T0 = performance.now();           // بداية عملية جديدة
    STEP = s;
    box.hidden = false; box.classList.toggle('bad', bad); box.classList.toggle('done', s === 3 && !bad);
    qa('.cx-steps span', box).forEach(el => { const i = +el.dataset.s; el.className = i < s || (s === 3 && !bad) ? 'ok' : i === s ? (bad ? 'bad' : 'on') : ''; });
    q('.cx-bar i', box).style.width = (bad ? Math.max(8, s * 33) : [14, 42, 78, 100][Math.max(0, s)]) + '%';
    const up = q('#cad_up'); if (up) up.classList.toggle('busy', s < 3 && !bad);
    clearInterval(TICK);
    const tm = q('#cad_time'), sec = () => ((performance.now() - T0) / 1000).toFixed(0);
    if (s < 3 && !bad && !warn) { tm.textContent = sec() + ' ث'; TICK = setInterval(() => { if (!document.body.contains(tm)) return clearInterval(TICK); tm.textContent = sec() + ' ث'; }, 1000); }
    else { tm.textContent = ''; STEP = -1; if (s === 3 && !bad) setTimeout(() => { if (STEP === -1 && q('#cad_prog')) q('#cad_prog').hidden = true; }, 2600); }
  });

  /* ------------------------------------------------------------ ٣) جودة القراءة + ٤) عدّادات التبويبات */
  function healthItems(R, B) {
    const out = [], dws = R.drawings || [], ids = B ? new Set(B.drawings) : null, mine = dws.filter(d => !ids || ids.has(d.id));
    const plans = dws.filter(d => d.kind && d.kind !== 'unknown'), untitled = dws.filter(d => !d.title_trusted && !d.title);
    const scaleWarn = (R.warnings || []).some(w => /المقياس/.test(w));
    out.push({ k: 'file', st: scaleWarn ? 'warn' : 'ok', ic: '📐', t: 'المقياس', v: (R.scale ? (+R.scale).toFixed(R.scale < 0.1 ? 4 : 3).replace(/\.?0+$/, '') : '—') + ' م/وحدة', d: 'المصدر: ' + (R.scale_src || '—') + (scaleWarn ? ' — تأكد منه' : '') });
    out.push({ k: 'sheets', st: untitled.length ? 'warn' : dws.length ? 'ok' : 'bad', ic: '🗺️', t: 'اللوحات', v: dws.length + ' لوحة', d: untitled.length ? untitled.length + ' بلا عنوان — حدّد نوعها' : plans.length + ' معروفة النوع' });
    const nx = B && B.grid ? (B.grid.x || []).length : 0, ny = B && B.grid ? (B.grid.y || []).length : 0;
    out.push({ k: 'axes', st: nx > 1 && ny > 1 ? 'ok' : 'warn', ic: '📏', t: 'المحاور', v: nx && ny ? nx + ' × ' + ny : '—', d: B && B.axes_sig ? B.axes_sig : 'ما انقرت محاور — التركيب بمواقع الأعمدة' });
    const fl = B ? B.floors || [] : [], nc = fl.reduce((a, f) => a + (f.columns || []).length, 0), nb = fl.reduce((a, f) => a + (f.beams || []).length, 0);
    const guess = fl.reduce((a, f) => a + (f.beams || []).filter(b => b.guess).length, 0), noMark = fl.reduce((a, f) => a + (f.columns || []).filter(c => !c.mark).length, 0);
    out.push({ k: 'floors', st: !fl.length ? 'bad' : guess || noMark ? 'warn' : 'ok', ic: '🏢', t: 'المبنى', v: fl.length + ' طوابق · ' + nc + ' عمود · ' + nb + ' بحر',
      d: !fl.length ? 'ما تركّب مبنى' : guess ? guess + ' بحر مقطعه تخمين (بلا علامة)' : noMark ? noMark + ' عمود بلا علامة' : 'كل العناصر بعلاماتها' });
    const sb = Object.keys((R.schedules && R.schedules.beams) || {}).length, scn = Object.keys((R.schedules && R.schedules.columns) || {}).length;
    out.push({ k: 'tables', st: sb || scn ? 'ok' : 'warn', ic: '📋', t: 'الجداول', v: sb + ' جسر · ' + scn + ' عمود', d: sb || scn ? (R.tables || []).length + ' جدول مرسوم بالملف' : 'ما لقيت جدول جسور/أعمدة — المقاطع من العلامات والتعريفات' });
    const unk = (R.unknown || []).length, wr = (R.warnings || []).length;
    out.push({ k: 'file', st: unk ? 'warn' : 'ok', ic: '🔍', t: 'غير متعرَّف عليه', v: unk ? unk + ' بند' : 'لا شي', d: wr ? wr + ' تنبيه بتبويب «الملف»' : 'ماكو تنبيهات' });
    let au = null;
    try { if (window.CADAUDIT && B) au = CADAUDIT.audit(R, B, H.state().OPTS).sum; } catch (e) { au = null; }
    if (au) out.push({ k: 'audit', st: au.fail ? 'bad' : au.warn ? 'warn' : 'ok', ic: '✅', t: 'فحص الحديد', v: au.ok + ' مطابق', d: au.fail ? au.fail + ' مخالف · ' + au.warn + ' توصية' : au.warn ? au.warn + ' توصية' : 'كله مطابق ACI 318-19' });
    return { out, au, mine };
  }
  function badges(R, B, au) {
    const n = {}, fl = B ? B.floors || [] : [];
    if (R) {
      n.sheets = (R.drawings || []).length; n.tables = (R.tables || []).length; n.notes = (R.notes || []).length; n.floors = fl.length;
      n.axes = B && B.grid ? (B.grid.x || []).length + (B.grid.y || []).length : 0;
      n.stairs = (B && B.stairs ? B.stairs.length : 0) + fl.reduce((a, f) => a + ((f.stairs || []).length), 0);
      n.layers = (R.definitions || []).length;
    }
    qa('#cad .ctabs button').forEach(b => {
      let i = q('i.cx-bd', b); if (!i) { i = document.createElement('i'); i.className = 'cx-bd'; b.appendChild(i); }
      const k = b.dataset.t; let v = n[k], cls = '';
      if (k === 'audit' && au) { v = au.fail || au.warn || '✓'; cls = au.fail ? 'bad' : au.warn ? 'warn' : 'ok'; }
      if (k === 'file' && R) { v = (R.warnings || []).length + (R.unknown || []).length; cls = v ? 'warn' : ''; }
      i.textContent = v ? v : ''; i.className = 'cx-bd ' + cls; i.hidden = !v;
    });
  }
  const afterRender = safe((R, B) => {
    const box = q('#cad_health'); if (!box) return;
    const up = q('#cad_up'); if (up) up.classList.toggle('has', !!R);
    if (!R) { box.innerHTML = ''; badges(null, null, null); return; }
    const h = healthItems(R, B), rd = h.out.filter(x => x.k !== 'audit');           // حالة «القراءة» من بنود القراءة فقط — مخالفات الحديد شأن اللوحة لا القارئ
    const bad = rd.filter(x => x.st === 'bad').length, warn = rd.filter(x => x.st === 'warn').length;
    box.innerHTML = `<div class="cx-health ${bad ? 'bad' : warn ? 'warn' : 'ok'}">
      <div class="cx-hh"><b>${bad ? '⚠️ القراءة ناقصة' : warn ? '🟡 القراءة تمام — وأكو ' + warn + ' ' + (warn === 1 ? 'بند يستاهل مراجعة' : 'بنود تستاهل مراجعة') : '🟢 القراءة كاملة'}</b>
        <span>${B ? E(B.name || '') + (B.size ? ' · ' + (+B.size[0]).toFixed(1) + ' × ' + (+B.size[1]).toFixed(1) + ' م' : '') : ''}</span>
        <div class="cx-find"><input type="search" id="cad_find" placeholder="🔎 ابحث بالملف: علامة، ملاحظة، خلية جدول…" value="${E(FIND)}" aria-label="بحث بالملف"><div id="cad_find_r"></div></div>
        <button class="btn" data-cx-go="3d">🧊 افتح المجسم</button></div>
      ${DEMO ? '<div class="cx-demo">🧪 هذا ملف تجريبي من صنع المنصة (مبنى مكاتب بطابقين). بيه <b>خطأ تسليح مقصود واحد</b> — عمود C1 بالطابق الأول — حتى تشوف «✅ فحص الحديد» شلون يلقاه.</div>' : ''}
      <div class="cx-chips">${h.out.map(x => `<button class="cx-chip ${x.st}" data-cx-go="${x.k}" title="افتح التبويب"><i>${x.ic}</i><span><b>${E(x.t)}: ${E(x.v)}</b><small>${E(x.d)}</small></span></button>`).join('')}</div></div>`;
    badges(R, B, h.au);
    tableTools(); extras3d(); sheetHints();
    if (FIND) find(FIND, true);
  });

  /* ------------------------------------------------------------ ٥) البحث بالملف */
  const SKIP = /^(SCRIPT|STYLE|SELECT|OPTION|TEXTAREA|INPUT|svg|BUTTON)$/i;
  function clearHits() { qa('#cad mark.cx-hit').forEach(m => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); }); }
  function textNodes(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(n) {
      for (let p = n.parentNode; p && p !== root; p = p.parentNode) if (SKIP.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
      return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    let n; while ((n = w.nextNode())) out.push(n);
    return out;
  }
  const norm = s => String(s).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  const find = safe((text, quiet) => {
    FIND = String(text || '').trim();
    const res = q('#cad_find_r'); if (!res) return;
    clearHits();
    const nq = norm(FIND);
    if (nq.length < 2) { res.innerHTML = ''; res.hidden = true; return; }
    const tabs = qa('#cad .ctabs button').map(b => [b.dataset.t, b.childNodes[0] ? b.childNodes[0].nodeValue : b.textContent]), rows = [];
    tabs.forEach(([k, name]) => {
      const p = q(`#cad .cp[data-p="${k}"]`); if (!p) return;
      let n = 0;
      textNodes(p).forEach(node => {
        const src = node.nodeValue, low = norm(src); let i = low.indexOf(nq); if (i < 0) return;
        const frag = document.createDocumentFragment(); let last = 0;          // norm يحافظ على الطول إلا التشكيل — نطابق على النص بلا تشكيل
        const plain = src.replace(/[ً-ْـ]/g, ''), lowp = norm(plain); i = lowp.indexOf(nq);
        while (i >= 0) {
          frag.appendChild(document.createTextNode(plain.slice(last, i)));
          const m = document.createElement('mark'); m.className = 'cx-hit'; m.textContent = plain.slice(i, i + nq.length); frag.appendChild(m);
          last = i + nq.length; n++; i = lowp.indexOf(nq, last);
        }
        frag.appendChild(document.createTextNode(plain.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
      if (n) rows.push([k, name, n]);
    });
    res.hidden = false;
    res.innerHTML = rows.length ? rows.map(r => `<button data-cx-hit="${r[0]}">${E(String(r[1]).trim())} <b>${r[2]}</b></button>`).join('')
      : '<span class="cx-none">ما لقيت «' + E(FIND) + '» بأي تبويب.</span>';
    if (!quiet && rows.length === 1) openHit(rows[0][0]);
  });
  function openHit(k) {
    H.tab(k);
    const m = q(`#cad .cp[data-p="${k}"] mark.cx-hit`);
    if (m) { for (let p = m.parentNode; p && p.id !== 'cad'; p = p.parentNode) if (p.tagName === 'DETAILS') p.open = true; m.scrollIntoView({ block: 'center', behavior: 'smooth' }); m.classList.add('first'); }
  }

  /* ------------------------------------------------------------ ٦) تكبير اللوحة */
  function sheetHints() { qa('#cad .sheet svg').forEach(s => { s.classList.add('cx-zoomable'); s.setAttribute('tabindex', '0'); s.setAttribute('role', 'button'); s.setAttribute('aria-label', 'تكبير اللوحة'); }); }
  const openSheet = safe(svg => {
    const card = svg.closest('.sheet'), title = card ? (q('.t', card) || {}).textContent || '' : '', no = card ? (q('b', card) || {}).textContent || '' : '';
    const ov = document.createElement('div'); ov.className = 'cx-ov'; ov.id = 'cad_sheet_ov';
    ov.innerHTML = `<div class="cx-ovh"><b>${E(no)} <span dir="auto">${E(title)}</span></b>
      <div><button data-z="in" title="تقريب">＋</button><button data-z="out" title="تبعيد">－</button><button data-z="fit" title="كامل اللوحة">⟲</button>
        <button data-z="full" title="ملء الشاشة">⛶</button><button data-z="close" title="إغلاق (Esc)">✕</button></div></div>
      <div class="cx-ovb">${svg.outerHTML}</div><div class="cx-ovf">عجلة الفأرة أو قرص الإصبعين للتقريب · اسحب للتحريك · نقرتين للتقريب</div>`;
    document.body.appendChild(ov);
    const s = q('svg', ov), body = q('.cx-ovb', ov), vb0 = (s.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
    s.removeAttribute('tabindex'); s.classList.remove('cx-zoomable');
    let vb = vb0.slice();
    const set = () => s.setAttribute('viewBox', vb.map(v => v.toFixed(3)).join(' '));
    const zoom = (f, cx, cy) => {                                         // cx, cy: نسبة موضع المؤشر داخل الرسم (0–1)
      const w = Math.min(vb0[2] * 1.2, Math.max(vb0[2] / 60, vb[2] * f)), h = w * vb0[3] / vb0[2];
      vb = [vb[0] + (vb[2] - w) * cx, vb[1] + (vb[3] - h) * cy, w, h]; set();
    };
    const rel = e => { const r = s.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; };
    body.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = rel(e); zoom(e.deltaY > 0 ? 1.18 : 0.85, x, y); }, { passive: false });
    const pts = new Map(); let pinch = 0;
    body.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); body.setPointerCapture(e.pointerId); pinch = 0; });
    body.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), r = s.getBoundingClientRect(); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { vb[0] -= (e.clientX - prev[0]) / r.width * vb[2]; vb[1] -= (e.clientY - prev[1]) / r.height * vb[3]; set(); }
      else if (pts.size === 2) {
        const [a, b] = Array.from(pts.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d, ((a[0] + b[0]) / 2 - r.left) / r.width, ((a[1] + b[1]) / 2 - r.top) / r.height);
        pinch = d;
      }
    });
    const up = e => { pts.delete(e.pointerId); pinch = 0; };
    body.addEventListener('pointerup', up); body.addEventListener('pointercancel', up);
    body.addEventListener('dblclick', e => { const [x, y] = rel(e); zoom(0.55, x, y); });
    const close = () => { document.removeEventListener('keydown', key); if (document.fullscreenElement === ov) document.exitFullscreen(); ov.remove(); };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === '+' || e.key === '=') zoom(0.8, 0.5, 0.5); else if (e.key === '-') zoom(1.25, 0.5, 0.5); };
    document.addEventListener('keydown', key);
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) { if (e.target === ov) close(); return; }
      const z = b.dataset.z;
      if (z === 'close') close(); else if (z === 'in') zoom(0.75, 0.5, 0.5); else if (z === 'out') zoom(1.33, 0.5, 0.5);
      else if (z === 'fit') { vb = vb0.slice(); set(); }
      else if (z === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else if (ov.requestFullscreen) ov.requestFullscreen().catch(() => { /* غير مدعوم */ }); }
    });
  });

  /* ------------------------------------------------------------ ٧) أدوات المجسم */
  function extras3d() {
    const bar = q('#cad .bar3d'); if (!bar || q('#cad .cx-bar3d')) return;
    const d = document.createElement('div'); d.className = 'cx-bar3d';
    d.innerHTML = `<label title="يباعد الطوابق عن بعض حتى تشوف كل سقف وحده">↕️ فصل الطوابق <input type="range" min="0" max="100" value="0" id="cad_explode" aria-label="فصل الطوابق"></label>
      <button type="button" data-cx3="shot">📸 حفظ صورة</button><button type="button" data-cx3="full">⛶ ملء الشاشة</button>`;
    bar.parentNode.insertBefore(d, bar.nextSibling);
  }
  const on3d = safe(act => {
    const V = H.view && H.view(), host = q('#cad3d'); if (!host) return;
    if (act === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else if (host.requestFullscreen) host.requestFullscreen().catch(() => { /* غير مدعوم */ }); return; }
    if (!V) return;
    if (act === 'shot') {
      const a = document.createElement('a'); a.href = V.canvas().toDataURL('image/png');
      a.download = 'model-3d-' + new Date().toISOString().slice(0, 10) + '.png'; document.body.appendChild(a); a.click(); a.remove();
    }
  });

  /* ------------------------------------------------------------ ٨) تنزيل الجداول CSV */
  function tableTools() {
    ['tables', 'floors', 'audit', 'axes', 'layers'].forEach(k => qa(`#cad .cp[data-p="${k}"] table`).forEach((t, i) => {
      if (t.dataset.cx || t.rows.length < 2) return; t.dataset.cx = '1';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cx-csv'; b.textContent = '⬇️ CSV'; b.title = 'نزّل هذا الجدول (يفتح بإكسل)';
      b.dataset.cxCsv = k + '-' + (i + 1);
      const host = t.closest('.scroll') || t; host.parentNode.insertBefore(b, host);
    }));
  }
  const csv = safe(btn => {
    let t = btn.nextElementSibling; if (t && t.tagName !== 'TABLE') t = q('table', t); if (!t) return;
    const cell = c => { const i = q('input,select', c), v = (i ? (i.tagName === 'SELECT' ? (i.options[i.selectedIndex] || {}).text : i.value) : c.innerText || '').replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = Array.from(t.rows).map(r => Array.from(r.cells).map(cell).join(','));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'autocad-' + btn.dataset.cxCsv + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  /* ------------------------------------------------------------ الربط */
  function css() {
    if (q('#caduxcss')) return;
    const st = document.createElement('style'); st.id = 'caduxcss';
    st.textContent = `
#cad .cx-hide{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
#cad .cx-drop{display:flex;align-items:center;gap:16px;flex-wrap:wrap;border:2px dashed var(--line);border-radius:16px;padding:22px 20px;background:linear-gradient(135deg,rgba(56,189,248,.06),rgba(99,102,241,.04));transition:border-color .15s,background .15s;cursor:pointer;outline:none}
#cad .cx-drop:hover,#cad .cx-drop:focus-visible,#cad .cx-drop.over{border-color:var(--acc);background:rgba(56,189,248,.11)}
#cad .cx-drop.over{border-style:solid;box-shadow:0 0 0 4px rgba(56,189,248,.15)}
#cad .cx-ic{font-size:44px;line-height:1}#cad .cx-dt{flex:1 1 260px;min-width:0}#cad .cx-dt b{display:block;font-size:16px}
#cad .cx-dt small{display:block;color:var(--mut);font-size:12px;line-height:1.7;margin-top:3px}
#cad .cx-db{display:flex;gap:8px;flex-wrap:wrap}
#cad .cx-up.has .cx-drop{padding:10px 14px;gap:12px}#cad .cx-up.has .cx-ic{font-size:26px}#cad .cx-up.has .cx-dt small,#cad .cx-up.has .cx-how{display:none}#cad .cx-up.has .cx-dt b{font-size:13.5px}
#cad .cx-up.busy .cx-drop{pointer-events:none;opacity:.55}
#cad .cx-how{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:12.3px;color:var(--mut)}
#cad .cx-how i,#cad .cx-steps i{font-style:normal;display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:50%;background:rgba(56,189,248,.16);color:#bae6fd;font-size:11px;margin-inline-end:6px}
#cad .cx-prog{margin-top:12px}#cad .cx-steps{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12.3px;color:var(--mut)}
#cad .cx-steps span.on{color:#fff;font-weight:600}#cad .cx-steps span.on i{background:var(--acc);color:#04263a;animation:cxpulse 1s infinite}
#cad .cx-steps span.ok{color:#a7f3d0}#cad .cx-steps span.ok i{background:rgba(52,211,153,.25);color:#a7f3d0}
#cad .cx-steps span.bad{color:#fecaca}#cad .cx-steps span.bad i{background:rgba(248,113,113,.3);color:#fecaca}
@keyframes cxpulse{50%{box-shadow:0 0 0 5px rgba(56,189,248,.18)}}
#cad .cx-bar{height:6px;border-radius:4px;background:rgba(148,163,184,.16);margin-top:8px;overflow:hidden}
#cad .cx-bar i{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#38bdf8,#6366f1);transition:width .5s}
#cad .cx-prog.done .cx-bar i{background:linear-gradient(90deg,#34d399,#10b981)}#cad .cx-prog.bad .cx-bar i{background:#f87171}
#cad .cx-time{font-size:11px;color:var(--mut);margin-top:3px;direction:ltr;text-align:right}
#cad .cx-msg{margin-top:10px}
#cad .cx-health{border:1px solid var(--line);border-radius:14px;padding:11px 13px;margin-top:12px;background:var(--panel);border-inline-start:4px solid var(--ok)}
#cad .cx-health.warn{border-inline-start-color:var(--warn)}#cad .cx-health.bad{border-inline-start-color:var(--bad)}
#cad .cx-hh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}#cad .cx-hh>b{font-size:14.5px}#cad .cx-hh>span{color:var(--mut);font-size:12.3px;unicode-bidi:plaintext}
#cad .cx-find{position:relative;flex:1 1 240px;min-width:0;margin-inline-start:auto}#cad .cx-find input{width:100%;padding:7px 11px;font-size:12.8px;border-radius:10px}
#cad_find_r{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}#cad_find_r[hidden]{display:none}
#cad_find_r button{background:rgba(250,204,21,.12);border:1px solid rgba(250,204,21,.4);color:#fde68a;border-radius:14px;padding:3px 10px;font:inherit;font-size:11.8px;cursor:pointer}
#cad_find_r button b{background:#facc15;color:#1f2937;border-radius:9px;padding:0 6px;margin-inline-start:4px}.cx-none{font-size:12px;color:var(--mut)}
#cad mark.cx-hit{background:#facc15;color:#111827;border-radius:3px;padding:0 1px}#cad mark.cx-hit.first{outline:2px solid #fb923c}
#cad .cx-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin-top:10px}
#cad .cx-chip{display:flex;align-items:flex-start;gap:8px;text-align:start;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:8px 10px;color:var(--tx);font:inherit;cursor:pointer;border-inline-start:3px solid var(--ok)}
#cad .cx-chip.warn{border-inline-start-color:var(--warn)}#cad .cx-chip.bad{border-inline-start-color:var(--bad)}#cad .cx-chip:hover{border-color:var(--acc)}
#cad .cx-chip i{font-style:normal;font-size:17px;line-height:1.2}#cad .cx-chip b{display:block;font-size:12.6px;unicode-bidi:plaintext}#cad .cx-chip small{display:block;font-size:11.2px;color:var(--mut);line-height:1.55;margin-top:1px;unicode-bidi:plaintext}
#cad .ctabs{position:sticky;top:0;z-index:30;background:var(--bg);padding:9px 0;margin:6px 0 10px}
#cad .ctabs button{white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
#cad .cx-demo{margin-top:9px;font-size:12.4px;line-height:1.8;color:#ddd6fe;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.35);border-radius:10px;padding:7px 11px}
@media (max-width:900px){#cad .ctabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;-webkit-overflow-scrolling:touch;-webkit-mask-image:linear-gradient(to left,#000 92%,transparent);mask-image:linear-gradient(to left,#000 92%,transparent)}#cad .ctabs button{flex:0 0 auto}}
#cad .cx-bd{font-style:normal;font-size:10.5px;min-width:18px;padding:0 5px;border-radius:9px;background:rgba(148,163,184,.22);color:var(--tx);text-align:center;line-height:17px}
#cad .cx-bd[hidden]{display:none}#cad .cx-bd.warn{background:rgba(251,191,36,.3);color:#fde68a}#cad .cx-bd.bad{background:rgba(248,113,113,.35);color:#fee2e2}#cad .cx-bd.ok{background:rgba(52,211,153,.3);color:#d1fae5}
#cad .ctabs button.on .cx-bd{background:rgba(255,255,255,.28);color:#fff}
#cad .sheet svg.cx-zoomable{cursor:zoom-in;transition:outline-color .15s;outline:2px solid transparent}#cad .sheet svg.cx-zoomable:hover,#cad .sheet svg.cx-zoomable:focus-visible{outline-color:var(--acc)}
.cx-ov{position:fixed;inset:0;z-index:2000;background:rgba(4,8,18,.94);display:flex;flex-direction:column;padding:10px}
.cx-ovh{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#e6edf7;padding:2px 4px 8px;font-size:13.5px}.cx-ovh b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cx-ovh span{color:#93a4c0;font-weight:400}
.cx-ovh div{display:flex;gap:5px;flex:0 0 auto}.cx-ovh button{width:36px;height:36px;border-radius:10px;border:1px solid #22304f;background:#16233d;color:#e6edf7;font-size:16px;cursor:pointer}.cx-ovh button:hover{border-color:#38bdf8}
.cx-ovb{flex:1;min-height:0;background:#0b1222;border:1px solid #22304f;border-radius:12px;overflow:hidden;cursor:grab;touch-action:none}.cx-ovb:active{cursor:grabbing}
.cx-ovb svg{width:100%;height:100%;display:block}.cx-ovf{color:#93a4c0;font-size:11.5px;text-align:center;padding-top:6px}
#cad .cx-bar3d{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:-2px 0 8px;font-size:12px;color:var(--mut)}
#cad .cx-bar3d label{display:flex;align-items:center;gap:7px}#cad .cx-bar3d input{width:130px;padding:0;accent-color:#38bdf8}
#cad .cx-bar3d button,#cad .cx-csv{background:var(--panel2);border:1px solid var(--line);color:var(--tx);border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
#cad .cx-csv{display:block;margin:4px 0 4px auto;margin-inline-start:auto;font-size:11.3px;padding:3px 9px;color:var(--mut)}#cad .cx-csv:hover,#cad .cx-bar3d button:hover{border-color:var(--acc);color:#fff}
#cad3d:fullscreen{background:#0b1222;display:flex;align-items:center;justify-content:center}
@media (max-width:620px){#cad .cx-drop{padding:16px 12px;gap:10px}#cad .cx-ic{font-size:34px}#cad .cx-db{width:100%}#cad .cx-db .btn{flex:1 1 auto}#cad .cx-chips{grid-template-columns:1fr 1fr}#cad .cx-chip small{display:none}#cad .cx-hh .btn{width:100%}}`;
    document.head.appendChild(st);
  }
  const init = safe(hooks => {
    H = hooks; css();
    const root = q('#cad'), drop = q('#cad_drop'); if (!root || !drop) return;
    const pick = () => { const f = q('#cad_file'); if (f) f.click(); };
    drop.addEventListener('click', e => { if (!e.target.closest('button,input')) pick(); });
    drop.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === drop) { e.preventDefault(); pick(); } });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !drop.contains(e.relatedTarget)) drop.classList.remove('over'); }));
    drop.addEventListener('drop', safe(e => {
      const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /\.(dwg|dxf)$/i.test(f.name));
      if (fs.length) { DEMO = false; H.load(fs, false); }
      else { const m = q('#cad_msg'); if (m) { m.textContent = '✗ اسحب ملف DWG أو DXF (الملفات الثانية ما تنقرا هنا).'; m.style.color = '#fca5a5'; } }
    }));
    root.addEventListener('click', safe(e => {
      const t = e.target;
      if (t.closest('#cad_pick_btn')) return pick();
      if (t.closest('#cad_demo_btn')) return loadDemo();
      const go = t.closest('[data-cx-go]'); if (go) return H.tab(go.dataset.cxGo);
      const hit = t.closest('[data-cx-hit]'); if (hit) return openHit(hit.dataset.cxHit);
      const c3 = t.closest('[data-cx3]'); if (c3) return on3d(c3.dataset.cx3);
      const cs = t.closest('[data-cx-csv]'); if (cs) return csv(cs);
      const sv = t.closest('.sheet svg.cx-zoomable'); if (sv) return openSheet(sv);
    }));
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.sheet svg.cx-zoomable')) openSheet(e.target); });
    root.addEventListener('change', e => { if (e.target.id === 'cad_file') DEMO = false; }, true);
    let ft = 0;
    root.addEventListener('input', e => {
      if (e.target.id === 'cad_find') { clearTimeout(ft); const v = e.target.value; ft = setTimeout(() => find(v), 220); }
      if (e.target.id === 'cad_explode') { const V = H.view && H.view(); if (V && V.explode) V.explode(+e.target.value / 100); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cad_find') { clearTimeout(ft); find(e.target.value); const b = q('#cad_find_r button'); if (b) openHit(b.dataset.cxHit); } });
  });
  return { uploadHtml, init, progress, afterRender, find, healthItems: (R, B) => healthItems(R, B).out };
})();
window.CADUX = CADUX;
