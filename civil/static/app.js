/* منصة الهندسة المدنية — واجهة المستخدم */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const nf = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' :
  Number(x).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
const int = x => nf(x, 0);
const val = id => parseFloat($('#' + id).value) || 0;
const txt = id => $('#' + id).value;
const chk = id => $('#' + id).checked;

async function post(ep, data) {
  $('#stat').textContent = 'جارٍ الحساب…';
  try {
    const r = await fetch('/api/' + ep, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'خطأ');
    $('#stat').textContent = 'تم الحساب ✓';
    return j;
  } catch (e) { $('#stat').textContent = '✗ ' + e.message; alert('خطأ: ' + e.message); throw e; }
}

/* ---------- form helpers ---------- */
const F = (l, id, v, step = 'any', unit = '') =>
  `<div><label>${l}${unit ? ` <span style="color:#64748b">(${unit})</span>` : ''}</label>
   <input id="${id}" type="number" step="${step}" value="${v}"></div>`;
const S = (l, id, opts, v) =>
  `<div><label>${l}</label><select id="${id}">${opts.map(o => {
    const [k, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${k}"${k == v ? ' selected' : ''}>${t}</option>`; }).join('')}</select></div>`;
const C = (l, id, v) => `<div style="align-self:end"><label>&nbsp;</label>
   <label style="color:var(--tx);font-size:13px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}
   style="width:auto;margin-left:6px">${l}</label></div>`;
const kpi = (l, v, cls = '') => `<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const tag = ok => ok ? '<span class="tag t-ok">مقبول ✓</span>' : '<span class="tag t-bad">غير مقبول ✗</span>';
const rcol = r => r <= 0.7 ? '#34d399' : r <= 0.9 ? '#a3e635' : r <= 1.0 ? '#fbbf24' : '#f87171';
const table = (heads, rows) => `<div style="overflow-x:auto"><table><thead><tr>${
  heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${
  rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/* ---------- SVG plot ---------- */
function plot(o) {
  const W = 860, H = o.h || 210, ml = 52, mr = 14, mt = 22, mb = 26;
  const xs = o.x, all = o.series.flatMap(s => s.y);
  let y0 = Math.min(0, ...all), y1 = Math.max(0, ...all);
  if (y1 - y0 < 1e-9) { y1 = 1; y0 = -1; }
  const pad = (y1 - y0) * .12; y0 -= pad; y1 += pad;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = v => ml + (v - x0) / (x1 - x0 || 1) * (W - ml - mr);
  const Y = v => o.invert ? mt + (v - y0) / (y1 - y0) * (H - mt - mb)
                          : H - mb - (v - y0) / (y1 - y0) * (H - mt - mb);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4;
    g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#22304f" stroke-width="1"/>
      <text x="${ml - 6}" y="${Y(v) + 4}" fill="#93a4c0" font-size="10" text-anchor="end">${nf(v, 1)}</text>`;
  }
  g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#64748b" stroke-width="1.4"/>`;
  for (let i = 0; i <= 6; i++) {
    const v = x0 + (x1 - x0) * i / 6;
    g += `<text x="${X(v)}" y="${H - 8}" fill="#93a4c0" font-size="10" text-anchor="middle">${nf(v, 1)}</text>`;
  }
  o.series.forEach(s => {
    const pts = xs.map((x, i) => `${X(x)},${Y(s.y[i])}`).join(' ');
    if (s.fill) g += `<polygon points="${X(x0)},${Y(0)} ${pts} ${X(x1)},${Y(0)}" fill="${s.color}22"/>`;
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
  });
  const mx = o.series[0], im = mx.y.indexOf(Math.max(...mx.y)), in_ = mx.y.indexOf(Math.min(...mx.y));
  [im, in_].forEach(i => { if (Math.abs(mx.y[i]) > 1e-6)
    g += `<circle cx="${X(xs[i])}" cy="${Y(mx.y[i])}" r="3" fill="#fff"/>
      <text x="${X(xs[i])}" y="${Y(mx.y[i]) + (o.invert ? 14 : -7)}" fill="#fff" font-size="10"
      text-anchor="middle">${nf(mx.y[i], 1)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}"><text x="${W - mr}" y="14" fill="#e6edf7" font-size="11.5"
    text-anchor="end">${o.title}</text>${g}</svg>`;
}

/* ---------- section drawing ---------- */
function sectionSVG(b, h, opt) {
  const S = 185 / Math.max(b, h), W = 330, HH = 240;
  const bw = b * S, hh = h * S, ox = (W - bw) / 2 - 30, oy = 22;
  const cov = 40 * S;
  let g = `<rect x="${ox}" y="${oy}" width="${bw}" height="${hh}" fill="#1e3a5f" stroke="#7dd3fc" stroke-width="1.6"/>
   <rect x="${ox + cov}" y="${oy + cov}" width="${bw - 2 * cov}" height="${hh - 2 * cov}" fill="none"
   stroke="#fbbf24" stroke-width="1.6" rx="6"/>`;
  const bar = (x, y, d) => `<circle cx="${x}" cy="${y}" r="${Math.max(2.6, d * S / 2)}" fill="#f87171" stroke="#fff" stroke-width=".6"/>`;
  (opt.rows || []).forEach(r => {
    const n = r.n, d = r.db, y = oy + (r.top ? cov + 6 : hh - cov - 6);
    for (let i = 0; i < n; i++) {
      const x = ox + cov + 8 + (bw - 2 * cov - 16) * (n === 1 ? .5 : i / (n - 1));
      g += bar(x, y, d);
    }
    g += `<text x="${ox + bw + 8}" y="${y + 4}" fill="#fca5a5" font-size="11">${n}Ø${d}</text>`;
  });
  (opt.layers || []).forEach(l => {
    const y = oy + l[0] * S, n = l[2] || 2, d = opt.db || 20;
    for (let i = 0; i < n; i++) {
      const x = ox + cov + 8 + (bw - 2 * cov - 16) * (n === 1 ? .5 : i / (n - 1));
      g += bar(x, y, d);
    }
  });
  g += `<text x="${ox + bw / 2}" y="${oy + hh + 16}" fill="#93a4c0" font-size="11" text-anchor="middle">b = ${b} مم</text>
   <text x="${ox - 10}" y="${oy + hh / 2}" fill="#93a4c0" font-size="11" text-anchor="end">h = ${h}</text>`;
  if (opt.stirrups) g += `<text x="${W - 8}" y="14" fill="#fbbf24" font-size="11" text-anchor="end">أساور ${opt.stirrups}</text>`;
  return `<svg viewBox="0 0 ${W} ${HH}" style="max-width:340px">${g}</svg>`;
}

/* ================================ PAGES ================================== */
let META = { live: [], dens: [], cities: [], systems: [] };
const PAGES = {};

PAGES.home = {
  ic: '🏠', name: 'الرئيسية', ttl: 'منصة التحليل والتصميم الإنشائي',
  sub: 'حسابات مطابقة لـ ACI 318-19 والكود العراقي للأحمال والقوى — تحليل مصفوفي كامل',
  html: () => `<div class="hero"><h2>مكتب هندسي رقمي متكامل 🏗️</h2>
    <p>تحليل إنشائي بطريقة الصلابة المباشرة (Direct Stiffness) للجسور والإطارات، وتصميم خرساني مسلح
    وفق <b>ACI 318-19</b>، وأحمال حية وزلزالية ورياح وفق <b>الكود العراقي للأحمال والقوى</b>،
    مع فحص شعاعي (X-Ray) لكامل الهيكل يُظهر نسبة الإجهاد في كل عنصر.</p></div>
  <div class="grid g3" style="margin-top:16px">${Object.entries(PAGES).filter(([k]) => k !== 'home')
    .map(([k, p]) => `<div class="feat" onclick="go('${k}')"><div class="ic">${p.ic}</div>
      <div><b>${p.name}</b><span>${p.desc || p.sub}</span></div></div>`).join('')}</div>
  <div class="grid g4" style="margin-top:16px">
    ${kpi('طريقة التحليل', 'Stiffness')}${kpi('كود التصميم', 'ACI 318-19')}
    ${kpi('كود الأحمال', 'العراقي')}${kpi('الوحدات', 'SI · kN·m')}</div>`,
  init: () => {}
};

/* ------------------------------- الأحمال -------------------------------- */
PAGES.loads = {
  ic: '⚖️', name: 'الأحمال', ttl: 'الأحمال الميتة والحية',
  sub: 'الكود العراقي للأحمال والقوى — جداول الأحمال الحية والكثافات وحاسبة تركيب الطابق',
  desc: 'جداول الكود العراقي + حاسبة أحمال الطابق',
  html: () => `<div class="grid g2">
    <div class="card"><h3>حاسبة أحمال الطابق</h3><div class="f">
      ${F('سمك البلاطة', 'l_slab', 150, 5, 'مم')}${F('طبقة الرمل', 'l_sand', 50, 5, 'مم')}
      ${F('المونة', 'l_mortar', 25, 5, 'مم')}${F('الكاشي/السيراميك', 'l_tiles', 25, 5, 'مم')}
      ${F('البلاستر', 'l_plaster', 20, 5, 'مم')}${F('القواطع', 'l_part', 1.0, .1, 'kN/m²')}
      ${F('أحمال إضافية', 'l_extra', 0, .1, 'kN/m²')}
      ${S('الاستعمال (حمل حي)', 'l_use', META.live.map(x => [x.v, x.name + ' — ' + x.v]), 2)}</div>
      <div class="row"><button class="btn" onclick="PAGES.loads.run()">احسب</button></div>
      <div id="l_out" style="margin-top:12px"></div></div>
    <div class="card"><h3>الأحمال الحية — الكود العراقي</h3>
      ${table(['نوع الإشغال', 'kN/m²'], META.live.map(x => [x.name, nf(x.v, 1)]))}</div>
    <div class="card"><h3>كثافات المواد</h3>
      ${table(['المادة', 'kN/m³'], META.dens.map(x => [x.name, nf(x.v, 1)]))}</div>
    <div class="card"><h3>تراكيب الأحمال — ACI 318-19 / ASCE 7</h3>
      ${table(['#', 'التركيب'], [[1, 'U = 1.4D'], [2, 'U = 1.2D + 1.6L + 0.5(Lr أو S)'],
        [3, 'U = 1.2D + 1.6(Lr أو S) + (1.0L أو 0.5W)'], [4, 'U = 1.2D + 1.0W + 1.0L + 0.5Lr'],
        [5, 'U = 1.2D + 1.0E + 1.0L'], [6, 'U = 0.9D + 1.0W'], [7, 'U = 0.9D + 1.0E']])}
      <div class="note">معاملات الخفض φ: انحناء 0.90 (مشدود) · قص 0.75 · أعمدة مطوّقة 0.65 · حمل مركزي 0.65</div>
    </div></div>`,
  run: async () => {
    const r = await post('floor', { slab: val('l_slab'), sand: val('l_sand'), mortar: val('l_mortar'),
      tiles: val('l_tiles'), plaster: val('l_plaster'), partitions: val('l_part'),
      extra: val('l_extra'), live: parseFloat(txt('l_use')) });
    $('#l_out').innerHTML = `<div class="grid g3">${kpi('الحمل الميت D', nf(r.D) + ' kN/m²')}
      ${kpi('الحمل الحي L', nf(r.L) + ' kN/m²')}${kpi('wu = 1.2D+1.6L', nf(r.wu) + ' kN/m²', 'ok')}</div>
      <div style="margin-top:10px">${table(['المكوّن', 'kN/m²'], r.items.map(i => [i.name, nf(i.v)]))}</div>
      <div style="margin-top:10px">${table(['التركيب', 'kN/m²'], r.combos.map(i => [i.name, nf(i.v)]))}</div>`;
  },
  init: () => PAGES.loads.run()
};

/* ------------------------------- الزلازل -------------------------------- */
PAGES.seismic = {
  ic: '🌊', name: 'التحليل الزلزالي', ttl: 'القوى الزلزالية — طريقة القوة الجانبية المكافئة',
  sub: 'ASCE 7-16 ELF المعتمدة في الكود العراقي للمقاومة الزلزالية',
  desc: 'قص القاعدة وتوزيع القوى على الطوابق',
  html: () => `<div class="card"><h3>المعطيات</h3><div class="f">
      ${S('المحافظة', 's_city', META.cities.map(c => c.name), 'بغداد')}
      ${S('صنف الموقع', 's_site', [['A', 'A — صخر صلد'], ['B', 'B — صخر'], ['C', 'C — تربة كثيفة'],
        ['D', 'D — تربة متماسكة (افتراضي)'], ['E', 'E — تربة رخوة']], 'D')}
      ${S('النظام الإنشائي', 's_sys', META.systems.map(s => s.name), META.systems[1] && META.systems[1].name)}
      ${F('عدد الطوابق', 's_n', 5, 1)}${F('ارتفاع الطابق', 's_h', 3.2, .1, 'م')}
      ${F('وزن الطابق W', 's_w', 2500, 10, 'kN')}${F('معامل الأهمية Ie', 's_ie', 1.0, .25)}</div>
      <div class="row"><button class="btn" onclick="PAGES.seismic.run()">احسب القوى الزلزالية</button></div>
      <div class="note">قيم Ss و S1 المدرجة استرشادية للاستئناس — يجب تدقيقها من خرائط الكود العراقي للمقاومة الزلزالية المعتمدة.</div>
    </div><div id="s_out" style="margin-top:16px"></div>`,
  run: async () => {
    const n = Math.max(1, Math.round(val('s_n'))), hh = val('s_h'), w = val('s_w');
    const st = []; for (let i = 1; i <= n; i++) st.push({ name: 'طابق ' + i, w: w, h: hh * i });
    const r = await post('seismic', { city: txt('s_city'), site: txt('s_site'), system: txt('s_sys'),
      hn: hh * n, W: w * n, Ie: val('s_ie'), stories: st });
    const F_ = r.dist.map(d => d.Fx), Hs = r.dist.map(d => d.h);
    $('#s_out').innerHTML = `<div class="grid g4">
      ${kpi('قص القاعدة V', nf(r.V, 1) + ' kN', 'ok')}${kpi('Cs المستخدم', nf(r.Cs_use, 4))}
      ${kpi('SDS', nf(r.SDS, 3))}${kpi('SD1', nf(r.SD1, 3))}
      ${kpi('الزمن الدوري Ta', nf(r.Ta, 3) + ' ث')}${kpi('معامل R', nf(r.R, 1))}
      ${kpi('صنف التصميم الزلزالي', r.sdc)}${kpi('الوزن الفعّال W', int(r.W) + ' kN')}</div>
      <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>توزيع القوى على الطوابق</h3>${table(['الطابق', 'الارتفاع (م)', 'الوزن (kN)', 'Cvx', 'Fx (kN)', 'القص Vx (kN)'],
        r.dist.slice().reverse().map(d => [d.level, nf(d.h, 1), int(d.w), nf(d.cvx, 3), nf(d.Fx, 1), nf(d.Vx, 1)]))}</div>
      <div class="card"><h3>مخطط القوى الجانبية</h3>${plot({ x: Hs, series: [{ y: F_, color: '#38bdf8', fill: 1 }],
        title: 'Fx (kN) مقابل الارتفاع (م)', h: 230 })}
        <div class="hint">${r.note}</div></div>
      <div class="card"><h3>المعاملات المستخدمة</h3>${table(['المعامل', 'القيمة'], [['Ss', nf(r.Ss, 3)], ['S1', nf(r.S1, 3)],
        ['Fa', nf(r.Fa, 2)], ['Fv', nf(r.Fv, 2)], ['SMS', nf(r.SMS, 3)], ['SM1', nf(r.SM1, 3)],
        ['Cs الأساسي', nf(r.Cs, 4)], ['Cs الأعلى', nf(r.Cs_max, 4)], ['Cs الأدنى', nf(r.Cs_min, 4)],
        ['k (التوزيع)', nf(r.k, 2)], ['النظام', r.system]])}</div></div>`;
  },
  init: () => PAGES.seismic.run()
};

/* -------------------------------- الرياح -------------------------------- */
PAGES.wind = {
  ic: '💨', name: 'أحمال الرياح', ttl: 'ضغط الرياح على المبنى',
  sub: 'qz = 0.613·Kz·Kzt·Kd·V²  —  ASCE 7 / الكود العراقي',
  desc: 'ضغوط الرياح وتوزيعها مع الارتفاع',
  html: () => `<div class="card"><h3>المعطيات</h3><div class="f">
      ${F('سرعة الرياح الأساسية V', 'w_v', 34, 1, 'م/ث')}
      ${S('تصنيف التعرّض', 'w_exp', [['B', 'B — حضري'], ['C', 'C — مفتوح'], ['D', 'D — ساحلي']], 'B')}
      ${F('ارتفاع المبنى', 'w_h', 18, .5, 'م')}${F('عرض الواجهة', 'w_b', 20, .5, 'م')}</div>
      <div class="row"><button class="btn" onclick="PAGES.wind.run()">احسب</button></div></div>
      <div id="w_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('wind', { V: val('w_v'), exposure: txt('w_exp'), h: val('w_h'), B: val('w_b') });
    $('#w_out').innerHTML = `<div class="grid g3">${kpi('ضغط السرعة عند القمة qh', nf(r.qh, 3) + ' kN/m²')}
      ${kpi('ضغط الجهة المقابلة', nf(r.p_lee, 3) + ' kN/m²')}${kpi('القوة الكلية التقريبية', nf(r.F_total, 1) + ' kN', 'ok')}</div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>الضغط مع الارتفاع</h3>
      ${plot({ x: r.levels.map(l => l.z), series: [{ y: r.levels.map(l => l.pw), color: '#22d3ee', fill: 1 }],
        title: 'ضغط الجهة المواجهة (kN/m²)', h: 230 })}</div>
      <div class="card"><h3>الجدول</h3>${table(['z (م)', 'Kz', 'qz (kN/m²)', 'ضغط مواجه (kN/m²)'],
        r.levels.map(l => [nf(l.z, 1), nf(l.Kz, 3), nf(l.qz, 3), nf(l.pw, 3)]))}
        <div class="hint">${r.note} — G=0.85، Cp = 0.8 مواجه / −0.5 مقابل، Kd=0.85</div></div></div>`;
  },
  init: () => PAGES.wind.run()
};

/* -------------------------------- الجسور -------------------------------- */
function spanRow(L, D, Lv) {
  return `<div class="sp"><input type="number" step="0.1" value="${L}" data-k="L" placeholder="الطول م">
   <input type="number" step="0.5" value="${D}" data-k="wD" placeholder="ميت kN/m">
   <input type="number" step="0.5" value="${Lv}" data-k="wL" placeholder="حي kN/m">
   <button class="btn gh" onclick="this.parentNode.remove()">✕</button></div>`;
}
function beamElevation(r) {
  const W = 860, H = 165, ml = 40, tot = r.total_L;
  const X = x => ml + x / tot * (W - 2 * ml), yT = 46, yB = 96;
  let g = `<rect x="${X(0)}" y="${yT}" width="${X(tot) - X(0)}" height="${yB - yT}" fill="#1e3a5f" stroke="#7dd3fc"/>`;
  let x = 0; const nodes = [0];
  r.spans.forEach(L => { x += L; nodes.push(x); });
  nodes.forEach((nx, i) => {
    g += `<polygon points="${X(nx)},${yB} ${X(nx) - 9},${yB + 15} ${X(nx) + 9},${yB + 15}" fill="#94a3b8"/>
      <line x1="${X(nx) - 13}" x2="${X(nx) + 13}" y1="${yB + 15}" y2="${yB + 15}" stroke="#94a3b8" stroke-width="2"/>`;
    const s = r.supports[i];
    if (s && s.flex) g += `<line x1="${X(Math.max(0, nx - (r.spans[i - 1] || 0) * .3))}" x2="${X(Math.min(tot, nx + (r.spans[i] || 0) * .3))}"
      y1="${yT + 8}" y2="${yT + 8}" stroke="#f87171" stroke-width="3"/>
      <text x="${X(nx)}" y="${yT - 6}" fill="#fca5a5" font-size="11" text-anchor="middle">${s.flex.bars.label} علوي</text>`;
  });
  r.design.forEach((d, i) => {
    const a = nodes[i], b = nodes[i + 1];
    g += `<line x1="${X(a) + 6}" x2="${X(b) - 6}" y1="${yB - 8}" y2="${yB - 8}" stroke="#34d399" stroke-width="3"/>
      <text x="${X((a + b) / 2)}" y="${yB + 34}" fill="#6ee7b7" font-size="11" text-anchor="middle">${d.flex.bars.label} سفلي</text>
      <text x="${X((a + b) / 2)}" y="${yB + 48}" fill="#93a4c0" font-size="10.5" text-anchor="middle">L=${nf(d.L, 2)} م · ${d.shear.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
PAGES.beam = {
  ic: '📏', name: 'تحليل وتصميم الجسور', ttl: 'الجسور الخرسانية — تحليل وتصميم',
  sub: 'تحليل مصفوفي للجسور المستمرة مع تحميل نمطي (Pattern Loading) وتصميم ACI 318-19',
  desc: 'عزوم وقصّ وهطول + تسليح كامل',
  html: () => `<div class="grid g2">
    <div class="card"><h3>الفضاءات والأحمال</h3>
      <div class="hint" style="margin:0 0 6px">الطول (م) · الحمل الميت (kN/m) · الحمل الحي (kN/m) — الوزن الذاتي يُضاف تلقائياً</div>
      <div class="spans" id="spans">${spanRow(6, 20, 12) + spanRow(6, 20, 12) + spanRow(6, 20, 12)}</div>
      <div class="row"><button class="btn gh" onclick="$('#spans').insertAdjacentHTML('beforeend', spanRow(6,20,12))">+ إضافة فضاء</button>
        ${C('تثبيت الطرف الأيسر', 'b_fl', 0)}${C('تثبيت الطرف الأيمن', 'b_fr', 0)}</div></div>
    <div class="card"><h3>المقطع والمواد</h3><div class="f">
      ${F('العرض b', 'b_b', 300, 10, 'مم')}${F('العمق h', 'b_h', 600, 10, 'مم')}
      ${F("f'c", 'b_fc', 25, 1, 'MPa')}${F('fy', 'b_fy', 420, 10, 'MPa')}
      ${F('الغطاء الخرساني', 'b_cov', 40, 5, 'مم')}
      ${S('قطر الحديد الرئيسي', 'b_db', [12, 16, 20, 25, 32], 16)}
      ${S('قطر الأساور', 'b_ds', [8, 10, 12], 10)}</div>
      <div class="row"><button class="btn" onclick="PAGES.beam.run()">تحليل وتصميم</button></div></div></div>
    <div id="b_out" style="margin-top:16px"></div>`,
  run: async () => {
    const spans = $$('#spans .sp').map(r => { const o = {}; $$('input', r).forEach(i => o[i.dataset.k] = parseFloat(i.value) || 0); return o; });
    if (!spans.length) return alert('أضف فضاءً واحداً على الأقل');
    const r = await post('beam', { spans, b: val('b_b'), h: val('b_h'), fc: val('b_fc'), fy: val('b_fy'),
      cover: val('b_cov'), db_main: parseFloat(txt('b_db')), db_stirrup: parseFloat(txt('b_ds')),
      fix_left: chk('b_fl'), fix_right: chk('b_fr') });
    const X = [], Mx = [], Mn_ = [], V = [], Df = [];
    r.env.forEach((sp, k) => sp.forEach((p, i) => { if (k && i === 0) return;
      X.push(p.x); Mx.push(p.Mmax); Mn_.push(p.Mmin); V.push(p.Vmax); Df.push(r.defl[k][i].d); }));
    const maxM = Math.max(...Mx), minM = Math.min(...Mn_), maxV = Math.max(...V.map(Math.abs));
    const dmax = Math.min(...r.design.map(d => d.d_long)), okAll = r.design.every(d => d.flex.ok && d.shear.ok && d.defl_ok);
    $('#b_out').innerHTML = `<div class="grid g4">
      ${kpi('أقصى عزم موجب', nf(maxM, 1) + ' kN·m')}${kpi('أقصى عزم سالب', nf(minM, 1) + ' kN·m')}
      ${kpi('أقصى قص', nf(maxV, 1) + ' kN')}${kpi('الهطول بعيد المدى', nf(dmax, 1) + ' مم', okAll ? 'ok' : 'warn')}
      ${kpi('العمق الفعّال d', nf(r.d, 0) + ' مم')}${kpi('الوزن الذاتي', nf(r.sw, 2) + ' kN/m')}
      ${kpi('Ec', int(r.Ec) + ' MPa')}${kpi('الحالة', okAll ? 'مقبول ✓' : 'يحتاج مراجعة', okAll ? 'ok' : 'bad')}</div>
    <div class="card" style="margin-top:16px"><h3>المخططات (مغلّف التحميل النمطي)</h3>
      ${plot({ x: X, series: [{ y: Mx, color: '#38bdf8', fill: 1 }, { y: Mn_, color: '#f87171', fill: 1 }],
        title: 'مخطط العزوم BMD (kN·m) — الموجب للأسفل', invert: 1, h: 240 })}
      ${plot({ x: X, series: [{ y: V, color: '#a78bfa', fill: 1 }], title: 'مخطط القص SFD (kN)', h: 200 })}
      ${plot({ x: X, series: [{ y: Df, color: '#34d399' }], title: 'الهطول الآني تحت (D+L) بالمليمتر', h: 190 })}
      <div class="legend"><span><i style="background:#38bdf8"></i>عزم موجب (شد سفلي)</span>
        <span><i style="background:#f87171"></i>عزم سالب (شد علوي)</span>
        <span><i style="background:#a78bfa"></i>قص</span><span><i style="background:#34d399"></i>هطول</span></div></div>
    <div class="card" style="margin-top:16px"><h3>مخطط التسليح التفصيلي</h3>${beamElevation(r)}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>تصميم الفضاءات</h3>${table(['الفضاء', 'Mu+ (kN·m)', 'As (مم²)', 'التسليح السفلي', 'φMn', 'Vu (kN)', 'الأساور', 'هطول/الحد', 'الحالة'],
        r.design.map(d => [d.idx, nf(d.Mpos, 1), int(d.flex.As_req), d.flex.bars.label, nf(d.flex.phiMn, 1),
          nf(d.Vu, 1), d.shear.label, nf(Math.abs(d.d_long), 1) + '/' + nf(d.d_limit, 1),
          tag(d.flex.ok && d.shear.ok && d.defl_ok)]))}</div>
      <div class="card"><h3>تصميم المساند (عزوم سالبة)</h3>${table(['المسند', 'Mu− (kN·m)', 'As (مم²)', 'التسليح العلوي', 'φMn'],
        r.supports.map(s => [s.idx + 1, nf(s.M, 1), s.flex ? int(s.flex.As_req) : '—',
          s.flex ? s.flex.bars.label : 'أقل تسليح', s.flex ? nf(s.flex.phiMn, 1) : '—']))}
        <div class="note">طول الرباط ld: علوي ${nf(r.ld_top, 0)} مم · سفلي ${nf(r.ld_bot, 0)} مم (ACI 25.4.2)</div></div>
      <div class="card"><h3>مقطع الفضاء</h3>${sectionSVG(r.b, r.h,
        { rows: [{ n: r.design[0].flex.bars.n, db: r.design[0].flex.bars.db, top: 0 }, { n: 2, db: 12, top: 1 }],
          stirrups: r.design[0].shear.label })}</div>
      <div class="card"><h3>مقطع المسند</h3>${(() => { const s = r.supports.find(s => s.flex);
        return s ? sectionSVG(r.b, r.h, { rows: [{ n: s.flex.bars.n, db: s.flex.bars.db, top: 1 }, { n: 2, db: 12, top: 0 }],
          stirrups: r.design[0].shear.label }) : '<div class="hint">لا توجد عزوم سالبة</div>'; })()}</div></div>`;
  },
  init: () => PAGES.beam.run()
};

/* ------------------------------- الأعمدة -------------------------------- */
PAGES.column = {
  ic: '🏛️', name: 'تصميم الأعمدة', ttl: 'الأعمدة الخرسانية — منحني التفاعل',
  sub: 'منحني تفاعل بالتوافق الانفعالي (Strain Compatibility) + فحص النحافة ACI 318-19',
  desc: 'منحني P–M وفحص النحافة والتطويق',
  html: () => `<div class="grid g2"><div class="card"><h3>المقطع والتسليح</h3><div class="f">
      ${F('العرض b', 'c_b', 400, 10, 'مم')}${F('العمق h', 'c_h', 500, 10, 'مم')}
      ${F("f'c", 'c_fc', 28, 1, 'MPa')}${F('fy', 'c_fy', 420, 10, 'MPa')}
      ${S('قطر السيخ', 'c_db', [16, 20, 25, 32], 20)}
      ${F('عدد الأسياخ بالوجه العلوي/السفلي', 'c_nb', 3, 1)}
      ${F('عدد الأسياخ بالوجه الجانبي', 'c_nh', 3, 1)}</div></div>
    <div class="card"><h3>الأحمال والنحافة</h3><div class="f">
      ${F('Pu', 'c_pu', 1800, 10, 'kN')}${F('Mu', 'c_mu', 150, 5, 'kN·m')}
      ${F('M1 (العزم الأصغر)', 'c_m1', 0, 5, 'kN·m')}
      ${F('الطول غير المسند lu', 'c_lu', 3.2, .1, 'م')}${F('معامل الطول k', 'c_k', 1.0, .05)}
      ${C('إطار غير قابل للإزاحة الجانبية', 'c_br', 1)}</div>
      <div class="row"><button class="btn" onclick="PAGES.column.run()">تصميم وفحص</button></div></div></div>
    <div id="c_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('column', { b: val('c_b'), h: val('c_h'), fc: val('c_fc'), fy: val('c_fy'),
      db: parseFloat(txt('c_db')), nb: val('c_nb'), nh: val('c_nh'), Pu: val('c_pu'), Mu: val('c_mu'),
      M1: val('c_m1'), lu: val('c_lu'), k: val('c_k'), braced: chk('c_br') });
    const W = 560, H = 380, ml = 62, mb = 42;
    const Ms = r.pts.map(p => p.M), Ps = r.pts.map(p => p.P);
    const m1 = Math.max(...Ms) * 1.15, p1 = Math.max(...Ps) * 1.1, p0 = Math.min(0, ...Ps) * 1.2;
    const X = v => ml + v / m1 * (W - ml - 20), Y = v => H - mb - (v - p0) / (p1 - p0) * (H - mb - 20);
    let g = '';
    for (let i = 0; i <= 5; i++) { const v = p0 + (p1 - p0) * i / 5;
      g += `<line x1="${ml}" x2="${W - 20}" y1="${Y(v)}" y2="${Y(v)}" stroke="#22304f"/>
        <text x="${ml - 6}" y="${Y(v) + 4}" fill="#93a4c0" font-size="10" text-anchor="end">${int(v)}</text>`; }
    for (let i = 0; i <= 5; i++) { const v = m1 * i / 5;
      g += `<line x1="${X(v)}" x2="${X(v)}" y1="20" y2="${H - mb}" stroke="#22304f"/>
        <text x="${X(v)}" y="${H - mb + 16}" fill="#93a4c0" font-size="10" text-anchor="middle">${int(v)}</text>`; }
    g += `<polyline points="${r.pts.map(p => `${X(p.M)},${Y(p.P)}`).join(' ')}" fill="#38bdf822" stroke="#38bdf8" stroke-width="2"/>`;
    g += `<line x1="${X(0)}" x2="${X(r.Mc)}" y1="${Y(r.Pu)}" y2="${Y(r.Pu)}" stroke="#64748b" stroke-dasharray="4 3"/>
      <circle cx="${X(r.Mc)}" cy="${Y(r.Pu)}" r="6" fill="${r.ok ? '#34d399' : '#f87171'}" stroke="#fff" stroke-width="1.5"/>
      <text x="${X(r.Mc) + 10}" y="${Y(r.Pu) - 8}" fill="#fff" font-size="11">(${nf(r.Mc, 0)} , ${nf(r.Pu, 0)})</text>
      <text x="${W / 2}" y="${H - 6}" fill="#93a4c0" font-size="11" text-anchor="middle">φMn (kN·m)</text>
      <text x="14" y="${H / 2}" fill="#93a4c0" font-size="11" transform="rotate(-90 14 ${H / 2})" text-anchor="middle">φPn (kN)</text>`;
    $('#c_out').innerHTML = `<div class="grid g4">
      ${kpi('نسبة الاستغلال', nf(r.ratio, 2), r.ok ? 'ok' : 'bad')}
      ${kpi('φMn عند Pu', nf(r.phiMn, 1) + ' kN·m')}${kpi('φPn,max', int(r.phiPn_max) + ' kN')}
      ${kpi('نسبة التسليح ρ', nf(r.rho * 100, 2) + '%', r.rho_ok ? 'ok' : 'bad')}
      ${kpi('النحافة klu/r', nf(r.slend, 1) + ' / ' + nf(r.slend_lim, 1), r.slender ? 'warn' : 'ok')}
      ${kpi('معامل التكبير δ', nf(r.delta, 3))}${kpi('Mc المصمم', nf(r.Mc, 1) + ' kN·m')}
      ${kpi('الحالة', r.ok ? 'مقبول ✓' : 'غير مقبول ✗', r.ok ? 'ok' : 'bad')}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>منحني التفاعل P–M</h3><svg viewBox="0 0 ${W} ${H}">${g}</svg>
        <div class="legend"><span><i style="background:#38bdf8"></i>منحني المقاومة المصمّمة φPn–φMn</span>
        <span><i style="background:${r.ok ? '#34d399' : '#f87171'}"></i>نقطة التحميل</span></div></div>
      <div class="card"><h3>المقطع والتفاصيل</h3>
        ${sectionSVG(r.b, r.h, { layers: r.layers.map(l => [l[0], l[1], Math.round(l[1] / (Math.PI * r.db * r.db / 4))]), db: r.db })}
        ${table(['البند', 'القيمة'], [['التسليح الطولي', r.bars], ['مساحة الحديد Ast', int(r.Ast) + ' مم²'],
          ['نسبة التسليح', nf(r.rho * 100, 2) + '% (الحد 1–8%)'], ['الأساور/التطويق', r.ties],
          ['المساحة Ag', int(r.Ag) + ' مم²'], ['P0', int(r.P0) + ' kN'],
          ['نحافة', r.slender ? 'عمود نحيف — تم التكبير' : 'عمود قصير']])}
        ${r.slender ? '<div class="note">العمود نحيف: تم تكبير العزم بطريقة تكبير العزوم (ACI 6.6.4).</div>' : ''}</div></div>`;
  },
  init: () => PAGES.column.run()
};

/* -------------------------------- الأسس --------------------------------- */
PAGES.footing = {
  ic: '🧱', name: 'تصميم الأسس', ttl: 'الأساس المنفرد تحت العمود',
  sub: 'الأبعاد وقص الثقب (Punching) والقص الأحادي والانحناء — ACI 318-19 الفصل 13',
  desc: 'أبعاد + قص ثقب + تسليح',
  html: () => `<div class="grid g2"><div class="card"><h3>الأحمال والتربة</h3><div class="f">
      ${F('الحمل الميت PD', 'f_pd', 900, 10, 'kN')}${F('الحمل الحي PL', 'f_pl', 450, 10, 'kN')}
      ${F('عزم على الأساس M', 'f_m', 0, 5, 'kN·m')}
      ${F('تحمّل التربة المسموح qa', 'f_qa', 150, 5, 'kN/m²')}
      ${F('عمق التأسيس Df', 'f_df', 1.5, .1, 'م')}</div></div>
    <div class="card"><h3>العمود والمواد</h3><div class="f">
      ${F('عرض العمود cx', 'f_cx', 400, 10, 'مم')}${F('عمق العمود cy', 'f_cy', 400, 10, 'مم')}
      ${F("f'c", 'f_fc', 25, 1, 'MPa')}${F('fy', 'f_fy', 420, 10, 'MPa')}</div>
      <div class="row"><button class="btn" onclick="PAGES.footing.run()">تصميم الأساس</button></div></div></div>
    <div id="f_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('footing', { PD: val('f_pd'), PL: val('f_pl'), M: val('f_m'), qa: val('f_qa'),
      Df: val('f_df'), cx: val('f_cx'), cy: val('f_cy'), fc: val('f_fc'), fy: val('f_fy') });
    const W = 400, H = 210, S = 300 / (r.B * 1000), bw = r.B * 1000 * S, hh = r.h * S;
    const ox = (W - bw) / 2, oy = 40, cw = r.cx * S;
    const g = `<rect x="${ox}" y="${oy}" width="${bw}" height="${hh}" fill="#1e3a5f" stroke="#7dd3fc" stroke-width="1.6"/>
      <rect x="${(W - cw) / 2}" y="${oy - 30}" width="${cw}" height="30" fill="#334155" stroke="#94a3b8"/>
      <line x1="${ox + 8}" x2="${ox + bw - 8}" y1="${oy + hh - 10}" y2="${oy + hh - 10}" stroke="#f87171" stroke-width="3"/>
      <text x="${W / 2}" y="${oy + hh + 20}" fill="#93a4c0" font-size="11" text-anchor="middle">B = ${nf(r.B, 2)} م × ${nf(r.B, 2)} م</text>
      <text x="${ox + bw + 6}" y="${oy + hh / 2}" fill="#93a4c0" font-size="11">h=${int(r.h)}مم</text>
      <text x="${W / 2}" y="${oy + hh + 40}" fill="#fca5a5" font-size="11.5" text-anchor="middle">${r.bars_label}</text>
      ${[...Array(9)].map((_, i) => { const x = ox + bw * i / 8;
        return `<line x1="${x}" x2="${x}" y1="${oy + hh}" y2="${oy + hh + 8 + (i % 2 ? 4 : 0)}" stroke="#64748b"/>`; }).join('')}`;
    $('#f_out').innerHTML = `<div class="grid g4">
      ${kpi('أبعاد الأساس', nf(r.B, 2) + '×' + nf(r.B, 2) + ' م', 'ok')}${kpi('السماكة h', int(r.h) + ' مم')}
      ${kpi('ضغط التربة qu', nf(r.qu_max, 1) + ' kN/m²')}${kpi('صافي تحمّل التربة', nf(r.q_net, 1) + ' kN/m²')}
      ${kpi('نسبة قص الثقب', nf(r.punch_ratio, 2), r.punch_ratio <= 1 ? 'ok' : 'bad')}
      ${kpi('نسبة القص الأحادي', nf(r.oneway_ratio, 2), r.oneway_ratio <= 1 ? 'ok' : 'bad')}
      ${kpi('حجم الخرسانة', nf(r.conc, 2) + ' م³')}${kpi('الحالة', r.ok ? 'مقبول ✓' : 'راجع', r.ok ? 'ok' : 'bad')}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>مقطع الأساس</h3><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>
      <div class="card"><h3>نتائج الفحوصات</h3>${table(['الفحص', 'المطلوب Vu/Mu', 'المقاومة φVn', 'الحالة'], [
        ['قص الثقب (اتجاهين)', nf(r.Vu2, 1) + ' kN', nf(r.phiVc2, 1) + ' kN', tag(r.Vu2 <= r.phiVc2)],
        ['القص الأحادي', nf(r.Vu1, 1) + ' kN', nf(r.phiVc1, 1) + ' kN', tag(r.Vu1 <= r.phiVc1)],
        ['الانحناء عند وجه العمود', nf(r.Mu, 1) + ' kN·m/م', '—', tag(true)],
        ['ارتكاز العمود', nf(r.Pu, 1) + ' kN', nf(r.bearing, 1) + ' kN', tag(r.Pu <= r.bearing)]])}
        ${table(['البند', 'القيمة'], [['حمل الخدمة Ps', nf(r.Ps, 1) + ' kN'], ['الحمل المعامل Pu', nf(r.Pu, 1) + ' kN'],
          ['العمق الفعّال d', int(r.d) + ' مم'], ['As المطلوب', int(r.As) + ' مم²/م'],
          ['As الأدنى (0.0018)', int(r.As_min) + ' مم²/م'], ['التسليح', r.bars_label],
          ['أسياخ التوصيل (Dowels)', int(r.dowels) + ' مم² (0.5% من مساحة العمود)']])}</div></div>`;
  },
  init: () => PAGES.footing.run()
};

