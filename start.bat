@echo off
cd /d "%~dp0"
echo ==========================================
echo   财税系统中小企业版 - 启动脚本
echo ==========================================
echo.

REM 使用 WorkBuddy 管理的 Python 启动
set PYTHON=C:\Users\26726\.workbuddy\binaries\python\envs\default\Scripts\python.exe

echo [1/2] 检查端口占用...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 "') do (
  echo 端口 8001 被进程 %%a 占用，正在释放...
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo [2/2] 启动服务 (http://127.0.0.1:8001)...
echo ==========================================
echo.
"%PYTHON%" -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
pause
