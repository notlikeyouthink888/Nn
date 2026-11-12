/* ============================================================================
   qty.js — «من أين جاءت الكميات»

   الجداول تقول **كم**. هذه اللوحة تقول **كيف**: من أين جاء عدد الأسياخ،
   ولماذا هذا العدد من الكراسي بالذات، وكم سيخ سوق طوله 12 م يُشترى، وكم
   يذهب هدراً بالقصّ، وماذا كلّف كل بند. ومعها رسم يُرى لا جدولٌ يُقرأ.

   لا تحسب شيئاً بنفسها: تأخذ ما حسبه المعالج (`WZ`) وجدول التقطيع
   (`/api/bbs`) وتعرض **اشتقاقه**. فلا مصدر ثانٍ يتباعد عن الأول.
   ========================================================================= */
(function (global) {
  'use strict';

  var CSS = [
    '#qty .qh{background:linear-gradient(90deg,rgba(56,189,248,.12),transparent);',
      'border:1px solid rgba(56,189,248,.28);border-radius:11px;padding:12px 15px;',
      'margin-bottom:13px;font-size:12.5px;color:#93a4c0;line-height:1.95}',
    '#qty .qh b{color:#e6edf7}',
    '#qty .bar12{background:#070c18;border:1px solid var(--line);border-radius:10px;',
      'padding:13px;margin:10px 0}',
    '#qty .bar12 svg{width:100%;height:auto;display:block}',
    '#qty .lg{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--mut);',
      'margin-top:8px}',
    '#qty .lg i{display:inline-block;width:12px;height:12px;border-radius:3px;',
      'vertical-align:-2px;margin-inline-end:5px}',
    '#qty .pick{cursor:pointer;transition:.15s}',
    '#qty .pick:hover{background:rgba(56,189,248,.08)}',
    '#qty .det{background:#0a1020;border:1px solid var(--line);border-radius:10px;',
      'padding:12px 14px;margin-top:10px;font-size:12.5px;line-height:1.95}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('qty-css')) return;
    var s = document.createElement('style');
    s.id = 'qty-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }
  function nf(x, n) {
    if (x === null || x === undefined || isNaN(x)) return '—';
    n = n === undefined ? 2 : n;
    return (+x).toLocaleString('en-US', { minimumFractionDigits: n,
                                          maximumFractionDigits: n });
  }
  var i0 = function (x) { return nf(x, 0); };
  function ltr(v) { return '<span dir="ltr" style="display:inline-block">' + v + '</span>'; }

  function kpi(l, v, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v
      + '</div><div class="l">' + l + '</div></div>';
  }
  function tbl(head, rows, cls) {
    return '<div style="overflow-x:auto"><table' + (cls ? ' class="' + cls + '"' : '')
      + '><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
          var at = r.__attr || '';
          var cells = (r.__cells || r);
          return '<tr ' + at + '>'
            + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
  }

  /* ─────────── رسم قصّ سيخ السوق 12 م ─────────── */
  /** يرسم سيخ السوق وكيف قُطِّع: القطع المستعملة والكسرة المتبقّية. */
  function stockSVG(stock, piece, pieces, waste) {
    var W = 720, H = 74, pad = 8;
    var sc = (W - 2 * pad) / stock;
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    out += '<rect x="' + pad + '" y="22" width="' + (stock * sc) + '" height="20" rx="4" '
      + 'fill="#16233d" stroke="#22304f"/>';
    var x = pad, i;
    for (i = 0; i < pieces; i++) {
      out += '<rect x="' + x + '" y="22" width="' + Math.max(1, piece * sc - 2)
        + '" height="20" rx="3" fill="#e8443a" opacity="' + (i % 2 ? .82 : 1) + '"/>'
        + '<text x="' + (x + piece * sc / 2) + '" y="36" fill="#fff" font-size="10.5" '
        + 'text-anchor="middle">' + nf(piece, 2) + '</text>';
      x += piece * sc;
    }
    if (waste > 0.01) {
      out += '<rect x="' + x + '" y="22" width="' + Math.max(1, waste * sc - 1)
        + '" height="20" rx="3" fill="#7c2d12" stroke="#f87171" stroke-dasharray="3 2"/>';
      if (waste * sc > 34)
        out += '<text x="' + (x + waste * sc / 2) + '" y="36" fill="#fca5a5" '
          + 'font-size="10" text-anchor="middle">' + nf(waste, 2) + '</text>';
    }
    out += '<text x="' + pad + '" y="16" fill="#93a4c0" font-size="11">'
      + 'سيخ السوق ' + nf(stock, 0) + ' م</text>';
    out += '<line x1="' + pad + '" x2="' + (pad + stock * sc) + '" y1="52" y2="52" '
      + 'stroke="#334155"/>';
    for (i = 0; i <= stock; i++) {
      out += '<line x1="' + (pad + i * sc) + '" x2="' + (pad + i * sc)
        + '" y1="48" y2="56" stroke="#475569"/>'
        + '<text x="' + (pad + i * sc) + '" y="68" fill="#64748b" font-size="9" '
        + 'text-anchor="middle">' + i + '</text>';
    }
    return out + '</svg>';
  }

  /* ─────────── رسم الكرسي بأبعاده ─────────── */
  function chairSVG(ch) {
    if (!ch || !ch.db) return '';
    var H = +ch.height || 200, foot = +ch.foot || 150, top = +ch.top_run || 250,
        tail = +ch.tail || 60, db = +ch.db || 10;
    var W = 460, VH = 200, sc = Math.min((W - 130) / (top + 2 * foot), (VH - 70) / (H + 40));
    var x0 = 70, y0 = VH - 35;
    var pts = [
      [x0, y0], [x0 + foot * sc, y0],
      [x0 + foot * sc, y0 - H * sc], [x0 + (foot + top) * sc, y0 - H * sc],
      [x0 + (foot + top) * sc, y0], [x0 + (2 * foot + top) * sc, y0]
    ];
    var d = 'M' + pts.map(function (p) { return nf(p[0], 1) + ',' + nf(p[1], 1); }).join(' L');
    var o = '<svg viewBox="0 0 ' + W + ' ' + VH + '">';
    o += '<line x1="' + (x0 - 22) + '" x2="' + (W - 12) + '" y1="' + y0 + '" y2="' + y0
      + '" stroke="#f87171" stroke-width="2.5"/>'
      + '<text x="' + (x0 - 26) + '" y="' + (y0 + 13) + '" fill="#fca5a5" font-size="10" '
      + 'text-anchor="end">الشبكة السفلى</text>';
    var yT = y0 - H * sc;
    o += '<line x1="' + (x0 - 22) + '" x2="' + (W - 12) + '" y1="' + yT + '" y2="' + yT
      + '" stroke="#38bdf8" stroke-width="2.5"/>'
      + '<text x="' + (x0 - 26) + '" y="' + (yT - 5) + '" fill="#7dd3fc" font-size="10" '
      + 'text-anchor="end">الشبكة العلوية</text>';
    o += '<path d="' + d + '" fill="none" stroke="#34d399" stroke-width="'
      + Math.max(2.5, db * sc) + '" stroke-linejoin="round" stroke-linecap="round"/>';
    // كوتة الارتفاع
    var xd = x0 + (2 * foot + top) * sc + 16;
    o += '<line x1="' + xd + '" x2="' + xd + '" y1="' + yT + '" y2="' + y0
      + '" stroke="#fbbf24"/>'
      + '<text x="' + (xd + 5) + '" y="' + ((yT + y0) / 2) + '" fill="#fbbf24" '
      + 'font-size="11" dir="ltr">' + i0(H) + ' مم</text>';
    o += '<text x="' + (x0 + foot * sc / 2) + '" y="' + (y0 + 26) + '" fill="#93a4c0" '
      + 'font-size="10" text-anchor="middle" dir="ltr">قدم ' + i0(foot) + '</text>';
    o += '<text x="' + (x0 + (foot + top / 2) * sc) + '" y="' + (yT - 8) + '" '
      + 'fill="#93a4c0" font-size="10" text-anchor="middle" dir="ltr">عرضة '
      + i0(top) + '</text>';
    o += '<text x="' + (W - 12) + '" y="18" fill="#64748b" font-size="10" '
      + 'text-anchor="end">طرف طافر ' + i0(tail) + ' مم لكل قدم</text>';
    return o + '</svg>';
  }

  /* ─────────────────────── اللوحة ─────────────────────── */

  var DATA = null;

  function head(W, bbs) {
    var st = bbs && bbs.stock ? bbs.stock : 12;
    return '<div class="qh">هذه اللوحة <b>لا تحسب شيئاً جديداً</b>: تأخذ ما صمّمه '
      + 'المعالج وجدول التقطيع وتُريك <b>من أين جاء كل رقم</b> — كم سيخ سوق طوله '
      + '<b>' + nf(st, 0) + ' م</b> يُشترى، وكم يذهب هدراً بالقصّ، ولماذا هذا العدد '
      + 'من الكراسي بالذات، وماذا كلّف كل بند.</div>';
  }

  /** أسياخ السوق لصفّ واحد: كم قطعة تخرج من السيخ، وكم سيخاً يلزم.
      الكسرة **لا تُنقل** بين البنود — تُشترى أسياخ كل بند على حدة، وهذا هو
      حال الموقع غالباً. ولو جُمعت الكسر لنزل العدد، فالرقم هنا الجانب الآمن. */
  function stockOf(r, stock) {
    var piece = Math.max(0.05, r.piece || r.run || 0);
    var per = Math.max(1, Math.floor(stock / piece));     // قطع من السيخ الواحد
    var need = (r.count || 0) * (r.pieces || 1);          // كل القطع المطلوبة
    return { per: per, need: need, bars: Math.ceil(need / per),
             off: stock - per * piece, piece: piece };
  }

  function kpis(W, bbs) {
    var chS = (W.model.slab || {}).chairs || {}, chF = (W.model.found || {}).chairs || {};
    var floors = W.model.floors || 1;
    var nChair = (chS.n || 0) * floors + (chF.n || 0);
    var stock = bbs.stock || 12;
    var totLen = (bbs.rows || []).reduce(function (a, r) { return a + (r.total_len || 0); }, 0);
    // `waste` بالصفّ **مجموع** الصفّ أصلاً (`c['waste'] * count` بـ bbs.py)،
    // فضربه بالعدد مرّة أخرى يعطي رقماً أكبر من طول الحديد كلّه.
    var waste = (bbs.rows || []).reduce(function (a, r) { return a + (r.waste || 0); }, 0);
    var nStock = (bbs.rows || []).reduce(function (a, r) {
      return a + stockOf(r, stock).bars; }, 0);
    return '<div class="grid g4">'
      + kpi('حديد التسليح كلّه', nf(bbs.total_ton, 2) + ' طن', 'ok')
      + kpi('أسياخ سوق ' + nf(stock, 0) + ' م', i0(nStock) + ' سيخ')
      + kpi('طول الحديد الكلّي', i0(totLen) + ' م')
      + kpi('الهدر بالقصّ', nf(waste, 1) + ' م', waste > totLen * .05 ? 'warn' : 'ok')
      + kpi('وزن الوصلات', nf(bbs.lap_weight, 2) + ' طن · '
          + nf(bbs.lap_pct, 1) + '%', 'warn')
      + kpi('الكراسي', i0(nChair) + ' كرسي')
      + kpi('بسكويت الغطاء', i0((chS.spacers || 0) * floors + (chF.spacers || 0)) + ' قطعة')
      + kpi('كلفة تقديرية', i0((W.boq && W.boq.total) || 0) + ' د.ع')
      + '</div>';
  }

  /** الصف الحاكم بجدول التقطيع — أطول قطعة، وهي التي يُرسم قصّها. */
  function govRow(bbs) {
    var best = null;
    (bbs.rows || []).forEach(function (r) {
      if (!best || (r.total_len || 0) > (best.total_len || 0)) best = r;
    });
    return best;
  }

  function cutCard(bbs) {
    var r = govRow(bbs);
    if (!r) return '';
    var stock = bbs.stock || 12;
    var k = stockOf(r, stock);
    return '<div class="card" style="margin-top:14px"><h3>من الطول المطلوب إلى سيخ السوق — '
      + esc(r.elem) + '</h3>'
      + '<p style="font-size:12.5px;color:var(--mut);line-height:1.9;margin:0 0 4px">'
      + 'خطوتان لا واحدة: <b>أولاً</b> يُقسَّم طول السيخ المطلوب على أطوال السوق '
      + 'بوصلات إن لزم، <b>وثانياً</b> تُقصّ القطع الناتجة من أسياخ ' + nf(stock, 0)
      + ' م فتظهر الكسرة.</p>'
      + '<div class="bar12">' + stockSVG(stock, k.piece, k.per, k.off) + '</div>'
      + '<div class="lg"><span><i style="background:#e8443a"></i>قطع مستعملة ('
      + k.per + ' من السيخ)</span>'
      + '<span><i style="background:#7c2d12;border:1px dashed #f87171"></i>كسرة '
      + nf(k.off, 2) + ' م</span></div>'
      + tbl(['البند', 'القيمة', 'من أين'], [
        ['طول السيخ الواحد المطلوب', ltr(nf(r.run, 2) + ' م'),
         'طول العنصر' + (r.hook0 ? ' + عكفة بداية ' + nf(r.hook0, 2) + ' م' : '')],
        ['قطع لكل سيخ', ltr(i0(r.pieces) + (r.pieces > 1 ? ' قطعة موصولة' : ' قطعة')),
         r.pieces > 1
           ? 'أطول من سيخ السوق (' + nf(stock, 0) + ' م) فيُقسَّم ويُوصل'
           : 'أقصر من سيخ السوق — لا تقسيم'],
        ['طول القطعة', ltr(nf(r.piece, 2) + ' م'),
         r.pieces > 1 ? '(' + nf(r.run, 2) + ' + ' + (r.pieces - 1) + '×'
             + nf(r.lap_len, 2) + ') ÷ ' + r.pieces + ' — التقسيم يضيف وصلة لكل فاصل'
           : 'نفس الطول المطلوب'],
        ['الوصلات', ltr(i0(r.laps) + ' وصلة'),
         r.laps ? 'وصلة بطول ' + nf(r.lap_len, 2) + ' م لكل فاصل × '
             + i0(r.count) + ' سيخ' : 'لا وصل'],
        ['الهدر', ltr(nf(r.waste, 1) + ' م'), 'من التقسيم — محسوب بجدول التقطيع'],
        ['العدد', ltr(i0(r.count) + ' سيخ = ' + i0(k.need) + ' قطعة'), 'من التصميم'],
        ['قطع من سيخ السوق', ltr('⌊' + nf(stock, 0) + ' ÷ ' + nf(k.piece, 2) + '⌋ = '
            + k.per), 'التقريب <b>لأدنى</b> — ما لا يكتمل لا يُقصّ'],
        ['أسياخ سوق لهذا البند', ltr('⌈' + i0(k.need) + ' ÷ ' + k.per + '⌉ = '
            + i0(k.bars) + ' سيخ'), 'التقريب <b>لأعلى</b> — نصف سيخ يُشترى سيخاً'],
        ['الطول الكلّي', ltr(nf(r.total_len, 1) + ' م'), 'شاملاً أطوال الوصلات'],
        ['الوزن', ltr(nf(r.weight, 1) + ' كغم'), 'الطول × وزن المتر للقطر Ø' + r.db]])
      + '<div class="note">الكسرة هنا <b>لا تُنقل</b> بين البنود: يُحسب لكل بند '
      + 'أسياخه وحده، وهو الجانب الآمن. ولو جُمعت الكسر بالموقع نزل العدد.</div>'
      + '</div>';
  }

  function steelCard(W) {
    var rows = [];
    var bx = (W.model.beams || {}).x, by = (W.model.beams || {}).y;
    [['جسور X', bx], ['جسور Y', by]].forEach(function (p) {
      var m = p[1];
      if (!m || !m.rebar) return;
      rows.push([p[0] + ' — سفلي (وسط البحر)', ltr(m.rebar.bottom.label),
        ltr(i0(m.rebar.bottom.As) + ' مم²'), 'شدّ بالوجه السفلي — العزم موجب']);
      rows.push([p[0] + ' — علوي (فوق المسند)', ltr(m.rebar.top.label),
        ltr(i0(m.rebar.top.As) + ' مم²'), 'شدّ بالوجه العلوي — العزم سالب']);
      rows.push([p[0] + ' — أساور', ltr(m.rebar.stirrup.label), '—',
        'قصّ + حصر اللبّ + منع انبعاج الطولي']);
    });
    var sl = W.model.slab || {}, msh = sl.mesh || {};
    if (msh.short) rows.push(['السقف — فرش (الاتجاه القصير)', ltr(msh.short.label),
      ltr(i0(msh.short.As_m) + ' مم²/م'), 'الطبقة الأولى من الأسفل — عمقها الفعّال الأكبر']);
    if (msh.long) rows.push(['السقف — غطاء (الاتجاه الطويل)', ltr(msh.long.label),
      ltr(i0(msh.long.As_m) + ' مم²/م'), 'الطبقة الثانية فوق الفرش']);
    if (msh.top) rows.push(['السقف — علوي فوق المساند', ltr(msh.top.label),
      ltr(i0(msh.top.As_m) + ' مم²/م'), 'يمتدّ L/4 لكل جهة ثم يُقطع']);
    var c = W.model.col || {};
    if (c.rebar) {
      rows.push(['الأعمدة — طولي', ltr(c.rebar.n + 'Ø' + c.rebar.db),
        ltr(i0(c.rebar.Ast) + ' مم²'), 'ρ = ' + nf(c.rebar.rho * 100, 2) + '% (الحدّ 1–8%)']);
      rows.push(['الأعمدة — أساور', ltr('Ø' + c.rebar.tie_db + '@' + i0(c.rebar.tie_s)),
        '—', 'وتضيق إلى ' + i0(c.rebar.tie_s_conf) + ' مم بمنطقة التطويق ℓo = '
        + i0(c.rebar.conf_len) + ' مم']);
    }
    var t = (W.design || {}).typical;
    if (t) {
      rows.push(['الأساس — سفلي', ltr('Ø' + t.bar_db + ' @ ' + i0(t.spacing) + ' مم'),
        ltr(i0(t.As) + ' مم²/م'), 'الشدّ بالوجه السفلي — الكابولي يخرج من العمود']);
      var tp = t.top || {};
      rows.push(['الأساس — علوي', tp.needed ? ltr(tp.label) : '— لا يوجد',
        tp.needed ? ltr(i0(tp.As) + ' مم²/م') : '—',
        tp.needed ? (tp.why || '') : (tp.why || 'القاعدة رقيقة — لا شدّ بالوجه العلوي')]);
    }
    return '<div class="card" style="margin-top:14px"><h3>حديد كل عنصر — البوتوم والتوب</h3>'
      + tbl(['العنصر', 'التفصيل', 'المساحة', 'لماذا هنا'], rows) + '</div>';
  }

  function chairCard(W) {
    var chS = (W.model.slab || {}).chairs || {}, chF = (W.model.found || {}).chairs || {};
    var floors = W.model.floors || 1;
    var rows = [];
    function row(nm, ch, mult) {
      if (!ch || !ch.n) {
        rows.push([nm, '—', '—', '—', '—', esc((ch && ch.note) || 'لا كراسي')]);
        return;
      }
      rows.push([nm, ltr(i0(ch.n) + (mult > 1 ? ' × ' + mult + ' طابق' : '')),
        ltr(i0(ch.height) + ' مم'), ltr('Ø' + ch.db),
        ltr(nf((ch.len_each || 0), 2) + ' م'),
        ltr(nf((ch.weight || 0) * mult, 3) + ' طن')]);
    }
    row('كراسي السقوف', chS, floors);
    row('كراسي الأساس', chF, 1);
    var ch = (chS && chS.db) ? chS : chF;
    return '<div class="card" style="margin-top:14px"><h3>الكراسي — العدد والارتفاع ولماذا</h3>'
      + tbl(['الموضع', 'العدد', 'الارتفاع الصافي', 'القطر', 'طول القطعة', 'الوزن'], rows)
      + (ch && ch.db ? '<div class="bar12" style="margin-top:12px">' + chairSVG(ch) + '</div>' : '')
      + '<div class="note">الارتفاع الصافي = سماكة العنصر − الغطاءين − أقطار الشبكتين، '
      + 'وهو <b>ما يحدّد العمق الفعّال d</b>. فلو ارتفع الكرسي نقص الغطاء العلوي، '
      + 'ولو نزل نقص d وسقطت مقاومة العزم. '
      + esc((chS && chS.note) || (chF && chF.note) || '') + '</div></div>';
  }

  function costCard(W) {
    var rows = (W.boq && W.boq.rows) || [];
    if (!rows.length) return '';
    var tot = rows.reduce(function (a, r) { return a + (r.cost || 0); }, 0) || 1;
    var body = rows.map(function (r, i) {
      var pct = (r.cost || 0) / tot * 100;
      return { __attr: 'class="pick" onclick="QTY.item(' + i + ')"',
        __cells: [esc(r.name), ltr(nf(r.q, 2) + ' ' + r.unit),
          ltr(i0(r.rate)), ltr(i0(r.cost)),
          '<div style="background:#16233d;border-radius:4px;height:9px;width:90px">'
          + '<div style="background:' + (pct > 25 ? '#f87171' : pct > 12 ? '#fbbf24' : '#34d399')
          + ';height:9px;border-radius:4px;width:' + Math.min(100, pct) + '%"></div></div> '
          + nf(pct, 1) + '%'] };
    });
    var el = W.model && W.model.elevator;
    return '<div class="card" style="margin-top:14px"><h3>الكلفة — أي بند كلّف كم</h3>'
      + tbl(['البند', 'الكمية', 'السعر', 'الكلفة (د.ع)', 'الحصة'], body)
      + '<div class="note">اضغط أي صفّ ليُفصَّل. الأسعار استرشادية بالدينار العراقي '
      + 'وتُغيَّر من صفحة الكميات.</div>'
      + '<div id="qty_item"></div>'
      + (el ? elevCard(el, (W.boq && W.boq.rates) || null) : '<div class="note" style="margin-top:10px">'
          + '<b>لا مصعد بهذا المشروع.</b> أضِف مصعداً من زرّ «🛗 أضف مصعد» فوق '
          + 'المجسّم، وستظهر هنا مواده وكلفته وحديده بأشكاله.</div>')
      + '</div>';
  }

  /** المصعد: ماذا استُعمل فيه بالضبط، وكم كلّف، وبأي أشكال حديد. */
  function elevCard(el, rates) {
    var w = el.wall || {}, rows = [];
    var per = 4 * ((el.w || 0) + (el.h || 0)) / 2;        // محيط تقريبي للنواة
    var t = (w.t || el.t || 200) / 1000;
    var conc = el.conc || (per * t * (el.H || 0));
    var steelT = el.steel || conc * 0.11;                 // نسبة حديد نواة القصّ
    // الأدوات = ما يُشترى فعلاً
    rows.push(['🧱 خرسانة النواة', ltr(nf(conc, 2) + ' م³'),
      'جدران بسماكة ' + i0(w.t || el.t || 200) + ' مم على ارتفاع '
      + nf(el.H || 0, 2) + ' م']);
    rows.push(['🧵 الحديد الرأسي', ltr((w.vert && w.vert.label) || '—'),
      'يقاوم الانحناء بمستوى الجدار · ρ = ' + nf((w.rho_l || 0) * 100, 3) + '%']);
    rows.push(['🧵 الحديد الأفقي', ltr((w.horiz && w.horiz.label) || '—'),
      'يقاوم القصّ · ρ = ' + nf((w.rho_t || 0) * 100, 3) + '%']);
    if (w.be) rows.push(['🔩 عنصر الحدّ (Boundary)', ltr(w.be.label || '—'),
      'بطرفَي الجدار حيث الإجهاد أقصى — ACI 318-19 §18.10.6']);
    if (w.be_tie_s) rows.push(['🔗 تطويق عنصر الحدّ', ltr('Ø10 @ ' + i0(w.be_tie_s) + ' مم'),
      'يحصر الخرسانة ويمنع انبعاج الطولي بعد انقشار الغطاء (§18.10.6.4)']);
    if (el.pit) rows.push(['🕳️ حفرة البئر (Pit)', ltr(nf(el.pit, 2) + ' م'),
      'تنزل تحت منسوب التأسيس — تحتاج عزلاً وجدران حجز']);
    if (el.pit_slab) rows.push(['⬛ بلاطة قاع البئر', ltr(i0(el.pit_slab) + ' مم'),
      'تُفحص بالثقب تحت المصدّات']);
    if (el.over) rows.push(['⬆️ الارتفاع العلوي (Overrun)', ltr(nf(el.over, 2) + ' م'),
      'فوق أعلى منسوب وقوف — تفرضه مواصفة المورّد']);
    rows.push(['⬇️ الحمل على أساس الجدران', ltr(i0(el.on_found || 0) + ' kN'),
      'يُصمَّم له أساس النواة']);
    // الكلفة بنفس أسعار جدول الكميات
    var rc = (rates && rates.conc) || 150000, rs = (rates && rates.steel) || 1500000;
    var cc = conc * rc, cs = steelT * rs;
    return '<div class="det"><b>🛗 المصعد — ماذا استُعمل فيه وكم كلّف</b>'
      + tbl(['الأداة / المادة', 'المقدار', 'لماذا'], rows)
      + '<div style="height:8px"></div>'
      + tbl(['بند الكلفة', 'الكمية', 'السعر', 'الكلفة (د.ع)'], [
        ['خرسانة النواة', ltr(nf(conc, 2) + ' م³'), ltr(i0(rc)), ltr(i0(cc))],
        ['حديد النواة', ltr(nf(steelT, 3) + ' طن'), ltr(i0(rs)), ltr(i0(cs))],
        ['<b>المجموع الإنشائي</b>', '—', '—', '<b>' + ltr(i0(cc + cs)) + '</b>']])
      + '<div class="note">هذه كلفة <b>النواة الإنشائية</b> وحدها — الخرسانة '
      + 'والحديد. أمّا الماكينة والسيارة والأبواب والتحكّم فمن <b>المورّد</b> '
      + 'بعقد منفصل، ولا تدخل جدول الكميات الإنشائي.'
      + (el.supplier ? ' ' + esc(String(el.supplier).slice(0, 200)) : '') + '</div>'
      + '</div>';
  }

  /* ─────────────────────── الواجهة العامة ─────────────────────── */

  function html() {
    injectCSS();
    return '<div id="qty"><div class="note">جارٍ تجميع الكميات…</div></div>';
  }

  function render(W, bbs) {
    var host = document.getElementById('qty');
    if (!host) return;
    DATA = { W: W, bbs: bbs };
    host.innerHTML = head(W, bbs) + kpis(W, bbs) + cutCard(bbs)
      + steelCard(W) + chairCard(W) + costCard(W);
  }

  /** يجلب جدول التقطيع للمشروع الحالي ثم يرسم اللوحة. */
  function load(W) {
    injectCSS();
    var host = document.getElementById('qty');
    if (!W) {
      if (host) host.innerHTML = '<div class="note">شغّل معالج المشروع أولاً.</div>';
      return Promise.resolve();
    }
    if (host) host.innerHTML = '<div class="note">جارٍ تجميع الكميات…</div>';
    return fetch('/api/bbs', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // يُرسَل ناتج المعالج كما هو: `schedule` يقرأ منه حقولاً كثيرة
      // (footprint · canti · aci_extra …)، وانتقاء بعضها يكسره بصمت.
      body: JSON.stringify(W) })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (b && b.error) throw new Error(b.error);
        render(W, b);
      })
      .catch(function (e) {
        if (host) host.innerHTML = '<div class="note" style="color:var(--bad)">'
          + 'تعذّر تجميع الكميات: ' + esc(e.message || e) + '</div>';
      });
  }

  /** تفصيل بند كلفة عند الضغط عليه. */
  function item(i) {
    if (!DATA) return;
    var r = ((DATA.W.boq || {}).rows || [])[i];
    var e = document.getElementById('qty_item');
    if (!r || !e) return;
    e.innerHTML = '<div class="det"><b>' + esc(r.name) + '</b>'
      + tbl(['البند', 'القيمة'], [
        ['الكمية', ltr(nf(r.q, 3) + ' ' + r.unit)],
        ['السعر للوحدة', ltr(i0(r.rate) + ' د.ع/' + r.unit)],
        ['الكلفة', ltr(i0(r.cost) + ' د.ع')],
        ['المعادلة', ltr(nf(r.q, 3) + ' × ' + i0(r.rate) + ' = ' + i0(r.cost))]])
      + '</div>';
  }

  global.QTY = { html: html, load: load, item: item, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
