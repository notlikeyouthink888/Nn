@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Civil 5819 - install / update
rem ==================================================================
rem  منصة الهندسة المدنية — تثبيت أو تحديث على حاسبة ويندوز (10 أو 11)
rem  ينزّل آخر نسخة من GitHub إلى %USERPROFILE%\civil5819\app
rem  ويتأكد من بايثون، ويسوي اختصارات على سطح المكتب، ويشغّل المنصة.
rem ==================================================================
set "REPO=notlikeyouthink888/Nn"
set "BR=claude/civil-engineering-site-g9u9al"
set "HOMED=%USERPROFILE%\civil5819"
set "TMPD=%TEMP%\civil5819_dl"

echo.
echo  ================================================
echo    منصة الهندسة المدنية — تثبيت / تحديث
echo  ================================================
echo.
where curl >nul 2>&1 || goto :nocurl
where tar >nul 2>&1 || goto :nocurl

if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%"
echo  [1/4] تحميل آخر نسخة من GitHub ...
call :curlflags
curl %CURLREV% -fL --retry 5 --retry-delay 3 --connect-timeout 30 -y 90 -Y 1 -o "%TMPD%\src.zip" "https://github.com/%REPO%/archive/refs/heads/%BR%.zip"
if errorlevel 1 goto :nonet

echo  [2/4] فك الضغط ونسخ الملفات ...
tar -xf "%TMPD%\src.zip" -C "%TMPD%"
if errorlevel 1 goto :fail
set "SRC=%TMPD%\Nn-%BR:/=-%"
if not exist "%SRC%\civil\app.py" for /d %%D in ("%TMPD%\Nn-*") do set "SRC=%%D"
if not exist "%SRC%\civil\app.py" goto :fail
if not exist "%HOMED%" mkdir "%HOMED%"
rem مجلد data (المشاريع المحفوظة ومفتاح المساعد الذكي) يبقى كما هو عند التحديث
robocopy "%SRC%\civil" "%HOMED%\app" /MIR /XD data /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
rmdir /s /q "%TMPD%"
echo        تم: %HOMED%\app

echo  [3/4] التأكد من بايثون ...
call :findpy
if not errorlevel 1 goto :pyok
echo        بايثون غير موجود — راح أنصّبه (Python 3.12) ...
where winget >nul 2>&1 || goto :nopy
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
call :findpy
if errorlevel 1 goto :nopy
:pyok
echo        بايثون جاهز: %PYEXE% %PYARG%

echo  [4/4] اختصارات سطح المكتب ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop');$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut($d+'\Civil 5819.lnk');$s.TargetPath=$env:HOMED+'\app\windows\start_windows.bat';$s.WorkingDirectory=$env:HOMED+'\app';$s.Save();$s=$w.CreateShortcut($d+'\Civil 5819 - Domain.lnk');$s.TargetPath=$env:HOMED+'\app\windows\domain_windows.bat';$s.WorkingDirectory=$env:HOMED+'\app';$s.Save()" >nul 2>&1
echo        «Civil 5819» يشغّل المنصة · «Civil 5819 - Domain» يربطها بالدومين
echo.
echo  ================================================
echo    خلص التثبيت — هسه تشتغل المنصة
echo  ================================================
call "%HOMED%\app\windows\start_windows.bat"
exit /b 0

:nocurl
echo  [x] هذا الأمر يحتاج ويندوز 10 أو 11 (curl و tar موجودين بيهن).
goto :fail
:nonet
echo  [x] فشل التحميل — تأكد من الإنترنت وأعد المحاولة.
goto :fail
:nopy
echo  [x] ما قدرت أنصّب بايثون تلقائياً. نزّله من الصفحة اللي راح تنفتح،
echo      وأثناء التنصيب أشّر على  Add python.exe to PATH  ثم أعد هذا الأمر.
start "" "https://www.python.org/downloads/windows/"
goto :fail
:fail
echo.
echo  [x] ما كمل التثبيت.
pause
exit /b 1

:curlflags
rem ويندوز يتأكد من إلغاء الشهادة بسيرفر خارجي. إذا الشبكة ما توصله يفشل curl بخطأ CRYPT_E_REVOCATION_OFFLINE،
rem فنخليه يتجاوز هذا الفحص فقط لما سيرفره ما يرد (الشهادة نفسها تبقى تُفحص).
set "CURLREV="
curl --ssl-revoke-best-effort -V >nul 2>&1
if not errorlevel 1 set "CURLREV=--ssl-revoke-best-effort"
if defined CURLREV exit /b 0
curl --ssl-no-revoke -V >nul 2>&1
if not errorlevel 1 set "CURLREV=--ssl-no-revoke"
exit /b 0

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
