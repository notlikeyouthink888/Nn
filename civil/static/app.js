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
/* ------------------------------- الكميات -------------------------------- */
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
  if (u && u.gk) labSelect(u);              // الضغط على عمود/جسر يختاره للتجربة
  if (!p) return;
  if (!u || !u.title) { p.innerHTML = '<h4>اضغط على أي عنصر</h4><div style="color:var(--mut)">لعرض تفاصيله'
    + ' — الطبقات والأسس والركائز والأعمدة</div>'; return; }
  p.innerHTML = `<h4>${u.title}</h4><table><tbody>${(u.rows || []).map(r =>
    `<tr><td style="color:var(--mut)">${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table>`;
}
let REBAR_ON = false, XRAY_ON = false, MOM_ON = false, PUN_ON = false, DEF_ON = false;
function mount3D(data, hostId) {
  const host = document.getElementById(hostId || 'v3d');
  const D = data || WZ;
  if (!host || !D) return;
  REBAR_ON = XRAY_ON = MOM_ON = PUN_ON = DEF_ON = HUM_ON = false;
  V3 = Viewer3D(host, D, pickPanel);
  pickPanel(null);
  const sl = document.getElementById('v3clip');
  if (sl && V3) { sl.min = -V3.R * 1.5; sl.max = V3.R * 1.5; sl.value = V3.R * 1.5;
    sl.oninput = () => V3.clip(+sl.value); }
  $$('#v3groups input').forEach(c => { if (V3) V3.group(c.dataset.g, c.checked); });
}
/* ------- شريط أدوات المجسم: تعريف واحد يُستعمل بكل المساحات ------- */
function v3bar(o) {
  o = o || {};
  const fl = o.floors || 1;
  return `<div class="v3bar">
    <button onclick="V3&&V3.reset()">↻ إعادة الزاوية</button>
    <button onclick="V3&&V3.top()">⬓ مسقط علوي</button>
    <button onclick="V3&&V3.soffit()">⬒ بطن السقف</button>
    ${o.rebar === false ? '' : '<button id="btnRebar" onclick="toggleRebar()">🧵 إظهار التسليح</button>'}
    <button id="btnXray" onclick="toggleXray()">🩻 وضع الأشعة</button>
    ${o.analysis ? `<button id="btnMom" onclick="toggleMoments()">📈 العزوم</button>
      <button id="btnPun" onclick="togglePunch()">🎯 قص الثقب</button>
      <button id="btnDef" onclick="toggleDefl()">〰️ الهطول</button>` : ''}
    <button id="btnHum" onclick="toggleHuman()">🧍 إنسان 1.85 م</button>
    <button onclick="V3&&V3.zoomSel()">🔍 تقريب المحدد</button>
    <select id="v3floor" onchange="V3&&V3.floor(this.value==='all'?'all':+this.value)"
      style="width:auto;padding:5px 9px;font-size:11.5px">
      <option value="all">كل الطوابق</option>
      ${Array.from({ length: fl }, (_, i) => `<option value="${i + 1}">طابق ${i + 1}</option>`).join('')}
    </select></div>`;
}
const v3chips = list => list.map(([k, t, on]) =>
  `<label><input type="checkbox" data-g="${k}" ${on ? 'checked' : ''}
    onchange="V3&&V3.group('${k}',this.checked);refreshStats()"> ${t}</label>`).join('');
const v3legend = () => `<div class="legend"><span><i style="background:#e8443a"></i>أسياخ التسليح</span>
  <span><i style="background:#ff9f1c"></i>أتاري وأساور</span>
  <span><i style="background:#22d3ee"></i>تسليح إضافي</span>
  <span><i style="background:#86efac"></i>كراسي</span>
  <span><i style="background:#c084fc"></i>دولات</span>
  <span><i style="background:#d9c08a"></i>بلوك الهوردي</span>
  <span><i style="background:#a8bcd4"></i>سقوف</span><span><i style="background:#7f97b8"></i>جسور</span>
  <span><i style="background:#8ea6c4"></i>أعمدة</span><span><i style="background:#3f6fa5"></i>أساس</span></div>`;

function tgl(id, st) { const b = $('#' + id); if (b) b.classList.toggle('hot', st); }
let HUM_ON = false;
function toggleHuman() { if (!V3 || !V3.human) return; HUM_ON = !HUM_ON; V3.human(HUM_ON); tgl('btnHum', HUM_ON); }
function toggleMoments() { if (!V3) return; MOM_ON = !MOM_ON; V3.moments(MOM_ON); tgl('btnMom', MOM_ON);
  if (MOM_ON && !XRAY_ON) toggleXray(); }
function togglePunch() { if (!V3) return; PUN_ON = !PUN_ON; V3.punch(PUN_ON); tgl('btnPun', PUN_ON); }
function toggleDefl() { if (!V3) return; DEF_ON = !DEF_ON; V3.defl(DEF_ON); tgl('btnDef', DEF_ON); }
function toggleRebar() {
  if (!V3) return;
  REBAR_ON = !REBAR_ON;
  const t0 = performance.now();
  const st = V3.rebar(REBAR_ON);
  const b = $('#btnRebar');
  b.classList.toggle('hot', REBAR_ON);
  b.textContent = REBAR_ON ? '🧵 إخفاء التسليح' : '🧵 إظهار التسليح';
  if (REBAR_ON && !XRAY_ON) toggleXray();
  if (REBAR_ON) $('#v3stats').innerHTML =
    `${int(st.bars)} سيخ معروض · ${nf(st.weight / 1000, 1)} طن حديد · ${nf(performance.now() - t0, 0)} مللي ثانية`;
  else $('#v3stats').textContent = '';
}
function refreshStats() {
  if (!V3 || !REBAR_ON) return;
  const st = V3.stats();
  $('#v3stats').innerHTML = `${int(st.bars)} سيخ معروض · ${nf(st.weight / 1000, 1)} طن حديد`;
}
function toggleXray() {
  if (!V3) return;
  XRAY_ON = !XRAY_ON; V3.xray(XRAY_ON);
  $('#btnXray').classList.toggle('hot', XRAY_ON);
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

/* ---------- لوحة «التسليح والتفاصيل» داخل مساحة العمل ---------- */
function detailPanel(r) {
  return `
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>قص الثقب (Punching Shear) عند الأعمدة</h3>
        ${table(['العمود', 'الموقع', 'b0 (مم)', 'd (مم)', 'Vu (kN)', 'φVc (kN)', 'النسبة', 'الحالة'],
          r.punching.slice(0, 12).map((q, i) => ['C' + (i + 1), q.kind, int(q.found.b0), int(q.found.d),
            nf(q.found.Vu, 0), nf(q.found.phiVc, 0),
            `<b style="color:${rcol(q.found.ratio)}">${nf(q.found.ratio, 2)}</b>`,
            q.found.ok ? '<span class="tag t-ok">مقبول</span>' : '<span class="tag t-bad">راجع</span>']))}
        <div class="note">الفحص عند ${r.punching[0].found.where} وفق ACI 22.6 — المقطع الحرج على d/2 من وجه العمود.
          ${r.punching.every(q => q.found.ok) ? 'كل الأعمدة مقبولة.' : r.punching.find(q => !q.found.ok).found.rec}
          <br>عند السقف: النظام جسور-بلاطة فالحمل ينتقل عبر الجسور، والقيمة المعروضة للاستئناس فقط.</div></div>
      <div class="card"><h3>الكراسي والوصلات والبسكويت</h3>
        ${table(['البند', 'التفصيل'], [
          ['كراسي السقف', r.chairs.slab.label + ' — عدد ' + int(r.chairs.slab.n * r.model.floors)],
          ['وزن كراسي السقوف', nf(r.chairs.slab.weight * r.model.floors, 2) + ' طن'],
          ['كراسي الأساس', r.chairs.found.label + ' — عدد ' + int(r.chairs.found.n)],
          ['بسكويت الغطاء السفلي', int(r.chairs.slab.spacers * r.model.floors) + ' قطعة'],
          ['طول السيخ بالسوق', nf(r.model.stock, 0) + ' م — كل ما زاد يُقطّع ويُوصل']].concat(
          Object.entries(r.laps).map(([db, v]) => ['وصلة Ø' + db,
            '<b>' + nf(v.bottom, 2) + ' م</b> — كودية ' + nf(v.code, 2) + ' م · 60·db = ' + nf(v.site, 2) + ' م'])))}
        <div class="note">القاعدة المعتمدة: <b>${r.detail.lap.label}</b> ·
          الكودية = صنف B (1.3·ld) وفق ACI 25.5.2.1 · وصلات الأعمدة فوق كل سقف ومتبادلة 50%.</div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>📏 الغطاء الخرساني (Concrete Cover)</h3>
        ${table(['العنصر', 'الغطاء (مم)'], [
          ['السقف — الوجهان', int(r.detail.covers.slab)],
          ['الجسور (للأساور)', int(r.detail.covers.beam)],
          ['الأعمدة (للأتاري)', int(r.detail.covers.column)],
          ['الأساس — الوجه السفلي على التربة', int(r.detail.covers.footing_bottom)],
          ['الأساس — الوجه العلوي', int(r.detail.covers.footing_top)]])}
        ${table(['جدول ACI 318-19 (20.5.1.3)', 'مم', 'المرجع'],
          r.detail.covers.table.map(c => [c.name, int(c.v), c.ref]))}
        <div class="note">القاعدة العملية بالموقع: البوتوم 5–7.5 سم (على التربة) والتوب 3–5 سم —
          وهي مطابقة لجدول الكود أعلاه.</div></div>

      <div class="card"><h3>✂️ نقاط قطع وثني الحديد بالجسور</h3>
        ${['x', 'y'].map(d => { const t = r.detail.curtail[d]; return `
        <h4 style="margin:10px 0 4px">جسور الاتجاه ${d.toUpperCase()} — البحر ${nf(t.span, 2)} م
          (Ln = ${nf(t.ln, 2)} م)</h4>
        ${table(['البند', 'القيمة'], [
          ['علوي — الطبقة الأولى', 'L/3 = ' + nf(t.top1, 2) + ' م لكل جهة · طول السيخ ' + nf(t.top1_len, 2) + ' م'],
          ['علوي — الطبقة الثانية', 'L/5 = ' + nf(t.top2, 2) + ' م · طول السيخ ' + nf(t.top2_len, 2) + ' م'],
          ['نقطة الثني', 'L/7 = ' + nf(t.bend_at, 2) + ' م من وجه المسند'],
          ['الأسياخ المثنية', t.bent ? t.n_bent + ' سيخ بزاوية 45° — ' + t.bar.label : 'بدون ثني'],
          ['عكفة الأساور', t.hook_stirrup.label + ' (نصف قطر ثنية ' + int(t.hook_stirrup.bend_r) + ' مم)'],
          ['الوصلات', 'سفلي ' + nf(t.lap_bottom, 2) + ' م · علوي ' + nf(t.lap_top, 2) + ' م'],
          ['الغطاء', int(t.cover) + ' مم']])}`; }).join('')}
        <div class="note">${r.detail.curtail.x.rows.map(x => x[0] + ': ' + x[1]).join(' · ')}</div></div>

      <div class="card"><h3>🧱 ترتيب نشر حديد السقف (فرش ثم غطاء)</h3>
        ${table(['الطبقة', 'التسليح', 'العمق الفعّال d', 'العدد', 'طول السيخ', 'التقطيع'],
          r.model.slab.layout.map(l => [l.name, 'Ø' + l.db + ' @ ' + int(l.s) + ' مم',
            l.d ? int(l.d) + ' مم' : '—', '<b>' + int(l.n) + '</b> سيخ', nf(l.length, 2) + ' م',
            l.pieces > 1 ? l.pieces + ' قطعة' : 'قطعة واحدة']))}
        <div class="note">العدد = ⌈العرض ÷ التباعد⌉ + 1 — نفس طريقة التنفيذ بالموقع.
          الفرش هو الاتجاه القصير ويوضع أولاً (أكبر عمق فعّال)، والغطاء فوقه بالاتجاه الطويل.
          <br>التسليح العلوي فوق الأعمدة والمساند فقط ويمتد L/4 لكل جهة —
          طول السيخ ${nf(r.model.slab.top_len.x, 2)} م بالاتجاه X و ${nf(r.model.slab.top_len.y, 2)} م بالاتجاه Y.</div></div>

      <div class="card"><h3>🔩 الدولات (Dowel Bars) — ربط العمود بالأساس</h3>
        ${table(['البند', 'القيمة'], r.detail.dowels.rows.map(x => [x[0], x[1]]))}
        ${r.detail.dowels.warn ? `<div class="note" style="border-color:#f87171;color:#fca5a5">
          ⚠️ ${r.detail.dowels.warn} — قاعدة 16·db أقصر من الحد الكودي؛ إما تزاد لـ
          ${int(r.detail.dowels.ldc)} مم أو تُستعمل عكفة 90° بقاع الأساس.</div>`
          : '<div class="note">الدفن مطابق للحد الكودي ✓</div>'}</div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>🏛️ تصنيف الأعمدة واستمراريتها</h3>
        <div style="max-height:320px;overflow:auto">${table(
          ['العمود', 'المحور', 'الموقع', 'استمرارية X', 'استمرارية Y', 'Pu (kN)'],
          r.detail.cols.map((c, i) => ['C' + (i + 1), '(' + c.i + ', ' + c.j + ')',
            `<span class="tag ${c.kind === 'داخلي' ? 't-ok' : 't-warn'}">${c.kind}</span>`,
            c.cont_x ? 'مستمر' : 'طرفي', c.cont_y ? 'مستمر' : 'طرفي', int(c.Pu)]))}</div>
        <div class="note">العمود الركني والجار (الحافة) يتلقّى عزماً غير متوازن من جهة واحدة، فيحتاج
          تسليحاً علوياً أطول بالجسر الطرفي وتطويقاً أشد — بينما العمود الداخلي عزومه متوازنة.
          <br>نقاط قطع الحديد L/3 و L/5 والثني L/7 مطبّقة على كل الجسور أعلاه.</div></div>

      <div class="card"><h3>🏗️ نوع السقف — المختار والبدائل</h3>
        ${table(['النوع', 'المدى المناسب', 'الملاحظة', ''], r.slab.types.map(t =>
          [t.name, t.span, t.note, t.chosen ? '<span class="tag t-ok">المختار ✓</span>' : '']))}
        <div class="note"><b>التوصية:</b> ${r.slab.recommend.options.map(o => o.name + ' — ' + o.why).join(' · ')}
          <br>المختار: <b>${r.model.slab.name}</b> بسماكة ${int(r.model.slab.h)} مم ووزن ذاتي
          ${nf(r.floor.slab_sw, 2)} kN/m².
          <button class="btn gh" style="margin-top:8px" onclick="wtab('slabs')">قارن كل الأنواع بالتفصيل</button></div></div>
    </div>
`;
}

/* ============ تبويبات مساحة العمل: تفاصيل · أشعة · سقوف · تجربة · كميات ============ */
const WT = { xr: 0, slabs: 0, boq: 0, lab: 0 };
function wtab(id) {
  $$('#wtabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  $$('.wpanel').forEach(p => { p.hidden = p.dataset.t !== id; });
  if (!WT[id] && TABS[id]) { WT[id] = 1; TABS[id](); }
}
const TABS = {
  /* ---------- الأشعة الإنشائية على هندسة المشروع نفسه ---------- */
  xr: async () => {
    const r = WZ, g = r.grid, m = r.model;
    const x = await post('xray', {
      bays: Array(g.nx).fill(g.sx), heights: Array(m.floors).fill(m.story_h),
      beam_b: m.beams.x.b, beam_h: m.beams.x.h, col_b: m.col.b, col_h: m.col.h,
      db_col: m.col.rebar.db, nb_bars: m.col.rebar.nb, nh_bars: m.col.rebar.nb,
      fc: r.input.fc, fy: r.input.fy, wD: r.floor.D, wL: r.floor.L, trib: g.sy,
      seismic: true, city: r.input.city, site: 'D' });
    const bad = x.members.filter(m2 => m2.ratio > 1), warn = x.members.filter(m2 => m2.ratio > .9 && m2.ratio <= 1);
    const dOK = x.drift.every((d, i) => d <= x.drift_lim[i]);
    const beams = x.members.filter(m2 => m2.kind === 'beam'), cols = x.members.filter(m2 => m2.kind === 'col');
    $('#wp_xr').outerHTML = `<div id="wp_xr"><div class="grid g4">
      ${kpi('عدد العناصر', x.members.length)}
      ${kpi('أعلى نسبة استغلال', nf(x.worst, 2), x.worst <= 1 ? 'ok' : 'bad')}
      ${kpi('عناصر غير كافية', bad.length, bad.length ? 'bad' : 'ok')}
      ${kpi('عناصر حرجة (0.9–1.0)', warn.length, warn.length ? 'warn' : 'ok')}
      ${kpi('قص القاعدة الزلزالي', x.seismic ? nf(x.seismic.V, 1) + ' kN' : '—')}
      ${kpi('أقصى انزياح طابقي', nf(Math.max(...x.drift), 1) + ' مم', dOK ? 'ok' : 'bad')}
      ${kpi('خرسانة الإطار', nf(x.conc, 2) + ' م³')}
      ${kpi('التشخيص', x.worst <= 1 && dOK ? 'سليم ✓' : 'يحتاج معالجة', x.worst <= 1 && dOK ? 'ok' : 'bad')}</div>
    <div class="card" style="margin-top:14px"><h3>خريطة نسبة الاستغلال لكل عنصر</h3>${xraySVG(x)}
      <div class="legend"><span><i style="background:#34d399"></i>آمن ≤ 0.70</span>
        <span><i style="background:#a3e635"></i>0.70–0.90</span><span><i style="background:#fbbf24"></i>حرج 0.90–1.00</span>
        <span><i style="background:#f87171"></i>غير كافٍ > 1.00</span>
        <span>تراكيب الأحمال: ${x.combos.join(' · ')}</span></div>
      <div class="note">التحليل على إطار المشروع نفسه (${g.nx} بحر × ${m.floors} طابق ·
        جسر ${m.beams.x.b}×${m.beams.x.h} · عمود ${m.col.b}×${m.col.h}) — لا حاجة لإدخال الأرقام يدوياً.</div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>الجسور</h3><div style="max-height:380px;overflow:auto">
        ${table(['طابق', 'البحر', 'M+', 'M−', 'V', 'سفلي', 'علوي', 'أساور', 'النسبة'],
          beams.map(m2 => [m2.story, m2.pos, nf(m2.det.Mpos, 1), nf(m2.det.Mneg, 1), nf(m2.det.V, 1),
            m2.det.bot, m2.det.top, m2.det.stirrups,
            `<b style="color:${rcol(m2.ratio)}">${nf(m2.ratio, 2)}</b>`]))}</div></div>
      <div class="card"><h3>الأعمدة</h3><div style="max-height:380px;overflow:auto">
        ${table(['طابق', 'المحور', 'Pu', 'Mu', 'φMn', 'التسليح', 'النسبة'],
          cols.map(m2 => [m2.story, m2.pos, nf(m2.det.P, 1), nf(m2.det.M, 1), nf(m2.det.phiMn, 1),
            m2.det.bars, `<b style="color:${rcol(m2.ratio)}">${nf(m2.ratio, 2)}</b>`]))}</div></div>
      <div class="card"><h3>الانزياح الطابقي (Drift)</h3>
        ${table(['الطابق', 'المكبّر (مم)', 'الحد (مم)', 'الحالة'],
          x.drift.map((d, i) => [i + 1, nf(d, 2), nf(x.drift_lim[i], 1), tag(d <= x.drift_lim[i])]))}</div>
      <div class="card"><h3>ملخص النموذج</h3>${table(['البند', 'القيمة'], [
        ['عدد العقد', x.nodes.length], ['البحور × الطوابق', x.nb + ' × ' + x.ns],
        ['حمل الجسر الميت', nf(x.gD, 2) + ' kN/م'], ['حمل الجسر الحي', nf(x.gL, 2) + ' kN/م'],
        ['وزن الإطار W', int(x.W) + ' kN'],
        ['صلابة مشقّقة', 'جسور 0.35Ig · أعمدة 0.70Ig (ACI 6.6.3.1.1)']])}</div></div></div>`;
  },
  /* ---------- أنواع السقوف مع تبديل حي يعيد بناء المجسم ---------- */
  slabs: async () => {
    const r = WZ, g = r.grid;
    const s = await post('slabtypes', { span: Math.max(g.sx, g.sy), span2: Math.min(g.sx, g.sy),
      live: r.floor.L, wD: r.floor.D - r.floor.slab_sw, fc: r.input.fc,
      nspans: Math.max(g.nx, g.ny), hordi: r.input.hordi });
    const lo = Math.min(...s.types.filter(t => t.ok).map(t => t.sw));
    $('#wp_slabs').outerHTML = `<div id="wp_slabs">
      <div class="selbox">النوع الحالي: <b>${r.model.slab.name}</b> · سماكة ${int(r.model.slab.h)} مم ·
        وزن ذاتي ${nf(r.floor.slab_sw, 2)} kN/m² — اضغط أي نوع ليُعاد تصميم المشروع والمجسم عليه فوراً.</div>
      <div class="v3bar">${s.types.map(t => `<button class="${t.kind === r.model.slab.type ? 'hot' : ''}"
        onclick="TABS.pick('${t.kind}')">${t.name}${t.recommended ? ' ✓' : ''}</button>`).join('')}</div>
      <div class="card"><h3>المقارنة على بحر ${nf(s.span, 2)} م</h3>
        ${table(['النوع', 'المدى المناسب', 'السماكة (مم)', 'الوزن الذاتي (kN/m²)', 'مقابل المصمتة', 'الملاحظة'],
          s.types.map(t => [t.name + (t.recommended ? ' <span class="tag t-ok">موصى به</span>' : '')
              + (t.kind === r.model.slab.type ? ' <span class="tag t-warn">المختار</span>' : ''),
            t.span_range, t.ok ? int(t.h) : '—',
            t.ok ? `<b style="color:${t.sw <= lo * 1.05 ? '#34d399' : '#e6edf7'}">${nf(t.sw, 2)}</b>` : '—',
            t.ok ? nf((t.sw - s.types[0].sw) / s.types[0].sw * 100, 0) + '%' : '—', t.note]))}
        <div class="note">${s.note}</div></div>
      <div class="grid g2" style="margin-top:14px">${s.types.filter(t => t.ok && t.rows).map(t =>
        `<div class="card"><h3>${t.name}${t.kind === r.model.slab.type ? ' — المختار ✓' : ''}</h3>
          ${table(['البند', 'القيمة'], t.rows.map(x => [x[0], x[1]]))}
          ${t.detail && t.detail.note ? `<div class="note">${t.detail.note}</div>` : ''}</div>`).join('')}
      </div></div>`;
  },
  pick: async (kind) => {
    $('#w_slab').value = kind;
    const box = $('#w_hordi'); if (box) box.style.display = ['auto', 'hordi'].includes(kind) ? '' : 'none';
    await PAGES.wizard.run();
    setTimeout(() => wtab('slabs'), 400);
  },
  /* ---------- الكميات وجدول الحديد ---------- */
  boq: async () => {
    const r = WZ, b = await post('bbs', r);
    $('#wp_boq').outerHTML = `<div id="wp_boq"><div class="grid g4">
      ${kpi('وزن الحديد الكلي', nf(b.total_ton, 1) + ' طن', 'ok')}
      ${kpi('عدد القطع', int(b.bars) + ' سيخ')}
      ${kpi('هدر الوصلات', nf(b.lap_pct, 1) + '%')}
      ${kpi('طول السيخ بالسوق', int(b.stock) + ' م')}
      ${kpi('الكلفة التقديرية', int(r.boq.total) + ' د.ع', 'ok')}
      ${kpi('خرسانة الأساس', nf(r.design.conc, 1) + ' م³')}
      ${kpi('قاعدة الوصلات', b.lap_mode)}
      ${kpi('حفريات', nf(r.earth.cut_vol, 0) + ' م³')}</div>
      <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>الكلفة التقديرية</h3>
        ${table(['البند', 'الكمية', 'الوحدة', 'السعر', 'الكلفة (د.ع)'],
          r.boq.rows.map(x => [x.name, nf(x.q, 1), x.unit, int(x.rate), int(x.cost)]))}</div>
      <div class="card"><h3>الحديد حسب القطر</h3>
        ${table(['القطر', 'العدد', 'الطول (م)', 'الوزن (كغم)', 'الوصلات'],
          b.by_db.map(x => ['Ø' + x.db, int(x.count), nf(x.length, 0), nf(x.weight, 0), int(x.laps)]))}
        <div class="row" style="margin-top:10px"><button class="btn gh" onclick="go('bbs')">📊 جدول التقطيع الكامل</button>
          <button class="btn gh" onclick="PAGES.wizard.dxf('rebar')">📐 تفاصيل التسليح DXF</button></div></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>جدول تقطيع الحديد (BBS)</h3>
        <div style="max-height:420px;overflow:auto">${table(
          ['الرمز', 'العنصر', 'Ø', 'الشكل', 'طول السيخ', 'قطع', 'العدد', 'الوصلات', 'الوزن (كغم)'],
          b.rows.map(x => [x.mark, x.elem, x.db ? 'Ø' + x.db : '—', x.shape, nf(x.run, 2),
            x.pieces, int(x.count), int(x.laps), nf(x.weight, 1)]))}</div>
        <div class="note">${b.note}</div></div></div>`;
  },
  /* ---------- الإنشائيات والتجربة: اختيار بالضغط على المجسم ---------- */
  lab: () => { LAB_SEL = null; renderLab(null); },
};

/* ---------------- مختبر التجربة داخل نفس المجسم ---------------- */
let LAB_SEL = null, LAB_RES = null;
const MODE_IC = { bending: '🌀 انحناء', shear: '✂️ قص', torsion: '🔃 التواء',
  buckling: '⬇️ ضغط وانبعاج', tension: '↔️ شد' };
const KIND_AR = { col: 'عمود', bx: 'جسر باتجاه X', by: 'جسر باتجاه Y' };

function labSelect(u) {                     // يُستدعى عند الضغط على عنصر بالمجسم
  if (!u || !u.gk) return false;
  LAB_SEL = u.gk.split('|');
  const box = $('#lb_sel');
  if (box) box.innerHTML = `العنصر المختار: <b>${KIND_AR[LAB_SEL[0]] || LAB_SEL[0]}</b>
    عند المحور (${LAB_SEL[1]}, ${LAB_SEL[2]}) بالطابق ${LAB_SEL[3]} —
    <button class="btn" style="padding:5px 12px" onclick="runLab()">🧪 احذفه وحلّل</button>
    <button class="btn gh" style="padding:5px 12px" onclick="V3&&V3.zoomSel()">🔍 قرّبه</button>`;
  return true;
}
function renderLab(r) {
  const nfl = (WZ && WZ.model.floors) || 1;
  const head = `<div class="selbox" id="lb_sel">
      اضغط على أي <b>عمود</b> أو <b>جسر</b> بالمجسم أعلاه لاختياره — أو اختره من القوائم:</div>
    <div class="v3bar">
      <select id="lb_tag" style="width:auto;padding:6px 10px">
        <option value="col">عمود</option><option value="bx">جسر باتجاه X</option>
        <option value="by">جسر باتجاه Y</option></select>
      <select id="lb_i" style="width:auto;padding:6px 10px">${
        Array.from({ length: (WZ ? WZ.grid.nx : 1) + 1 }, (_, i) => `<option>${i}</option>`).join('')}</select>
      <select id="lb_j" style="width:auto;padding:6px 10px">${
        Array.from({ length: (WZ ? WZ.grid.ny : 1) + 1 }, (_, i) => `<option>${i}</option>`).join('')}</select>
      <select id="lb_k" style="width:auto;padding:6px 10px">${
        Array.from({ length: nfl }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
      <button class="btn" style="padding:6px 14px" onclick="runLab(1)">🧪 احذف وحلّل</button>
      <button class="btn gh" style="padding:6px 14px" onclick="runLab(0,1)">↩️ رجّع العنصر</button>
      <button class="btn gh" style="padding:6px 14px" onclick="runSweep()">🗺️ مسح شامل — أي عمود هو الأحرج؟</button>
      <button class="btn gh" style="padding:6px 14px" onclick="runSweep(1)">🗺️ مسح كل الأعمدة (أبطأ)</button>
    </div>
    <div id="lb_sweep"></div>
    <div class="hint">المحاور i بالاتجاه X و j بالاتجاه Y وتبدأ من 0 — العمود الركني (0,0).
      بعد التحليل تتلوّن كل العناصر بالمجسم حسب نسبة استغلالها، ويختفي العنصر المحذوف،
      واضغط أي عنصر لترى نسبه الخمس قبل الحذف وبعده.</div>`;
  if (!r) { $('#wp_lab').innerHTML = head +
    `<div class="note">لم تُجرَ تجربة بعد — اختر عنصراً واضغط «احذف وحلّل».
      المنهجية: حذف عنصر رئيسي وإعادة التحليل الفراغي لدراسة المسار البديل للأحمال
      (Alternate Load Path — GSA / UFC 4-023-03).</div>`; return; }
  const rows = r.rows || [], byMode = {};
  rows.filter(x => x.fail).forEach(x => { byMode[x.mode] = (byMode[x.mode] || 0) + 1; });
  const worst = rows[0];
  $('#wp_lab').innerHTML = head + `
    <div class="rec" style="margin-top:12px"><h3>${r.removed ? '🧪 نتيجة الحذف' : '↩️ الحالة الأصلية'}</h3>
      <ul>${r.summary.map(x => `<li>${x}</li>`).join('')}</ul></div>
    <div class="grid g4" style="margin-top:14px">
      ${Object.keys(MODE_IC).map(m => kpi(MODE_IC[m], (byMode[m] || 0) + ' عنصر',
        byMode[m] ? 'bad' : 'ok')).join('')}
      ${kpi('عناصر تجاوزت مقاومتها', r.fails || 0, r.fails ? 'bad' : 'ok')}
      ${kpi('أقصى انزياح بعد الحذف', nf(Math.max(...(r.drift || [0]).map(Math.abs)), 1) + ' مم')}
      ${kpi('قبل الحذف', nf(Math.max(...(r.drift_before || [0]).map(Math.abs)), 1) + ' مم')}
      ${kpi('أشد عنصر متأثر', worst ? (KIND_AR[worst.tag] || worst.tag) + ' ' + nf(worst.after, 2) : '—',
        worst && worst.after > 1 ? 'bad' : 'ok')}</div>
    <div class="note" style="margin-top:12px">${r.base_note || ''}</div>
    <div class="card" style="margin-top:14px"><h3>العناصر الأكثر تأثراً (${rows.length})</h3>
      <div style="max-height:430px;overflow:auto">${table(
        ['العنصر', 'المحور', 'طابق', 'قبل', 'بعد', 'الفرق', 'النمط الحاكم',
         'انحناء', 'قص', 'التواء', 'انبعاج', 'شد', ''],
        rows.map(x => [KIND_AR[x.tag] || x.tag, '(' + x.key[1] + ', ' + x.key[2] + ')', x.story,
          nf(x.before, 2), `<b style="color:${rcol(x.after)}">${nf(x.after, 2)}</b>`,
          (x.delta >= 0 ? '+' : '') + nf(x.delta, 2), x.mode_ar,
          ...['bending', 'shear', 'torsion', 'buckling', 'tension'].map(m =>
            `<span style="color:${rcol(x.modes[m])}">${nf(x.modes[m], 2)}</span>`),
          `<button class="btn gh" style="padding:3px 9px;font-size:11px"
            onclick="labFocus('${x.key.join('|')}')">اعرضه</button>`]))}</div>
      <div class="note">${r.note}</div></div>`;
}
function labFocus(gk) {
  if (!V3 || !V3.focus) return;
  V3.focus(gk);
}
/* مسح شامل: يحذف كل عمود على حدة ويرتّب المبنى حسب هشاشته */
async function runSweep(full) {
  const box = $('#lb_sweep');
  box.innerHTML = '<div class="note">جارٍ حذف كل عمود على حدة وإعادة التحليل الفراغي… قد يستغرق ثوانٍ.</div>';
  const r = await post('lab/sweep', Object.assign({}, WZ.input, { full: !!full, story: 1 }));
  const mx = Math.max(...r.rows.map(x => x.worst), 1);
  box.innerHTML = `<div class="rec" style="margin-top:12px"><h3>🗺️ خريطة الهشاشة — أي عمود هو الأحرج؟</h3>
      <ul>${r.summary.filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul></div>
    <div class="card" style="margin-top:12px"><h3>ترتيب الأعمدة حسب أثر حذفها</h3>
      ${table(['#', 'العمود', 'المحور', 'Pu (kN)', 'عناصر تنهار', 'أعلى نسبة بعد الحذف',
               'الانزياح (مم)', 'أنماط الفشل', 'الحكم', ''],
        r.rows.map((x, i) => [i + 1,
          `<span class="tag ${x.kind === 'داخلي' ? 't-ok' : 't-warn'}">${x.kind}</span>`,
          '(' + x.i + ', ' + x.j + ')', int(x.Pu),
          `<b style="color:${x.fails ? '#f87171' : '#34d399'}">${x.fails}</b>`,
          `<div style="display:flex;align-items:center;gap:6px">
             <div style="flex:1;height:7px;background:#1b2942;border-radius:4px;overflow:hidden">
               <div style="width:${Math.min(100, x.worst / mx * 100)}%;height:100%;background:${rcol(x.worst)}"></div>
             </div><b style="color:${rcol(x.worst)}">${nf(x.worst, 2)}</b></div>`,
          nf(x.drift, 1),
          x.modes.length ? x.modes.map(m => m.name + ' ×' + m.n).join(' · ') : '—',
          x.ok ? '<span class="tag t-ok">ينجو</span>' : '<span class="tag t-bad">' + x.verdict + '</span>',
          `<button class="btn gh" style="padding:3px 9px;font-size:11px"
            onclick="labRemoveAt('${x.i}','${x.j}')">افحصه بالتفصيل</button>`]))}
      <div class="note">${r.note}<br>أعلى نسبة استغلال قبل أي حذف = ${nf(r.base_max, 2)} ·
        الانزياح الجانبي قبل الحذف = ${nf(r.drift_before, 1)} مم.</div></div>`;
}
function labRemoveAt(i, j) {
  $('#lb_tag').value = 'col'; $('#lb_i').value = i; $('#lb_j').value = j; $('#lb_k').value = '1';
  runLab(1);
}
async function runLab(fromForm, restore) {
  if (restore) {
    LAB_RES = null; if (V3 && V3.lab) V3.lab(null);
    return renderLab(null);
  }
  let sel = LAB_SEL;
  if (fromForm || !sel) sel = [txt('lb_tag'), txt('lb_i'), txt('lb_j'), txt('lb_k')];
  const p = Object.assign({}, WZ.input, { remove: sel });
  const r = await post('lab', p);
  LAB_RES = r; LAB_SEL = sel;
  renderLab(r);
  if (V3 && V3.lab) V3.lab(r.rows, r.removed);
  labSelect({ gk: sel.join('|') });
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
      ${F('عمق التأسيس Df', 'w_df', 1.50, .05, 'م')}</div></div>
    <div class="card"><h3>٣ · نوع السقف</h3><div class="f">
      ${S('نوع السقف', 'w_slab', [['auto', 'تلقائي — حسب التوصية']].concat(
        (META.slab_types || []).map(t => [t.k, t.name + ' (' + t.span + ')'])), 'auto')}
      ${S('درجة التعرّض (للغطاء)', 'w_exp', (META.exposures || []).map(e => [e.k, e.name]), 'interior')}</div>
      <div id="w_hordi" class="f" style="display:none;margin-top:8px">
        ${F('عرض البلوك ⊥ العصب', 'w_bw', (META.hordi || {}).block_W || 400, 10, 'مم')}
        ${F('طول البلوك مع العصب', 'w_bl', (META.hordi || {}).block_L || 200, 10, 'مم')}
        ${F('ارتفاع البلوك', 'w_bh', (META.hordi || {}).block_H || 240, 10, 'مم')}
        ${F('عرض العصب', 'w_rw', (META.hordi || {}).rib_w || 120, 10, 'مم')}
        ${F('طبقة التغطية', 'w_tp', (META.hordi || {}).topping || 70, 5, 'مم')}
        ${F('وزن البلوكة', 'w_bk', (META.hordi || {}).block_kg || 12, .5, 'كغم')}</div>
      <div class="hint">الهوردي هو الأشيع بالعراق — أدخل مقاسات البلوك المتوفرة عندك.</div></div>
    <div class="card"><h3>٤ · تفاصيل التنفيذ</h3><div class="f">
      ${S('قاعدة الأوفرلاب', 'w_lap', (META.lap_modes || []).map(m => [m.k, m.name]), '60db')}
      ${S('قاعدة الدولات (Dowels)', 'w_dow', (META.dowel_modes || []).map(m => [m.k, m.name]), '16db')}
      ${S('نوع الكرسي', 'w_chair', (META.chairs || []).map(c => [c.k, c.name]), 's135')}
      ${C('ثني الحديد السفلي 45° عند L/7', 'w_bent', true)}</div>
      <div class="row"><button class="btn" onclick="PAGES.wizard.run()">🚀 صمّم المشروع</button>
        <button class="btn gh" onclick="window.print()">🖨️ تقرير PDF</button>
        <button class="btn gh" onclick="PAGES.wizard.dxf()">📐 مخطط الأسس DXF</button>
        <button class="btn gh" onclick="PAGES.wizard.dxf('rebar')">📐 تفاصيل التسليح DXF</button>
        <button class="btn gh" onclick="go('bbs')">📊 جدول تقطيع الحديد</button>
        <button class="btn gh" onclick="PAGES.wizard.save()">💾 حفظ المشروع</button></div>
      <div class="hint">البنج مارك 0.00 = منسوب أرضية الطابق الأرضي بعد التشطيب.</div></div></div>
  <div id="w_out" style="margin-top:16px"></div>`,
  payload: () => ({ area: val('w_area'), floors: val('w_floors'), coverage: val('w_cov'),
    story_h: val('w_hs'), use: txt('w_use'), fc: val('w_fc'), fy: val('w_fy'), city: txt('w_city'),
    soil: txt('w_soil'), qa: val('w_qa') || null, ground: val('w_ground'), old_depth: val('w_old'),
    Df: val('w_df'), slab_type: txt('w_slab'), exposure: txt('w_exp'), lap_mode: txt('w_lap'),
    dowel_mode: txt('w_dow'), chair_kind: txt('w_chair'), bent: chk('w_bent'),
    hordi: { block_W: val('w_bw'), block_L: val('w_bl'), block_H: val('w_bh'),
      rib_w: val('w_rw'), topping: val('w_tp'), block_kg: val('w_bk') } }),
  dxf: async (kind) => {
    if (!WZ) return alert('شغّل المعالج أولاً');
    const r = await fetch('/api/dxf' + (kind === 'rebar' ? '?kind=rebar' : ''),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(WZ) });
    const b = await r.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = kind === 'rebar' ? 'rebar-details.dxf' : 'foundation.dxf'; a.click();
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

    <div class="card" style="margin-top:16px"><h3>🩻 مساحة العمل ثلاثية الأبعاد — X-Ray · التسليح · التحليل · التجربة</h3>
      ${v3bar({ floors: r.model.floors, analysis: true })}
      <div class="v3d"><div id="v3d" style="min-height:500px"></div>
        <div class="chips" id="v3groups">
          ${v3chips([['layers', 'طبقات الردم', 1], ['raft', 'حصيرة', 1], ['isolated', 'أسس منفردة', 1],
             ['piles', 'ركائز', r.recommended === 'piles' ? 1 : 0], ['columns', 'أعمدة', 1],
             ['beams', 'جسور', 1], ['slabs', 'سقوف', 1], ['extra', 'تسليح إضافي', 1],
             ['chairs', 'كراسي', 1]])}
        </div>
        <div class="info" id="v3info"></div>
        <div class="slider"><span style="font-size:11px;color:var(--mut)">قص المقطع</span>
          <input type="range" id="v3clip" min="-30" max="40" step="0.2">
          <span id="v3stats" style="font-size:11px;color:var(--acc2)"></span></div>
      </div>
      ${v3legend()}
      <div class="hint">اسحب للتدوير · العجلة للتكبير · <b>ضغطة واحدة = اختيار وعرض التفاصيل (بلا تحريك الكاميرا)
        · ضغطتان أو «تقريب المحدد» = تقريب متحرك.</b> زر «🧍 إنسان 1.85 م» يضع شخصاً بالحجم الطبيعي للمقارنة،
        ويتنقل معك بين الطوابق من قائمة الطوابق.</div>

      <div class="wtabs" id="wtabs">
        ${[['detail', '🧵 التسليح والتفاصيل'], ['xr', '🩻 الأشعة الإنشائية'],
           ['slabs', '🧱 نوع السقف'], ['lab', '🧪 الإنشائيات والتجربة'],
           ['boq', '📋 الكميات والحديد']].map(([k, t], i) =>
          `<button data-t="${k}" class="${i ? '' : 'on'}" onclick="wtab('${k}')">${t}</button>`).join('')}
      </div>
      <div class="wpanel" data-t="detail">${detailPanel(r)}</div>
      <div class="wpanel" data-t="xr" hidden><div id="wp_xr" class="note">جارٍ التحليل…</div></div>
      <div class="wpanel" data-t="slabs" hidden><div id="wp_slabs" class="note">جارٍ التحميل…</div></div>
      <div class="wpanel" data-t="lab" hidden><div id="wp_lab"></div></div>
      <div class="wpanel" data-t="boq" hidden><div id="wp_boq" class="note">جارٍ التحميل…</div></div>
    </div>

    <div class="rec" style="margin-top:16px"><h3>🏗️ التوصية: ${a.name}</h3>
      <ul>${a.reasons.map(x => `<li>${x}</li>`).join('')}</ul>
      ${a.alts.length ? `<ul class="alt"><b style="color:var(--mut);font-size:12px">بدائل وملاحظات:</b>
        ${a.alts.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      <div style="margin-top:8px;font-size:12px;color:var(--mut)">تحمّل التربة الصافي ${nf(a.q_net, 0)} kPa ·
        مجموع مساحات الأسس ${nf(a.sum_area, 1)} م² (${nf(a.ratio * 100, 0)}% من مساحة البناء)</div></div>

    <div class="card" style="margin-top:16px"><h3>مقارنة بدائل الأساس</h3>
      ${table(['البديل', 'الوصف', 'الخرسانة (م³)', 'الحديد (طن)', 'الحالة', ''],
        Object.entries(r.alts).map(([k, v]) => [
          v.name + (k === r.recommended ? ' <span class="tag t-ok">موصى به ✓</span>' : ''),
          k === 'isolated' ? (v.sizes.length + ' أساس · أكبرها ' + nf(Math.max(...v.sizes.map(s => s.B)), 2) + ' م')
            : k === 'raft' ? (nf(v.raft.Lx, 1) + '×' + nf(v.raft.Ly, 1) + ' م · سماكة ' + int(v.raft.h) + ' مم')
            : (v.total_piles + ' ركيزة Ø' + int(v.pile.D * 1000) + ' طول ' + int(v.pile.L) + ' م'),
          nf(v.conc, 1), nf(v.steel, 2),
          v.ok ? '<span class="tag t-ok">صالح</span>' : '<span class="tag t-warn">غير مناسب هنا</span>',
          k === 'isolated' ? nf(v.area / r.footprint * 100, 0) + '% من المساحة' : ''
        ]))}</div>
    <div class="card" style="margin-top:16px"><h3>تصميم الأساس الموصى به</h3>${des}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>السقف — ${r.slab.kind_name}</h3>
        ${table(['البند', 'القيمة'], [['السماكة', int(r.slab.h) + ' مم (الدنيا ' + nf(r.slab.hmin, 0) + ')'],
          ['سبب الاختيار', r.slab.why], ['wu', nf(r.slab.wu, 2) + ' kN/m²'],
          ['الوزن الذاتي', nf(r.floor.slab_sw, 2) + ' kN/m²'],
          ['فرش (الاتجاه القصير)', r.model.slab.mesh.short.label + ' — d = ' + int(r.model.slab.mesh.short.d) + ' مم'],
          ['غطاء (الاتجاه الطويل)', r.model.slab.mesh.long.label + ' — d = ' + int(r.model.slab.mesh.long.d) + ' مم'],
          ['علوي فوق المساند', r.model.slab.mesh.top.label],
          ['الغطاء الخرساني', int(r.model.slab.cover) + ' مم'],
          ['خرسانة السقف الواحد', nf(r.footprint * r.slab.h / 1000, 1) + ' م³']].concat(
          (r.slab.rows || []).map(x => [x[0], x[1]])))}</div>
      <div class="card"><h3>الأعمدة</h3>
        ${table(['البند', 'القيمة'], [['المقطع', r.col.b + ' × ' + r.col.h + ' مم'],
          ['التسليح الطولي', r.col.rebar.label + ' (ρ = ' + nf(r.col.rebar.rho * 100, 2) + '%)'],
          ['الأتاري بالوسط', r.col.rebar.tie_label],
          ['التطويق عند الأطراف', r.col.rebar.conf_label],
          ['Pu المصمم', nf(r.Pumax, 0) + ' kN'], ['Mu التقديري', nf(r.col.Mu, 1) + ' kN·m'],
          ['φMn عند Pu', nf(r.col.rebar.phiMn, 1) + ' kN·m'],
          ['نسبة الاستغلال', nf(r.col.rebar.ratio, 2) + (r.col.rebar.ok ? ' ✓' : ' ✗')]])}</div>
      ${['x', 'y'].map(d => { const bm = r.beams[d], sc2 = bm.section; return `
      <div class="card"><h3>جسور الاتجاه ${d.toUpperCase()} — ${nf(sc2.span, 2)} م × ${sc2.nspan} فضاء</h3>
        ${table(['البند', 'القيمة'], [['المقطع', int(sc2.b) + ' × ' + int(sc2.h) + ' مم'],
          ['العرض المؤثر', nf(sc2.trib, 2) + ' م'],
          ['أقصى عزم موجب', nf(Math.max(...bm.design.map(x => x.Mpos)), 1) + ' kN·m'],
          ['أقصى عزم سالب', nf(Math.min(...bm.supports.map(x => x.M)), 1) + ' kN·m'],
          ['التسليح السفلي', bm.rebar.bottom.label], ['التسليح العلوي', bm.rebar.top.label],
          ['الأساور', bm.rebar.stirrup.label],
          ['الهطول', nf(Math.abs(Math.min(...bm.design.map(x => x.d_long))), 1) + ' مم / الحد ' +
            nf(bm.design[0].d_limit, 1) + ' مم']])}</div>`; }).join('')}
    </div>
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
    setTimeout(() => mount3D(WZ, 'v3d'), 60);
  },
  init: () => {
    const sel = $('#w_slab'), box = $('#w_hordi');
    const sync = () => { box.style.display = ['auto', 'hordi'].includes(sel.value) ? '' : 'none'; };
    sel.onchange = sync; sync();
    PAGES.wizard.run();
  }
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
  ['المشروع', ['wizard', 'room', 'bbs', 'projects']],
  ['ما تحت الصفر', ['survey', 'earth', 'soil']],
  ['حاسبات منفردة', ['loads', 'seismic', 'wind', 'beam', 'column', 'footing']],
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
  window.addEventListener('hashchange', () => {          // دعم زر الرجوع وتغيير العنوان
    const id = (location.hash || '#wizard').slice(1);
    const btn = $('#nav button[data-id="' + id + '"]');
    if (id in PAGES && (!btn || !btn.classList.contains('on'))) go(id);
  });
})();

/* ------------------------------ تصميم غرفة ------------------------------- */
let RMD = null;
PAGES.room = {
  ic: '🚪', name: 'تصميم غرفة', grp: 'المشروع', ttl: 'تصميم غرفة — معماري وإنشائي',
  sub: 'الجدران والفتحات وأحمالها + البلاطة والجسور والأعمدة والأسس + مجسم وتسليح',
  desc: 'غرفة واحدة بجدرانها وفتحاتها',
  html: () => `<div class="grid g2">
    <div class="card"><h3>أبعاد الغرفة والمواد</h3><div class="f">
      ${F('الطول', 'rm_L', 5.0, .1, 'م')}${F('العرض', 'rm_W', 4.0, .1, 'م')}
      ${F('ارتفاع الطابق', 'rm_h', 3.2, .1, 'م')}
      ${S('نوع الجدار', 'rm_wall', (META.walls || []).map(w => [w.name, w.name]), 'طابوق 240 مم')}
      ${S('الاستعمال', 'rm_use', META.live.map(x => x.name), 'سكني / غرف نوم')}
      ${F("f'c", 'rm_fc', 25, 1, 'MPa')}${F('fy', 'rm_fy', 420, 10, 'MPa')}
      ${F('تحمّل التربة qa', 'rm_qa', 150, 5, 'kPa')}
      ${F('طوابق فوق العمود', 'rm_fl', 1, 1)}</div></div>
    <div class="card"><h3>الفتحات</h3><div class="f">
      ${F('عدد الأبواب', 'rm_dn', 1, 1)}${F('عرض الباب', 'rm_dw', 1.0, .1, 'م')}
      ${F('ارتفاع الباب', 'rm_dh', 2.1, .1, 'م')}
      ${F('عدد الشبابيك', 'rm_wn', 2, 1)}${F('عرض الشباك', 'rm_ww', 1.5, .1, 'م')}
      ${F('ارتفاع الشباك', 'rm_wh', 1.2, .1, 'م')}${F('منسوب الجلسة', 'rm_ws', 0.9, .1, 'م')}</div>
      <div class="row"><button class="btn" onclick="PAGES.room.run()">🚪 صمّم الغرفة</button>
        <button class="btn gh" onclick="window.print()">🖨️ تقرير</button></div></div></div>
    <div id="rm_out" style="margin-top:16px"></div>`,
  run: async () => {
    const r = await post('room', { L: val('rm_L'), W: val('rm_W'), h: val('rm_h'), wall: txt('rm_wall'),
      use: txt('rm_use'), fc: val('rm_fc'), fy: val('rm_fy'), qa: val('rm_qa'), floors: val('rm_fl'),
      doors: [{ w: val('rm_dw'), h: val('rm_dh'), n: val('rm_dn') }],
      windows: [{ w: val('rm_ww'), h: val('rm_wh'), n: val('rm_wn'), sill: val('rm_ws') }] });
    RMD = r;
    const s = r.slab;
    $('#rm_out').innerHTML = `<div class="grid g4">
      ${kpi('نوع البلاطة', s.two_way ? 'ثنائية الاتجاه' : 'أحادية الاتجاه', 'ok')}
      ${kpi('السماكة', int(s.h) + ' مم')}${kpi('نسبة البحور', nf(s.ratio, 2))}
      ${kpi('wu', nf(s.wu, 2) + ' kN/m²')}
      ${kpi('العمود', r.col.b + '×' + r.col.h + ' مم')}${kpi('تسليح العمود', r.col.rebar.label)}
      ${kpi('الأساس', nf(r.foot.B, 2) + '×' + nf(r.foot.B, 2) + ' م')}
      ${kpi('حديد تقريبي', nf(r.quantities[7].q, 2) + ' طن')}</div>

    <div class="card" style="margin-top:16px"><h3>🩻 مجسم الغرفة — جدران وفتحات وتسليح</h3>
      <div class="v3bar">
          <button onclick="V3&&V3.reset()">إعادة الزاوية</button>
          <button onclick="V3&&V3.top()">مسقط علوي</button>
          <button id="btnRebar" onclick="toggleRebar()">🧵 إظهار التسليح</button>
          <button id="btnXray" onclick="toggleXray()">🩻 وضع الأشعة</button>
          <button onclick="V3&&V3.zoomSel()">🔍 تقريب المحدد</button>
      </div>
      <div class="v3d"><div id="rm3d" style="min-height:430px"></div>
        <div class="chips" id="v3groups">
          ${[['walls', 'جدران', 1], ['slabs', 'سقف', 1], ['beams', 'جسور', 1],
             ['columns', 'أعمدة', 1], ['isolated', 'أسس', 1], ['chairs', 'كراسي', 1]].map(([k, t, o]) =>
            `<label><input type="checkbox" data-g="${k}" ${o ? 'checked' : ''}
              onchange="V3&&V3.group('${k}',this.checked);refreshStats()"> ${t}</label>`).join('')}
        </div>
        <div class="info" id="v3info"></div>
        <div class="slider"><span style="font-size:11px;color:var(--mut)">قص المقطع</span>
          <input type="range" id="v3clip" min="-20" max="20" step="0.1">
          <span id="v3stats" style="font-size:11px;color:var(--acc2)"></span></div>
      </div>
      <div class="hint">ضغطة = اختيار · ضغطتان = تقريب · «إظهار التسليح» يبيّن حديد البلاطة والجسور
        والأعمدة والأسس مع الكراسي والوصلات.</div></div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>البلاطة</h3>${table(['البند', 'القيمة'], [
        ['الطريقة', s.method], ['السماكة', int(s.h) + ' مم'],
        ['العزم بالاتجاه القصير', nf(s.short.M, 1) + ' kN·m/م'],
        ['العزم بالاتجاه الطويل', nf(s.long.M, 1) + ' kN·m/م'],
        ['تسليح سفلي (قصير)', s.short.label], ['تسليح سفلي (طويل)', s.long.label],
        ['تسليح علوي فوق الجسور', s.top.label],
        ['الكراسي', r.chairs.label + ' — ' + int(r.chairs.n) + ' كرسي'],
        ['البسكويت', int(r.chairs.spacers) + ' قطعة']])}</div>
      <div class="card"><h3>الجدران والفتحات</h3>${table(['الجدار', 'الطول', 'الفتحات', 'المساحة الصافية', 'الحمل (kN/م)', 'الطابوق'],
        r.walls.map(w => [w.i, nf(w.L, 2) + ' م',
          w.openings.map(o => o.kind + ' ' + nf(o.w, 2) + '×' + nf(o.h, 2)).join(' · ') || '—',
          nf(w.area_net, 1) + ' م²', nf(w.udl, 2), int(w.blocks)]))}
        <div class="note">نوع الجدار: ${r.wall_type.name} · كثافة ${nf(r.wall_type.gamma, 0)} kN/m³ ·
          ${nf(r.wall_type.blocks_m2, 0)} قطعة/م² · اللبخ محسوب على الوجهين.</div></div>
      <div class="card"><h3>الجسور الأربعة</h3>${table(['الجسر', 'البحر', 'المقطع', 'نوع الحمل', 'Mu', 'سفلي', 'أساور', 'هطول/الحد'],
        r.beams.map(b => [b.i, nf(b.span, 2) + ' م', int(b.b) + '×' + int(b.h),
          b.share, nf(b.Mu, 1), b.bottom.label, b.stirrup.label,
          nf(Math.abs(b.defl), 1) + '/' + nf(b.defl_lim, 1)]))}</div>
      <div class="card"><h3>الأعمدة والأسس والكميات</h3>${table(['البند', 'القيمة'], [
        ['حمل العمود Pu', nf(r.col.Pu, 0) + ' kN'], ['المقطع', r.col.b + '×' + r.col.h + ' مم'],
        ['التسليح', r.col.rebar.label + ' (ρ=' + nf(r.col.rebar.rho * 100, 2) + '%)'],
        ['الأتاري', r.col.rebar.tie_label], ['الأساس', nf(r.foot.B, 2) + '×' + nf(r.foot.B, 2) + ' م سماكة ' + int(r.foot.h) + ' مم'],
        ['تسليح الأساس', r.foot.bars_label]].concat(
        r.quantities.map(q => [q.name, nf(q.q, q.unit === 'قطعة' ? 0 : 2) + ' ' + q.unit])))}</div></div>`;
    setTimeout(() => mount3D(r, 'rm3d'), 60);
  },
  init: () => PAGES.room.run()
};

/* --------------------------- جدول تقطيع الحديد --------------------------- */
PAGES.bbs = {
  ic: '📊', name: 'جدول تقطيع الحديد', grp: 'المشروع', ttl: 'جدول تقطيع الحديد (BBS)',
  sub: 'الأطوال بعد التقطيع على أسياخ 12 م · الوصلات والهدر · الأوزان لكل قطر',
  desc: 'BBS كامل مع الوصلات والهدر',
  html: () => `<div class="card"><h3>المصدر</h3>
    <div class="hint">يُبنى من آخر تشغيل لمعالج المشروع — غيّر المعطيات من صفحة المعالج ثم ارجع هنا.</div>
    <div class="row"><button class="btn" onclick="PAGES.bbs.run()">🔄 تحديث الجدول</button>
      <button class="btn gh" onclick="PAGES.bbs.csv()">⬇️ تنزيل CSV</button>
      <button class="btn gh" onclick="window.print()">🖨️ طباعة</button>
      <button class="btn gh" onclick="go('wizard')">↩︎ المعالج</button></div></div>
    <div id="bb_out" style="margin-top:16px"></div>`,
  payload: () => (WZ ? WZ : (document.getElementById('w_area')
    ? PAGES.wizard.payload()
    : { area: 200, floors: 2, soil: 'طين قاسي', fc: 25, fy: 420 })),
  run: async () => {
    const r = await post('bbs', PAGES.bbs.payload());
    $('#bb_out').innerHTML = `<div class="grid g4">
      ${kpi('الوزن الكلي', nf(r.total_ton, 2) + ' طن', 'ok')}
      ${kpi('عدد القطع', int(r.bars))}${kpi('هدر الوصلات', int(r.lap_weight) + ' كغم')}
      ${kpi('نسبة الهدر', nf(r.lap_pct, 1) + '%')}</div>
    <div class="card" style="margin-top:16px"><h3>الملخص حسب القطر</h3>
      ${table(['القطر', 'الطول الكلي (م)', 'الوزن (كغم)', 'الوزن (طن)', 'عدد الوصلات'],
        r.by_db.map(b => ['Ø' + b.db, int(b.length), int(b.weight), nf(b.weight / 1000, 2), int(b.laps)]))}</div>
    <div class="card" style="margin-top:16px"><h3>الجدول التفصيلي</h3>
      ${table(['الرمز', 'العنصر', 'القطر', 'الشكل', 'طول السيخ (م)', 'قطع', 'طول القطعة (م)',
        'العدد', 'وصلات', 'الطول الكلي (م)', 'الوزن (كغم)', 'ملاحظات'],
        r.rows.map(x => [x.mark, x.elem, 'Ø' + x.db, x.shape, nf(x.run, 2), x.pieces, nf(x.piece, 2),
          int(x.count), int(x.laps), int(x.total_len), int(x.weight), x.note || '—']))}
      <div class="note">${r.note}</div></div>`;
  },
  csv: async () => {
    const res = await fetch('/api/bbs/csv', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PAGES.bbs.payload()) });
    const b = await res.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'bar-bending-schedule.csv'; a.click();
  },
  init: () => PAGES.bbs.run()
};
