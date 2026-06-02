@echo off
chcp 65001 >nul
echo 杀掉 8001 端口进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001" ^| findstr "LISTENING"') do (
    echo   杀掉 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo 完成
pause
