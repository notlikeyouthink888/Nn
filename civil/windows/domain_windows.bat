@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ==================================================================
rem  نشر المنصة من هذه الحاسبة على الإنترنت عبر Cloudflare Tunnel
rem  (بدون IP ثابت وبدون فتح منافذ بالراوتر).
rem    domain_windows.bat                 الدومين الافتراضي ourchess.site
rem    domain_windows.bat example.com     دومين آخر
rem  الأسئلة والأخطاء تطلع بنوافذ عربية — النافذة السودة تقلب العربي فما ينقري.
rem ==================================================================
cd /d "%~dp0.."
title Civil 5819 - domain
set "DOMAIN=ourchess.site"
if not "%~1"=="" set "DOMAIN=%~1"
set "PORT=5819"
set "NAME=civil5819"
set "BIN=%USERPROFILE%\civil5819\bin"
set "CF=%BIN%\cloudflared.exe"
set "CFD=%USERPROFILE%\.cloudflared"
set "CF_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
set "QLOG=%TEMP%\civil5819_quick.log"
set "ECODE=D0"

call :findpy
if errorlevel 1 goto :nopy

if not exist "%BIN%" mkdir "%BIN%"
call :cftest
if not errorlevel 1 goto :cfok
rem ملف موجود بس ما يشتغل = تحميل قديم انقطع بالنص ← نكمله بدل ما نبدي من الصفر
if exist "%CF%" if not exist "%CF%.part" move /y "%CF%" "%CF%.part" >nul
if exist "%CF%" del /q "%CF%" >nul 2>&1
call :curlflags
echo  تحميل cloudflared (أداة النفق الرسمية من Cloudflare — حوالي 53 ميغا، مرة وحدة) ...
echo  downloading cloudflared (about 53 MB, once) - resumes if the line drops.
set /a CF_ROUND=0
:cfget
set /a CF_ROUND+=1
call :fetch "%CF_URL%" "%CF%.part" 8
if errorlevel 1 goto :nonet
move /y "%CF%.part" "%CF%" >nul
call :cftest
if not errorlevel 1 goto :cfok
rem اكتمل بس ما يشتغل (نسخة تغيّرت بالنص) ← مرة ثانية من الصفر
del /q "%CF%" >nul 2>&1
if %CF_ROUND% lss 2 goto :cfget
goto :nonet
:cfok

rem السيرفر لازم يشتغل أولاً — إذا مو شغّال نفتحه بنافذة ثانية.
rem النفق يتصل بـ 127.0.0.1 صريحاً: localhost على ويندوز يجرّب ‎::1 (IPv6) أولاً والمنصة تستمع على IPv4.
"%PYEXE%" %PYARG% "%~dp0util.py" up %PORT%
if not errorlevel 1 goto :srvok
echo  تشغيل السيرفر بنافذة ثانية ...
start "Civil 5819 - server" "%~dp0start_windows.bat" nobrowser
ping -n 5 127.0.0.1 >nul
:srvok

set "CIVIL_MSG=شلون تريد تفتح المنصة من برّه؟~~~~نعم (Yes) = على دومينك %DOMAIN%~~يحتاج الدومين مضاف بحساب Cloudflare وحالته Active.~~~~لا (No) = رابط مؤقت فوري للتجربة، بدون حساب."
call :ask
if "%ASK%"=="Y" goto :domain
if "%ASK%"=="N" goto :quick
echo.
echo  ================================================
echo    1 = رابط مؤقت فوري — بدون حساب (رابط trycloudflare.com يتغيّر كل مرة)
echo    2 = ربط الدومين %DOMAIN% — يحتاج الدومين مضاف بحساب Cloudflare
echo    1 = quick temporary link    2 = your domain %DOMAIN%
echo  ================================================
choice /c 12 /n /m "  1 / 2 : "
if errorlevel 2 goto :domain

:quick
echo.
echo  الرابط يطلع بالأسفل بسطر فيه trycloudflare.com — وراح يطلعلك بنافذة وينتسخ للحافظة.
echo  لا تسد هذه النافذة.   (keep this window open)
if exist "%QLOG%" del /q "%QLOG%" >nul 2>&1
if not defined CIVIL_NOGUI start "" /b "%PYEXE%" %PYARG% "%~dp0util.py" quickurl "%QLOG%" >nul 2>&1
"%CF%" tunnel --no-autoupdate --logfile "%QLOG%" --url http://127.0.0.1:%PORT%
pause
exit /b 0

