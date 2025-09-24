# Local Creative Flow

A tool to help developers set up their local development environment with proper Git configuration and creative workflow setup.

## Git Configuration Setup

When you see this message:
```
✅ Git найден в системе - Версия: git version 2.x.x
⚠️  Имя пользователя не настроено
   Выполните: git config --global user.name "Ваше Имя"
```

**What does this mean?**

This message indicates that:
- ✅ **Git is properly installed** on your system
- ⚠️ **Your Git username is not configured** - this needs to be set up

### Why is Git user configuration important?

Git requires user identification for:
1. **Commit attribution** - Every commit you make will be tagged with your name and email
2. **Collaboration** - Other developers need to know who made which changes
3. **Version history** - Git tracks who contributed what to the project
4. **Professional workflow** - Proper attribution is essential in team environments

### How to configure Git user settings

Run these commands in your terminal:

```bash
# Set your name (replace with your actual name)
git config --global user.name "Your Full Name"

# Set your email (replace with your actual email)
git config --global user.email "your.email@example.com"
```

### Example:
```bash
git config --global user.name "Alexey Petrov"
git config --global user.email "alexey.petrov@example.com"
```

### Verify your configuration:
```bash
# Check your current settings
git config --global user.name
git config --global user.email

# View all global Git settings
git config --global --list
```

### What happens if you don't configure this?

Without proper Git configuration:
- Your commits will be attributed to unknown or default user
- You may get warnings or errors when trying to commit
- Collaboration becomes difficult as teammates can't identify your contributions
- Some Git operations may fail

## Quick Setup Scripts

We provide interactive setup scripts to automate this process:

### Russian Version
```bash
./setup.sh
```

### English Version  
```bash
./setup-en.sh
```

Both scripts will:
1. Check if Git is installed
2. Verify current configuration
3. Prompt you to enter your name and email if not configured
4. Set up your Git configuration automatically
5. Confirm the setup is complete

### Manual Setup

If you prefer to set up Git manually, use these commands:

```bash
# Set your name (replace with your actual name)
git config --global user.name "Your Full Name"

# Set your email (replace with your actual email)
git config --global user.email "your.email@example.com"
```

### FAQ

**Q: Why do I need to configure Git user settings?**
A: Git needs to know who you are to properly attribute commits to you. This is essential for version control, collaboration, and maintaining a clear history of who made which changes.

**Q: What's the difference between --global and --local configuration?**
A: 
- `--global`: Sets configuration for all repositories on your system
- `--local`: Sets configuration only for the current repository
- For most users, `--global` is the right choice

**Q: Can I use a different name/email for different projects?**
A: Yes! You can override global settings on a per-repository basis:
```bash
cd /path/to/your/project
git config user.name "Different Name"
git config user.email "different@email.com"
```

**Q: Is my email address public?**
A: Yes, when you push commits to public repositories (like GitHub), your configured email becomes part of the commit history. Consider using GitHub's no-reply email if privacy is a concern.

## Troubleshooting

### Common Issues

1. **"Please tell me who you are" error**
   - This happens when Git user.name or user.email is not configured
   - Solution: Run the setup script or configure manually as shown above

2. **Commits show wrong author**
   - Check your configuration with `git config --list`
   - Make sure you're using the correct name and email

3. **Different identities for different projects**
   - Use repository-specific configuration (without --global flag)
   - Or use Git's conditional includes feature for advanced setups

## Contributing

This tool is designed to help developers get started with proper Git configuration. Feel free to contribute improvements or translations!