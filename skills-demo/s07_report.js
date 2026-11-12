// Skill: docx (docx-js). Arabic RTL Word report of the skill demos.
// Run: NODE_PATH=<dir with node_modules/docx> node skills-demo/s07_report.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, ImageRun, LevelFormat, BorderStyle, Footer, PageNumber,
} = require('docx');

const OUT = path.join(__dirname, 'out');
const J = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const s01 = J('s01.json'), s02 = J('s02.json'), s03 = J('s03.json'), s04 = J('s04.json'), s05 = J('s05.json');
const data = J('data.json');

const FONT = 'Arial';
const run = (t, o = {}) => new TextRun({ text: String(t), font: FONT, rightToLeft: true, size: 22, ...o });
const P = (t, o = {}) => new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 120 },
  children: Array.isArray(t) ? t : [run(t)], ...o });
const H = (t, lvl = HeadingLevel.HEADING_1) => new Paragraph({ heading: lvl, bidirectional: true,
  alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 120 }, children: [run(t, { bold: true, size: lvl === HeadingLevel.HEADING_1 ? 30 : 25, color: '1F4E78' })] });
const B = (t) => new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, numbering: { reference: 'b', level: 0 },
  spacing: { after: 60 }, children: Array.isArray(t) ? t : [run(t)] });
const IMG = (f, w, h) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
  children: [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(OUT, f)), transformation: { width: w, height: h } })] });

const TW = 9360;
function table(head, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (t, i, hd) => new TableCell({ width: { size: widths[i], type: WidthType.DXA }, borders,
    shading: hd ? { type: ShadingType.CLEAR, fill: '1F4E78', color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
      children: [run(t, { size: 19, bold: hd, color: hd ? 'FFFFFF' : '000000' })] })] });
  return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: widths, visuallyRightToLeft: true,
    rows: [new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, i, false)) }))] });
}

const WHERE = { hosp: 'المستشفى', villa: 'الفيلا', lib: 'مكتبة الأدراج f1', blk4: 'Block_4' };
const rows = s01.rows;
const worst = rows.reduce((a, r) => (r.dMu > a.dMu ? r : a), rows[0]);
const asOk = rows.filter((r) => Math.abs(r.As_sym - r.As_proj) <= 2).length;
const cur = s04.current, front = s04.front;
const cheap = front[0];
const chk = s03.checks;
const pct = (x) => (100 * x).toFixed(0) + '%';

