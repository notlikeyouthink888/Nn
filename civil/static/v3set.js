/* ============================================================================
   v3set.js — إعدادات العرض والأداء للمجسّم

   المشكلة الحقيقية: التسليح يُرسم **لكل طابق** — أتاري كل جسر وأساور كل
   عمود وكراسي كل سقف. فمبنى بعشرة طوابق عشرة أضعاف مبنى بطابق، والمتصفّح
   يثقل. وليس العلاج إنقاص الدقّة على الجميع، بل إعطاء المستخدم المقبض:
   من يريد التدقيق يرفعها، ومن يريد التصفّح ينزلها.

   ستة مقابض، كلٌّ منها يضرب في شيء يُقاس:

     seg      عدد الأضلاع حول السيخ (12 ← 4): المثلثات تتناسب طرداً
     floors   لكم طابقاً يُرسم التسليح (الكل ← واحد ← بلا): الحمل خطّي بالطوابق
     ties     رباط الكراسي — **ثلاث قطع بكل كرسي**، أي ثلاثة أضعاف عددها
     spacers  بسكويت الغطاء — كرة لكل قطعة
     shadows  الظلال: تمريرة رسم كاملة إضافية بكل إطار
     dpr      حدّة الشاشة: البكسلات تتناسب مع مربّعها (2 ← 1 يعني الرُبع)

   والإعداد يُحفظ بالمتصفّح (localStorage) فيبقى بين الجلسات. وما يمسّ
   الهندسة يُعاد بناؤه، وما يمسّ الرسم وحده يُطبَّق فوراً بلا إعادة بناء.
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = 'civil.v3set.v1';

  var DEF = { preset: 'balanced', seg: 8, floors: 3, ties: true,
              spacers: true, shadows: false, dpr: 1.5 };

  /** الجاهزات — كل واحدة مجموعة قيم متّسقة، والمخصّص يخرج عنها. */
  var PRESETS = {
    high:     { seg: 12, floors: 0,  ties: true,  spacers: true,  shadows: true,  dpr: 2 },
    balanced: { seg: 8,  floors: 3,  ties: true,  spacers: true,  shadows: false, dpr: 1.5 },
    fast:     { seg: 6,  floors: 1,  ties: false, spacers: false, shadows: false, dpr: 1 },
    min:      { seg: 4,  floors: -1, ties: false, spacers: false, shadows: false, dpr: 1 }
  };
  var PRESET_NAMES = [
    ['high',     '🔬 عالية',    'كل طابق بكل تفصيلة — للتدقيق والتصوير'],
    ['balanced', '⚖️ متوازنة',  'تسليح أول 3 طوابق · بلا ظلال — الافتراضي'],
    ['fast',     '⚡ سريعة',     'تسليح طابق واحد · بلا رباط ولا بسكويت'],
    ['min',      '🪶 الحدّ الأدنى', 'بلا تسليح إطلاقاً — الهيكل وحده']
  ];

  var FLOORS = [[0, 'كل الطوابق'], [1, 'طابق واحد'], [2, 'طابقان'],
                [3, 'ثلاثة طوابق'], [5, 'خمسة طوابق'], [-1, 'بلا تسليح']];
  var SEGS = [[12, '12 ضلعاً — ناعم'], [8, '8 أضلاع — متوازن'],
              [6, '6 أضلاع — سريع'], [4, '4 أضلاع — الأخشن']];
  var DPRS = [[2, '2× — أحدّ'], [1.5, '1.5× — متوازن'], [1, '1× — أسرع']];

  var cur = null;

  function load() {
    if (cur) return cur;
    cur = {};
    for (var k in DEF) cur[k] = DEF[k];
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k2 in DEF) if (o[k2] !== undefined) cur[k2] = o[k2];
      }
    } catch (e) { /* وضع التصفّح الخاص أو تخزين محجوب — الافتراضي يكفي */ }
    return cur;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
  }

  function get() { return load(); }

  /** هل يُرسم تسليح هذا الطابق؟ `floor` من 1. */
  function floorOn(floor) {
    var s = load();
    if (s.floors === -1) return false;          // بلا تسليح
    if (!s.floors) return true;                 // كل الطوابق
    return !floor || floor <= s.floors;
  }

  /** عدد أضلاع المقطع الدائري — بحدّ أدنى 3 حتى لا ينهار المجسّم. */
  function seg(n) {
    var s = load(), base = n === undefined ? 12 : n;
    return Math.max(3, Math.round(base * s.seg / 12));
  }

  /* ─────────────────────────── الواجهة ─────────────────────────── */

  var CSS = [
    '.v3set{position:absolute;top:44px;inset-inline-end:9px;z-index:30;width:270px;',
      'background:rgba(10,16,32,.97);border:1px solid var(--line);border-radius:12px;',
      'padding:13px 14px;box-shadow:0 10px 34px rgba(0,0,0,.5);font-size:12.5px}',
    '.v3set h4{margin:0 0 9px;font-size:13.5px;color:#fff;display:flex;',
      'justify-content:space-between;align-items:center}',
    '.v3set h4 button{background:none;border:0;color:var(--mut);cursor:pointer;',
      'font-size:17px;line-height:1;padding:0 3px}',
    '.v3set .pre{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:11px}',
    '.v3set .pre button{background:var(--bg2);border:1px solid var(--line);color:var(--tx);',
      'border-radius:8px;padding:7px 4px;cursor:pointer;font:inherit;font-size:11.5px;',
      'transition:.15s;text-align:center}',
    '.v3set .pre button:hover{border-color:var(--acc)}',
    '.v3set .pre button.on{background:rgba(56,189,248,.2);border-color:var(--acc);color:#fff}',
    '.v3set label{display:flex;justify-content:space-between;align-items:center;',
      'gap:8px;margin:7px 0;color:var(--mut)}',
    '.v3set select{width:auto;min-width:118px;font-size:11.5px;padding:4px 7px}',
    '.v3set input[type=checkbox]{width:auto;margin:0}',
    '.v3set .hint{font-size:11px;color:var(--mut);line-height:1.8;margin-top:9px;',
      'padding-top:9px;border-top:1px dashed var(--line)}',
    '.v3set .cost{color:#fbbf24;font-weight:700}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('v3set-css')) return;
    var s = document.createElement('style');
    s.id = 'v3set-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function opt(list, v) {
    return list.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] == v ? ' selected' : '') + '>'
        + o[1] + '</option>';
    }).join('');
  }

  function panelHTML() {
    var s = load();
    return '<h4>⚙️ العرض والأداء<button onclick="V3SET.close()" title="إغلاق">×</button></h4>'
      + '<div class="pre">' + PRESET_NAMES.map(function (p) {
          return '<button data-p="' + p[0] + '" class="' + (s.preset === p[0] ? 'on' : '')
            + '" title="' + p[2] + '" onclick="V3SET.preset(\'' + p[0] + '\')">'
            + p[1] + '</button>';
        }).join('') + '</div>'
      + '<label>تسليح كم طابقاً<select id="v3s_fl">' + opt(FLOORS, s.floors)
      + '</select></label>'
      + '<label>دقّة مقطع السيخ<select id="v3s_sg">' + opt(SEGS, s.seg)
      + '</select></label>'
      + '<label>حدّة الشاشة<select id="v3s_dp">' + opt(DPRS, s.dpr) + '</select></label>'
      + '<label>رباط الكراسي <span style="color:#64748b">(×3 قطع)</span>'
      + '<input type="checkbox" id="v3s_ti"' + (s.ties ? ' checked' : '') + '></label>'
      + '<label>بسكويت الغطاء<input type="checkbox" id="v3s_sp"'
      + (s.spacers ? ' checked' : '') + '></label>'
      + '<label>الظلال<input type="checkbox" id="v3s_sh"'
      + (s.shadows ? ' checked' : '') + '></label>'
      + '<div class="hint">الثقل يأتي من <b>التسليح</b>: يُرسم لكل طابق، فعشرة '
      + 'طوابق عشرة أضعاف. وأثقل بند رباط الكراسي — <span class="cost">ثلاث قطع '
      + 'بكل كرسي</span>. والإعداد يُحفظ بمتصفّحك ويبقى بين الجلسات.'
      + '<br><b>لا يتغيّر التصميم ولا رقم واحد منه</b> — العرض وحده.</div>';
  }

  var host = null;

  function mount(parent) {
    injectCSS();
    if (!parent) return;
    close();
    host = document.createElement('div');
    host.className = 'v3set';
    host.innerHTML = panelHTML();
    parent.appendChild(host);
    bind();
  }

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function isOpen() { return !!host; }

  /** الزرّ يفتح ويغلق — ويُركَّب داخل حاوية المجسّم لا بالصفحة.
      يقبل عنصراً أو محدِّداً، ويقع على أقرب `.v3d` إن لم يُعطَ شيء. */
  function toggle(target) {
    if (isOpen()) { close(); return false; }
    var p = null;
    if (target && target.nodeType === 1) p = target;
    else if (typeof target === 'string') p = document.querySelector(target);
    if (!p) p = document.querySelector('.v3d') || document.querySelector('#v3d');
    if (!p) return false;
    if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
    mount(p);
    return true;
  }

  function bind() {
    var g = function (i) { return document.getElementById(i); };
    var num = function (i, k) {
      var e = g(i); if (!e) return;
      e.onchange = function () { set(k, parseFloat(e.value)); };
    };
    var chk = function (i, k) {
      var e = g(i); if (!e) return;
      e.onchange = function () { set(k, !!e.checked); };
    };
    num('v3s_fl', 'floors'); num('v3s_sg', 'seg'); num('v3s_dp', 'dpr');
    chk('v3s_ti', 'ties'); chk('v3s_sp', 'spacers'); chk('v3s_sh', 'shadows');
  }

  /** المقابض التي تمسّ **الهندسة** تُوجب إعادة بناء التسليح، وغيرها لا. */
  var GEOMETRIC = { seg: 1, floors: 1, ties: 1, spacers: 1 };

  function set(k, v) {
    var s = load();
    if (s[k] === v) return;
    s[k] = v;
    s.preset = matchPreset(s);
    save();
    if (host) {
      host.querySelectorAll('.pre button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.p === s.preset);
      });
    }
    apply(!!GEOMETRIC[k]);
  }

  function matchPreset(s) {
    for (var k in PRESETS) {
      var p = PRESETS[k], same = true;
      for (var f in p) if (p[f] !== s[f]) { same = false; break; }
      if (same) return k;
    }
    return 'custom';
  }

  function preset(k) {
    var p = PRESETS[k];
    if (!p) return;
    var s = load();
    for (var f in p) s[f] = p[f];
    s.preset = k;
    save();
    if (host) { host.innerHTML = panelHTML(); bind(); }
    apply(true);
  }

  /** يُنفِّذ الإعداد على المشهد. `rebuild` حين تتغيّر الهندسة. */
  function apply(rebuild) {
    var V = global.V3;
    if (!V) return;
    try { if (V.renderQuality) V.renderQuality(load()); } catch (e) {}
    if (rebuild) { try { if (V.rebuildRebar) V.rebuildRebar(); } catch (e) {} }
  }

  global.V3SET = { get: get, set: set, preset: preset, apply: apply,
                   floorOn: floorOn, seg: seg, toggle: toggle, close: close,
                   isOpen: isOpen, PRESETS: PRESETS, DEF: DEF };
})(typeof window !== 'undefined' ? window : globalThis);
