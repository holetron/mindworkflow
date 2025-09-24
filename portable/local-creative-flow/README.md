# Local Creative Flow - Portable Version

A powerful offline-first creative flow tool for AI-assisted content generation and mind mapping.

## Quick Start

### Requirements
- Node.js (version 18 or higher) - Download from https://nodejs.org

### Running the Application

**On Windows:**
1. Double-click `start.bat`

**On Linux/macOS:**
1. Open terminal in this folder
2. Run `./start.sh`

**Manual start:**
```bash
node dist/index.js
```

3. Open your browser to `http://localhost:4321`

## Features

- 🧠 **AI Node Generation**: Create content using various AI models
- 🗺️ **Mind Mapping**: Generate hierarchical mind maps automatically  
- 🔗 **Node Connections**: Build complex workflows by connecting nodes
- 💾 **Offline First**: Works completely offline, no internet required for core functionality
- 🎨 **Visual Interface**: Drag-and-drop interface for building creative flows
- 📊 **Multiple Node Types**: Text, AI, agents, and more
- 🔄 **Real-time Updates**: Live editing and updates
- 📁 **Project Management**: Create and manage multiple projects

## Files Structure

- `dist/` - Compiled server code
- `app-dist/` - Frontend static files
- `node_modules/` - Dependencies
- `data/` - SQLite database (created on first run)
- `projects/` - Project files (created on first run)
- `drive/` - File storage (created on first run)

## Configuration

- The application creates a local SQLite database in the `data/` folder
- Projects are stored in the `projects/` folder
- All data stays local on your machine

## Security

- This version has API keys and sensitive configuration removed
- You'll need to configure your own AI provider keys if you want AI functionality
- All data stays local on your machine

## Troubleshooting

1. **Port already in use**: If port 4321 is busy, the app will show an error. Close other applications using this port.
2. **Database locked**: Close all other instances of the application.
3. **Missing files**: Make sure all folders (dist, app-dist, node_modules) are present.

For issues, feature requests, or contributions, visit the GitHub repository.

---

Built with ❤️ using React, Express, SQLite, and Node.js.