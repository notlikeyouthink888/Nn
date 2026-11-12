@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Civil 5819 - install / update
rem ==================================================================
rem  منصة الهندسة المدنية — تثبيت أو تحديث على حاسبة ويندوز (10 أو 11)
rem  ينزّل آخر نسخة إلى %USERPROFILE%\civil5819\app، يتأكد من بايثون،
rem  يسوي اختصارات على سطح المكتب، ويشغّل المنصة.
rem  · التحميل: حزمة خفيفة (~1.2 ميغا) من CDN، تكمل إذا انقطع الخط وتُفحص بـ SHA-256.
rem    إذا تعذّرت: الأرشيف الكامل من GitHub (~6 ميغا).
rem  · أي خطأ يطلع بنافذة عربية واضحة مع رمز (E1…E4) — لأن النافذة السودة تقلب العربي.
rem  · إذا المنصة شغّالة من قبل يعيد تشغيلها حتى تاخذ التحديث.
rem ==================================================================
set "REPO=notlikeyouthink888/Nn"
set "BR=claude/civil-engineering-site-g9u9al"
set "HOMED=%USERPROFILE%\civil5819"
set "TMPD=%TEMP%\civil5819_dl"
set "CACHE=%HOMED%\cache"
set "RAWCIVIL=https://raw.githubusercontent.com/%REPO%/%BR%/civil"
set "FULLZIP=https://github.com/%REPO%/archive/refs/heads/%BR%.zip"
set "DWGREL=static\vendor\libredwg\wasm\libredwg-web.wasm.gz"
set "ECODE=E0"

echo.
echo  ================================================
echo    منصة الهندسة المدنية — تثبيت / تحديث
echo    Civil 5819 : install / update
echo  ================================================
echo.
where curl >nul 2>&1 || goto :nocurl
where tar >nul 2>&1 || goto :nocurl

if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%"
if not exist "%HOMED%" mkdir "%HOMED%"
if not exist "%CACHE%" mkdir "%CACHE%"
call :curlflags

echo  [1/4] تحميل آخر نسخة ...  (download)
set "SRC="
set "SLIM="
call :getcore
if defined SRC goto :copy
echo        الحزمة الخفيفة ما نزلت — أجرّب الأرشيف الكامل من GitHub (حوالي 6 ميغا) ...
call :getfull
if not defined SRC goto :nonet

:copy
echo  [2/4] نسخ الملفات ...  (copy)
rem مجلد data (المشاريع المحفوظة ومفتاح المساعد) ومحرّك DWG المنزَّل يبقون كما هم عند التحديث
robocopy "%SRC%" "%HOMED%\app" /MIR /XD data /XF libredwg-web.wasm.gz /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :nocopy
if exist "%SRC%\%DWGREL%" copy /y "%SRC%\%DWGREL%" "%HOMED%\app\%DWGREL%" >nul
if defined SLIM call :getdwg
rmdir /s /q "%TMPD%"
echo        تم: %HOMED%\app

echo  [3/4] التأكد من بايثون ...  (python)
call :findpy
if not errorlevel 1 goto :pyok
echo        بايثون غير موجود — راح أنصّبه (Python 3.12) ...
where winget >nul 2>&1 || goto :nopy
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
call :findpy
if errorlevel 1 goto :nopy
:pyok
echo        بايثون جاهز: %PYEXE% %PYARG%

rem منصة شغّالة من قبل تبقى على الكود القديم: نوقف بايثونها. نافذتها القديمة ترجع تشغّله بالكود الجديد
rem بعد 5 ثواني، وإذا ماكو نافذة نشغّله هنا بآخر السكربت.
set "OLDUP="
"%PYEXE%" %PYARG% "%HOMED%\app\windows\util.py" up 5819
if errorlevel 1 goto :fresh
echo        المنصة شغّالة من قبل — أعيد تشغيلها حتى تاخذ التحديث ...  (restart)
"%PYEXE%" %PYARG% "%HOMED%\app\windows\util.py" stop 5819 >nul 2>&1
if errorlevel 1 set "OLDUP=1"
ping -n 9 127.0.0.1 >nul
:fresh

echo  [4/4] اختصارات سطح المكتب ...  (shortcuts)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop');$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut($d+'\Civil 5819.lnk');$s.TargetPath=$env:HOMED+'\app\windows\start_windows.bat';$s.WorkingDirectory=$env:HOMED+'\app';$s.Save();$s=$w.CreateShortcut($d+'\Civil 5819 - Domain.lnk');$s.TargetPath=$env:HOMED+'\app\windows\domain_windows.bat';$s.WorkingDirectory=$env:HOMED+'\app';$s.Save()" >nul 2>&1
echo        «Civil 5819» يشغّل المنصة · «Civil 5819 - Domain» يربطها بالدومين
echo.
echo  ================================================
echo    خلص التثبيت — هسه تشتغل المنصة   (done)
echo  ================================================
if not defined OLDUP goto :go
set "CIVIL_MSG=التحديث نزل، بس المنصة القديمة بعدها شغّالة.~~~~سد نافذتها السودة، وبعدين شغّل اختصار Civil 5819 من سطح المكتب حتى تاخذ التحديث."
call :box
:go
call "%HOMED%\app\windows\start_windows.bat"
exit /b 0

