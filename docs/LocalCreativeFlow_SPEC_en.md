# Local Creative Flow — project mindmap

## Purpose
Local Creative Flow lets creative teams map a project as a mindmap. The goal is not to automate an entire workflow like n8n, but to track every asset, decision, and dependency. Nodes represent briefs, prompts, generated media, folders with takes, and so on.

## Core entities
- **Text/File nodes.** Static content such as briefs, scripts, spreadsheets, or placeholders.
- **AI nodes.** Focused generators that accept defined inputs (text, image, audio) and produce a small set of artefacts (character, scene, plan, etc.).
- **Folder nodes.** Buckets that accumulate results from AI nodes. You can open the folder, review takes, and drag the best one back onto the mindmap.
- **HTML nodes.** Embedded widgets (weather, Spline 3D, dashboards) with adjustable viewport width and manual refresh.

## Example flow
1. Capture the brief in a text node.
2. Provide a prompt and reference images to a Midjourney agent node.
3. Generated frames land in a connected folder node.
4. The producer opens the folder, picks the best frame, and drags it onto the canvas.
5. The selected frame plus a new prompt feed another agent for angle variations.
6. Final deliverables (video, music, website) are also represented as nodes.

## UX requirements
- Display input chips left of each incoming handle: `text`, `image x3`, `speech`, etc.
- AI node settings must let users define input ports (type, label, optional flag, max items).
- Provide a button that opens API key/configuration settings for the AI provider.
- Regenerating an agent should create new result nodes or populate linked placeholders/folders.
- Folder node UI: previous-node settings on the left, list of stored artefacts on the right, plus a "Regenerate" button to rerun the source agent.

## Data model
- `FlowNode.meta.input_ports` is an array of port specs (`id`, `title`, `kind`, `required`, `max_items`).
- Folder nodes keep references to stored files and their source node IDs.
- Each generation is logged in `runs` to maintain history.

## Roadmap
1. Implement the `input_ports` model and editor UI.
2. Ship the folder node with asset viewer, drag-out, and re-generation wiring.
3. Finish the HTML node (width picker, URL/HTML modes, refresh button).
4. Auto-create downstream nodes/placeholders after AI runs (including folder population).
5. Keep documentation and schemas up to date as features land.
