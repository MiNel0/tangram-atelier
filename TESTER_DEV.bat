@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est necessaire pour lancer les tests. & pause & exit /b 1)
node test_geometry.js
node test_desktop.js
python -m unittest test_server.py
pause
