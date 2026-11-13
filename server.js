const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "MC Edu Voice Chat" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roomMembers(room) {
  return [...clients.entries()]
    .filter(([, c]) => c.room === room)
    .map(([id, c]) => ({ id, name: c.name, position: c.position }));
}
function broadcastRoom(room, data, exceptId) {
  for (const [id, c] of clients) {
    if (c.room === room && id !== exceptId) send(c.ws, data);
  }
}

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      const room = String(msg.room || "").trim().slice(0, 32);
      const name = String(msg.name || "Player").trim().slice(0, 24);
      if (!room) return send(ws, { type: "error", message: "Enter a room code." });
      clients.set(id, { ws, room, name, position: cleanPosition(msg.position) });
      send(ws, { type: "joined", id, players: roomMembers(room).filter(p => p.id !== id) });
      broadcastRoom(room, { type: "peer-joined", player: { id, name, position: clients.get(id).position } }, id);
      return;
    }

    const me = clients.get(id);
    if (!me) return;
    if (msg.type === "position") {
      me.position = cleanPosition(msg.position);
      broadcastRoom(me.room, { type: "position", id, position: me.position }, id);
    } else if (["offer", "answer", "ice"].includes(msg.type) && typeof msg.to === "string") {
      const target = clients.get(msg.to);
      if (target && target.room === me.room) {
        send(target.ws, { ...msg, from: id, name: me.name });
      }
    }
  });

  ws.on("close", () => {
    const me = clients.get(id);
    if (me) {
      broadcastRoom(me.room, { type: "peer-left", id }, id);
      clients.delete(id);
    }
  });
});

function cleanPosition(p) {
  const n = v => Number.isFinite(Number(v)) ? Math.max(-30000000, Math.min(30000000, Number(v))) : 0;
  return { x: n(p?.x), y: n(p?.y), z: n(p?.z) };
}

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`MC Edu Voice Chat listening on ${port}`));
