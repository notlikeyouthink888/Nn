/* ============================================================================
   وضع البناء الواقعي — الخامات والشدّة والطابوق ومراحل التنفيذ.

   الغاية: أن يشبه المشهد موقعاً حقيقياً لا رسماً تحليلياً — أرض عشب وتربة بنية
   وشدّة خشبية وطابوق وخرسانة رمادية بظلال شمس، وأن يمشي **بترتيب التنفيذ
   الفعلي** لا بإظهار طبقات: احفر ← ضنبان ← حديد ← شدّة ← صبّ ← فكّ ← ردم ←
   طابوق ← سقف.

   كل الخامات مولَّدة على كانفاس بدالة تجزئة **حتمية** — لا Math.random —
   فالمشهد يتكرّر بالضبط في كل مرة، وهذا مبدأ ثابت بالمشروع.
   ============================================================================ */
(function (global) {
  'use strict';

  /* دالة تجزئة حتمية في [0,1) — بديل Math.random */
  function h01(i, k) {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  const CACHE = {};
  function tex(key, w, h, draw, rx, ry) {
    if (CACHE[key]) return CACHE[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 4;
    CACHE[key] = t;
    return t;
  }

  /* ------------------------------- الخامات ------------------------------- */

  //: عشب — بقع خضراء متدرّجة بشُعيرات قصيرة
  const grass = (rx) => tex('grass' + rx, 256, 256, (g, W, H) => {
    g.fillStyle = '#6f8f3e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4200; i++) {
      const v = h01(i, 1);
      g.strokeStyle = 'hsl(' + (78 + v * 22) + ',' + (34 + v * 24) + '%,' +
        (24 + h01(i, 2) * 22) + '%)';
      g.lineWidth = 1;
      const x = h01(i, 3) * W, y = h01(i, 4) * H, a = (h01(i, 5) - .5) * 1.2;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.sin(a) * 4, y - 3 - h01(i, 6) * 4); g.stroke();
    }
  }, rx || 40, rx || 40);

  //: تربة محفورة — بنية داكنة بحبيبات وشقوق
  const soil = (rx) => tex('soil' + rx, 256, 256, (g, W, H) => {
    g.fillStyle = '#6b4a2f'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const v = h01(i, 1);
      g.fillStyle = 'hsl(' + (22 + v * 14) + ',' + (26 + v * 20) + '%,' +
        (14 + h01(i, 2) * 24) + '%)';
      const r = 1 + h01(i, 5) * 3;
      g.beginPath(); g.arc(h01(i, 3) * W, h01(i, 4) * H, r, 0, 6.283); g.fill();
    }
  }, rx || 6, rx || 6);

  //: رمل ردم — فاتح ناعم
  const sand = (rx) => tex('sand' + rx, 256, 256, (g, W, H) => {
    g.fillStyle = '#cbb188'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = h01(i, 2) > .5 ? 'rgba(255,255,255,.22)' : 'rgba(90,66,38,.20)';
      g.fillRect(h01(i, 3) * W, h01(i, 4) * H, 2, 2);
    }
  }, rx || 14, rx || 14);

  //: خرسانة — رمادية بمسام وبقع قوالب خفيفة
  const concrete = (rx) => tex('conc' + rx, 256, 256, (g, W, H) => {
    g.fillStyle = '#8e908d'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {
      const v = h01(i, 1);
      g.fillStyle = v > .5 ? 'rgba(255,255,255,' + (.05 + v * .10) + ')'
        : 'rgba(40,42,44,' + (.05 + v * .12) + ')';
      const r = .6 + h01(i, 5) * 2.2;
      g.beginPath(); g.arc(h01(i, 3) * W, h01(i, 4) * H, r, 0, 6.283); g.fill();
    }
    g.strokeStyle = 'rgba(60,62,64,.10)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = (i + .5) * H / 5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }, rx || 3, rx || 3);

  //: خرسانة نظافة (ضنبان) — أخشن وأغمق
  const blinding = () => tex('blind', 128, 128, (g, W, H) => {
    g.fillStyle = '#76756f'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = h01(i, 1) > .5 ? 'rgba(255,255,255,.10)' : 'rgba(30,30,30,.16)';
      g.fillRect(h01(i, 3) * W, h01(i, 4) * H, 2 + h01(i, 5) * 3, 2);
    }
  }, 4, 4);

  //: خشب الشدّة (بليوود) — لون رملي بعروق ولوح مقسّم
  const ply = (rx, ry) => tex('ply' + rx + 'x' + ry, 256, 256, (g, W, H) => {
    g.fillStyle = '#c9a06a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {                 // عروق الخشب
      const v = h01(i, 1);
      g.strokeStyle = 'rgba(' + (110 + v * 50) + ',' + (76 + v * 40) + ',' +
        (38 + v * 24) + ',' + (.22 + v * .22) + ')';
      g.lineWidth = .6 + h01(i, 2) * 1.6;
      const y = h01(i, 3) * H;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 16)
        g.lineTo(x, y + Math.sin((x / W) * 6.283 + i) * (1 + h01(i, 4) * 3));
      g.stroke();
    }
    g.strokeStyle = 'rgba(70,48,24,.55)'; g.lineWidth = 3;  // حدّ اللوح
    g.strokeRect(1.5, 1.5, W - 3, H - 3);
  }, rx || 1, ry || 1);

  //: خشب العروق (البواري/الجنائب) — أغمق وأخشن
  const timber = () => tex('timber', 128, 128, (g, W, H) => {
    g.fillStyle = '#a97c46'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = 'rgba(88,58,26,' + (.20 + h01(i, 1) * .3) + ')';
      g.lineWidth = 1 + h01(i, 2) * 2;
      const y = h01(i, 3) * H;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (h01(i, 4) - .5) * 6); g.stroke();
    }
  }, 2, 1);

  //: طابوق — مداميك بفواصل مونة، والإزاحة نصف طابوقة بين المدماكين
  const brick = (rx, ry) => tex('brick' + rx + 'x' + ry, 256, 256, (g, W, H) => {
    const rows = 8, bh = H / rows, bw = W / 4;
    g.fillStyle = '#c9bda8'; g.fillRect(0, 0, W, H);      // المونة
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < 5; c++) {
        const x = c * bw + off + 1.5, y = r * bh + 1.5;
        const v = h01(r * 10 + c, 1);
        g.fillStyle = 'hsl(' + (12 + v * 12) + ',' + (42 + v * 18) + '%,' +
          (36 + v * 14) + '%)';
        g.fillRect(x, y, bw - 3, bh - 3);
        // تفاوت داخل الطابوقة نفسها
        g.fillStyle = 'rgba(0,0,0,' + (.04 + h01(r * 10 + c, 2) * .10) + ')';
        g.fillRect(x, y + bh * .55, bw - 3, bh * .45 - 3);
      }
    }
  }, rx || 3, ry || 2);

  /* -------------------------- مصنع الخامات الجاهزة -------------------------- */
  const MATS = {};
  function mat(kind, opt) {
    opt = opt || {};
    const key = kind + '|' + JSON.stringify(opt);
    if (MATS[key]) return MATS[key];
    const T = THREE;
    let m;
    const base = { clippingPlanes: opt.clip ? [opt.clip] : undefined };
    switch (kind) {
      case 'grass':
        m = new T.MeshLambertMaterial(Object.assign({ map: grass(opt.rx) }, base)); break;
      case 'soil':
        m = new T.MeshLambertMaterial(Object.assign({ map: soil(opt.rx) }, base)); break;
      case 'sand':
        m = new T.MeshLambertMaterial(Object.assign({ map: sand(opt.rx) }, base)); break;
      case 'concrete':
        m = new T.MeshLambertMaterial(Object.assign({ map: concrete(opt.rx) }, base)); break;
      case 'blinding':
        m = new T.MeshLambertMaterial(Object.assign({ map: blinding() }, base)); break;
      case 'ply':
        m = new T.MeshLambertMaterial(Object.assign({ map: ply(opt.rx, opt.ry) }, base)); break;
      case 'timber':
        m = new T.MeshLambertMaterial(Object.assign({ map: timber() }, base)); break;
      case 'brick':
        m = new T.MeshLambertMaterial(Object.assign({ map: brick(opt.rx, opt.ry) }, base)); break;
      case 'steel':
        m = new T.MeshPhongMaterial(Object.assign({ color: 0x6b7078, shininess: 40 }, base)); break;
      default:
        m = new T.MeshLambertMaterial(Object.assign({ color: 0xcccccc }, base));
    }
    MATS[key] = m;
    return m;
  }

  /* ============================ عناصر الموقع ============================ */

  /** صندوق بخامة — مع ظلال */
  function slab(parent, w, h, d, x, y, z, material, info) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    if (info) m.userData = info;
    parent.add(m);
    return m;
  }

  /**
   * شدّة عنصر رأسي (عمود أو أساس): أربعة ألواح بليوود حول المقطع مع
   * **الجنائب** الأفقية (البواري) التي تشدّها كل 50 سم — هذا ما يظهر بالموقع.
   */
  function formBox(parent, w, d, h, x, y, z, opt) {
    opt = opt || {};
    const t = opt.t || 0.025;                       // سماكة اللوح
    const clip = opt.clip;
    const gp = new THREE.Group();
    const pw = mat('ply', { rx: Math.max(1, w / .6), ry: Math.max(1, h / .6), clip: clip });
    const pd = mat('ply', { rx: Math.max(1, d / .6), ry: Math.max(1, h / .6), clip: clip });
    slab(gp, w + 2 * t, h, t, 0, 0, d / 2 + t / 2, pw);
    slab(gp, w + 2 * t, h, t, 0, 0, -d / 2 - t / 2, pw);
    slab(gp, t, h, d, w / 2 + t / 2, 0, 0, pd);
    slab(gp, t, h, d, -w / 2 - t / 2, 0, 0, pd);
    // الجنائب الأفقية
    const tb = mat('timber', { clip: clip });
    const n = Math.max(1, Math.floor(h / .55));
    for (let i = 0; i < n; i++) {
      const yy = -h / 2 + (i + .5) * h / n;
      slab(gp, w + 2 * t + .09, .05, .05, 0, yy, d / 2 + t + .03, tb);
      slab(gp, w + 2 * t + .09, .05, .05, 0, yy, -d / 2 - t - .03, tb);
      slab(gp, .05, .05, d + 2 * t + .09, w / 2 + t + .03, yy, 0, tb);
      slab(gp, .05, .05, d + 2 * t + .09, -w / 2 - t - .03, yy, 0, tb);
    }
    gp.position.set(x, y, z);
    if (opt.info) gp.userData = opt.info;
    parent.add(gp);
    return gp;
  }

  /**
   * شدّة جسر: قاع (بطنية) + جانبان — يُبنى بمحور الجسر.
   * dir = 'x' أو 'z' · len الطول · w العرض · h العمق
   */
  function formBeam(parent, len, w, h, x, y, z, dir, opt) {
    opt = opt || {};
    const t = opt.t || 0.025, clip = opt.clip;
    const gp = new THREE.Group();
    const pl = mat('ply', { rx: Math.max(1, len / .6), ry: Math.max(1, h / .6), clip: clip });
    const pb = mat('ply', { rx: Math.max(1, len / .6), ry: Math.max(1, w / .6), clip: clip });
    if (dir === 'x') {
      slab(gp, len, t, w + 2 * t, 0, -h / 2 - t / 2, 0, pb);        // البطنية
      slab(gp, len, h, t, 0, 0, w / 2 + t / 2, pl);
      slab(gp, len, h, t, 0, 0, -w / 2 - t / 2, pl);
    } else {
      slab(gp, w + 2 * t, t, len, 0, -h / 2 - t / 2, 0, pb);
      slab(gp, t, h, len, w / 2 + t / 2, 0, 0, pl);
      slab(gp, t, h, len, -w / 2 - t / 2, 0, 0, pl);
    }
    gp.position.set(x, y, z);
    if (opt.info) gp.userData = opt.info;
    parent.add(gp);
    return gp;
  }

  /**
   * شدّة سقف: لوح بليوود + **عروق حاملة** تحته + **دعامات** (الشمعات) للأرض.
   * هذه أكثر مرحلة تُرى بالموقع ولا تظهر بأي رسم إنشائي.
   */
  function formDeck(parent, W, D, x, yTop, z, hFloor, opt) {
    opt = opt || {};
    const clip = opt.clip, t = 0.02;
    const gp = new THREE.Group();
    slab(gp, W, t, D, 0, -t / 2, 0, mat('ply', { rx: W / .8, ry: D / .8, clip: clip }));
    const tb = mat('timber', { clip: clip });
    const nj = Math.max(2, Math.round(D / .6));           // عروق بكل 60 سم
    for (let i = 0; i < nj; i++) {
      const zz = -D / 2 + (i + .5) * D / nj;
      slab(gp, W, .09, .06, 0, -t - .045, zz, tb);
    }
    const sp = Math.max(1.0, Math.min(1.4, hFloor / 2.4));  // تباعد الدعامات
    const nx = Math.max(2, Math.round(W / sp)), nz = Math.max(2, Math.round(D / sp));
    const pr = mat('steel', { clip: clip });
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = -W / 2 + (i + .5) * W / nx, pz = -D / 2 + (j + .5) * D / nz;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, hFloor - .15, 8), pr);
      c.position.set(px, -t - .09 - (hFloor - .15) / 2, pz);
      c.castShadow = true;
      gp.add(c);
      slab(gp, .18, .02, .18, px, -t - .09 - (hFloor - .15) - .01, pz, tb);  // قاعدة
    }
    gp.position.set(x, yTop, z);
    if (opt.info) gp.userData = opt.info;
    parent.add(gp);
    return gp;
  }

  /**
   * جدار طابوق بين عمودين — بمداميك حقيقية ومدماك أخير أفقي (الرباط).
   * يُبنى بالطول len والارتفاع h والسماكة th على المحور dir.
   */
  /* الوحدة البنائية العراقية: طابوقة 240×115×75 مم وفاصل مونة 10 مم، فيصير
     طول المدماك 250 مم وارتفاع المدماك 85 مم. وتايل الخامة أربع طابوقات
     بأربعة أعمدة وثمانية مداميك ⇒ التايل الواحد = 1.00 م × 0.68 م. */
  const BRICK_TILE_L = 1.00, BRICK_TILE_H = 0.68;

  /** عدد تكرارات الخامة — **صحيح دائماً**. الكسر هو سبب «الطابوق غير المتناسق»:
   *  تكرار 3.7 يقطع الطابوقة الأخيرة بنصفها عند حافة الجدار ويقصّ المدماك
   *  الأعلى، فيبدو الصفّ ناقصاً. البنّاء يقصّ طابوقة واحدة (الشَّكَل) لا كل صفّ. */
  function brickReps(size, tile) { return Math.max(1, Math.round(size / tile)); }

  function brickWall(parent, len, h, th, x, y, z, dir, opt) {
    opt = opt || {};
    const clip = opt.clip;
    const rx = brickReps(len, BRICK_TILE_L), ry = brickReps(h, BRICK_TILE_H);
    const m = mat('brick', { rx: rx, ry: ry, clip: clip });
    const w = dir === 'x' ? len : th, d = dir === 'x' ? th : len;
    const b = slab(parent, w, h, d, x, y, z, m, opt.info);
    // مدماك الإغلاق تحت الجسر: بالعراق يُقفل الفراغ الأخير بطابوق مائل أو
    // مدماك مونة سميك، فلا يبقى فراغ بين الجدار وبطن الجسر.
    const capT = Math.max(.02, Math.min(.12, opt.cap || .045));
    const cap = mat('brick', { rx: rx, ry: 1, clip: clip });
    slab(parent, dir === 'x' ? len : th * 1.04, capT, dir === 'x' ? th * 1.04 : len,
      x, y + h / 2 + capT / 2, z, cap);
    return b;
  }

  /** حفرة أساس: جدران التربة المكشوفة حول الأساس */
  function pit(parent, w, d, depth, x, yTop, z, opt) {
    opt = opt || {};
    const clip = opt.clip;
    const gp = new THREE.Group();
    const sm = mat('soil', { rx: 4, clip: clip });
    const t = .06;
    slab(gp, w + 2 * t, depth, t, 0, -depth / 2, d / 2 + t / 2, sm);
    slab(gp, w + 2 * t, depth, t, 0, -depth / 2, -d / 2 - t / 2, sm);
    slab(gp, t, depth, d, w / 2 + t / 2, -depth / 2, 0, sm);
    slab(gp, t, depth, d, -w / 2 - t / 2, -depth / 2, 0, sm);
    slab(gp, w, .04, d, 0, -depth, 0, sm);                 // قاع الحفرة
    gp.position.set(x, yTop, z);
    if (opt.info) gp.userData = opt.info;
    parent.add(gp);
    return gp;
  }

  global.CONSTRUCT = {
    h01: h01, mat: mat, slab: slab,
    formBox: formBox, formBeam: formBeam, formDeck: formDeck,
    brickWall: brickWall, brickReps: brickReps, pit: pit,
    BRICK: { tileL: BRICK_TILE_L, tileH: BRICK_TILE_H, len: .25, course: .085 },
    tex: { grass: grass, soil: soil, sand: sand, concrete: concrete,
           blinding: blinding, ply: ply, timber: timber, brick: brick }
  };
})(window);
