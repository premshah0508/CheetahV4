import express            from "express";
import { createServer }   from "node:http";
import { Server }         from "socket.io";
import { Client }         from 'discord.js-selfbot-v13';
import { createServer as createViteServer } from "vite";
import path               from "path";
import { fileURLToPath }  from "url";
import { createHash }     from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, promises as fsPromises } from "fs";
import { ciphers } from 'discord.js-selfbot-v13/src/util/Constants.js';
ciphers.length = 0;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ═══════════════════════════════════════════════════════════
   CONFIG
 ═══════════════════════════════════════════════════════════ */
const OWNER_KEY = process.env.OWNER_KEY || 'PremCullenRiviera';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const AUTO_RESTART_ON_DANGER = process.env.AUTO_RESTART_ON_DANGER !== 'false'; // default true

/* ═══════════════════════════════════════════════════════════
   DISCORD WEBHOOK ALERTS  (memory warnings + bot status)
 ═══════════════════════════════════════════════════════════ */
let lastWebhookAt: Record<string, number> = {};
const sendWebhook = async (title: string, description: string, color: number = 0xc8aa6e) => {
  if (!DISCORD_WEBHOOK_URL) return;
  // Throttle: max 1 alert per type per 60 seconds
  const key = title;
  if (lastWebhookAt[key] && Date.now() - lastWebhookAt[key] < 60_000) return;
  lastWebhookAt[key] = Date.now();
  try {
    const body = JSON.stringify({
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'The First Signer — Elite' },
      }],
    });
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (e: any) {
    console.error('[WEBHOOK] Failed to send:', e?.message || e);
  }
};

/* ═══════════════════════════════════════════════════════════
   DATA PERSISTENCE  (always synchronous — never lose data)
 ═══════════════════════════════════════════════════════════ */
const DATA_DIR    = path.join(process.cwd(), 'data');
const STATS_FILE  = path.join(DATA_DIR, 'stats.json');
const ACCESS_FILE = path.join(DATA_DIR, 'access.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const hashPw = (pw: string) =>
  createHash('sha256').update(pw + 'tfs_v1_salt_2026').digest('hex');

// ── Lifetime stats (global, never wiped unless owner resets) ──
interface LifetimeStats { det: number; del: number; fail: number; best: number | null; }
let lts: LifetimeStats = { det: 0, del: 0, fail: 0, best: null };
try {
  if (existsSync(STATS_FILE)) {
    const parsed = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
    if (parsed && typeof parsed.det === 'number') lts = parsed;
  }
} catch (e) { console.warn('[DATA] Failed to parse stats.json, using defaults:', (e as any)?.message); }

// ALWAYS write synchronously — never lose stats between server restarts
const saveStats = () => {
  try { writeFileSync(STATS_FILE, JSON.stringify(lts)); }
  catch (e) { console.error('[PERSIST] stats write error:', (e as any)?.message); }
};

// ── Access control ─────────────────────────────────────────────
interface AccessEntry {
  id: string; name: string; discord: string;
  passwordHash: string; requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}
let accessList: AccessEntry[] = [];
try {
  if (existsSync(ACCESS_FILE)) {
    const parsed = JSON.parse(readFileSync(ACCESS_FILE, 'utf-8'));
    if (Array.isArray(parsed)) accessList = parsed;
  }
} catch (e) { console.warn('[DATA] Failed to parse access.json, using defaults:', (e as any)?.message); }
const saveAccess = () => {
  try { writeFileSync(ACCESS_FILE, JSON.stringify(accessList)); }
  catch (e) { console.error('[PERSIST] access write error:', (e as any)?.message); }
};

// ── Admin Activity Log ────────────────────────────────────────
let activityLog: any[] = [];
try {
  if (existsSync(ACTIVITY_FILE)) {
    const parsed = JSON.parse(readFileSync(ACTIVITY_FILE, 'utf-8'));
    if (Array.isArray(parsed)) activityLog = parsed;
  }
} catch (e) { console.warn('[DATA] Failed to parse activity.json, using defaults:', (e as any)?.message); }

const logActivity = (type: string, detail: string, user?: string) => {
  const entry = {
    id: Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
    ts: new Date().toISOString(),
    type, detail, ...(user ? { user } : {}),
  };
  activityLog.push(entry);
  if (activityLog.length > 300) activityLog = activityLog.slice(-200);
  try { writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog)); }
  catch (e) { console.error('[PERSIST] activity write error:', (e as any)?.message); }
};

// Periodic safety flush (in case any in-memory state diverges)
setInterval(() => {
  try { writeFileSync(STATS_FILE, JSON.stringify(lts)); } catch {}
  try { writeFileSync(ACCESS_FILE, JSON.stringify(accessList)); } catch {}
  try { writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog)); } catch {}
}, 15000);

/* ═══════════════════════════════════════════════════════════
   DIRECT INTERACTION ENGINE  (CRITICAL — DO NOT MODIFY)
   Uses RAW fetch() to Discord's API — bypasses discord.js
   library entirely so all N threads fire truly parallel HTTP
   requests with no internal throttling/queuing.
 ═══════════════════════════════════════════════════════════ */
const DISCORD_EPOCH = 1420070400000n;

const CLIENT_VERSION    = '1.0.9178';
const CLIENT_BUILD      = 368148;
const NATIVE_BUILD      = 56617;
const CHROME_VER        = '134.0.6998.205';
const ELECTRON_VER      = '34.5.1';
const UA_STR            = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/${CLIENT_VERSION} Chrome/${CHROME_VER} Electron/${ELECTRON_VER} Safari/537.36`;

const X_SUPER_PROPERTIES = Buffer.from(JSON.stringify({
  os: 'Windows', browser: 'Discord Client', release_channel: 'stable',
  client_version: CLIENT_VERSION, os_version: '10.0.22631', os_arch: 'x64',
  app_arch: 'x64', system_locale: 'en-US',
  browser_user_agent: UA_STR,
  browser_version: ELECTRON_VER,
  client_build_number: CLIENT_BUILD,
  native_build_number: NATIVE_BUILD,
  client_event_source: null,
})).toString('base64');

const UA = UA_STR;

const snowflake = (threadNum = 0): string =>
  (((BigInt(Date.now()) - DISCORD_EPOCH) << 22n) | BigInt(threadNum & 0x3FF)).toString();

// Global token cache — set when bot logs in, used by rawClick for direct HTTP
// NOTE: For multi-user deployments, each session overwrites this. The rawClick
// function also falls back to client.token so concurrent users still work.
let _activeToken: string | null = null;
const setActiveToken = (token: string | null) => { _activeToken = token; };

// ── RAW HTTP CLICK — bypasses discord.js library entirely ──
// Uses fetch() directly to Discord's interaction endpoint.
// This guarantees ALL N threads fire truly parallel HTTP requests
// with no internal library throttling/queuing/deduplication.
const rawClick = async (
  client: Client, d: any, customId: string, threadNum = 0,
): Promise<{ status: number; body: string }> => {
  const guildId = d.guild_id ?? null;
  const channelId = d.channel_id;
  const messageId = d.id;
  const applicationId = d.application_id || d.author?.id || d.webhook_id;

  const payload: any = {
    type:           3, // InteractionTypes.MESSAGE_COMPONENT
    nonce:          snowflake(threadNum),
    channel_id:     channelId,
    message_id:     messageId,
    application_id: applicationId,
    session_id:     client.sessionId || '',
    message_flags:  d.flags ?? 0,
    data: {
      component_type: 2, // MessageComponentTypes.BUTTON
      custom_id:      customId,
    },
  };
  if (guildId) payload.guild_id = guildId;

  // ── Try raw fetch() FIRST — truly parallel, no library throttling ──
  // Use the client's token directly (per-session, supports concurrent users)
  const token = (client as any).token || _activeToken;
  if (token && typeof fetch === 'function') {
    try {
      const url = `https://discord.com/api/v9/interactions?with_certified_recipients=true`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'User-Agent': UA,
          'X-Super-Properties': X_SUPER_PROPERTIES,
          'X-Discord-Locale': 'en-US',
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 204 || res.status === 200) {
        return { status: res.status, body: '' };
      }
      let body = '';
      try { body = await res.text(); } catch {}
      let errStr = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed.message) errStr = parsed.message;
      } catch {}
      return { status: res.status, body: errStr };
    } catch (e: any) {
      // Fall through to library method below
    }
  }

  // ── Fallback: use discord.js library API (if raw fetch fails) ──
  try {
    await (client as any).api.interactions.post({ data: payload });
    return { status: 204, body: '' };
  } catch (e: any) {
    let errStr = e?.message ?? 'interaction failed';
    if (e?.status) {
      return { status: e.status, body: errStr };
    }
    try {
      if (e?.body) {
        const parsed = JSON.parse(e.body);
        if (parsed.message) errStr = parsed.message;
      }
    } catch {}
    return { status: e?.statusCode ?? 400, body: errStr };
  }
};

