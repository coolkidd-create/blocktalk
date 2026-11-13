# BlockTalk — Minecraft Education proximity voice

A browser companion for Chromebook players. It provides WebRTC voice, push-to-talk, room codes, and distance-based muting.

## Important limitations

- This is **not a Minecraft Education mod**. Education Edition does not expose a supported API for a companion webpage to read live player coordinates or stream microphone audio through the game.
- Players must open the same hosted BlockTalk website, enter the same room code, and manually enter/update their Minecraft X/Y/Z coordinates.
- Proximity is calculated from those manually entered coordinates. It will not automatically follow players.
- Each player needs microphone permission and a secure HTTPS connection.
- This starter uses a public STUN server. Some school networks/firewalls may block peer-to-peer WebRTC. For reliable use across restrictive networks, add a TURN service.
- Use only with people who agree to join voice chat. Push-to-talk is muted by default.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000` on the same computer. For other devices, deploy it to an HTTPS host (for example, a Node hosting service that supports WebSockets). A plain static-site host is not enough because this app needs the included WebSocket signaling server.

## How to use

1. Deploy the whole project to a Node.js host that supports WebSockets and HTTPS.
2. Open the HTTPS website on each Chromebook.
3. Allow microphone access when Chrome asks.
4. Enter a player name and a shared room code.
5. Enter your Minecraft Education X/Y/Z coordinates and join.
6. Hold **Hold to talk** (or hold Space when not typing) to speak.
7. Update your coordinates as you move. Players outside your selected radius are muted locally.

## Hosting notes

Set the start command to `npm start`. The host should provide `PORT`. Keep `server.js` and the `public` folder together. Do not publish secrets in this project; none are required for the basic demo.
