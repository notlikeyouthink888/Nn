set -e
APP=/opt/civil5819
UNIT=/etc/systemd/system/civil5819.service
# ترتيب اختيار البورت:
#   ١) البورت الذي تكتبه صراحةً  PORT=8001 ./deploy.sh   ← الأعلى أولوية
#   ٢) البورت المستعمل حالياً إن كانت الخدمة منصّبة من قبل (فلا يتغيّر عند التحديث)
#   ٣) 8001 افتراضياً على سيرفر جديد
WANT="${PORT:-}"
CUR=$(grep -oP '(?<=^Environment=PORT=)\d+' "$UNIT" 2>/dev/null | head -1)
PORT="${WANT:-${CUR:-8001}}"
echo "==> [0/5] البورت المستعمل: $PORT$([ -n "$WANT" ] && echo ' (اخترته صراحةً)' || \
  { [ -n "$CUR" ] && echo ' (نفس البورت المنصّب سابقاً)' || echo ' (سيرفر جديد — الافتراضي)'; })"
SRC="https://codeload.github.com/notlikeyouthink888/Nn/tar.gz/refs/heads/claude/civil-engineering-site-g9u9al"

echo "==> [1/5] المتطلبات (python3 + curl)"
command -v python3 >/dev/null || { apt-get update -y; apt-get install -y python3; }
command -v curl    >/dev/null || { apt-get update -y; apt-get install -y curl; }

echo "==> [2/5] تنزيل المشروع وتنصيبه في $APP"
rm -rf /tmp/civilsrc "$APP"; mkdir -p /tmp/civilsrc "$APP"
curl -fsSL "$SRC" | tar xz -C /tmp/civilsrc --strip-components=1
cp -r /tmp/civilsrc/civil/. "$APP"/ && rm -rf /tmp/civilsrc

echo "==> [3/5] إنشاء خدمة systemd على المنفذ $PORT"
cat > "$UNIT" <<UNIT
[Unit]
Description=Civil Engineering Platform (ACI 318M-14 + Iraqi Code)
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
systemctl daemon-reload 2>/dev/null && systemctl enable civil5819 >/dev/null 2>&1 \
  && systemctl restart civil5819 || { pkill -f "$APP/app.py" 2>/dev/null || true; \
  PORT=$PORT nohup python3 "$APP/app.py" >/var/log/civil5819.log 2>&1 & }

echo "==> [4/5] فتح المنفذ في الجدار الناري"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow ${PORT}/tcp >/dev/null 2>&1 || true
  echo "    ufw: فُتح ${PORT}/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  echo "    firewalld: فُتح ${PORT}/tcp"
else
  echo "    لا جدار ناري فعّال — لا شيء ليُفتح محلياً."
fi
echo "    ⚠️ إن كان مزوّد السيرفر يضع جداراً نارياً بلوحة التحكم (DigitalOcean · AWS ·"
echo "       Hetzner …) فافتح ${PORT}/tcp من لوحته أيضاً وإلا بقي الموقع محجوباً." 

echo "==> [5/5] فحص التشغيل"
for i in $(seq 1 20); do sleep 1; curl -fsS http://127.0.0.1:$PORT/api/health >/dev/null 2>&1 && OK=1 && break; done
if [ "${OK:-0}" = 1 ]; then
  echo "=================================================="
  echo " ✅ الموقع يعمل:  http://$(hostname -I | awk '{print $1}'):$PORT"
  echo " الملفات: $APP   |   السجل: /var/log/civil5819.log"
  echo "=================================================="
else echo " ✗ فشل الإقلاع:"; tail -20 /var/log/civil5819.log; exit 1; fi
