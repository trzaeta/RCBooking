import crypto from "node:crypto";
import { upgradeWebSocket } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { now, publicUser } from "./utils.js";

export function createRealtime({ store, authenticateCookieHeader, userForTokenHash, approvedCount }) {
  const wss = new WebSocketServer({ noServer: true });
  let heartbeatTimer;

  function envelope(event, data) {
    return JSON.stringify({ id: crypto.randomUUID(), event, timestamp: now(), data });
  }

  function sendSocket(ws, event, data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(envelope(event, data));
  }

  function broadcastWhere(predicate, event, data) {
    for (const client of wss.clients) {
      if (client.user && client.readyState === WebSocket.OPEN && predicate(client.user)) sendSocket(client, event, data);
    }
  }

  function broadcastToUsers(userIds, event, data) {
    const recipients = new Set(userIds.filter(Boolean));
    broadcastWhere((user) => recipients.has(user.id) || user.role === "admin", event, data);
  }

  function broadcastCapacity(congressId, sessionIds) {
    const congress = store.data.congresses.find((item) => item.id === congressId);
    if (!congress) return;
    for (const sessionId of sessionIds) {
      const session = congress.sessions.find((item) => item.id === sessionId);
      if (!session) continue;
      const count = approvedCount(sessionId);
      broadcastWhere(() => true, "session.capacity.updated", {
        congressId,
        sessionId,
        approvedBookings: count,
        availablePlaces: Math.max(0, session.capacity - count),
      });
    }
  }

  const upgradeMiddleware = upgradeWebSocket((c) => {
    const authenticated = authenticateCookieHeader(c.req.header("Cookie"));
    return {
      onOpen(_event, socket) {
        const ws = socket.raw;
        ws.isAlive = true;
        ws.on("pong", () => { ws.isAlive = true; });
        if (!authenticated) {
          ws.close(4401, "Authentication required");
          return;
        }
        if (authenticated.user.role === "pending") {
          ws.close(4403, "Account approval required");
          return;
        }
        ws.user = authenticated.user;
        ws.sessionTokenHash = authenticated.tokenHash;
        sendSocket(ws, "connection.ready", { user: publicUser(ws.user) });
      },

      onMessage(event, socket) {
        const ws = socket.raw;
        if (!ws.user) {
          ws.close(4401, "Authentication required");
          return;
        }
        let message;
        try {
          const value = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
          message = JSON.parse(value);
        }
        catch {
          sendSocket(ws, "socket.error", { code: "INVALID_JSON", message: "Message must contain valid JSON." });
          return;
        }

        if (message.event === "ping") sendSocket(ws, "pong", { timestamp: now() });
        else sendSocket(ws, "socket.error", { code: "UNKNOWN_EVENT", message: `Unknown event: ${message.event}` });
      },

      onError(error) { console.error("WebSocket error:", error); },
    };
  });

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      for (const client of wss.clients) {
        if (client.user && !userForTokenHash(client.sessionTokenHash)) {
          client.close(4401, "Session expired");
          continue;
        }
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 30000);
  }

  function stop() {
    clearInterval(heartbeatTimer);
    for (const client of wss.clients) client.terminate();
  }

  return { wss, upgradeMiddleware, broadcastToUsers, broadcastCapacity, startHeartbeat, stop };
}
