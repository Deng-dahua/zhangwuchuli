@echo off
cd /d "C:\Users\26726\WorkBuddy\2026-05-31-09-56-37\caishuixitong"
echo 杀掉占用8001端口的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo 启动服务(端口8001)...
C:\Users\26726\.workbuddy\binaries\python\versions\3.13.12\python.exe -m uvicorn main:app --port 8001
pause
