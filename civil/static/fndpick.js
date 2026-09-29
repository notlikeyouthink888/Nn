/* ============================================================================
   fndpick.js — الفحص السريع: نسبة استغلال الأرض ونوع الأساس

   يجيب عن سؤالٍ واحد قبل أي تصميم: هل تكفي أرضي لأسسٍ سطحية أصلاً؟
   بثلاثة مدخلات فقط، والنتيجة تتغيّر **مع كل ضغطة مفتاح** بلا زرّ ولا طلب
   للخادم — لأن الحساب ثلاث معادلات، وإرساله للخادم يقتل فائدته.

       A_req = P ÷ σ_allow          ( 1 kPa = 1 kN/m² )
       R     = A_req ÷ A_footprint × 100 %

   وحدود القرار (33٪ و100٪) **قاعدة ممارسة لا بند كودي**: ACI 318-19 لا
   يختار نوع الأساس، وإنما يصمّم النوع بعد اختياره (الفصل 13). وتحمّل التربة
   المسموح فحص **خدمة** جيوتقني لا فحص مقاومة. وهذا مكتوب بالواجهة صراحةً
   لئلّا يُنسَب إلى الكود ما ليس فيه.

   مستقلّ تماماً: لا يلمس معالج المشروع ولا مُرشد الأساسات الكامل، ويحيل
   إليهما لأنهما يقولان أكثر مما يقوله هذا.
   ========================================================================= */
