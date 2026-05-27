# Architecture

## High-level

```
┌────────────────┐    HTTPS    ┌─────────────────────┐
│   Cloudflare   │ ──────────► │   Static frontend   │
│   Pages (CDN)  │             │   (web/)            │
└────────────────┘             └──────────┬──────────┘
                                          │ WebSocket
                                          ▼
                               ┌─────────────────────┐
                               │   PartyKit server   │
                               │   (Durable Object   │
                               │    per room)        │
                               └──────────┬──────────┘
                                          │ R2 / KV
                                          ▼
                               ┌─────────────────────┐
                               │   Persistence       │
                               │   (HTML snapshots)  │
                               └─────────────────────┘
```

## Room lifecycle

1. User uploads HTML on landing page
2. Frontend POSTs to `/api/create-room` → server generates room ID, stores initial HTML in R2
3. Browser redirects to `/r/<roomId>`
4. Frontend connects WebSocket → joins PartyKit Durable Object for that room
5. Server loads doc state (or initializes from stored HTML)
6. Yjs sync handshake; client receives full doc state
7. Edits/comments/presence flow through Yjs updates

## Data model

The editing surface is **not** the raw HTML string. On room creation, the HTML is parsed once into a structured doc:

```ts
interface Doc {
  meta: {
    title: string;
    createdAt: number;
    htmlSkeleton: string;  // HTML with element IDs injected, text content stripped
  };
  blocks: Block[];          // Y.Array<Y.Map>
  comments: CommentMap;     // Y.Map<commentId, Comment>
}

interface Block {
  id: string;               // stable element ID
  tag: string;              // h1, p, div, etc.
  text: Y.Text;             // CRDT-synced text content
  // structural attrs (class, style) preserved in htmlSkeleton, not synced per-block
}

interface Comment {
  id: string;
  blockId: string;          // references Block.id
  author: { id: string; name: string; color: string };
  text: string;
  createdAt: number;
  resolved: boolean;
}
```

### Why split skeleton + blocks?

- **Skeleton** = HTML tree with `data-block-id` attributes, original styles/classes, all non-text structure. Stored once, immutable during the session.
- **Blocks** = flat list of editable text nodes, each with a `Y.Text` for CRDT sync.

Editing only updates `Block.text` (the Y.Text). The skeleton stays the same. On export, we walk the skeleton and inject the current text from each block by its ID.

This avoids the complexity of full XML CRDT while preserving the original HTML structure exactly.

### Out of scope (for v1)

- **Structural changes** (reorder, delete, insert blocks) — not editable in v1. Users can only modify existing text + add comments. Structural changes are handled via the AI roundtrip.
- **Style changes** (color, font, weight) — explicitly not supported. The "ask the AI" channel handles these via comments.
- **Image / media editing** — not supported.

## Presence

Yjs's awareness protocol:
- Each client publishes `{ user: {id, name, color}, cursor: {blockId, offset} }`
- Other clients render cursors as colored carets in the iframe
- Active editors get a colored outline on the block they're editing

## Identity

Lightweight, no real auth:
- First visit: prompt for nickname, generate random user ID + color
- Store in `localStorage` keyed by domain
- Send with every join; server doesn't verify

If we want to upgrade later: add OAuth (Google) as opt-in for verified identity in comments.

## Comments

Stored as a Y.Map indexed by comment ID. Each comment references a `blockId`. Comments are CRDT-synced same as text.

Resolved comments stay in the map but render dimmed in the sidebar.

## Sync flow examples

**Two users edit different blocks:**
- A modifies `blocks[5].text`, B modifies `blocks[12].text`
- Yjs merges trivially, no conflict

**Two users edit same block, same position:**
- Yjs CRDT order-preserves both insertions
- Result: both characters appear, deterministic ordering

**One user adds a comment:**
- Yjs Y.Map.set() with the comment
- All connected clients receive the update, sidebar re-renders

## Export to AI

Reconstruct HTML from skeleton + current block texts → bundle with comments into a prompt → copy to clipboard. No network call; happens entirely client-side.

## Open questions

- **Anonymous edit abuse** — anyone with link can edit; do we need rate-limiting / spam protection?
- **Storage policy** — how long do rooms persist? Auto-delete after N days of inactivity?
- **File size limits** — what's the max HTML we accept? (Affects PartyKit Durable Object memory.)
- **Export side-channel** — should we support direct-to-AI (API call) in addition to copy-to-clipboard?
