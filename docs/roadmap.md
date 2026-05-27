# Roadmap

Milestone-driven, not date-driven.

## M0 · Visual prototype  (current)
- [x] Project skeleton
- [x] Design system (Rams + industrial)
- [x] Landing page with drop zone
- [ ] Room page mockup with editor surface + comments sidebar + status strip
- [ ] Identity prompt (first-time nickname)
- [ ] One static screenshot of "what two users see in a room"

**Goal:** lock the visual language before writing sync code.

## M1 · Local single-user editor
- [ ] HTML upload → parse into skeleton + blocks (no sync yet, just in-memory)
- [ ] Edit mode: each block becomes contenteditable, edits flow into block state
- [ ] Comment mode: click element → popup → save to in-memory map
- [ ] Sidebar renders comments
- [ ] Export-to-AI: assemble skeleton + block texts + comments → copy to clipboard
- [ ] Save (download): assemble skeleton + block texts → blob → download

**Goal:** the whole UX works for a single user offline. No collab yet.

## M2 · PartyKit + Yjs sync
- [ ] PartyKit dev server runs locally
- [ ] Room creation endpoint: POST HTML → returns roomId
- [ ] Frontend connects to `/parties/main/<roomId>` via y-partykit
- [ ] Block texts wired to Y.Text
- [ ] Comments wired to Y.Map
- [ ] Open same URL in two browsers → edits sync

**Goal:** real-time text + comment sync between two browser tabs.

## M3 · Presence
- [ ] Yjs awareness for user identity (id, name, color)
- [ ] Render presence cursors inside iframe (other users' carets)
- [ ] Sidebar shows online users
- [ ] Comments display author name + color

## M4 · Polish for first external users
- [ ] Persistence: store HTML skeleton + Yjs snapshot in R2/KV
- [ ] Reconnect handling
- [ ] Room metadata page (title, created, last active)
- [ ] Mobile-readable (not editable)
- [ ] Empty / error states

## M5 · Public deploy
- [ ] Cloudflare Pages for static frontend
- [ ] PartyKit deploy for sync server
- [ ] Custom domain
- [ ] Basic abuse protections (rate limit per IP, room TTL)
- [ ] Share link previews (OpenGraph)

## Later (parked)
- Inline style controls (color/weight/size) — **explicit non-goal for v1**
- Direct-to-AI export (in-app API call)
- Threaded / resolved comments
- Version history
- Verified identity (Google OAuth)
- Block reordering / structural editing
