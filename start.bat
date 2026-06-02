@echo off
chcp 65001 >nul
title 财税系统 - 自动守护

set PYTHON=C:\Users\26726\.workbuddy\binaries\python\versions\3.13.12\python.exe
set PORT=8001

echo ========================================
echo   财税系统 - 稳定版
echo   端口: %PORT% | 自动重启: 开启
echo ========================================
echo.

:cleanup
echo [清理] 端口 %PORT% ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo   终止 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [清理] __pycache__ ...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d" 2>nul
del /s /q *.pyc 2>nul

:loop
echo.
echo ========================================
echo   [%date% %time%] 启动服务...
echo ========================================
echo.

"%PYTHON%" -m uvicorn main:app --host 0.0.0.0 --port %PORT%

echo.
echo ========================================
echo   [%date% %time%] 服务意外退出！
echo   5 秒后自动重启...
echo ========================================
timeout /t 5 /nobreak >nul
goto loop
