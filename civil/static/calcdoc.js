/* ============================================================================
   calcdoc.js — عارض «اشتقاق الحساب خطوةً خطوة»

   يعرض وثيقة الحساب القادمة من `/api/calcdoc` بالشكل الذي يدرَّس به فعلاً:
   المعادلة الرمزية بارزةً، ثم التعويض بالأرقام، ثم الناتج، ثم رقم البند
   الكودي ونصّ ما يفرضه ولماذا.

   مستقلّ: لا يعتمد على حالة أي صفحة، ويُستدعى من معالج المشروع ومن قسم
   التحليل معاً. الحساب نفسه يجري في `calcdoc.py` — مصدرٌ واحد لا نسختان.
   ========================================================================= */
(function (global) {
  'use strict';

  var CSS = [
    '.cdoc{--cl:#22304f}',
    '.cdoc-h{background:linear-gradient(90deg,rgba(56,189,248,.14),transparent);',
      'border:1px solid rgba(56,189,248,.3);border-radius:11px;padding:12px 15px;margin-bottom:14px}',
    '.cdoc-h h4{margin:0 0 6px;font-size:15px;color:#fff}',
    '.cdoc-h p{margin:0;font-size:12.5px;color:#93a4c0;line-height:1.85}',
    '.cdoc-s{background:#101a2e;border:1px solid var(--cl);border-radius:11px;',
      'padding:13px 15px;margin-bottom:12px;position:relative}',
    '.cdoc-s.gov{border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.05)}',
    '.cdoc-s.fail{border-color:rgba(248,113,113,.55);background:rgba(248,113,113,.05)}',
    '.cdoc-s.warn{border-color:rgba(251,191,36,.4)}',
    '.cdoc-n{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;',
      'border-radius:8px;background:#38bdf8;color:#04121f;font-weight:800;font-size:13px;',
      'margin-inline-end:9px;flex:0 0 26px}',
    '.cdoc-s.gov .cdoc-n{background:#fbbf24}.cdoc-s.fail .cdoc-n{background:#f87171;color:#fff}',
    '.cdoc-t{display:flex;align-items:center;font-size:13.5px;color:#fff;font-weight:600;',
      'margin-bottom:10px}',
    // المعادلة والتعويض **يسار-إلى-يمين دائماً**: المتّجه العربي يقلب المتباينة
    // فيصير «0.01 ≤ ρ ≤ 0.08» معروضاً «ρ ≤ 0.08 ≥ 0.01» — وهذا خطأ لا شكل.
    // والكلمات العربية داخل المعادلة تبقى صحيحة لأن كل مقطع يُعرض باتجاهه.
    '.cdoc-f{background:#070c18;border:1px solid var(--cl);border-radius:9px;padding:12px 14px;',
      'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#7dd3fc;',
      'text-align:center;line-height:2.1;white-space:pre;direction:ltr;',
      'unicode-bidi:isolate;margin-bottom:9px;overflow-x:auto}',
    '.cdoc-sub{background:#0a1020;border-inline-start:3px solid #38bdf8;border-radius:0 8px 8px 0;',
      'padding:9px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;',
      'color:#cbd5e1;line-height:1.95;white-space:pre-wrap;margin-bottom:9px;',
      'direction:ltr;unicode-bidi:isolate;text-align:start;overflow-x:auto}',
    // النتيجة قيمةٌ ووحدة: يسار-إلى-يمين، وإلّا عُرضت «kPa 150.0».
    '.cdoc-r{display:inline-block;background:rgba(52,211,153,.14);border:1px solid rgba(52,211,153,.45);',
      'border-radius:9px;padding:7px 14px;font-size:15px;font-weight:800;color:#34d399;',
      'direction:ltr;unicode-bidi:isolate}',
    '.cdoc-s.fail .cdoc-r{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.5);color:#f87171}',
    '.cdoc-s.warn .cdoc-r,.cdoc-s.gov .cdoc-r{background:rgba(251,191,36,.13);',
      'border-color:rgba(251,191,36,.45);color:#fbbf24}',
    '.cdoc-c{margin-top:11px;padding-top:10px;border-top:1px dashed var(--cl)}',
    '.cdoc-b{display:inline-block;background:#16233d;border:1px solid var(--cl);border-radius:7px;',
      'padding:3px 10px;font-size:11.5px;color:#7dd3fc;font-weight:700;margin-bottom:6px}',
    '.cdoc-s.gov .cdoc-b{background:rgba(251,191,36,.15);border-color:rgba(251,191,36,.45);color:#fbbf24}',
    '.cdoc-x{font-size:12.5px;color:#93a4c0;line-height:1.9;margin:0}',
    '.cdoc-refs{background:#0a1020;border:1px solid var(--cl);border-radius:10px;padding:11px 14px}',
    '.cdoc-refs b{color:#e6edf7;font-size:12.5px}',
    '.cdoc-refs ul{margin:6px 0 0;padding-inline-start:18px;color:#93a4c0;font-size:12px;line-height:1.95}',
    '.cdoc-sum{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:13px}',
    '.cdoc-sum div{background:#121d33;border:1px solid var(--cl);border-radius:10px;padding:9px 13px}',
    '.cdoc-sum span{display:block;font-size:11px;color:#93a4c0}',
    '.cdoc-sum b{font-size:16px;color:#fff;display:block}',
    '.cdoc-sum b.l{direction:ltr;unicode-bidi:isolate;text-align:start}',
    '@media(max-width:700px){.cdoc-f{font-size:12.5px;padding:10px}.cdoc-sub{font-size:11px}}'
  ].join('');

  function inject() {
    if (document.getElementById('calcdoc-css')) return;
    var s = document.createElement('style');
    s.id = 'calcdoc-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }
  /** يسمح بـ <b> وحده — تهريبٌ كامل ثمّ إعادة الوسم الواحد المسموح. */
  function rich(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b style="color:#e6edf7">$1</b>')
      .replace(/&lt;b&gt;/g, '<b style="color:#e6edf7">')
      .replace(/&lt;\/b&gt;/g, '</b>');
  }

  function stepHTML(st) {
    var cls = ['ok', 'info'].indexOf(st.state) >= 0 ? '' : ' ' + st.state;
    return '<div class="cdoc-s' + cls + '">'
      + '<div class="cdoc-t"><span class="cdoc-n">' + esc(st.n) + '</span>'
      + esc(st.title) + '</div>'
      + (st.formula ? '<div class="cdoc-f">' + esc(st.formula) + '</div>' : '')
      + (st.subst ? '<div class="cdoc-sub">' + esc(st.subst) + '</div>' : '')
      + (st.result ? '<div><span class="cdoc-r">' + esc(st.result)
          + (st.unit ? ' ' + esc(st.unit) : '') + '</span></div>' : '')
      + (st.clause || st.code
        ? '<div class="cdoc-c">'
          + (st.clause ? '<div class="cdoc-b">📕 ' + esc(st.clause) + '</div>' : '')
          + (st.code ? '<p class="cdoc-x">' + rich(st.code) + '</p>' : '')
          + '</div>' : '')
      + '</div>';
  }

  /** يرسم وثيقة حساب كاملة. */
  function render(doc, opt) {
    inject();
    opt = opt || {};
    if (!doc || !doc.steps) return '<div class="note">لا توجد تفاصيل.</div>';
    var sum = '';
    if (opt.summary && opt.summary.length) {
      // x = [العنوان, القيمة, 'ltr'؟] — الأبعاد والأقطار تُعرض يسار-إلى-يمين
      // وإلّا قُرئ المقطع 300×400 معروضاً 400×300.
      sum = '<div class="cdoc-sum">' + opt.summary.map(function (x) {
        return '<div><span>' + esc(x[0]) + '</span><b'
          + (x[2] === 'ltr' ? ' class="l"' : '') + '>' + esc(x[1]) + '</b></div>';
      }).join('') + '</div>';
    }
    return '<div class="cdoc">'
      + (opt.noHead ? '' : '<div class="cdoc-h"><h4>' + esc(doc.title) + '</h4>'
        + (doc.intro ? '<p>' + rich(doc.intro) + '</p>' : '')
        + (opt.note ? '<p style="margin-top:6px;color:#fbbf24">ℹ️ ' + rich(opt.note)
            + '</p>' : '') + '</div>')
      + sum
      + doc.steps.map(stepHTML).join('')
      + (doc.refs && doc.refs.length
        ? '<div class="cdoc-refs"><b>البنود المعتمَدة</b><ul>'
          + doc.refs.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('')
          + '</ul></div>' : '')
      + '</div>';
  }

  /** يطلب وثيقة من الخادم. */
  function fetchDoc(payload) {
    return fetch('/api/calcdoc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  /** يرسم عدّة وثائق متتابعة في عنصر واحد. */
  function renderAll(docs, opt) {
    inject();
    return docs.filter(Boolean).map(function (d, i) {
      return render(d, i === 0 ? opt : {});
    }).join('<div style="height:10px"></div>');
  }

  /** يجلب ويرسم — مع رسالة انتظار وخطأ واضحين. */
  function into(el, payloads, opt) {
    if (!el) return Promise.resolve();
    inject();
    el.innerHTML = '<div class="note">جارٍ اشتقاق الحساب…</div>';
    return Promise.all(payloads.map(fetchDoc)).then(function (docs) {
      var bad = docs.filter(function (d) { return d && d.error; });
      if (bad.length) {
        el.innerHTML = '<div class="note" style="color:var(--bad)">تعذّر: '
          + esc(bad[0].error) + '</div>';
        return;
      }
      el.innerHTML = renderAll(docs, opt);
    }).catch(function (e) {
      el.innerHTML = '<div class="note" style="color:var(--bad)">تعذّر الاتصال: '
        + esc(e) + '</div>';
    });
  }

  global.CALCDOC = { render: render, renderAll: renderAll, fetch: fetchDoc,
                     into: into, inject: inject, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