:domain
if exist "%CFD%\cert.pem" goto :logged
echo.
echo  راح ينفتح المتصفح: سجّل دخول Cloudflare واختار الدومين %DOMAIN% ثم Authorize.
set "CIVIL_MSG=هسة ينفتح المتصفح على Cloudflare:~~~~1) سجّل دخول بحسابك.~~2) اضغط على %DOMAIN% بالقائمة.~~3) اضغط Authorize.~~~~إذا الدومين ما طالع بالقائمة فهو بعده مو Active عند Cloudflare."
call :box
"%CF%" tunnel login
if errorlevel 1 goto :nologin
:logged
set "UUID="
for /f "tokens=1,2" %%A in ('call "%CF%" tunnel list 2^>nul') do if /i "%%B"=="%NAME%" set "UUID=%%A"
if defined UUID goto :have
echo  إنشاء نفق باسم %NAME% ...
"%CF%" tunnel create %NAME%
if errorlevel 1 goto :nologin
for /f "tokens=1,2" %%A in ('call "%CF%" tunnel list 2^>nul') do if /i "%%B"=="%NAME%" set "UUID=%%A"
if not defined UUID goto :nologin
:have
if exist "%CFD%\%UUID%.json" goto :cred
set "ECODE=D5"
echo  [x] النفق %NAME% موجود بحسابك لكن ملف مفتاحه مو على هذه الحاسبة.
echo      احذفه من لوحة Cloudflare: Zero Trust - Networks - Tunnels  ثم أعد هذا الأمر.
set "CIVIL_MSG=النفق %NAME% موجود بحسابك بـ Cloudflare، بس ملف مفتاحه مو على هذي الحاسبة.~~~~احذفه من لوحة Cloudflare: Zero Trust ثم Networks ثم Tunnels، وبعدها شغّل هذا الاختصار مرة ثانية."
goto :fail
:cred
echo  توجيه %DOMAIN% و www.%DOMAIN% لهذه الحاسبة ...
set "RLOG=%TEMP%\civil5819_route.log"
"%CF%" tunnel route dns --overwrite-dns %NAME% %DOMAIN% >"%RLOG%" 2>&1
set "R_RC=%errorlevel%"
type "%RLOG%"
if "%R_RC%"=="0" goto :routed
rem سجل قديم بنفس الاسم (من السيرفر السابق أو صفحة الشركة) ما ينكتب فوقه إذا أكثر من واحد ← ينحذف يدوياً
findstr /i /c:"already exists" "%RLOG%" >nul 2>&1
if not errorlevel 1 goto :dnsdup
goto :nozone
:routed
"%CF%" tunnel route dns --overwrite-dns %NAME% www.%DOMAIN% >nul 2>&1

set "YML=%CFD%\%NAME%.yml"
>"%YML%" echo tunnel: %UUID%
>>"%YML%" echo credentials-file: %CFD%\%UUID%.json
>>"%YML%" echo ingress:
>>"%YML%" echo   - hostname: %DOMAIN%
>>"%YML%" echo     service: http://127.0.0.1:%PORT%
>>"%YML%" echo   - hostname: www.%DOMAIN%
>>"%YML%" echo     service: http://127.0.0.1:%PORT%
>>"%YML%" echo   - service: http_status:404

set "CIVIL_MSG=تريد المنصة والدومين يشتغلون تلقائياً ويّا تشغيل الحاسبة؟"
call :ask
if "%ASK%"=="Y" goto :auto
if "%ASK%"=="N" goto :run
echo.
choice /c YN /n /m "  autostart with Windows?  Y / N : "
if errorlevel 2 goto :run
:auto
set "SU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\civil5819.bat"
>"%SU%" echo @echo off
>>"%SU%" echo start "Civil 5819 - server" /min "%~dp0start_windows.bat" nobrowser
>>"%SU%" echo ping -n 7 127.0.0.1 ^>nul
>>"%SU%" echo start "Civil 5819 - domain" /min "%CF%" tunnel --no-autoupdate --config "%CFD%\%NAME%.yml" run
echo  تم: يشتغلون تلقائياً من المرة الجاية.

:run
echo.
echo  ================================================
echo    https://%DOMAIN%/  يوصل لهذه الحاسبة هسه
echo    (أول مرة ممكن ياخذ دقائق لحد ما يتحدّث الـDNS)
echo    لا تسد هذه النافذة ولا نافذة السيرفر، وخلّي الحاسبة شغّالة.
echo    keep this window open  -  https://%DOMAIN%/
echo  ================================================
set "CIVIL_MSG=كلشي جاهز.~~~~من تضغط موافق يشتغل النفق، و https://%DOMAIN% يفتح المنصة من أي مكان. أول مرة ممكن ياخذ دقايق.~~~~خلّي النافذة السودة مفتوحة والحاسبة شغّالة."
call :box
"%CF%" tunnel --no-autoupdate --config "%CFD%\%NAME%.yml" run
pause
exit /b 0

