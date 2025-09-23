# Local Creative Flow

**Local Creative Flow** is an offline-first, node-based tool designed to help you build and visualize complex workflows. It provides a canvas for creating, connecting, and managing nodes, which can represent anything from a simple piece of text to a complex operation.

The application runs locally on your machine, ensuring your data stays private. It features a React-based frontend for a dynamic user experience and a Node.js backend for robust project management.

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