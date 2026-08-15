@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python est necessaire pour le mode developpement.
    pause
    exit /b 1
  )
  set "PYTHON=py"
) else (
  set "PYTHON=python"
)

echo Lancement de Tangram Atelier DEV sur http://127.0.0.1:8765
start "Serveur Tangram DEV - fermer cette fenetre pour arreter" cmd /k "%PYTHON% server.py --port 8765"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8765"
