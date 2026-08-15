@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js est necessaire pour construire l'installateur. & pause & exit /b 1)
call npm install || goto :error
call npm test || goto :error
call npm run dist || goto :error
start "" "%~dp0dist"
echo Installateur termine : dist\Tangram-Atelier-1.0.0-Setup.exe
pause
exit /b 0
:error
echo La creation de l'installateur a echoue.
pause
exit /b 1
