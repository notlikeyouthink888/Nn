"""مساعد صغير لسكربتات ويندوز (بلا مكتبات خارجية).
   python util.py lan        يطبع عنوان الحاسبة بالشبكة المحلية (للموبايل بنفس الواي فاي)
   python util.py up 5819    رمز الخروج 0 إذا المنفذ شغّال (المنصة تعمل)، و1 إذا لا"""
import socket
import sys


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


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'lan':
        ip = lan()
        if ip and not ip.startswith('127.'):
            print(ip)
    elif cmd == 'up':
        sys.exit(0 if up(int(sys.argv[2] if len(sys.argv) > 2 else 5819)) else 1)
    else:
        sys.exit(2)