:nocurl
set "ECODE=E1"
echo  [x] هذا الأمر يحتاج ويندوز 10 أو 11 (curl و tar موجودين بيهن).
set "CIVIL_MSG=هذا الأمر يحتاج ويندوز 10 أو 11."
goto :fail
:nonet
set "ECODE=E2"
echo  [x] فشل التحميل — تأكد من الإنترنت وأعد المحاولة.
set "CIVIL_MSG=ما كدرت أنزّل ملفات المنصة من GitHub.~~~~السبب بالغالب الإنترنت، أو إن GitHub ما يفتح زين على هذا الخط.~~~~شتسوي: شغّل نفس الأمر مرة ثانية، يكمل من مكان ما وقف. وإذا ما مشى جرّب خط ثاني، مثل نقطة اتصال الموبايل."
goto :fail
:nocopy
set "ECODE=E3"
echo  [x] ما قدرت أنسخ الملفات إلى %HOMED%\app
set "CIVIL_MSG=ما كدرت أنسخ الملفات لمجلد المنصة.~~~~سد أي نافذة سودة مفتوحة مال المنصة، وشغّل الأمر مرة ثانية."
goto :fail
:nopy
set "ECODE=E4"
echo  [x] ما قدرت أنصّب بايثون تلقائياً. نزّله من الصفحة اللي راح تنفتح،
echo      وأثناء التنصيب أشّر على  Add python.exe to PATH  ثم أعد هذا الأمر.
start "" "https://www.python.org/downloads/windows/"
set "CIVIL_MSG=بايثون ما موجود بالحاسبة وما كدرت أنصّبه تلقائياً.~~~~انفتحت صفحة python.org: نزّل Python ونصّبه، وأثناء التنصيب أشّر على Add python.exe to PATH.~~~~بعدها شغّل نفس الأمر مرة ثانية."
goto :fail
:fail
echo.
echo  [x] ما كمل التثبيت.
echo      ERROR %ECODE% - install did not finish. Take a photo of this window before pressing a key.
call :box
pause
exit /b 1

:getcore
rem الحزمة الخفيفة: manifest ← core.zip (يكمل المقطوع) ← فحص SHA-256 ← فك. أي فشل ← SRC يبقى فارغاً.
set "M_core_sha256="
set "M_dwg_sha256="
curl %CURLREV% -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -m 90 -o "%TMPD%\manifest.txt" "%RAWCIVIL%/windows/pkg/manifest.txt"
if errorlevel 1 exit /b 1
for /f "usebackq tokens=1,2 delims==" %%A in ("%TMPD%\manifest.txt") do set "M_%%A=%%B"
if not defined M_core_sha256 exit /b 1
set "CZ=%CACHE%\core-%M_core_sha256:~0,12%.zip"
rem حزم نسخ أقدم ما إلها لازمة
set "CZN=core-%M_core_sha256:~0,12%.zip"
for /f "delims=" %%F in ('dir /b "%CACHE%\core-*" 2^>nul') do if /i not "%%F"=="%CZN%" if /i not "%%F"=="%CZN%.part" del /q "%CACHE%\%%F" >nul 2>&1
if exist "%CZ%" goto :gc_unpack
set /a GC_ROUND=0
:gc_get
set /a GC_ROUND+=1
call :fetch "%RAWCIVIL%/windows/pkg/core.zip" "%CZ%.part" 8
if errorlevel 1 exit /b 1
call :sha "%CZ%.part"
if defined SHA if /i not "%SHA%"=="%M_core_sha256%" goto :gc_bad
move /y "%CZ%.part" "%CZ%" >nul
:gc_unpack
if exist "%TMPD%\core" rmdir /s /q "%TMPD%\core"
mkdir "%TMPD%\core"
tar -xf "%CZ%" -C "%TMPD%\core"
if errorlevel 1 goto :gc_badzip
if not exist "%TMPD%\core\civil\app.py" goto :gc_badzip
set "SRC=%TMPD%\core\civil"
set "SLIM=1"
exit /b 0
:gc_bad
rem الملف ما يطابق البصمة (تحميل مخلوط من نسختين) ← مرة ثانية من الصفر
del /q "%CZ%.part" >nul 2>&1
if %GC_ROUND% lss 2 goto :gc_get
exit /b 1
:gc_badzip
del /q "%CZ%" >nul 2>&1
exit /b 1

:getfull
rem الأرشيف الكامل ما يدعم الإكمال، فننتظر الخط الضعيف ونعيد فقط إذا وقف 5 دقايق كاملة.
curl %CURLREV% -fL --retry 3 --retry-delay 3 --connect-timeout 30 -y 300 -Y 1 -o "%TMPD%\src.zip" "%FULLZIP%"
if errorlevel 1 exit /b 1
tar -xf "%TMPD%\src.zip" -C "%TMPD%"
if errorlevel 1 exit /b 1
set "SRC=%TMPD%\Nn-%BR:/=-%\civil"
if not exist "%SRC%\app.py" for /d %%D in ("%TMPD%\Nn-*") do set "SRC=%%D\civil"
if not exist "%SRC%\app.py" set "SRC="
exit /b 0