const children = [
  new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [run('تطبيق المهارات الهندسية على مشروع الموقع', { bold: true, size: 40, color: '1F4E78' })] }),
  new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [run('نتائج تجريبية على ملفاتك الحقيقية — بدون أي تعديل على الموقع أو اختباراته', { size: 24, color: '595959' })] }),
  H('الخلاصة'),
  B('المعادلات المستقلة (sympy) أعادت اشتقاق تصميم قلبة الدرج وطابقت عزم المشروع في كل القلبات (' + rows.length + ' قلبة)، وأكبر فرق ' + worst.dMu + ' kN·m/م.'),
  B('مساحة الحديد طابقت حرفياً في ' + asOk + ' من ' + rows.length + '؛ الباقي أدراج ثقيلة بمنطقة الانتقال (φ أقل من 0.9) والمشروع أصلاً يعلّمها بالأحمر بفحص السماكة.'),
  B('شبكة الإطار (networkx) لـ Block_4 كشفت ' + s02.isolated_columns + ' عموداً بلا جسور و' + s02.unsupported_ends.length + ' أطراف جسور بلا ركيزة بالحافة الشرقية — أماكن تستحق مراجعة بالقراءة.'),
  B('التحسين متعدد الأهداف (pymoo) أكّد إن درج المستشفى اللي صممه المشروع (24×175/280 وسماكة 210) هو الأرخص عند الخطوة المثالية؛ والأرخص مطلقاً يوفّر ' + pct(1 - cheap.cost / cur.cost) + ' لكن على حساب الراحة.'),
  B('محاكاة التنفيذ (simpy) تعطي هيكل المستشفى بحدود ' + Math.round(s05.p50) + ' يوم (P50) و' + Math.round(s05.p80) + ' يوم (P80) بإنتاجيات مفترضة.'),
  B('جدول إكسل حيّ بـ 1158 معادلة، صفر أخطاء بعد إعادة الحساب بـ LibreOffice، وقيمه تطابق المشروع.'),

  H('١. التحقق الرمزي من تصميم الدرج (sympy + pint + uncertainties)'),
  P('النموذج المشتق رمزياً (نفس فرضيات civil/stairs.py): الحمل على المسقط الأفقي = سماكة الوِتر/cosθ × γc + ½R × γm + التشطيب، ثم wu = 1.2D + 1.6L (ACI 318-19 5.3.1b)، وMu = wu·ℓ²/8، وAs من حل معادلة المقاومة Mu = φ·As·fy·(d − a/2) رمزياً. كل الحساب مرّ بالوحدات عبر pint فأي خطأ بالأبعاد كان يوقفه.'),
  table(['المصدر', 'القلبات', 'أكبر فرق Mu', 'تطابق As (±2 مم²)'],
    Object.keys(WHERE).filter((k) => rows.some((r) => r.where === k)).map((k) => {
      const rr = rows.filter((r) => r.where === k);
      return [WHERE[k], rr.length, Math.max(...rr.map((r) => r.dMu)).toFixed(2) + ' kN·m', rr.filter((r) => Math.abs(r.As_sym - r.As_proj) <= 2).length + '/' + rr.length];
    }), [2800, 1700, 2400, 2460]),
  P(''),
  P('ملاحظة مهمة اكتشفها التحقق: ملف مكتبة الأدراج مكتوب بيه fc′ = 18 MPa، والمشروع قرأها صح واستعملها. أول مقارنة بـ fc′ = 25 أعطت 30/88 فقط، وبعد قراءة المقاومة من الملف صارت ' + asOk + '/88.'),
  H('عدم التأكد من قراءة المخطط (GUM + مونت كارلو)', HeadingLevel.HEADING_2),
  P('افترضنا دقة قراءة ±5 مم للسماكة و±5 سم للبحر و±0.3 kN/m² للتشطيب (توزيع منتظم):'),
  table(['الدرج', 'Mu', 'u', 'فاصل مونت كارلو 95%', 'أكبر مساهم'],
    s01.unc.map((u) => [WHERE[u.where], u.Mu.toFixed(2), '±' + u.u.toFixed(2), u.mc_lo.toFixed(2) + ' – ' + u.mc_hi.toFixed(2),
      Object.entries(u.budget).sort((a, b) => b[1] - a[1])[0][0] === 'span' ? 'البحر' : 'التشطيب']), [1900, 1400, 1300, 2700, 2060]),
  P(''),
  P('الاستنتاج: خطأ قراءة البحر 5 سم يغيّر العزم ~2% فقط، يعني تصميم المشروع ما حساس لدقة القراءة. (اختبار JCGM 101 بند 8 رفض الفاصل الخطي لأن المدخلات منتظمة التوزيع، فاعتمدنا فاصل مونت كارلو.)'),

  H('٢. شبكة الإطار الإنشائي لـ Block_4 (networkx)'),
  IMG('s02_frame_graph.png', 600, 385),
  B('الأعمدة ' + s02.columns + ' والجسور ' + s02.beams + '؛ الإطار الرئيسي يضم ' + s02.comp_cols[0] + ' عموداً.'),
  B('أعمدة بلا جسور: ' + s02.isolated_columns + ' (أغلبها بالصف العلوي y≈36 م) — ممكن بلاطة بلا جسور أو جسور ما انقرت.'),
  B('أطراف جسور بلا ركيزة: ' + s02.unsupported_ends.map((u) => (u.mark || '—') + ' عند (' + u.x + '، ' + u.y + ')').join('، ') + '. أغلبها على x≈43 م بينما الأعمدة على x≈46 م — يستحق فحص تسجيل المحور الطرفي.'),
  B('أبعد جسر عن عمود: ' + s02.max_hops + ' قفزات بالشبكة (جسر محمول على جسر محمول على جسر).'),

  H('٣. كل الأدراج على مخطط واحد (matplotlib + seaborn + statsmodels)'),
  IMG('s03_stairs.png', 620, 257),
  P('عدد الأدراج ' + s03.n + ' من 4 ملفات. نسبة الوقوع بنطاق بلوندل: ' + Object.entries(s03.blondel_in_band).map(([k, v]) => k + ' ' + pct(v)).join('، ') + '.'),
  P('أضعف فحص هو سماكة البلاطة ≥ ℓ/20 (' + (chk.find((c) => c.check === 'سماكة البلاطة') || {}).ok + '/' + (chk.find((c) => c.check === 'سماكة البلاطة') || {}).n + ') — أغلب أدراج المكتبة المرسومة أنحف من جدول ACI 7.3.1.1، وهذا مسموح فقط بحساب الهطول (24.2)، فالمشروع صح يعلّمها.'),

  H('٤. تحسين درج المستشفى — الكلفة مقابل الراحة (pymoo / NSGA-II)'),
  IMG('s04_pareto.png', 520, 330),
  P('كل تصميم مرشّح صُمّم بدالة المشروع نفسها stairs.flight مع قيود: R ≤ 190، T ≥ 250، 600 ≤ 2R+T ≤ 650، السماكة ≥ ℓ/20، القص، εt ≥ 0.004، وطول القلبة ≤ 3.30 م حتى تدخل بالفتحة المرسومة.'),
  table(['التصميم', 'قائمات', 'R/T مم', 'السماكة', 'الكلفة (دينار)', '|2R+T−630|'],
    [['المشروع الحالي', cur.n, (cur.R * 1000).toFixed(0) + '/' + (cur.T * 1000).toFixed(0), cur.t, Math.round(cur.cost).toLocaleString('en'), Math.abs(cur.blondel - 630).toFixed(0)],
      ...front.map((s, i) => ['باريتو ' + (i + 1), s.n, (s.R * 1000).toFixed(0) + '/' + (s.T * 1000).toFixed(0), s.t, Math.round(s.cost).toLocaleString('en'), Math.abs(s.blondel - 630).toFixed(0)])],
    [1900, 1100, 1500, 1200, 1960, 1700]),
  P(''),
  P('النتيجة: 24 قائمة هي الحل الوحيد الممكن بهذه الفتحة، وتصميم المشروع هو نقطة الراحة المثالية على الجبهة. الأسعار مفترضة وتنعدل من أعلى السكربت.'),

  H('٥. محاكاة تنفيذ هيكل المستشفى (simpy)'),
  IMG('s05_schedule.png', 620, 227),
  P('الكميات من القارئ لكل طابق (أعمدة، أطوال الجسور، مساحة السقف، عدد الأدراج)، و3 فرق قوالب و3 فرق حديد ومضخة واحدة، واحتمال عطل المضخة 8%، ومعالجة 7 أيام قبل تحميل الطابق اللي فوقه. 400 محاكاة: P50 = ' + s05.p50 + ' يوم، P80 = ' + s05.p80 + ' يوم، P95 = ' + s05.p95 + ' يوم. أطول بند بكل طابق هو تركيب حديد السقف، فزيادة فرق الحديد أكثر شي يقصّر المدة.'),

  H('٦. جدول الأدراج بالإكسل (xlsx)'),
  P('ملف s06_stairs_schedule.xlsx: ورقة Stairs بـ 88 قلبة (المدخلات زرقاء من المخطط، والباقي معادلات)، وورقة Assumptions قابلة للتعديل (γ، التشطيب، الحمل الحي، المعاملات)، وورقة Summary بنسب النجاح. أُعيد حسابه بـ LibreOffice: 1158 معادلة، صفر أخطاء، وأكبر فرق Mu عن المشروع 1.7%.'),

  H('الفرضيات والحدود'),
  B('كل شي بمجلد skills-demo/ منفصل؛ ولا سطر تغيّر بـ civil/ والموقع والاختبارات كما هي.'),
  B('ملفات DWG والبيانات المشتقة منها ما تنرفع للمستودع (out/ مستثنى من git).'),
  B('الأسعار والإنتاجيات بالتحسين والمحاكاة افتراضية للتوضيح.'),
  B('المراجع: ACI 318-19، IBC 2021 §1011، JCGM 100/101:2008.'),
  P([run('المهارات من Scientific Agent Skills (K-Dense، رخصة MIT): Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents. arXiv:2609.00065.', { size: 18, color: '595959' })]),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.RIGHT,
    style: { paragraph: { indent: { right: 360, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((b) => { const p = path.join(OUT, 's07_report.docx'); fs.writeFileSync(p, b); console.log('wrote', p); });
