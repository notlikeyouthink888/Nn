/* 🤖 المساعد الذكي — نماذج عبر مزوّدين (OpenRouter، DeepSeek، Groq، Gemini…) داخل المنصة، مخصّص للمشروع ولـ ACI 318-19 والكود العراقي.
   · زر عائم بكل الصفحات يفتح لوحة محادثة، وصفحة كاملة «🤖 المساعد الذكي» فيها الإعدادات.
   · كل سؤال يرسل (إذا مفعّل) ملخصاً مضغوطاً لمشروعك: نتائج المعالج، قسم الأوتوكاد، والعنصر المفتوح بالدليل.
   · الأرقام يحسبها المساعد بأدوات المنصة نفسها (تظهر كبطاقات 🔧 بمدخلاتها ونتيجتها).
   · المفاتيح يضيفها صاحب المنصة فقط وتبقى على الخادم. الزائر يسأل مباشرة بلا أي إعداد.
   · صاحب المنصة يشوف من يستخدم المساعد أكثر، ويوقف أي زائر أو يحدد له حداً يومياً. */
(function () {
  const A = window.AIASK = {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = (store) => ({
    get(k, d) { try { const v = store.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* تخزين غير متاح */ } },
    del(k) { try { store.removeItem(k); } catch (e) { /* */ } }
  });
  const LS = st(window.localStorage), SS = st(window.sessionStorage);
  const S = { msgs: LS.get('ai.chat.v1', []), busy: false, ctrl: null, cfg: null, models: {}, mfilter: { q: '', tools: false, free: false },
              useCtx: LS.get('ai.ctx', true), root: null, settingsOpen: false, usage: null, mopen: '', kopen: '', addKind: 'openrouter' };
  const page = () => (location.hash || '#wizard').slice(1);
  const f2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;

  /* معرّف عشوائي لهذا المتصفح — حتى صاحب المنصة يميّز الأجهزة بسجل الاستخدام (ما بيه أي معلومة عنك). */
  function vid() {
    let v = LS.get('ai.vid', '');
    if (!/^[A-Za-z0-9]{16}$/.test(v)) {
      const a = new Uint8Array(16), abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      (window.crypto || window.msCrypto).getRandomValues(a);
      v = Array.from(a, x => abc[x % abc.length]).join('');
      LS.set('ai.vid', v);
      if (LS.get('ai.vid', '') !== v) return '';                    // التخزين مقفول ← الخادم يعتمد العنوان
    }
    return v;
  }
  function hdrs() {
    const h = {}, pw = SS.get('ai.admin', '') || LS.get('ai.admin.keep', ''), v = vid();
    if (pw) h['X-Admin-Pass'] = encodeURIComponent(pw);
    if (v) h['X-Visitor'] = v;
    return h;
  }
  async function api(path, body) {
    const o = { method: body ? 'POST' : 'GET', headers: hdrs() };
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    try {
      const r = await fetch('/api/ai/' + path, o);
      let d = {}; try { d = await r.json(); } catch (e) { /* */ }
      return { ok: r.ok, status: r.status, data: d };
    } catch (e) { return { ok: false, status: 0, data: { error: 'تعذّر الاتصال بالمنصة.' } }; }
  }

  /* ============================ سياق المشروع (ملخص مضغوط) ============================ */
  const pick = (o, ks) => { const r = {}; if (!o) return r; ks.forEach(k => { if (o[k] !== undefined && o[k] !== null) r[k] = typeof o[k] === 'number' ? f2(o[k]) : o[k]; }); return r; };
  function wz() { try { return typeof WZ !== 'undefined' ? WZ : null; } catch (e) { return null; } }
  function beamDigest(B, M) {
    if (!B) return null;
    const rb = (M && M.rebar) || {};
    return { b: B.b, h: B.h, d: f2(B.d), type: (M && M.btype && M.btype.name) || '', bottom: rb.bottom && rb.bottom.label, top: rb.top && rb.top.label,
      stirrups: rb.stirrup && rb.stirrup.label, ok: B.ok, fails: (B.fails || []).slice(0, 6),
      spans: (B.design || []).slice(0, 8).map(d => ({ L: f2(d.L), Mu: f2(d.flex && d.flex.Mu), phiMn: f2(d.flex && d.flex.phiMn), flex_ratio: f2(d.flex && d.flex.ratio),
        Vu: f2(d.Vu), phiVn: f2(d.shear && d.shear.phiVn), shear_ratio: f2(d.shear && d.shear.ratio), stirrups: d.shear && d.shear.label,
        defl_ok: d.defl_ok, d_long: f2(d.d_long), d_limit: f2(d.d_limit) })) };
  }
  function projectDigest() {
    const W = wz(); if (!W || !W.input) return null;
    const c = W.col || {}, cr = c.rebar || {}, t = (W.design && W.design.typical) || {}, sl = W.slab || {}, se = W.seismic || {};
    return {
      summary: (W.summary || []).slice(0, 8),
      input: pick(W.input, ['area', 'floors', 'use', 'qa', 'soil', 'fc', 'fy', 'story_h', 'city', 'slab_type', 'beam_type', 'exposure', 'lap_mode', 'Df']),
      grid: pick(W.grid, ['L', 'B', 'nx', 'ny', 'sx', 'sy', 'cols', 'spans_x', 'spans_y']),
      loads: { D_kPa: f2(W.floor && W.floor.D), L_kPa: f2(W.floor && W.floor.L), total_kN: f2(W.total), Pmax_kN: f2(W.Pmax), Pumax_kN: f2(W.Pumax) },
      slab: { name: sl.name || sl.kind_name, h: sl.h, h_min: f2(sl.hmin), ok_h: sl.ok_h, rib_bars: sl.rebar && sl.rebar.label, top: sl.top_bars && sl.top_bars.label,
        mesh: sl.mesh && sl.mesh.bottom && sl.mesh.bottom.label, Mu: f2(sl.Mu), Vu: f2(sl.Vu), phiVc: f2(sl.phiVc) },
      beams: { x: beamDigest(W.beams && W.beams.x, W.model && W.model.beams && W.model.beams.x), y: beamDigest(W.beams && W.beams.y, W.model && W.model.beams && W.model.beams.y) },
      column: { b: c.b, h: c.h, shape: c.shape, bars: cr.label, ties: cr.tie_label, confinement: cr.conf_label, rho_pct: f2((cr.rho || 0) * 100),
        ratio: f2(cr.ratio), phiPn_max: f2(cr.phiPn_max), Mu: f2(c.Mu), dowels: c.dowels && c.dowels.label, dowel_warn: c.dowels && c.dowels.warn },
      footing: { system: W.design && W.design.name, B_m: f2(t.B), h: t.h, d: f2(t.d), bars: t.bars_label, punch_ratio: f2(t.punch_ratio), oneway_ratio: f2(t.oneway_ratio),
        qu: f2(t.qu), q_net: f2(t.q_net), ok: t.ok, advisor: W.advisor && W.advisor.name },
      seismic: pick(se, ['city', 'Ss', 'S1', 'site', 'SDS', 'SD1', 'T', 'R', 'Cs_use', 'V', 'sdc', 'system'])
    };
  }
  function cadDigest() {
    try {
      if (!window.CADPAGE) return null;
      const st0 = CADPAGE.state(), R = st0 && st0.RES; if (!R || !R.buildings || !R.buildings.length) return null;
      const B = R.buildings[st0.BI] || R.buildings[0];
      const d = { building: B.name, axes: B.axes_sig, floors: (B.floors || []).map(f => ({ name: f.name, h: f.h, columns: (f.columns || []).length, beams: (f.beams || []).length,
        slab_t: f.slab && f.slab.t })), drawings: (R.drawings || []).length, materials: R.materials || {}, footings_designed: (B.footings || []).length };
      if (window.CADAUDIT) {
        const au = CADAUDIT.audit(R, B, st0.OPTS);
        d.audit = { ok: au.sum.ok, warn: au.sum.warn, fail: au.sum.fail, items: au.items.length };
        d.issues = [].concat(...au.items.map(it => it.checks.filter(k => k.state === 'fail' || k.state === 'warn')
          .map(k => ({ el: it.title, size: it.size, check: k.name, val: k.val, lim: k.lim, st: k.state, clause: k.clause })))).slice(0, 18);
      }
      return d;
    } catch (e) { return null; }
  }
  function elementDigest() {
    try { return (window.CADAUDIT && CADAUDIT.current && CADAUDIT.current()) || (window.DOSSIER && DOSSIER.current && DOSSIER.current()) || null; }
    catch (e) { return null; }
  }
  function labDigest() {
    const t = document.querySelector('#plTabs button.on'), k = document.getElementById('plKpi') || document.querySelector('.pl-kpis');
    if (!t) return null;
    return { lab: t.dataset.lab, name: t.innerText.replace(/\s+/g, ' ').trim().slice(0, 60), kpis: k ? k.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : '' };
  }
  function context() {
    const id = page(), PG = (typeof PAGES !== 'undefined' ? PAGES : window.PAGES) || {}, P = PG[id] || {};
    const c = { page: { id, name: P.name || id, title: P.ttl || '' } };
    const pr = projectDigest(); if (pr) c.project = pr;
    if (id === 'cad' || elementDigest()) { const cd = cadDigest(); if (cd) c.cad = cd; }
    const el = elementDigest(); if (el) c.element = el;
    const lb = labDigest(); if (lb) c.lab = lb;
    return c;
  }
  function chips(c) {
    const out = ['📄 ' + esc(c.page.name)];
    if (c.project) out.push('🏗️ المشروع: ' + esc((c.project.input.floors || '?') + ' طوابق · ' + (c.project.grid.nx || '?') + '×' + (c.project.grid.ny || '?') + ' بحور'));
    if (c.cad) out.push('🧩 ' + esc(c.cad.building || 'الأوتوكاد') + (c.cad.audit ? ' · ' + c.cad.audit.fail + ' مخالفة' : ''));
    if (c.element) out.push('📘 ' + esc(c.element.title || c.element.kind));
    if (c.lab) out.push('🔬 ' + esc(c.lab.name));
    return out.map(t => `<span class="ai-chip">${t}</span>`).join('');
  }

  /* ============================ ماركداون آمن ============================ */
  function inline(s) {
    return s.replace(/`([^`]+)`/g, (m, a) => `<code dir="ltr">${a}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(§\s?\d{1,2}(?:\.\d{1,2}){1,4}(?:\([a-z]\))?)/g, '<span class="ai-cl" dir="ltr">$1</span>');
  }
  function md(src) {
    const lines = esc(src || '').split('\n'), out = [];
    let i = 0;
    while (i < lines.length) {
      const L = lines[i];
      if (/^```/.test(L)) { const b = []; i++; while (i < lines.length && !/^```/.test(lines[i])) b.push(lines[i++]); i++; out.push(`<pre dir="ltr"><code>${b.join('\n')}</code></pre>`); continue; }
      if (/^\s*\|.*\|\s*$/.test(L) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = s => s.trim().replace(/^\||\|$/g, '').split('|').map(x => inline(x.trim()));
        const head = row(L); i += 2; const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        out.push(`<div class="ai-tw"><table><thead><tr>${head.map(h => `<th dir="auto">${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td dir="auto">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const h = L.match(/^\s*#{1,6}\s+(.*)/); if (h) { out.push(`<h4 dir="auto">${inline(h[1])}</h4>`); i++; continue; }
      if (/^\s*([-*•])\s+/.test(L)) { const b = []; while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) b.push(lines[i++].replace(/^\s*([-*•])\s+/, '')); out.push(`<ul>${b.map(x => `<li dir="auto">${inline(x)}</li>`).join('')}</ul>`); continue; }
      if (/^\s*\d+[.)]\s+/.test(L)) { const b = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) b.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); out.push(`<ol>${b.map(x => `<li dir="auto">${inline(x)}</li>`).join('')}</ol>`); continue; }
      if (!L.trim()) { i++; continue; }
      const p = []; while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s|```|\|)/.test(lines[i])) p.push(inline(lines[i++]));
      if (p.length) out.push(`<p dir="auto">${p.join('<br>')}</p>`); else { out.push(`<p dir="auto">${inline(L)}</p>`); i++; }
    }
    return out.join('');
  }

  /* ============================ الاقتراحات حسب الصفحة ============================ */
  function suggestions(c) {
    const id = c.page.id, L = [];
    if (c.element) L.push('اشرح لي هذا العنصر: شلون انحسب، وشنو الفحوص اللي ما تحققت وشلون أعالجها؟');
    if (id === 'cad') L.push('شنو أخطر المخالفات بلوحاتي وشلون أصلّحها؟', 'شلون أكثّف كانات منطقة المفصل حسب ACI 318-19؟');
    if (c.project && (id === 'wizard' || id === 'femproj' || id === 'bbs')) L.push('اشرح لي نتائج مشروعي باختصار', 'ليش العمود طلع بهذا المقطع والتسليح؟', 'هل الأساسات مطابقة لـ ACI 318-19؟ وليش؟');
    if (id === 'rebar' || id === 'phys' || id === 'detail66') L.push('شكد طول التماسك لـ Ø25 حديد علوي و f\'c = 28؟', 'شنو الفرق بين الوصلة صنف A و B؟', 'شكد قطر ثني الكانة Ø10 وامتداد عكفتها؟');
    if (id === 'loads' || id === 'seismic' || id === 'wind') L.push('شنو الحمل الحي للمدارس والمكاتب بالكود العراقي؟', 'احسب القوة الزلزالية لمبنى 4 طوابق ارتفاعه 13 م ووزنه 9000 kN بأربيل');
    if (!c.project && id === 'wizard') L.push('شلون أبدي مشروع جديد بالمعالج؟');
    L.push('شنو الأكواد اللي تعتمدها المنصة؟', 'شكد الغطاء الخرساني للأساسات والجسور؟');
    return [...new Set(L)].slice(0, 5);
  }

  /* ============================ المحادثة ============================ */
  function chatHtml(where) {
    return `<div class="ai-chat" data-where="${where}">
      <div class="ai-ctx"><label class="ai-ctx-on"><input type="checkbox" data-ai="ctx" ${S.useCtx ? 'checked' : ''}> 📎 أرسل بيانات المشروع</label><div class="ai-chips"></div></div>
      <div class="ai-msgs" aria-live="polite"></div>
      <div class="ai-sugs"></div><div class="ai-gate" hidden></div>
      <div class="ai-comp"><textarea rows="1" placeholder="اسأل عن مشروعك أو عن ACI 318-19 والكود العراقي…" aria-label="سؤالك"></textarea>
        <button class="ai-send" data-ai="send" title="إرسال">➤</button><button class="ai-stop" data-ai="stop" title="إيقاف">■</button></div>
      <div class="ai-foot">الأرقام من حاسبات المنصة (🔧) · راجع القرار النهائي مع مهندس مخوّل</div></div>`;
  }
  function bubble(m, k) {
    if (m.role === 'user') return `<div class="ai-m u"><div class="ai-b" dir="auto">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
    const tools = (m.tools || []).map(t => `<details class="ai-tool"><summary>🔧 <b>${esc(t.label)}</b> <span dir="rtl">${esc(t.summary || '')}</span><i>محرّك المنصة</i></summary>
      <pre dir="ltr">${esc(JSON.stringify({ inputs: t.args, result: t.result }, null, 1)).slice(0, 6000)}</pre></details>`).join('');
    const status = (m.status || []).map(s => `<div class="ai-st">${esc(s)}</div>`).join('');
    const kb = (m.kb || []).length ? `<details class="ai-kb"><summary>📚 مراجع المنصة المستعملة (${m.kb.length})</summary><ul>${m.kb.map(x => `<li>${esc(x.src)} › ${esc(x.title)}</li>`).join('')}</ul></details>` : '';
    const u = (m.meta && m.meta.usage) || {};                      // للزائر: الخادم ما يرسل المزوّد ولا النموذج ولا الكلفة
    const meta = m.meta && m.meta.model ? `<div class="ai-meta" dir="ltr">${m.meta.provider ? '<span dir="auto">' + esc(m.meta.provider) + '</span> · ' : ''}${esc(m.meta.model)}${u.total_tokens ? ' · ' + u.total_tokens + ' tok' : ''}${u.cost ? ' · $' + (+u.cost).toFixed(4) : ''}</div>` : '';
    const err = m.err ? `<div class="ai-err">⚠️ ${esc(m.err)}${m.needKey ? ' <button class="btn gh" data-ai="settings">⚙️ الإعدادات</button>' : ''}</div>` : '';
    const typing = m.pending && !m.content && !m.err ? '<div class="ai-typing"><i></i><i></i><i></i></div>' : '';
    const body = m.content || typing ? `<div class="ai-b">${md(m.content)}${typing}</div>` : '';
    return `<div class="ai-m a" data-k="${k}">${status}${tools}${body}${err}${kb}
      <div class="ai-acts">${m.content ? `<button data-ai="copy" data-k="${k}" title="نسخ">📋</button>` : ''}${meta}</div></div>`;
  }
  function renderMsgs(root, onlyLast) {
    root = root || S.root; if (!root) return;
    const box = root.querySelector('.ai-msgs');
    if (!S.msgs.length) {
      box.innerHTML = `<div class="ai-hello"><div class="ai-hello-ic">🤖</div><b>هلا! آني المساعد الهندسي لهذي المنصة.</b>
        <div>أسألني عن مشروعك، أو أي عنصر (جسر، عمود، أساس، بلاطة)، أو أي بند بـ ACI 318-19 والكود العراقي للأحمال — وأحسبلك الأرقام بحاسبات المنصة نفسها.</div></div>`;
    } else if (onlyLast && box.lastElementChild && box.lastElementChild.dataset.k == S.msgs.length - 1) {
      box.lastElementChild.outerHTML = bubble(S.msgs[S.msgs.length - 1], S.msgs.length - 1);
    } else box.innerHTML = S.msgs.map(bubble).join('');
    box.scrollTop = box.scrollHeight;
    const c = context();
    root.querySelector('.ai-chips').innerHTML = S.useCtx ? chips(c) : '<span class="ai-chip off">بدون بيانات المشروع</span>';
    const g = gate(), gb = root.querySelector('.ai-gate'), ta = root.querySelector('textarea');
    root.querySelector('.ai-sugs').innerHTML = S.busy || g ? '' : suggestions(c).map(q => `<button class="ai-sug" data-ai="sug" data-q="${esc(q)}">${esc(q)}</button>`).join('');
    gb.hidden = !g; gb.innerHTML = g ? g.html : '';
    ta.disabled = !!(g && g.lock); root.querySelector('.ai-send').disabled = ta.disabled;
    ta.placeholder = g && g.lock ? 'المساعد غير متاح هسه' : 'اسأل عن مشروعك أو عن ACI 318-19 والكود العراقي…';
    root.classList.toggle('busy', S.busy);
  }
  /* ليش ما يكدر يسأل هسه؟ (ماكو مفتاح / موقوف / وصل حده) — null إذا كلشي تمام */
  function gate() {
    const c = S.cfg; if (!c) return null;
    if (c.is_admin) return c.ready ? null : { lock: false, html: '🔑 ما مضاف أي مفتاح بعد. <button class="btn gh" data-ai="settings">⚙️ ضيف مفتاحاً</button>' };
    if (!c.ready) return { lock: true, html: '⏳ المساعد غير مفعّل بعد.' };
    if (!c.allow_public) return { lock: true, html: '⏸️ المساعد موقوف للزوار حالياً.' };
    const me = c.me || {};
    if (me.blocked) return { lock: true, html: '⛔ صاحب المنصة أوقف المساعد لهذا الجهاز.' };
    if (me.left === 0) return { lock: true, html: '🌙 وصلت حدّك اليومي من الأسئلة — ارجع باچر.' };
    if (me.left != null && me.left <= 5) return { lock: false, html: 'باقيلك <b>' + me.left + '</b> ' + (me.left === 1 ? 'سؤال' : 'أسئلة') + ' اليوم.' };
    return null;
  }
  let raf = 0;
  function liveUpdate() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderMsgs(null, true); }); }

  async function send(text) {
    text = (text || '').trim();
    if (!text || S.busy) return;
    const root = S.root, ta = root && root.querySelector('textarea');
    if (ta) { ta.value = ''; ta.style.height = ''; }
    S.msgs.push({ role: 'user', content: text });
    const m = { role: 'assistant', content: '', tools: [], status: [], kb: [], pending: true };
    S.msgs.push(m); S.busy = true; renderMsgs();
    const hist = S.msgs.slice(0, -1).filter(x => !x.err && x.content).slice(-12).map(x => ({ role: x.role, content: x.content }));
    const body = { messages: hist, context: S.useCtx ? context() : null };
    let recheck = false;
    S.ctrl = new AbortController();
    try {
      const r = await fetch('/api/ai/chat', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()), body: JSON.stringify(body), signal: S.ctrl.signal });
      if (!r.ok) {
        let d = {}; try { d = await r.json(); } catch (e) { /* */ }
        m.err = d.error || ('خطأ ' + r.status); m.needKey = d.need === 'key'; recheck = true;
      } else {
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            chunk.split('\n').forEach(line => {
              if (!line.startsWith('data:')) return;
              let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { return; }
              if (ev.t === 'delta') m.content += ev.c;
              else if (ev.t === 'tool') m.tools.push({ label: ev.label, summary: ev.summary, args: ev.args, result: ev.result });
              else if (ev.t === 'status') m.status.push(ev.c);
              else if (ev.t === 'meta') m.kb = ev.kb || [];
              else if (ev.t === 'error') m.err = ev.c;
              else if (ev.t === 'done') m.meta = { model: ev.model, provider: ev.provider, usage: ev.usage };
            });
            liveUpdate();
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') m.status.push('⏹️ أوقفت الجواب.'); else m.err = 'انقطع الاتصال بالمنصة.';
    }
    m.pending = false; S.busy = false; S.ctrl = null;
    saveChat(); renderMsgs();
    if (recheck || (S.cfg && !S.cfg.is_admin)) loadCfg().then(() => renderMsgs());      // الباقي من حد اليوم / حالة الإيقاف
  }
  function saveChat() { LS.set('ai.chat.v1', S.msgs.filter(x => !x.pending).slice(-30).map(x => Object.assign({}, x, { content: (x.content || '').slice(0, 20000) }))); }

  /* ============================ الإعدادات (لصاحب المنصة فقط) ============================ */
  async function loadCfg() { const r = await api('config'); S.cfg = r.ok ? r.data : null; paintOwner(); return S.cfg; }
  async function loadModels(pid, force) { const r = await api('models?p=' + encodeURIComponent(pid) + (force ? '&refresh=1' : '')); S.models[pid] = r.data || { models: [] }; return S.models[pid]; }
  async function loadUsage() { const r = await api('usage'); S.usage = r.ok ? r.data : null; return S.usage; }
  const price = v => v == null ? '—' : v === 0 ? 'مجاني' : '$' + (v < 1 ? v.toFixed(2) : v.toFixed(1));
  const PREF = ['anthropic', 'openai', 'google', 'deepseek', 'x-ai', 'mistralai', 'meta-llama', 'moonshotai', 'z-ai'];
  const prov = id => ((S.cfg && S.cfg.providers) || []).find(p => p.id === id);
  const preset = k => ((S.cfg && S.cfg.presets) || []).find(p => p.kind === k) || {};
  function recommended(list) {
    return list.filter(m => m.tools && !m.free && PREF.includes(m.vendor))
      .sort((a, b) => (PREF.indexOf(a.vendor) - PREF.indexOf(b.vendor)) || ((b.created || 0) - (a.created || 0)))
      .filter((m, i, arr) => arr.findIndex(x => x.vendor === m.vendor) === i).slice(0, 6);
  }
  function modelRow(m, cur, pid) {
    return `<button class="ai-mod ${m.id === cur ? 'on' : ''}" data-ai="pick" data-p="${esc(pid)}" data-id="${esc(m.id)}"><b dir="auto">${esc(m.name)}</b>
      ${m.name !== m.id ? `<span dir="ltr">${esc(m.id)}</span>` : ''}<em>${m.tools ? '<i class="t">🔧 أدوات</i>' : ''}${m.free ? '<i class="f">مجاني</i>' : ''}
      ${m.ctx ? '<i>' + Math.round(m.ctx / 1000) + 'k</i>' : ''}${!m.free && m.pin != null ? '<i dir="ltr">' + price(m.pin) + ' / ' + price(m.pout) + ' per 1M</i>' : ''}</em></button>`;
  }
  function modelsHtml(p) {
    const D = S.models[p.id], M = (D && D.models) || [], f = S.mfilter, q = f.q.trim().toLowerCase(), or = p.kind === 'openrouter';
    if (!D) return '<div class="ai-dim">… جارٍ جلب قائمة النماذج</div>';
    const list = M.filter(m => (!f.tools || m.tools !== false) && (!f.free || m.free) && (!q || (m.id + ' ' + m.name).toLowerCase().includes(q)));
    const rec = or ? recommended(M) : [];
    return `<div class="ai-mhead"><input type="search" data-ai-in="mq" placeholder="ابحث عن نموذج…" value="${esc(f.q)}">
        ${or ? `<label><input type="checkbox" data-ai-in="mtools" ${f.tools ? 'checked' : ''}> يدعم الأدوات</label>
        <label><input type="checkbox" data-ai-in="mfree" ${f.free ? 'checked' : ''}> مجاني</label>` : ''}
        <button class="btn gh" data-ai="refresh" data-id="${esc(p.id)}" title="تحديث القائمة">🔄</button></div>
      ${D.error ? `<div class="ai-warn">⚠️ ${esc(D.error)}${M.length ? ' — هذي آخر قائمة محفوظة.' : ''}</div>` : ''}
      <div class="ai-mlist">${or ? modelRow({ id: 'openrouter/auto', name: '⚡ تلقائي — OpenRouter يختار الأنسب', tools: true }, p.model, p.id) : ''}
        ${!q && !f.free && rec.length ? '<div class="ai-mgrp">مقترحة (تدعم الأدوات)</div>' + rec.map(m => modelRow(m, p.model, p.id)).join('') + '<div class="ai-mgrp">الكل</div>' : ''}
        ${list.slice(0, 80).map(m => modelRow(m, p.model, p.id)).join('') || (M.length ? '<div class="ai-dim">ما في نتائج.</div>' : '')}</div>
      <div class="ai-row"><input type="text" data-ai-in="mcustom" placeholder="أو اكتب معرّف النموذج يدوياً" dir="ltr"><button class="btn gh" data-ai="pickc" data-id="${esc(p.id)}">اختيار</button></div>`;
  }
  function provHtml(p, i, n) {
    const rank = !p.on ? '<i class="off">موقوف</i>' : i === 0 ? '<i class="first">الأساسي</i>' : '<i>احتياط ' + i + '</i>';
    return `<div class="ai-prov ${p.on ? '' : 'off'}" data-prov="${esc(p.id)}">
      <div class="ai-prov-h"><b dir="auto">${esc(p.name)}</b>${rank}
        <label class="ai-sw"><input type="checkbox" data-ai="pon" data-id="${esc(p.id)}" ${p.on ? 'checked' : ''}> شغّال</label></div>
      <div class="ai-prov-m">🧠 <b dir="ltr">${esc(p.model)}</b><span>🔑 <b dir="ltr">${esc(p.key_hint || '—')}</b></span>${p.kind === 'custom' ? `<span dir="ltr">${esc(p.base)}</span>` : ''}</div>
      <div class="ai-prov-b"><button class="btn gh" data-ai="ptest" data-id="${esc(p.id)}">✓ فحص</button>
        <button class="btn gh ${S.mopen === p.id ? 'on' : ''}" data-ai="pmodel" data-id="${esc(p.id)}">🧠 النموذج</button>
        <button class="btn gh ${S.kopen === p.id ? 'on' : ''}" data-ai="pkey" data-id="${esc(p.id)}">🔑 تغيير المفتاح</button>
        ${i > 0 && n > 1 ? `<button class="btn gh" data-ai="pfirst" data-id="${esc(p.id)}">⬆ خلّيه الأساسي</button>` : ''}
        <button class="btn gh" data-ai="pdel" data-id="${esc(p.id)}" title="حذف">🗑️</button></div>
      ${S.kopen === p.id ? `<div class="ai-row"><input type="password" data-ai-in="pkey" placeholder="المفتاح الجديد" autocomplete="off" dir="ltr"><button class="btn" data-ai="pkeysave" data-id="${esc(p.id)}">حفظ</button></div>` : ''}
      <div class="ai-res" data-ai-out="p-${esc(p.id)}"></div>
      ${S.mopen === p.id ? `<div class="ai-pmods" data-ai-out="models">${modelsHtml(p)}</div>` : ''}</div>`;
  }
  function addHtml(c) {
    const k = S.addKind, pr = preset(k), full = (c.providers || []).length >= 6;
    if (full) return '<div class="ai-dim">وصلت الحد (6 مفاتيح). احذف واحداً حتى تضيف غيره.</div>';
    return `<div class="ai-add"><h5>➕ إضافة مفتاح</h5>
      <div class="ai-seg ai-kinds">${(c.presets || []).map(x => `<button class="${x.kind === k ? 'on' : ''}" data-ai="akind" data-v="${esc(x.kind)}">${esc(x.name)}</button>`).join('')}</div>
      <div class="ai-dim">${esc(pr.note || '')}${pr.keys ? ` · <a href="${esc(pr.keys)}" target="_blank" rel="noopener noreferrer">جيب المفتاح من هنا ↗</a>` : ''}</div>
      ${k === 'custom' ? `<div class="ai-row"><input type="text" data-ai-in="nname" placeholder="اسم للمزوّد (مثل: Together)" maxlength="40">
        <input type="text" data-ai-in="nbase" placeholder="https://api.example.com/v1" dir="ltr"></div>
        <div class="ai-row"><input type="text" data-ai-in="nmodel" placeholder="اسم النموذج عند المزوّد" dir="ltr"></div>` : ''}
      <div class="ai-row"><input type="password" data-ai-in="nkey" placeholder="الصق المفتاح هنا" autocomplete="off" dir="ltr"><button class="btn" data-ai="padd">إضافة</button></div>
      <div class="ai-res" data-ai-out="add"></div></div>`;
  }
  const ago = t => { if (!t) return '—'; const d = Date.now() / 1000 - t; return d < 90 ? 'هسه' : d < 3600 ? 'قبل ' + Math.round(d / 60) + ' د' : d < 86400 ? 'قبل ' + Math.round(d / 3600) + ' س' : d < 172800 ? 'أمس' : 'قبل ' + Math.round(d / 86400) + ' يوم'; };
  function usageHtml(c) {
    const U = S.usage;
    if (!U) return '<div class="ai-dim">… جارٍ تحميل السجل</div>';
    const rows = U.users || [], top = Math.max(1, ...rows.map(r => r.today)), lim = c.user_per_day;
    const kpi = (v, t, cls) => `<div class="ai-kpi ${cls || ''}"><b>${v}</b><span>${t}</span></div>`;
    return `<div class="ai-kpis">${kpi(U.today_public, 'أسئلة الزوار اليوم')}${kpi(U.visitors_today, 'زوار سألوا اليوم')}${kpi(U.total, 'كل الأسئلة')}
        ${kpi(U.blocked, 'موقوفين', U.blocked ? 'bad' : '')}${U.cost ? kpi('$' + (+U.cost).toFixed(2), 'الكلفة المسجّلة') : kpi(U.tokens > 9999 ? Math.round(U.tokens / 1000) + 'k' : U.tokens, 'رموز (tokens)')}</div>
      ${rows.length ? `<div class="ai-utw"><table class="ai-ut"><thead><tr><th>الزائر</th><th>اليوم</th><th>7 أيام</th><th>الكلي</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr class="${r.blocked ? 'blk' : ''} ${r.who === 'owner' ? 'me' : ''}">
          <td><b>${r.who === 'owner' ? '👑 إنت' : 'زائر <span dir="ltr">#' + esc(r.tag) + '</span>'}</b>${r.blocked ? ' <i class="ai-bl">موقوف</i>' : ''}
            <small>${esc(r.device || '')}${r.ip ? ' · <span dir="ltr">' + esc(r.ip) + '</span>' : ''}</small><small>آخر سؤال: ${ago(r.last)}</small></td>
          <td><b class="${r.who !== 'owner' && lim && r.today >= lim ? 'hit' : ''}">${r.today}</b><span class="ai-bar"><i style="width:${Math.round(100 * r.today / top)}%"></i></span></td>
          <td>${r.week}</td><td>${r.total}</td>
          <td>${r.who === 'owner' ? '' : `<button class="btn gh ${r.blocked ? 'go' : 'stop'}" data-ai="ublock" data-key="${esc(r.key)}" data-on="${r.blocked ? 0 : 1}">${r.blocked ? '✅ تشغيل' : '⛔ إيقاف'}</button>`}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="ai-dim">ما أحد سأل المساعد بعد. أول ما يسأل زائر يطلع هنا.</div>'}
      <div class="ai-row"><button class="btn gh" data-ai="uref">🔄 تحديث</button>${rows.length ? '<button class="btn gh" data-ai="uclear">🧹 تصفير السجل</button>' : ''}</div>
      <div class="ai-dim">مرتّب من الأكثر استعمالاً اليوم. «إيقاف» يوقف المساعد لجهاز الزائر وعنوان الإنترنت مالته (حتى ما يرجع من متصفح ثاني) — وإذا أكثر من شخص على نفس الشبكة يتوقفون سوية، و«تشغيل» يرجّعهم.
        السجل يحفظ الأعداد فقط، مو نص الأسئلة.</div>`;
  }
  function settingsHtml() {
    const c = S.cfg;
    if (!c) return '<div class="ai-dim">جارٍ التحميل…</div>';
    const pwSet = SS.get('ai.admin', '') || LS.get('ai.admin.keep', '');
    if (!c.is_admin) {                                              // الزائر: بلا مفاتيح ولا إعدادات — يسأل وبس
      const g = gate();
      return `<div class="ai-stat"><span>${g && g.lock ? g.html : '✅ المساعد جاهز — اكتب سؤالك مباشرة، ما يحتاج أي إعداد.'}</span>
          <span>📚 ${c.kb ? c.kb.chunks : 0} مقطع مرجعي · 🔧 ${c.tools} أداة حساب من محرّك المنصة</span>
          ${c.me && c.me.left != null && !(g && g.lock) ? `<span>🗓️ باقيلك اليوم: <b>${c.me.left}</b> سؤال</span>` : ''}</div>
        ${c.has_admin_pass ? `<details class="ai-own" ${S.ownOpen ? 'open' : ''}><summary>👑 دخول صاحب المنصة</summary>
          <div class="ai-row"><input type="password" data-ai-in="login" placeholder="كلمة سر المشرف" autocomplete="current-password"><button class="btn gh" data-ai="login">دخول</button></div>
          <label class="ai-sw"><input type="checkbox" data-ai-in="keep"> تذكّرني بهذا الجهاز</label><div class="ai-res" data-ai-out="login"></div></details>` : ''}`;
    }
    const P = c.providers || [], live = P.filter(p => p.on && p.has_key);
    let h = `<div class="ai-stat"><span>${c.is_local ? '👑 صاحب المنصة — من نفس الحاسبة' : '👑 صاحب المنصة — بكلمة سر المشرف'}</span>
      <span>🔑 ${live.length ? live.length + ' ' + (live.length === 1 ? 'مفتاح شغّال' : 'مفاتيح شغّالة') + ' · الأساسي: <b dir="auto">' + esc(live[0].name) + '</b>' : '<b class="ai-warn">ما مضاف أي مفتاح بعد</b>'}</span>
      <span>🌐 الزوار: <b>${c.allow_public ? 'يسألون مباشرة' : 'موقوف'}</b>${c.allow_public ? ' · ' + c.user_per_day + ' سؤال باليوم لكل زائر' : ''}</span>
      <span>📚 ${c.kb ? c.kb.chunks : 0} مقطع مرجعي · 🔧 ${c.tools} أداة حساب</span>
      ${c.custom_base ? '<span class="ai-warn">🧪 الخادم موجّه لعنوان اختبار بدل OpenRouter</span>' : ''}</div>
      <div class="ai-sec"><h4>🔑 مفاتيح الذكاء — إنت بس تضيفها، والزوار يسألون مباشرة</h4>
        <div class="ai-provs">${P.map((p, i) => provHtml(p, i, P.length)).join('') || '<div class="ai-dim">ضيف أول مفتاح من الأسفل حتى يشتغل المساعد.</div>'}</div>
        ${addHtml(c)}
        <div class="ai-dim">الأول هو الأساسي. إذا فشل (الرصيد خلص، ضغط، مفتاح ملغي) المساعد ينتقل للي بعده تلقائياً والزائر ما يحس.
          المفاتيح تنحفظ بحاسبتك فقط (civil/data/ai.json) وما ترجع لأي متصفح.</div></div>
      <div class="ai-sec"><h4>👥 منو يستخدم المساعد</h4><div data-ai-out="usage">${usageHtml(c)}</div></div>
      <div class="ai-sec"><h4>🚦 حدود الزوار</h4>
        <label class="ai-sw"><input type="checkbox" data-ai-in="pub" ${c.allow_public ? 'checked' : ''}> المساعد شغّال للزوار</label>
        <div class="ai-lims"><label>لكل زائر باليوم <input type="number" min="0" max="5000" data-ai-in="ud" value="${c.user_per_day}"></label>
          <label>لكل زائر بالساعة <input type="number" min="0" max="1000" data-ai-in="ph" value="${c.public_per_hour}"></label>
          <label>لكل الزوار باليوم <input type="number" min="0" max="50000" data-ai-in="pd" value="${c.public_per_day}"></label>
          <button class="btn gh" data-ai="savepub">حفظ</button></div>
        <div class="ai-dim">الحدود تحمي رصيدك. إنت كصاحب المنصة ما عليك حد.</div><div class="ai-res" data-ai-out="pub"></div></div>
      <div class="ai-sec"><h4>💬 أسلوب الجواب</h4><div class="ai-seg">${[['iq', 'عراقي'], ['msa', 'فصحى'], ['en', 'English']].map(([k, n]) =>
        `<button class="${c.style === k ? 'on' : ''}" data-ai="style" data-v="${k}">${n}</button>`).join('')}</div><div class="ai-res" data-ai-out="style"></div></div>
      <div class="ai-sec"><h4>🛡️ كلمة سر المشرف</h4>
        <div class="ai-row"><input type="password" data-ai-in="apw" placeholder="${c.has_admin_pass ? 'كلمة سر جديدة' : '6 أحرف على الأقل'}" autocomplete="new-password">
          <button class="btn gh" data-ai="setpw">${c.has_admin_pass ? 'تغيير' : 'ضبط'}</button>${c.has_admin_pass && c.is_local ? '<button class="btn gh" data-ai="clrpw">إلغاء</button>' : ''}</div>
        <div class="ai-dim">حتى تدير المفاتيح وتشوف الاستخدام من موبايلك عبر الدومين. بدونها الإدارة من الحاسبة نفسها فقط.</div>
        ${pwSet && !c.is_local ? '<button class="btn gh" data-ai="logout">خروج المشرف من هذا الجهاز</button>' : ''}<div class="ai-res" data-ai-out="pw"></div></div>`;
    return h;
  }
  /* أزرار وعناوين تخص صاحب المنصة فقط (⚙️ باللوحة، عنوان بطاقة الإعدادات) */
  function paintOwner() {
    const adm = !!(S.cfg && S.cfg.is_admin);
    document.querySelectorAll('[data-ai-owner]').forEach(x => { x.hidden = !adm; });
    document.querySelectorAll('[data-ai-h]').forEach(x => { x.textContent = adm ? '⚙️ إعدادات المساعد' : 'ℹ️ عن المساعد'; });
  }
  async function renderSettings(el, keep) {
    if (!el) return;
    if (!keep) await loadCfg();
    const c = S.cfg || {};
    el.innerHTML = settingsHtml();
    if (!c.is_admin) return;
    if (!keep || !S.usage) loadUsage().then(() => { const o = el.querySelector('[data-ai-out="usage"]'); if (o) o.innerHTML = usageHtml(S.cfg || {}); });
    const p = prov(S.mopen);
    if (p && !S.models[p.id]) loadModels(p.id).then(() => { const o = el.querySelector('[data-ai-out="models"]'); if (o && S.mopen === p.id) o.innerHTML = modelsHtml(prov(p.id) || p); });
  }
  const out = (el, sel, html, ok) => { const o = el && el.querySelector('[data-ai-out="' + sel + '"]'); if (o) { o.innerHTML = html; o.className = 'ai-res ' + (ok ? 'ok' : 'bad'); } };
  const keyResult = r => r.ok && r.data.ok ? '✓ المفتاح شغّال' + (r.data.credits ? ' · الرصيد المتبقي <b dir="ltr">$' + (+r.data.credits.left).toFixed(2) + '</b>' : '') +
    (r.data.free_tier ? ' · حساب مجاني' : '') + (r.data.models ? ' · ' + r.data.models + ' نموذج متاح' : '') : '✗ ' + esc((r.data && r.data.error) || 'فشل الفحص');

  /* ============================ اللوحة والصفحة ============================ */
  function ensureDock() {
    let d = document.getElementById('aiDock');
    if (d) return d;
    d = document.createElement('aside'); d.id = 'aiDock'; d.className = 'ai-dock'; d.setAttribute('aria-label', 'المساعد الهندسي');
    d.innerHTML = `<div class="ai-dh"><div><b>🤖 المساعد الهندسي</b><small>ACI 318-19 · الكود العراقي · مشروعك</small></div>
      <div class="ai-dbtn"><button data-ai="settings" data-ai-owner hidden title="الإعدادات">⚙️</button><button data-ai="new" title="محادثة جديدة">🗑️</button>
        <button data-ai="full" title="الصفحة الكاملة">⤢</button><button data-ai="close" title="إغلاق">✕</button></div></div>
      <div class="ai-set" hidden></div>${chatHtml('dock')}`;
    document.body.appendChild(d);
    paintOwner();
    return d;
  }
  A.open = function (q, autosend) {
    const d = ensureDock(); d.classList.add('open'); document.body.classList.add('ai-on');
    S.root = d.querySelector('.ai-chat'); renderMsgs();
    const ta = S.root.querySelector('textarea');
    if (q) { ta.value = q; grow(ta); }
    setTimeout(() => ta.focus(), 60);
    if (q && autosend) send(q);
    const fab = document.getElementById('aiFab'); if (fab) fab.classList.add('hide');
  };
  A.close = function () {
    const d = document.getElementById('aiDock'); if (d) d.classList.remove('open');
    document.body.classList.remove('ai-on');
    const fab = document.getElementById('aiFab'); if (fab && page() !== 'ai') fab.classList.remove('hide');
  };
  A.ask = (q, autosend) => A.open(q, autosend);
  A.askElement = function () {
    const el = elementDigest();
    A.open('اشرح لي هذا العنصر' + (el && el.title ? ' (' + el.title + ')' : '') + ': شلون انحسب، وشنو الفحوص اللي ما تحققت، وشلون أعالجها حسب ACI 318-19؟');
  };
  A.pageHtml = () => `<div class="ai-page"><div class="card ai-pchat"><div class="ai-ph"><b>🤖 المساعد الهندسي</b>
      <span class="ai-dim">يجاوب عن مشروعك والمنصة وACI 318-19 والكود العراقي فقط — وبأرقام من حاسبات المنصة</span>
      <button class="btn gh" data-ai="new">🗑️ محادثة جديدة</button></div>${chatHtml('page')}</div>
    <div class="card ai-pset"><h3 data-ai-h>ℹ️ عن المساعد</h3><div class="ai-set" data-where="page"></div>
      <div class="ai-sec"><h4>🔒 الخصوصية</h4><ul class="ai-ul"><li>سؤالك وملخص مشروعك (إذا مفعّل) ينرسل لنموذج الذكاء حتى يجاوب. ملفات الـDWG نفسها ما تنرسل.</li>
        <li>المنصة تعدّ أسئلة كل جهاز (عدد فقط، بلا نص السؤال) حتى صاحبها ينظّم الاستخدام.</li>
        <li>المساعد مقصور على المنصة والتصميم الإنشائي، ويعتذر عن غيرها.</li><li>كل رقم يطلع من أداة 🔧 تقدر تفتحها وتشوف مدخلاتها ونتيجتها.</li></ul></div></div></div>`;
  A.pageInit = function () {
    S.root = document.querySelector('#view .ai-chat'); renderMsgs();
    renderSettings(document.querySelector('#view .ai-set'));
    const fab = document.getElementById('aiFab'); if (fab) fab.classList.add('hide');
    A.close();
  };

  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; }
  const setEl = t => (t.closest('.ai-set') || document.querySelector('.ai-set:not([hidden])'));
  const val = (el, k) => { const i = el && el.querySelector('[data-ai-in="' + k + '"]'); return i ? (i.type === 'checkbox' ? i.checked : i.value) : null; };
  async function saveCfg(el, body, outSel, msg) {
    const r = await api('config', body);
    if (r.ok) { S.cfg = r.data.config; paintOwner(); await renderSettings(el, true); out(el, outSel, msg || '✓ انحفظ', true); if (S.root) renderMsgs(); }
    else out(el, outSel, '✗ ' + esc(r.data.error || 'فشل الحفظ'), false);
    return r.ok;
  }
  const paintUsage = el => { const o = el && el.querySelector('[data-ai-out="usage"]'); if (o) o.innerHTML = usageHtml(S.cfg || {}); };

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-ai]'); if (!b) return;
    const act = b.dataset.ai, el = setEl(b);
    if (act === 'ctx') { S.useCtx = b.checked; LS.set('ai.ctx', S.useCtx); renderMsgs(); return; }
    if (act === 'pon') return saveCfg(el, { provider_set: { id: b.dataset.id, on: b.checked } }, 'p-' + b.dataset.id, b.checked ? '✓ شغّال' : '✓ موقوف — المساعد ما يستعمله');
    e.preventDefault();
    if (act === 'open') return A.open();
    if (act === 'askel') return A.askElement();
    if (act === 'close') return A.close();
    if (act === 'full') { A.close(); if (typeof go === 'function') go('ai'); return; }
    if (act === 'new') { if (S.busy && S.ctrl) S.ctrl.abort(); S.msgs = []; saveChat(); renderMsgs(); return; }
    if (act === 'send') { const ta = b.closest('.ai-chat').querySelector('textarea'); S.root = b.closest('.ai-chat'); return send(ta.value); }
    if (act === 'stop') { if (S.ctrl) S.ctrl.abort(); return; }
    if (act === 'sug') { S.root = b.closest('.ai-chat'); return send(b.dataset.q); }
    if (act === 'copy') { const m = S.msgs[+b.dataset.k]; try { await navigator.clipboard.writeText(m.content); b.textContent = '✓'; } catch (x) { /* */ } return; }
    if (act === 'settings') {
      if (page() === 'ai') { const ps = document.querySelector('#view .ai-pset'); if (ps) ps.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const d = ensureDock(); if (!d.classList.contains('open')) A.open();
      const s = d.querySelector('.ai-set'); S.settingsOpen = s.hidden; s.hidden = !s.hidden;
      if (!s.hidden) { s.innerHTML = '<div class="ai-dim">جارٍ التحميل…</div>'; renderSettings(s); }
      return;
    }
    const id = b.dataset.id;
    /* ---------- المفاتيح والمزوّدون ---------- */
    if (act === 'akind') { S.addKind = b.dataset.v; return renderSettings(el, true); }
    if (act === 'padd') {
      const key = (val(el, 'nkey') || '').trim(); if (!key) return out(el, 'add', '✗ الصق المفتاح أولاً', false);
      const a = { kind: S.addKind, key };
      if (S.addKind === 'custom') { a.name = (val(el, 'nname') || '').trim(); a.base = (val(el, 'nbase') || '').trim(); a.model = (val(el, 'nmodel') || '').trim(); }
      out(el, 'add', '… جارٍ الإضافة', true);
      const before = (S.cfg.providers || []).map(p => p.id);
      if (!await saveCfg(el, { provider_add: a }, 'add', '✓ انضاف المفتاح')) return;
      const np = (S.cfg.providers || []).find(p => !before.includes(p.id)); if (!np) return;
      out(el, 'p-' + np.id, '… جارٍ فحص المفتاح', true);
      const r = await api('test', { id: np.id }); return out(el, 'p-' + np.id, keyResult(r), r.ok && r.data.ok);
    }
    if (act === 'ptest') { out(el, 'p-' + id, '… جارٍ الفحص', true); const r = await api('test', { id }); return out(el, 'p-' + id, keyResult(r), r.ok && r.data.ok); }
    if (act === 'pmodel') { S.mopen = S.mopen === id ? '' : id; S.mfilter.q = ''; return renderSettings(el, true); }
    if (act === 'pkey') { S.kopen = S.kopen === id ? '' : id; return renderSettings(el, true); }
    if (act === 'pkeysave') {
      const k = (val(el, 'pkey') || '').trim(); if (!k) return out(el, 'p-' + id, '✗ الصق المفتاح أولاً', false);
      S.kopen = '';
      if (!await saveCfg(el, { provider_set: { id, key: k } }, 'p-' + id, '✓ انحفظ المفتاح — جارٍ فحصه…')) { S.kopen = id; return; }
      delete S.models[id];
      const r = await api('test', { id }); return out(el, 'p-' + id, keyResult(r), r.ok && r.data.ok);
    }
    if (act === 'pfirst') return saveCfg(el, { provider_set: { id, first: true } }, 'p-' + id, '✓ صار الأساسي');
    if (act === 'pdel') { const p = prov(id); if (p && confirm('أحذف مفتاح «' + p.name + '» من المنصة؟')) { if (S.mopen === id) S.mopen = ''; await saveCfg(el, { provider_del: id }, 'add', '✓ انحذف'); } return; }
    if (act === 'pick' || act === 'pickc') {
      const pid = act === 'pick' ? b.dataset.p : id, m = act === 'pick' ? id : (val(el, 'mcustom') || '').trim(); if (!m) return;
      S.mopen = ''; return saveCfg(el, { provider_set: { id: pid, model: m } }, 'p-' + pid, '✓ النموذج: <b dir="ltr">' + esc(m) + '</b>');
    }
    if (act === 'refresh') { const o = el.querySelector('[data-ai-out="models"]'); if (o) o.innerHTML = '<div class="ai-dim">… جارٍ تحديث القائمة</div>'; await loadModels(id, true); const p = prov(id); if (o && p) o.innerHTML = modelsHtml(p); return; }
    /* ---------- الاستخدام ---------- */
    if (act === 'uref') { b.disabled = true; await loadUsage(); return paintUsage(el); }
    if (act === 'ublock') {
      const on = b.dataset.on === '1';
      if (on && !confirm('أوقف المساعد لهذا الزائر؟ (تكدر ترجّعه بأي وقت)')) return;
      const r = await api('usage', { key: b.dataset.key, block: on });
      if (r.ok) { S.usage = r.data.usage; paintUsage(el); } else alert(r.data.error || 'فشل');
      return;
    }
    if (act === 'uclear') { if (!confirm('أصفّر سجل الاستخدام؟ (الموقوفين يبقون موقوفين)')) return; const r = await api('usage', { clear: true }); if (r.ok) { S.usage = r.data.usage; paintUsage(el); } return; }
    if (act === 'savepub') return saveCfg(el, { allow_public: !!val(el, 'pub'), user_per_day: +val(el, 'ud'), public_per_hour: +val(el, 'ph'), public_per_day: +val(el, 'pd') }, 'pub', '✓ انحفظت الحدود');
    if (act === 'style') return saveCfg(el, { style: b.dataset.v }, 'style', '✓ انحفظ الأسلوب');
    if (act === 'setpw') { const p = val(el, 'apw') || ''; if (p.length < 6) return out(el, 'pw', '✗ 6 أحرف على الأقل', false); return saveCfg(el, { admin_pass: p }, 'pw', '✓ انضبطت كلمة السر'); }
    if (act === 'clrpw') { if (confirm('ألغي كلمة سر المشرف؟')) await saveCfg(el, { clear_admin_pass: true }, 'pw', '✓ انلغت'); return; }
    if (act === 'logout') { SS.del('ai.admin'); LS.del('ai.admin.keep'); S.usage = null; await renderSettings(el); if (S.root) renderMsgs(); return; }
    if (act === 'login') {
      const p = val(el, 'login') || ''; if (!p) return;
      const keep = val(el, 'keep');
      (keep ? LS : SS).set(keep ? 'ai.admin.keep' : 'ai.admin', p);
      await loadCfg();
      if (S.cfg && S.cfg.is_admin) { await renderSettings(el, true); if (S.root) renderMsgs(); return; }
      SS.del('ai.admin'); LS.del('ai.admin.keep'); S.ownOpen = true; await renderSettings(el); return out(el, 'login', '✗ كلمة السر غير صحيحة', false);
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('.ai-chat textarea')) return grow(t);
    const k = t.dataset && t.dataset.aiIn;
    if (k === 'mq' || k === 'mtools' || k === 'mfree') {
      if (k === 'mq') S.mfilter.q = t.value; else S.mfilter[k === 'mtools' ? 'tools' : 'free'] = t.checked;
      const box = t.closest('[data-ai-out="models"]'), p = prov(S.mopen); if (!box || !p) return;
      const pos = k === 'mq' ? t.selectionStart : null;
      box.innerHTML = modelsHtml(p);
      if (k === 'mq') { const n = box.querySelector('[data-ai-in="mq"]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* */ } }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('.ai-chat textarea') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); S.root = e.target.closest('.ai-chat'); send(e.target.value);
    }
    if (e.key === 'Escape' && document.getElementById('aiDock') && document.getElementById('aiDock').classList.contains('open') && !document.querySelector('.dos-ov[style*="flex"]')) A.close();
  });
  window.addEventListener('hashchange', () => {
    const fab = document.getElementById('aiFab');
    if (fab) fab.classList.toggle('hide', page() === 'ai' || (document.getElementById('aiDock') || {}).classList?.contains('open'));
    if (S.root && document.body.contains(S.root)) renderMsgs(); else S.root = null;
  });

  function boot() {
    if (document.getElementById('aiFab')) return;
    const f = document.createElement('button'); f.id = 'aiFab'; f.className = 'ai-fab'; f.dataset.ai = 'open';
    f.innerHTML = '🤖<span>اسأل المساعد</span>'; f.title = 'المساعد الهندسي — ACI 318-19 والكود العراقي';
    if (page() === 'ai') f.classList.add('hide');
    document.body.appendChild(f);
    LS.del('ai.ownkey'); LS.del('ai.model');                        // من النسخة القديمة: مفتاح الزائر الشخصي انلغى
    loadCfg().then(() => { if (S.root && document.body.contains(S.root)) renderMsgs(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  A._t = { md, context, projectDigest, cadDigest, suggestions, S, gate };
})();
