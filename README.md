# Local Creative Flow

**Local Creative Flow** is an offline-first, node-based creative tool designed to help you build and visualize complex AI-powered workflows. Create mind maps, connect ideas, and generate content using a beautiful drag-and-drop interface.

## 🌟 Features

- 🧠 **AI Node Generation**: Create content using various AI models (GPT, Claude, etc.)
- 🗺️ **Mind Mapping**: Generate hierarchical mind maps automatically from any topic
- 🔗 **Node Connections**: Build complex workflows by connecting different types of nodes
- 💾 **Offline First**: Works completely offline - your data never leaves your machine
- 🎨 **Visual Interface**: Intuitive drag-and-drop canvas for building creative flows
- 📊 **Multiple Node Types**: Text, AI, agents, templates, and more
- 🔄 **Real-time Updates**: Live editing and collaboration features
- 📁 **Project Management**: Create and manage multiple projects
- 🚀 **Performance**: Fast SQLite database with optimized queries
- 🔒 **Privacy**: All data stays local, no cloud dependencies

## 🚀 Quick Start

### Option 1: Download Standalone Executable (Recommended)

1. Go to [Releases](releases/) and download for your platform:
   - **Windows**: `local-creative-flow-windows.exe`
   - **Linux**: `local-creative-flow-linux`
   - **macOS**: `local-creative-flow-macos`

2. Run the executable - no installation required!
3. Open `http://localhost:4321` in your browser
4. Start creating!

### Option 2: Portable Version (Requires Node.js)

1. Download `local-creative-flow-portable.tar.gz` from [Releases](releases/)
2. Extract the archive
3. Make sure you have [Node.js](https://nodejs.org) installed
4. Run `./start.sh` (Linux/Mac) or `start.bat` (Windows)
5. Open `http://localhost:4321`

### Option 3: Development Setup

```bash
git clone <repository-url>
cd local-creative-flow
npm install
npm run dev
```

Open `http://localhost:5174` for development server.

## 🎯 Use Cases

- **Content Creation**: Generate blog posts, articles, and creative writing
- **Research & Brainstorming**: Create mind maps and explore ideas visually
- **Workflow Design**: Build complex AI-powered processing pipelines  
- **Knowledge Management**: Organize information with connected nodes
- **Education**: Visual learning and teaching tools
- **Project Planning**: Create project roadmaps and task flows

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, React Flow
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite with better-sqlite3
- **AI Integration**: OpenAI, Anthropic, and other providers
- **Build**: pkg for standalone executables

## 📁 Project Structure

```
├── app/           # React frontend
├── server/        # Node.js backend
├── releases/      # Built executables
├── portable/      # Portable version
└── docs/          # Documentation
```

## 🔧 Building from Source

### Requirements
- Node.js 18+ 
- npm or yarn

### Build Commands
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Create standalone executables
cd server && npm run package

# Create portable version
# (Automatic during build process)
```

## 🤝 Contributing

This is currently a personal project, but contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

This project is open source. See the license file for details.

## 🙏 Acknowledgments

Built with ❤️ using amazing open source tools and libraries.

---

**Note**: This release has API keys and personal data removed. You'll need to configure your own AI provider keys for full functionality.

## Key Features (Planned)

*   **Node-Based Graph UI:** A visual canvas for building and organizing your workflows.
*   **Project Management:** Create, save, and manage multiple projects.
*   **Node Manipulation:** Add, delete, and move nodes with ease.
*   **Extensible Nodes:** Edit node properties to store various types of data.
*   **Local First:** All your data is stored on your local machine.

## Getting Started

1.  **Install dependencies:** `npm install`
2.  **Run the development server:** `npm run dev`
3.  Open your browser to `http://localhost:5173` (or the address shown in the terminal).

## Technology Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS
*   **Backend:** Node.js, Express, TypeScript
*   **Database:** Filesystem-based storage for projects.

## Project Structure

*   `app/`: Contains the React frontend application.
*   `server/`: Contains the Node.js backend API.
*   `docs/`: Project documentation, including the development plan.
*   `projects/`: Default directory for storing project data.