# html-collab-editor

A web tool for reviewing and iterating on AI-generated HTML documents — collaboratively.

## What it does

Upload any HTML file. Get a shareable link. Anyone with the link can join the room and:

1. **Edit text content** in place — modify any text without breaking the HTML framework
2. **Leave comments** on any element — abstract thoughts, structural feedback, style ideas
3. **Collaborate in real time** — see other people's cursors, comments, and edits as they happen
4. **Export to AI** — copy a prompt bundling the edited HTML + all comments, paste into Claude/GPT for the next revision pass

## Why

AI-generated HTML (slides, PRDs, docs, landing pages) is hard to revise:
- Direct editing in raw code is too low-level for non-developers
- Round-tripping every small tweak through chat is slow
- There's no good way to leave structural feedback ("this section is too dense") that the AI can act on

This tool sits between the AI and the team: humans review and annotate, then hand the whole package back to the AI for one more pass.

## Stack

- **Frontend**: Vanilla JS + iframe-hosted editing surface
- **CRDT**: [Yjs](https://docs.yjs.dev/) for conflict-free real-time sync
- **Backend**: [PartyKit](https://www.partykit.io/) (Cloudflare Durable Objects + WebSocket)
- **Persistence**: PartyKit storage / Cloudflare R2
- **Hosting**: Cloudflare Pages (static frontend) + PartyKit (sync server)

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

## Status

v0.1 deployed at **[html-collab-editor.yuzycheng.partykit.dev](https://html-collab-editor.yuzycheng.partykit.dev)**. Internal testing.

## Local development

```bash
# Install deps (Node 18+ required)
npm install

# Run the PartyKit dev server + frontend
npm run dev
```

Then open `http://localhost:1999` in two browser windows to see real-time sync.

## Credit

Created by [@yuzycheng](https://github.com/yuzycheng).

## License

[MIT](./LICENSE)