:getdwg
rem محرّك قراءة DWG (2.2 ميغا) ينزل مرة وحدة ويبقى بين التحديثات؛ ينعاد فقط إذا تغيّرت بصمته. فشله ما يوقف التثبيت.
if not defined M_dwg_sha256 exit /b 0
set "DW=%HOMED%\app\%DWGREL%"
if not exist "%DW%" goto :gd_need
call :sha "%DW%"
if not defined SHA exit /b 0
if /i "%SHA%"=="%M_dwg_sha256%" exit /b 0
:gd_need
echo        محرّك قراءة DWG (2.2 ميغا، مرة وحدة) ...
set "DP=%CACHE%\dwg-%M_dwg_sha256:~0,12%.part"
call :fetch "%RAWCIVIL%/static/vendor/libredwg/wasm/libredwg-web.wasm.gz" "%DP%" 6
if errorlevel 1 goto :gd_fail
call :sha "%DP%"
if defined SHA if /i not "%SHA%"=="%M_dwg_sha256%" goto :gd_bad
copy /y "%DP%" "%DW%" >nul
del /q "%DP%" >nul 2>&1
exit /b 0
:gd_bad
del /q "%DP%" >nul 2>&1
:gd_fail
echo        [!] محرّك DWG ما نزل هسه — استيراد DXF يشتغل. أعد أمر التثبيت بعدين حتى ينزل.
exit /b 0

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

:fetch
rem %1 الرابط · %2 الملف · %3 كم محاولة متتالية بلا أي تقدّم قبل الاستسلام
rem يكمل الملف المقطوع (-C -)، ويعيد إذا السرعة نزلت تحت 500 بايت/ثانية لمدة دقيقة.
set "F_URL=%~1"
set "F_OUT=%~2"
set /a F_MAX=%~3
set /a F_TRY=0
set /a F_BAD=0
:fetch_loop
set /a F_TRY+=1
if %F_TRY% gtr %F_MAX% exit /b 1
set "F_S0=0"
if exist "%F_OUT%" for %%Z in ("%F_OUT%") do set "F_S0=%%~zZ"
if %F_TRY% gtr 1 echo  ... الخط انقطع — أكمل من مكان ما وقف (resuming)
curl %CURLREV% -fL -C - --connect-timeout 30 -y 60 -Y 500 -o "%F_OUT%" "%F_URL%"
set "F_RC=%errorlevel%"
if "%F_RC%"=="0" exit /b 0
rem 33 السيرفر ما يدعم الإكمال · 22 رد خطأ (مثل 404) ← من الصفر، ولحد 3 مرات
if "%F_RC%"=="33" set /a F_BAD+=1
if "%F_RC%"=="22" set /a F_BAD+=1
if "%F_RC%"=="33" del /q "%F_OUT%" >nul 2>&1
if "%F_RC%"=="22" del /q "%F_OUT%" >nul 2>&1
if %F_BAD% geq 3 exit /b 1
set "F_S1=0"
if exist "%F_OUT%" for %%Z in ("%F_OUT%") do set "F_S1=%%~zZ"
rem نزل شي جديد بهذي المحاولة ← العدّاد يرجع صفر (المهم ما نبقى ندور بلا تقدّم)
if %F_S1% gtr %F_S0% set /a F_TRY=0
ping -n 4 127.0.0.1 >nul
goto :fetch_loop

:sha
rem SHA-256 لملف (%1) عبر certutil الموجود بكل ويندوز. SHA يبقى فارغاً إذا تعذّر الحساب ← نتخطى الفحص.
set "SHA="
for /f "skip=1 delims=" %%H in ('certutil -hashfile "%~1" SHA256 2^>nul') do if not defined SHA set "SHA=%%H"
if not defined SHA exit /b 0
set "SHA=%SHA: =%"
if not "%SHA:~64,1%"=="" set "SHA="
if not defined SHA exit /b 0
if "%SHA:~63,1%"=="" set "SHA="
exit /b 0

:box
rem نافذة رسالة عربية — النافذة السودة تعرض العربي مقلوباً فما ينقري. النص بالمتغيّر CIVIL_MSG و ~~ = سطر جديد.
rem (1572864 = RtlReading + RightAlign، والنموذج المخفي TopMost حتى تطلع فوق باقي النوافذ). إذا PowerShell ممنوع بالحاسبة تبقى رسالة الكونسول ورمز الخطأ.
if defined CIVIL_NOGUI exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $t=$env:CIVIL_MSG -replace '~~',[Environment]::NewLine; $f=New-Object System.Windows.Forms.Form; $f.TopMost=$true; [void][System.Windows.Forms.MessageBox]::Show($f,$t,'Civil 5819',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning,[System.Windows.Forms.MessageBoxDefaultButton]::Button1,[System.Windows.Forms.MessageBoxOptions]1572864)" >nul 2>&1
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
