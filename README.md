---
title: The First Signer Elite
emoji: ⚡
colorFrom: amber
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# The First Signer Elite v4

The ultimate high-speed Discord button automation dashboard. v4 adds 17 new features including multi-target mode, sound alerts, browser notifications, light theme, CSV/JSON export, latency histogram, test click, broadcast system, per-user usage tracking, Discord webhook alerts, auto-restart on OOM danger, and much more.

## Features

### Core Engine (unchanged from v3 — still hyper-optimized)
- ⚡ Multi-threaded button clicking engine with customizable delays (default 6 threads: 4×0ms + 2×1ms)
- 📊 Real-time live dashboard with log streaming (capped at 100 entries)
- 💓 Heartbeat monitoring (20s interval, 60s zombie threshold) + auto-reconnection
- 🛡️ Meta-watchdog (30s) — restarts dead heartbeats, forces reconnect on stale sessions
- 🚫 Crash protection — process never dies silently on uncaughtException / unhandledRejection
- 🔐 Access control with owner/user roles + admin panel
- 📈 Lifetime stats tracking (persistent across restarts via rehydration sync)
- 🌡️ Engine Health card with live status
- ⏱️ Click Latency sparkline + 5-minute RSS memory sparkline
- ↻ Quick Restart button — relaunch bot with same config
- 🧠 Live Render Memory Monitor (admin-only) — real-time RSS out of 512MB with threshold markers, manual Clear Cache / Force GC buttons, auto-cleanup at 70%/85%/92%
- 🎨 Warm premium dark theme — amber/gold accents, sage success, rose errors (no neon)
- ✨ Refined motion animations throughout

### NEW in v4
- 🎯 **Multi-target mode** — monitor up to 5 Discord bots simultaneously, each with its own keyword. The engine watches all targets in parallel and clicks matching buttons. Fully backwards-compatible with single-target setups.
- 🔊 **Sound alerts** — Web Audio API chimes on button detection (660Hz), click success (880Hz), and failure (330Hz). Toggle in the top bar. Defaults ON.
- 🔔 **Browser notifications** — system notifications on detection, success, disconnect, and owner broadcasts. Toggle in the top bar (requires permission).
- 🌓 **Light/Dark theme toggle** — warm cream light theme for daytime, deep charcoal dark for night. Persisted in localStorage. No flash on reload (theme applied before React mounts).
- 📤 **CSV/JSON log export** — download logs as CSV (timestamp, type, message) or JSON (with stats + full log). One-click download buttons in the log panel.
- 📊 **Click latency histogram** — visual distribution of click latencies across 7 bins (<100ms, 100-200ms, ..., 1200ms+). Color-coded sage/amber/rose based on speed.
- ▶ **Test Click button** — simulates a fake MESSAGE_CREATE packet to verify your thread config actually fires correctly without needing a real Discord drop. Hugely useful for testing.
- 📈 **Per-keyword stats** — sidebar widget showing detection/success/fail counts + success rate + best time per keyword. Helps you optimize which keywords perform best.
- 👥 **Per-user resource usage** (admin) — new "Usage" tab showing every active session with uptime, detection count, last detection time, target count, reconnect attempts, and per-keyword breakdown. Includes "Kill Idle" buttons (1h / 3h / 6h).
- 📢 **Broadcast system** (admin) — new "Broadcast" tab. Send a banner message to every connected user with severity (info/warn/critical). Users see it at the top of their screen + get a browser notification. Clear broadcasts anytime.
- ⚙️ **Server Config tab** (admin) — shows Discord webhook status, auto-restart status, memory limit, Node version, platform.
- 🪝 **Discord webhook alerts** — when memory hits 85% (high) or 92% (critical), the server sends a Discord webhook ping (if `DISCORD_WEBHOOK_URL` env var is set). Throttled to 1 alert per type per 60s.
- 🔄 **Auto-restart on danger** — when memory hits 92%+, the server gracefully saves all data and exits. Render auto-restarts the process within seconds. Enabled by default (set `AUTO_RESTART_ON_DANGER=false` to disable).
- ✅ **Token validation at Step 1** — "Verify Token" button calls Discord's `/users/@me` endpoint and shows the username if valid, or the error if invalid. Saves 30s of frustration per bad token.
- 🌐 **Latency check on Step 1** — automatic ping to Discord's gateway on page load. Shows latency in a banner; warns if > 500ms.
- 🪦 **Auto-kill idle sessions** — sessions running 6+ hours with 0 detections are automatically terminated by the meta-watchdog. Frees memory for active users.
- 📝 **Audit log with IP** — admin actions (approve/reject/revoke/delete) now log the admin's IP address for forensic purposes.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```
   npm install
   ```
2. Start the dev server:
   ```
   npm run dev
   ```
3. Open http://localhost:3000

## Deploy to Render

1. Push to a GitHub repository
2. Create a new **Web Service** on Render
3. Set environment variables (in Render dashboard → Environment):
   - `OWNER_KEY` — your admin password (required — set your own, do NOT commit it to git)
   - `DISCORD_WEBHOOK_URL` — optional, for memory alerts (highly recommended)
   - `AUTO_RESTART_ON_DANGER` — optional, defaults to `true`
4. Deploy — Render will use the Dockerfile automatically

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OWNER_KEY` | Admin login password | (set your own — do NOT commit to git) |
| `DISCORD_WEBHOOK_URL` | Discord webhook for memory alerts | (none) |
| `AUTO_RESTART_ON_DANGER` | Auto-restart when memory hits 92%+ | `true` |
| `PORT` | Server port | `7860` on Render / `3000` locally |
| `NODE_ENV` | Environment mode | `development` |
| `NODE_OPTIONS` | Node flags | `--max-old-space-size=400 --expose-gc` |

