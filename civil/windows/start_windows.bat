@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ==================================================================
rem  تشغيل منصة الهندسة المدنية على هذه الحاسبة (المنفذ 5819).
rem  start_windows.bat            يشغّل السيرفر ويفتح المتصفح
rem  start_windows.bat nobrowser  يشغّل السيرفر فقط (للتشغيل التلقائي والدومين)
rem ==================================================================
cd /d "%~dp0.."
title Civil 5819 - server
if not defined PORT set "PORT=5819"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONDONTWRITEBYTECODE=1"

call :findpy
if errorlevel 1 goto :nopy
if not exist "app.py" goto :noapp

"%PYEXE%" %PYARG% "%~dp0util.py" up %PORT%
if errorlevel 1 goto :run
echo  المنصة شغّالة أصلاً على المنفذ %PORT%.
if /i not "%~1"=="nobrowser" start "" "http://localhost:%PORT%/"
exit /b 0

:run
set "LAN="
for /f "delims=" %%I in ('call "%PYEXE%" %PYARG% "%~dp0util.py" lan 2^>nul') do set "LAN=%%I"
echo.
echo  ================================================
echo    منصة الهندسة المدنية تشتغل هسه
echo    على هذه الحاسبة :  http://localhost:%PORT%/
if defined LAN echo    من موبايل بنفس الواي فاي :  http://%LAN%:%PORT%/
echo    لا تسد هذه النافذة — سدّها يطفي المنصة.
echo  ================================================
echo  إذا طلع تنبيه جدار حماية ويندوز: اختار السماح للشبكات الخاصة Private.
echo.
if /i not "%~1"=="nobrowser" start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:%PORT%/"

:loop
"%PYEXE%" %PYARG% app.py
echo.
echo  توقف السيرفر — يرجع يشتغل بعد 5 ثواني (Ctrl+C للإيقاف النهائي) ...
ping -n 6 127.0.0.1 >nul
goto :loop

:nopy
echo  [x] بايثون غير موجود. شغّل install_windows.bat أو نصّب Python 3.12 من python.org
pause
exit /b 1
:noapp
echo  [x] ما لقيت app.py — هذا الملف لازم يبقى داخل مجلد المشروع civil\windows
pause
exit /b 1

:findpy
rem يدوّر على بايثون 3.9+ : py ثم python ثم مجلدات التنصيب — ويعتمد على جواب بايثون نفسه (True)
set "PYEXE="
set "PYARG="
call :trypy py -3
if defined PYEXE exit /b 0
call :trypy python
if defined PYEXE exit /b 0
for %%V in (314 313 312 311 310 39) do if not defined PYEXE if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" call :trypy "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
for %%V in (314 313 312 311 310 39) do if not defined PYEXE if exist "%ProgramFiles%\Python%%V\python.exe" call :trypy "%ProgramFiles%\Python%%V\python.exe"
if defined PYEXE exit /b 0
exit /b 1

:trypy
set "PYOK="
for /f "delims=" %%R in ('call %1 %2 -c "import sys;print(sys.version_info>=(3,9))" 2^>nul') do set "PYOK=%%R"
if not "%PYOK%"=="True" exit /b 1
set "PYEXE=%~1"
set "PYARG=%~2"
exit /b 0
