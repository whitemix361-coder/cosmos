# CosmosMC website

Node.js (18+) server with no dependencies. One config file: `config.json`.

## Run
1. `cp .env.example .env` and set `ADMIN_PASSWORD` (10+ chars) and `HEARTBEAT_TOKEN` (16+ random chars). Never put these in config.json.
2. `npm start`, then open http://localhost:3000 (admin: http://localhost:3000/admin)

## Deploy
Any host that runs Node (VPS, Railway, Render, Fly.io). Set the same variables in the host's environment settings, put HTTPS in front (Cloudflare or Caddy), and keep `config.json` and `public/images/` on persistent storage so admin changes survive restarts. Static-only hosts (Netlify, GitHub Pages) cannot run the admin or status API.

## Server status (important)
The website NEVER pings your Minecraft address, so it cannot wake a sleeping server. It only shows what the real backend reports.
`heartbeat.py` runs on the machine hosting the Minecraft server, checks the BACKEND directly, and posts to `/api/heartbeat` every 10 s:
```
SITE_URL=https://your-site HEARTBEAT_TOKEN=... MC_HOST=127.0.0.1 MC_PORT=25565 python3 heartbeat.py
```
`MC_HOST` must be the backend's own address, NOT cosmosmc.play.minekube.net (the proxy may answer or wake the server).
States: ONLINE (backend answered a real Minecraft status request), OFFLINE (it did not), STARTING / SLEEPING (only if your host or a script POSTs `{"state":"starting"}` or `"sleeping"` with the bearer token), UNKNOWN (no heartbeat for 45 s, or the status service is unreachable). Player counts show only when ONLINE.
I don't know of a public Minekube status API, so none is used. If your host has one, make a small script that reads it and POSTs the state to `/api/heartbeat`.
Optional heartbeat field `"bedrock": true/false` drives the Bedrock indicator; otherwise it shows Unknown.

## config.json (all values are real settings)
name, logo (path under /images/), colors (black = background, white = text, blue = main accent, green = online/success),
javaIP/javaPort, bedrockIP/bedrockPort, discord, youtube (empty = hidden),
showPlayers, showStatus, animations, particles, sound (button beeps), maintenance (shows a maintenance screen), statusRefresh (ms, 5000-300000).
Optional extras in the same file: tagline, navigation, store (checkoutUrl, categories), gameModes (enabled:false hides), vote.sites, leaderboardURL, forums, staff, news, events (ISO dates).
Invalid values fall back to defaults; on localhost a banner lists errors.

## Admin (/admin)
Edits the simple settings above, uploads a PNG/WebP logo, saves with server-side validation, resets to `config.default.json` (this also resets the optional extras). Login uses an HttpOnly cookie, 5 tries/minute limit. The extras (store, news...) are edited in config.json by hand.
