# -*- coding: utf-8 -*-
"""
opensees_check.py — تحقّق متبادل مع OpenSees

OpenSees محرّك العناصر المحدّدة المفتوح المصدر من مركز PEER بجامعة بيركلي،
وهو المرجع المعتمَد في أبحاث الهندسة الزلزالية المحكَّمة ويُستعمل للتحقّق من
البرامج التجارية نفسها.

الغرض هنا ليس الحساب بـ OpenSees بل **مقارنة محرّكنا به على النموذج نفسه**:
تُبنى نفس العقد ونفس العناصر ونفس الخواصّ ونفس الأحمال في المحرّكين، ثم
تُقارَن الإزاحات وقوى أطراف العناصر وردود الأفعال حدّاً بحدّ.

اصطلاح المحاور مطابَق بدقّة:
  • عنصرنا يضع المحور المحلّي 2 «إلى فوق» للجسر، و OpenSees يحدّد ذلك
    بمتّجه vecxz الممرَّر لـ geomTransf — فنمرّر المتّجه الذي يعطي نفس
    الثلاثي بالضبط، وإلا تبادلت Iy و Iz وخرجت المقارنة بلا معنى.
  • elasticBeamColumn = Euler–Bernoulli (بلا تشوّه قصّ)
  • ElasticTimoshenkoBeam = مع تشوّه القصّ بمساحتَي القصّ Avy و Avz

قيدٌ مُثبَت بالتجربة في OpenSees 3.7.1: عنصر ElasticTimoshenkoBeam **يهمل**
إزاحات المفصل (-jntOffset). باختبار كابولي بإزاحة صلبة عند الطرفين يعطي
ترخيماً **أقلّ** عند تفعيل القصّ، وهو ناتج غير فيزيائي (مرونة القصّ لا تزيد
الصلابة). الحلّ المغلق «ذراع صلب + كابولي Timoshenko» يطابق محرّكنا إلى
8×10⁻¹⁶ ويخالف OpenSees بنسبة 25%. لذلك تُستثنى هذه التوليفة من المقارنة
وتُثبَّت بالحلّ المغلق بدلاً منها.

التنصيب على الخادم:
    pip install openseespy
    apt-get install -y libblas3 liblapack3 libgfortran5
وإن لم يكن منصَّباً فالمنصّة تعمل كاملةً وتُعطَّل نقطة المقارنة وحدها.
"""
import json, math, sys

try:
    import openseespy.opensees as ops
    HAVE = True
except Exception as _e:                       # noqa: BLE001
    HAVE = False
    IMPORT_ERR = str(_e)


# ----------------------------- خواصّ المقطع -----------------------------
BETA = [(1, .141), (1.5, .196), (2, .229), (2.5, .249), (3, .263),
        (4, .281), (5, .291), (6, .299), (10, .312), (1e9, .3333)]


def torsion_J(b, h):
    lo, hi = min(b, h), max(b, h)
    r = hi / lo
    be = .3333
    for k in range(len(BETA) - 1):
        if BETA[k][0] <= r <= BETA[k + 1][0]:
            t = (r - BETA[k][0]) / (BETA[k + 1][0] - BETA[k][0])
            be = BETA[k][1] + t * (BETA[k + 1][1] - BETA[k][1])
            break
    return be * lo ** 3 * hi


def vecxz(xi, xj):
    """المتّجه الذي يجعل محاور OpenSees المحلّية مطابقة لمحاورنا.

    محرّكنا: المحور 1 على طول العنصر · المحور 2 مسقط +Z (إلى فوق) للعنصر
    غير الشاقولي، و +X للعمود الشاقولي · والمحور 3 = 1×2.

    OpenSees يبني المحور 3 المحلّي في مستوى (المحور 1، vecxz) ثم
    المحور 2 = 3×1. فإذا أردنا محوراً 2 معيّناً مرّرنا vecxz = −المحور 2،
    لأن حينها 3 = 1×vecxz المعيَّر يعطي −(1×2) … وأبسط وأأمن: نحسب
    محورينا 2 و 3 ونمرّر vecxz = المحور 3 نفسه، فيقع في مستوى (1,3)
    ويعيد OpenSees بناء 3 عليه و 2 = 3×1 = محورنا 2 بالضبط.
    """
    dx = [xj[i] - xi[i] for i in range(3)]
    L = math.sqrt(sum(d * d for d in dx))
    e1 = [d / L for d in dx]
    if abs(e1[2]) > 0.999:
        e2 = [1.0, 0.0, 0.0]
    else:
        d = e1[2]
        e2 = [-d * e1[0], -d * e1[1], 1 - d * e1[2]]
        n = math.sqrt(sum(v * v for v in e2)) or 1.0
        e2 = [v / n for v in e2]
    e3 = [e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0]]
    return e3, e1, e2


