/* ملصق قواعد الحديد للطباعة — يُبنى من نفس قواعد rebarkb.js (ACI 318-19) لأي f'c و fy تختارهما،
   فالأرقام المطبوعة هي نفسها اللي يستعملها المعالج ودليل العناصر وقسم الأوتوكاد. صفحة مستقلة
   بثيم فاتح للطباعة (A4/A3) — تُفتح بنافذة وتُطبع أو تُحفظ PDF. إضافة خالصة. */
(function () {
  const P = window.REBARPOSTER = {};
  const R = () => window.REBAR;
  const up10 = x => Math.ceil(x / 10 - 1e-9) * 10;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SIZES = [10, 12, 16, 20, 25, 32];

  // جدول الأطوال (مم، مقرّبة للأعلى لأقرب 10)
  P.rows = function (fc, fy, cover) {
    const r = R(), cv = cover || 40;
    return SIZES.map(db => ({
      db,
      ld: up10(r.ld({ db, fc, fy, cover: cv }).ld),
      ldTop: up10(r.ld({ db, fc, fy, cover: cv, top: true }).ld),
      lapB: up10(r.lapTension({ db, fc, fy, cover: cv }).lap),
      lapBTop: up10(r.lapTension({ db, fc, fy, cover: cv, top: true }).lap),
      lapC: up10(r.lapComp({ db, fc, fy }).lap),
      ldh: up10(r.ldh({ db, fc, fy, confined: true, inCore: true }).ldh),
      ldhFree: up10(r.ldh({ db, fc, fy }).ldh),
      ldc: up10(r.ldc({ db, fc, fy }).ldc),
      bend: r.bendDia(db), ext90: r.hookExt(db, 90, 'bar'), kg: 0.00617 * db * db
    }));
  };

  P.html = function (fc, fy) {
    const r = R(), rows = P.rows(fc, fy, 40);
    const smax = r.sMaxCrack(fy, 50), asmin = Math.max(0.25 * Math.sqrt(fc) / fy, 1.4 / fy);
    const tr = rows.map(x => `<tr><td class="d">Ø${x.db}</td><td>${x.ld}</td><td>${x.ldTop}</td><td>${x.lapB}</td><td>${x.lapBTop}</td><td>${x.lapC}</td><td>${x.ldh}</td><td>${x.ldhFree}</td><td>${x.ldc}</td><td>${x.bend}</td><td>${x.ext90}</td><td>${x.kg.toFixed(3)}</td></tr>`).join('');
    const ties = [8, 10, 12].map(d => `<tr><td class="d">Ø${d}</td><td>${r.bendDia(d, 'tie')}</td><td>${r.hookExt(d, 135, 'tie')}</td><td>${r.hookExt(d, 90, 'tie')}</td></tr>`).join('');
    const cov = r.COVER_TABLE.map(c => `<tr><td>${esc(c[0])}</td><td class="n">${c[1]}</td><td class="c">${esc(c[2])}</td></tr>`).join('');
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ملصق قواعد الحديد — ACI 318-19</title>
<style>
@page{size:A4 portrait;margin:9mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",Arial,sans-serif;color:#0f172a;background:#fff;font-size:11.2px;line-height:1.45}
.pg{max-width:1000px;margin:0 auto;padding:10px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:3px solid #0e7490;padding-bottom:6px;margin-bottom:8px}
h1{margin:0;font-size:21px;color:#0c4a6e}
.sub{color:#475569;font-size:11px;margin-top:2px}
.badge{border:1.5px solid #0e7490;color:#0e7490;border-radius:20px;padding:3px 10px;font-weight:700;white-space:nowrap;direction:ltr}
h2{font-size:13px;margin:10px 0 4px;color:#0e7490;border-right:4px solid #f59e0b;padding-right:6px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #cbd5e1;padding:3px 4px;text-align:center}
th{background:#e0f2fe;color:#0c4a6e;font-size:10.3px}
td.d{font-weight:800;direction:ltr;background:#f8fafc}
td.n{font-weight:700;width:60px}td.c{color:#64748b;width:120px;direction:ltr}
tbody tr:nth-child(even) td{background:#f8fafc}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
.box{border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;break-inside:avoid}
.box ul{margin:4px 0 0;padding-right:16px}.box li{margin:2px 0}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block;font-weight:700;color:#0c4a6e}
.note{color:#475569;font-size:10px;margin-top:4px}
footer{margin-top:8px;border-top:1px solid #cbd5e1;padding-top:4px;color:#64748b;font-size:9.8px;display:flex;justify-content:space-between;gap:8px}
.noprint{position:sticky;top:0;background:#0e7490;color:#fff;padding:8px;text-align:center;font-size:13px}
.noprint button{font:inherit;padding:5px 14px;border-radius:7px;border:0;margin:0 4px;cursor:pointer}
@media print{.noprint{display:none}body{font-size:9.2px;line-height:1.36}.pg{padding:0}h1{font-size:16px}.sub{font-size:9.2px}h2{font-size:11px;margin:5px 0 3px}th,td{padding:1.6px 3px}th{font-size:8.6px}.box{padding:3px 7px}.box li{margin:1px 0}.note{font-size:8.6px}.grid{gap:6px 9px}footer{font-size:8.6px;margin-top:5px}}
@media(max-width:640px){.grid{grid-template-columns:1fr}.tw{overflow-x:auto}}
</style></head><body>
<div class="noprint">🖨️ اطبع أو احفظ PDF (A4 عمودي) <button onclick="print()">طباعة</button></div>
<div class="pg">
<header><div><h1>🧵 دليل حديد التسليح بالموقع — ACI 318-19</h1>
<div class="sub">الأطوال محسوبة بنفس محرّك المنصة لـ <span class="ltr">f'c = ${fc} MPa · fy = ${fy} MPa</span> · غطاء 40 مم · خرسانة عادية الوزن · حديد غير مطلي · مقرّبة للأعلى لأقرب 10 مم</div></div>
<div class="badge">ACI 318-19</div></header>

<h2>أطوال النشر والوصلات (مم)</h2>
<div class="tw"><table><thead><tr><th>القطر</th><th>ld سفلي<br>25.4.2.4</th><th>ld علوي<br>ψt = 1.3</th><th>وصلة شد<br>صنف B</th><th>وصلة شد<br>علوي</th><th>وصلة انضغاط<br>25.5.5.1</th><th>ldh عكفة<br>داخل لب العمود</th><th>ldh عكفة<br>بلا تطويق</th><th>ldc انضغاط<br>25.4.9.2</th><th>قطر الثني<br>جدول 25.3.1</th><th>امتداد 90°<br>12db</th><th>كغم/م</th></tr></thead>
<tbody>${tr}</tbody></table></div>
<div class="note">الوصلة صنف B = 1.3·ld (25.5.2.1) — صنف A (1.0·ld) فقط إذا الحديد المنفَّذ ≥ ضعف المطلوب ونصف الأسياخ أو أقل موصولة بنفس المقطع. لا تراكب بالشد لأسياخ أكبر من Ø36 (25.5.1.1).</div>

<div class="grid">
<div class="box"><h2>الكانات والأتاري (جدول 25.3.2)</h2>
<table><thead><tr><th>القطر</th><th>قطر الثني</th><th>عكفة 135°</th><th>عكفة 90°</th></tr></thead><tbody>${ties}</tbody></table>
<div class="note">عكفة 135° زلزالية تنغرز باللب، وتتبادل جهتها من كانة لأخرى (25.7.1.6).</div></div>
<div class="box"><h2>الغطاء الخرساني (20.5.1.3.1)</h2>
<table><tbody>${cov}</tbody></table></div>

<div class="box"><h2>الجسور</h2><ul>
<li>أقل حديد: <span class="ltr">As ≥ ${asmin.toFixed(5)}·bw·d</span> (9.6.1.2)، وأقصاه بحيث εt ≥ 0.004 (9.3.3.1).</li>
<li>خلوص الأسياخ ≥ max(25 ، db ، 4/3 الركام) (25.2.1)، والطبقة الثانية فوقها مباشرة بمسافة ≥ 25 مم.</li>
<li>تباعد الأسياخ للتشقق ≤ <span class="ltr">${Math.floor(smax)} mm</span> بغطاء صافٍ 50 مم (24.3.2).</li>
<li>الكانات بالوسط ≤ d/2 (و d/4 إذا Vs كبير) (9.7.6.2.2)؛ وبالإطار الزلزالي المتوسط على 2h من الوجه: s ≤ min(d/4 ، 8db ، 24dt ، 300)، وأول كانة 50 مم (18.4.2.4).</li>
<li>¼ الحديد الموجب يدخل المسند 150 مم، وسيخان مستمران أعلى وأسفل (9.7.3.8 + 9.7.7.1). الموجب عند الوجه ≥ ⅓ السالب (18.4.2.2).</li>
<li>الوصلة السفلية فوق المساند والعلوية بالمنتصف. حديد جانبي إذا h > 900 مم (9.7.2.3).</li></ul></div>

<div class="box"><h2>الأعمدة</h2><ul>
<li>ρ بين 1% و8% (10.6.1.1) — فوق 4% تزدحم الوصلات. 4 أسياخ على الأقل (6 للدائري) (10.7.3.1).</li>
<li>خلوص ≥ max(40 ، 1.5db ، 4/3 الركام) (25.2.3).</li>
<li>أتاري Ø10 للأسياخ حتى Ø32، و Ø13 للأكبر (25.7.2.2)؛ تباعد ≤ min(16db ، 48dt ، أصغر بُعد) (25.7.2.1).</li>
<li>كل سيخ ركني وبديل مسنود بزاوية ≤ 135°، ولا سيخ حر أبعد من 150 مم صافي عن مسنود (25.7.2.3).</li>
<li>زلزالي متوسط: lo = max(ln/6 ، أكبر بُعد ، 450) و so ≤ min(8db ، 24dt ، b/2 ، 300) (18.4.3.3).</li>
<li>الوصلة فوق البلاطة بثني مائل ≤ 1:6، وإذا الإزاحة > 75 مم دولات منفصلة (10.7.4.1). الأتاري تستمر داخل العقدة.</li></ul></div>

<div class="box"><h2>البلاطات</h2><ul>
<li>أقل حديد انكماش وحرارة <span class="ltr">0.0018·b·h</span> لـ fy ≤ 420 (24.4.3.2).</li>
<li>تباعد الحديد الرئيسي ≤ min(2h ، 450) بالمقاطع الحرجة للبلاطات باتجاهين (8.7.2.2)، و ≤ min(3h ، 450) باتجاه واحد (7.7.2.3).</li>
<li>السقف العصبي: طبقة التغطية ≥ 0.0018 على سماكتها وتباعد ≤ min(5t ، 450) (9.8.1.6 + 24.4.3.3).</li>
<li>كراسي للحديد العلوي كل 1 م تقريباً، وتقوية حول الفتحات بطول ld بعد الزاوية.</li></ul></div>

<div class="box"><h2>الأساسات</h2><ul>
<li>غطاء 75 مم مع طبقة نظافة، والعمق فوق الحديد السفلي ≥ 150 مم (13.3.1.2).</li>
<li>أقل حديد 0.0018·b·h وتباعد ≤ min(3h ، 450).</li>
<li>إذا ld أطول من المسافة من وجه العمود للطرف ناقص الغطاء: اثنِ الأطراف 90° للأعلى.</li>
<li>الدولات تُربط بالشبكة السفلية ودفنها ≥ ldc (25.4.9.2).</li></ul></div>
</div>
<footer><span>من منصة التصميم الإنشائي — مركز حديد التسليح · القيم لـ f'c ${fc} / fy ${fy}</span><span>تحقّق دائماً من لوحات مشروعك وملاحظاتها</span></footer>
</div></body></html>`;
  };

  P.open = function (fc, fy) {
    const h = P.html(fc, fy);
    try {
      const url = URL.createObjectURL(new Blob([h], { type: 'text/html;charset=utf-8' }));
      const w = window.open(url, '_blank');
      if (!w) location.href = url;
    } catch (e) { const w = window.open('', '_blank'); if (w) { w.document.write(h); w.document.close(); } }
  };

  P.card = function () {
    const opt = (L, v) => L.map(x => `<option value="${x}"${x === v ? ' selected' : ''}>${x}</option>`).join('');
    return `<div class="card rp-card"><div class="rp-row"><div><b>🖨️ ملصق قواعد الحديد للطباعة</b>
      <div class="hint">جدول أطوال النشر والوصلات والعكفات والغطاء وقواعد الجسور والأعمدة والبلاطات — محسوب لخرسانتك وحديدك (A4).</div></div>
      <label>f'c <select id="rp_fc">${opt([21, 25, 28, 30, 32, 35, 40], 28)}</select> MPa</label>
      <label>fy <select id="rp_fy">${opt([280, 420, 520], 420)}</select> MPa</label>
      <button class="btn" id="rp_go">🖨️ افتح الملصق</button></div></div>`;
  };
  P.init = function () {
    const b = document.getElementById('rp_go');
    if (b) b.addEventListener('click', () => P.open(+document.getElementById('rp_fc').value, +document.getElementById('rp_fy').value));
  };
})();
if (typeof module !== 'undefined') module.exports = window.REBARPOSTER;
