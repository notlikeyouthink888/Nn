#!/usr/bin/env bash
# يولّد install.sh : سكربت تنصيب ذاتي الاحتواء (نسخ ولصق واحد) للموقع على البورت 5819
set -euo pipefail
cd "$(dirname "$0")"
PAY=$(mktemp)
tar czf "$PAY" --exclude="static/vendor/libredwg/wasm/*.wasm.gz" *.py static README.md
{
cat <<'HDR'
#!/usr/bin/env bash
# ============================================================================
#  منصة الهندسة المدنية — تحليل وتصميم إنشائي (ACI 318M-14 + الكود العراقي)
#  التنصيب: انسخ هذا الملف كاملاً والصقه في طرفية السيرفر (root) ثم Enter
#  الموقع سيعمل على:  http://<عنوان-السيرفر>:8001   (غيّره بـ PORT=... قبل التشغيل)
# ============================================================================
set -euo pipefail
APP=/opt/civil5819
PORT=${PORT:-8001}

echo "==> [1/6] التحقق من بايثون"
command -v python3 >/dev/null || { apt-get update -y && apt-get install -y python3; }
python3 -c 'import sys; assert sys.version_info>=(3,7)' || { echo "يتطلب Python 3.7+"; exit 1; }

echo "==> [2/6] كتابة ملفات المشروع في $APP"
rm -rf "$APP"; mkdir -p "$APP"
base64 -d > /tmp/civil5819.tgz <<'PAYLOAD_B64'
HDR
base64 "$PAY"
cat <<'FTR'
PAYLOAD_B64
tar xzf /tmp/civil5819.tgz -C "$APP" && rm -f /tmp/civil5819.tgz
chmod -R 755 "$APP"

echo "==> [2b/6] جلب محرّك قراءة DWG (اختياري — 2.3 ميغا)"
RAW=https://raw.githubusercontent.com/notlikeyouthink888/Nn/claude/civil-engineering-site-g9u9al/civil
mkdir -p "$APP/static/vendor/libredwg/wasm"
if command -v curl >/dev/null 2>&1 && \
   curl -fsSL --max-time 180 -o "$APP/static/vendor/libredwg/wasm/libredwg-web.wasm.gz" \
     "$RAW/static/vendor/libredwg/wasm/libredwg-web.wasm.gz" 2>/dev/null; then
  echo "    ✓ محرّك DWG جاهز — تقدر ترفع مخططات .dwg مباشرة"
else
  rm -f "$APP/static/vendor/libredwg/wasm/libredwg-web.wasm.gz"
  echo "    تعذّر جلب محرّك DWG — استيراد DXF يبقى شغّالاً"
  echo "      (صدّر المخطط من الأوتوكاد بصيغة DXF، أو نزّل الملف يدوياً لاحقاً)"
fi

echo "==> [3/6] إنشاء خدمة التشغيل"
pkill -f "/opt/civil5819/app.py" 2>/dev/null || true
USE_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload >/dev/null 2>&1; then USE_SYSTEMD=1; fi
if [ "$USE_SYSTEMD" = "1" ]; then
cat > /etc/systemd/system/civil5819.service <<UNIT
[Unit]
Description=Civil Engineering Platform (ACI 318-19 + Iraqi Code)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/civil5819
Environment=PORT=$PORT
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /opt/civil5819/app.py
Restart=always
RestartSec=3
StandardOutput=append:/var/log/civil5819.log
StandardError=append:/var/log/civil5819.log

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable civil5819 >/dev/null 2>&1 || true
  systemctl restart civil5819
else
  echo "    (systemd غير متاح — التشغيل بوضع nohup)"
  PORT=$PORT nohup python3 "$APP/app.py" >/var/log/civil5819.log 2>&1 &
fi

echo "==> [4/6] فتح المنفذ $PORT في الجدار الناري"
if command -v ufw >/dev/null 2>&1; then ufw allow ${PORT}/tcp >/dev/null 2>&1 || true; fi
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
fi
command -v iptables >/dev/null 2>&1 && iptables -C INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null \
  || iptables -I INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null || true

echo "==> [5/6] انتظار إقلاع الخدمة"
for i in $(seq 1 20); do
  sleep 1
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then OK=1; break; fi
done

if [ "${OK:-0}" != "1" ] && [ "$USE_SYSTEMD" = "1" ]; then
  echo "    systemd لم يُقلع الخدمة — محاولة التشغيل المباشر"
  PORT=$PORT nohup python3 "$APP/app.py" >>/var/log/civil5819.log 2>&1 &
  for i in $(seq 1 10); do sleep 1
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then OK=1; break; fi
  done
fi

echo "==> [6/6] النتيجة"
if [ "${OK:-0}" = "1" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo "==============================================================="
  echo "  ✅ الموقع يعمل الآن"
  echo "     http://${IP:-<server-ip>}:${PORT}"
  echo "     الملفات:  $APP"
  echo "     السجل :  /var/log/civil5819.log"
  echo "     الأوامر:  systemctl {status|restart|stop} civil5819"
  echo "==============================================================="
  curl -s "http://127.0.0.1:${PORT}/api/health"; echo
else
  echo "  ✗ لم تُقلع الخدمة — راجع السجل:"
  tail -n 30 /var/log/civil5819.log 2>/dev/null || true
  command -v systemctl >/dev/null && systemctl status civil5819 --no-pager -l | tail -n 20 || true
  exit 1
fi
FTR
} > install.sh
rm -f "$PAY"
chmod +x install.sh
echo "install.sh generated: $(wc -c < install.sh) bytes, $(wc -l < install.sh) lines"