:nologin
set "ECODE=D2"
echo  [x] ما كمل تسجيل الدخول أو إنشاء النفق بـ Cloudflare.
set "CIVIL_MSG=ما كمل تسجيل الدخول بـ Cloudflare.~~~~تأكد إنك ضغطت على الدومين %DOMAIN% وبعدها Authorize بالمتصفح، وإن الدومين حالته Active.~~~~بعدها شغّل هذا الاختصار مرة ثانية."
goto :fail
:nozone
set "ECODE=D3"
echo  [x] ما قدرت أوجّه %DOMAIN%. لازم الدومين يكون مضاف بحساب Cloudflare (الخطة المجانية تكفي)
echo      وسيرفرات الأسماء Nameservers عند شركة الدومين مغيّرة لسيرفرات Cloudflare.
echo      بعدها احذف الملف %CFD%\cert.pem وأعد هذا الأمر واختار الدومين الصحيح.
set "CIVIL_MSG=ما كدرت أوجّه %DOMAIN% لحاسبتك.~~~~لازم الدومين يكون مضاف بحساب Cloudflare، والـ Nameservers عند شركة الدومين مغيّرة لأسماء Cloudflare، وحالته Active.~~~~إذا اخترت دومين غلط بالمتصفح: احذف الملف cert.pem من المجلد %CFD% وشغّل الاختصار مرة ثانية."
goto :fail
:dnsdup
set "ECODE=D6"
echo  [x] سجل DNS قديم باسم %DOMAIN% موجود عند Cloudflare ويمنع الربط — احذفه من DNS - Records وأعد التشغيل.
set "CIVIL_MSG=اكو سجل DNS قديم للدومين عند Cloudflare يمنع الربط.~~~~1) افتح dash.cloudflare.com واضغط على %DOMAIN%~~2) من القائمة اختار DNS ثم Records~~3) احذف كل سطر نوعه A أو AAAA أو CNAME واسمه %DOMAIN% أو www  (اضغط Edit ثم Delete)~~4) شغّل هذا الاختصار مرة ثانية."
goto :fail
:nonet
set "ECODE=D1"
echo  [x] ما كمل تحميل cloudflared — تأكد من الإنترنت وشغّل هذا الاختصار مرة ثانية (يكمل من مكان ما وقف).
set "CIVIL_MSG=ما كمل تحميل أداة النفق cloudflared (53 ميغا).~~~~السبب بالغالب الإنترنت، أو إن GitHub ما يفتح زين على هذا الخط.~~~~شغّل هذا الاختصار مرة ثانية: يكمل من مكان ما وقف وما يبدي من الصفر."
goto :fail
:nopy
set "ECODE=D4"
echo  [x] بايثون غير موجود — شغّل install_windows.bat أولاً.
set "CIVIL_MSG=بايثون ما موجود بالحاسبة.~~~~شغّل أمر التثبيت أولاً، وبعدها ارجع لهذا الاختصار."
goto :fail
:fail
echo.
echo      ERROR %ECODE% - take a photo of this window before pressing a key.
call :box
pause
exit /b 1

:cftest
rem cloudflared سليم إذا جاوب على --version؛ الملف الناقص أو التالف يفشل
if not exist "%CF%" exit /b 1
"%CF%" --version >nul 2>&1
if errorlevel 1 exit /b 1
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

:box
rem نافذة رسالة عربية — النافذة السودة تعرض العربي مقلوباً فما ينقري. النص بالمتغيّر CIVIL_MSG و ~~ = سطر جديد.
rem (1572864 = RtlReading + RightAlign، والنموذج المخفي TopMost حتى تطلع فوق باقي النوافذ). إذا PowerShell ممنوع بالحاسبة تبقى رسالة الكونسول ورمز الخطأ.
if defined CIVIL_NOGUI exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $t=$env:CIVIL_MSG -replace '~~',[Environment]::NewLine; $f=New-Object System.Windows.Forms.Form; $f.TopMost=$true; [void][System.Windows.Forms.MessageBox]::Show($f,$t,'Civil 5819',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning,[System.Windows.Forms.MessageBoxDefaultButton]::Button1,[System.Windows.Forms.MessageBoxOptions]1572864)" >nul 2>&1
exit /b 0

:ask
rem سؤال نعم/لا بنافذة عربية (النص بـ CIVIL_MSG). النتيجة ASK=Y أو N؛ تبقى فارغة إذا النافذة ما طلعت ← سؤال الكونسول.
set "ASK="
if defined CIVIL_NOGUI exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $t=$env:CIVIL_MSG -replace '~~',[Environment]::NewLine; $f=New-Object System.Windows.Forms.Form; $f.TopMost=$true; $r=[System.Windows.Forms.MessageBox]::Show($f,$t,'Civil 5819',[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Question,[System.Windows.Forms.MessageBoxDefaultButton]::Button1,[System.Windows.Forms.MessageBoxOptions]1572864); if($r -eq [System.Windows.Forms.DialogResult]::Yes){exit 6}; if($r -eq [System.Windows.Forms.DialogResult]::No){exit 7}; exit 1" >nul 2>&1
set "ASK_RC=%errorlevel%"
if "%ASK_RC%"=="6" set "ASK=Y"
if "%ASK_RC%"=="7" set "ASK=N"
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
