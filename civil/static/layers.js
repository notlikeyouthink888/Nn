/* طبقات الفهم — طبقة إضافية فوق كل صفحات المنصة، لا تغيّر أي حساب ولا أي صفحة:
     ١) مستوى العرض: 🟢 مبتدئ / 🔵 مهندس / 🟣 خبير (يُحفظ بالمتصفح)
     ٢) دليل الصفحة: الفكرة · الخطوات · الفيزياء · الكود · المصطلحات — بحاوية مستقلة #guide فوق #view
     ٣) البحث السريع (Ctrl+K): الصفحات والمصطلحات والمختبرات
     ٤) مسار التنقّل: المجموعة › الصفحة
     ٥) صفحتان جديدتان: خريطة المنصة والقاموس الهندسي (تُسجَّلان من app.js). */
(function () {
  const L = window.LAYERS = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* تخزين غير متاح */ } }
  };
  let LV = +store.get('lyr_level', 1) || 1;
  L.level = () => LV;

  /* ------------------------- القاموس الهندسي ------------------------- */
  // [الرمز, العربي, English, التعريف, البند, فئة, مختبر]
  const G = L.GLOSSARY = [
    ["f'c", 'مقاومة الخرسانة المميزة', 'Specified compressive strength', 'مقاومة انضغاط الأسطوانة القياسية بعمر 28 يوماً — أساس كل معادلات الخرسانة.', 'ACI 19.2.1', 'مواد', 'section'],
    ['fy', 'إجهاد خضوع الحديد', 'Yield strength', 'الإجهاد اللي يبدأ عنده الحديد يتمدّد بلا زيادة بالقوة (420 MPa لحديد Grade 60).', 'ACI 20.2.2', 'مواد', 'section'],
    ['Ec', 'معامل مرونة الخرسانة', 'Modulus of elasticity', 'صلابة الخرسانة: Ec = 4700√f\'c ميغاباسكال.', 'ACI 19.2.2.1', 'مواد', 'beam'],
    ['fr', 'معامل الكسر', 'Modulus of rupture', 'مقاومة الخرسانة للشد بالانحناء: fr = 0.62λ√f\'c — عندها يبدأ التشقق.', 'ACI 19.2.3.1', 'مواد', 'beam'],
    ['εcu', 'انفعال الانسحاق', 'Ultimate concrete strain', 'أقصى انفعال انضغاط للخرسانة بالتصميم = 0.003.', 'ACI 22.2.2.1', 'مواد', 'section'],
    ['Mu', 'العزم المصعّد', 'Factored moment', 'العزم الناتج من الأحمال بعد ضربها بمعاملات الأمان (1.2D + 1.6L …).', 'ACI 5.3', 'تحليل', 'beam'],
    ['Vu', 'القص المصعّد', 'Factored shear', 'قوة القص التصميمية بالمقطع.', 'ACI 5.3', 'تحليل', 'beam'],
    ['Pu', 'الحمل المحوري المصعّد', 'Factored axial load', 'الحمل النازل بالعمود بعد التصعيد.', 'ACI 5.3', 'تحليل', 'column'],
    ['φ', 'عامل تخفيض المقاومة', 'Strength reduction factor', 'يقلّل المقاومة الاسمية حسب نوع الانهيار: 0.90 انحناء مطيلي، 0.65 انضغاط، 0.75 قص.', 'ACI 21.2', 'تصميم', 'section'],
    ['Mn', 'المقاومة الاسمية للانحناء', 'Nominal moment strength', 'العزم اللي يتحمّله المقطع نظرياً؛ الشرط φMn ≥ Mu.', 'ACI 22.2', 'تصميم', 'section'],
    ['β₁', 'معامل عمق كتلة ويتني', 'Stress block factor', 'a = β₁·c؛ 0.85 للخرسانة حتى 28 MPa وينزل بعدها.', 'ACI 22.2.2.4.3', 'تصميم', 'section'],
    ['a', 'عمق كتلة الإجهاد', 'Depth of stress block', 'عمق المستطيل المكافئ 0.85f\'c بمنطقة الانضغاط.', 'ACI 22.2.2.4.1', 'تصميم', 'section'],
    ['c', 'عمق المحور المحايد', 'Neutral axis depth', 'المسافة من الوجه المنضغط لخط الإجهاد الصفري.', 'ACI 22.2', 'تصميم', 'section'],
    ['εt', 'انفعال الحديد الأبعد', 'Net tensile strain', 'يحدد إذا المقطع مسيطَر بالشد (مطيلي) أو بالانضغاط، ومنه φ.', 'ACI 21.2.2', 'تصميم', 'section'],
    ['d', 'العمق الفعّال', 'Effective depth', 'المسافة من الوجه المنضغط لمركز حديد الشد.', 'ACI 2.2', 'تصميم', 'beam'],
    ['As', 'مساحة حديد الشد', 'Tension reinforcement area', 'مجموع مساحة قضبان الشد بالمقطع (مم²).', 'ACI 9.5', 'تصميم', 'section'],
    ['As,min', 'أقل حديد', 'Minimum reinforcement', 'حد أدنى يمنع الانهيار المفاجئ عند التشقق.', 'ACI 9.6.1 / 7.6.1', 'تصميم', 'section'],
    ['ρ', 'نسبة التسليح', 'Reinforcement ratio', 'As ÷ (b·d) — بالأعمدة 1% إلى 8%.', 'ACI 10.6.1', 'تصميم', 'column'],
    ['Mcr', 'عزم التشقق', 'Cracking moment', 'العزم اللي تبدأ عنده الخرسانة تتشقق: fr·Ig/yt.', 'ACI 24.2.3.5', 'تحليل', 'beam'],
    ['Ig / Icr / Ie', 'عزوم القصور', 'Moments of inertia', 'الإجمالي والمتشقق والفعّال لحساب الهطول بعد التشقق.', 'ACI 24.2.3.5', 'تحليل', 'beam'],
    ['δ', 'الهطول', 'Deflection', 'نزول الجسر تحت الحمل؛ حدوده L/360 وغيرها.', 'ACI جدول 24.2.2', 'تحليل', 'beam'],
    ['Vc', 'مقاومة الخرسانة للقص', 'Concrete shear strength', 'القص اللي تشيله الخرسانة بلا أساور: 0.17λ√f\'c·b·d.', 'ACI 22.5.5.1', 'تصميم', 'beam'],
    ['Vs', 'مقاومة الأساور للقص', 'Shear reinforcement strength', 'Av·fyt·d/s.', 'ACI 22.5.8.5', 'تصميم', 'beam'],
    ['Pcr', 'الحمل الحرج (أويلر)', 'Critical buckling load', 'π²EI/(KL)² — الحمل اللي يصير عنده الانبعاج (ينبعج العمود جانبياً).', 'ميكانيك', 'تحليل', 'column'],
    ['K', 'معامل الطول الفعّال', 'Effective length factor', 'يعتمد على تثبيت الطرفين: 0.5 مثبّت، 1 مفصلي، 2 كابولي.', 'ACI 6.2.5', 'تحليل', 'column'],
    ['kLu/r', 'نسبة النحافة', 'Slenderness ratio', 'تحدد إذا العمود قصير أو نحيف يحتاج تكبير عزوم.', 'ACI 6.2.5.1', 'تصميم', 'column'],
    ['δns', 'معامل تكبير العزم', 'Moment magnifier', 'Cm/(1 − Pu/0.75Pc) ≥ 1 للأعمدة النحيفة.', 'ACI 6.6.4.5', 'تصميم', 'column'],
    ['Po', 'مقاومة السحق المحوري', 'Nominal axial strength', '0.85f\'c(Ag − Ast) + fy·Ast.', 'ACI 22.4.2.2', 'تصميم', 'column'],
    ['T₁', 'الدور الأساسي', 'Fundamental period', 'الزمن اللي يكمل بيه المبنى هزّة كاملة بنمطه الأول.', 'ASCE 7 §12.8.2', 'زلازل', 'quake'],
    ['Ta', 'الدور التقريبي', 'Approximate period', 'Ct·hn^x من ارتفاع المبنى.', 'ASCE 7 §12.8.2.1', 'زلازل', 'quake'],
    ['ζ', 'نسبة التخميد', 'Damping ratio', 'قدرة المبنى على امتصاص طاقة الاهتزاز (≈5% للخرسانة).', 'ديناميك', 'زلازل', 'quake'],
    ['Δ/h', 'الإزاحة الطابقية', 'Story drift ratio', 'فرق إزاحة سقفين متتاليين ÷ الارتفاع؛ الحد الشائع 2%.', 'ASCE 7 جدول 12.12-1', 'زلازل', 'quake'],
    ['V', 'قص القاعدة', 'Base shear', 'مجموع القوى الزلزالية الجانبية عند الأساس: V = Cs·W.', 'ASCE 7 §12.8.1', 'زلازل', 'quake'],
    ['R', 'معامل تعديل الاستجابة', 'Response modification', 'يقلّل القوة الزلزالية حسب مطيلية النظام الإنشائي.', 'ASCE 7 جدول 12.2-1', 'زلازل', 'quake'],
    ['qa', 'تحمّل التربة المسموح', 'Allowable bearing pressure', 'أقصى ضغط تتحمّله التربة بأمان (kPa).', 'جيوتقني', 'تربة', 'path'],
    ['Δσz', 'زيادة الإجهاد بالعمق', 'Stress increase at depth', 'انتشار ضغط الأساس بالتربة (بوسينسك)؛ «بصلة الإجهاد».', 'جيوتقني', 'تربة', 'path'],
    ['A_trib', 'المساحة الرافدة', 'Tributary area', 'مساحة البلاطة اللي حملها يروح لعمود أو جسر معيّن.', 'ACI 8.4', 'تحليل', 'path'],
    ['vu', 'إجهاد قص الثقب', 'Punching shear stress', 'قص حول العمود على محيط d/2 بالأسس والبلاطات.', 'ACI 22.6', 'تصميم', null],
    ['Ld', 'طول التماسك', 'Development length', 'الطول اللي يحتاجه القضيب داخل الخرسانة حتى يوصل لقوّة الخضوع.', 'ACI 25.4', 'تفصيل', null],
    ['Lap', 'طول الوصلة', 'Lap splice length', 'تداخل قضيبين لنقل القوة (Class B = 1.3Ld).', 'ACI 25.5', 'تفصيل', null],
    ['Cover', 'الغطاء الخرساني', 'Concrete cover', 'سماكة الخرسانة فوق الحديد لحمايته (20–75 مم حسب التعرّض).', 'ACI 20.5.1.3', 'تفصيل', null],
    ['R / T', 'القائمة والنائمة', 'Riser / Tread', 'ارتفاع الدرجة وعمقها؛ الراحة 2R+T ≈ 600–650 مم.', 'IBC 1011.5', 'أدراج', 'stair'],
    ['Headroom', 'ارتفاع الرأس', 'Headroom', 'المسافة الرأسية الحرة فوق الدرج ≥ 2.03 م.', 'IBC 1011.3', 'أدراج', 'stair'],
    ['Waist', 'وِتر الدرج', 'Waist slab', 'البلاطة المائلة تحت الدرجات؛ سماكتها ≥ ℓ/20.', 'ACI جدول 7.3.1.1', 'أدراج', 'stair'],
    ['D / L', 'الحمل الميت والحي', 'Dead / Live load', 'الميت ثابت (وزن الإنشاء والتشطيب)، والحي متغيّر (ناس وأثاث).', 'الكود العراقي للأحمال', 'أحمال', null],
    ['1.2D+1.6L', 'تركيبة التحميل', 'Load combination', 'أشهر تركيبة لتصعيد الأحمال بالتصميم بالمقاومة.', 'ACI 5.3.1', 'أحمال', 'beam'],
    ['qz', 'ضغط سرعة الرياح', 'Velocity pressure', '0.613·Kz·Kzt·Kd·V² (N/م²).', 'ASCE 7 §26.10', 'أحمال', null],
    ['BBS', 'جدول تقطيع الحديد', 'Bar bending schedule', 'قائمة كل قضيب بشكله وأطواله ووزنه للورشة.', 'MNL-66', 'تفصيل', null]
  ];

  /* ------------------------- دليل كل صفحة ------------------------- */
  // idea · steps[] · phys (نص) · lab · code[] · terms[] (رموز من القاموس)
  const P = L.GUIDE = {
    wizard: { idea: 'تكتب مساحة القطعة وعدد الطوابق ونوع التربة، والمعالج يبني لك مبنى كاملاً: شبكة أعمدة وجسور وسقوف وأسس وكميات — ويعرضه مجسماً ثلاثي الأبعاد.',
      steps: ['املأ «القطعة والبناء»: المساحة والطوابق والارتفاع والاستعمال.', 'حدّد «التربة والمناسيب»: نوع التربة وعمق التأسيس والماء الجوفي.', 'اختر نوع السقف (أو اتركه تلقائياً).', 'اضغط الحساب وتنقّل بين التبويبات: الأعمدة، الأسس، الحفر والكميات.', 'بالمجسم اضغط على أي عنصر لتشوف مقاسه وحديده.'],
      phys: 'الحمل ينزل من السقف للجسور للأعمدة للأسس للتربة — شوفه يتحرك بمختبر «مسار الحمل».', lab: 'path',
      code: ['ACI 318-19 الفصول 7–13 (بلاطات، جسور، أعمدة، أسس)', 'الكود العراقي للأحمال والقوى', 'ACI 19.3.1 أصناف التعرّض'], terms: ['D / L', 'A_trib', 'qa', "f'c"] },
    femproj: { idea: 'نفس مبنى المعالج لكن يُحلَّل كإطار فراغي كامل بالمصفوفات بدل المعاملات التقريبية — عزوم حقيقية لكل جسر وعمود.',
      steps: ['شغّل المعالج أولاً (أو افتح مشروعاً محفوظاً).', 'افتح الصفحة وانتظر بناء النموذج.', 'تصفّح مخططات العزوم والقص بالفضاء وتراكيب التحميل.', 'قارن نتائج الأسس مع المعالج.'],
      phys: 'كل عقدة تتوازن تحت القوى — نفس فكرة مختبر الجسر لكن بثلاثة أبعاد.', lab: 'beam',
      code: ['ACI 318-19 §6.3 (النمذجة) و§6.6 (التحليل المرن)', 'ACI 5.3 تراكيب التحميل'], terms: ['Mu', 'Vu', 'Pu', '1.2D+1.6L'] },
    cad: { idea: 'ترفع ملف DWG كامل (لوحات السقوف والجسور والأعمدة والأدراج والجداول) والقسم يقرأه مثل المهندس ويركّب المبنى طابقاً طابقاً بحديده.',
      steps: ['ارفع ملف أو أكثر (DWG/DXF).', 'شوف «📊 لوحة الملخص»: الخرسانة والحديد حسب القطر ومؤشرات المعقولية.', 'راجع تبويب «المخططات»: نوع كل لوحة وطابقها.', 'تأكّد من المحاور والجداول والأدراج.',
        'افتح «✅ فحص الحديد»: كل جسر وعمود وبلاطة مقابل ACI 318-19، و📘 بأي صف يفتح دليله.', 'افتح المجسم واضغط أي عنصر ثم «📘 الدليل» — المختبر الحي بأرقامه وموقعه بالمسقط.', 'أرسل المبنى للمعالج للتحليل.'],
      phys: 'الأدراج المقروءة تُصمَّم بنفس معادلات مختبر «الدرج والإنسان».', lab: 'stair',
      code: ['ACI 318-19 (جداول التسليح والفحوص)', 'IBC 1011 للأدراج'], terms: ['R / T', 'Waist', 'Cover', 'Lap'] },
    room: { idea: 'تصميم غرفة واحدة بالكامل: جدرانها وفتحاتها وأحمالها ثم البلاطة والجسور والأعمدة والأسس، مع مجسم وتسليح.',
      steps: ['أدخل أبعاد الغرفة والجدران.', 'أضف الأبواب والشبابيك.', 'راجع البلاطة والجسور والأعمدة والأساس الناتجة.'],
      phys: 'البلاطة تنقل حملها للجسور بخطوط 45° — شوفها بمختبر مسار الحمل.', lab: 'path',
      code: ['ACI 318-19 الفصل 7 و8 (البلاطات)', 'الفصل 9 (الجسور)'], terms: ['A_trib', 'D / L', 'Mu'] },
    bbs: { idea: 'جدول تقطيع الحديد: كل قضيب بطوله وشكله ووصلاته، مقسّماً على أسياخ 12 م مع الهدر والوزن لكل قطر.',
      steps: ['يُملأ تلقائياً من المعالج أو أدخل العناصر يدوياً.', 'راجع الوصلات والهدر.', 'صدّر الجدول للورشة.'],
      phys: 'الوصلة لازم تكون طويلة كفاية حتى تنتقل القوة بين قضيبين بالتماسك.', lab: 'section',
      code: ['ACI 25.4 (طول التماسك)', 'ACI 25.5 (الوصلات)', 'MNL-66 (الأشكال)'], terms: ['BBS', 'Ld', 'Lap'] },
    detail66: { idea: 'تفصيل كل قضيب حسب دليل ACI MNL-66: نوع الثني وأبعاده بالحروف وطول القطع بعد خصم الثنيات.',
      steps: ['اختر شكل القضيب من قائمة الدليل.', 'أدخل الأبعاد.', 'خذ طول القطع والوزن.'],
      phys: 'الثني يقلّل الطول «الظاهري» لأن القضيب يتمدد بالخارج وينضغط بالداخل.', lab: null,
      code: ['ACI 25.3 (أقطار الثني)', 'MNL-66(20)'], terms: ['Ld', 'Cover'] },
    projects: { idea: 'حفظ واسترجاع مشاريعك وإعادة تشغيل المعالج عليها.', steps: ['اختر مشروعاً.', 'اضغط فتح لإعادة الحساب.'], phys: '', lab: null, code: [], terms: [] },
    fem: { idea: 'محلّل إطارات فراغي بطريقة الصلابة المباشرة (مصفوفة 12×12 لكل عنصر) مع إثبات رياضي كامل لكل خطوة.',
      steps: ['عرّف العقد والعناصر والمقاطع (أو استعمل مثالاً).', 'أضف الأحمال والركائز.', 'حلّل وتصفّح M₃₃ وM₂₂ وT وV بالفضاء.', 'افتح الإثبات لتشوف المصفوفات.'],
      phys: 'الصلابة × الإزاحة = القوة (K·u = F) — نفس الحل اللي يشتغل خلف مختبر الجسر.', lab: 'beam',
      code: ['ACI 318-19 §6.3–6.6', 'نظرية المرونة الخطية'], terms: ['Mu', 'Vu', 'Ig / Icr / Ie', 'δ'] },
    survey: { idea: 'أعمال المساحة: حساب المساحة والمحيط من الإحداثيات، دفتر المناسيب، وكميات القطع والردم.',
      steps: ['أدخل إحداثيات الحدود.', 'أدخل قراءات الميزان.', 'خذ المساحة والمناسيب والكميات.'], phys: '', lab: null, code: ['طريقة الإحداثيات (Shoelace)', 'طريقة ارتفاع الجهاز'], terms: [] },
    earth: { idea: 'الحفريات والردم: الجلمود والسبيس وعدد الطبقات والكميات قياساً على البنج مارك.',
      steps: ['حدّد المناسيب ونوع الردم.', 'راجع عدد الطبقات (حدل كل 20–30 سم).', 'خذ الكميات.'], phys: 'الضغط تحت الأساس ينتشر بعمق ≈ 2B — لهذا نوعية الردم تحت الأساس مهمة.', lab: 'path', code: [], terms: ['qa'] },
    soil: { idea: 'تحمّل التربة بمعادلة ترزاغي/فيسك وقدرة الركائز بطريقة α ومايرهوف.',
      steps: ['أدخل خواص التربة (c، φ، γ).', 'حدّد عرض وعمق الأساس.', 'للركائز: الطول والقطر والطبقات.'],
      phys: 'بصلة الإجهاد تحت الأساس تبيّن لأي عمق لازم تفحص التربة.', lab: 'path', code: ['Terzaghi 1943 / Vesic 1973', 'Meyerhof 1976'], terms: ['qa', 'Δσz'] },
    fndpick: { idea: 'فحص سريع بثلاثة مدخلات: نسبة استغلال الأرض ونوع الأساس المناسب (منفرد/شريطي/حصيرة/ركائز).',
      steps: ['أدخل الحمل الكلي وتحمّل التربة ومسقط المبنى.', 'اقرأ النسبة R والتوصية.'], phys: 'كلما زادت الطوابق زاد الحمل وكبرت الأسس حتى تتلاصق — شوفها بمختبر مسار الحمل.', lab: 'path', code: ['ACI 13.3.1.1'], terms: ['qa'] },
    loads: { idea: 'جداول الكود العراقي للأحمال الحية والكثافات، وحاسبة وزن طبقات الطابق.',
      steps: ['اختر الاستعمال لتأخذ الحمل الحي.', 'أضف طبقات التشطيب لتحسب الحمل الميت.'], phys: 'الحمل الميت ثابت دائماً والحي متغيّر — لهذا الحي يُضرب بـ 1.6 والميت بـ 1.2.', lab: 'beam', code: ['الكود العراقي للأحمال والقوى', 'ACI 5.3.1'], terms: ['D / L', '1.2D+1.6L'] },
    seismic: { idea: 'القوى الزلزالية بطريقة القوة الجانبية المكافئة: قص القاعدة وتوزيعه على الطوابق.',
      steps: ['حدّد الموقع والتربة ونظام الإنشاء.', 'أدخل أوزان الطوابق وارتفاعاتها.', 'اقرأ V وتوزيع Fx.'], phys: 'المبنى يهتز بدوره الطبيعي T — شغّل الزلزال بمختبر «اهتزاز المبنى» وشوف الإزاحة الطابقية.', lab: 'quake',
      code: ['ASCE 7-16 §12.8 (ELF)', 'الكود العراقي للمقاومة الزلزالية'], terms: ['T₁', 'Ta', 'V', 'R', 'Δ/h'] },
    wind: { idea: 'ضغط الرياح على المبنى وتوزيعه مع الارتفاع.', steps: ['أدخل السرعة الأساسية وفئة التعرّض.', 'أدخل أبعاد المبنى.', 'اقرأ الضغوط لكل ارتفاع.'], phys: 'الضغط يتناسب مع مربع السرعة (½ρV²) ويزيد مع الارتفاع.', lab: null, code: ['ASCE 7-16 الفصول 26–27'], terms: ['qz'] },
    beam: { idea: 'تحليل الجسور المستمرة بالمصفوفات مع التحميل النمطي (أسوأ ترتيب للحمل الحي) ثم تصميم الحديد والأساور والهطول.',
      steps: ['أدخل البحور والأحمال الميتة والحية.', 'أدخل المقطع والمواد.', 'اضغط «تحليل وتصميم» وراجع المخططات والحديد.'],
      phys: 'جرّب بمختبر الجسر: اسحب الحمل وشوف العزم والقص والتشقق لحظياً.', lab: 'beam',
      code: ['ACI 318-19 §6.4.3 (التحميل النمطي)', '§9.5–9.7 (تصميم الجسور)', '§24.2 (الهطول)'], terms: ['Mu', 'Vu', 'Mcr', 'δ', 'As', 'φ'] },
    column: { idea: 'تصميم الأعمدة بمنحني التفاعل P–M بالتوافق الانفعالي مع فحص النحافة والتطويق.',
      steps: ['أدخل المقطع والحديد.', 'أدخل Pu وMu.', 'تأكّد إن النقطة داخل المنحني وراجع النحافة.'],
      phys: 'العمود الطويل ينبعج قبل ما ينسحق — شوفه بمختبر «انبعاج العمود».', lab: 'column',
      code: ['ACI 318-19 §22.4 (المقاومة المحورية)', '§6.2.5 و6.6.4 (النحافة)', '§10.7 (التفاصيل)'], terms: ['Pu', 'Po', 'kLu/r', 'δns', 'ρ', 'Pcr'] },
    footing: { idea: 'الأساس المنفرد تحت العمود: الأبعاد من تحمّل التربة ثم قص الثقب والقص الأحادي والانحناء.',
      steps: ['أدخل حمل العمود وتحمّل التربة.', 'راجع الأبعاد والسماكة.', 'راجع قص الثقب والحديد.'],
      phys: 'ضغط الأساس ينتشر بالتربة ببصلة — شوفها بمختبر مسار الحمل.', lab: 'path', code: ['ACI 318-19 الفصل 13', '§22.6 (قص الثقب)'], terms: ['qa', 'vu', 'Mu'] },
    ref: { idea: 'كل معادلة يحسبها البرنامج مع بند الكود اللي تستند إليه والفرضيات.', steps: ['تصفّح حسب الموضوع.'], phys: '', lab: null, code: ['ACI 318-19', 'الكود العراقي'], terms: [] },
    home: { idea: 'نظرة عامة على المنصة وأقسامها.', steps: ['اختر قسماً من البطاقات.'], phys: '', lab: null, code: [], terms: [] },
    phys: { idea: 'مختبرات تفاعلية تشوف بيها الفيزياء اللي خلف كل حساب: الأحمال، الانحناء، الانبعاج، المقطع الخرساني، الاهتزاز، التربة، والدرج.',
      steps: ['اختر مختبراً من الأعلى.', 'غيّر المنزلقات أو اسحب بالرسم.', 'شغّل وأطفئ «الطبقات» فوق الرسم.', 'اقرأ الشرح تحت: ماذا ترى / المعادلات / الكود / جرّب بنفسك.'],
      phys: 'كل الأرقام محسوبة فعلياً (عناصر محدّدة، أنماط ذاتية، نيومارك، بوسينسك) ومختبرة ضد الحلول المغلقة.', lab: null,
      code: ['ACI 318-19', 'ASCE 7-16', 'IBC 2021'], terms: ['Mu', 'Pcr', 'T₁', 'Δσz', 'R / T'] },
    rebar: { idea: 'مركز حديد التسليح: كل تفاصيل الحديد حسب ACI 318-19 بمختبرات تفاعلية — طول التماسك، العكفات، الوصلات، ترتيب الأسياخ، التطويق، وقطع الحديد. ونفس القواعد تُفحص على كل عنصر بدليل المعالج.',
      steps: ['اختر مختبراً من الأعلى.', 'غيّر القطر والمقاومة والظروف وشوف الأطوال تتغيّر.', 'استعمل الأزرار (اسحب، صبّ، اجعله الحد الأدنى).', 'افتح «المعادلات بأرقامك» لتشوف كل معامل ψ وبنده.', 'بالمعالج اضغط أي جسر أو عمود ← «📘 الدليل» لتطبيق نفس القواعد على عنصرك.'],
      phys: 'الحديد يشيل الشد، والخرسانة تنقله له بالتماسك على طوله — ليش لازم طول كافٍ وغطاء ومسافة.', lab: null,
      code: ['ACI 318-19 الفصل 25 (التفاصيل)', 'الفصل 9 و10 (الجسور والأعمدة)', 'الفصل 18 (الزلازل)', '§24.3 (التشقق)', 'ACI MNL-66 (التفصيل)'], terms: ['Ld', 'Lap', 'Cover', 'As,min', 'εt', 'φ'] },
    map: { idea: 'خريطة المنصة كطبقات: من المدخلات إلى القراءة والنمذجة ثم التحليل ثم التصميم ثم المخرجات — واضغط أي قسم لتتبّع مساره.',
      steps: ['اضغط على بطاقة لتظليل ما يغذّيها وما تغذّيه.', 'اضغط «افتح» للانتقال للقسم.'], phys: '', lab: null, code: [], terms: [] },
    terms: { idea: 'قاموس الرموز والمصطلحات الإنشائية بالعربي والإنكليزي مع بند الكود ومختبر يوضّحه.',
      steps: ['ابحث بالرمز أو الكلمة.', 'صفِّ حسب الفئة.', 'اضغط «جرّبه» لفتح المختبر.'], phys: '', lab: null, code: [], terms: [] }
  };

  /* ------------------------- خريطة المنصة (طبقات) ------------------------- */
  L.MAP = [
    { name: 'المدخلات', ic: '📥', items: [['cad', 'ملفات DWG'], ['wizard', 'المساحة والطوابق'], ['survey', 'إحداثيات ومناسيب'], ['soil', 'خواص التربة'], ['loads', 'الأحمال']] },
    { name: 'القراءة والنمذجة', ic: '🧩', items: [['cad', 'قراءة اللوحات وتركيب المبنى'], ['wizard', 'بناء الهيكل تلقائياً'], ['room', 'غرفة مفردة'], ['earth', 'الحفر والمناسيب']] },
    { name: 'التحليل', ic: '🧮', items: [['femproj', 'إطار المشروع الفراغي'], ['fem', 'التحليل المتطور'], ['seismic', 'الزلازل'], ['wind', 'الرياح'], ['beam', 'الجسور المستمرة']] },
    { name: 'التصميم', ic: '📐', items: [['beam', 'الجسور'], ['column', 'الأعمدة'], ['footing', 'الأسس'], ['fndpick', 'نوع الأساس'], ['soil', 'الركائز']] },
    { name: 'المخرجات', ic: '📦', items: [['bbs', 'جدول تقطيع الحديد'], ['detail66', 'تفصيل MNL-66'], ['wizard', 'الكميات والمجسم'], ['projects', 'حفظ المشروع']] },
    { name: 'الفهم', ic: '🎓', items: [['phys', 'المختبر الفيزيائي'], ['rebar', 'مركز حديد التسليح'], ['terms', 'القاموس'], ['ref', 'مرجع الكود']] }
  ];
  // علاقات «يغذّي» بين الأقسام
  L.FLOW = [['cad', 'wizard'], ['cad', 'femproj'], ['wizard', 'femproj'], ['survey', 'earth'], ['soil', 'wizard'], ['soil', 'footing'], ['loads', 'wizard'],
    ['loads', 'beam'], ['loads', 'seismic'], ['wizard', 'bbs'], ['wizard', 'detail66'], ['femproj', 'footing'], ['seismic', 'femproj'], ['wind', 'femproj'],
    ['beam', 'bbs'], ['column', 'bbs'], ['footing', 'bbs'], ['fndpick', 'footing'], ['room', 'bbs'], ['wizard', 'projects'], ['fem', 'column'], ['earth', 'wizard']];

  /* ------------------------- واجهة: شريط الطبقات ------------------------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function bar() {
    const top = document.querySelector('.top'); if (!top || document.getElementById('lyrbar')) return;
    const d = document.createElement('div');
    d.id = 'lyrbar'; d.className = 'lyrbar';
    d.innerHTML = `<div class="lyr-crumb" id="lyrCrumb"></div>
      <div class="lyr-lv" role="group" aria-label="مستوى الشرح">
        <button data-lv="1" title="شرح مفصّل لكل صفحة ومصطلح">🟢 مبتدئ</button>
        <button data-lv="2" title="الدليل مطوي — افتحه عند الحاجة">🔵 مهندس</button>
        <button data-lv="3" title="بلا شروحات — أرقام وكود فقط">🟣 خبير</button></div>
      <button class="lyr-search" id="lyrSearch" title="بحث سريع (Ctrl+K)">🔍 بحث <kbd>Ctrl K</kbd></button>`;
    top.parentNode.insertBefore(d, top);
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lv) L.setLevel(+b.dataset.lv);
      if (b.id === 'lyrSearch') L.palette();
    });
    paintLevel();
  }
  function paintLevel() {
    document.querySelectorAll('#lyrbar [data-lv]').forEach(b => b.classList.toggle('on', +b.dataset.lv === LV));
    document.body.classList.remove('lv-1', 'lv-2', 'lv-3'); document.body.classList.add('lv-' + LV);
  }
  L.setLevel = function (v) {
    LV = v; store.set('lyr_level', v); paintLevel();
    if (L.cur) L.onPage(L.cur);
    if (window.PHYSLAB && document.getElementById('plETabs')) {
      const key = { 1: 'see', 2: 'math', 3: 'code' }[v], b = document.querySelector(`#plETabs [data-e="${key}"]`); if (b) b.click();
    }
  };

  /* ------------------------- دليل الصفحة ------------------------- */
  function groupOf(id) {
    try { for (const [g, ids] of ORDER) if (ids.includes(id)) return g; } catch (e) { /* ORDER غير معرّف */ }
    return '';
  }
  const termChip = t => { const g = G.find(x => x[0] === t); return g ? `<span class="lyr-term" tabindex="0" data-t="${esc(t)}">${esc(t)}<span class="lyr-tip"><b>${esc(g[1])}</b> · <i>${esc(g[2])}</i><br>${esc(g[3])}<br><small>${esc(g[4])}</small></span></span>` : ''; };
  const LABN = { beam: 'الجسر تحت الحمل', column: 'انبعاج العمود', section: 'داخل المقطع الخرساني', quake: 'اهتزاز المبنى بالزلزال', path: 'مسار الحمل حتى التربة', stair: 'الدرج والإنسان' };

  // قائمة جانبية قابلة للطيّ على الموبايل (كل الأزرار باقية — فقط تُطوى)
  function mobileNav() {
    const side = document.querySelector('.side'), brand = document.querySelector('.brand');
    if (!side || !brand || document.getElementById('lyrMenu')) return;
    const b = document.createElement('button');
    b.id = 'lyrMenu'; b.className = 'lyr-menu'; b.type = 'button'; b.textContent = '☰ القائمة';
    brand.appendChild(b);
    side.classList.add('lyr-fold');
    b.addEventListener('click', () => side.classList.toggle('lyr-fold'));
  }
  L.onPage = function (id) {
    L.cur = id;
    bar(); mobileNav();
    const sd = document.querySelector('.side'); if (sd) sd.classList.add('lyr-fold');
    const box = document.getElementById('guide'), crumb = document.getElementById('lyrCrumb');
    let p0 = null; try { p0 = PAGES[id]; } catch (e) { /* قبل التحميل */ }
    if (crumb && p0) crumb.innerHTML = `<span>${esc(groupOf(id) || 'المنصة')}</span> › <b>${p0.ic || ''} ${esc(p0.name || '')}</b>`;
    if (!box) return;
    const g = P[id];
    if (!g || LV === 3) { box.innerHTML = ''; box.className = ''; return; }
    const open = LV === 1 && store.get('lyr_g_' + id, '1') !== '0';
    const tabs = [['idea', '🎯 الفكرة'], ['steps', '🪜 الخطوات'], ...(g.phys ? [['phys', '🔬 الفيزياء']] : []), ...(g.code && g.code.length ? [['code', '📘 الكود']] : []), ...(g.terms && g.terms.length ? [['terms', '📖 المصطلحات']] : [])];
    const body = {
      idea: `<p>${g.idea}</p>`,
      steps: `<ol>${g.steps.map(s => `<li>${s}</li>`).join('')}</ol>`,
      phys: `<p>${g.phys || ''}</p>${g.lab ? `<button class="btn" data-lab="${g.lab}">🔬 افتح مختبر «${LABN[g.lab]}»</button>` : ''}`,
      code: `<ul>${(g.code || []).map(s => `<li>${s}</li>`).join('')}</ul>`,
      terms: `<div class="lyr-terms">${(g.terms || []).map(termChip).join('')}</div><div class="hint">مرّر أو اضغط على أي رمز لتعريفه — والقاموس الكامل بصفحة «📖 القاموس».</div>`
    };
    box.className = 'lyr-guide' + (open ? ' open' : '');
    box.innerHTML = `<button class="lyr-head" aria-expanded="${open}"><span>ℹ️ دليل الصفحة — ${esc(g.idea.split('—')[0].split('،')[0].slice(0, 70))}…</span><span class="lyr-chev">${open ? '▲ طيّ' : '▼ افتح'}</span></button>
      <div class="lyr-body"><div class="lyr-tabs">${tabs.map((t, i) => `<button data-gt="${t[0]}" class="${i ? '' : 'on'}">${t[1]}</button>`).join('')}</div>
      <div class="lyr-pane">${body[tabs[0][0]]}</div></div>`;
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('lyr-head')) { const o = !box.classList.contains('open'); box.classList.toggle('open', o); store.set('lyr_g_' + id, o ? '1' : '0');
        b.setAttribute('aria-expanded', o); b.querySelector('.lyr-chev').textContent = o ? '▲ طيّ' : '▼ افتح'; return; }
      if (b.dataset.gt) { box.querySelectorAll('[data-gt]').forEach(x => x.classList.toggle('on', x === b)); box.querySelector('.lyr-pane').innerHTML = body[b.dataset.gt]; return; }
      if (b.dataset.lab) L.openLab(b.dataset.lab);
    };
  };
  L.openLab = function (lab) {
    if (window.PHYSLAB) PHYSLAB.cur = lab;
    try { localStorage.setItem('pl_lab', lab); } catch (e) { /* لا شيء */ }
    if (typeof go === 'function') go('phys');
  };

  /* ------------------------- البحث السريع ------------------------- */
  L.palette = function () {
    if (document.getElementById('lyrPal')) return;
    const ov = document.createElement('div');
    ov.id = 'lyrPal'; ov.className = 'lyr-pal';
    ov.innerHTML = `<div class="lyr-pbox" role="dialog" aria-label="بحث سريع"><input id="lyrQ" placeholder="ابحث عن قسم، رمز (Mu، φ)، مختبر…" autocomplete="off">
      <div class="lyr-res" id="lyrRes"></div><div class="hint">↑↓ للتنقل · Enter للفتح · Esc للإغلاق</div></div>`;
    document.body.appendChild(ov);
    const q = ov.querySelector('#lyrQ'), res = ov.querySelector('#lyrRes');
    const items = [];
    try { Object.entries(PAGES).forEach(([k, p]) => items.push({ k: 'page', id: k, ic: p.ic, t: p.name, s: p.desc || p.sub || '', hay: [p.name, p.ttl, p.sub, p.desc, k].join(' ') })); } catch (e) { /* لا صفحات */ }
    (window.PHYSLAB ? PHYSLAB.labs : []).forEach(l => items.push({ k: 'lab', id: l.id, ic: l.ic, t: 'مختبر: ' + l.name, s: l.sub, hay: [l.name, l.sub, l.learn, 'مختبر'].join(' ') }));
    G.forEach(g => items.push({ k: 'term', id: g[0], ic: '📖', t: g[0] + ' — ' + g[1], s: g[3], hay: g.slice(0, 5).join(' ') }));
    let sel = 0, shown = [];
    const norm = s => String(s || '').toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const render = () => {
      const w = norm(q.value).split(/\s+/).filter(Boolean);
      shown = items.filter(it => !w.length || w.every(x => norm(it.hay).includes(x))).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      res.innerHTML = shown.map((it, i) => `<button data-i="${i}" class="${i === sel ? 'on' : ''}"><span class="ic">${it.ic || '•'}</span><span><b>${esc(it.t)}</b><small>${esc(String(it.s).slice(0, 110))}</small></span><em>${{ page: 'صفحة', lab: 'مختبر', term: 'مصطلح' }[it.k]}</em></button>`).join('')
        || '<div class="hint" style="padding:10px">ماكو نتيجة.</div>';
    };
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const pick = it => {
      close(); if (!it) return;
      if (it.k === 'page') go(it.id);
      else if (it.k === 'lab') L.openLab(it.id);
      else { go('terms'); setTimeout(() => { const i = document.getElementById('trmQ'); if (i) { i.value = it.id; i.dispatchEvent(new Event('input')); } }, 30); }
    };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(shown[sel]); }
    };
    document.addEventListener('keydown', key, true);
    q.addEventListener('input', () => { sel = 0; render(); });
    res.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(shown[+b.dataset.i]); });
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    render(); q.focus();
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); L.palette(); }
  });

  /* ------------------------- صفحة: خريطة المنصة ------------------------- */
  L.mapHtml = function () {
    const name = id => { try { return PAGES[id] ? `${PAGES[id].ic} ${PAGES[id].name}` : id; } catch (e) { return id; } };
    return `<div class="lyr-maphelp card"><b>🗺️ المنصة كطبقات:</b> كل صف طبقة من طبقات العمل الهندسي. اضغط على أي بطاقة
      فتتلوّن الأقسام اللي <span class="mk up">تغذّيها</span> والأقسام اللي <span class="mk dn">تستفيد منها</span>.</div>
      <div class="lyr-map" id="lyrMap">${L.MAP.map((row, i) => `<div class="lyr-row"><div class="lyr-rh"><span>${row.ic}</span><b>${i + 1}. ${row.name}</b></div>
        <div class="lyr-cards">${row.items.map(([id, what]) => `<div class="lyr-card" data-id="${id}" tabindex="0"><b>${name(id)}</b><small>${what}</small>
          <button class="btn gh" data-go="${id}">افتح ←</button></div>`).join('')}</div></div>
        ${i < L.MAP.length - 1 ? '<div class="lyr-down">▼</div>' : ''}`).join('')}</div>`;
  };
  L.mapInit = function () {
    const m = document.getElementById('lyrMap'); if (!m) return;
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (b) { go(b.dataset.go); return; }
      const c = e.target.closest('.lyr-card'); if (!c) return;
      const id = c.dataset.id, was = c.classList.contains('sel');
      m.querySelectorAll('.lyr-card').forEach(x => x.classList.remove('sel', 'up', 'dn', 'dim'));
      if (was) return;
      const up = new Set(L.FLOW.filter(f => f[1] === id).map(f => f[0])), dn = new Set(L.FLOW.filter(f => f[0] === id).map(f => f[1]));
      m.querySelectorAll('.lyr-card').forEach(x => {
        const k = x.dataset.id;
        if (k === id) x.classList.add('sel'); else if (up.has(k)) x.classList.add('up'); else if (dn.has(k)) x.classList.add('dn'); else x.classList.add('dim');
      });
    });
  };

  /* ------------------------- صفحة: القاموس ------------------------- */
  L.termsHtml = function () {
    const cats = [...new Set(G.map(g => g[5]))];
    return `<div class="card"><div class="lyr-tq"><input id="trmQ" placeholder="ابحث: Mu، العزم، φ، النحافة، drift…" autocomplete="off">
      <div class="lyr-cats" id="trmCats"><button data-c="" class="on">الكل (${G.length})</button>${cats.map(c => `<button data-c="${c}">${c}</button>`).join('')}</div></div>
      <div class="lyr-glist" id="trmList"></div></div>`;
  };
  L.termsInit = function () {
    const q = document.getElementById('trmQ'), list = document.getElementById('trmList'), cats = document.getElementById('trmCats');
    if (!q) return;
    let cat = '';
    const norm = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
    const render = () => {
      const w = norm(q.value).trim();
      const rows = G.filter(g => (!cat || g[5] === cat) && (!w || norm(g.slice(0, 5).join(' ')).includes(w)));
      list.innerHTML = rows.map(g => `<div class="lyr-gcard"><div class="lyr-gs">${esc(g[0])}</div><div><b>${esc(g[1])}</b> <i>${esc(g[2])}</i>
        <p>${esc(g[3])}</p><small>📘 ${esc(g[4])} · ${esc(g[5])}</small>${g[6] ? ` <button class="btn gh" data-lab="${g[6]}">🔬 جرّبه</button>` : ''}</div></div>`).join('')
        || '<div class="hint">ماكو مصطلح بهذا الاسم.</div>';
    };
    q.addEventListener('input', render);
    cats.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.c; cats.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); });
    list.addEventListener('click', e => { const b = e.target.closest('[data-lab]'); if (b) L.openLab(b.dataset.lab); });
    render();
  };

  if (document.readyState !== 'loading') bar(); else document.addEventListener('DOMContentLoaded', bar);
})();