/* ------------------------------- البلاطات ------------------------------- */
PAGES.slab = {
  ic: '⬜', name: 'تصميم البلاطات', ttl: 'البلاطات الخرسانية',
  sub: 'أحادية الاتجاه بمعاملات ACI 6.5.2 · ثنائية الاتجاه بطريقة التصميم المباشر DDM',
  desc: 'سماكة وتسليح أحادية/ثنائية الاتجاه',
  html: () => `<div class="card"><h3>المعطيات</h3><div class="f">
      ${S('نوع البلاطة', 'sl_k', [['one', 'أحادية الاتجاه'], ['two', 'ثنائية الاتجاه (DDM)']], 'one')}
      ${F('الفضاء Lx', 'sl_lx', 4.0, .1, 'م')}${F('الفضاء Ly (للثنائية)', 'sl_ly', 5.0, .1, 'م')}
      ${F('عدد الفضاءات', 'sl_n', 3, 1)}${F('حمل ميت إضافي', 'sl_wd', 3.0, .1, 'kN/m²')}
      ${F('حمل حي', 'sl_wl', 2.0, .1, 'kN/m²')}${F('السماكة (0=تلقائي)', 'sl_h', 0, 10, 'مم')}
      ${F("f'c", 'sl_fc', 25, 1, 'MPa')}${F('fy', 'sl_fy', 420, 10, 'MPa')}</div>
      <div class="row"><button class="btn" onclick="PAGES.slab.run()">تصميم البلاطة</button></div></div>
    <div id="sl_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('slab', { kind: txt('sl_k'), Lx: val('sl_lx'), Ly: val('sl_ly'), nspans: val('sl_n'),
      wD: val('sl_wd'), wL: val('sl_wl'), h: val('sl_h'), fc: val('sl_fc'), fy: val('sl_fy') });
    let body;
    if (r.kind === 'one') {
      body = `<div class="grid g2"><div class="card"><h3>تسليح البلاطة (لكل متر عرض)</h3>
        ${table(['الموقع', 'Mu (kN·m/م)', 'As (مم²/م)', 'التسليح'],
          r.results.map(x => [x.name, nf(x.M, 1), int(x.As), x.label]))}
        <div class="note">حديد الانكماش والحرارة: ${r.shrink.label} (${int(r.shrink.As)} مم²/م) — ACI 24.4</div></div>
      <div class="card"><h3>القص والسماكة</h3>${table(['البند', 'القيمة'], [
        ['السماكة المستخدمة', int(r.h) + ' مم'], ['السماكة الدنيا (ACI 7.3.1.1)', nf(r.hmin, 0) + ' مم'],
        ['العمق الفعّال d', nf(r.d, 0) + ' مم'], ['الوزن الذاتي', nf(r.sw, 2) + ' kN/m²'],
        ['wu المعامل', nf(r.wu, 2) + ' kN/m²'], ['Vu عند وجه المسند', nf(r.V, 1) + ' kN/م'],
        ['φVc', nf(r.phiVc, 1) + ' kN/م'], ['فحص القص', tag(r.shear_ok)]])}</div></div>`;
    } else {
      body = `<div class="grid g2">${r.dirs.map(d => `<div class="card"><h3>${d.dir}</h3>
        <div class="hint">العزم الساكن الكلي Mo = ${nf(d.Mo, 1)} kN·m</div>
        ${table(['الموقع', 'M (kN·m)', 'حصة الشريط العمودي', 'التسليح'],
          d.rows.map(x => [x.name, nf(x.M, 1), nf(x.Mcs, 1), x.label]))}</div>`).join('')}
        <div class="card"><h3>البيانات</h3>${table(['البند', 'القيمة'], [
          ['L1 / L2', nf(r.L1, 2) + ' / ' + nf(r.L2, 2) + ' م'], ['β = L1/L2', nf(r.beta, 2)],
          ['التصنيف', r.two_way ? 'ثنائية الاتجاه ✓' : 'β>2 — تُصمم كأحادية الاتجاه'],
          ['السماكة', int(r.h) + ' مم (الدنيا ' + nf(r.hmin, 0) + ')'],
          ['wu', nf(r.wu, 2) + ' kN/m²']])}
          <div class="note">طريقة التصميم المباشر تتطلب: 3 فضاءات فأكثر بكل اتجاه، نسبة الفضاءات ≤ 2،
          والحمل الحي ≤ 2× الحمل الميت (ACI 8.10.2).</div></div></div>`;
    }
    $('#sl_out').innerHTML = `<div class="grid g4">${kpi('السماكة', int(r.h) + ' مم', 'ok')}
      ${kpi('السماكة الدنيا', nf(r.hmin, 0) + ' مم')}${kpi('wu', nf(r.wu, 2) + ' kN/m²')}
      ${kpi('الوزن الذاتي', nf(r.sw, 2) + ' kN/m²')}</div>
      <div style="margin-top:16px">${body}</div>`;
  },
  init: () => PAGES.slab.run()
};

/* ------------------------------- X-RAY ---------------------------------- */
function xraySVG(r) {
  const W = 880, mgL = 70, mgR = 60, mgT = 34, mgB = 54;
  const xmax = r.xs[r.xs.length - 1], ymax = r.ys[r.ys.length - 1];
  const sc = Math.min((W - mgL - mgR) / xmax, 430 / ymax);
  const H = ymax * sc + mgT + mgB;
  const X = x => mgL + x * sc, Y = y => H - mgB - y * sc;
  let g = `<defs><pattern id="hz" width="9" height="9" patternTransform="rotate(45)"
    patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="9" stroke="#475569" stroke-width="2"/></pattern></defs>`;
  g += `<line x1="${X(0) - 30}" x2="${X(xmax) + 30}" y1="${Y(0)}" y2="${Y(0)}" stroke="#64748b" stroke-width="2"/>
    <rect x="${X(0) - 30}" y="${Y(0)}" width="${X(xmax) - X(0) + 60}" height="14" fill="url(#hz)" opacity=".8"/>`;
  r.members.forEach(m => {
    const a = r.nodes[m.ni], b = r.nodes[m.nj], c = rcol(m.ratio);
    const w = m.kind === 'col' ? 9 : 7;
    g += `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${c}"
      stroke-width="${w}" stroke-linecap="round" opacity=".92"><title>${m.kind === 'col' ? 'عمود' : 'جسر'} ${m.story}-${m.pos} — نسبة ${nf(m.ratio, 2)}</title></line>`;
    const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.y) + Y(b.y)) / 2;
    g += `<text x="${mx}" y="${my + (m.kind === 'col' ? 0 : -9)}" fill="#0b1220" font-size="9.5"
      font-weight="700" text-anchor="middle" stroke="#e2e8f0" stroke-width="2.4" paint-order="stroke">${nf(m.ratio, 2)}</text>`;
  });
  r.nodes.forEach(n => { g += `<circle cx="${X(n.x)}" cy="${Y(n.y)}" r="3.4" fill="#0b1220" stroke="#94a3b8" stroke-width="1.4"/>`; });
  r.ys.forEach((y, j) => { if (j) g += `<text x="${X(0) - 12}" y="${Y(y) + 4}" fill="#93a4c0" font-size="10.5"
    text-anchor="end">ط${j} (${nf(y, 1)}م)</text>`; });
  r.xs.forEach((x, i) => { if (i < r.xs.length - 1) g += `<text x="${(X(x) + X(r.xs[i + 1])) / 2}" y="${H - 30}"
    fill="#93a4c0" font-size="10.5" text-anchor="middle">${nf(r.xs[i + 1] - x, 1)} م</text>`; });
  if (r.seismic) r.seismic.dist.forEach((d, j) => {
    const y = Y(r.ys[j + 1]), x = X(0);
    g += `<line x1="${x - 46}" x2="${x - 8}" y1="${y}" y2="${y}" stroke="#fbbf24" stroke-width="2"
      marker-end="url(#ar)"/><text x="${x - 48}" y="${y - 5}" fill="#fbbf24" font-size="9.5" text-anchor="end">${nf(d.Fx, 0)} kN</text>`;
  });
  g += `<defs><marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <polygon points="0,0 7,3.5 0,7" fill="#fbbf24"/></marker></defs>`;
  return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
PAGES.xray = {
  ic: '🩻', name: 'X-Ray الإنشائي', ttl: 'الفحص الشعاعي للمنشأ (X-Ray)',
  sub: 'تحليل الإطار الكامل تحت كل تراكيب الأحمال + تصميم كل عنصر + خريطة نسب الاستغلال',
  desc: 'خريطة حرارية لنسبة استغلال كل عنصر',
  html: () => `<div class="grid g2"><div class="card"><h3>هندسة المنشأ</h3><div class="f">
      ${F('عدد البحور', 'x_nb', 3, 1)}${F('طول البحر', 'x_sp', 6.0, .5, 'م')}
      ${F('عدد الطوابق', 'x_ns', 4, 1)}${F('ارتفاع الطابق', 'x_hs', 3.2, .1, 'م')}
      ${F('عرض الجسر', 'x_bb', 300, 10, 'مم')}${F('عمق الجسر', 'x_bh', 600, 10, 'مم')}
      ${F('عرض العمود', 'x_cb', 400, 10, 'مم')}${F('عمق العمود', 'x_ch', 500, 10, 'مم')}
      ${S('قطر حديد العمود', 'x_dbc', [16, 20, 25, 32], 20)}
      ${F('أسياخ الوجه العلوي/السفلي', 'x_nbb', 3, 1)}${F('أسياخ الوجه الجانبي', 'x_nhh', 3, 1)}</div></div>
    <div class="card"><h3>الأحمال والمواد</h3><div class="f">
      ${F('حمل ميت للطابق', 'x_wd', 7.0, .1, 'kN/m²')}${F('حمل حي للطابق', 'x_wl', 2.0, .1, 'kN/m²')}
      ${F('العرض المؤثر (Tributary)', 'x_tr', 4.0, .1, 'م')}
      ${F("f'c", 'x_fc', 28, 1, 'MPa')}${F('fy', 'x_fy', 420, 10, 'MPa')}
      ${S('المحافظة', 'x_city', META.cities.map(c => c.name), 'بغداد')}
      ${S('صنف الموقع', 'x_site', ['A', 'B', 'C', 'D', 'E'], 'D')}
      ${S('النظام الإنشائي', 'x_sys', META.systems.map(s => s.name), META.systems[1] && META.systems[1].name)}
      ${C('تضمين الأحمال الزلزالية', 'x_seis', 1)}</div>
      <div class="row"><button class="btn" onclick="PAGES.xray.run()">🩻 تشغيل الفحص الشعاعي</button></div></div></div>
    <div id="x_out" style="margin-top:16px"></div>`,
  run: async () => {
    const nb = Math.max(1, Math.round(val('x_nb'))), ns = Math.max(1, Math.round(val('x_ns')));
    const r = await post('xray', {
      bays: Array(nb).fill(val('x_sp')), heights: Array(ns).fill(val('x_hs')),
      beam_b: val('x_bb'), beam_h: val('x_bh'), col_b: val('x_cb'), col_h: val('x_ch'),
      db_col: parseFloat(txt('x_dbc')), nb_bars: val('x_nbb'), nh_bars: val('x_nhh'),
      fc: val('x_fc'), fy: val('x_fy'), wD: val('x_wd'), wL: val('x_wl'), trib: val('x_tr'),
      seismic: chk('x_seis'), city: txt('x_city'), site: txt('x_site'), system: txt('x_sys') });
    const bad = r.members.filter(m => m.ratio > 1), warn = r.members.filter(m => m.ratio > .9 && m.ratio <= 1);
    const dOK = r.drift.every((d, i) => d <= r.drift_lim[i]);
    const beams = r.members.filter(m => m.kind === 'beam'), cols = r.members.filter(m => m.kind === 'col');
    $('#x_out').innerHTML = `<div class="grid g4">
      ${kpi('عدد العناصر', r.members.length)}${kpi('أعلى نسبة استغلال', nf(r.worst, 2), r.worst <= 1 ? 'ok' : 'bad')}
      ${kpi('عناصر غير كافية', bad.length, bad.length ? 'bad' : 'ok')}
      ${kpi('عناصر حرجة (0.9–1.0)', warn.length, warn.length ? 'warn' : 'ok')}
      ${kpi('قص القاعدة الزلزالي', r.seismic ? nf(r.seismic.V, 1) + ' kN' : '—')}
      ${kpi('أقصى انزياح طابقي', nf(Math.max(...r.drift), 1) + ' مم', dOK ? 'ok' : 'bad')}
      ${kpi('حجم الخرسانة للإطار', nf(r.conc, 2) + ' م³')}
      ${kpi('التشخيص العام', r.worst <= 1 && dOK ? 'سليم ✓' : 'يحتاج معالجة', r.worst <= 1 && dOK ? 'ok' : 'bad')}</div>
    <div class="card" style="margin-top:16px"><h3>خريطة الفحص الشعاعي — نسبة الاستغلال لكل عنصر</h3>
      ${xraySVG(r)}
      <div class="legend"><span><i style="background:#34d399"></i>آمن ≤ 0.70</span>
        <span><i style="background:#a3e635"></i>0.70–0.90</span><span><i style="background:#fbbf24"></i>حرج 0.90–1.00</span>
        <span><i style="background:#f87171"></i>غير كافٍ > 1.00</span>
        <span>تراكيب الأحمال: ${r.combos.join(' · ')}</span></div>
      <div class="note">${r.worst <= 1 && dOK ? 'جميع العناصر ضمن الحدود المسموحة، والانزياح الطابقي مقبول.'
        : 'يوجد عناصر تتجاوز مقاومتها التصميمية أو انزياح زائد — زد المقاطع أو نسبة التسليح.'}</div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>الجسور — القوى والتسليح</h3><div style="max-height:420px;overflow:auto">
        ${table(['الطابق', 'البحر', 'M+ ', 'M−', 'V', 'سفلي', 'علوي', 'أساور', 'النسبة'],
          beams.map(m => [m.story, m.pos, nf(m.det.Mpos, 1), nf(m.det.Mneg, 1), nf(m.det.V, 1),
            m.det.bot, m.det.top, m.det.stirrups,
            `<b style="color:${rcol(m.ratio)}">${nf(m.ratio, 2)}</b>`]))}</div></div>
      <div class="card"><h3>الأعمدة — القوى والتحقق</h3><div style="max-height:420px;overflow:auto">
        ${table(['الطابق', 'المحور', 'Pu (kN)', 'Mu (kN·m)', 'φMn', 'التسليح', 'النسبة'],
          cols.map(m => [m.story, m.pos, nf(m.det.P, 1), nf(m.det.M, 1), nf(m.det.phiMn, 1), m.det.bars,
            `<b style="color:${rcol(m.ratio)}">${nf(m.ratio, 2)}</b>`]))}</div></div>
      <div class="card"><h3>الانزياح الطابقي (Drift)</h3>
        ${table(['الطابق', 'الانزياح المكبّر (مم)', 'الحد 2%h (مم)', 'الحالة'],
          r.drift.map((d, i) => [i + 1, nf(d, 2), nf(r.drift_lim[i], 1), tag(d <= r.drift_lim[i])]))}
        <div class="hint">الانزياح مكبّر بمعامل Cd وفق ASCE 7 / الكود العراقي.</div></div>
      <div class="card"><h3>ملخص النموذج</h3>${table(['البند', 'القيمة'], [
        ['عدد العقد', r.nodes.length], ['عدد البحور × الطوابق', r.nb + ' × ' + r.ns],
        ['مقطع الجسر', `${r.beam.b}×${r.beam.h} مم (d=${nf(r.beam.d, 0)})`],
        ['مقطع العمود', `${r.col.b}×${r.col.h} مم`],
        ['حمل الجسر الميت', nf(r.gD, 2) + ' kN/م'], ['حمل الجسر الحي', nf(r.gL, 2) + ' kN/م'],
        ['وزن الإطار الزلزالي W', int(r.W) + ' kN'],
        ['صلابة مشقّقة', 'جسور 0.35Ig · أعمدة 0.70Ig (ACI 6.6.3.1.1)']])}</div></div>`;
  },
  init: () => PAGES.xray.run()
};

/* ------------------------------- الكميات -------------------------------- */
PAGES.boq = {
  ic: '📋', name: 'جدول الكميات', ttl: 'حساب الكميات والكلفة التقديرية',
  sub: 'الخرسانة والحديد والقوالب والأعمال المكمّلة — بالدينار العراقي',
  desc: 'كميات وكلفة تقديرية بالدينار',
  html: () => `<div class="grid g2"><div class="card"><h3>العناصر الإنشائية</h3><div class="f">
      ${F('عدد الجسور', 'q_nb', 24, 1)}${F('عرض×عمق الجسر (مم)', 'q_bb', 300, 10)}
      ${F('عمق الجسر', 'q_bh', 600, 10, 'مم')}${F('طول الجسر', 'q_bl', 6, .5, 'م')}
      ${F('عدد الأعمدة', 'q_nc', 16, 1)}${F('عرض العمود', 'q_cb', 400, 10, 'مم')}
      ${F('عمق العمود', 'q_ch', 500, 10, 'مم')}${F('طول العمود', 'q_cl', 3.2, .1, 'م')}
      ${F('عدد الطوابق (بلاطات)', 'q_nsl', 4, 1)}${F('مساحة البلاطة', 'q_sa', 324, 1, 'م²')}
      ${F('سماكة البلاطة', 'q_sh', 150, 10, 'مم')}</div></div>
    <div class="card"><h3>أعمال مكمّلة وأسعار الوحدة (دينار)</h3><div class="f">
      ${F('حفريات', 'q_ex', 200, 10, 'م³')}${F('بناء طابوق', 'q_bl2', 800, 10, 'م²')}
      ${F('لبخ وإكساء', 'q_pl', 1600, 10, 'م²')}
      ${F('سعر م³ خرسانة', 'q_rc', 150000, 1000)}${F('سعر طن حديد', 'q_rs', 1200000, 10000)}
      ${F('سعر م² قوالب', 'q_rf', 25000, 1000)}${F('سعر م³ حفر', 'q_re', 15000, 1000)}
      ${F('سعر م² بناء', 'q_rb', 20000, 1000)}${F('سعر م² لبخ', 'q_rp', 12000, 1000)}</div>
      <div class="row"><button class="btn" onclick="PAGES.boq.run()">احسب الكميات</button></div></div></div>
    <div id="q_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('boq', { items: [
      { name: 'جسور', type: 'beam', n: val('q_nb'), b: val('q_bb'), h: val('q_bh'), L: val('q_bl') },
      { name: 'أعمدة', type: 'col', n: val('q_nc'), b: val('q_cb'), h: val('q_ch'), L: val('q_cl') },
      { name: 'بلاطات', type: 'slab', n: val('q_nsl'), h: val('q_sh'), area: val('q_sa') }],
      excav: val('q_ex'), block: val('q_bl2'), plaster: val('q_pl'),
      rates: { concrete: val('q_rc'), steel: val('q_rs'), form: val('q_rf'), excav: val('q_re'),
        block: val('q_rb'), plaster: val('q_rp') } });
    const M = x => int(x) + ' د.ع';
    $('#q_out').innerHTML = `<div class="grid g4">
      ${kpi('إجمالي الخرسانة', nf(r.conc, 1) + ' م³', 'ok')}${kpi('إجمالي الحديد', nf(r.steel, 2) + ' طن')}
      ${kpi('مساحة القوالب', nf(r.form, 1) + ' م²')}${kpi('الكلفة التقديرية', M(r.total), 'ok')}
      ${kpi('الإسمنت التقريبي', int(r.cement) + ' كيس')}${kpi('الرمل', nf(r.sand, 1) + ' م³')}
      ${kpi('الحصى (سبيس)', nf(r.gravel, 1) + ' م³')}${kpi('معدل الحديد', nf(r.steel * 1000 / (r.conc || 1), 0) + ' كغم/م³')}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>الأعمال الإنشائية</h3>${table(['العنصر', 'العدد', 'خرسانة (م³)', 'حديد (طن)', 'قوالب (م²)', 'الكلفة'],
        r.rows.map(x => [x.name, x.n, nf(x.conc, 2), nf(x.steel, 3), nf(x.form, 1), M(x.cost)]))}</div>
      <div class="card"><h3>الأعمال المكمّلة</h3>${table(['البند', 'الكمية', 'الوحدة', 'السعر', 'الكلفة'],
        r.extra.map(x => [x.name, nf(x.q, 1), x.unit, int(x.rate), M(x.cost)]))}
        <div class="note">الكلفة تقديرية أولية لأغراض الدراسة ولا تُعتمد للمناقصات دون تدقيق الأسعار المحلية.</div></div></div>`;
  },
  init: () => PAGES.boq.run()
};

