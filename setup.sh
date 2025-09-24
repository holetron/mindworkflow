#!/bin/bash

# Local Creative Flow - Git Configuration Setup
# This script helps configure Git for local development

echo "🚀 Local Creative Flow - Git Setup"
echo "=================================="
echo

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed on your system"
    echo "   Please install Git first: https://git-scm.com/downloads"
    exit 1
fi

echo "✅ Git найден в системе - Версия: $(git --version)"
echo

# Check current git configuration
current_name=$(git config --global user.name 2>/dev/null)
current_email=$(git config --global user.email 2>/dev/null)

if [[ -z "$current_name" ]]; then
    echo "⚠️  Имя пользователя не настроено"
    echo
    echo "Что это означает?"
    echo "Git требует настройки имени пользователя для:"
    echo "• Подписи ваших коммитов"
    echo "• Отслеживания авторства изменений"
    echo "• Совместной работы в команде"
    echo
    
    read -p "Введите ваше имя: " user_name
    if [[ -n "$user_name" ]]; then
        git config --global user.name "$user_name"
        echo "✅ Имя пользователя установлено: $user_name"
    fi
else
    echo "✅ Имя пользователя настроено: $current_name"
fi

echo

if [[ -z "$current_email" ]]; then
    echo "⚠️  Email не настроен"
    read -p "Введите ваш email: " user_email
    if [[ -n "$user_email" ]]; then
        git config --global user.email "$user_email"
        echo "✅ Email установлен: $user_email"
    fi
else
    echo "✅ Email настроен: $current_email"
fi

echo
echo "📋 Текущая конфигурация Git:"
echo "Имя: $(git config --global user.name)"
echo "Email: $(git config --global user.email)"
echo
echo "🎉 Настройка Git завершена!"
echo "Теперь вы можете безопасно создавать коммиты с правильной атрибуцией."