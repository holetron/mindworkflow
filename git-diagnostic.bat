@echo off
chcp 65001 >nul
REM Git Installation Diagnostic Script for Windows
REM Скрипт диагностики установки Git для Windows

echo === Git Installation Diagnostic / Диагностика установки Git ===
echo.

REM Check if git is installed and accessible
echo 1. Проверка установки Git...
git --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Git найден в системе
    for /f "tokens=*" %%a in ('git --version') do echo    Версия: %%a
) else (
    echo ❌ Git не найден в PATH
    echo    Рекомендация: Переустановите Git и убедитесь, что он добавлен в PATH
    echo    https://git-scm.com/download/windows
)

echo.

REM Check PATH variable
echo 2. Проверка переменной PATH...
echo    PATH содержит следующие директории:
echo %PATH% | findstr /i git >nul
if %errorlevel% == 0 (
    echo %PATH% | tr ";" "\n" | findstr /i git
) else (
    echo    ❌ Git не найден в PATH
)

echo.

REM Check git configuration
echo 3. Проверка конфигурации Git...
git --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%a in ('git config --global user.name 2^>nul') do set user_name=%%a
    for /f "tokens=*" %%a in ('git config --global user.email 2^>nul') do set user_email=%%a
    
    if defined user_name (
        echo ✅ Имя пользователя настроено: %user_name%
    ) else (
        echo ⚠️  Имя пользователя не настроено
        echo    Выполните: git config --global user.name "Ваше Имя"
    )
    
    if defined user_email (
        echo ✅ Email настроен: %user_email%
    ) else (
        echo ⚠️  Email не настроен  
        echo    Выполните: git config --global user.email "your.email@example.com"
    )
) else (
    echo ❌ Git не доступен для проверки конфигурации
)

echo.

REM Test basic git functionality
echo 4. Тестирование основных функций Git...
git --version >nul 2>&1
if %errorlevel% == 0 (
    REM Create temporary directory for testing
    set temp_dir=%TEMP%\git-test-%RANDOM%
    mkdir "%temp_dir%" >nul 2>&1
    cd /d "%temp_dir%" >nul 2>&1
    
    git init >nul 2>&1
    if %errorlevel% == 0 (
        echo ✅ git init работает
        
        echo test > test.txt 2>nul
        git add test.txt >nul 2>&1
        if %errorlevel% == 0 (
            echo ✅ git add работает
            
            git commit -m "test commit" >nul 2>&1
            if %errorlevel% == 0 (
                echo ✅ git commit работает
            ) else (
                echo ⚠️  git commit требует настройки user.name и user.email
            )
        ) else (
            echo ❌ git add не работает
        )
    ) else (
        echo ❌ git init не работает
    )
    
    REM Cleanup
    cd /d "%~dp0" >nul 2>&1
    rmdir /s /q "%temp_dir%" >nul 2>&1
) else (
    echo ❌ Git не доступен для тестирования
)

echo.

REM System information
echo 5. Информация о системе...
echo    Операционная система: %OS%
echo    Процессор: %PROCESSOR_ARCHITECTURE%

echo.

REM Recommendations
echo === Рекомендации ===
git --version >nul 2>&1
if not %errorlevel% == 0 (
    echo 🔧 Git не установлен или не настроен правильно:
    echo    1. Скачайте Git с https://git-scm.com/download/windows
    echo    2. При установке убедитесь, что выбрана опция 'Add Git to PATH'
    echo    3. Перезагрузите командную строку или компьютер
    echo    4. Запустите этот скрипт снова для проверки
) else (
    echo ✅ Git установлен и работает
    for /f "tokens=*" %%a in ('git config --global user.name 2^>nul') do set user_name=%%a
    for /f "tokens=*" %%a in ('git config --global user.email 2^>nul') do set user_email=%%a
    if not defined user_name (
        echo ⚠️  Настройте Git конфигурацию:
        echo    git config --global user.name "Ваше Имя"
        echo    git config --global user.email "your.email@example.com"
    ) else if not defined user_email (
        echo ⚠️  Настройте Git конфигурацию:
        echo    git config --global user.name "Ваше Имя"
        echo    git config --global user.email "your.email@example.com"
    )
)

echo.
echo === Дополнительная помощь ===
echo 📖 Документация: https://git-scm.com/book/ru/v2
echo 🔍 Руководство по решению проблем: git-troubleshooting-ru.md
echo ❓ Если проблема не решена, создайте issue с выводом этого скрипта

echo.
echo === Diagnostic Complete / Диагностика завершена ===
pause