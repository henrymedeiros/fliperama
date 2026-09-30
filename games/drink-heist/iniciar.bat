@echo off
chcp 65001 >nul
title Drink Heist - servidor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
echo Deixe esta janela aberta enquanto jogam. Feche pra desligar o servidor.
set OPEN_BROWSER=1
node server.js
pause
