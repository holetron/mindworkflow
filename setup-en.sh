#!/bin/bash

# Local Creative Flow - Git Configuration Setup (English Version)
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

echo "✅ Git found in system - Version: $(git --version)"
echo

# Check current git configuration
current_name=$(git config --global user.name 2>/dev/null)
current_email=$(git config --global user.email 2>/dev/null)

if [[ -z "$current_name" ]]; then
    echo "⚠️  Username not configured"
    echo
    echo "What does this mean?"
    echo "Git requires user configuration for:"
    echo "• Signing your commits with your identity"
    echo "• Tracking authorship of changes"
    echo "• Collaborative development workflows"
    echo "• Professional development practices"
    echo
    
    read -p "Enter your full name: " user_name
    if [[ -n "$user_name" ]]; then
        git config --global user.name "$user_name"
        echo "✅ Username set to: $user_name"
    fi
else
    echo "✅ Username configured: $current_name"
fi

echo

if [[ -z "$current_email" ]]; then
    echo "⚠️  Email not configured"
    echo "   Execute: git config --global user.email \"your.email@example.com\""
    read -p "Enter your email address: " user_email
    if [[ -n "$user_email" ]]; then
        git config --global user.email "$user_email"
        echo "✅ Email set to: $user_email"
    fi
else
    echo "✅ Email configured: $current_email"
fi

echo
echo "📋 Current Git Configuration:"
echo "Name: $(git config --global user.name)"
echo "Email: $(git config --global user.email)"
echo
echo "🎉 Git setup complete!"
echo "You can now safely create commits with proper attribution."
echo
echo "💡 Next steps:"
echo "• Create a new repository: git init"
echo "• Clone an existing repository: git clone <url>"
echo "• Start your creative development workflow!"