# ------------------------------ بناء النموذج ------------------------------
def build(spec):
    """spec = نموذج موحّد يُرسل من جافاسكربت ويُبنى هنا في OpenSees.

    {nodes: [[x,y,z], ...],
     members: [{i,j,E,G,A,Av2,Av3,Iy,Iz,J,shear}, ...],
     supports: {node: [6]},
     nodalLoads: {node: [6]},
     eleLoads: [{k, wy, wz, wx}],      بالمحاور المحلّية
     diaphragms: [[nodes...], ...]}
    """
    ops.wipe()
    ops.model('basic', '-ndm', 3, '-ndf', 6)

    for n, p in enumerate(spec['nodes']):
        ops.node(n + 1, float(p[0]), float(p[1]), float(p[2]))

    for n, f in spec.get('supports', {}).items():
        ops.fix(int(n) + 1, *[int(v) for v in f])

    # ديافرام صلب: OpenSees يطبّقه بقيد rigidDiaphragm حول عقدة رئيسية.
    # العقدة الرئيسية تُضاف عند مركز الطابق وتُقيَّد خارج المستوى.
    nnext = len(spec['nodes']) + 1
    for d in spec.get('diaphragms', []):
        xs = [spec['nodes'][k][0] for k in d]
        ys = [spec['nodes'][k][1] for k in d]
        z = spec['nodes'][d[0]][2]
        ops.node(nnext, sum(xs) / len(xs), sum(ys) / len(ys), z)
        ops.fix(nnext, 0, 0, 1, 1, 1, 0)          # يتحرّك بمستواه فقط
        ops.rigidDiaphragm(3, nnext, *[k + 1 for k in d])
        nnext += 1

    tag = 1
    for k, m in enumerate(spec['members']):
        xi, xj = spec['nodes'][m['i']], spec['nodes'][m['j']]
        vz, e1, _e2 = vecxz(xi, xj)
        ra, rb = float(m.get('ra', 0) or 0), float(m.get('rb', 0) or 0)
        if ra > 1e-12 or rb > 1e-12:
            # إزاحات المفصل الصلبة: OpenSees يعبّر عنها بـ -jntOffset بمتّجهات
            # عامة من كل عقدة إلى طرف الجزء المرن — وهي منطقة صلبة تامّة،
            # أي تقابل معامل منطقة صلبة = 1.0 عندنا.
            ops.geomTransf('Linear', tag, float(vz[0]), float(vz[1]), float(vz[2]),
                           '-jntOffset',
                           ra * e1[0], ra * e1[1], ra * e1[2],
                           -rb * e1[0], -rb * e1[1], -rb * e1[2])
        else:
            ops.geomTransf('Linear', tag, float(vz[0]), float(vz[1]), float(vz[2]))
        if m.get('shear'):
            # Timoshenko: نفس معامل Φ الذي نستعمله، بمساحتَي القصّ
            # الاسم في OpenSees 3.7 هو ElasticTimoshenkoBeam (يستنتج البُعد من ndm)
            ops.element('ElasticTimoshenkoBeam', tag, m['i'] + 1, m['j'] + 1,
                        float(m['E']), float(m['G']), float(m['A']), float(m['J']),
                        float(m['Iy']), float(m['Iz']),
                        float(m['Av2']), float(m['Av3']), tag)
        else:
            ops.element('elasticBeamColumn', tag, m['i'] + 1, m['j'] + 1,
                        float(m['A']), float(m['E']), float(m['G']), float(m['J']),
                        float(m['Iy']), float(m['Iz']), tag)
        tag += 1

    ops.timeSeries('Linear', 1)
    ops.pattern('Plain', 1, 1)
    for n, v in spec.get('nodalLoads', {}).items():
        ops.load(int(n) + 1, *[float(x) for x in v])
    for e in spec.get('eleLoads', []):
        # OpenSees: '-beamUniform' wy wz wx  بالمحاور المحلّية 2 و 3 و 1
        ops.eleLoad('-ele', e['k'] + 1, '-type', '-beamUniform',
                    float(e.get('wy', 0)), float(e.get('wz', 0)), float(e.get('wx', 0)))

    ops.system('UmfPack')
    ops.numberer('RCM')
    ops.constraints('Transformation')
    ops.integrator('LoadControl', 1.0)
    ops.algorithm('Linear')
    ops.analysis('Static')
    if ops.analyze(1) != 0:
        raise RuntimeError('OpenSees فشل في الحلّ')

    out = {'disp': [], 'forces': [], 'reactions': {}}
    for n in range(len(spec['nodes'])):
        out['disp'].append([ops.nodeDisp(n + 1, q) for q in range(1, 7)])
    for k in range(len(spec['members'])):
        # localForce لا eleForce: الثانية ترجع القوى بالنظام **العام**، ومقارنتها
        # بقوانا المحلّية تنجح صدفةً للجسور الأفقية وتفشل تماماً للأعمدة.
        out['forces'].append(list(ops.eleResponse(k + 1, 'localForce')))
    ops.reactions()
    for n in spec.get('supports', {}):
        out['reactions'][str(n)] = [ops.nodeReaction(int(n) + 1, q) for q in range(1, 7)]
    return out


def run(payload):
    if not HAVE:
        return {'ok': False, 'error': 'OpenSeesPy غير متاح: %s' % IMPORT_ERR}
    try:
        return {'ok': True, 'version': ops.version(), 'result': build(payload)}
    except Exception as ex:                    # noqa: BLE001
        return {'ok': False, 'error': '%s: %s' % (type(ex).__name__, ex)}


if __name__ == '__main__':
    print(json.dumps(run(json.load(sys.stdin)), ensure_ascii=False))
