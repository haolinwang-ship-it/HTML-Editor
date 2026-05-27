// ─────────────────────────────────────────────────
//  PartyKit server  ·  one Durable Object per room.
//  y-partykit handles the Yjs sync protocol over WebSocket.
//  Doc state persists via snapshot to room storage.
// ─────────────────────────────────────────────────

import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

export default class CollabServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    return onConnect(conn, this.room, {
      persist: { mode: "snapshot" },
    });
  }
}

CollabServer satisfies Party.Worker;