## v4 Changelog

- **Multi-target mode (NEW)**: Monitor up to 5 Discord bots simultaneously with independent keywords. Step 2 UI completely reworked with add/remove target rows, per-target keyword chips, and a smart spec preview.
- **Sound alerts (NEW)**: Web Audio API chimes on detection (660Hz), success (880Hz), and failure (330Hz). Toggle in top bar (🔊/🔇). Persisted in localStorage.
- **Browser notifications (NEW)**: System notifications on detection, success, disconnect, and broadcasts. Toggle in top bar (🔔/🔕). Requests permission on first enable.
- **Light/Dark theme (NEW)**: Warm cream light theme + existing dark theme. Toggle in top bar (🌙/☀). Persisted. No flash on reload (theme applied via inline script before React mounts).
- **CSV/JSON export (NEW)**: Two new buttons in the log panel — CSV (timestamp,type,message) and JSON (with stats + full log). Downloads instantly via Blob.
- **Latency histogram (NEW)**: 7-bin histogram in the sidebar showing click latency distribution. Color-coded sage (<200ms) / amber (200-500ms) / rose (>500ms).
- **Test Click button (NEW)**: Sends a fake MESSAGE_CREATE packet through the click engine to verify thread config. Appears in the live-bar next to Restart/Stop.
- **Per-keyword stats (NEW)**: Sidebar widget showing per-keyword detection/success/fail counts + success rate + best time. Updates in real-time via socket.io.
- **Per-user resource usage (NEW)**: Admin "Usage" tab with per-session uptime, detection count, last detection time, target count, reconnect attempts, and per-keyword breakdown. Includes "Kill Idle" buttons (1h/3h/6h).
- **Broadcast system (NEW)**: Admin "Broadcast" tab. Send banner messages (info/warn/critical) to all connected users. Banner appears at top of screen + triggers browser notification.
- **Server Config tab (NEW)**: Admin tab showing Discord webhook status, auto-restart status, memory limit, Node version, platform.
- **Discord webhook alerts (NEW)**: Server sends Discord webhook ping at 85% (⚠️ High) and 92% (🚨 Critical) memory. Throttled to 1/type/60s. Requires `DISCORD_WEBHOOK_URL` env var.
- **Auto-restart on danger (NEW)**: At 92%+ memory, server gracefully saves all data and exits. Render auto-restarts. Enabled by default.
- **Token validation (NEW)**: Step 1 "Verify Token" button calls Discord API and shows username or error.
- **Latency check (NEW)**: Automatic ping to Discord gateway on page load. Banner warns if > 500ms.
- **Auto-kill idle sessions (NEW)**: Sessions running 6+ hours with 0 detections auto-terminated by meta-watchdog.
- **Audit log with IP (NEW)**: Admin actions now log the admin's IP address.

## v3 Changelog (previous release)

- Live Render Memory Monitor, auto cache-clearing, tighter watchdogs, session isolation fix, UI animations, warm premium theme overhaul.

Made by Prem Cullen.
