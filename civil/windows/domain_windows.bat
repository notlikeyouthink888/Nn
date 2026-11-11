@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ==================================================================
rem  نشر المنصة من هذه الحاسبة على الإنترنت عبر Cloudflare Tunnel
rem  (بدون IP ثابت وبدون فتح منافذ بالراوتر).
rem    domain_windows.bat                 الدومين الافتراضي ourchess.site
rem    domain_windows.bat example.com     دومين آخر
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

if not exist "%BIN%" mkdir "%BIN%"
call :cftest
if not errorlevel 1 goto :cfok
rem ملف موجود بس ما يشتغل = تحميل قديم انقطع بالنص ← نكمله بدل ما نبدي من الصفر
if exist "%CF%" if not exist "%CF%.part" move /y "%CF%" "%CF%.part" >nul
if exist "%CF%" del /q "%CF%" >nul 2>&1
call :curlflags
echo  تحميل cloudflared (أداة النفق الرسمية من Cloudflare — حوالي 53 ميغا، مرة وحدة) ...
echo  إذا انقطع الخط يكمل من مكان ما وقف، وإذا سدّيت النافذة يكمل بالمرة الجاية.
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

rem السيرفر لازم يشتغل أولاً — إذا مو شغّال نفتحه بنافذة ثانية
call :findpy
if errorlevel 1 goto :nopy
"%PYEXE%" %PYARG% "%~dp0util.py" up %PORT%
if not errorlevel 1 goto :srvok
echo  تشغيل السيرفر بنافذة ثانية ...
start "Civil 5819 - server" "%~dp0start_windows.bat" nobrowser
ping -n 5 127.0.0.1 >nul
:srvok

echo.
echo  ================================================
echo    1 = رابط مؤقت فوري — بدون حساب (رابط trycloudflare.com يتغيّر كل مرة)
echo    2 = ربط الدومين %DOMAIN% — يحتاج الدومين مضاف بحساب Cloudflare
echo  ================================================
choice /c 12 /n /m "  اختار 1 أو 2: "
if errorlevel 2 goto :domain

echo.
echo  الرابط يطلع بالأسفل بسطر فيه trycloudflare.com — انسخه وافتحه من أي مكان.
echo  لا تسد هذه النافذة.
"%CF%" tunnel --no-autoupdate --url http://localhost:%PORT%
pause
exit /b 0

:domain
if exist "%CFD%\cert.pem" goto :logged
echo.
echo  راح ينفتح المتصفح: سجّل دخول Cloudflare واختار الدومين %DOMAIN% ثم Authorize.
"%CF%" tunnel login
if errorlevel 1 goto :fail
:logged
set "UUID="
for /f "tokens=1,2" %%A in ('call "%CF%" tunnel list 2^>nul') do if /i "%%B"=="%NAME%" set "UUID=%%A"
if defined UUID goto :have
echo  إنشاء نفق باسم %NAME% ...
"%CF%" tunnel create %NAME%
if errorlevel 1 goto :fail
for /f "tokens=1,2" %%A in ('call "%CF%" tunnel list 2^>nul') do if /i "%%B"=="%NAME%" set "UUID=%%A"
if not defined UUID goto :fail
:have
if exist "%CFD%\%UUID%.json" goto :cred
echo  [x] النفق %NAME% موجود بحسابك لكن ملف مفتاحه مو على هذه الحاسبة.
echo      احذفه من لوحة Cloudflare: Zero Trust - Networks - Tunnels  ثم أعد هذا الأمر.
goto :fail
:cred
echo  توجيه %DOMAIN% و www.%DOMAIN% لهذه الحاسبة ...
"%CF%" tunnel route dns --overwrite-dns %NAME% %DOMAIN%
if errorlevel 1 goto :nozone
"%CF%" tunnel route dns --overwrite-dns %NAME% www.%DOMAIN% >nul 2>&1

set "YML=%CFD%\%NAME%.yml"
>"%YML%" echo tunnel: %UUID%
>>"%YML%" echo credentials-file: %CFD%\%UUID%.json
>>"%YML%" echo ingress:
>>"%YML%" echo   - hostname: %DOMAIN%
>>"%YML%" echo     service: http://localhost:%PORT%
>>"%YML%" echo   - hostname: www.%DOMAIN%
>>"%YML%" echo     service: http://localhost:%PORT%
>>"%YML%" echo   - service: http_status:404

echo.
choice /c YN /n /m "  تريد المنصة والدومين يشتغلون تلقائياً ويا تشغيل الحاسبة؟ Y = نعم / N = لا : "
if errorlevel 2 goto :run
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
echo  ================================================
"%CF%" tunnel --no-autoupdate --config "%CFD%\%NAME%.yml" run
pause
exit /b 0

:nozone
echo  [x] ما قدرت أوجّه %DOMAIN%. لازم الدومين يكون مضاف بحساب Cloudflare (الخطة المجانية تكفي)
echo      وسيرفرات الأسماء Nameservers عند شركة الدومين مغيّرة لسيرفرات Cloudflare.
echo      بعدها احذف الملف %CFD%\cert.pem وأعد هذا الأمر واختار الدومين الصحيح.
goto :fail
:nonet
echo  [x] ما كمل تحميل cloudflared — تأكد من الإنترنت وشغّل هذا الاختصار مرة ثانية (يكمل من مكان ما وقف).
goto :fail
:nopy
echo  [x] بايثون غير موجود — شغّل install_windows.bat أولاً.
goto :fail
:fail
echo.
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
if %F_TRY% gtr 1 echo  ... الخط انقطع — أكمل من مكان ما وقف
curl %CURLREV% -fL -C - --connect-timeout 30 -y 60 -Y 500 -o "%F_OUT%" "%F_URL%"
set "F_RC=%errorlevel%"
if "%F_RC%"=="0" exit /b 0
rem 33 السيرفر ما يدعم الإكمال · 22 رد خطأ (416 ملف مكتمل أو تغيّر، 404 غير موجود) ← من الصفر، ولحد 3 مرات
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