(function (global) {
  'use strict';

  /** 1 طن متري ≈ 10 kN (9.81 مُقرَّبة، وهي الممارسة الشائعة بالموقع). */
  var TON_TO_KN = 10.0;

  /** نطاقات القرار — الحدّ الأعلى لكل نطاق، والأخير مفتوح. */
  var BANDS = [
    { max: 33, key: 'isolated', name: 'أساس منفصل / شريطي',
      en: 'Isolated / Strip Footing', tone: 'ok', color: '#34d399',
      why: 'التربة ممتازة والأحمال خفيفة إلى متوسطة: مساحة الأسس المطلوبة '
         + 'أقلّ من ثلث مسقط المبنى، فيكفي أن يقف كل عمود على قاعدته وحده.' },
    { max: 100, key: 'raft', name: 'أساس حصيري / رفت',
      en: 'Raft / Mat Foundation', tone: 'warn', color: '#fbbf24',
      why: 'مساحة الأسس المنفردة صارت تغطّي جزءاً كبيراً من الأرض، فصبّها '
         + 'لوحاً واحداً أرخص وأضبط للهبوط التفاضلي من صبّ قواعد متلاصقة.' },
    { max: Infinity, key: 'piles', name: 'أساسات عميقة / ركائز',
      en: 'Pile Foundation', tone: 'bad', color: '#f87171',
      why: 'المساحة المطلوبة تتجاوز مسقط المبنى نفسه: التربة السطحية لا '
         + 'تحمل هذا الحمل مهما وُسِّع الأساس، فتُنقل الأحمال إلى طبقة أعمق '
         + 'عبر الركائز.' }
  ];

  var UNSUITABLE = {
    key: 'unsuitable', name: 'غير صالح للتأسيس المباشر',
    en: 'Soil Replacement or Deep Piles', tone: 'bad', color: '#f87171',
    why: 'الردم غير المدكوك تحمّله المسموح صفر: لا يُبنى عليه أساس سطحي بأي '
       + 'مساحة. إمّا يُزال ويُستبدل بطبقات سبيس مدكوكة، أو تُخترَق طبقته '
       + 'بركائز عميقة تصل التربة السليمة تحته.'
  };

  /**
   * الحساب كاملاً — دالّة خالصة، لا تلمس DOM ولا حالة.
   * @param {number} footprint مساحة مسقط المبنى (م²)
   * @param {number} load      الحمل الشاقولي الكلّي
   * @param {string} unit      'kN' أو 'ton'
   * @param {number} qa        قدرة التحمّل المسموحة (kPa)
   * @returns {{P:number, qa:number, A_req:number, R:number, band:object,
   *            ok:boolean, spare:number}}
   */
  function evaluate(footprint, load, unit, qa) {
    var P = unit === 'ton' ? load * TON_TO_KN : load;
    if (!(qa > 0)) {
      return { P: P, qa: 0, A_req: Infinity, R: Infinity, band: UNSUITABLE,
               ok: false, spare: -Infinity, footprint: footprint };
    }
    var A_req = P / qa;
    var R = footprint > 0 ? (A_req / footprint) * 100 : Infinity;
    var band = BANDS[0];
    for (var i = 0; i < BANDS.length; i++) {
      if (R <= BANDS[i].max) { band = BANDS[i]; break; }
      band = BANDS[BANDS.length - 1];
    }
    return { P: P, qa: qa, A_req: A_req, R: R, band: band,
             ok: R <= 100, spare: footprint - A_req, footprint: footprint };
  }

  /* ─────────────────────────── الواجهة ─────────────────────────── */

  var CSS = [
    '#fndpick .fpbar{position:relative;height:34px;border-radius:9px;overflow:hidden;',
      'display:flex;border:1px solid var(--line);margin:14px 0 8px}',
    '#fndpick .fpbar div{display:flex;align-items:center;justify-content:center;',
      'font-size:11.5px;font-weight:700;color:#04121f}',
    '#fndpick .fpmark{position:relative;height:22px;margin-bottom:10px}',
    '#fndpick .fpmark span{position:absolute;transform:translateX(50%);font-size:11.5px;',
      'font-weight:800;white-space:nowrap;color:#e6edf7;background:#101a2e;',
      'border:1px solid var(--line);border-radius:7px;padding:2px 8px}',
    '#fndpick .fpv{position:absolute;top:0;bottom:0;width:3px;background:#fff;',
      'box-shadow:0 0 0 1px #04121f}',
    '#fndpick .fpres{border-radius:12px;padding:15px 17px;margin-top:4px;',
      'border:1px solid var(--line)}',
    '#fndpick .fpres h3{margin:0 0 4px;font-size:19px}',
    '#fndpick .fpres .en{font-size:12px;color:var(--mut);direction:ltr;display:block}',
    '#fndpick .fpres p{margin:9px 0 0;font-size:13px;line-height:1.95;color:var(--tx)}',
    '#fndpick .fpeq{background:#070c18;border:1px solid var(--line);border-radius:9px;',
      'padding:11px 13px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;',
      'color:#7dd3fc;direction:ltr;unicode-bidi:isolate;text-align:start;line-height:2;',
      'white-space:pre-wrap;overflow-x:auto}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('fndpick-css')) return;
    var s = document.createElement('style');
    s.id = 'fndpick-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function nf(x, n) {
    if (x === Infinity) return '∞';
    if (x === null || x === undefined || isNaN(x)) return '—';
    return x.toLocaleString('en-US', { minimumFractionDigits: n === undefined ? 2 : n,
                                       maximumFractionDigits: n === undefined ? 2 : n });
  }

  /** قائمة الترب: من `/api/meta` إن توفّرت، وإلّا النسخة المدمجة. */
  var FALLBACK = [
    ['صخر متماسك', 1000], ['حصى وسبيس مدكوك كثيف', 400], ['رمل كثيف', 250],
    ['طين قاسي جداً', 300], ['طين قاسي', 180], ['رمل متوسط الكثافة', 150],
    ['طين متوسط القساوة', 100], ['رمل مفكك', 90], ['طين طري', 50],
    ['طين طري جداً / سبخة', 30], ['ردم غير مدكوك (غير صالح للتأسيس)', 0]
  ];
  function soils() {
    var m = global.META && global.META.soils;
    if (m && m.length) return m.map(function (s) { return [s.name, s.qa]; });
    return FALLBACK;
  }

  function html() {
    injectCSS();
    var opts = soils().map(function (s, i) {
      return '<option value="' + i + '">' + esc(s[0]) + ' — ' + nf(s[1], 0)
        + ' kPa</option>';
    }).join('');
    return '<div id="fndpick"><div class="grid g2">'
      + '<div class="card"><h3>المدخلات</h3><div class="f">'
      + '<div><label>مساحة مسقط المبنى <span style="color:#64748b">(م²)</span></label>'
      + '<input id="fp_area" type="number" step="10" value="200" min="1"></div>'
      + '<div><label>إجمالي الأحمال الشاقولية P</label>'
      + '<input id="fp_load" type="number" step="50" value="4000" min="0"></div>'
      + '<div><label>وحدة الحمل</label><select id="fp_unit">'
      + '<option value="kN" selected>kN (كيلونيوتن)</option>'
      + '<option value="ton">Ton (طن متري — يُحوَّل ×10)</option></select></div>'
      + '<div style="grid-column:1/-1"><label>نوع التربة وقدرة تحمّلها المسموحة σ</label>'
      + '<select id="fp_soil">' + opts + '</select></div>'
      + '</div>'
      + '<div class="note" style="margin-top:10px">النتيجة تتحدّث <b>فوراً</b> مع كل '
      + 'تغيير — لا زرّ ولا انتظار. الحمل الشاقولي هو مجموع أحمال الخدمة '
      + '(ميت + حي) غير المُعامَلة، لأن تحمّل التربة فحص خدمة.</div></div>'

      + '<div class="card"><h3>الاشتقاق</h3>'
      + '<div class="fpeq" id="fp_eq"></div>'
      + '<div class="grid g2" style="margin-top:12px" id="fp_kpi"></div></div>'
      + '</div>'

      + '<div class="card" style="margin-top:16px"><h3>موقعك على مقياس الاستغلال</h3>'
      + '<div class="fpmark" id="fp_mark"></div>'
      + '<div class="fpbar" id="fp_bar"></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;'
      + 'color:var(--mut)"><span>0%</span><span>33%</span><span>100%</span>'
      + '<span>130%+</span></div>'
      + '<div id="fp_res"></div></div>'

      + '<div class="card" style="margin-top:16px"><h3>كيف تُقرأ هذه النتيجة</h3>'
      + '<p style="font-size:13px;color:var(--mut);line-height:2;margin:0 0 10px">'
      + 'هذا <b>فحص أولي</b> يجيب عن سؤال واحد: هل تكفي الأرض لأسسٍ سطحية؟ '
      + 'وحدّا 33٪ و100٪ <b style="color:#fbbf24">قاعدة ممارسة لا بند كودي</b> — '
      + 'فـ ACI 318-19 لا يختار نوع الأساس، وإنما يصمّم النوع بعد اختياره '
      + '(الفصل 13: §13.3 للأسس السطحية و§13.4 للركائز). وقدرة التحمّل المسموحة '
      + 'رقم <b>جيوتقني</b> من التقرير الجيوتقني، وفحصها فحص <b>خدمة</b> لا مقاومة '
      + '(ACI 318-19 §13.3.1.1).</p>'
      + tbl(['النطاق', 'التوصية', 'المعنى الهندسي'],
          [['R ≤ 33٪', '<b style="color:#34d399">منفصل / شريطي</b>',
            'مساحة القواعد أقلّ من ثلث الأرض — لا تتلامس ولا تتداخل'],
           ['33٪ < R ≤ 100٪', '<b style="color:#fbbf24">حصيرة / رفت</b>',
            'القواعد تقارب التلامس؛ صبّها لوحاً واحداً أرخص وأضبط للهبوط'],
           ['R > 100٪', '<b style="color:#f87171">ركائز</b>',
            'الأرض كلّها لا تكفي — لا حلّ سطحي مهما وُسِّع الأساس'],
           ['σ = 0', '<b style="color:#f87171">استبدال تربة أو ركائز</b>',
            'ردم غير مدكوك — لا تأسيس سطحي عليه بأي حال']])
      + '<div class="note" style="margin-top:12px"><b>وبعد هذا الفحص:</b> '
      + '<a href="#" onclick="go(\'wizard\');return false">معالج المشروع</a> يصمّم '
      + 'الأساس فعلاً بأبعاده وحديده وفحوصه، و'
      + '<a href="#" onclick="go(\'soil\');return false">التربة والركائز</a> يحسب '
      + 'قدرة التحمّل من خواصّ التربة (Terzaghi/Vesic) بدل إدخالها يدوياً. '
      + 'وهذا الفحص لا يحلّ محلّ أيّهما ولا التقرير الجيوتقني.</div></div>'
      + '</div>';
  }

  function tbl(head, rows) {
    return '<div style="overflow-x:auto"><table><thead><tr>'
      + head.map(function (h) { return '<th>' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('')
            + '</tr>'; }).join('')
      + '</tbody></table></div>';
  }

  function kpi(l, v, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v
      + '</div><div class="l">' + l + '</div></div>';
  }

  function read() {
    var e = function (i) { return document.getElementById(i); };
    var a = e('fp_area'), l = e('fp_load'), u = e('fp_unit'), s = e('fp_soil');
    if (!a || !l || !u || !s) return null;
    var list = soils(), idx = Math.max(0, Math.min(list.length - 1, +s.value));
    return { footprint: parseFloat(a.value) || 0, load: parseFloat(l.value) || 0,
             unit: u.value, soil: list[idx][0], qa: list[idx][1] };
  }

  /** موضع المؤشّر على الشريط: 0–33–100 خطّي، وما فوق 100 مضغوط بلا انفلات. */
  function markPct(R) {
    if (!isFinite(R)) return 100;
    if (R <= 100) return R / 130 * 100;
    return Math.min(99, (100 + Math.min(30, (R - 100) * 0.3)) / 130 * 100);
  }

  function update() {
    var inp = read();
    if (!inp) return;
    var r = evaluate(inp.footprint, inp.load, inp.unit, inp.qa);
    var eq = document.getElementById('fp_eq');
    var unitNote = inp.unit === 'ton'
      ? 'P = ' + nf(inp.load, 1) + ' Ton × 10 = ' + nf(r.P, 1) + ' kN\n' : '';
    if (eq) {
      eq.textContent = r.qa > 0
        ? unitNote
          + 'A_req = P ÷ σ_allow\n'
          + '      = ' + nf(r.P, 1) + ' kN ÷ ' + nf(r.qa, 0) + ' kPa = '
          + nf(r.A_req, 2) + ' m²\n\n'
          + 'R = A_req ÷ A_footprint × 100%\n'
          + '  = ' + nf(r.A_req, 2) + ' ÷ ' + nf(r.footprint, 1) + ' × 100 = '
          + nf(r.R, 1) + ' %'
        : unitNote
          + 'σ_allow = 0 kPa\n'
          + 'A_req = P ÷ 0  →  ∞      (لا مساحة تكفي)\n'
          + 'R = ∞';
    }

    var k = document.getElementById('fp_kpi');
    if (k) {
      k.innerHTML =
        kpi('المساحة المطلوبة A_req', (r.A_req === Infinity ? '∞' : nf(r.A_req, 2)) + ' م²',
            r.ok ? 'ok' : 'bad')
        + kpi('المساحة المتوفّرة', nf(r.footprint, 1) + ' م²')
        + kpi('نسبة الاستغلال R', (isFinite(r.R) ? nf(r.R, 1) + ' %' : 'غير محدّدة'),
              r.band.tone)
        + kpi(r.spare >= 0 ? 'الفائض من الأرض' : 'العجز بالمساحة',
              (isFinite(r.spare) ? nf(Math.abs(r.spare), 1) + ' م²' : '∞'),
              r.spare >= 0 ? 'ok' : 'bad');
    }

    var bar = document.getElementById('fp_bar');
    if (bar) {
      bar.innerHTML = BANDS.map(function (b, i) {
        var w = i === 0 ? 33 / 130 * 100 : i === 1 ? 67 / 130 * 100 : 30 / 130 * 100;
        var on = b.key === r.band.key;
        return '<div style="width:' + w + '%;background:' + b.color
          + ';opacity:' + (on ? 1 : .3) + '">' + esc(b.name.split(' / ')[0]) + '</div>';
      }).join('')
      + (isFinite(r.R)
          ? '<div class="fpv" style="inset-inline-start:' + markPct(r.R) + '%"></div>'
          : '');
    }
    var mk = document.getElementById('fp_mark');
    if (mk) {
      mk.innerHTML = isFinite(r.R)
        ? '<span style="inset-inline-start:' + markPct(r.R) + '%">R = '
          + nf(r.R, 1) + '%</span>'
        : '<span style="inset-inline-start:50%">التربة غير صالحة — R غير محدّدة</span>';
    }

    var res = document.getElementById('fp_res');
    if (res) {
      var b = r.band;
      res.innerHTML = '<div class="fpres" style="border-color:' + b.color
        + '66;background:' + b.color + '14">'
        + '<h3 style="color:' + b.color + '">' + esc(b.name)
        + '<span class="en">' + esc(b.en) + '</span></h3>'
        + '<p>' + esc(b.why) + '</p>'
        + '<p style="color:var(--mut);font-size:12.5px">التربة: <b>' + esc(inp.soil)
        + '</b> · σ = <b>' + nf(r.qa, 0) + ' kPa</b> · الحمل: <b>' + nf(r.P, 1)
        + ' kN</b>'
        + (r.qa > 0
            ? ' · تحتاج <b>' + nf(r.A_req, 2) + ' م²</b> من أصل <b>'
              + nf(r.footprint, 1) + ' م²</b> متاحة'
            : '')
        + '</p></div>';
    }
  }

  function init() {
    injectCSS();
    ['fp_area', 'fp_load'].forEach(function (i) {
      var e = document.getElementById(i);
      if (e) e.oninput = update;
    });
    ['fp_unit', 'fp_soil'].forEach(function (i) {
      var e = document.getElementById(i);
      if (e) e.onchange = update;
    });
    update();
  }

  global.FNDPICK = { html: html, init: init, evaluate: evaluate,
                     BANDS: BANDS, UNSUITABLE: UNSUITABLE, TON_TO_KN: TON_TO_KN };
})(typeof window !== 'undefined' ? window : globalThis);