/* ------------------------------- المرجع --------------------------------- */
PAGES.ref = {
  ic: '📚', name: 'مرجع الكود', ttl: 'المرجع الفني والمعادلات المعتمدة',
  sub: 'ما الذي يحسبه البرنامج بالضبط، ووفق أي بند من الكود',
  desc: 'المعادلات والمراجع والفرضيات',
  html: () => `<div class="grid g2">
    <div class="card ref"><h3>التحليل الإنشائي</h3>
      <h4>طريقة الصلابة المباشرة</h4><ul>
      <li>إطار مستوي بثلاث درجات حرية لكل عقدة (ux, uy, θz) وحلّ <code>K·u = P</code> بطريقة غاوس.</li>
      <li>عزوم التثبيت للحمل الموزع: <code>±wL²/12</code> وردود <code>wL/2</code>.</li>
      <li>القوى الداخلية: <code>V(x)=Vi+w·x</code> و <code>M(x)=−Mi+Vi·x+w·x²/2</code>.</li>
      <li>الهطول بدوال Hermite مع الحل الخاص <code>w·x²(L−x)²/24EI</code>.</li>
      <li>تحميل نمطي (Pattern Loading) لاستخراج مغلّف العزوم في الجسور المستمرة.</li>
      <li>صلابة مشقّقة: جسور 0.35Ig، أعمدة 0.70Ig (ACI 6.6.3.1.1).</li></ul>
      <h4>تم التحقق من المحلل مقابل</h4><ul>
      <li>جسر بسيط الإسناد: M=wL²/8 و δ=5wL⁴/384EI ✓</li>
      <li>جسر مثبت الطرفين: ∓wL²/12 و +wL²/24 ✓</li>
      <li>كابولي ومسنود-مثبت (wL²/8) ومستمر بفضاءين (wL²/8، R=1.25wL) ✓</li></ul></div>
    <div class="card ref"><h3>تصميم الخرسانة — ACI 318-19</h3><ul>
      <li>β1 = 0.85 لـ f'c ≤ 28 MPa، ثم <code>0.85−0.05(f'c−28)/7 ≥ 0.65</code> (22.2.2.4.3).</li>
      <li>φ الانحناء 0.90 للمقاطع المشدودة، ويتدرّج إلى 0.65 حسب εt (21.2.2).</li>
      <li>As,min = <code>max(0.25√f'c/fy , 1.4/fy)·b·d</code> (9.6.1.2).</li>
      <li>القص: <code>Vc = 0.17λ√f'c·bw·d</code>، φ=0.75، <code>Vs ≤ 0.66√f'c·bw·d</code> (22.5).</li>
      <li>تباعد الأساور ≤ d/2 أو 600مم، ويُنصّف عند Vs كبير (9.7.6.2.2).</li>
      <li>طول الرباط ld وفق 25.4.2 مع معاملات ψt, ψe, ψs.</li>
      <li>الأعمدة: منحني تفاعل بالتوافق الانفعالي (εcu=0.003)، <code>φPn,max=0.80φP0</code> للمطوّقة (22.4.2.1).</li>
      <li>النحافة: <code>klu/r ≤ 34−12(M1/M2)</code> وإلا تكبير العزوم (6.6.4).</li>
      <li>الهطول: عزم القصور الفعّال Ie بطريقة Branson (24.2.3) مع معامل الزمن 2.0.</li>
      <li>البلاطات: السماكات الدنيا (7.3.1.1 و8.3.1.1)، معاملات العزوم التقريبية (6.5.2)، DDM (8.10).</li>
      <li>الأسس: قص الثقب (22.6) والقص الأحادي (22.5) وحديد أدنى 0.0018 (7.6.1.1).</li></ul></div>
    <div class="card ref"><h3>الأحمال — الكود العراقي</h3><ul>
      <li>جدول الأحمال الحية حسب الإشغال (سكني 2.0 · مكاتب 2.5 · مدارس 3.0 · أدراج 4.0 kN/m²…).</li>
      <li>كثافات المواد المحلية (خرسانة مسلحة 24 · طابوق 18 · ثرمستون 8 kN/m³…).</li>
      <li>تراكيب الأحمال وفق ASCE 7 المعتمدة في ACI 318-19 الفصل 5.</li>
      <li>الزلازل: طريقة القوة الجانبية المكافئة — <code>V = Cs·W</code>، <code>Cs = SDS/(R/Ie)</code>
        مع الحدين الأعلى <code>SD1/(T·R/Ie)</code> والأدنى <code>0.044·SDS·Ie ≥ 0.01</code>،
        <code>Ta = Ct·hn^x</code>، والتوزيع <code>Fx = V·wx·hx^k/Σ</code>.</li>
      <li>الرياح: <code>qz = 0.613·Kz·Kzt·Kd·V²</code> مع G=0.85 و Cp=+0.8/−0.5.</li></ul>
      <div class="note">قيم Ss و S1 لكل محافظة مُدرجة كقيم استرشادية للاستئناس فقط؛ الاعتماد يكون على
      خرائط الكود العراقي للمقاومة الزلزالية المعتمدة رسمياً.</div></div>
    <div class="card ref"><h3>الفرضيات والحدود</h3><ul>
      <li>الوحدات: kN، متر، مليمتر، MPa. الخرسانة عادية الوزن (λ=1.0).</li>
      <li>التحليل مستوي ثنائي الأبعاد (2D Frame) — لا يشمل الالتواء ولا التحليل الديناميكي الطيفي.</li>
      <li>الأعمدة تُفحص للانحناء أحادي المحور؛ للانحناء ثنائي المحور استخدم طريقة Bresler يدوياً.</li>
      <li>النتائج أداة مساعدة للمهندس ولا تُغني عن تدقيق مهندس مُجاز ومصادقة الجهات الرسمية.</li></ul></div></div>`,
  init: () => {}
};

