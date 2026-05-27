# html-collab-editor

A web tool for reviewing and iterating on AI-generated HTML documents — collaboratively.

> **🚧 Early beta · v0.1.** Actively in development. Expect rough edges. Feedback and bug reports welcome — please open an [Issue](https://github.com/yuzycheng/HTML-Editor/issues).

## Try it now

**→ [html-collab-editor.yuzycheng.partykit.dev](https://html-collab-editor.yuzycheng.partykit.dev)**

No signup. Drop any HTML file in and you're editing in seconds.

## What it does

Upload an HTML file. Get a shareable link. Anyone with the link can join the room and:

1. **Edit text content** in place — modify any text without breaking the HTML framework
2. **Add or remove blocks** — duplicate paragraphs, cards, table rows / columns, delete things you don't want
3. **Leave comments** on any element — single elements, multi-element selections, or whole-document notes
4. **Collaborate in real time** — see other people's edits and comments as they happen
5. **Hand off back to AI** — download clean HTML, or copy a Markdown prompt bundling your edits + comments for Claude/GPT

## Why

AI-generated HTML (slides, PRDs, docs, landing pages) is hard to revise:
- Direct editing in raw code is too low-level for non-developers
- Round-tripping every small tweak through chat is slow
- There's no good way to leave structural feedback ("this section is too dense") that the AI can act on

This tool sits between the AI and the team: humans review and annotate, then hand the whole package back to the AI for one more pass.

## How to use

1. Open the [site](https://html-collab-editor.yuzycheng.partykit.dev) and drop an `.html` file (or click **Start**)
2. **Edit mode** (default) — click any text to rewrite it; click any element to bring up the **＋ / ✕** toolbar for duplicate / delete; in table cells you'll get **+Row / +Col / ✕Row / ✕Col** controls
3. **Comment mode** — toggle from the top bar; click one or more elements to anchor a note, or hit the **+** in the sidebar for a general (whole-doc) comment
4. **Share** — click **Share** in the top bar to copy the room URL; send it to anyone
5. **Undo / redo** — `⌘Z` / `⌘⇧Z` (works for both text and structural changes)
6. **Export** — pick **Download HTML** for a clean file, or **Hand off to AI** to copy a Markdown prompt (also downloadable as `.md` for Claude Projects / NotebookLM)

## Stack

- **Frontend** — Vanilla JS + iframe-hosted editing surface
- **CRDT** — [Yjs](https://docs.yjs.dev/) for conflict-free real-time sync
- **Backend** — [PartyKit](https://www.partykit.io/) (Cloudflare Durable Objects + WebSocket)
- **Persistence** — PartyKit snapshot storage

## Project structure

```
html-collab-editor/
├── web/              # static frontend
│   ├── index.html    # landing: upload → create room
│   ├── room.html     # in-room editor
│   ├── styles/       # CSS (design tokens + components)
│   └── src/          # JS modules
├── party/            # PartyKit server (Durable Object)
├── docs/             # design system, architecture, roadmap
└── package.json
```

## Known limitations

This is v0.1. The basics work; the edges are rough.

- **2 MB upload limit** per HTML file
- **Anyone with the link can edit** — no read-only mode or per-room ACL yet
- **Rooms persist indefinitely** on the server — no auto-cleanup yet
- **Complex CSS layouts** (heavy use of flex/grid with text reflow) may export with our injected helper attributes if you don't use the Export feature
- **No mobile UX work yet** — desktop is the supported target
- **No abuse/rate-limit defenses** — fine for trusted teams; not ready for unmoderated public traffic

## Local development

```bash
# Install deps (Node 18+ required)
npm install

# Run the PartyKit dev server + frontend
npm run dev
```

Then open `http://localhost:1999`. Open the same URL in a second browser window (or share the LAN IP that PartyKit prints on startup) to test real-time sync.

## Feedback

Found a bug? Have an idea? → **[Open an Issue](https://github.com/yuzycheng/HTML-Editor/issues)**

## Credit

Created by [@yuzycheng](https://github.com/yuzycheng).

## License

[MIT](./LICENSE)
