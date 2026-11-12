"""مساعد صغير لسكربتات ويندوز (بلا مكتبات خارجية).
   python util.py lan             يطبع عنوان الحاسبة بالشبكة المحلية (للموبايل بنفس الواي فاي)
   python util.py up 5819         رمز الخروج 0 إذا المنفذ شغّال (المنصة تعمل)، و1 إذا لا
   python util.py stop 5819       يوقف خادم المنصة القديم (بعد التحديث) حتى يشتغل بالكود الجديد
   python util.py quickurl LOG    ينتظر رابط trycloudflare بسجل cloudflared، ينسخه ويعرضه بنافذة عربية"""
import os
import re
import socket
import subprocess
import sys
import time

PY_RX = re.compile(r'^(python[\d.]*|pythonw|py)\.exe$', re.I)
URL_RX = re.compile(r'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com')     # رابط النفق، مو عنوان الخدمة api.


def lan():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))          # UDP: لا يرسل شي، بس يختار الواجهة
        return s.getsockname()[0]
    except OSError:
        return ''
    finally:
        s.close()


def up(port):
    s = socket.socket()
    s.settimeout(0.5)
    try:
        return s.connect_ex(('127.0.0.1', port)) == 0
    finally:
        s.close()


def listener_pid(port, text=None):
    """رقم العملية اللي تستمع على المنفذ، من مخرجات netstat -ano.
       بلا اعتماد على لغة ويندوز: سطر الاستماع عنوانه البعيد ينتهي بـ ‎:0 (أو *:*) وآخر عمود هو PID."""
    if text is None:
        try:
            text = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, timeout=25).stdout.decode('utf-8', 'replace')
        except (OSError, subprocess.SubprocessError):
            return None
    tail = ':%d' % port
    for line in text.splitlines():
        p = line.split()
        if len(p) >= 4 and p[0].upper() == 'TCP' and p[1].endswith(tail) and (p[2].endswith(':0') or p[2] == '*:*') and p[-1].isdigit():
            return int(p[-1])
    return None


def procs():
    """{pid: (ppid, exe)} لكل العمليات عبر Toolhelp32 (ويندوز فقط؛ يرجع {} على غيره)."""
    try:
        import ctypes
        from ctypes import wintypes

        class PE(ctypes.Structure):
            _fields_ = [('dwSize', wintypes.DWORD), ('cntUsage', wintypes.DWORD), ('th32ProcessID', wintypes.DWORD),
                        ('th32DefaultHeapID', ctypes.c_size_t), ('th32ModuleID', wintypes.DWORD), ('cntThreads', wintypes.DWORD),
                        ('th32ParentProcessID', wintypes.DWORD), ('pcPriClassBase', ctypes.c_long), ('dwFlags', wintypes.DWORD),
                        ('szExeFile', ctypes.c_wchar * 260)]

        k = ctypes.WinDLL('kernel32')
        k.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
        k.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
        k.Process32FirstW.argtypes = k.Process32NextW.argtypes = [ctypes.c_void_p, ctypes.POINTER(PE)]
        k.CloseHandle.argtypes = [ctypes.c_void_p]
        snap = k.CreateToolhelp32Snapshot(2, 0)          # TH32CS_SNAPPROCESS
        if not snap or snap == ctypes.c_void_p(-1).value:
            return {}
        out, e = {}, PE()
        e.dwSize = ctypes.sizeof(PE)
        ok = k.Process32FirstW(snap, ctypes.byref(e))
        while ok:
            out[int(e.th32ProcessID)] = (int(e.th32ParentProcessID), e.szExeFile)
            ok = k.Process32NextW(snap, ctypes.byref(e))
        k.CloseHandle(snap)
        return out
    except (OSError, AttributeError, ImportError):
        return {}


def chain(pid, table):
    """العملية المستمعة + آباؤها ما دامت بايثون أو مشغّل py — لا تتعدّى لنافذة cmd ولا لأي برنامج آخر."""
    out, cur = [], pid
    for _ in range(3):
        ent = table.get(cur)
        if not ent or not PY_RX.match(ent[1] or '') or cur == os.getpid():
            break
        out.append(cur)
        cur = ent[0]
    return out


def stop(port):
    """يوقف خادم المنصة (بايثون فقط). نافذته السودة، إن بقت، ترجع تشغّله بالكود الجديد بعد 5 ثواني."""
    pid = listener_pid(port)
    if not pid:
        return []
    ids = chain(pid, procs())
    for p in ids:
        try:
            subprocess.run(['taskkill', '/PID', str(p), '/F'], capture_output=True, timeout=25)
        except (OSError, subprocess.SubprocessError):
            pass
    return ids


def box(text, title='Civil 5819'):
    """نافذة رسالة عربية (من اليمين لليسار، فوق باقي النوافذ)."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, title, 0x40 | 0x100000 | 0x80000 | 0x10000 | 0x40000)
        return True
    except (OSError, AttributeError, ImportError):
        return False


def quickurl(logfile, seconds=120, show=True):
    end = time.time() + seconds
    while time.time() < end:
        try:
            with open(logfile, encoding='utf-8', errors='replace') as f:
                m = URL_RX.search(f.read())
        except OSError:
            m = None
        if m:
            url = m.group(0)
            try:
                subprocess.run('clip', input=url.encode('ascii'), shell=True, timeout=10,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except (OSError, subprocess.SubprocessError):
                pass
            if show:
                box('رابط المنصة جاهز، وانتسخ للحافظة:\n\n%s\n\nافتحه من أي جهاز. يبقى شغّال طول ما النافذة السودة مفتوحة، ويتغيّر إذا شغّلته مرة ثانية.' % url)
            return url
        time.sleep(1)
    return ''


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    arg = sys.argv[2] if len(sys.argv) > 2 else ''
    if cmd == 'lan':
        ip = lan()
        if ip and not ip.startswith('127.'):
            print(ip)
    elif cmd == 'up':
        sys.exit(0 if up(int(arg or 5819)) else 1)
    elif cmd == 'stop':
        done = stop(int(arg or 5819))
        print(' '.join(map(str, done)))
        sys.exit(0 if done else 1)
    elif cmd == 'quickurl':
        found = quickurl(arg, show='noshow' not in sys.argv)
        if found:
            print(found)
        sys.exit(0 if found else 1)
    else:
        sys.exit(2)
