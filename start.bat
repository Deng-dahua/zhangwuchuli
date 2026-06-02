@echo off
chcp 65001 >nul
echo ========================================
echo   财税系统 — 强制冷启动
echo ========================================
echo.

:: 1. 杀掉所有占用 8001/8002 端口的进程
echo [1/3] 清理端口占用...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    echo   杀掉 PID: %%a (端口 8001)
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8002 " ^| findstr "LISTENING"') do (
    echo   杀掉 PID: %%a (端口 8002)
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 2. 清理所有 Python 字节码缓存
echo [2/3] 清理 __pycache__ ...
for /d /r . %%d in (__pycache__) do @if exist "%%d" (
    rd /s /q "%%d" 2>nul
    echo   删除: %%d
)
del /s /q *.pyc 2>nul
echo.

:: 3. 冷启动服务器
echo [3/3] 启动服务器...
echo.
"C:\Users\26726\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m uvicorn main:app --port 8002 --reload

pause