/* ═══════════════════════════════════════════════════════════
   SERVER
 ═══════════════════════════════════════════════════════════ */
async function startServer() {
  const app    = express();
  const server = createServer(app);
  const io     = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'DELETE'] },
    // ── Resilient socket config — survives brief network blips ──
    pingInterval: 25000,         // ping every 25s (less aggressive than 10s, reduces false disconnects)
    pingTimeout:  60000,         // wait 60s for pong before declaring dead (was 8s — too aggressive)
    connectTimeout: 45000,       // 45s to establish initial connection
    maxHttpBufferSize: 1e6,      // 1MB
    allowEIO3: true,             // accept older engine.io clients for compatibility
    transports: ['websocket', 'polling'],  // WS first, fallback to polling
    upgradeTimeout: 30000,       // 30s for transport upgrade
  });
  const PORT   = process.env.PORT ? +process.env.PORT : 3000;

  app.use(express.json({ limit: '1mb' }));

  // ── Health ──────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    sessions: sessions.size,
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  }));

  // ── Lifetime stats (visible to everyone) ───────────────────
  app.get('/api/stats', (_req, res) => res.json(lts));

  // ── Stats Sync (Rehydration) — protects against Render disk wipe ──
  app.post('/api/stats/sync', (req, res) => {
    const { det, del, fail, best } = req.body ?? {};
    let changed = false;
    if (typeof det === 'number' && det > lts.det) { lts.det = det; changed = true; }
    if (typeof del === 'number' && del > lts.del) { lts.del = del; changed = true; }
    if (typeof fail === 'number' && fail > lts.fail) { lts.fail = fail; changed = true; }
    if (typeof best === 'number') {
      if (lts.best === null || best < lts.best) { lts.best = best; changed = true; }
    }
    if (changed) {
      saveStats();
      // Broadcast to ALL connected clients — stats are global
      io.emit('lifetimeStats', { ...lts });
    }
    res.json({ ok: true, lts });
  });

  // ── Gate: request access ────────────────────────────────────
  app.post('/api/gate/request', (req, res) => {
    const { name, discord, password } = req.body ?? {};
    if (!name?.trim() || !password?.trim())
      return res.status(400).json({ error: 'Name and password are required.' }) as any;

    const existing = accessList.find(
      e => e.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (existing?.status === 'approved')
      return res.status(409).json({ error: 'Name already registered. Use Sign In instead.' }) as any;
    if (existing?.status === 'pending')
      return res.status(409).json({ error: 'A request with this name is already pending approval.' }) as any;
    if (existing?.status === 'rejected') {
      existing.passwordHash = hashPw(password);
      existing.discord      = discord?.trim() || '';
      existing.status       = 'pending';
      existing.requestedAt  = new Date().toISOString();
      saveAccess();
      logActivity('access_request', `New access request from ${name.trim()}`, name.trim());
      return res.json({ ok: true });
    }

    const entry: AccessEntry = {
      id:           Math.random().toString(36).slice(2, 15),
      name:         name.trim(),
      discord:      discord?.trim() || '',
      passwordHash: hashPw(password),
      requestedAt:  new Date().toISOString(),
      status:       'pending',
    };
    accessList.push(entry);
    saveAccess();
    logActivity('access_request', `New access request from ${name.trim()}`, name.trim());
    res.json({ ok: true });
  });

  // ── Gate: login ─────────────────────────────────────────────
  app.post('/api/gate/login', (req, res) => {
    const { name, password, isAdmin } = req.body ?? {};

    // Owner key — bypasses name requirement completely
    if (password === OWNER_KEY && (isAdmin || !name)) {
      logActivity('login', 'Admin logged in', 'Owner');
      return res.json({ ok: true, role: 'owner', name: 'Owner' });
    }

    if (isAdmin) {
      return res.status(401).json({ error: 'Invalid admin password.' }) as any;
    }

    if (!name?.trim() || !password?.trim())
      return res.status(400).json({ error: 'Name and password are required.' }) as any;

    if (password === OWNER_KEY) {
      logActivity('login', `Owner logged in as ${name.trim()}`, name.trim());
      return res.json({ ok: true, role: 'owner', name: name.trim() });
    }

    const entry = accessList.find(
      e => e.name.toLowerCase() === name.trim().toLowerCase()
        && e.passwordHash === hashPw(password)
    );
    if (!entry)
      return res.status(401).json({ error: 'Invalid name or password.' }) as any;
    if (entry.status === 'pending')
      return res.status(403).json({ error: 'Your request is pending owner approval.' }) as any;
    if (entry.status === 'rejected')
      return res.status(403).json({ error: 'Your access has been denied by the owner.' }) as any;

    logActivity('login', `User ${entry.name} logged in`, entry.name);
    res.json({ ok: true, role: 'user', name: entry.name });
  });

  // ── Admin middleware ─────────────────────────────────────────
  const ownerOnly = (req: any, res: any, next: any) => {
    if (req.headers['x-owner-key'] !== OWNER_KEY)
      return res.status(401).json({ error: 'Unauthorized' });
    // Attach IP for audit logging
    (req as any).adminIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    next();
  };

  app.get('/api/admin/users',        ownerOnly, (_req, res) => res.json(accessList));
  app.post('/api/admin/approve',     ownerOnly, (req: any, res) => {
    const e = accessList.find(x => x.id === req.body?.id);
    if (!e) return res.status(404).json({ error: 'Not found' }) as any;
    e.status = 'approved'; saveAccess();
    logActivity('admin_action', `Approved access for ${e.name}`, `Owner @ ${req.adminIp}`);
    res.json({ ok: true });
  });
  app.post('/api/admin/reject',      ownerOnly, (req: any, res) => {
    const e = accessList.find(x => x.id === req.body?.id);
    if (!e) return res.status(404).json({ error: 'Not found' }) as any;
    e.status = 'rejected'; saveAccess();
    logActivity('admin_action', `Rejected access for ${e.name}`, `Owner @ ${req.adminIp}`);
    res.json({ ok: true });
  });
  app.post('/api/admin/revoke',      ownerOnly, (req: any, res) => {
    const e = accessList.find(x => x.id === req.body?.id);
    if (!e) return res.status(404).json({ error: 'Not found' }) as any;
    e.status = 'rejected'; saveAccess();
    logActivity('admin_action', `Revoked access for ${e.name}`, `Owner @ ${req.adminIp}`);
    res.json({ ok: true });
  });
  app.delete('/api/admin/delete',    ownerOnly, (req: any, res) => {
    accessList = accessList.filter(x => x.id !== req.body?.id);
    saveAccess();
    logActivity('admin_action', `Deleted user ID ${req.body?.id}`, `Owner @ ${req.adminIp}`);
    res.json({ ok: true });
  });
  app.post('/api/admin/resetStats',  ownerOnly, (_req, res) => {
    lts = { det: 0, del: 0, fail: 0, best: null };
    saveStats();
    io.emit('lifetimeStats', { ...lts });
    logActivity('admin_action', 'Reset lifetime stats to zero');
    res.json({ ok: true });
  });

  // ── Admin: Activity Log ──────────────────────────────────────
  app.get('/api/admin/activity', ownerOnly, (req: any, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const typeFilter = req.query.type as string;
    let filtered = activityLog;
    if (typeFilter) filtered = filtered.filter((e: any) => e.type === typeFilter);
    res.json(filtered.slice(-limit).reverse());
  });

  // ── Admin: Sessions ──────────────────────────────────────────
  app.get('/api/admin/sessions', ownerOnly, (_req, res) => {
    const sessionData = Array.from(sessions.entries()).map(([id, s]) => ({
      id,
      running: s.running,
      isReconnecting: s.isReconnecting,
      reconnectAttempts: s.reconnectAttempts,
      botTag: s.botTag,
      ownerName: s.ownerName,
      lastPacketAgo: s.lastRawPacketAt ? Math.round((Date.now() - s.lastRawPacketAt) / 1000) : null,
      uptimeSec: Math.floor((Date.now() - s.createdAt) / 1000),
      detectionCount: s.detectionCount,
      lastDetectionAgo: s.lastDetectionAt > 0 ? Math.floor((Date.now() - s.lastDetectionAt) / 1000) : null,
      config: s.config ? {
        targetId: s.config.targetId,
        keyword: s.config.keyword,
        threads: s.config.threadConfig?.length || 0,
        targets: s.config.targets || [],
      } : null,
      keywordStats: Array.from(s.keywordStats.entries()).map(([k, v]) => ({ keyword: k, ...v })),
    }));
    res.json({ sessions: sessionData, totalActive: sessionData.filter(s => s.running).length });
  });

  app.post('/api/admin/sessions/kill', ownerOnly, (req, res) => {
    const { sessionId } = req.body ?? {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' }) as any;
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: 'Session not found' }) as any;
    sess.destroyed = true;
    emit(sessionId, 'Session terminated by admin.', 'error');
    logActivity('admin_action', `Admin force-killed session ${sessionId.slice(0,8)}`);
    fullDestroy(sess);
    sess.clicked.clear();
    sess.clickedCustomIds.clear();
    sessions.delete(sessionId);
    res.json({ ok: true });
  });

  // ── Admin: Database dashboard ────────────────────────────────
  app.get('/api/admin/database', ownerOnly, (_req, res) => {
    res.json({
      stats: { ...lts },
      users: {
        total: accessList.length,
        pending: accessList.filter(a => a.status === 'pending').length,
        approved: accessList.filter(a => a.status === 'approved').length,
        rejected: accessList.filter(a => a.status === 'rejected').length,
      },
      sessions: { total: sessions.size, active: Array.from(sessions.values()).filter(s => s.running).length },
      activity: { total: activityLog.length, recent: activityLog.slice(-10).reverse() },
      uptime: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  // ── Access List Sync (Rehydration) ────────────────────────────
  app.post('/api/access/sync', ownerOnly, (req, res) => {
    const incoming: AccessEntry[] = req.body?.list;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.json({ ok: true, list: accessList }) as any;
    }
    if (accessList.length === 0 && incoming.length > 0) {
      const valid = incoming.every((e: any) =>
        e.id && e.name && typeof e.status === 'string' &&
        ['pending', 'approved', 'rejected'].includes(e.status)
      );
      if (valid) {
        accessList = incoming;
        saveAccess();
        logActivity('access_request', `Access list rehydrated with ${accessList.length} entries from admin client`);
        console.log(`[SYNC] Access list rehydrated with ${accessList.length} entries from admin client.`);
      }
    }
    res.json({ ok: true, list: accessList });
  });

  /* ── Bot session management ─────────────────────────────── */
  interface ThreadConfigItem { delayMs: number; }
  interface TargetConfig { targetId: string; keyword: string; }
  interface Session {
    client: Client | null; running: boolean; sessionId: string;
    config: {
      token: string;
      targetId: string;       // legacy single-target (backwards compat)
      keyword: string;        // legacy single-target (backwards compat)
      targets: TargetConfig[]; // multi-target mode (preferred)
      threadConfig: ThreadConfigItem[];
    };
    clicked: Set<string>;
    clickedCustomIds: Map<string, number>;
    // Per-keyword stats (session-local)
    keywordStats: Map<string, { det: number; del: number; fail: number; best: number | null }>;
    // Per-target uptime tracker
    targetStartTimes: Map<string, number>;
    detectionCount: number;  // total detections this session (for auto-kill idle)
    // Connection health tracking
    heartbeatInterval?: NodeJS.Timeout;
    lastRawPacketAt: number;
    reconnectAttempts: number;
    reconnectTimer?: NodeJS.Timeout;
    isReconnecting: boolean;
    botTag: string;
    destroyed: boolean;
    ownerName: string;   // who owns this session (for diagnostics)
    createdAt: number;
    lastDetectionAt: number;  // for auto-kill idle sessions
  }
  const sessions = new Map<string, Session>();
  const getSession = (id: string): Session => {
    if (!sessions.has(id)) {
      sessions.set(id, {
        client: null, running: false, sessionId: '',
        config: { token: '', targetId: '', keyword: '', targets: [], threadConfig: [] },
        clicked: new Set(),
        clickedCustomIds: new Map(),
        keywordStats: new Map(),
        targetStartTimes: new Map(),
        detectionCount: 0,
        lastRawPacketAt: 0,
        reconnectAttempts: 0,
        isReconnecting: false,
        botTag: '',
        destroyed: false,
        ownerName: '',
        createdAt: Date.now(),
        lastDetectionAt: 0,
      });
    }
    return sessions.get(id)!;
  };

  const emit    = (sid: string, msg: string, type: 'info'|'success'|'error' = 'info') =>
    io.to(sid).emit('log', { message: msg, type });

  const emitHeartbeat = (sid: string, data: {
    alive: boolean;
    lastPacketAgo: number;
    reconnectAttempts: number;
    wsStatus: string;
    timestamp: number;
  }) => io.to(sid).emit('heartbeat', data);

  const destroyClient = (sess: Session) => {
    if (sess.client) {
      try { sess.client.removeAllListeners(); } catch {}
      try { sess.client.destroy(); } catch {}
      sess.client = null;
    }
    if (sess.heartbeatInterval) { clearInterval(sess.heartbeatInterval); sess.heartbeatInterval = undefined; }
    if (sess.reconnectTimer) { clearTimeout(sess.reconnectTimer); sess.reconnectTimer = undefined; }
  };

  const fullDestroy = (sess: Session) => {
    destroyClient(sess);
    sess.running = false;
    sess.sessionId = '';
    sess.reconnectAttempts = 0;
    sess.isReconnecting = false;
    sess.lastRawPacketAt = 0;
    sess.botTag = '';
  };

  /* ═══════════════════════════════════════════════════════════
     CORE: Create and wire up a Discord client with bulletproof
     connection lifecycle management
   ═══════════════════════════════════════════════════════════ */
  const createBotClient = (sid: string, sess: Session): Client => {
    const client = new Client({
      checkUpdate: false,
      patchVoice: false,
    } as any);

    sess.client = client;
    sess.lastRawPacketAt = Date.now();

    // ── Start heartbeat IMMEDIATELY — don't wait for ready event ──
    startHeartbeatMonitor(sid, sess);

    // ────────────────────────────────────────────────────────
    // EVENT: ready — bot successfully connected & authenticated
    // SYNCHRONOUS handler — notifies frontend FIRST, then logs.
    // The UI flips to "Engine Running" the instant Discord says ready.
    // ────────────────────────────────────────────────────────
    client.on('ready', () => {
      sess.running = true;
      sess.isReconnecting = false;
      sess.reconnectAttempts = 0;
      sess.lastRawPacketAt = Date.now();
      sess.botTag = client.user?.tag || 'Unknown';

      const activeSessionId = client.sessionId || '';
      if (activeSessionId) sess.sessionId = activeSessionId;

      // ── STEP 1: NOTIFY FRONTEND IMMEDIATELY (before any logging) ──
      // This makes the UI flip to "Engine Running" the instant Discord says ready.
      io.to(sid).emit('sessionStatus', { isRunning: true, config: { ...sess.config, token: '***redacted***' } });
      io.to(sid).emit('authProgress', { stage: 'ready', message: 'Authenticated — engine online' });

      // ── STEP 2: Log auth success + config (fire-and-forget, doesn't delay clicks) ──
      if (activeSessionId) {
        emit(sid, `✓ Authenticated — ${sess.botTag} (Session: ${activeSessionId.slice(0, 8)}…)`, 'success');
      } else {
        emit(sid, `✓ Authenticated — ${sess.botTag}`, 'success');
      }

      // Log target configuration (multi-target aware)
      const activeTargets = sess.config.targets && sess.config.targets.length > 0
        ? sess.config.targets
        : (sess.config.targetId ? [{ targetId: sess.config.targetId, keyword: sess.config.keyword }] : []);
      if (activeTargets.length === 1) {
        emit(sid, `▸ Monitoring: ${activeTargets[0].targetId}`, 'info');
        emit(sid, `▸ Keyword: "${activeTargets[0].keyword}"`, 'info');
      } else {
        emit(sid, `▸ Multi-target mode: ${activeTargets.length} targets`, 'info');
        activeTargets.forEach((t, i) => {
          emit(sid, `▸ Target ${i+1}: ${t.targetId} · "${t.keyword}"`, 'info');
        });
      }
      const summary = sess.config.threadConfig.map((t, idx) => `T${idx+1}:${t.delayMs}ms`).join(', ');
      emit(sid, `▸ Engine: ${sess.config.threadConfig.length} threads · [ ${summary} ] · Unique nonces`, 'info');
      emit(sid, `▸ Heartbeat monitor active — checking every 20s`, 'info');

      // ── STEP 3: Background tasks (non-blocking, don't delay clicks) ──
      // Pre-warm HTTP connection in the background — don't await
      (async () => {
        try {
          await (client as any).api.gateway.get();
          emit(sid, `▸ HTTP connection pre-warmed — ready`, 'info');
        } catch {}
      })();
      // Restart heartbeat monitor (was started in createBotClient, refresh it)
      startHeartbeatMonitor(sid, sess);
    });

    client.on('error', (e: any) => {
      emit(sid, `⚠ Client Error: ${e?.message || 'unknown'}`, 'error');
    });

    client.on('warn', (msg: string) => {
      // Suppress noisy warnings — only emit serious ones
      if (typeof msg === 'string' && /error|invalid|disconnect/i.test(msg)) {
        emit(sid, `⚠ Warning: ${msg}`, 'error');
      }
    });

    client.on('shardDisconnect', (event: any, shardId: number) => {
      const code = event?.code || 'unknown';
      const reason = event?.reason || 'no reason';
      emit(sid, `⚠ WS Disconnected! Code: ${code}, Reason: ${reason}`, 'error');

      // Codes that mean we should NOT reconnect (token invalid, etc)
      const fatalCodes = [4004, 4010, 4011, 4012, 4013, 4014];
      if (fatalCodes.includes(Number(code))) {
        emit(sid, `✗ Fatal disconnect (code ${code}) — token may be invalid. Stopping.`, 'error');
        fullDestroy(sess);
        io.to(sid).emit('sessionStatus', { isRunning: false, config: null });
        return;
      }

      // For non-fatal disconnects, attempt reconnection
      scheduleReconnect(sid, sess, 'WS disconnected');
    });

    client.on('shardReconnecting', (_shardId: number) => {
      emit(sid, `↻ Reconnecting to Discord gateway…`, 'info');
      sess.isReconnecting = true;
    });

    client.on('shardResume', (_shardId: number, _replayedEvents: number) => {
      emit(sid, `✓ Reconnected! Resumed session successfully.`, 'success');
      sess.isReconnecting = false;
      sess.reconnectAttempts = 0;
      sess.lastRawPacketAt = Date.now();
      sess.running = true;
    });

    client.on('invalidated', () => {
      emit(sid, `✗ Session invalidated by Discord. Will re-login…`, 'error');
      scheduleReconnect(sid, sess, 'session invalidated');
    });

    // ────────────────────────────────────────────────────────
    // EVENT: raw — every single gateway packet
    // SYNCHRONOUS handler (not async) — fires clicks INSTANTLY
    // upon detection. Zero microtask overhead.
    // DO NOT modify the thread/delay/retry/cooldown logic below.
    // ────────────────────────────────────────────────────────
    client.on('raw', (packet: any) => {
      // Update heartbeat tracker on EVERY raw packet
      sess.lastRawPacketAt = Date.now();

      if (packet.t === 'READY' || packet.t === 'RESUMED') {
        const sidVal = packet.d?.session_id || client.sessionId;
        if (sidVal) {
          sess.sessionId = sidVal;
          emit(sid, `▸ WS Session ID captured: ${sess.sessionId.slice(0, 8)}…`, 'info');
        }
        if (packet.t === 'READY') return;
      }
      if (!sess.running) return;
      if (packet.t !== 'MESSAGE_CREATE' && packet.t !== 'MESSAGE_UPDATE') return;

      const d = packet.d;
      if (!d) return;

      // ── Multi-target matching ──
      // Build the list of (targetId, keyword) pairs to check.
      // If `targets` array is non-empty, use it. Otherwise fall back to legacy single target.
      const targets = sess.config.targets && sess.config.targets.length > 0
        ? sess.config.targets
        : (sess.config.targetId ? [{ targetId: sess.config.targetId, keyword: sess.config.keyword }] : []);

      // Find the matching target config for this message's author
      const matchedTarget = targets.find(t => t.targetId && d.author?.id === t.targetId);
      if (!matchedTarget) return;
      if (!d.components?.length) return;
      if (sess.clicked.has(d.id)) return;

      const activeKeyword = matchedTarget.keyword;

      const t0 = Date.now();
      for (const row of d.components) {
        if (!row.components) continue;
        for (const comp of row.components) {
          if (comp.type !== 2 || !comp.label || !comp.custom_id) continue;
          if (!comp.label.toLowerCase().includes(activeKeyword.toLowerCase())) continue;

          const cid = comp.custom_id;

          // Check if this custom_id was successfully clicked recently (cooldown of 30 seconds)
          const lastClickTime = sess.clickedCustomIds.get(cid) || 0;
          if (Date.now() - lastClickTime < 30000) {
            return;
          }

          sess.clicked.add(d.id);

          const msgD = d;
          const label = comp.label;

          // Per-event result tracker for accurate lifetime accounting
          // ALL threads fire regardless of success — ev tracks the BEST (lowest) latency
          const ev = { succeeded: false, bestMs: Infinity, successCount: 0, failCount: 0 };
          // Collect all log messages silently — emit AFTER all clicks complete
          const pendingLogs: { msg: string; type: 'success' | 'error' | 'info' }[] = [];

          // Resolve threads config (defined here so it's available for the emit log)
          const threadsConfig = sess.config.threadConfig && sess.config.threadConfig.length > 0
            ? sess.config.threadConfig
            : [{ delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 1 }, { delayMs: 1 }];

          // 🚀 EMIT DETECTION LOG IMMEDIATELY — user sees instant detection
          // (fire-and-forget, does NOT delay the click)
          emit(sid, `[DETECTED] "${label}" — firing ${threadsConfig.length} threads NOW`, 'info');

          // ── Dynamic thread engine — ALL THREADS FIRE, NO EARLY ABORT, NO DELAYS ────
          // Every thread fires its own click HTTP request IMMEDIATELY.
          // NO thread is skipped, NO thread is aborted early.
          // If you configured 8 threads → 8 HTTP requests go out. Period.
          // If you configured 10 threads → 10 HTTP requests go out. Period.
          // Retries are ALSO instant (0ms delay, was 30ms — removed for max speed).
          const thread = async (n: number, delayMs: number) => {
            if (delayMs > 0) await new Promise<void>(r => setTimeout(r, delayMs));
            // NO early-abort check here — every thread fires regardless of other threads' success

            // Attempt 1 — fires IMMEDIATELY for 0ms threads (same synchronous tick as detection)
            try {
              const { status, body } = await rawClick(client, msgD, cid, n);
              const elapsed = Date.now() - t0;

              if (status === 204 || status === 200) {
                if (elapsed < ev.bestMs) ev.bestMs = elapsed;
                ev.succeeded = true;
                ev.successCount++;
                sess.clickedCustomIds.set(cid, Date.now());
                pendingLogs.push({ msg: `[SUCCESS] T${n} — ${elapsed}ms`, type: 'success' });
                return;
              }

              // Non-success — RETRY IMMEDIATELY (0ms delay, was 30ms)
              try {
                const r2 = await rawClick(client, msgD, cid, n + 100);
                const elapsed2 = Date.now() - t0;
                if (r2.status === 204 || r2.status === 200) {
                  if (elapsed2 < ev.bestMs) ev.bestMs = elapsed2;
                  ev.succeeded = true;
                  ev.successCount++;
                  sess.clickedCustomIds.set(cid, Date.now());
                  pendingLogs.push({ msg: `[SUCCESS] T${n} retry — ${elapsed2}ms`, type: 'success' });
                  return;
                }
              } catch {}

              ev.failCount++;
              pendingLogs.push({ msg: `[FAIL] T${n} HTTP ${status} — ${body}`, type: 'error' });
            } catch (e: any) {
              // Network error — RETRY IMMEDIATELY (0ms delay, was 30ms)
              try {
                const r2 = await rawClick(client, msgD, cid, n + 100);
                const elapsed2 = Date.now() - t0;
                if (r2.status === 204 || r2.status === 200) {
                  if (elapsed2 < ev.bestMs) ev.bestMs = elapsed2;
                  ev.succeeded = true;
                  ev.successCount++;
                  sess.clickedCustomIds.set(cid, Date.now());
                  pendingLogs.push({ msg: `[SUCCESS] T${n} retry — ${elapsed2}ms`, type: 'success' });
                  return;
                }
              } catch {}

              ev.failCount++;
              pendingLogs.push({ msg: `[FAIL] T${n}: ${e?.message ?? 'network error'}`, type: 'error' });
            }
          };

          // 🚀 FIRE ALL THREADS INSTANTLY — map() calls thread() synchronously
          // For 0ms threads: rawClick() is called in the SAME synchronous tick
          // as the raw event handler. The HTTP request is in flight before any
          // other JS code runs. Zero delay. Zero microtask overhead for the call.
          const promises = threadsConfig.map((t, idx) => thread(idx + 1, t.delayMs));

          // After ALL clicks complete — flush results + summary + stats
          Promise.allSettled(promises).then(() => {
            // All thread result logs (success/fail) — shows EVERY thread that fired
            for (const log of pendingLogs) {
              emit(sid, log.msg, log.type);
            }

            // SUMMARY LOG — proves all N threads fired
            const total = threadsConfig.length;
            const fired = ev.successCount + ev.failCount;
            const bestStr = ev.bestMs !== Infinity ? `${ev.bestMs}ms` : '—';
            emit(sid, `[SUMMARY] ${fired}/${total} threads fired · ${ev.successCount} succeeded · ${ev.failCount} failed · best: ${bestStr}`, ev.succeeded ? 'success' : 'error');

            // Update lifetime stats (global)
            lts.det++;
            if (ev.succeeded) {
              lts.del++;
              if (lts.best === null || ev.bestMs < lts.best) lts.best = ev.bestMs;
            } else {
              lts.fail++;
            }
            saveStats();

            // Update per-keyword session-local stats
            const kwKey = activeKeyword.toLowerCase();
            const kwStat = sess.keywordStats.get(kwKey) || { det: 0, del: 0, fail: 0, best: null };
            kwStat.det++;
            if (ev.succeeded) {
              kwStat.del++;
              if (kwStat.best === null || ev.bestMs < kwStat.best) kwStat.best = ev.bestMs;
            } else {
              kwStat.fail++;
            }
            sess.keywordStats.set(kwKey, kwStat);

            // Update session detection tracking (for auto-kill idle)
            sess.detectionCount++;
            sess.lastDetectionAt = Date.now();

            // Broadcast to ALL connected clients — stats are global, visible to everyone
            io.emit('lifetimeStats', { ...lts });

            // Broadcast per-keyword stats to the session owner
            io.to(sid).emit('keywordStats', {
              stats: Array.from(sess.keywordStats.entries()).map(([k, v]) => ({ keyword: k, ...v })),
            });
          });

          return;
        }
      }
    });

    return client;
  };

  /* ═══════════════════════════════════════════════════════════
     HEARTBEAT MONITOR — TIGHTER intervals for faster zombie detection
   ═══════════════════════════════════════════════════════════ */
  const HEARTBEAT_INTERVAL_MS = 20_000; // 20 seconds (was 30s)
  const ZOMBIE_THRESHOLD_MS   = 60_000; // 60 seconds (was 90s)

  const startHeartbeatMonitor = (sid: string, sess: Session) => {
    // Clear any existing heartbeat
    if (sess.heartbeatInterval) clearInterval(sess.heartbeatInterval);

    sess.heartbeatInterval = setInterval(() => {
      // SAFETY: Wrap entire callback in try-catch so the interval can NEVER silently die
      try {
        const now = Date.now();
        const lastPacketAgo = now - sess.lastRawPacketAt;
        const isAlive = lastPacketAgo < ZOMBIE_THRESHOLD_MS;

        // Determine WS status
        let wsStatus = 'unknown';
        try {
          const wsState = (sess.client as any)?.ws?.shards?.first()?.connection?.readyState;
          if (wsState === 0) wsStatus = 'connecting';
          else if (wsState === 1) wsStatus = 'open';
          else if (wsState === 2) wsStatus = 'closing';
          else if (wsState === 3) wsStatus = 'closed';
          else wsStatus = sess.running ? 'active' : 'idle';
        } catch {
          wsStatus = sess.running ? 'active' : 'idle';
        }

        // Emit heartbeat to frontend
        emitHeartbeat(sid, {
          alive: isAlive,
          lastPacketAgo: Math.round(lastPacketAgo / 1000),
          reconnectAttempts: sess.reconnectAttempts,
          wsStatus,
          timestamp: now,
        });

        // GARBAGE COLLECTION: Clear clicked CustomIds older than 60 seconds
        const threshold = now - 45000;
        for (const [cid, time] of sess.clickedCustomIds.entries()) {
          if (time < threshold) sess.clickedCustomIds.delete(cid);
        }

        // GARBAGE COLLECTION: Cap clicked Set to prevent unbounded growth
        if (sess.clicked.size > 200) {
          const arr = [...sess.clicked];
          sess.clicked = new Set(arr.slice(arr.length - 50));
        }

        if (isAlive) return;

        // ═══ ZOMBIE DETECTED ═══
        emit(sid, `⚠ ZOMBIE CONNECTION — No gateway packet for ${Math.round(lastPacketAgo / 1000)}s. Forcing reconnect…`, 'error');
        logActivity('error', `Zombie connection detected (${Math.round(lastPacketAgo / 1000)}s since last packet)`);
        scheduleReconnect(sid, sess, 'zombie connection');
      } catch (e: any) {
        // The heartbeat callback itself crashed — log it but KEEP THE INTERVAL RUNNING
        console.error('[HEARTBEAT] Error in heartbeat callback (interval still running):', e?.message || e);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // CRITICAL: Make sure the interval can never be garbage collected
    if (sess.heartbeatInterval.unref) sess.heartbeatInterval.unref();
  };

  /* ═══════════════════════════════════════════════════════════
     META-WATCHDOG — TIGHTER checks every 30s
     - Restarts dead heartbeat intervals
     - Forces reconnect on stale sessions
     - Auto-kills idle sessions (6h+ with 0 detections) every check
   ═══════════════════════════════════════════════════════════ */
  const AUTO_KILL_IDLE_MS = 6 * 60 * 60 * 1000;  // 6 hours
  setInterval(() => {
    try {
      for (const [sid, sess] of sessions.entries()) {
        if (!sess.running && !sess.isReconnecting) continue;

        // If session is active but has no heartbeat interval → restart it
        if (!sess.heartbeatInterval) {
          console.warn(`[META-WATCHDOG] Session ${sid.slice(0,8)} has no heartbeat! Restarting monitor...`);
          emit(sid, '⚠ Meta-watchdog: heartbeat was dead, restarting monitor…', 'error');
          logActivity('error', `Meta-watchdog restarted heartbeat for session ${sid.slice(0,8)}`);
          startHeartbeatMonitor(sid, sess);
        }

        // Check if session has been stale for too long
        if (sess.running && sess.lastRawPacketAt > 0 && !sess.isReconnecting && !sess.reconnectTimer) {
          const staleSecs = Math.round((Date.now() - sess.lastRawPacketAt) / 1000);
          if (staleSecs > 120) {  // was 180s, now 120s for faster recovery
            console.warn(`[META-WATCHDOG] Session ${sid.slice(0,8)} stale for ${staleSecs}s, forcing reconnect`);
            scheduleReconnect(sid, sess, `meta-watchdog: stale ${staleSecs}s`);
          }
        }

        // AUTO-KILL IDLE: sessions running 6h+ with zero detections
        if (sess.running && sess.detectionCount === 0) {
          const idleMs = Date.now() - sess.createdAt;
          if (idleMs > AUTO_KILL_IDLE_MS) {
            console.warn(`[AUTO-KILL] Session ${sid.slice(0,8)} idle for ${Math.floor(idleMs/3600000)}h with 0 detections — terminating`);
            emit(sid, `⚠ Auto-killed: idle ${Math.floor(idleMs/3600000)}h with 0 detections. Restart if needed.`, 'error');
            logActivity('admin_action', `Auto-killed idle session ${sid.slice(0,8)} (${sess.botTag || 'unknown'}) — ${Math.floor(idleMs/3600000)}h, 0 detections`);
            fullDestroy(sess);
            sess.clicked.clear();
            sess.clickedCustomIds.clear();
            sessions.delete(sid);
            io.to(sid).emit('sessionStatus', { isRunning: false, config: null });
          }
        }
      }
    } catch (e: any) {
      console.error('[META-WATCHDOG] Error:', e?.message || e);
    }
  }, 30_000); // Every 30s (was 60s)

  // ── SESSION GARBAGE COLLECTOR — remove stopped sessions ──
  setInterval(() => {
    try {
      for (const [sid, sess] of sessions.entries()) {
        if (!sess.running && !sess.isReconnecting && !sess.reconnectTimer) {
          // Session is fully stopped — remove it after 3 minutes
          if (sess.lastRawPacketAt > 0 && Date.now() - sess.lastRawPacketAt > 180_000) {
            sessions.delete(sid);
          } else if (sess.lastRawPacketAt === 0) {
            sessions.delete(sid);
          }
        }
      }
    } catch (e: any) {
      console.error('[SESSION-GC] Error:', e?.message || e);
    }
  }, 60_000); // Every 1 min (was 2 min)

  /* ═══════════════════════════════════════════════════════════
     AUTO RE-LOGIN with exponential backoff  (NEVER GIVE UP)
   ═══════════════════════════════════════════════════════════ */
  const MAX_RECONNECT_ATTEMPTS = 99999;  // Effectively infinite
  const BASE_BACKOFF_MS = 2000;          // Start at 2 seconds
  const MAX_BACKOFF_MS = 30000;          // Cap at 30 seconds
  const LOGIN_TIMEOUT_MS = 15000;        // 15s login timeout — failures retry faster (was 30s)

  const scheduleReconnect = (sid: string, sess: Session, reason: string) => {
    // Don't double-schedule
    if (sess.reconnectTimer) return;
    if (!sess.config.token) {
      emit(sid, `✗ Cannot reconnect — no token available.`, 'error');
      return;
    }

    sess.reconnectAttempts++;

    if (sess.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      emit(sid, `✗ Max reconnect attempts reached. Giving up.`, 'error');
      fullDestroy(sess);
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s, ...
    const backoff = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, Math.min(sess.reconnectAttempts - 1, 6)),
      MAX_BACKOFF_MS
    );

    emit(sid, `↻ Reconnect attempt ${sess.reconnectAttempts} in ${(backoff / 1000).toFixed(1)}s (reason: ${reason})`, 'info');

    sess.reconnectTimer = setTimeout(async () => {
      sess.reconnectTimer = undefined;

      // Bail out if session was destroyed or removed while waiting
      if (sess.destroyed || !sessions.has(sid)) return;

      // Destroy old client completely
      destroyClient(sess);

      try {
        emit(sid, `↻ Re-authenticating…`, 'info');
        const client = createBotClient(sid, sess);

        // Login with timeout — if login hangs, force retry
        const loginPromise = client.login(sess.config.token);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Login timed out after ${LOGIN_TIMEOUT_MS/1000}s`)), LOGIN_TIMEOUT_MS)
        );

        await Promise.race([loginPromise, timeoutPromise]);
      } catch (e: any) {
        emit(sid, `✗ Re-auth failed: ${e?.message ?? 'unknown error'}`, 'error');
        // Schedule another attempt
        scheduleReconnect(sid, sess, 'login failed');
      }
    }, backoff);

    if (sess.reconnectTimer.unref) sess.reconnectTimer.unref();
  };

  /* ═══════════════════════════════════════════════════════════
     SOCKET.IO CONNECTION HANDLING
   ═══════════════════════════════════════════════════════════ */
  io.on('connection', socket => {
    // Send current lifetime stats IMMEDIATELY to everyone (stats are global)
    socket.emit('lifetimeStats', { ...lts });

    socket.on('initSession', (sid: string) => {
      socket.join(sid);
      const s = getSession(sid);
      socket.emit('sessionStatus', {
        isRunning: s.running,
        config: s.config && s.config.token ? { ...s.config, token: '***redacted***' } : null,
        botTag: s.botTag,
        reconnectAttempts: s.reconnectAttempts,
        isReconnecting: s.isReconnecting,
      });
    });

    socket.on('stopBot', (sid: string) => {
      const s = getSession(sid);
      s.destroyed = true;
      emit(sid, 'Session terminated.', 'error');
      logActivity('bot_stop', `Session stopped (${s.botTag || 'unknown'})`, s.ownerName || undefined);
      fullDestroy(s);
      s.clicked.clear();
      s.clickedCustomIds.clear();
      sessions.delete(sid);
      setActiveToken(null);  // clear cached token — no more clicks after stop
      io.to(sid).emit('sessionStatus', { isRunning: false, config: null });
    });

    socket.on('launchBot', async (data: {
      sessionId: string; token: string; targetId?: string; keyword?: string;
      targets?: TargetConfig[];
      threadConfig?: ThreadConfigItem[]; ownerName?: string;
    }) => {
      const { sessionId: sid, token, targetId, keyword, targets, threadConfig, ownerName } = data;

      // Input validation
      if (!token || typeof token !== 'string' || token.length < 10) { emit(sid, 'Invalid token provided.', 'error'); return; }

      // Build targets list: prefer `targets` array, fall back to legacy single-target
      let finalTargets: TargetConfig[] = [];
      if (Array.isArray(targets) && targets.length > 0) {
        finalTargets = targets.filter(t => t.targetId && t.keyword);
      } else if (targetId && keyword) {
        finalTargets = [{ targetId, keyword }];
      }
      if (finalTargets.length === 0) {
        emit(sid, 'At least one target with keyword is required.', 'error');
        return;
      }

      const sess = getSession(sid);

      // Full cleanup of any previous session
      fullDestroy(sess);
      sess.destroyed = false;
      sess.ownerName = ownerName || '';

      const defaultThreads: ThreadConfigItem[] = [
        { delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 1 }, { delayMs: 1 }
      ];
      sess.config  = {
        token,
        targetId: targetId || finalTargets[0].targetId,         // backwards-compat
        keyword:  keyword  || finalTargets[0].keyword,           // backwards-compat
        targets:  finalTargets,
        threadConfig: threadConfig && threadConfig.length > 0 ? threadConfig : defaultThreads
      };
      sess.clicked.clear();
      sess.clickedCustomIds.clear();
      sess.keywordStats.clear();
      sess.targetStartTimes.clear();
      sess.detectionCount = 0;
      sess.reconnectAttempts = 0;
      sess.isReconnecting = false;
      sess.createdAt = Date.now();
      sess.lastDetectionAt = 0;
      // Initialize per-target start times
      finalTargets.forEach(t => sess.targetStartTimes.set(t.targetId, Date.now()));

      try {
        emit(sid, 'Authenticating…', 'info');
        io.to(sid).emit('authProgress', { stage: 'login', message: 'Connecting to Discord gateway…' });
        const targetSummary = finalTargets.length === 1
          ? `target: ${finalTargets[0].targetId}, keyword: ${finalTargets[0].keyword}`
          : `${finalTargets.length} targets`;
        logActivity('bot_start', `Bot session starting (${targetSummary})`, ownerName || undefined);
        const client = createBotClient(sid, sess);

        // ── Login with retry — if first attempt fails, retry once after 1s ──
        const attemptLogin = async (attemptNum: number): Promise<void> => {
          try {
            // Cache token globally so rawClick can use it for direct HTTP fetch()
            // (bypasses discord.js library throttling for truly parallel clicks)
            setActiveToken(token);
            const loginPromise = client.login(token);
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Login timed out after ${LOGIN_TIMEOUT_MS/1000}s`)), LOGIN_TIMEOUT_MS)
            );
            await Promise.race([loginPromise, timeoutPromise]);
          } catch (e: any) {
            if (attemptNum < 2) {
              emit(sid, `↻ Login attempt ${attemptNum} failed, retrying… (${e?.message || 'unknown'})`, 'info');
              io.to(sid).emit('authProgress', { stage: 'retry', message: `Retrying login (attempt ${attemptNum + 1})…` });
              await new Promise(r => setTimeout(r, 1000));
              return attemptLogin(attemptNum + 1);
            }
            throw e;
          }
        };

        await attemptLogin(1);
        // 'ready' event will fire and emit the success log + sessionStatus
      } catch (e: any) {
        emit(sid, `Auth failed: ${e?.message ?? 'Check your token'}`, 'error');
        io.to(sid).emit('authProgress', { stage: 'failed', message: e?.message ?? 'Check your token' });
        logActivity('error', `Bot auth failed: ${e?.message ?? 'unknown'}`);
        sess.running = false;
        io.to(sid).emit('sessionStatus', { isRunning: false, config: null });
      }
    });

    // ── Test click — simulates a fake MESSAGE_CREATE packet to verify thread config ──
    socket.on('testClick', (data: { sessionId: string; targetId: string; keyword: string }) => {
      const { sessionId: sid, targetId, keyword } = data;
      const sess = getSession(sid);
      if (!sess.client || !sess.running) {
        emit(sid, 'Cannot test — bot is not running.', 'error');
        return;
      }
      // Emit a fake raw packet that the click engine will pick up
      const fakePacket = {
        t: 'MESSAGE_CREATE',
        d: {
          id: 'test_' + Date.now(),
          channel_id: '123',
          author: { id: targetId },
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: keyword + ' (TEST)',
              custom_id: 'test_click_' + Date.now(),
            }],
          }],
          flags: 0,
        },
      };
      emit(sid, `▶ TEST CLICK — simulating "${keyword}" button`, 'info');
      // Fire the fake packet through the raw handler
      (sess.client as any).emit('raw', fakePacket);
    });
  });

  // ── GLOBAL STATS BROADCAST every 30s — guarantees all clients see same stats ──
  setInterval(() => {
    io.emit('lifetimeStats', { ...lts });
  }, 30_000);

  /* ═══════════════════════════════════════════════════════════
     MEMORY MONITOR + AUTO CACHE CLEAR
     - Tracks RSS memory every 10 seconds
     - Broadcasts live memory data to all admin sockets via 'memoryUpdate'
     - When memory > 70% of limit (≈358 MB of 512), triggers aggressive cleanup
     - When memory > 85% (≈435 MB), forces GC if --expose-gc is enabled
     - Auto-clears: clicked Sets, clickedCustomIds Maps, expired sessions,
       activity log overflow, socket.io rooms with no clients
   ═══════════════════════════════════════════════════════════ */
  const MEMORY_LIMIT_MB       = 512;                                  // Render free tier
  const MEMORY_WARN_PCT       = 0.70;                                 // yellow
  const MEMORY_CRITICAL_PCT   = 0.85;                                 // red
  const MEMORY_FORCE_GC_PCT   = 0.92;                                 // force GC if available

  interface MemorySnapshot {
    rss: number; heapUsed: number; heapTotal: number; external: number;
    arrayBuffers: number;
    rssMb: number; heapUsedMb: number; heapTotalMb: number;
    limitMb: number;
    pct: number;            // rss / limit
    status: 'ok' | 'warn' | 'critical' | 'danger';
    uptime: number;
    sessions: number;
    ts: number;
  }

  let lastMemorySnapshot: MemorySnapshot | null = null;
  let memoryHistory: { ts: number; rssMb: number; pct: number }[] = [];
  let lastCleanupAt = 0;
  let totalCleanupsRun = 0;
  let totalGcRuns = 0;

  const takeMemorySnapshot = (): MemorySnapshot => {
    const m = process.memoryUsage();
    const rssMb = Math.round(m.rss / 1024 / 1024);
    const heapUsedMb = Math.round(m.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(m.heapTotal / 1024 / 1024);
    const pct = rssMb / MEMORY_LIMIT_MB;
    let status: MemorySnapshot['status'] = 'ok';
    if (pct >= MEMORY_FORCE_GC_PCT) status = 'danger';
    else if (pct >= MEMORY_CRITICAL_PCT) status = 'critical';
    else if (pct >= MEMORY_WARN_PCT) status = 'warn';
    return {
      rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal,
      external: m.external, arrayBuffers: m.arrayBuffers,
      rssMb, heapUsedMb, heapTotalMb,
      limitMb: MEMORY_LIMIT_MB, pct,
      status,
      uptime: Math.floor(process.uptime()),
      sessions: sessions.size,
      ts: Date.now(),
    };
  };

  // Aggressive but safe cache cleanup — frees memory without losing data
  const runCacheCleanup = (reason: string): { freed: number; details: string[] } => {
    const before = process.memoryUsage().rss;
    const details: string[] = [];

    // 1. Trim every session's clicked Set to last 30 entries
    let clickedTrimmed = 0;
    for (const [sid, sess] of sessions.entries()) {
      if (sess.clicked.size > 50) {
        const arr = [...sess.clicked];
        sess.clicked = new Set(arr.slice(arr.length - 30));
        clickedTrimmed += arr.length - sess.clicked.size;
      }
      // 2. Clear clickedCustomIds older than 30 seconds (was 45s)
      const now = Date.now();
      for (const [cid, time] of sess.clickedCustomIds.entries()) {
        if (now - time > 30000) sess.clickedCustomIds.delete(cid);
      }
    }
    if (clickedTrimmed > 0) details.push(`clicked sets -${clickedTrimmed}`);

    // 3. Cap activity log to last 100 entries (was 300) under memory pressure
    if (activityLog.length > 100) {
      const removed = activityLog.length - 100;
      activityLog = activityLog.slice(-100);
      details.push(`activity log -${removed}`);
      try { writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog)); } catch {}
    }

    // 4. Force-close zombie sessions (not running, not reconnecting, no timer)
    let zombiesCleared = 0;
    for (const [sid, sess] of sessions.entries()) {
      if (!sess.running && !sess.isReconnecting && !sess.reconnectTimer) {
        fullDestroy(sess);
        sessions.delete(sid);
        zombiesCleared++;
      }
    }
    if (zombiesCleared > 0) details.push(`zombie sessions -${zombiesCleared}`);

    // 5. Trim memory history to last 60 samples (10 minutes)
    if (memoryHistory.length > 60) {
      const removed = memoryHistory.length - 60;
      memoryHistory = memoryHistory.slice(-60);
      details.push(`memory history -${removed}`);
    }

    // 6. Force GC if available (requires --expose-gc flag in NODE_OPTIONS)
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); totalGcRuns++; details.push('GC forced'); } catch {}
    }

    const after = process.memoryUsage().rss;
    const freed = Math.max(0, Math.round((before - after) / 1024 / 1024));
    totalCleanupsRun++;
    lastCleanupAt = Date.now();
    console.log(`[MEMORY] Cleanup (${reason}) freed ${freed}MB · ${details.join(', ') || 'no trim needed'}`);
    return { freed, details };
  };

  // ── Memory monitor interval — every 10 seconds ──
  setInterval(() => {
    try {
      const snap = takeMemorySnapshot();
      lastMemorySnapshot = snap;

      // Track history (rolling 10 min)
      memoryHistory.push({ ts: snap.ts, rssMb: snap.rssMb, pct: snap.pct });
      if (memoryHistory.length > 60) memoryHistory = memoryHistory.slice(-60);

      // Broadcast to all admin sockets
      io.emit('memoryUpdate', {
        ...snap,
        history: memoryHistory.slice(-30),
        lastCleanupAt,
        totalCleanupsRun,
        totalGcRuns,
      });

      // Auto-trigger cleanup based on thresholds
      if (snap.pct >= MEMORY_FORCE_GC_PCT) {
        runCacheCleanup(`danger ${Math.round(snap.pct * 100)}%`);
        // 🚨 DANGER: send webhook + auto-restart
        sendWebhook(
          '🚨 Memory Critical — Auto-Restart Imminent',
          `Memory at **${snap.rssMb}MB / ${snap.limitMb}MB (${Math.round(snap.pct * 100)}%)**.\nCleanup ran but usage is still dangerous.\n${AUTO_RESTART_ON_DANGER ? 'Auto-restart triggered — service will reboot within 5 seconds.' : 'Auto-restart is DISABLED. Restart manually NOW.'}`,
          0xd47575
        );
        if (AUTO_RESTART_ON_DANGER) {
          // Graceful shutdown — Render will auto-restart the process
          setTimeout(() => {
            console.log('[MEMORY] Auto-restart triggered — graceful shutdown');
            logActivity('error', `Auto-restart: memory at ${snap.rssMb}MB/${snap.limitMb}MB (${Math.round(snap.pct * 100)}%)`);
            try { writeFileSync(STATS_FILE, JSON.stringify(lts)); } catch {}
            try { writeFileSync(ACCESS_FILE, JSON.stringify(accessList)); } catch {}
            try { writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog)); } catch {}
            process.exit(1);
          }, 5000);
        }
      } else if (snap.pct >= MEMORY_CRITICAL_PCT) {
        runCacheCleanup(`critical ${Math.round(snap.pct * 100)}%`);
        // ⚠️ CRITICAL: send webhook
        sendWebhook(
          '⚠️ Memory High — Clear Soon',
          `Memory at **${snap.rssMb}MB / ${snap.limitMb}MB (${Math.round(snap.pct * 100)}%)**.\nCleanup ran. Consider restarting the service soon to avoid OOM.`,
          0xc8aa6e
        );
      } else if (snap.pct >= MEMORY_WARN_PCT) {
        // Only run warn-level cleanup if last cleanup was > 60s ago
        if (Date.now() - lastCleanupAt > 60_000) {
          runCacheCleanup(`warn ${Math.round(snap.pct * 100)}%`);
        }
      }
    } catch (e: any) {
      console.error('[MEMORY] Monitor error:', e?.message || e);
    }
  }, 10_000);

  // ── Admin: memory endpoint (detailed snapshot + history) ──
  app.get('/api/admin/memory', ownerOnly, (_req, res) => {
    const snap = lastMemorySnapshot || takeMemorySnapshot();
    res.json({
      current: snap,
      history: memoryHistory.slice(-60),
      limitMb: MEMORY_LIMIT_MB,
      warnPct: MEMORY_WARN_PCT,
      criticalPct: MEMORY_CRITICAL_PCT,
      forceGcPct: MEMORY_FORCE_GC_PCT,
      lastCleanupAt,
      totalCleanupsRun,
      totalGcRuns,
      gcAvailable: typeof (global as any).gc === 'function',
      uptime: Math.floor(process.uptime()),
    });
  });

  // ── Admin: manual cache clear ──
  app.post('/api/admin/memory/clear', ownerOnly, (req, res) => {
    const aggressive = req.body?.aggressive === true;
    const reason = aggressive ? 'manual aggressive' : 'manual';
    const result = runCacheCleanup(reason);
    logActivity('admin_action', `Manual memory cleanup: freed ${result.freed}MB (${result.details.join(', ') || 'no trim'})`);
    const snap = takeMemorySnapshot();
    res.json({ ok: true, ...result, current: snap });
  });

  // ── Token validation (Step 1) — verifies token via Discord API ──
  app.post('/api/validate-token', async (req, res) => {
    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ valid: false, error: 'Token too short' }) as any;
    }
    try {
      const r = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { 'Authorization': token },
      });
      if (r.status === 200) {
        const data = await r.json() as any;
        return res.json({
          valid: true,
          username: data.username,
          discriminator: data.discriminator,
          id: data.id,
        });
      } else if (r.status === 401) {
        return res.json({ valid: false, error: 'Invalid token' });
      } else {
        return res.json({ valid: false, error: `Discord returned ${r.status}` });
      }
    } catch (e: any) {
      return res.status(500).json({ valid: false, error: e?.message || 'Network error' }) as any;
    }
  });

  // ── Latency check — measures round-trip to Discord's gateway ──
  app.get('/api/latency-check', async (_req, res) => {
    const t0 = Date.now();
    try {
      const r = await fetch('https://discord.com/api/v9/gateway');
      const elapsed = Date.now() - t0;
      if (r.ok) {
        return res.json({ ok: true, latencyMs: elapsed });
      }
      return res.status(502).json({ ok: false, error: `Discord returned ${r.status}` }) as any;
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'Network error' }) as any;
    }
  });

  // ── Admin: broadcast message to all connected clients ──
  app.post('/api/admin/broadcast', ownerOnly, (req, res) => {
    const { message, severity } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message required' }) as any;
    }
    const sev = ['info', 'warn', 'critical'].includes(severity) ? severity : 'info';
    io.emit('broadcast', { message, severity: sev, ts: Date.now() });
    logActivity('admin_action', `Broadcast (${sev}): ${message.slice(0, 80)}`);
    res.json({ ok: true });
  });

  // ── Admin: clear broadcast ──
  app.post('/api/admin/broadcast/clear', ownerOnly, (_req, res) => {
    io.emit('broadcast', { message: '', severity: 'info', ts: Date.now() });
    res.json({ ok: true });
  });

  // ── Admin: per-user resource usage ──
  app.get('/api/admin/users-usage', ownerOnly, (_req, res) => {
    const usage: any[] = [];
    for (const [sid, sess] of sessions.entries()) {
      if (!sess.running && !sess.isReconnecting) continue;
      const uptime = Math.floor((Date.now() - sess.createdAt) / 1000);
      const lastDetAgo = sess.lastDetectionAt > 0
        ? Math.floor((Date.now() - sess.lastDetectionAt) / 1000)
        : null;
      usage.push({
        sessionId: sid,
        ownerName: sess.ownerName || '(unknown)',
        botTag: sess.botTag,
        running: sess.running,
        isReconnecting: sess.isReconnecting,
        uptime,
        detectionCount: sess.detectionCount,
        lastDetectionAgo: lastDetAgo,
        targetCount: sess.config.targets?.length || (sess.config.targetId ? 1 : 0),
        reconnectAttempts: sess.reconnectAttempts,
        keywordStats: Array.from(sess.keywordStats.entries()).map(([k, v]) => ({ keyword: k, ...v })),
      });
    }
    res.json({ users: usage, total: usage.length });
  });

  // ── Admin: server config (webhook URL status, auto-restart status) ──
  app.get('/api/admin/server-config', ownerOnly, (_req, res) => {
    res.json({
      webhookConfigured: !!DISCORD_WEBHOOK_URL,
      webhookUrlPreview: DISCORD_WEBHOOK_URL ? DISCORD_WEBHOOK_URL.slice(0, 50) + '...' : '',
      autoRestartEnabled: AUTO_RESTART_ON_DANGER,
      memoryLimitMb: 512,
      nodeVersion: process.version,
      platform: process.platform,
    });
  });

  // ── Admin: auto-kill idle sessions (manual trigger) ──
  app.post('/api/admin/kill-idle', ownerOnly, (req, res) => {
    const idleMinutes = Math.max(1, parseInt(req.body?.minutes) || 360); // default 6h
    const idleMs = idleMinutes * 60 * 1000;
    let killed = 0;
    for (const [sid, sess] of sessions.entries()) {
      if (!sess.running) continue;
      const idleTime = sess.lastDetectionAt > 0
        ? Date.now() - sess.lastDetectionAt
        : Date.now() - sess.createdAt;
      if (idleTime > idleMs && sess.detectionCount === 0) {
        sess.destroyed = true;
        emit(sid, `Session auto-killed by admin (idle ${Math.floor(idleTime/60000)}min, 0 detections).`, 'error');
        fullDestroy(sess);
        sess.clicked.clear();
        sess.clickedCustomIds.clear();
        sessions.delete(sid);
        killed++;
      }
    }
    logActivity('admin_action', `Auto-kill idle (>${idleMinutes}min): ${killed} sessions terminated`);
    res.json({ ok: true, killed });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist, { maxAge: '1y', etag: false }));
    app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Graceful shutdown — flush all dirty data before exit
  const gracefulShutdown = (signal: string) => {
    console.log(`\n[SHUTDOWN] ${signal} received. Flushing data...`);
    logActivity('server', `Server shutdown: ${signal}`);
    try { writeFileSync(STATS_FILE, JSON.stringify(lts)); } catch {}
    try { writeFileSync(ACCESS_FILE, JSON.stringify(accessList)); } catch {}
    try { writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog)); } catch {}
    setTimeout(() => {
      console.log('[SHUTDOWN] Done. Exiting.');
      process.exit(0);
    }, 500);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ⚡  The First Signer — http://localhost:${PORT}`);
    console.log(`  🔑  Owner Key: ${process.env.OWNER_KEY ? '***env***' : OWNER_KEY.slice(0,4) + '***'}\n`);
    logActivity('server', 'Server started');
  });
}

// ── Crash protection — prevent the process from dying silently ──
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception (process NOT killed):', err.message);
  console.error(err.stack);
  try { logActivity('error', `Uncaught exception: ${err.message}`); } catch {}
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[FATAL] Unhandled rejection (process NOT killed):', reason?.message || reason);
  try { logActivity('error', `Unhandled rejection: ${reason?.message || reason}`); } catch {}
});

startServer().catch(e => {
  console.error('[STARTUP] Fatal error:', e);
  process.exit(1);
});
