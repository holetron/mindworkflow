<div align="center">

# MindWorkflow

### Visual AI Workflow Builder

Build, connect, and execute AI-powered creative pipelines visually with a node-based editor.

[![Version](https://img.shields.io/badge/version-0.6.7-blue.svg)](https://github.com/holetron/mindworkflow/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-527%20passing-brightgreen.svg)](#-testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg?logo=vite&logoColor=white)](#)

[Live Demo](https://m.hltrn.cc) &nbsp;&middot;&nbsp; [Report Bug](https://github.com/holetron/mindworkflow/issues) &nbsp;&middot;&nbsp; [Request Feature](https://github.com/holetron/mindworkflow/issues)

---

An **offline-first** visual workflow builder for AI-powered creative pipelines. MindWorkflow lets you design complex AI workflows by connecting nodes on an interactive canvas -- chain text generation, image creation, and data processing steps together without writing a single line of code. Your data stays local with SQLite, and you can plug in multiple AI providers side by side.

</div>

---

## &#10024; Features

<table>
<tr>
<td width="50%">

**&#127912; Visual Node Editor**
Drag-and-drop workflow canvas powered by ReactFlow. Connect AI nodes, text nodes, image nodes, and more into sophisticated pipelines.

**&#129302; Multi-AI Provider Support**
Switch between OpenAI, Google Gemini, Google AI Studio, Replicate, and Midjourney within the same workflow. Compare outputs side by side.

**&#128268; Offline-First Architecture**
All data stored locally in SQLite. No cloud dependency required -- your workflows, projects, and generated assets stay on your machine.

**&#9889; Workflow Execution Engine**
Run workflows with parallel and sequential node execution. The modular engine handles dependency resolution, context passing, and error recovery automatically.

</td>
<td width="50%">

**&#128193; Project Management**
Organize work into multiple projects and workspaces. Each project maintains its own nodes, edges, assets, and execution history.

**&#129513; Agent System**
Create automated agents with preset configurations. Agents follow structured prompts and can chain multi-step creative processes.

**&#128200; Real-Time Monitoring**
Watch workflow execution in real time. Track node status, view intermediate results, and inspect execution logs as they happen.

**&#127748; Image Generation & Processing**
Generate images with Replicate, Midjourney, and Google AI Studio. Built-in image annotation editor and asset management.

</td>
</tr>
<tr>
<td>

**&#128221; Template System**
Save and reuse workflow patterns. Agent presets and workflow templates accelerate common creative tasks.

</td>
<td>

**&#127763; Dark / Light Theme**
Full theme support with system preference detection. Work comfortably in any lighting condition.

</td>
</tr>
</table>

---

## &#128203; Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | >= 18.x |
| **npm**     | >= 9.x  |

SQLite is bundled via `better-sqlite3` -- no separate installation needed.

---

## &#128640; Quick Start

```bash
# Clone the repository
git clone https://github.com/holetron/mindworkflow.git
cd mindworkflow

# Install all dependencies (root + workspaces)
npm install

# Start development servers (backend + frontend)
npm run dev
```

The frontend will be available at **http://localhost:6175** and the backend API at **http://localhost:6050**.

### Production Build

```bash
# Build both backend and frontend
npm run build

# The backend compiles to server/dist/
# The frontend compiles to app/dist/
```

### Environment Configuration

Create a `server/.env` file with your API keys:

```env
PORT=6050
HOST=0.0.0.0
DATABASE_PATH=./data/localcreativeflow.db
JWT_SECRET=your-secret-key

# AI Providers (add the ones you use)
OPENAI_API_KEY=sk-...
GOOGLE_AI_STUDIO_KEY=...
REPLICATE_API_TOKEN=r8_...
```

---

## &#127959; Architecture

MindWorkflow is organized as a **monorepo** with two workspaces:

```
mindworkflow/
├── app/                        # Frontend (React SPA)
│   └── src/
│       ├── components/         # UI components (workspace, agents, admin)
│       ├── pages/              # Route pages
│       ├── state/              # Zustand store
│       │   └── slices/         # 4 slices: project, node, edge, ui
│       ├── contexts/           # React contexts (Auth, Theme)
│       ├── hooks/              # Custom React hooks
│       ├── features/           # Feature modules
│       ├── i18n/               # Internationalization
│       └── types/              # Shared TypeScript types
│
├── server/                     # Backend (Express API)
│   └── src/
│       ├── routes/             # Express route handlers (17 modules)
│       ├── services/           # Domain services
│       │   ├── ai/             # AI provider abstraction
│       │   │   └── providers/  # OpenAI, Gemini, AI Studio, Replicate, Midjourney
│       │   └── execution/      # Workflow execution engine (9 modules)
│       ├── db/                 # Data layer
│       │   ├── repositories/   # Repository pattern (11 repositories)
│       │   └── migrations/     # SQLite schema migrations
│       ├── middleware/         # Auth, logging, error handling
│       ├── schemas/            # JSON validation schemas
│       └── lib/                # Shared utilities
│
├── package.json                # Root workspace config
├── vitest.config.ts            # Test configuration
└── scripts/                    # Build & deployment scripts
```

### Key Architectural Decisions

| Aspect | Approach |
|--------|----------|
| **State Management** | Zustand store split into 4 slices (project, node, edge, UI) |
| **Data Access** | Repository pattern with 11 dedicated repositories |
| **AI Providers** | Unified provider interface with per-provider adapters |
| **Execution** | Modular engine: context builder, prompt builder, AI router, result collector |
| **Database** | SQLite via better-sqlite3, auto-migrations on startup |
| **Logging** | Pino structured logging |
| **Validation** | Zod + AJV schema validation |

---

## &#129302; Supported AI Providers

| Provider | Type | Capabilities | Configuration |
|----------|------|--------------|---------------|
| **OpenAI** | Text / Chat | GPT-4, GPT-4o, GPT-3.5 Turbo | API Key |
| **Google Gemini** | Text / Chat | Gemini Pro, Gemini Ultra | API Key |
| **Google AI Studio** | Text / Image | Gemini models, image generation | API Key |
| **Replicate** | Image / Video | Stable Diffusion, Flux, Nano Banana, custom models | API Token |
| **Midjourney** | Image | Midjourney v5/v6 (via Relay proxy) | Relay URL + Auth Token |

Providers are configured per-project through the **Integrations** panel. Multiple providers can be active simultaneously, allowing you to route different nodes to different AI services within the same workflow.

---

## &#129514; Testing

MindWorkflow includes **527 tests** powered by [Vitest](https://vitest.dev/).

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Type-check both workspaces
npm run typecheck
```

Tests cover repositories, services, the execution engine, API routes, and frontend store logic.

---

## &#128230; Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| [React 18](https://react.dev/) | UI framework |
| [TypeScript 5](https://www.typescriptlang.org/) | Type safety |
| [Vite 5](https://vitejs.dev/) | Build tool & dev server |
| [ReactFlow](https://reactflow.dev/) | Node-based canvas editor |
| [Zustand](https://zustand-demo.pmnd.rs/) | State management |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Lucide React](https://lucide.dev/) | Icon library |
| [React Router 6](https://reactrouter.com/) | Client-side routing |
| [i18next](https://www.i18next.com/) | Internationalization |

### Backend

| Technology | Purpose |
|------------|---------|
| [Express.js](https://expressjs.com/) | HTTP server framework |
| [TypeScript 5](https://www.typescriptlang.org/) | Type safety |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Embedded SQLite database |
| [Pino](https://getpino.io/) | Structured logging |
| [Zod](https://zod.dev/) | Runtime schema validation |
| [JSON Web Tokens](https://jwt.io/) | Authentication |
| [Multer](https://github.com/expressjs/multer) | File upload handling |
| [Replicate SDK](https://replicate.com/) | AI model integration |
| [Google Generative AI](https://ai.google.dev/) | Gemini integration |

### DevOps & Testing

| Technology | Purpose |
|------------|---------|
| [Vitest](https://vitest.dev/) | Test runner & coverage |
| [Testing Library](https://testing-library.com/) | Component testing |
| [Supertest](https://github.com/ladjs/supertest) | API integration tests |
| [ts-node-dev](https://github.com/wclr/ts-node-dev) | Backend dev server with hot reload |

---

## &#128506; Roadmap

- [ ] **Collaborative editing** -- Real-time multi-user workflow editing
- [ ] **Plugin system** -- Third-party node types and provider plugins
- [ ] **Workflow versioning** -- Git-like branching and history for workflows
- [ ] **API endpoint** -- Expose workflows as callable REST/webhook endpoints
- [ ] **Batch processing** -- Execute workflows across multiple inputs in parallel
- [ ] **Desktop app** -- Electron/Tauri wrapper for native desktop experience
- [ ] **More AI providers** -- Anthropic Claude, Cohere, local LLMs (Ollama)
- [ ] **Workflow marketplace** -- Share and discover community workflow templates

---

## &#129309; Contributing

Contributions are welcome! Here is how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow the existing TypeScript conventions and project structure
- Add tests for new features (aim for coverage parity)
- Use the repository pattern for new data access code
- Keep AI provider logic in `server/src/services/ai/providers/`
- Use Zustand slices for new frontend state

---

## &#128196; License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

**[&#11014; Back to Top](#mindworkflow)**

Built with care by [holetron](https://github.com/holetron)

</div>