/* ------------------------------- الراوتر -------------------------------- */
function go(id) {
  const p = PAGES[id]; if (!p) return;
  location.hash = id;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  $('#ttl').textContent = p.ttl; $('#sub').textContent = p.sub;
  $('#view').innerHTML = p.html();
  $('#stat').textContent = 'جاهز';
  try { p.init && p.init(); } catch (e) { console.error(e); }
  window.scrollTo(0, 0);
}

/* ======================= حزمة ما تحت الصفر (المرحلة ١) ==================== */
let WZ = null, V3 = null;      // آخر نتيجة معالج + العارض

function pickPanel(u) {
  const p = document.getElementById('v3info');
  if (!p) return;
  if (!u || !u.title) { p.innerHTML = '<h4>اضغط على أي عنصر</h4><div style="color:var(--mut)">لعرض تفاصيله'
    + ' — الطبقات والأسس والركائز والأعمدة</div>'; return; }
  p.innerHTML = `<h4>${u.title}</h4><table><tbody>${(u.rows || []).map(r =>
    `<tr><td style="color:var(--mut)">${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table>`;
}
function mount3D() {
  const host = document.getElementById('v3d');
  if (!host || !WZ) return;
  V3 = Viewer3D(host, WZ, pickPanel);
  pickPanel(null);
  const sl = document.getElementById('v3clip');
  if (sl && V3) { sl.min = -V3.R * 1.2; sl.max = V3.R * 1.2; sl.value = V3.R * 1.2;
    sl.oninput = () => V3.clip(+sl.value); }
}
function sectionSVG2(ew) {
  const st = ew.stack.slice().sort((a, b) => a.bottom - b.bottom);
  const lo = Math.min(...st.map(s => s.bottom)), hi = Math.max(...st.map(s => s.top));
  const W = 900, H = Math.max(300, 46 * st.length), ml = 210, mr = 200, mt = 24;
  const Y = v => mt + (hi - v) / (hi - lo || 1) * (H - mt - 20);
  let g = '';
  st.forEach(s => {
    const y1 = Y(s.top), y2 = Y(s.bottom);
    g += `<rect x="${ml}" y="${y1}" width="${W - ml - mr}" height="${Math.max(2, y2 - y1)}"
      fill="${s.color}" stroke="#0b1220" stroke-width="1"/>
      <text x="${ml - 8}" y="${(y1 + y2) / 2 + 4}" fill="#e6edf7" font-size="11" text-anchor="end">${s.name}</text>
      <text x="${W - mr + 8}" y="${(y1 + y2) / 2 + 4}" fill="#93a4c0" font-size="10.5">${s.t.toFixed(2)} م${
        s.layers ? ' · ' + s.layers + ' طبقة' : ''} · ${s.volume.toFixed(1)} م³</text>`;
  });
  const mark = (v, t, c) => `<line x1="${ml - 60}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}"
    stroke-dasharray="5 3"/><text x="${ml - 64}" y="${Y(v) - 3}" fill="${c}" font-size="10.5" text-anchor="end">${t} (${v >= 0 ? '+' : ''}${v.toFixed(2)})</text>`;
  g += mark(ew.levels.bm, 'منسوب التشطيب BM', '#34d399');
  g += mark(ew.levels.ground, 'الأرض الطبيعية', '#fbbf24');
  if (Math.abs(ew.levels.existing - ew.levels.ground) > 0.01) g += mark(ew.levels.existing, 'قعر الهدم القديم', '#f87171');
  g += mark(ew.levels.found_bot, 'قاعدة الأساس', '#38bdf8');
  return `<svg viewBox="0 0 ${W} ${H}" class="sect">${g}</svg>`;
}

/* -------------------------------- المعالج -------------------------------- */
PAGES.wizard = {
  ic: '🪄', name: 'معالج المشروع', grp: 'المشروع',
  ttl: 'معالج المشروع — من مساحة القطعة إلى حزمة الأساسات',
  sub: 'اكتب المساحة وعدد الطوابق ونوع التربة — والباقي يُحسب تلقائياً',
  desc: 'كل شي تلقائي من رقم واحد',
  html: () => `<div class="steps"><div><b>١</b> القطعة والطوابق</div><div><b>٢</b> التربة والمناسيب</div>
    <div><b>٣</b> شبكة الأعمدة والأحمال</div><div><b>٤</b> الأساس والركائز</div>
    <div><b>٥</b> الحفر والردم والكميات</div></div>
  <div class="grid g2">
    <div class="card"><h3>١ · القطعة والبناء</h3><div class="f">
      ${F('مساحة القطعة', 'w_area', 200, 10, 'م²')}
      ${F('عدد الطوابق', 'w_floors', 2, 1)}
      ${F('نسبة البناء من القطعة', 'w_cov', 1.0, .05, '0.3 – 1.0')}
      ${F('ارتفاع الطابق', 'w_hs', 3.2, .1, 'م')}
      ${S('الاستعمال', 'w_use', META.live.map(x => x.name), 'سكني / غرف نوم')}
      ${F("f'c", 'w_fc', 25, 1, 'MPa')}${F('fy', 'w_fy', 420, 10, 'MPa')}
      ${S('المحافظة', 'w_city', META.cities.map(c => c.name), 'بغداد')}</div></div>
    <div class="card"><h3>٢ · التربة والمناسيب</h3><div class="f">
      ${S('نوع التربة', 'w_soil', (META.soils || []).map(s => [s.name, s.name + ' — ' + s.qa + ' kPa']), 'طين قاسي')}
      ${F('تحمّل التربة qa (0=حسب النوع)', 'w_qa', 0, 5, 'kPa')}
      ${F('منسوب الأرض الطبيعية', 'w_ground', -0.30, .05, 'م من البنج مارك')}
      ${F('عمق الهدم/الحفر القديم', 'w_old', 0, .1, 'م تحت الأرض')}
      ${F('عمق التأسيس Df', 'w_df', 1.50, .05, 'م')}</div>
      <div class="row"><button class="btn" onclick="PAGES.wizard.run()">🚀 صمّم المشروع</button>
        <button class="btn gh" onclick="window.print()">🖨️ تقرير PDF</button>
        <button class="btn gh" onclick="PAGES.wizard.dxf()">📐 تصدير DXF</button>
        <button class="btn gh" onclick="PAGES.wizard.save()">💾 حفظ المشروع</button></div>
      <div class="hint">البنج مارك 0.00 = منسوب أرضية الطابق الأرضي بعد التشطيب.</div></div></div>
  <div id="w_out" style="margin-top:16px"></div>`,
  payload: () => ({ area: val('w_area'), floors: val('w_floors'), coverage: val('w_cov'),
    story_h: val('w_hs'), use: txt('w_use'), fc: val('w_fc'), fy: val('w_fy'), city: txt('w_city'),
    soil: txt('w_soil'), qa: val('w_qa') || null, ground: val('w_ground'), old_depth: val('w_old'),
    Df: val('w_df') }),
  dxf: async () => {
    if (!WZ) return alert('شغّل المعالج أولاً');
    const r = await fetch('/api/dxf', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(WZ) });
    const b = await r.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'foundation.dxf'; a.click();
  },
  save: async () => {
    if (!WZ) return alert('شغّل المعالج أولاً');
    const name = prompt('اسم المشروع:', 'مشروع ' + WZ.input.area + 'م²');
    if (!name) return;
    await post('project/save', { name, input: WZ.input });
    alert('تم الحفظ ✓');
  },
  run: async () => {
    const r = await post('wizard', PAGES.wizard.payload());
    WZ = r;
    const a = r.advisor, d = r.design, ew = r.earth, g = r.grid;
    let des = '';
    if (d.mode === 'isolated') {
      const t = d.typical;
      des = `<div class="grid g4">${kpi('الأساس النموذجي', nf(t.B, 2) + '×' + nf(t.B, 2) + ' م')}
        ${kpi('السماكة', int(t.h) + ' مم')}${kpi('التسليح', t.bars_label)}
        ${kpi('قص الثقب', nf(t.punch_ratio, 2), t.punch_ratio <= 1 ? 'ok' : 'bad')}</div>
        <div style="margin-top:12px">${table(['الأساس', 'الموقع', 'حمل الخدمة (kN)', 'الأبعاد (م)', 'ضغط التربة (kPa)'],
          d.sizes.map((s, i) => ['F' + (i + 1), s.kind, nf(s.P, 0), nf(s.B, 2) + ' × ' + nf(s.B, 2),
            nf(s.P / (s.B * s.B), 1)]))}</div>`;
    } else if (d.mode === 'raft') {
      const t = d.raft;
      des = `<div class="grid g4">${kpi('أبعاد الحصيرة', nf(t.Lx, 1) + ' × ' + nf(t.Ly, 1) + ' م')}
        ${kpi('السماكة', int(t.h) + ' مم')}${kpi('ضغط التربة', nf(t.q_serv, 1) + ' / ' + nf(t.qa, 0) + ' kPa', t.ok_press ? 'ok' : 'bad')}
        ${kpi('قص الثقب', t.punch_ok ? 'مقبول ✓' : 'زد السماكة', t.punch_ok ? 'ok' : 'bad')}
        ${kpi('التسليح العلوي', t.top.label)}${kpi('التسليح السفلي', t.bottom.label)}
        ${kpi('الخرسانة', nf(t.conc, 1) + ' م³')}${kpi('الحديد التقريبي', nf(t.steel, 1) + ' طن')}</div>
        <div class="note">${t.note}</div>`;
    } else {
      const t = d.pile;
      des = `<div class="grid g4">${kpi('قطر الركيزة', int(t.D * 1000) + ' مم')}${kpi('طول الركيزة', nf(t.L, 0) + ' م')}
        ${kpi('قدرة الركيزة المفردة', nf(t.Qall, 0) + ' kN')}${kpi('عدد الركائز/عمود', t.n)}
        ${kpi('العدد الكلي', d.total_piles, 'ok')}${kpi('كفاءة المجموعة', nf(t.eff, 2))}
        ${kpi('هامة الركائز', nf(t.cap.B, 2) + '×' + nf(t.cap.L, 2) + '×' + nf(t.cap.h, 2) + ' م')}
        ${kpi('النوع الموصى به', (t.types.find(x => x.key === t.recommended) || {}).name || '—')}</div>
        <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>خطوات حساب القدرة الحاملة</h3>${table(['الخطوة', 'القيمة'], t.steps)}
          ${table(['البند', 'القيمة'], [['القدرة القصوى Qu', nf(t.Qu, 0) + ' kN'],
            ['وزن الركيزة', nf(t.W, 0) + ' kN'], ['معامل الأمان', nf(t.FS, 1)],
            ['القدرة المسموحة', nf(t.Qall, 0) + ' kN'], ['التباعد', nf(t.spacing, 2) + ' م (3D)'],
            ['قدرة المجموعة', nf(t.Qgroup, 0) + ' kN مقابل حمل ' + nf(t.P, 0) + ' kN']])}</div>
        <div class="card"><h3>أنواع الركائز ومتى تُستعمل</h3>${t.types.map(x => `<div style="margin-bottom:9px">
          <b style="color:${x.key === t.recommended ? 'var(--ok)' : '#fff'}">${x.name}${x.key === t.recommended ? ' ✓ موصى به' : ''}</b>
          <div style="font-size:11.5px;color:var(--mut)">قطر ${x.D} · ${x.when}<br>+ ${x.pros}<br>− ${x.cons}</div></div>`).join('')}</div></div>
        <div class="note">${t.notes.join(' · ')}</div>`;
    }
    $('#w_out').innerHTML = `
    <div class="grid g4">${kpi('مساحة البناء', nf(r.footprint, 0) + ' م²')}
      ${kpi('شبكة الأعمدة', g.nx + ' × ' + g.ny + ' بحر')}${kpi('عدد الأعمدة', g.cols, 'ok')}
      ${kpi('البحر', nf(g.sx, 2) + ' × ' + nf(g.sy, 2) + ' م')}
      ${kpi('مقطع العمود', r.col.b + '×' + r.col.h + ' مم')}${kpi('سماكة السقف المقترحة', int(r.floor.slab) + ' مم')}
      ${kpi('الحمل الكلي على التربة', int(r.total) + ' kN')}${kpi('أثقل عمود', int(r.Pmax) + ' kN')}</div>

    <div class="card" style="margin-top:16px"><h3>🧊 المجسم ثلاثي الأبعاد — طبقات الردم والأسس</h3>
      <div class="v3d"><div id="v3d" style="min-height:430px"></div>
        <div class="tools">
          <button onclick="V3&&V3.reset()">إعادة الزاوية</button>
          <button onclick="V3&&V3.top()">مسقط علوي</button>
          <button onclick="window.__x=!window.__x;V3&&V3.xray(window.__x)">🩻 وضع الأشعة</button>
        </div>
        <div class="info" id="v3info"></div>
        <div class="slider"><span style="font-size:11px;color:var(--mut)">قص المقطع</span>
          <input type="range" id="v3clip" min="-20" max="30" step="0.2"></div>
      </div>
      <div class="hint">اسحب للتدوير · عجلة الماوس للتكبير · اضغط على أي طبقة أو أساس أو ركيزة لعرض تفاصيلها ·
        استعمل شريط «قص المقطع» لرؤية ما تحت الأرض.</div></div>

    <div class="rec" style="margin-top:16px"><h3>🏗️ التوصية: ${a.name}</h3>
      <ul>${a.reasons.map(x => `<li>${x}</li>`).join('')}</ul>
      ${a.alts.length ? `<ul class="alt"><b style="color:var(--mut);font-size:12px">بدائل وملاحظات:</b>
        ${a.alts.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      <div style="margin-top:8px;font-size:12px;color:var(--mut)">تحمّل التربة الصافي ${nf(a.q_net, 0)} kPa ·
        مجموع مساحات الأسس ${nf(a.sum_area, 1)} م² (${nf(a.ratio * 100, 0)}% من مساحة البناء)</div></div>

    <div class="card" style="margin-top:16px"><h3>تصميم الأساس</h3>${des}</div>
    <div class="card" style="margin-top:16px"><h3>مقطع الطبقات والمناسيب</h3>${sectionSVG2(ew)}</div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>المناسيب وخطوات العمل</h3>${table(['البند', 'القيمة'], ew.steps)}
        <div class="note">${ew.notes[0]}</div></div>
      <div class="card"><h3>كميات الحفر والردم</h3>${table(['البند', 'الكمية'], [
        ['عمق الحفر', nf(ew.cut_depth, 2) + ' م'], ['حجم الحفر', nf(ew.cut_vol, 1) + ' م³'],
        ['الحفر بعد الانتفاش (نقل)', nf(ew.cut_loose, 1) + ' م³'],
        ['ردم هندسي تحت الأساس', nf(ew.fill_to_found, 2) + ' م'],
        ['جلمود/ردم مختار (مدكوك)', nf(ew.boulder, 1) + ' م³ — يُشترى ' + nf(ew.boulder_buy, 1) + ' م³'],
        ['عدد طبقات الجلمود', ew.boulder_layers + ' طبقة × 30 سم'],
        ['سبيس (مدكوك)', nf(ew.subbase, 1) + ' م³ — يُشترى ' + nf(ew.subbase_buy, 1) + ' م³'],
        ['عدد طبقات السبيس', ew.subbase_layers + ' طبقة × 25 سم'],
        ['خرسانة نظافة', nf(ew.blinding, 1) + ' م³'],
        ['سبيس ساحات القطعة', nf(ew.yard_subbase, 1) + ' م³']])}</div>
      <div class="card"><h3>الكلفة التقديرية</h3>${table(['البند', 'الكمية', 'الوحدة', 'السعر', 'الكلفة (د.ع)'],
        r.boq.rows.map(x => [x.name, nf(x.q, 1), x.unit, int(x.rate), int(x.cost)]))}
        <div class="grid g2" style="margin-top:10px">${kpi('الإجمالي', int(r.boq.total) + ' د.ع', 'ok')}
          ${kpi('قص القاعدة الزلزالي', nf(r.seismic.V, 0) + ' kN')}</div></div>
      <div class="card"><h3>أحمال الأعمدة</h3><div style="max-height:340px;overflow:auto">
        ${table(['#', 'الموقع', 'المساحة المؤثرة (م²)', 'حمل الخدمة (kN)', 'Pu (kN)'],
          r.loads.map((l, i) => [i + 1, l.kind, nf(l.area, 2), nf(l.P, 0), nf(l.Pu, 0)]))}</div></div>
      <div class="card"><h3>تركيب الطابق</h3>${table(['المكوّن', 'kN/m²'],
        r.floor.items.map(i => [i.name, nf(i.v)]).concat([['بدل وزن الجسور', nf(r.floor.beams)],
          ['<b>الحمل الميت D</b>', '<b>' + nf(r.floor.D) + '</b>'], ['الحمل الحي L', nf(r.floor.L)]]))}
        <div class="note">${r.summary.join(' · ')}</div></div></div>`;
    setTimeout(mount3D, 60);
  },
  init: () => PAGES.wizard.run()
};

/* -------------------------------- المساحة -------------------------------- */
function ptRow(n, e, nn) {
  return `<div class="sp" style="grid-template-columns:1fr 1fr 1fr auto">
    <input value="${n}" data-k="name" placeholder="اسم النقطة">
    <input type="number" step="0.001" value="${e}" data-k="E" placeholder="E شرقي">
    <input type="number" step="0.001" value="${nn}" data-k="N" placeholder="N شمالي">
    <button class="btn gh" onclick="this.parentNode.remove()">✕</button></div>`;
}
function polySVG(r) {
  const W = 620, H = 360, m = 46;
  const E = r.points.map(p => p.E), N = r.points.map(p => p.N);
  const x0 = Math.min(...E), x1 = Math.max(...E), y0 = Math.min(...N), y1 = Math.max(...N);
  const s = Math.min((W - 2 * m) / ((x1 - x0) || 1), (H - 2 * m) / ((y1 - y0) || 1));
  const X = v => m + (v - x0) * s, Y = v => H - m - (v - y0) * s;
  const pts = r.points.map(p => `${X(p.E)},${Y(p.N)}`).join(' ');
  let g = `<polygon points="${pts}" fill="#38bdf822" stroke="#38bdf8" stroke-width="2"/>`;
  r.points.forEach(p => { g += `<circle cx="${X(p.E)}" cy="${Y(p.N)}" r="4" fill="#fbbf24"/>
    <text x="${X(p.E) + 7}" y="${Y(p.N) - 6}" fill="#e6edf7" font-size="11">${p.name}</text>`; });
  r.sides.forEach(s2 => {
    const a = r.points.find(p => p.name === s2.frm), b = r.points.find(p => p.name === s2.to);
    g += `<text x="${(X(a.E) + X(b.E)) / 2}" y="${(Y(a.N) + Y(b.N)) / 2 - 5}" fill="#93a4c0"
      font-size="10.5" text-anchor="middle">${nf(s2.L, 2)} م</text>`;
  });
  g += `<circle cx="${X(r.centroid.E)}" cy="${Y(r.centroid.N)}" r="3" fill="#34d399"/>`;
  return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
PAGES.survey = {
  ic: '📐', name: 'المساحة', grp: 'ما تحت الصفر', ttl: 'أعمال المساحة',
  sub: 'مساحة ومحيط من الإحداثيات · دفتر المناسيب · حساب القطع والردم',
  desc: 'إحداثيات ومناسيب وقطع وردم',
  html: () => `<div class="grid g2">
    <div class="card"><h3>حدود القطعة بالإحداثيات</h3>
      <div class="hint" style="margin-bottom:6px">أدخل النقاط بالتسلسل حول المضلع (اسم · E · N)</div>
      <div id="sv_pts">${ptRow('A', 0, 0) + ptRow('B', 20, 0) + ptRow('C', 20, 10) + ptRow('D', 0, 10)}</div>
      <div class="row"><button class="btn gh" onclick="$('#sv_pts').insertAdjacentHTML('beforeend', ptRow('P',0,0))">+ نقطة</button>
        <button class="btn" onclick="PAGES.survey.run()">احسب المساحة</button>
        <button class="btn gh" onclick="PAGES.survey.toWizard()">↗ استعمل المساحة بالمعالج</button></div>
      <div id="sv_out" style="margin-top:12px"></div></div>
    <div class="card"><h3>دفتر المناسيب (ارتفاع الجهاز HI)</h3><div class="f">
      ${F('منسوب البنج مارك BM', 'lv_bm', 10.000, .001, 'م')}</div>
      <div class="hint" style="margin:8px 0 6px">النقطة · خلفية BS · وسطية IS · أمامية FS (اترك الفارغ صفراً)</div>
      <div id="lv_rows">${['BM,1.500,,', 'A,,1.200,', 'B,2.100,,0.800', 'C,,,1.900'].map(r => {
        const [n, bs, is_, fs] = r.split(',');
        return `<div class="sp" style="grid-template-columns:1fr 1fr 1fr 1fr auto">
          <input value="${n}" data-k="point"><input type="number" step="0.001" value="${bs}" data-k="bs" placeholder="BS">
          <input type="number" step="0.001" value="${is_}" data-k="is" placeholder="IS">
          <input type="number" step="0.001" value="${fs}" data-k="fs" placeholder="FS">
          <button class="btn gh" onclick="this.parentNode.remove()">✕</button></div>`; }).join('')}</div>
      <div class="row"><button class="btn gh" onclick="$('#lv_rows').insertAdjacentHTML('beforeend',
        $('#lv_rows').lastElementChild.outerHTML.replace(/value=\\"[^\\"]*\\"/g,'value=\\"\\"'))">+ رصدة</button>
        <button class="btn" onclick="PAGES.survey.levels()">احسب المناسيب</button></div>
      <div id="lv_out" style="margin-top:12px"></div></div>
    <div class="card"><h3>القطع والردم — طريقة الشبكة</h3><div class="f">
      ${F('ضلع الخلية', 'cf_cell', 5, .5, 'م')}${F('المنسوب التصميمي', 'cf_des', 0.5, .05, 'م')}</div>
      <label style="margin-top:8px">مناسيب الأرض (كل سطر = صف، الأرقام مفصولة بفراغ)</label>
      <textarea id="cf_grid" rows="5" style="width:100%;background:var(--bg2);border:1px solid var(--line);
        color:var(--tx);border-radius:8px;padding:8px;font:inherit">0.00 0.20 0.40 0.35
0.10 0.30 0.50 0.45
0.20 0.40 0.60 0.55</textarea>
      <div class="row"><button class="btn" onclick="PAGES.survey.cf()">احسب القطع والردم</button></div>
      <div id="cf_out" style="margin-top:12px"></div></div></div>`,
  pts: () => $$('#sv_pts .sp').map(r => { const o = {}; $$('input', r).forEach(i => o[i.dataset.k] =
    i.dataset.k === 'name' ? i.value : parseFloat(i.value) || 0); return o; }),
  run: async () => {
    const r = await post('survey', { points: PAGES.survey.pts() });
    window.__area = r.area;
    $('#sv_out').innerHTML = `<div class="grid g3">${kpi('المساحة', nf(r.area, 2) + ' م²', 'ok')}
      ${kpi('بالدونم', nf(r.area_donum, 3) + ' دونم')}${kpi('المحيط', nf(r.perimeter, 2) + ' م')}</div>
      <div style="margin-top:10px">${polySVG(r)}</div>
      <div style="margin-top:10px">${table(['الضلع', 'الطول (م)', 'الاتجاه', 'ΔE', 'ΔN'],
        r.sides.map(s => [s.frm + ' → ' + s.to, nf(s.L, 3), s.quad, nf(s.dE, 3), nf(s.dN, 3)]))}</div>
      <div style="margin-top:10px">${table(['الزاوية عند', 'القيمة'], r.angles.map(a => [a.at, a.dms]))}</div>
      <div class="note">مجموع الزوايا الداخلية ${nf(r.sum_internal, 4)}° والنظري ${nf(r.theoretical, 0)}°
        — الفرق ${nf(r.ang_error, 4)}° · ${r.note}</div>`;
  },
  toWizard: () => { if (!window.__area) return alert('احسب المساحة أولاً');
    go('wizard'); setTimeout(() => { $('#w_area').value = Math.round(window.__area); PAGES.wizard.run(); }, 200); },
  levels: async () => {
    const obs = $$('#lv_rows .sp').map(r => { const o = {}; $$('input', r).forEach(i =>
      o[i.dataset.k] = i.dataset.k === 'point' ? i.value : (i.value === '' ? null : parseFloat(i.value))); return o; });
    const r = await post('levels', { bm: val('lv_bm'), obs });
    $('#lv_out').innerHTML = table(['النقطة', 'BS', 'IS', 'FS', 'HI', 'المنسوب RL'],
      r.rows.map(x => [x.point, x.bs ?? '—', x.is_ ?? '—', x.fs ?? '—',
        x.hi ? nf(x.hi, 3) : '—', nf(x.rl, 3)])) +
      `<div class="note">ΣBS − ΣFS = ${nf(r.check_a, 3)} · آخر − أول = ${nf(r.check_b, 3)} ·
        ${r.ok ? '<b style="color:var(--ok)">التدقيق صحيح ✓</b>' : '<b style="color:var(--bad)">خطأ حسابي ✗</b>'}</div>`;
  },
  cf: async () => {
    const grid = $('#cf_grid').value.trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
    const r = await post('cutfill', { grid, cell: val('cf_cell'), design: val('cf_des') });
    $('#cf_out').innerHTML = `<div class="grid g3">${kpi('قطع (حفر)', nf(r.cut, 1) + ' م³')}
      ${kpi('ردم', nf(r.fill, 1) + ' م³')}${kpi('الصافي', nf(Math.abs(r.net), 1) + ' م³', r.net > 0 ? 'warn' : 'ok')}</div>
      <div class="note">${r.balance} · المساحة ${nf(r.area, 0)} م² · ${r.note}</div>`;
  },
  init: () => { PAGES.survey.run(); PAGES.survey.levels(); PAGES.survey.cf(); }
};

/* ---------------------------- الحفريات والردم ---------------------------- */
PAGES.earth = {
  ic: '⛏️', name: 'الحفر والردم', grp: 'ما تحت الصفر', ttl: 'الحفريات والردم والمناسيب',
  sub: 'الجلمود والسبيس وعدد الطبقات والكميات — قياساً على البنج مارك 0.00',
  desc: 'مناسيب وطبقات وكميات',
  html: () => `<div class="grid g2"><div class="card"><h3>المناسيب</h3><div class="f">
      ${F('مساحة القطعة', 'e_plot', 250, 10, 'م²')}${F('مساحة البناء', 'e_fp', 200, 10, 'م²')}
      ${F('منسوب الأرض الطبيعية', 'e_ground', -0.30, .05, 'م')}
      ${F('عمق الهدم/الحفر القديم', 'e_old', 1.6, .1, 'م تحت الأرض')}
      ${F('عمق التأسيس Df', 'e_df', 1.50, .05, 'م')}${F('سماكة الأساس', 'e_fh', 0.50, .05, 'م')}
      ${F('مجموع مساحات الأسس', 'e_fa', 70, 5, 'م²')}
      ${F('سماكة السبيس تحت الأرضية', 'e_sub', 0.25, .05, 'م')}</div>
      <div class="row"><button class="btn" onclick="PAGES.earth.run()">احسب</button>
        <button class="btn gh" onclick="window.print()">🖨️ طباعة</button></div></div>
    <div class="card"><h3>مقطع الطبقات</h3><div id="e_sec"></div></div></div>
    <div id="e_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('earthwork', { plot: val('e_plot'), footprint: val('e_fp'), ground: val('e_ground'),
      old_depth: val('e_old'), Df: val('e_df'), foot_h: val('e_fh'), foot_area: val('e_fa'),
      subbase: val('e_sub'), dig_mode: 'trench' });
    $('#e_sec').innerHTML = sectionSVG2(r);
    $('#e_out').innerHTML = `<div class="grid g4">
      ${kpi('عمق الحفر', nf(r.cut_depth, 2) + ' م')}${kpi('حجم الحفر', nf(r.cut_vol, 1) + ' م³')}
      ${kpi('ردم تحت الأساس', nf(r.fill_to_found, 2) + ' م', r.fill_to_found > 0 ? 'warn' : 'ok')}
      ${kpi('الأساس يأخذ', nf(val('e_fh') + 0.1, 2) + ' م')}
      ${kpi('جلمود (شراء)', nf(r.boulder_buy, 1) + ' م³')}${kpi('طبقات الجلمود', r.boulder_layers + ' × 30 سم')}
      ${kpi('سبيس (شراء)', nf(r.subbase_buy, 1) + ' م³')}${kpi('طبقات السبيس', r.subbase_layers + ' × 25 سم')}</div>
      <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>خطوات العمل والمناسيب</h3>${table(['البند', 'القيمة'], r.steps)}</div>
      <div class="card"><h3>جدول الطبقات</h3>${table(['الطبقة', 'من', 'إلى', 'السماكة', 'الطبقات', 'الحجم (م³)'],
        r.stack.slice().sort((a, b) => a.bottom - b.bottom).map(s => [s.name, nf(s.bottom, 2), nf(s.top, 2),
          nf(s.t, 2), s.layers || '—', nf(s.volume, 1)]))}</div>
      <div class="card"><h3>ملاحظات التنفيذ</h3><ul style="padding-right:18px;font-size:12.5px;color:var(--mut)">
        ${r.notes.map(n => `<li style="margin:6px 0">${n}</li>`).join('')}</ul></div></div>`;
  },
  init: () => PAGES.earth.run()
};

/* --------------------------- التربة والركائز ----------------------------- */
PAGES.soil = {
  ic: '🪨', name: 'التربة والركائز', grp: 'ما تحت الصفر', ttl: 'تحمّل التربة والركائز',
  sub: 'قدرة التحمّل بمعادلة Terzaghi/Vesic · قدرة الركيزة بطريقة α و Meyerhof',
  desc: 'تحمّل التربة وحساب الخوازيق',
  html: () => `<div class="grid g2">
    <div class="card"><h3>قدرة تحمّل التربة</h3><div class="f">
      ${F('التماسك c (cu)', 'bc_c', 100, 5, 'kPa')}${F('زاوية الاحتكاك φ', 'bc_phi', 0, 1, 'درجة')}
      ${F('كثافة التربة γ', 'bc_g', 18, .5, 'kN/m³')}${F('عرض الأساس B', 'bc_b', 2.0, .1, 'م')}
      ${F('طول الأساس L', 'bc_l', 2.0, .1, 'م')}${F('عمق التأسيس Df', 'bc_df', 1.5, .1, 'م')}
      ${F('معامل الأمان', 'bc_fs', 3, .5)}</div>
      <div class="row"><button class="btn" onclick="PAGES.soil.bc()">احسب</button></div>
      <div id="bc_out" style="margin-top:12px"></div></div>
    <div class="card"><h3>تصميم الركائز (الخوازيق)</h3><div class="f">
      ${S('نوع التربة', 'pl_soil', [['clay', 'طينية (طريقة α)'], ['sand', 'رملية (Meyerhof-SPT)']], 'clay')}
      ${F('cu للطين', 'pl_cu', 60, 5, 'kPa')}${F('N للرمل (SPT)', 'pl_n', 20, 1)}
      ${F('قطر الركيزة D', 'pl_d', 0.6, .1, 'م')}${F('طول الركيزة L', 'pl_l', 15, 1, 'م')}
      ${F('حمل العمود', 'pl_p', 1200, 50, 'kN')}${F('معامل الأمان', 'pl_fs', 2.5, .1)}
      ${S('نوع التنفيذ', 'pl_kind', [['bored', 'مصبوبة بالموقع'], ['driven', 'مدقوقة']], 'bored')}</div>
      <div class="row"><button class="btn" onclick="PAGES.soil.pile()">احسب الركائز</button></div></div></div>
    <div id="pl_out" style="margin-top:16px"></div>
    <div class="card" style="margin-top:16px"><h3>جدول تحمّل التربة الاسترشادي</h3>
      ${table(['نوع التربة', 'qa (kPa)', 'التصنيف'], (META.soils || []).map(s => [s.name, nf(s.qa, 0),
        ({ clay: 'طينية', sand: 'رملية', rock: 'صخرية', fill: 'ردم' })[s.kind] || s.kind]))}
      <div class="note">قيم استرشادية للاستئناس فقط — الاعتماد على التقرير الجيوتقني وفحص التربة للموقع.</div></div>`,
  bc: async () => {
    const r = await post('bearing', { c: val('bc_c'), phi: val('bc_phi'), gamma: val('bc_g'),
      B: val('bc_b'), L: val('bc_l'), Df: val('bc_df'), FS: val('bc_fs') });
    $('#bc_out').innerHTML = `<div class="grid g3">${kpi('qu النهائية', nf(r.qu, 0) + ' kPa')}
      ${kpi('qa الصافية', nf(r.qa_net, 0) + ' kPa', 'ok')}${kpi('qa الإجمالية', nf(r.qa_gross, 0) + ' kPa')}</div>
      <div style="margin-top:10px">${table(['المعامل', 'القيمة'], [['Nc', nf(r.Nc, 2)], ['Nq', nf(r.Nq, 2)],
        ['Nγ', nf(r.Ng, 2)], ['sc · sq · sγ', nf(r.sc, 2) + ' · ' + nf(r.sq, 2) + ' · ' + nf(r.sg, 2)],
        ['ضغط التربة فوق منسوب التأسيس', nf(r.q_overburden, 1) + ' kPa']])}</div>
      <div class="note">${r.note}</div>`;
  },
  pile: async () => {
    const r = await post('pile', { soil: txt('pl_soil'), cu: val('pl_cu'), N: val('pl_n'), D: val('pl_d'),
      L: val('pl_l'), P: val('pl_p'), FS: val('pl_fs'), kind: txt('pl_kind') });
    $('#pl_out').innerHTML = `<div class="grid g4">
      ${kpi('Qs مقاومة الجانب', nf(r.Qs, 0) + ' kN')}${kpi('Qb مقاومة القاعدة', nf(r.Qb, 0) + ' kN')}
      ${kpi('Qu القصوى', nf(r.Qu, 0) + ' kN')}${kpi('Qall المسموحة', nf(r.Qall, 0) + ' kN', 'ok')}
      ${kpi('عدد الركائز', r.n, 'ok')}${kpi('كفاءة المجموعة', nf(r.eff, 2))}
      ${kpi('قدرة المجموعة', nf(r.Qgroup, 0) + ' kN', r.ok ? 'ok' : 'bad')}
      ${kpi('التباعد', nf(r.spacing, 2) + ' م')}</div>
      <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>خطوات الحساب</h3>${table(['الخطوة', 'القيمة'], r.steps)}
        ${table(['البند', 'القيمة'], [['هامة الركائز', nf(r.cap.B, 2) + ' × ' + nf(r.cap.L, 2) + ' × ' + nf(r.cap.h, 2) + ' م'],
          ['خرسانة الهامة', nf(r.cap.conc, 1) + ' م³'],
          ['خرسانة الركائز', nf(r.n * Math.PI * r.D * r.D / 4 * r.L, 1) + ' م³']])}</div>
      <div class="card"><h3>أنواع الركائز</h3>${r.types.map(x => `<div style="margin-bottom:10px">
        <b>${x.name}</b><div style="font-size:11.5px;color:var(--mut)">قطر ${x.D} · ${x.when}<br>
        <span style="color:var(--ok)">+</span> ${x.pros}<br><span style="color:var(--bad)">−</span> ${x.cons}</div></div>`).join('')}</div></div>
      <div class="note">${r.notes.join('<br>')}</div>`;
  },
  init: () => { PAGES.soil.bc(); PAGES.soil.pile(); }
};

/* ------------------------------- المشاريع -------------------------------- */
PAGES.projects = {
  ic: '💾', name: 'المشاريع', grp: 'المشروع', ttl: 'المشاريع المحفوظة',
  sub: 'استرجاع مشروع محفوظ وإعادة تشغيل المعالج عليه',
  desc: 'حفظ واسترجاع',
  html: () => `<div class="card"><h3>القائمة</h3><div id="pr_out">…</div></div>`,
  run: async () => {
    const r = await post('project/list', {});
    $('#pr_out').innerHTML = r.projects.length ? table(['المشروع', 'التاريخ', 'المساحة', 'الطوابق', 'التربة', ''],
      r.projects.map(p => [p.name, p.saved, nf(p.input.area, 0) + ' م²', p.input.floors, p.input.soil,
        `<button class="btn" onclick="PAGES.projects.open('${p.file}')">فتح</button>
         <button class="btn gh" onclick="PAGES.projects.del('${p.file}')">حذف</button>`]))
      : '<div class="hint">لا توجد مشاريع محفوظة — احفظ من صفحة المعالج.</div>';
  },
  open: async (file) => {
    const d = await post('project/load', { file });
    go('wizard');
    setTimeout(() => {
      const i = d.input;
      const set = (id, v) => { const e = $('#' + id); if (e && v !== undefined && v !== null) e.value = v; };
      set('w_area', i.area); set('w_floors', i.floors); set('w_cov', i.coverage); set('w_hs', i.story_h);
      set('w_use', i.use); set('w_fc', i.fc); set('w_fy', i.fy); set('w_city', i.city);
      set('w_soil', i.soil); set('w_qa', i.qa); set('w_ground', i.ground); set('w_old', i.old_depth);
      set('w_df', i.Df);
      PAGES.wizard.run();
    }, 200);
  },
  del: async (file) => { if (!confirm('حذف المشروع؟')) return; await post('project/delete', { file }); PAGES.projects.run(); },
  init: () => PAGES.projects.run()
};

/* ------------------------- الترتيب والمجموعات ---------------------------- */
const ORDER = [
  ['المشروع', ['wizard', 'projects']],
  ['ما تحت الصفر', ['survey', 'earth', 'soil']],
  ['أدوات المهندس (متقدم)', ['loads', 'seismic', 'wind', 'beam', 'column', 'footing', 'slab', 'xray', 'boq']],
  ['مرجع', ['ref', 'home']],
];
PAGES.home.name = 'عن المنصة';
PAGES.home.ttl = 'عن المنصة';

(async function boot() {
  try { META = await (await fetch('/api/meta')).json(); } catch (e) { console.error(e); }
  $('#nav').innerHTML = ORDER.map(([g, ids]) => `<div class="grp">${g}</div>` + ids.filter(k => PAGES[k])
    .map(k => `<button data-id="${k}" onclick="go('${k}')" title="${PAGES[k].desc || ''}">
      <span class="ic">${PAGES[k].ic}</span>${PAGES[k].name}</button>`).join('')).join('');
  const want = (location.hash || '#wizard').slice(1);
  go(want in PAGES ? want : 'wizard');
})();
