/* ============================================================================
   fem3dpage.js — صفحة «التحليل الإنشائي المتطور»
   ستة تبويبات: النموذج · المجسّم · النتائج · الأساسات · المنهجية · التحقّق
   ========================================================================= */
(function (global) {
  'use strict';
  var F = global.FEM3D, U = global.FEM3DUI, M = global.FEM3DMODEL, VER = global.FEM3DVER;
  if (!F || !U || !M) return;
  var nf = F.nf, esc = F.esc, DIAG = U.DIAG;

  var VP = null, FR = null, FTS = null, COMBOS = null, SEL = -1;
  var DK = 'M33', SRC = 'env', SOLID = true, USCALE = 0;
  // وضع المصدر: 'manual' مدخلات حرّة · 'project' مشتقّ من معالج المشروع.
  // الصفحتان تتشاركان نفس البنية والمعرّفات، ولا تُركَّب إلا واحدة في كل وقت.
  var MODE = 'manual', PROJ = null;

  /** نتيجة معالج المشروع. معرَّفة في app.js بـ `let`، و`let` على مستوى
      السكربت الكلاسيكي **لا تصير خاصيّةً على window** بل تسكن البيئةَ
      المعجميّة العامّة — فـ `window.WZ` غير معرَّف بينما `WZ` المجرّدة تُحلّ
      عبر سلسلة النطاقات. و`typeof` قد ترمي داخل المنطقة الميتة قبل تنفيذ
      app.js، فيلزم الحارس. */
  function wiz() {
    try { return (typeof WZ !== 'undefined' && WZ) ? WZ : null; }
    catch (e) { return null; }
  }

  function $id(i) { return document.getElementById(i); }
  function num(i) { var e = $id(i); return e ? parseFloat(e.value) : 0; }
  function chk(i) { var e = $id(i); return !!(e && e.checked); }
  function sval(i) { var e = $id(i); return e ? e.value : ''; }

  function fld(l, id, v, st, u, mn) {
    return '<div><label>' + l + (u ? ' <span style="opacity:.6">(' + u + ')</span>' : '')
      + '</label><input type="number" id="' + id + '" value="' + v + '" step="' + (st || 1)
      + '"' + (mn !== undefined ? ' min="' + mn + '"' : '') + '></div>';
  }
  function cbx(l, id, on) {
    return '<label style="display:flex;gap:7px;align-items:center;cursor:pointer;margin:0;'
      + 'font-size:12px;color:var(--tx)"><input type="checkbox" id="' + id + '"'
      + (on ? ' checked' : '') + ' style="width:auto;margin:0">' + l + '</label>';
  }
  function kpi(t, v, tone) {
    return '<div class="card" style="padding:10px 12px"><div style="font-size:11px;color:var(--mut)">'
      + t + '</div><div style="font-size:16.5px;font-weight:700;margin-top:2px;color:'
      + (tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)'
        : tone === 'warn' ? 'var(--warn)' : '#fff') + '">' + v + '</div></div>';
  }
  /** قيمة مركّبة مثل «300×600 مم»: يجب تثبيتها LTR وإلا عكسها اتجاه الصفحة
      فقُرئت 600×300 — وهو خطأ يقرأه المهندس رقماً لا تنسيقاً. */
  function ltr(v) { return '<span dir="ltr" style="display:inline-block">' + v + '</span>'; }
  function tbl(head, rows, cls) {
    return '<div class="' + (cls || 'sc-wrap') + '"><table class="dt"><thead><tr>'
      + head.map(function (h) { return '<th>' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
  }

  /* ─────────────── المدخلات ─────────────── */
  function cfg() {
    if (MODE === 'project') {
      // البنية والأحمال من المعالج، وخيارات **التحليل** وحدها من المستخدم
      var b = global.FEM3DBRIDGE && global.FEM3DBRIDGE.fromWizard(wiz(), {
        cracked: chk('f_cr'), shear: chk('f_sh'), diaph: chk('f_di'),
        base: chk('f_pin') ? 'pin' : 'fix', rz: num('f_rz')
      });
      PROJ = b;
      if (!b) throw new Error('شغّل معالج المشروع أولاً ثم عُد لهذه الصفحة');
      return b.cfg;
    }
    var fc = num('f_fc') || 28;
    return {
      nx: Math.max(1, Math.min(8, Math.round(num('f_nx')))),
      ny: Math.max(1, Math.min(8, Math.round(num('f_ny')))),
      ns: Math.max(1, Math.min(15, Math.round(num('f_ns')))),
      sx: num('f_sx'), sy: num('f_sy'), hs: num('f_hs'),
      fc: fc, fy: num('f_fy') || 420, gamma: num('f_gam') || 24,
      ts: num('f_ts') / 1000, sdl: num('f_sdl'), ll: num('f_ll'),
      bb: num('f_bb') / 1000, bh: num('f_bh') / 1000,
      cb: num('f_cb') / 1000, ch: num('f_ch') / 1000,
      eqX: num('f_ex'), eqY: num('f_ey'), qa: num('f_qa') || 150,
      cracked: chk('f_cr'), shear: chk('f_sh'), diaph: chk('f_di'),
      base: chk('f_pin') ? 'pin' : 'fix',
      rz: Math.max(0, Math.min(1, num('f_rz')))
    };
  }

  /* نسخة الكود: المنصّة كلّها موحَّدة الآن على ACI 318-19 — التحليل والأساسات
     والمعالج والحاسبات المنفردة. ويبقى بيان **أثر** التوحيد ظاهراً، لأن من
     يقارن بنتيجةٍ قديمة يجب أن يعرف لماذا اختلفت. */
  function editionNote() {
    return '<div class="card" style="grid-column:1/-1;border-color:rgba(52,211,153,.4);'
      + 'background:rgba(52,211,153,.05)"><h3>نسخة الكود المعتمَدة</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.95;margin:0">'
      + 'المنصّة كلّها — هذا القسم ومعالج المشروع والحاسبات المنفردة — تعمل بـ '
      + '<b style="color:#34d399">ACI 318-19</b> خالصاً. لا خلط بين نسختين ولا '
      + '«الأصغر من الاثنتين».<br>'
      + 'وأثر التوحيد حقيقي لا اسميّ: نسخة 2019 أضافت معامل أثر الحجم '
      + '<b>λs = √(2/(1+d/250))</b> ونسبة التسليح <b>ρw</b> إلى صيغة القصّ للمقاطع '
      + 'بلا أساور (جدول 22.5.5.1 و§22.5.5.1.3)، فمقاومة قصّ الأساسات تنزل إلى نحو '
      + '<b>نصف</b> ما تعطيه 2014 — والأساسات تخرج أسمك تبعاً لذلك، هنا وفي '
      + 'المعالج معاً.<br>'
      + '<b style="color:#e6edf7">ولا يُعتمد أي رقم إلا بتدقيق مهندس مُجاز.</b>'
      + '</p></div>';
  }

  /* لوحة تبويب ① بوضع المشروع: بنيةٌ مقروءة من المعالج + خيارات التحليل. */
  function projPanel() {
    var ok = !!(wiz() && wiz().grid);
    return '<div class="grid g2">' + editionNote()
      + '<div class="card" style="grid-column:1/-1"><h3>مصدر النموذج — معالج المشروع</h3>'
      + (ok
        ? '<div id="f_psum" style="font-size:12.5px;color:var(--mut)">جارٍ القراءة…</div>'
        : '<p style="font-size:13px;color:var(--warn);line-height:1.9;margin:0 0 10px">'
          + '⚠️ لم يُشغَّل معالج المشروع بعد. هذه الصفحة تقرأ منه البنية والأحمال '
          + 'ولا تغيّر فيه شيئاً — شغّله أولاً ثم عُد.</p>'
          + '<button class="btn" onclick="FEM3D.page.viaWizard()" style="background:var(--acc);'
          + 'color:#04121f;font-weight:700;border:0;padding:8px 18px;border-radius:9px;'
          + 'cursor:pointer">↗ شغّل المعالج ثم عُد تلقائياً</button>')
      + '</div>'
      + '<div class="card"><h3>خيارات التحليل</h3>'
      + '<p style="font-size:12px;color:var(--mut);margin:0 0 10px;line-height:1.75">'
      + 'هذه خيارات <b>النمذجة</b> لا بيانات المشروع — البنية والمقاطع والأحمال '
      + 'تأتي من المعالج كما هي.</p>'
      + '<div class="bar">' + cbx('تشقّق ACI §6.6.3.1.1', 'f_cr', true)
      + cbx('تشوّه القصّ Timoshenko', 'f_sh', true) + '</div>'
      + '<div class="bar">' + cbx('ديافرام صلب', 'f_di', true)
      + cbx('قاعدة مفصلية', 'f_pin', false) + '</div>'
      + '<div class="f" style="margin-top:8px">'
      + fld('معامل المنطقة الصلبة', 'f_rz', 0, .1, '0 – 1', 0) + '</div>'
      + '<div class="bar" style="margin-top:4px">'
      + "<button onclick=\"FEM3D.page.rz(0)\">0</button>"
      + "<button onclick=\"FEM3D.page.rz(0.5)\">0.5</button>"
      + "<button onclick=\"FEM3D.page.rz(1)\">1.0</button></div>"
      + '<div class="bar" style="margin-top:12px">'
      + '<button onclick="FEM3D.page.run()" style="background:var(--acc);color:#04121f;'
      + 'font-weight:700;border:0;padding:9px 20px;border-radius:9px;cursor:pointer;'
      + 'font-size:13px">▶ حلّل المشروع</button>'
      + '<span id="f_stat" style="font-size:12px;color:var(--mut)"></span></div></div>'
      + '<div class="card" id="f_der" style="grid-column:1/-1"><h3>سلسلة اشتقاق الأحمال</h3>'
      + '<div style="color:var(--mut);font-size:12px">تظهر بعد الحلّ.</div></div>'
      + '<div class="card" id="f_cmp" style="grid-column:1/-1"><h3>مقارنة العزوم</h3>'
      + '<div style="color:var(--mut);font-size:12px">تظهر بعد الحلّ.</div></div>'
      + '</div>';
  }

  function html() {
    return '<div id="fem">'
      + '<div class="ft">'
      + '<button data-t="mdl" class="on">'
      + (MODE === 'project' ? '① المشروع وخيارات التحليل' : '① النموذج والأحمال') + '</button>'
      + '<button data-t="vw">② المجسّم والمخططات</button>'
      + '<button data-t="res">③ النتائج</button>'
      + '<button data-t="fnd">④ الأساسات</button>'
      + '<button data-t="prf">⑤ دليل الحسابات</button>'
      + '<button data-t="ver">⑥ التحقّق العلمي</button></div>'

      /* ① */
      + (MODE === 'project'
        ? '<div class="fp on" data-p="mdl">' + projPanel() + '</div>'
        : '<div class="fp on" data-p="mdl"><div class="grid g2">'
      + '<div class="card"><h3>الشبكة والطوابق</h3><div class="f">'
      + fld('بحور X', 'f_nx', 3, 1, '', 1) + fld('المسافة X', 'f_sx', 6.0, .25, 'م')
      + fld('بحور Y', 'f_ny', 2, 1, '', 1) + fld('المسافة Y', 'f_sy', 5.0, .25, 'م')
      + fld('الطوابق', 'f_ns', 3, 1, '', 1) + fld('ارتفاع الطابق', 'f_hs', 3.2, .1, 'م')
      + '</div><div class="bar">' + cbx('قاعدة مفصلية', 'f_pin', false)
      + cbx('ديافرام صلب', 'f_di', true) + '</div></div>'

      + '<div class="card"><h3>المواد والمقاطع</h3><div class="f">'
      + fld("f′c", 'f_fc', 28, 1, 'MPa', 15) + fld('fy', 'f_fy', 420, 20, 'MPa', 240)
      + fld('γ الخرسانة', 'f_gam', 24, .5, 'kN/m³')
      + '<div><label>Ec = 4700√f′c</label><input id="f_E" disabled value="—"></div>'
      + fld('جسر b', 'f_bb', 300, 25, 'مم') + fld('جسر h', 'f_bh', 600, 25, 'مم')
      + fld('عمود b', 'f_cb', 400, 25, 'مم') + fld('عمود h', 'f_ch', 400, 25, 'مم')
      + '</div><div class="bar">'
      + cbx('تشقّق ACI §6.6.3.1.1 (0.35 / 0.70)', 'f_cr', true)
      + cbx('تشوّه القصّ Timoshenko', 'f_sh', true) + '</div>'
      + '<div class="f" style="margin-top:8px">'
      + fld('معامل المنطقة الصلبة', 'f_rz', 0, .1, '0 – 1', 0) + '</div>'
      + '<div class="bar" style="margin-top:6px">'
      + '<span style="font-size:11.5px;color:var(--mut)">قيَم جاهزة</span>'
      + "<button onclick=\"FEM3D.page.rz(0)\">0 — افتراضي ETABS</button>"
      + "<button onclick=\"FEM3D.page.rz(0.5)\">0.5 — شائع بالتصميم</button>"
      + "<button onclick=\"FEM3D.page.rz(1)\">1.0 — صلب كامل</button></div>"
      + '<div style="font-size:11px;color:var(--mut);margin-top:6px;line-height:1.7">'
      + 'صفر = الصلابة تُحسب على المحاور (افتراضي ETABS) · 1.0 = المنطقة داخل الوصلة صلبة '
      + 'تماماً فيقصر البحر الفعّال وتزيد الصلابة الجانبية. '
      + 'وفي كل الأحوال تُقرأ قوى التصميم عند وجه الركيزة وفق ACI 318-19 §6.5.4.'
      + '</div></div>'

      + '<div class="card"><h3>الأحمال</h3><div class="f">'
      + fld('سماكة البلاطة', 'f_ts', 150, 10, 'مم')
      + fld('تشطيبات SDL', 'f_sdl', 2.5, .25, 'kN/m²')
      + fld('الحمل الحي', 'f_ll', 2.0, .25, 'kN/m²')
      + fld('قصّ القاعدة EQX', 'f_ex', 150, 10, 'kN')
      + fld('قصّ القاعدة EQY', 'f_ey', 0, 10, 'kN')
      + fld('تحمّل التربة', 'f_qa', 150, 10, 'kPa')
      + '</div><div class="bar" style="margin-top:12px">'
      + '<button onclick="FEM3D.page.run()" style="background:var(--acc);color:#04121f;'
      + 'font-weight:700;border:0;padding:9px 20px;border-radius:9px;cursor:pointer;font-size:13px">'
      + '▶ حلّل النموذج</button>'
      + '<span id="f_stat" style="font-size:12px;color:var(--mut)"></span></div></div>'

      + '<div class="card" id="f_der"><h3>سلسلة اشتقاق الأحمال</h3>'
      + '<div style="color:var(--mut);font-size:12px">تظهر بعد الحلّ — كل حمل يصل جسراً '
      + 'مع الخطوة التي أنتجته.</div></div>'
      + editionNote()
      + '</div></div>')

      /* ② */
      + '<div class="fp" data-p="vw">'
      + '<div class="bar" id="f_dbar"></div>'
      + '<div class="bar">'
      + '<span style="font-size:11.5px;color:var(--mut)">المصدر</span>'
      + '<select id="f_src" onchange="FEM3D.page.src(this.value)"></select>'
      + '<button id="f_sld" class="on" onclick="FEM3D.page.solid()">مقاطع مصمتة</button>'
      + '<button id="f_slb" class="on" onclick="FEM3D.page.tg(\'slab\',this)">بلاطات</button>'
      + '<button id="f_fnd" onclick="FEM3D.page.tg(\'found\',this)">الأساسات</button>'
      + '<span style="font-size:11.5px;color:var(--mut);margin-inline-start:8px">تكبير العرض</span>'
      + '<input type="range" id="f_zm" min="0.25" max="4" step="0.05" value="1" style="width:120px">'
      + '</div>'
      + '<div class="vp" id="f_vp">'
      + '<div class="hud" id="f_hud">جارٍ البناء…</div>'
      + '<div class="leg"><i style="background:#38bdf8"></i>موجب &nbsp;'
      + '<i style="background:#f87171"></i>سالب<br>'
      + '<span style="color:#f87171">1</span>·<span style="color:#34d399">2</span>·'
      + '<span style="color:#60a5fa">3</span> المحاور المحلّية</div></div>'
      + '<div id="f_pick" class="card" style="margin-top:12px"><h3>تفاصيل العنصر</h3>'
      + '<div style="color:var(--mut);font-size:12.5px">اضغط على أي جسر أو عمود '
      + 'لعرض محاوره وقواه وجدول محطّاته.</div></div></div>'

      /* ③ ④ ⑤ ⑥ */
      + '<div class="fp" data-p="res"><div id="f_res"></div></div>'
      + '<div class="fp" data-p="fnd"><div id="f_fndp"></div></div>'
      + '<div class="fp" data-p="prf"><div id="f_prf"></div></div>'
      + '<div class="fp" data-p="ver">'
      + '<div class="card" style="margin-bottom:13px"><h3>التحقّق المتبادل مع OpenSees</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.9;margin:0 0 10px">'
      + '<b>OpenSees</b> محرّك العناصر المحدّدة المفتوح المصدر من مركز <b>PEER</b> بجامعة '
      + 'كاليفورنيا – بيركلي، وهو المرجع المعتمَد في أبحاث الهندسة الزلزالية المحكَّمة. '
      + 'يُبنى هنا <b>نفس المنشأ</b> في المحرّكين — نفس العقد والمقاطع والأحمال والاستناد — '
      + 'ثم تُقارَن الإزاحات وقوى الأطراف وردود الأفعال حدّاً بحدّ. '
      + 'الحسابُ يجري على الخادم بـ OpenSeesPy لحظةَ الضغط، لا من نتائج مخزونة.</p>'
      + '<div class="bar"><button onclick="FEM3D.page.xcheck()" '
      + 'style="background:var(--acc);color:#04121f;font-weight:700;border:0;padding:8px 18px;'
      + 'border-radius:9px;cursor:pointer;font-size:12.5px">⟲ قارن مع OpenSees الآن</button>'
      + '<span id="f_xst" style="font-size:12px;color:var(--mut)"></span></div>'
      + '<div id="f_xout" style="margin-top:12px"></div></div>'
      + '<div id="f_ver"></div></div>'
      + '</div>';
  }

  function tab(t) {
    var b = document.querySelectorAll('#fem .ft button'), i;
    for (i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].dataset.t === t);
    var p = document.querySelectorAll('#fem .fp');
    for (i = 0; i < p.length; i++) p[i].classList.toggle('on', p[i].dataset.p === t);
    if (t === 'vw' && VP) setTimeout(function () { VP.fit(); }, 30);
  }

  /* ─────────────── المصدر: حالة · تركيب · غلاف ─────────────── */
  function srcList() {
    var o = '<option value="env">الغلاف — كل التراكيب</option>';
    COMBOS.forEach(function (c) { o += '<option value="C:' + esc(c.name) + '">تركيب: ' + esc(c.name) + '</option>'; });
    o += '<option value="C:' + esc(COMBOS.service.name) + '">تركيب: ' + esc(COMBOS.service.name) + '</option>';
    FR.cases.forEach(function (c) { o += '<option value="L:' + c + '">حالة: ' + c + '</option>'; });
    o += '<option value="def">الشكل المشوَّه (خدمة D+L)</option>';
    var e = $id('f_src'); if (e) { e.innerHTML = o; e.value = SRC; }
  }
  function comboByName(n) {
    for (var i = 0; i < COMBOS.length; i++) if (COMBOS[i].name === n) return COMBOS[i];
    return COMBOS.service;
  }
  /** محطّات العنصر حسب المصدر المختار — الغلاف يعطي القيمة الأكبر مطلقاً. */
  function stationsFor(k, ns) {
    ns = ns || 17;
    if (SRC === 'env') {
      var e = FR.envelope(k, ns, COMBOS);
      return e.map(function (s) {
        var o = { x: s.x };
        ['N', 'V2', 'V3', 'T', 'M22', 'M33'].forEach(function (q) {
          o[q] = Math.abs(s[q + 'max']) >= Math.abs(s[q + 'min']) ? s[q + 'max'] : s[q + 'min'];
          o[q + 'C'] = Math.abs(s[q + 'max']) >= Math.abs(s[q + 'min']) ? s[q + 'maxC'] : s[q + 'minC'];
        });
        return o;
      });
    }
    if (SRC.slice(0, 2) === 'C:') return FR.comboStations(k, ns, comboByName(SRC.slice(2)));
    if (SRC.slice(0, 2) === 'L:') return FR.stations(k, ns, SRC.slice(2));
    return FR.stations(k, ns, 'DEAD');
  }

  function dbar() {
    var h = '';
    for (var k in DIAG)
      h += '<button class="' + (k === DK ? 'on' : '') + '" onclick="FEM3D.page.diag(\'' + k
        + '\')">' + DIAG[k].nm + '</button>';
    // «اضغط على سهم العزوم» — اشتقاق كامل للعنصر الذي يحمل المخطط المعروض
    h += '<button onclick="FEM3D.page.momentDetails()">🧮 تفاصيل حساب هذا المخطط</button>';
    var e = $id('f_dbar'); if (e) e.innerHTML = h;
  }

  function draw() {
    if (!VP || !FR) return;
    var hud = $id('f_hud'), c = FR.meta.cfg, txt;
    var head = '<b>' + c.nx + '×' + c.ny + ' بحر · ' + c.ns + ' طابق</b> — '
      + FR.nodes.length + ' عقدة · ' + FR.members.length + ' عنصر · ' + FR.neq + ' DOF<br>';
    if (SRC === 'def') {
      VP.clearDiag();
      var r = VP.deformed(function (k) { return FR.shape(k, 15, 'DEAD'); },
        USCALE ? USCALE * (VP.R() * .05) : 0);
      VP.show('def', true); VP.show('diag', true);
      txt = head + '<b>الشكل المشوَّه — أقصى إزاحة ' + nf(r.max * 1000, 2) + ' مم</b>'
        + '<br><span class="sc">التكبير ×' + nf(r.scale || 0, 0) + '</span>';
    } else {
      VP.show('def', false); VP.show('diag', true);
      var D = DIAG[DK];
      var res = VP.diagram(DK, function (k) { return stationsFor(k, 17); },
        USCALE ? USCALE * (VP.R() * .09 / 1) * 0 : 0, true);
      var sc = res.perM ? nf(res.perM, 1) + ' ' + D.u + ' لكل متر على الشاشة' : '—';
      txt = head + '<b>' + D.nm + ' — الأقصى في المنشأ = ' + nf(res.max, 2) + ' ' + D.u + '</b>'
        + '<br><span class="sc">مقياس المخطط: ' + sc + '</span>'
        + '<br>المصدر: ' + (SRC === 'env' ? 'غلاف ' + COMBOS.length + ' تركيب'
            : SRC.slice(0, 2) === 'C:' ? 'تركيب ' + esc(SRC.slice(2)) : 'حالة ' + SRC.slice(2));
    }
    if (hud) hud.innerHTML = txt;
  }

  /* ─────────────── لوحة العنصر المختار ─────────────── */
  function pickHTML(k) {
    if (!FR || k < 0) return '';
    var m = FR.members[k], c = FR.cache[k];
    var st = stationsFor(k, 21), fc = null;
    try { fc = FR.faces(k, FR.cases[0]); } catch (e) {}
    var pk = {}, q;
    ['M33', 'M22', 'V2', 'V3', 'T', 'N'].forEach(function (Q) {
      var b = st[0];
      for (var i = 1; i < st.length; i++) if (Math.abs(st[i][Q]) > Math.abs(b[Q])) b = st[i];
      pk[Q] = b;
    });
    var d = FR.defl(k, 81, 'DEAD');
    // القيم عند وجه الركيزة بالغلاف
    var xi = m.offI, xj = c.L - m.offJ;
    function atFace(x) {
      var ns = 41, e = FR.envelope(k, ns, COMBOS), idx = Math.round(x / c.L * (ns - 1));
      var s = e[Math.max(0, Math.min(ns - 1, idx))];
      return Math.abs(s.M33max) >= Math.abs(s.M33min) ? s.M33max : s.M33min;
    }
    var rows = st.map(function (s) {
      return [nf(s.x, 3), nf(s.N, 1), nf(s.V2, 1), nf(s.V3, 1), nf(s.T, 2),
        nf(s.M22, 1), nf(s.M33, 1), s.M33C ? '<span style="color:var(--mut);font-size:10.5px">'
          + esc(s.M33C) + '</span>' : '—'];
    });
    return '<h3>' + esc(m.tag || ('#' + k)) + '</h3>'
      + '<div class="sel">' + (m.kind === 'col' ? 'عمود' : 'جسر') + ' · مقطع '
      + ltr(Math.round(m.b * 1000) + '×' + Math.round(m.h * 1000)) + ' مم · الطول '
      + nf(c.L, 3) + ' م · البحر الصافي ' + nf(xj - xi, 3) + ' م · '
      + 'Φ₂ = ' + nf(c.phi2, 4) + ' (تشوّه القصّ) · معامل التشقّق ' + nf(m.mod, 2) + '</div>'
      + '<div class="grid g4" style="margin-bottom:11px">'
      + kpi('أقصى M₃₃', nf(pk.M33.M33, 1) + ' kN·m', 'ok')
      + kpi('M₃₃ عند وجه الركيزة', nf(atFace(xi), 1) + ' kN·m', 'warn')
      + kpi('أقصى V₂', nf(pk.V2.V2, 1) + ' kN')
      + kpi('أقصى M₂₂', nf(pk.M22.M22, 1) + ' kN·m')
      + kpi('الالتواء T', nf(pk.T.T, 2) + ' kN·m')
      + kpi('المحوري N', nf(pk.N.N, 1) + ' kN', pk.N.N < 0 ? 'warn' : '')
      + kpi('الترخيم (D+L خدمة)', nf(d.max * 1000, 2) + ' مم')
      + kpi('L / Δ', d.ratio === Infinity ? '∞' : nf(d.ratio, 0),
          d.ratio >= 240 ? 'ok' : 'bad')
      + '</div>'
      + '<h3 style="margin-top:4px">جدول محطّات العنصر — '
      + (SRC === 'env' ? 'غلاف التراكيب' : esc(SRC.slice(2))) + '</h3>'
      + tbl(['x (م)', 'N (kN)', 'V₂ (kN)', 'V₃ (kN)', 'T (kN·m)', 'M₂₂ (kN·m)',
             'M₃₃ (kN·m)', 'التركيب الحاكم'], rows)
      + '<div class="bar"><button onclick="FEM3D.page.goProof()">📖 إثبات حساب هذا العنصر</button>'
      + '<button onclick="FEM3D.page.details(' + k + ')">🧮 إظهار التفاصيل الكاملة '
      + (m.kind === 'col' ? 'لتصميم هذا العمود' : 'لتصميم هذا الجسر') + '</button></div>'
      + '<div id="f_cd" hidden style="margin-top:12px"></div>';
  }

  /* ─────────────── النتائج ─────────────── */
  function resHTML() {
    if (!FR) return '';
    var beams = [], cols = [], k;
    for (k = 0; k < FR.members.length; k++) {
      var m = FR.members[k], e = FR.envelope(k, 17, COMBOS);
      var M = 0, V = 0, N = 0, Tq = 0, cN = '', cM = '';
      e.forEach(function (s) {
        if (Math.abs(s.M33max) > Math.abs(M)) { M = s.M33max; cM = s.M33maxC; }
        if (Math.abs(s.M33min) > Math.abs(M)) { M = s.M33min; cM = s.M33minC; }
        if (Math.abs(s.V2max) > Math.abs(V)) V = s.V2max;
        if (Math.abs(s.V2min) > Math.abs(V)) V = s.V2min;
        if (Math.abs(s.Nmin) > Math.abs(N)) { N = s.Nmin; cN = s.NminC; }
        if (Math.abs(s.Tmax) > Math.abs(Tq)) Tq = s.Tmax;
      });
      var d = FR.defl(k, 61, 'DEAD');
      (m.kind === 'col' ? cols : beams).push({ k: k, m: m, M: M, V: V, N: N, T: Tq,
        d: d, cM: cM, cN: cN });
    }
    beams.sort(function (a, b) { return Math.abs(b.M) - Math.abs(a.M); });
    cols.sort(function (a, b) { return Math.abs(b.N) - Math.abs(a.N); });

    /* اتزان كل حالة */
    var eqRows = [];
    FR.cases.forEach(function (cs) {
      var e = VER ? VER.equilibrium(FR, cs) : [];
      e.forEach(function (x) {
        if (Math.abs(x.load) < 1e-6 && Math.abs(x.reac) < 1e-6) return;
        eqRows.push([cs, x.axis, nf(x.load, 3), nf(x.reac, 3), x.err.toExponential(2),
          x.err < 1e-9 ? '<span class="ok">✓ متّزن</span>' : '<span class="bad">✗</span>']);
      });
    });

    /* انحراف الطوابق */
    var drRows = [], H = FR.meta.cfg.hs;
    ['EQX', 'EQY'].forEach(function (cs) {
      if (FR.cases.indexOf(cs) < 0) return;
      var prev = 0, ax = cs === 'EQY' ? 1 : 0;
      FR.meta.story.forEach(function (s, i) {
        var dd = FR.nodeDisp(s.nodes[0], cs)[ax];
        var dr = Math.abs(dd - prev) / H;
        drRows.push([cs, s.name, nf(dd * 1000, 2), nf((dd - prev) * 1000, 2),
          nf(dr * 100, 4) + '%',
          dr <= 0.02 ? '<span class="ok">✓ ≤ 2%</span>' : '<span class="bad">✗ > 2%</span>']);
        prev = dd;
      });
    });

    var bm = beams[0] || { M: 0 }, cm = cols[0] || { N: 0 };
    var worst = beams.reduce(function (a, b) { return b.d.ratio < a.d.ratio ? b : a; }, beams[0]);
    return '<div class="grid g4" style="margin-bottom:13px">'
      + kpi('أقصى M₃₃ بالجسور', nf(Math.abs(bm.M), 1) + ' kN·m', 'ok')
      + kpi('أقصى محوري بعمود', nf(Math.abs(cm.N), 1) + ' kN')
      + kpi('درجات الحرية', FR.neq)
      + kpi('زمن الحلّ', nf(FR.ms, 0) + ' ms', 'ok')
      + kpi('التحليل', nf(FR.msFac, 0) + ' ms')
      + kpi('حالات × تراكيب', FR.cases.length + ' × ' + COMBOS.length)
      + kpi('أسوأ ترخيم L/Δ', worst ? nf(worst.d.ratio, 0) : '—',
          worst && worst.d.ratio >= 240 ? 'ok' : 'bad')
      + kpi('حجم الخرسانة', nf(concVol(), 1) + ' م³')
      + '</div>'
      + '<div class="card" style="margin-bottom:13px"><h3>فحص الاتزان العام لكل حالة حمل</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);margin:0 0 9px">مجموع ردود الأفعال يساوي '
      + 'مجموع الأحمال المسلَّطة. النسبة تُقاس إلى أكبر حمل في النموذج.</p>'
      + tbl(['الحالة', 'المحور', 'الحمل (kN)', 'رد الفعل (kN)', 'الخطأ النسبي', 'الحكم'], eqRows)
      + '</div>'
      + '<div class="grid g2">'
      + '<div class="card"><h3>الجسور — غلاف التراكيب</h3>'
      + tbl(['العنصر', 'M₃₃ (kN·m)', 'التركيب', 'V₂ (kN)', 'T (kN·m)', 'Δ (مم)', 'L/Δ'],
          beams.slice(0, 14).map(function (b) {
            return ['<a href="#" onclick="FEM3D.page.pick(' + b.k + ');return false" '
              + 'style="color:var(--acc)">' + esc(b.m.tag) + '</a>',
              nf(b.M, 1), '<span style="font-size:10.5px;color:var(--mut)">' + esc(b.cM) + '</span>',
              nf(b.V, 1), nf(b.T, 2), nf(b.d.max * 1000, 2),
              b.d.ratio >= 240 ? '<span class="ok">' + nf(b.d.ratio, 0) + '</span>'
                               : '<span class="bad">' + nf(b.d.ratio, 0) + '</span>'];
          })) + '</div>'
      + '<div class="card"><h3>الأعمدة — غلاف التراكيب</h3>'
      + tbl(['العنصر', 'N (kN)', 'التركيب', 'M₃₃ (kN·m)', 'V₂ (kN)'],
          cols.slice(0, 14).map(function (b) {
            return ['<a href="#" onclick="FEM3D.page.pick(' + b.k + ');return false" '
              + 'style="color:var(--acc)">' + esc(b.m.tag) + '</a>',
              nf(b.N, 1), '<span style="font-size:10.5px;color:var(--mut)">' + esc(b.cN) + '</span>',
              nf(b.M, 1), nf(b.V, 1)];
          })) + '</div>'
      + (drRows.length ? '<div class="card"><h3>انحراف الطوابق — ASCE 7 §12.12.1</h3>'
          + tbl(['الحالة', 'الطابق', 'الإزاحة (مم)', 'الانحراف (مم)', 'Δ/h', 'الحكم'], drRows)
          + '<div style="font-size:11.5px;color:var(--mut);margin-top:8px">الحدّ 2% من ارتفاع '
          + 'الطابق (ASCE 7-16 جدول 12.12-1، منشآت الفئة I و II).</div></div>' : '')
      + '<div class="card"><h3>القوى الجانبية بالطوابق</h3>'
      + tbl(['الطابق', 'المنسوب (م)', 'FX (kN)', 'FY (kN)'],
          FR.meta.story.map(function (s) {
            return [s.name, nf(s.z, 2), nf(s.FX || 0, 1), nf(s.FY || 0, 1)]; }))
      + '<div style="font-size:11.5px;color:var(--mut);margin-top:8px">التوزيع على الطوابق '
      + 'بنسبة المنسوب وفق ASCE 7 §12.8.3 بمعامل k = 1.</div></div>'
      + '</div>';
  }

  function concVol() {
    var v = 0;
    for (var k = 0; k < FR.members.length; k++) v += FR.members[k].A * FR.cache[k].L;
    return v;
  }

  /* ─────────────── الأساسات ─────────────── */
  function fndHTML() {
    if (!FTS) return '<div class="card">لم تُحسب بعد.</div>';
    var c = FR.meta.cfg;
    var rows = FTS.map(function (d, i) {
      return [esc(d.name),
        d.pos === 'corner' ? 'ركني' : d.pos === 'edge' ? 'طرفي' : 'داخلي',
        nf(d.Ps, 0), nf(d.Pu, 0),
        '<span style="font-size:10.5px;color:var(--mut)">' + esc(d.combo) + '</span>',
        ltr(nf(d.B, 2) + ' × ' + nf(d.B, 2)), d.h + ' مم',
        ltr(nf(d.qAct, 1) + ' / ' + nf(c.qa, 0)),
        ltr(d.nBar + 'Ø' + d.db + ' @ ' + d.spac),
        d.ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>',
        '<button class="lnk" onclick="FEM3D.page.fndDetails(' + i + ')">🧮 التفاصيل</button>'];
    });
    var tot = FTS.reduce(function (a, d) { return a + d.vol; }, 0);
    var st = FTS[0].steps;
    return '<div class="grid g4" style="margin-bottom:13px">'
      + kpi('عدد الأساسات', FTS.length)
      + kpi('أكبر أساس', nf(Math.max.apply(null, FTS.map(function (d) { return d.B; })), 2) + ' م')
      + kpi('خرسانة الأساسات', nf(tot, 1) + ' م³')
      + kpi('كلها تمرّ', FTS.every(function (d) { return d.ok; }) ? '✓ نعم' : '✗ راجع',
          FTS.every(function (d) { return d.ok; }) ? 'ok' : 'bad')
      + '</div>'
      + '<div class="card" style="margin-bottom:13px"><h3>جدول الأساسات المنفردة</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);margin:0 0 9px">كل أساس مصمَّم من '
      + '<b>رد الفعل المحسوب فعلاً</b> عند عموده، لا من تقدير. حمل الخدمة لضغط التربة '
      + 'والحمل المُعامَل للقصّ والانحناء.</p>'
      + tbl(['العمود', 'الموقع', 'P خدمة (kN)', 'P مُعامَل (kN)', 'التركيب الحاكم',
             'الأبعاد (م)', 'السماكة', 'q / q_مسموح (kPa)', 'التسليح', 'الحكم',
             'الاشتقاق'], rows)
      + '</div>'
      // خارج بطاقة الجدول عمداً: الجدول عريض ويمدّ بطاقته، فلو وُضع الاشتقاق
      // داخلها لخرج نصفه عن الشاشة بصفحةٍ من اليمين لليسار.
      + '<div id="f_fcd" hidden style="margin-bottom:13px"></div>'
      + '<div class="card"><h3>خطوات تصميم الأساس — مثال: ' + esc(FTS[0].name) + '</h3>'
      + tbl(['#', 'الخطوة', 'المعادلة والأرقام', 'النتيجة', 'المرجع'],
          st.map(function (s) {
            return [s[0], '<b>' + esc(s[1]) + '</b>',
              '<span dir="ltr" style="display:inline-block;font-family:ui-monospace,monospace;'
              + 'font-size:11px;color:#7dd3fc;text-align:left">' + esc(s[2]) + '</span>',
              '<b>' + esc(s[3]) + '</b>',
              '<span style="font-size:11px;color:var(--mut)">' + esc(s[4]) + '</span>'];
          }), '') + '</div>';
  }

  /* ══════════ التفاصيل الكاملة للحساب — مصدرها calcdoc.py وحده ══════════

     الضغطة على عمود أو جسر أو أساس تفتح «الاشتقاق»: المعادلة الرمزية، ثم
     التعويض بالأرقام، ثم رقم البند ونصّ ما يفرضه. والحساب لا يُعاد هنا
     بالجافاسكربت — يُطلب من الخادم من الملف نفسه الذي يخدم المعالج، فلا
     نسختان تتباعدان. */

  /** متوسّط الحمل الموزّع على العنصر في حالةٍ ما (kN/م). */
  function avgW(k, cs) {
    var segs = (FR.wloc && FR.wloc[cs] && FR.wloc[cs][k]) || [], s = 0, i;
    var L = FR.cache[k].L;
    for (i = 0; i < segs.length; i++) {
      var g = segs[i];
      s += (Math.abs(g.w2a || 0) + Math.abs(g.w2b || 0)) / 2 * (g.b - g.a);
    }
    return L > 0 ? s / L : 0;
  }

  /** تسليح العمود: من المعالج إن كان المقطع نفسه، وإلّا من الحدّ الأدنى. */
  function colRebar(m) {
    var W = wiz(), b = m.b * 1000, h = m.h * 1000;
    if (W && W.model && W.model.col && W.model.col.rebar
        && Math.round(W.model.col.b) === Math.round(b)
        && Math.round(W.model.col.h) === Math.round(h)) {
      var q = W.model.col.rebar;
      return { db: q.db, n: q.n, Ast: q.Ast, tie_db: q.tie_db, s_mid: q.tie_s,
               s_conf: q.tie_s_conf, cover: q.cover, phiPn: q.phiPn_max,
               phiMn: q.phiMn,
               src: 'تسليح العمود من معالج المشروع (نفس المقطع)' };
    }
    // لا يصمّم هذا القسم حديد الأعمدة، فيُعرض الاشتقاق على الحدّ الأدنى
    // ρ = 1% (ACI 318-19 §10.6.1.1) وحدودِ التباعد — ويُقال ذلك صراحةً.
    var db = 16, Ab = Math.PI * db * db / 4, dbt = 10;
    var n = Math.max(4, Math.ceil(0.01 * b * h / Ab / 4) * 4);
    var sm = Math.floor(Math.min(16 * db, 48 * dbt, Math.min(b, h)) / 25) * 25;
    var hx = Math.max(b, h) - 2 * 40 - dbt;
    var so = Math.max(100, Math.min(150, 100 + (350 - hx) / 3));
    var sc = Math.floor(Math.min(b / 4, h / 4, 6 * db, so) / 5) * 5;
    return { db: db, n: n, Ast: n * Ab, tie_db: dbt, s_mid: sm, s_conf: sc,
             cover: 40,
             src: 'هذا القسم يحلّل ولا يصمّم حديد الأعمدة — فالاشتقاق معروض على '
                  + 'الحدّ الأدنى ρ = 1٪ وحدودِ التباعد الكودية' };
  }

  /** حزمة الطلبات التي تُرسَل إلى /api/calcdoc لعنصرٍ مختار. */
  function memberPayloads(k) {
    var m = FR.members[k], c = FR.cache[k], cf = FR.meta.cfg;
    var fc = cf.fc, fy = cf.fy || 420, out = [];
    var ln = Math.max(0.1, c.L - m.offI - m.offJ);
    if (m.kind === 'col') {
      var rb = colRebar(m), N = 0, e = FR.envelope(k, 17, COMBOS), Mx = 0;
      e.forEach(function (s) {
        if (Math.abs(s.Nmin) > Math.abs(N)) N = s.Nmin;
        if (Math.abs(s.M33max) > Math.abs(Mx)) Mx = s.M33max;
        if (Math.abs(s.M33min) > Math.abs(Mx)) Mx = s.M33min;
      });
      out.push({ what: 'col_long', b: m.b * 1000, h: m.h * 1000, db: rb.db,
                 n_bars: rb.n, Ast: rb.Ast, fc: fc, fy: fy, cover: rb.cover,
                 db_tie: rb.tie_db, Pu: Math.abs(N), Mu: Math.abs(Mx),
                 phiPn: rb.phiPn, phiMn: rb.phiMn });
      out.push({ what: 'col_ties', H: c.L, b: m.b * 1000, h: m.h * 1000,
                 db_long: rb.db, db_tie: rb.tie_db, s_mid: rb.s_mid,
                 s_conf: rb.s_conf, ln: ln });
      out.note = rb.src;
      return out;
    }
    // جسر: من الحمل إلى العزم، ثم من العزم إلى عدد الأسياخ
    var wu = 1.2 * avgW(k, 'DEAD') + 1.6 * avgW(k, 'LIVE');
    var nsp = m.dir === 'y' ? cf.ny : cf.nx;
    var kind = (nsp > 1 && (m.gi === 0 || m.gi === nsp - 1)) ? 'end_int' : 'interior';
    var ns = 41, env = FR.envelope(k, ns, COMBOS);
    var idx = Math.round(m.offI / c.L * (ns - 1));
    var sf = env[Math.max(0, Math.min(ns - 1, idx))];
    var Mface = Math.abs(sf.M33max) >= Math.abs(sf.M33min) ? sf.M33max : sf.M33min;
    var Mmid = 0, Vmx = 0;
    env.forEach(function (s) {
      if (Math.abs(s.M33max) > Math.abs(Mmid)) Mmid = s.M33max;
      if (Math.abs(s.M33min) > Math.abs(Mmid)) Mmid = s.M33min;
      if (Math.abs(s.V2max) > Math.abs(Vmx)) Vmx = s.V2max;
      if (Math.abs(s.V2min) > Math.abs(Vmx)) Vmx = s.V2min;
    });
    var Mu = Math.max(Math.abs(Mface), Math.abs(Mmid));
    var dEff = m.h * 1000 - 40 - 10 - 8;
    out.push({ what: 'beam_moment', w: wu, L: c.L, ln: ln, kind: kind,
               M: Mface, V: Vmx });
    out.push({ what: 'beam_steel', b: m.b * 1000, h: m.h * 1000, d: dEff,
               Mu: Mu, fc: fc, fy: fy, cover: 40, db: 16, db_stir: 10 });
    out.note = 'العزم من تحليل الإطار الفراغي · الحمل من توزيع البلاطة بخطوط 45°';
    return out;
  }

  /** حزمة طلبات أساسٍ واحد من جدول الأساسات. */
  function fndPayloads(i) {
    var d = FTS[i], c = FR.meta.cfg;
    return [
      { what: 'footing', Ps: d.Ps, Pu: d.Pu, B: d.B, h: d.h, d: d.d,
        c1: c.cb * 1000, c2: c.ch * 1000, fc: c.fc, fy: c.fy || 420,
        qa: c.qa, q_net: d.qNet || c.qa, cover: 75, db: d.db,
        s_exec: d.spac, Mux: 0, Muy: 0 },
      { what: 'bars', L: d.B, s: d.spac / 1000, cover: 0.075,
        label: 'الأساس ' + (d.name || ''), db: d.db }
    ];
  }

  /** يفتح لوحة التفاصيل ويملؤها من الخادم. */
  function showDetails(el, payloads, summary, note) {
    if (!el) return;
    if (!global.CALCDOC) {
      el.innerHTML = '<div class="note" style="color:var(--bad)">وحدة التفاصيل '
        + 'غير محمَّلة (calcdoc.js).</div>';
      return;
    }
    el.hidden = false;
    global.CALCDOC.into(el, payloads,
      { noHead: false, summary: summary || [], note: note || '' });
  }

  /* ─────────────── دليل الحسابات ─────────────── */
  function matTable(k, n, lab) {
    var h = '<div class="mt"><table><thead><tr><th></th>', r, c2;
    for (c2 = 0; c2 < n; c2++) h += '<th>' + lab[c2] + '</th>';
    h += '</tr></thead><tbody>';
    for (r = 0; r < n; r++) {
      h += '<tr><th>' + lab[r] + '</th>';
      for (c2 = 0; c2 < n; c2++) {
        var v = k[r * n + c2], cl = Math.abs(v) < 1e-9 ? 'z' : (v > 0 ? 'p' : 'n');
        h += '<td class="' + cl + '">' + (Math.abs(v) < 1e-9 ? '0' : v.toExponential(2)) + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }
  var DOFL = ['u₁', 'v₂', 'w₃', 'θ₁', 'θ₂', 'θ₃'];
  function dofLab() {
    return DOFL.map(function (s) { return s + 'ᵢ'; })
      .concat(DOFL.map(function (s) { return s + 'ⱼ'; }));
  }

  function proofHTML(k) {
    if (!FR || k < 0) return '<div class="card">اختر عنصراً من المجسّم أو من جداول النتائج.</div>';
    var m = FR.members[k], c = FR.cache[k], L = c.L, R = c.R, cs = FR.cases[0];
    var q = FR.mf[cs][k], u = FR.mu[cs][k].l, segs = FR.wloc[cs][k];
    var E = m.E, G = m.G, H = [];
    var xm = L / 2, sMid = FR.at(k, xm, cs);
    var pk = FR.peak(k, 'M33', cs);

    H.push('<div class="sel">📐 <b>' + esc(m.tag || ('#' + k)) + '</b> — '
      + (m.kind === 'col' ? 'عمود' : 'جسر') + ' · مقطع '
      + ltr(Math.round(m.b * 1000) + '×' + Math.round(m.h * 1000))
      + ' مم · L = ' + nf(L, 3) + ' م · العقدتان ' + m.i + ' و ' + m.j
      + ' · الحالة المعروضة: <b>' + cs + '</b></div>');

    H.push('<div class="stp"><h4>الخطوة ١ — خواصّ المقطع والمادة</h4>'
      + '<p>معامل المرونة من <b>ACI 318-19 §19.2.2.1</b>. مساحة القصّ الفعّالة κ·A و κ = 5/6 '
      + 'للمقطع المستطيل (<b>Cowper 1966</b>) — وهي ما يضعه ETABS افتراضياً.</p>'
      + '<div class="eq">'
      + 'E&nbsp;&nbsp; = 4700·√f′c = ' + nf(E / 1000, 0) + ' MPa<br>'
      + 'G&nbsp;&nbsp; = E/[2(1+ν)] = ' + nf(G / 1000, 0) + ' MPa&nbsp;&nbsp;(ν = 0.20)<br>'
      + 'A&nbsp;&nbsp; = ' + nf(m.A, 5) + ' m²&nbsp;&nbsp;·&nbsp;&nbsp;As2 = As3 = (5/6)A = '
        + nf(m.As2, 5) + ' m²<br>'
      + 'I33 = ' + m.I33.toExponential(5) + ' m⁴ (× ' + nf(m.mod, 2) + ' تشقّق)<br>'
      + 'I22 = ' + m.I22.toExponential(5) + ' m⁴&nbsp;&nbsp;·&nbsp;&nbsp;J = '
        + m.J.toExponential(5) + ' m⁴</div>'
      + (m.mod !== 1 ? '<p class="wr">⚠️ معامل التشقّق <b>' + nf(m.mod, 2) + '</b> وفق '
        + '<b>ACI 318-19 جدول 6.6.3.1.1(a)</b> — ' + (m.kind === 'col' ? '0.70·Ig للأعمدة'
        : '0.35·Ig للجسور') + '، وهو خيار Property Modifiers في ETABS.</p>' : '')
      + '</div>');

    H.push('<div class="stp"><h4>الخطوة ٢ — تشوّه القصّ (Timoshenko)</h4>'
      + '<p>الحدّ Φ يقيس نسبة مرونة القصّ إلى مرونة الانحناء. إهماله يجعل العنصر '
      + 'أصلب من الحقيقة، والفرق يكبر كلما قصُر البحر وزاد العمق.</p>'
      + '<div class="eq">'
      + 'Φ₂ = 12·E·I33/(G·As2·L²) = ' + nf(c.phi2, 6) + '<br>'
      + 'Φ₃ = 12·E·I22/(G·As3·L²) = ' + nf(c.phi3, 6) + '<br><br>'
      + 'k11 = 12EI/(L³(1+Φ))&nbsp;&nbsp;·&nbsp;&nbsp;k22 = (4+Φ)EI/(L(1+Φ))<br>'
      + 'k24 = (2−Φ)EI/(L(1+Φ))&nbsp;&nbsp;→ عند Φ = 0 تعود 4EI/L و 2EI/L</div>'
      + '<p>' + (c.phi2 > 1e-6
        ? 'الصلابة الانحنائية هنا أقلّ بـ <b>' + nf(c.phi2 / (1 + c.phi2) * 100, 2)
          + '%</b> عمّا تعطيه نظرية Euler–Bernoulli. المرجع: <b>Przemieniecki §5.6</b>.'
        : 'تشوّه القصّ مُعطَّل في هذا النموذج (Euler–Bernoulli).') + '</p></div>');

    H.push('<div class="stp"><h4>الخطوة ٣ — المحاور المحلّية [R]</h4>'
      + '<p>المحور 1 على طول العنصر · المحور 2 «إلى فوق» للجسر (أو نحو +X للعمود) · '
      + 'والمحور 3 عمودي عليهما — اصطلاح ETABS، ولذلك يكون M₃₃ العزم الرئيسي.</p>'
      + '<div class="eq"><span dir="ltr">'
      + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⎡ ' + nf(R[0][0], 4) + '&nbsp; ' + nf(R[0][1], 4)
      + '&nbsp; ' + nf(R[0][2], 4) + ' ⎤ ← axis 1<br>'
      + '[R] = ⎢ ' + nf(R[1][0], 4) + '&nbsp; ' + nf(R[1][1], 4) + '&nbsp; ' + nf(R[1][2], 4)
      + ' ⎥ ← axis 2<br>'
      + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⎣ ' + nf(R[2][0], 4) + '&nbsp; ' + nf(R[2][1], 4)
      + '&nbsp; ' + nf(R[2][2], 4) + ' ⎦ ← axis 3<br><br>'
      + '[T]12x12 = diag( [R], [R], [R], [R] )</span></div></div>');

    H.push('<div class="stp"><h4>الخطوة ٤ — مصفوفة الصلابة [k]₁₂ₓ₁₂ بالنظام المحلّي</h4>'
      + '<div class="eq">'
      + 'EA/L&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = ' + (E * m.A / L).toExponential(4) + ' kN/m<br>'
      + 'GJ/L&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = ' + (G * m.J / L).toExponential(4) + ' kN·m/rad<br>'
      + '12EI33/L³(1+Φ) = ' + (12 * E * m.I33 / (L * L * L * (1 + c.phi2))).toExponential(4) + ' kN/m<br>'
      + '(4+Φ)EI33/L(1+Φ) = ' + ((4 + c.phi2) * E * m.I33 / (L * (1 + c.phi2))).toExponential(4)
      + ' kN·m/rad</div>'
      + matTable(c.klFlex, 12, dofLab())
      + '<p style="margin-top:7px">ثم: <b>[k]<sub>عقدي</sub> = [Tr]ᵀ[k][Tr]</b> (الإزاحة الصلبة) '
      + 'ثم <b>[k]<sub>عام</sub> = [T]ᵀ[k]<sub>عقدي</sub>[T]</b>.</p></div>');

    H.push('<div class="stp"><h4>الخطوة ٥ — النظام العام وحلّه</h4>'
      + '<div class="eq">{F} = [K]{u}&nbsp;&nbsp;⟹&nbsp;&nbsp;[K] = [L][D][L]ᵀ<br><br>'
      + 'درجات الحرية n&nbsp;&nbsp;= ' + FR.neq + '<br>'
      + 'عرض النطاق bw&nbsp;&nbsp;= ' + FR.bw + '<br>'
      + 'عدد العناصر&nbsp;&nbsp;&nbsp;&nbsp;= ' + FR.members.length + '<br>'
      + 'حالات الأحمال&nbsp;&nbsp;= ' + FR.cases.length + ' (' + FR.cases.join(', ') + ')<br>'
      + 'زمن التجميع&nbsp;&nbsp;&nbsp;&nbsp;= ' + nf(FR.msAsm, 1) + ' ms<br>'
      + 'زمن التحليل&nbsp;&nbsp;&nbsp;&nbsp;= ' + nf(FR.msFac, 1) + ' ms&nbsp;&nbsp;(مرّة واحدة)<br>'
      + 'زمن حلّ الحالات = ' + nf(FR.msSub, 1) + ' ms&nbsp;&nbsp;(استبدال خلفي)</div>'
      + '<p>المصفوفة تُحلَّل <b>مرّة واحدة</b> ثم تُحلّ كل حالة حمل باستبدال أمامي فخلفي — '
      + 'وهذا ما يجعل عشر حالات تكلّف زمن حالة واحدة تقريباً. '
      + 'المرجع: <b>Bathe §8.2.2</b>.</p></div>');

    var uh = '<div class="eq">{u}<sub>محلي</sub>ᵀ = [ ';
    for (var i = 0; i < 12; i++)
      uh += (i === 6 ? '<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' : '')
        + u[i].toExponential(3) + (i < 11 ? ', ' : '');
    H.push('<div class="stp"><h4>الخطوة ٦ — إزاحات طرفَي العنصر</h4>'
      + '<p><b>{u}<sub>محلي</sub> = [T]·{u}<sub>عام</sub></b> بالمتر والراديان.</p>'
      + uh + ' ]</div></div>');

    var segTxt = segs.length ? segs.map(function (s) {
      return 'من ' + nf(s.a, 3) + ' إلى ' + nf(s.b, 3) + ' م: w₂ من ' + nf(s.w2a || 0, 3)
        + ' إلى ' + nf(s.w2b || 0, 3) + ' kN/m'
        + ((s.w1a || s.w1b) ? ' · محوري w₁ ' + nf(s.w1a || 0, 3) : '');
    }).join('<br>') : 'لا حمل موزّع';
    H.push('<div class="stp"><h4>الخطوة ٧ — الحمل الموزّع وأحمال التثبيت {q₀}</h4>'
      + '<p>الحمل ممثَّل بمقاطع خطّية (منتظم أو مثلثي أو شبه منحرف)، و{q₀} محسوب '
      + 'بـ <b>متّجه الحمل المتوافق</b> {q₀}ₐ = −∫w(x)·Nₐ(x)dx بتكامل Gauss بأربع نقاط '
      + '— مضبوط لأي حمل خطّي.</p>'
      + '<div class="eq">' + segTxt + '</div>'
      + '<div class="eq">'
      + 'الطرف i:&nbsp; N = ' + nf(q[0], 2) + '&nbsp; V₂ = ' + nf(q[1], 2)
      + '&nbsp; V₃ = ' + nf(q[2], 2) + '&nbsp; T = ' + nf(q[3], 2)
      + '&nbsp; M₂₂ = ' + nf(q[4], 2) + '&nbsp; M₃₃ = ' + nf(q[5], 2) + '<br>'
      + 'الطرف j:&nbsp; N = ' + nf(q[6], 2) + '&nbsp; V₂ = ' + nf(q[7], 2)
      + '&nbsp; V₃ = ' + nf(q[8], 2) + '&nbsp; T = ' + nf(q[9], 2)
      + '&nbsp; M₂₂ = ' + nf(q[10], 2) + '&nbsp; M₃₃ = ' + nf(q[11], 2)
      + '</div><p><b>{q} = [k]<sub>عقدي</sub>{u} + {q₀}</b></p></div>');

    H.push('<div class="stp"><h4>الخطوة ٨ — اشتقاق القوى الداخلية M(x) و V(x)</h4>'
      + '<p>باتزان الجزء المقطوع عند المسافة x من العقدة i، مع التكامل المغلق للحمل:</p>'
      + '<div class="eq">'
      + 'S(x) = ∫₀ˣ w(s)ds&nbsp;&nbsp;·&nbsp;&nbsp;S₁(x) = ∫₀ˣ s·w(s)ds<br><br>'
      + '<b>V₂(x) = −q₁ − S(x)</b><br>'
      + '<b>M₃₃(x) = q₅ − q₁·x − [x·S(x) − S₁(x)]</b><br><br>'
      + 'وبالتحقّق: dM₃₃/dx = −q₁ − S(x) = V₂(x) ✓</div>'
      + '<p>عند منتصف العنصر x = ' + nf(xm, 3) + ' م:</p>'
      + '<div class="eq">V₂ = ' + nf(sMid.V2, 3) + ' kN&nbsp;&nbsp;·&nbsp;&nbsp;M₃₃ = '
      + nf(sMid.M33, 3) + ' kN·m</div>'
      + '<p>أقصى عزم على طول العنصر <b class="ok">M₃₃ = ' + nf(pk.M33, 2) + ' kN·m</b> عند '
      + 'x = ' + nf(pk.x, 4) + ' م — وموضعه يُحسب بحلّ <b>V(x) = 0</b> بالتنصيف لا بمسح '
      + 'محطّات، فيكون الموضع مضبوطاً.</p></div>');

    var fcv = FR.faces(k, cs);
    H.push('<div class="stp"><h4>الخطوة ٩ — قوى التصميم عند وجه الركيزة</h4>'
      + '<p>تُحسب قوى التصميم (العزوم وقوى القصّ) عند <b>وجه الركيزة الداخلي</b> '
      + 'لا عند المحور، طبقاً للمنهجية المبسّطة لتحليل العزوم التقريبية في '
      + '<b>ACI 318-19 §6.5.4</b>، واعتماداً على معاملات العزم المقدَّرة في '
      + '<b>جدول 6.5.2</b>. '
      + 'وهذا ما يعرضه ETABS عند تعريف End Length Offsets.</p>'
      + '<div class="eq">'
      + 'الإزاحة عند i = ' + nf(m.offI, 3) + ' م&nbsp;&nbsp;·&nbsp;&nbsp;عند j = '
      + nf(m.offJ, 3) + ' م&nbsp;&nbsp;·&nbsp;&nbsp;البحر الصافي = ' + nf(fcv.clear, 3) + ' م<br><br>'
      + 'M₃₃ عند المحور i&nbsp; = ' + nf(FR.at(k, 0, cs).M33, 2) + ' kN·m<br>'
      + 'M₃₃ عند وجه i&nbsp;&nbsp;&nbsp; = ' + nf(fcv.i.M33, 2) + ' kN·m'
      + (Math.abs(FR.at(k, 0, cs).M33) > 1e-6
        ? '&nbsp;&nbsp;(أقلّ بـ ' + nf((1 - Math.abs(fcv.i.M33) / Math.abs(FR.at(k, 0, cs).M33)) * 100, 1) + '%)' : '')
      + '</div></div>');

    var dfl = FR.defl(k, 81, cs);
    H.push('<div class="stp"><h4>الخطوة ١٠ — الترخيم بتكامل الانحناء</h4>'
      + '<p>الترخيم لا يُقرأ من دوالّ الشكل (تصحّ لحمل منتظم فقط) بل يُكامَل الانحناء '
      + 'الحقيقي — وهي طريقة المساحة-العزم، مضبوطة لأي شكل حمل:</p>'
      + '<div class="eq">'
      + 'v″(x) = −M₃₃(x)/(E·I33)&nbsp;&nbsp;&nbsp;← انحناء<br>'
      + "v′s(x) = V₂(x)/(G·As2)&nbsp;&nbsp;&nbsp;&nbsp;← انزلاق قصّ<br>"
      + 'v(x) = ∬v″ + ∫v′s + C₀ + C₁x&nbsp; و C₀,C₁ من إزاحتَي العقدتين<br><br>'
      + 'أقصى ترخيم نسبي = ' + nf(dfl.max * 1000, 3) + ' مم عند x = ' + nf(dfl.at, 3) + ' م<br>'
      + 'L/Δ = ' + (dfl.ratio === Infinity ? '∞' : nf(dfl.ratio, 0))
      + '&nbsp;&nbsp;(الحدّ 240 لـ ACI 318-19 جدول 24.2.2)</div></div>');

    H.push('<div class="stp"><h4>المراجع المعتمَدة</h4>'
      + '<ul style="color:var(--mut);font-size:12.5px;line-height:1.95;margin:4px 0;'
      + 'padding-inline-start:18px">'
      + '<li><b>ACI 318-19</b> §19.2.2.1 (Ec) · جدول 6.6.3.1.1(a) (التشقّق) · §5.3.1 (التراكيب) '
      + '· §6.5.4 وجدول 6.5.2 (قوى التصميم عند وجه الركيزة) · §13.3 (الأساسات) '
      + '· جدول 22.5.5.1 و§22.5.5.1.3 (القصّ الأحادي و λs) · جدول 22.6.5.2 (القصّ الثاقب) '
      + '· جدول 24.2.2 (الترخيم) · جدول 21.2.1 (معاملات φ)</li>'
      + '<li><b>R.C. Hibbeler</b>, Structural Analysis — Ch.16 Matrix Stiffness Method</li>'
      + '<li><b>K.J. Bathe</b>, Finite Element Procedures §8.2.2 — حلّ LDLᵀ الشريطي</li>'
      + '<li><b>J.S. Przemieniecki</b>, Theory of Matrix Structural Analysis §5.6 — حدّ Timoshenko</li>'
      + '<li><b>G.R. Cowper</b> (1966) — معامل القصّ κ = 5/6 للمقطع المستطيل</li>'
      + '<li><b>Cook, Malkus & Plesha</b> §3.9 — متّجه الحمل المتوافق</li>'
      + '<li><b>Timoshenko & Goodier</b>, Theory of Elasticity §11 — ثابت الالتواء J</li>'
      + '<li><b>ASCE 7-16</b> §12.8.3 (توزيع القوى) · جدول 12.12-1 (انحراف الطوابق)</li>'
      + '</ul></div>');
    return H.join('');
  }

  /* ─────────────── التحقّق ─────────────── */
  function verHTML() {
    if (!VER) return '<div class="card">وحدة التحقّق غير محمَّلة.</div>';
    var r;
    try { r = VER.run(); } catch (e) { return '<div class="card bad">تعذّر: ' + esc(e.message) + '</div>'; }
    var tested = r.filter(function (x) { return x.err !== null; });
    var okf = function (x) { return isFinite(x.err) && x.err < 1e-8; };
    var pass = tested.filter(okf).length;
    var mxe = tested.reduce(function (a, x) {
      return isFinite(x.err) ? Math.max(a, x.err) : Infinity; }, 0);
    var grp = {}, order = [];
    r.forEach(function (x) { if (!grp[x.grp]) { grp[x.grp] = []; order.push(x.grp); } grp[x.grp].push(x); });
    var body = order.map(function (g) {
      return '<div class="card" style="margin-bottom:12px"><h3>' + esc(g) + '</h3>'
        + tbl(['الحالة', 'الكمية', 'الصيغة المرجعية', 'الحلّ المضبوط', 'المحرّك', 'الخطأ %', 'المرجع', ''],
            grp[g].map(function (x) {
              if (x.err === null) return [esc(x.name), esc(x.q),
                '<i style="color:var(--mut)">' + esc(x.note || '') + '</i>', '—',
                '<b class="wr">' + nf(x.got, 2) + (x.unit || '') + '</b>', '—',
                '<span style="font-size:11px;color:var(--mut)">' + esc(x.src) + '</span>', 'ℹ'];
              return [esc(x.name), esc(x.q),
                '<code style="color:#7dd3fc">' + esc(x.ref) + '</code>',
                isFinite(x.exact) ? x.exact.toExponential(8) : '—',
                isFinite(x.got) ? x.got.toExponential(8) : '<b class="bad">غير عددي</b>',
                isFinite(x.err) ? x.err.toExponential(2) : '∞',
                '<span style="font-size:11px;color:var(--mut)">' + esc(x.src) + '</span>',
                okf(x) ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'];
            }), '') + '</div>';
    }).join('');
    return '<div class="card" style="margin-bottom:13px"><h3>لماذا هذا التبويب هو الحجّة</h3>'
      + '<p style="font-size:13px;color:var(--mut);line-height:1.95;margin:0">'
      + 'طريقة الصلابة المباشرة <b>ليست تقريبية</b>: للعنصر المنشوري المرن الخطّي يطابق حلُّ '
      + 'المصفوفة الحلَّ التفاضلي المضبوط. وكل ميزة في هذا المحرّك — تشوّه القصّ · الوزن '
      + 'الذاتي · تحرير الأطراف · الإزاحات الصلبة · أشكال الأحمال · تراكُب الحالات — لها '
      + 'أدناه حالةُ اختبارٍ حلُّها منشور بمرجع قياسي، وتُحلّ الآن أمامك في متصفّحك.</p></div>'
      + '<div class="grid g4" style="margin-bottom:13px">'
      + kpi('حالات مُختبَرة', tested.length)
      + kpi('مطابِقة', pass, pass === tested.length ? 'ok' : 'bad')
      + kpi('أقصى خطأ', isFinite(mxe) ? mxe.toExponential(1) + '%' : 'غير عددي',
          isFinite(mxe) ? 'ok' : 'bad')
      + kpi('الحكم', pass === tested.length ? '✓ مضبوط' : '✗ مراجعة',
          pass === tested.length ? 'ok' : 'bad')
      + '</div>' + body
      + '<div class="card"><p style="font-size:12px;color:var(--mut);margin:0">'
      + 'الخطأ بحدود 10⁻¹⁴٪ هو خطأ الفاصلة العائمة بدقّة 64-bit، لا خطأ في الطريقة. '
      + 'والصفوف المعلَّمة <b>ℹ</b> ليست اختباراً بل قياساً لأثر كل ظاهرة على النتيجة.</p></div>';
  }

  /* ملخّص ما قُرئ من المعالج — بأرقامه، ليطابقه المستخدم بنفسه */
  function projSummary() {
    if (!PROJ) return '';
    var c = PROJ.cfg, sq = PROJ.seismic || {};
    var src = PROJ.source === 'frame' || PROJ.source === 'plan';
    return '<div class="grid g4" style="margin-bottom:11px">'
      + kpi('مصدر الشبكة', src ? 'مخطط المستخدم' : 'تلقائية', src ? 'ok' : 'warn')
      + kpi('البحور', ltr(c.nx + ' × ' + c.ny))
      + kpi('الطوابق', ltr(c.ns + ' × ' + nf(c.hs, 2)) + ' م')
      + kpi('مساحة الطابق', nf((PROJ.wz.footprint || 0), 1) + ' م²')
      + kpi('جسر X', ltr(Math.round(c.bbX * 1000) + '×' + Math.round(c.bhX * 1000)) + ' مم')
      + kpi('جسر Y', ltr(Math.round(c.bbY * 1000) + '×' + Math.round(c.bhY * 1000)) + ' مم')
      + kpi('العمود', ltr(Math.round(c.cb * 1000) + '×' + Math.round(c.ch * 1000)) + ' مم')
      + kpi('قصّ القاعدة V', nf(c.eqX, 1) + ' kN')
      + '</div>'
      + '<div style="font-size:12px;color:var(--mut);line-height:1.8">'
      + 'بحور X: <b style="color:#e6edf7">'
      + (c.spansX || []).map(function (v) { return nf(v, 2); }).join(' · ') + '</b> م<br>'
      + 'بحور Y: <b style="color:#e6edf7">'
      + (c.spansY || []).map(function (v) { return nf(v, 2); }).join(' · ') + '</b> م<br>'
      + 'f′c = ' + nf(c.fc, 0) + ' MPa · fy = ' + nf(c.fy, 0) + ' MPa · '
      + 'تربة ' + nf(c.qa, 0) + ' kPa · ' + esc(sq.city || '') + '</div>';
  }

  /* مقارنة عزوم المحرّك المصفوفي بعزوم المعالج المبسّطة — وهي جوهر الدمج:
     تُظهر بالأرقام ما الذي يضيفه التحليل الفراغي الكامل. */
  function cmpHTML() {
    if (!PROJ || !global.FEM3DBRIDGE || !FR) return '';
    var r = global.FEM3DBRIDGE.compareMoments(PROJ.wz, FR, COMBOS);
    if (!r || !r.length) return '';
    var rows = r.map(function (x) {
      var wz = Math.max(Math.abs(x.wzMax), Math.abs(x.wzMin));
      var dFace = x.cMax > 1e-6 ? (1 - x.fMax / x.cMax) * 100 : 0;
      var dd = wz > 1e-6 ? (x.fMax / wz - 1) * 100 : 0;
      return ['جسور ' + x.dir.toUpperCase() + ' — ' + ltr(x.b + '×' + x.h) + ' مم'
        + ' <span style="color:var(--mut);font-size:11px">(' + x.nb + ' عنصر)</span>',
        nf(wz, 1), nf(x.cMax, 1), nf(x.fMax, 1),
        '<span style="color:var(--mut)">−' + nf(dFace, 1) + '%</span>',
        '<b style="color:' + (dd > 0 ? 'var(--warn)' : 'var(--ok)') + '">'
          + (dd > 0 ? '+' : '') + nf(dd, 1) + '%</b>',
        '<span style="font-size:11px;color:var(--mut)">' + esc(x.tag) + '</span>'];
    });
    // فحص حفظ الحمل: مجموع ما نُقل للجسور = حمل البلاطة الكلّي
    var A = 0, SX = FR.meta.SX, SY = FR.meta.SY, i, j;
    for (i = 0; i < SX.length; i++) for (j = 0; j < SY.length; j++) A += SX[i] * SY[j];
    var expect = (PROJ.cfg.sdl + PROJ.cfg.ll) * A * PROJ.cfg.ns;
    var got = 0;
    ['DEAD', 'LIVE'].forEach(function (cs) {
      FR.members.forEach(function (m, k) {
        if (m.kind !== 'beam') return;
        (FR.wloc[cs][k] || []).forEach(function (g) {
          got += (Math.abs(g.w2a || 0) + Math.abs(g.w2b || 0)) / 2 * (g.b - g.a); });
      });
    });
    // وزن الجسور الذاتي داخل got، فيُطرح للمقارنة مع حمل البلاطة وحده
    var swB = 0;
    FR.members.forEach(function (m, k) {
      if (m.kind === 'beam') swB += m.rho * m.A * FR.cache[k].L; });
    var net = got - swB, err = expect > 0 ? Math.abs(net - expect) / expect : 0;

    return '<h3>مقارنة العزوم — المعالج مقابل التحليل الفراغي</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.9;margin:0 0 10px">'
      + 'معالج المشروع يصمّم بـ<b> معاملات ACI التقريبية</b> للجائز المستمر، وهي '
      + 'تُحمِّل الجسر <b>شريحةً كاملة</b> من البلاطة وتفترض أن الأعمدة لا تشارك '
      + 'بالمقاومة — وهذا مقصودٌ للتصميم السريع وللجانب الآمن. '
      + 'والتحليل هنا يحلّ الإطار الفراغي بما فيه.</p>'
      + tbl(['المجموعة', 'المعالج (kN·m)', 'التحليل عند المحور', 'التحليل عند الوجه',
             'أثر قراءة الوجه', 'الفرق النهائي', 'العنصر الحاكم'], rows, '')
      + '<div style="margin-top:12px;padding:11px 13px;background:#0a1020;border:1px solid '
      + 'var(--line);border-radius:9px;font-size:12px;color:var(--mut);line-height:1.9">'
      + '<b style="color:#e6edf7">الفرق ليس رقماً واحداً بل ثلاثة أسباب معلومة:</b><br>'
      + '<b>١) توزيع الحمل.</b> البلاطة تنقل حملها بخطوط 45°، فالجسر الطويل يأخذ '
      + 'شبه منحرف والقصير مثلثاً — لا شريحةً مستطيلة كاملة. مجموع ما نُقل هنا '
      + '<b style="color:' + (err < 1e-9 ? 'var(--ok)' : 'var(--bad)') + '">'
      + nf(net, 1) + ' kN</b> مقابل حمل البلاطة الكلّي ' + nf(expect, 1) + ' kN '
      + '(خطأ ' + err.toExponential(1) + ') — <b>فلا حمل ضاع</b>، وإنما وُزّع كما '
      + 'ينتقل فعلاً.<br>'
      + '<b>٢) إطاريّة الوصلة.</b> الأعمدة تقاوم مع الجسور فتتقاسم العزم، '
      + 'بينما معاملات ACI تعطي الجسر كل شيء.<br>'
      + '<b>٣) القراءة عند وجه الركيزة</b> بدل محورها — <b>ACI 318-19 §6.5.4</b> '
      + '(العمود المستقلّ بالجدول أعلاه).<br><br>'
      + '<b style="color:#fbbf24">كيف تقرأ هذا؟</b> المعالج <b>أكثر تحفّظاً</b>، '
      + 'وتصميمُه يبقى صالحاً وآمناً. وهذه الصفحة تُريك أين يقع التحفّظ وبكم، '
      + 'ليكون القرار بيدك لا بيد افتراضٍ مخفيّ. ولا تُعتمد النتيجة الأقلّ إلا '
      + 'بتدقيق مهندس مُجاز.</div>';
  }

  function derivHTML() {
    if (!FR) return '';
    if (MODE === 'project' && PROJ) {
      return '<h3>سلسلة اشتقاق الأحمال — من المعالج إلى النموذج</h3>'
        + tbl(['البند', 'المصدر والمعادلة', 'القيمة', 'الوحدة', 'الملاحظة'],
            PROJ.deriv.map(function (r) {
              return ['<b>' + esc(r[0]) + '</b>',
                '<span dir="auto" style="font-size:11.5px;color:#7dd3fc">' + esc(r[1]) + '</span>',
                '<b>' + esc(r[2]) + '</b>', esc(r[3]),
                '<span style="font-size:11px;color:var(--mut)">' + esc(r[4]) + '</span>'];
            }), '')
        + '<div style="margin-top:12px;padding:11px 13px;background:#0a1020;border:1px solid '
        + 'var(--line);border-radius:9px;font-size:12px;color:var(--mut);line-height:1.85">'
        + '<b style="color:#e6edf7">لماذا سماكة البلاطة صفر هنا؟</b><br>'
        + 'لأن وزنها الذاتي محسوبٌ في المعالج <b>لنوعها الحقيقي</b> ومُدرَجٌ في '
        + '«الحمل الميت على البلاطة». إعادةُ حسابه من γ·t تضاعفه، وتخطئ أصلاً مع '
        + 'البلاطة المفرّغة بالبلوك. وكذلك طُرح بدلُ الجسور التقديري لأن المحرّك '
        + 'يحسب وزن كل جسر وعمود من مقطعه الفعلي.</div>';
    }
    var d = FR.meta.deriv, c = FR.meta.cfg;
    var S = Math.min(c.sx, c.sy);
    return '<h3>سلسلة اشتقاق الأحمال</h3>'
      + tbl(['البند', 'المعادلة', 'القيمة', 'الوحدة', 'الملاحظة'],
          d.map(function (r) {
            return ['<b>' + esc(r[0]) + '</b>',
              '<span dir="ltr" style="display:inline-block;font-family:ui-monospace,monospace;'
              + 'font-size:11px;color:#7dd3fc;text-align:left">' + esc(r[1]) + '</span>', '<b>' + esc(r[2]) + '</b>', esc(r[3]),
              '<span style="font-size:11px;color:var(--mut)">' + esc(r[4]) + '</span>'];
          }), '')
      + '<div style="margin-top:13px;padding:11px 13px;background:#0a1020;border:1px solid '
      + 'var(--line);border-radius:9px;font-size:12.5px;color:var(--mut);line-height:1.85">'
      + '<b style="color:#e6edf7">توزيع حمل البلاطة على الجسور — خطوط 45°</b><br>'
      + 'اللوح ' + nf(c.sx, 2) + ' × ' + nf(c.sy, 2) + ' م يُقسَّم بخطوط 45° من أركانه:<br>'
      + '• الجسران القصيران (' + nf(S, 2) + ' م): حمل <b>مثلثي</b> قمّته w·S/2 = '
      + nf(FR.meta.wDead * S / 2, 3) + ' kN/m (ميت)<br>'
      + '• الجسران الطويلان (' + nf(Math.max(c.sx, c.sy), 2) + ' م): حمل <b>شبه منحرف</b> '
      + 'قمّته نفسها وقاعدته المائلة ' + nf(S / 2, 2) + ' م<br>'
      + 'ومجموعهما = w · Lx · Ly بالضبط. هذا هو توزيع ETABS للبلاطة الغشائية — '
      + 'واستبداله بحمل منتظم مكافئ يغيّر عزم الوسط رغم تساوي الحمل الكلّي.'
      + '</div>';
  }

  /* ─────────────── الصفحة ─────────────── */
  var page = {
    html: html,
    init: function () {
      U.injectCSS();
      if (VP) { VP.dispose(); VP = null; }
      var b = document.querySelectorAll('#fem .ft button'), i;
      for (i = 0; i < b.length; i++)
        b[i].onclick = (function (t) { return function () { tab(t); }; })(b[i].dataset.t);
      var upE = function () {
        var e = $id('f_E');
        if (e) e.value = Math.round(4700 * Math.sqrt(num('f_fc') || 28)) + ' MPa';
      };
      if ($id('f_fc')) $id('f_fc').oninput = upE;
      upE();
      var z = $id('f_zm');
      if (z) z.oninput = function () { USCALE = +this.value; draw(); };
      dbar();
      var v = $id('f_ver'); if (v) v.innerHTML = verHTML();
      page.run();
    },

    run: function () {
      var st = $id('f_stat');
      try {
        var c = cfg();
        if (st) { st.textContent = 'جارٍ الحلّ…'; st.style.color = 'var(--mut)'; }
        FR = M.buildModel(c);
        FR.run();
        COMBOS = F.aciCombos({ LIVE: 1, EQX: c.eqX ? 1 : 0, EQY: c.eqY ? 1 : 0 });
        FTS = M.footings(FR, COMBOS, COMBOS.service);
        SEL = -1;
        tab('vw');
        var host = $id('f_vp');
        if (host && global.THREE) {
          if (VP) VP.dispose();
          VP = U.Viewport(host, function (k) { page.pick(k, true); });
          if (VP) {
            VP.build(FR, SOLID);
            VP.foundations(FTS);
            VP.show('found', false);
            VP.fit(); draw();
          }
        }
        srcList();
        $id('f_res').innerHTML = resHTML();
        $id('f_fndp').innerHTML = fndHTML();
        $id('f_der').innerHTML = derivHTML();
        if (MODE === 'project') {
          var ps = $id('f_psum'); if (ps) ps.innerHTML = projSummary();
          var cp = $id('f_cmp'); if (cp) cp.innerHTML = cmpHTML();
        }
        $id('f_prf').innerHTML = proofHTML(-1);
        if (st) st.innerHTML = '<span class="ok">✓ ' + FR.members.length + ' عنصر · '
          + FR.neq + ' DOF · ' + FR.cases.length + ' حالة · ' + COMBOS.length + ' تركيب · '
          + nf(FR.ms, 0) + ' ms</span>';
      } catch (e) {
        if (st) { st.textContent = '✗ ' + e.message; st.style.color = 'var(--bad)'; }
        console.error(e);
      }
    },

    diag: function (k) { DK = k; dbar(); draw(); },
    src: function (v) { SRC = v; draw(); if (SEL >= 0) page.pick(SEL, true); },
    tg: function (g, btn) {
      var on = !btn.classList.contains('on');
      btn.classList.toggle('on', on);
      if (VP) VP.show(g, on);
    },
    solid: function () {
      SOLID = !SOLID;
      var b2 = $id('f_sld');
      if (b2) { b2.classList.toggle('on', SOLID); b2.textContent = SOLID ? 'مقاطع مصمتة' : 'خطوط'; }
      if (VP && FR) { VP.build(FR, SOLID); draw(); if (SEL >= 0) VP.axes(SEL); }
    },
    pick: function (k, fromView) {
      SEL = k;
      if (VP) { VP.axes(k); draw(); }
      var e = $id('f_pick'); if (e) e.innerHTML = pickHTML(k);
      var p = $id('f_prf'); if (p) p.innerHTML = proofHTML(k);
      if (!fromView) tab('vw');
    },
    goProof: function () { tab('prf'); },

    /** تفاصيل تصميم العنصر المختار: المعادلة فالتعويض فالبند. */
    details: function (k) {
      if (!FR || k < 0 || k >= FR.members.length) return;
      var m = FR.members[k], c = FR.cache[k], p = memberPayloads(k);
      var sum = [['العنصر', m.tag || ('#' + k), 'ltr'],
                 ['المقطع', Math.round(m.b * 1000) + '×' + Math.round(m.h * 1000)
                   + ' مم', 'ltr'],
                 ['الطول', nf(c.L, 2) + ' م', 'ltr'],
                 ['f′c / f_y', nf(FR.meta.cfg.fc, 0) + ' / '
                   + nf(FR.meta.cfg.fy || 420, 0) + ' MPa', 'ltr']];
      showDetails($id('f_cd'), p, sum, p.note);
      var e = $id('f_cd'); if (e) setTimeout(function () {
        e.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    },

    /** «اضغط على سهم العزوم»: يفتح اشتقاق العزم للعنصر المختار مباشرةً. */
    momentDetails: function () {
      if (SEL < 0) {
        var st = $id('f_stat');
        if (st) { st.textContent = 'اختر عنصراً من المجسّم أوّلاً ثم اطلب التفاصيل';
                  st.style.color = 'var(--warn)'; }
        return;
      }
      page.details(SEL);
    },

    /** تفاصيل تصميم أساسٍ من جدول الأساسات. */
    fndDetails: function (i) {
      if (!FTS || !FTS[i]) return;
      var d = FTS[i];
      showDetails($id('f_fcd'), fndPayloads(i),
        [['الأساس', d.name || ('#' + (i + 1)), 'ltr'],
         ['الأبعاد', nf(d.B, 2) + ' × ' + nf(d.B, 2) + ' م', 'ltr'],
         ['السماكة', d.h + ' مم', 'ltr'],
         ['P خدمة / مُعامَل', nf(d.Ps, 0) + ' / ' + nf(d.Pu, 0) + ' kN', 'ltr']]);
      var e = $id('f_fcd'); if (e) setTimeout(function () {
        e.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    },

    /** يفتح معالج المشروع (وهو يُشغّل نفسه عند فتحه) ثم يعود إلى هنا ما إن
        تجهز نتيجتُه. مجرّد تنقّل — لا يكتب في المعالج شيئاً. */
    viaWizard: function () {
      if (typeof global.go !== 'function') return;
      global.go('wizard');
      var t0 = Date.now();
      var iv = setInterval(function () {
        if (wiz()) { clearInterval(iv); global.go('femproj'); }
        else if (Date.now() - t0 > 90000) clearInterval(iv);
      }, 300);
    },

    rz: function (v) {
      var e = $id('f_rz'); if (e) e.value = v;
      page.run();
    },

    /** يشغّل المقارنة مع OpenSees على الخادم ويعرض النتيجة. */
    xcheck: function () {
      var st = $id('f_xst'), out = $id('f_xout');
      if (!global.FEM3DX) { if (st) st.textContent = 'وحدة المقارنة غير محمَّلة'; return; }
      if (st) { st.textContent = 'جارٍ البناء في OpenSees…'; st.style.color = 'var(--mut)'; }
      if (out) out.innerHTML = '';
      var t0 = Date.now();
      global.FEM3DX.run(cfg(), function (i, nm) {
        if (st) st.textContent = 'جارٍ الحلّ (' + i + ') — ' + nm;
      }).then(function (res) {
        var okAll = res.length && res.every(function (r) {
          return !r.error && r.eD < 1e-9 && r.eF < 1e-9 && r.eR < 1e-9; });
        var ver = (res.find(function (r) { return r.ver; }) || {}).ver || '—';
        var rows = res.map(function (r) {
          if (r.error) return ['<b>' + esc(r.name) + '</b>', esc(r.cs || '—'), '—', '—', '—',
            '<span class="bad">✗ ' + esc(r.error).slice(0, 90) + '</span>'];
          var ok = r.eD < 1e-9 && r.eF < 1e-9 && r.eR < 1e-9;
          return ['<b>' + esc(r.name) + '</b>', esc(r.cs),
            r.eD.toExponential(2), r.eF.toExponential(2), r.eR.toExponential(2),
            ok ? '<span class="ok">✓ مطابق</span>'
               : '<span class="bad">✗ ' + (r.worst ? esc(r.worst.tag) + ' q'
                   + r.worst.q + ': ' + nf(r.worst.mine, 3) + ' مقابل '
                   + nf(r.worst.os, 3) : '') + '</span>'];
        });
        var notes = [];
        res.forEach(function (r) {
          if (r.why && notes.indexOf(r.why) < 0) notes.push(r.why);
          if (r.note && notes.indexOf(r.note) < 0) notes.push(r.note);
        });
        if (st) { st.innerHTML = '<span class="' + (okAll ? 'ok' : 'bad') + '">'
          + (okAll ? '✓ مطابق تماماً' : '✗ راجع') + ' — OpenSees ' + esc(ver)
          + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' ث</span>'; }
        if (!out) return;
        var m0 = res.find(function (r) { return r.nodes; }) || {};
        out.innerHTML = '<div class="grid g4" style="margin-bottom:12px">'
          + kpi('OpenSees', esc(ver), 'ok')
          + kpi('مقارنات', res.length)
          + kpi('أقصى انحراف',
              res.filter(function (r) { return !r.error; })
                 .reduce(function (a, r) { return Math.max(a, r.eD, r.eF, r.eR); }, 0)
                 .toExponential(1), 'ok')
          + kpi('الحكم', okAll ? '✓ مطابق' : '✗ راجع', okAll ? 'ok' : 'bad')
          + '</div>'
          + tbl(['المقارنة', 'الحالة', 'خطأ الإزاحات', 'خطأ قوى الأطراف',
                 'خطأ ردود الأفعال', 'الحكم'], rows, '')
          + '<div style="margin-top:12px;padding:11px 13px;background:#0a1020;border:1px solid '
          + 'var(--line);border-radius:9px;font-size:12px;color:var(--mut);line-height:1.85">'
          + '<b style="color:#e6edf7">فروق اصطلاحية جرت مراعاتها</b><br>'
          + notes.map(function (n) { return '• ' + esc(n); }).join('<br>')
          + '<br>• الانحراف بحدود 10⁻¹³ هو تراكم التقريب العشري في محرّكين مستقلّين، '
          + 'لا اختلاف في المعادلات.</div>';
      }).catch(function (e) {
        if (st) { st.textContent = '✗ ' + e; st.style.color = 'var(--bad)'; }
      });
    },
    frame: function () { return FR; },
    footings: function () { return FTS; },
    combos: function () { return COMBOS; }
  };

  F.page = page;

  /* الصفحة الثانية: نفس التبويبات والمحرّك، لكن مصدرها معالج المشروع.
     تتشارك مع الأولى الحالةَ والمعرّفات — ولا تُركَّب إلا واحدة في كل وقت. */
  F.projPage = {
    html: function () { MODE = 'project'; return html(); },
    init: function () { MODE = 'project'; page.init(); },
    frame: page.frame
  };
  var _mh = page.html;
  page.html = function () { MODE = 'manual'; return _mh(); };
})(typeof window !== 'undefined' ? window : globalThis);
