#!/bin/bash

# Git Installation Diagnostic Script
# Скрипт диагностики установки Git

echo "=== Git Installation Diagnostic / Диагностика установки Git ==="
echo

# Check if git is installed and accessible
echo "1. Проверка установки Git..."
if command -v git &> /dev/null; then
    echo "✅ Git найден в системе"
    git_version=$(git --version)
    echo "   Версия: $git_version"
else
    echo "❌ Git не найден в PATH"
    echo "   Рекомендация: Переустановите Git и убедитесь, что он добавлен в PATH"
    echo "   https://git-scm.com/downloads"
fi

echo

# Check PATH variable
echo "2. Проверка переменной PATH..."
echo "   PATH содержит следующие директории:"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    echo "$PATH" | tr ';' '\n' | grep -i git || echo "   ❌ Git не найден в PATH"
else
    # Unix-like systems
    echo "$PATH" | tr ':' '\n' | grep -i git || echo "   ❌ Git не найден в PATH"
fi

echo

# Check git configuration
echo "3. Проверка конфигурации Git..."
if command -v git &> /dev/null; then
    user_name=$(git config --global user.name 2>/dev/null)
    user_email=$(git config --global user.email 2>/dev/null)
    
    if [ -n "$user_name" ]; then
        echo "✅ Имя пользователя настроено: $user_name"
    else
        echo "⚠️  Имя пользователя не настроено"
        echo "   Выполните: git config --global user.name \"Ваше Имя\""
    fi
    
    if [ -n "$user_email" ]; then
        echo "✅ Email настроен: $user_email"
    else
        echo "⚠️  Email не настроен"
        echo "   Выполните: git config --global user.email \"your.email@example.com\""
    fi
else
    echo "❌ Git не доступен для проверки конфигурации"
fi

echo

# Test basic git functionality
echo "4. Тестирование основных функций Git..."
if command -v git &> /dev/null; then
    # Create temporary directory for testing
    temp_dir="/tmp/git-test-$$"
    mkdir -p "$temp_dir" 2>/dev/null
    cd "$temp_dir" 2>/dev/null
    
    if git init &>/dev/null; then
        echo "✅ git init работает"
        
        echo "test" > test.txt 2>/dev/null
        if git add test.txt &>/dev/null; then
            echo "✅ git add работает"
            
            if git commit -m "test commit" &>/dev/null 2>&1; then
                echo "✅ git commit работает"
            else
                echo "⚠️  git commit требует настройки user.name и user.email"
            fi
        else
            echo "❌ git add не работает"
        fi
    else
        echo "❌ git init не работает"
    fi
    
    # Cleanup
    cd - &>/dev/null
    rm -rf "$temp_dir" 2>/dev/null
else
    echo "❌ Git не доступен для тестирования"
fi

echo

# System information
echo "5. Информация о системе..."
echo "   Операционная система: $(uname -s 2>/dev/null || echo "Unknown")"
echo "   Архитектура: $(uname -m 2>/dev/null || echo "Unknown")"

echo

# Recommendations
echo "=== Рекомендации ==="
if ! command -v git &> /dev/null; then
    echo "🔧 Git не установлен или не настроен правильно:"
    echo "   1. Скачайте Git с https://git-scm.com/downloads"
    echo "   2. При установке убедитесь, что выбрана опция 'Add Git to PATH'"
    echo "   3. Перезагрузите терминал или компьютер"
    echo "   4. Запустите этот скрипт снова для проверки"
else
    echo "✅ Git установлен и работает"
    if [ -z "$(git config --global user.name 2>/dev/null)" ] || [ -z "$(git config --global user.email 2>/dev/null)" ]; then
        echo "⚠️  Настройте Git конфигурацию:"
        echo "   git config --global user.name \"Ваше Имя\""
        echo "   git config --global user.email \"your.email@example.com\""
    fi
fi

echo
echo "=== Дополнительная помощь ==="
echo "📖 Документация: https://git-scm.com/book/ru/v2"
echo "🔍 Руководство по решению проблем: git-troubleshooting-ru.md"
echo "❓ Если проблема не решена, создайте issue с выводом этого скрипта"

echo
echo "=== Diagnostic Complete / Диагностика завершена ==="