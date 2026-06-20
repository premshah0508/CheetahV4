import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";

type LT = 'info' | 'success' | 'error';
interface LogEntry      { id: string; ts: string; msg: string; type: LT }
interface LifetimeStats { det: number; del: number; fail: number; best: number | null }
interface AuthInfo      { role: 'owner' | 'user'; name: string; ownerKey?: string }
interface ThreadConfigItem { delayMs: number; }
interface AccessEntry   {
  id: string; name: string; discord: string;
  requestedAt: string; status: 'pending' | 'approved' | 'rejected';
}
interface HeartbeatInfo {
  alive: boolean;
  lastPacketAgo: number;
  reconnectAttempts: number;
  wsStatus: string;
  timestamp: number;
}

/* ════════════════════════════════════════
   ICONS
════════════════════════════════════════ */
const IKey    = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>);
const ITgt    = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>);
const IHash   = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>);
const IArrow  = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>);
const ICheck  = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>);
const IZap    = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>);
const IPow    = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>);
const IAlert  = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>);
const IBot    = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M12 2a3 3 0 0 1 3 3v6H9V5a3 3 0 0 1 3-3z"/><circle cx="8.5" cy="16.5" r="1"/><circle cx="15.5" cy="16.5" r="1"/></svg>);
const ICopy   = () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>);
const ITrash  = () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>);
const IUser   = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const ILoader = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>);
const IShield = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const ILogout = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
const IHeart  = () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>);
const IBack   = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>);
const IPulse  = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>);
const IGauge  = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>);
const IDB     = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>);

const SUGGESTED_KW = ['join', 'buy', 'claim', 'mint', 'enter', 'participate', 'get', 'grab'];

/* ════════════════════════════════════════
   ANIMATED COUNTER
════════════════════════════════════════ */
function AnimatedNum({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    const diff  = value - prev.current;
    const steps = Math.min(Math.abs(diff), 12);
    let   i     = 0;
    const id    = setInterval(() => {
      i++;
      setDisplay(Math.round(prev.current + (diff * i) / steps));
      if (i >= steps) { clearInterval(id); prev.current = value; }
    }, 30);
    return () => clearInterval(id);
  }, [value]);
  return <>{display}</>;
}

/* ════════════════════════════════════════
   LIVE CLOCK
════════════════════════════════════════ */
function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setT(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <>{t}</>;
}

/* ════════════════════════════════════════
   INPUT FIELD
════════════════════════════════════════ */
function Field({ label, icon, value, onChange, placeholder, type = 'text', filled, onEnter }: {
  label: string; icon: React.ReactNode; value: string;
  onChange: (v: string) => void; placeholder: string;
  type?: string; filled?: boolean; onEnter?: () => void;
}) {
  return (
    <div className="field-group">
      <div className="field-label">
        {icon} {label}
        {filled && <span className="field-filled-badge"><ICheck/> Saved</span>}
      </div>
      <input
        className="field-input" type={type} value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder} autoComplete="off" spellCheck={false}
      />
    </div>
  );
}

/* ════════════════════════════════════════
   SPARK LINE  (warm gold tone)
════════════════════════════════════════ */
function SparkLine({ data, color = 'gold' }: { data: number[]; color?: 'gold' | 'sage' | 'rose' }) {
  const gradId = useMemo(() => 'sg_' + Math.random().toString(36).slice(2, 8), []);
  if (data.length < 2) return null;
  const w = 120, h = 28, pad = 2;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const stroke = color === 'sage' ? 'rgba(124,200,124,0.6)' : color === 'rose' ? 'rgba(212,117,117,0.6)' : 'rgba(200,170,110,0.6)';
  const fillTop = color === 'sage' ? 'rgba(124,200,124,0.15)' : color === 'rose' ? 'rgba(212,117,117,0.15)' : 'rgba(200,170,110,0.15)';
  const fillBot = color === 'sage' ? 'rgba(124,200,124,0)' : color === 'rose' ? 'rgba(212,117,117,0)' : 'rgba(200,170,110,0)';

  return (
    <svg width={w} height={h} className="spark-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points={`${pad},${h} ${pts} ${w-pad},${h}`} fill={`url(#${gradId})`} stroke="none"/>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop}/>
          <stop offset="100%" stopColor={fillBot}/>
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ════════════════════════════════════════
   GATE SCREEN
════════════════════════════════════════ */
function GateScreen({ onAuth }: { onAuth: (info: AuthInfo) => void }) {
  const [tab,       setTab]       = useState<'signin' | 'request' | 'admin'>('signin');
  const [siName,    setSiName]    = useState('');
  const [siPass,    setSiPass]    = useState('');
  const [siErr,     setSiErr]     = useState('');
  const [siLoading, setSiLoading] = useState(false);
  const [rqName,    setRqName]    = useState('');
  const [rqDiscord, setRqDiscord] = useState('');
  const [rqPass,    setRqPass]    = useState('');
  const [rqErr,     setRqErr]     = useState('');
  const [rqLoading, setRqLoading] = useState(false);
  const [rqDone,    setRqDone]    = useState(false);
  const [adPass,    setAdPass]    = useState('');
  const [adErr,     setAdErr]     = useState('');
  const [adLoading, setAdLoading] = useState(false);

  const handleSignIn = async () => {
    if (!siName.trim() || !siPass.trim()) { setSiErr('Please fill in both fields.'); return; }
    setSiLoading(true); setSiErr('');
    try {
      const res  = await fetch('/api/gate/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siName.trim(), password: siPass }),
      });
      const data = await res.json();
      if (!res.ok) { setSiErr(data.error || 'Sign in failed.'); }
      else { onAuth({ role: data.role, name: data.name, ownerKey: data.role === 'owner' ? siPass : undefined }); }
    } catch { setSiErr('Network error. Please try again.'); }
    setSiLoading(false);
  };

  const handleRequest = async () => {
    if (!rqName.trim() || !rqPass.trim()) { setRqErr('Name and password are required.'); return; }
    setRqLoading(true); setRqErr('');
    try {
      const res  = await fetch('/api/gate/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rqName.trim(), discord: rqDiscord.trim(), password: rqPass }),
      });
      const data = await res.json();
      if (!res.ok) { setRqErr(data.error || 'Request failed.'); }
      else { setRqDone(true); }
    } catch { setRqErr('Network error. Please try again.'); }
    setRqLoading(false);
  };

  const handleAdmin = async () => {
    if (!adPass.trim()) { setAdErr('Password is required.'); return; }
    setAdLoading(true); setAdErr('');
    try {
      const res  = await fetch('/api/gate/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adPass, isAdmin: true }),
      });
      const data = await res.json();
      if (!res.ok) { setAdErr(data.error || 'Admin login failed.'); }
      else { onAuth({ role: 'owner', name: 'Owner', ownerKey: adPass }); }
    } catch { setAdErr('Network error. Please try again.'); }
    setAdLoading(false);
  };

  return (
    <>
      <div className="scene-bg"/>
      <div className="dot-grid"/>
      <div className="bg-orb bg-orb-1"/>
      <div className="bg-orb bg-orb-2"/>

      <div className="gate-overlay">
        <motion.div
          className="gate-card"
          initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.22,1,0.36,1] } }}
        >
          <div className="fc-top-line"/>

          <div className="gate-brand">
            <div className="gate-brand-icon"><IBot/></div>
            <div>
              <div className="gate-brand-title">The First Signer</div>
              <div className="gate-brand-sub">ACCESS GATE · ELITE</div>
            </div>
          </div>

          <div className="gate-tabs">
            <button
              className={`gate-tab${tab === 'signin' ? ' active' : ''}`}
              onClick={() => { setTab('signin'); setSiErr(''); }}
            >Sign In</button>
            <button
              className={`gate-tab${tab === 'request' ? ' active' : ''}`}
              onClick={() => { setTab('request'); setRqErr(''); }}
            >Request Access</button>
            <button
              className={`gate-tab${tab === 'admin' ? ' active' : ''}`}
              onClick={() => { setTab('admin'); setAdErr(''); }}
            >Admin</button>
          </div>

          <AnimatePresence mode="wait">
            {tab === 'signin' && (
              <motion.div key="si"
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}
              >
                <Field label="Name" icon={<IUser/>} value={siName} onChange={setSiName}
                  placeholder="Your name" onEnter={handleSignIn}/>
                <Field label="Password" icon={<IKey/>} value={siPass} onChange={setSiPass}
                  placeholder="Your password" type="password" onEnter={handleSignIn}/>
                {siErr && <div className="warn-box gate-err"><IAlert/> {siErr}</div>}
                <button className="btn btn-primary fw gate-submit" onClick={handleSignIn} disabled={siLoading}>
                  {siLoading ? <><ILoader/> Verifying…</> : <>Sign In <IArrow/></>}
                </button>
                <div className="enter-hint">or press <kbd>Enter</kbd> to sign in</div>
              </motion.div>
            )}

            {tab === 'request' && (
              <motion.div key="rq"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}
              >
                {rqDone ? (
                  <div className="gate-success-wrap">
                    <div className="gate-success-icon">✓</div>
                    <div className="gate-success-title">Request Submitted</div>
                    <div className="gate-success-sub">
                      The owner will review your request. Once approved, come back and Sign In with your name and password.
                    </div>
                    <button className="btn btn-ghost fw" style={{ marginTop: 20 }}
                      onClick={() => { setTab('signin'); setRqDone(false); }}>
                      Go to Sign In
                    </button>
                  </div>
                ) : (
                  <>
                    <Field label="Your Name" icon={<IUser/>} value={rqName} onChange={setRqName}
                      placeholder="e.g. Alex" onEnter={handleRequest}/>
                    <Field label="Discord Username" icon={<IHash/>} value={rqDiscord} onChange={setRqDiscord}
                      placeholder="e.g. alex.123 (optional)" onEnter={handleRequest}/>
                    <Field label="Set a Password" icon={<IKey/>} value={rqPass} onChange={setRqPass}
                      placeholder="You'll use this to sign in later" type="password" onEnter={handleRequest}/>
                    {rqErr && <div className="warn-box gate-err"><IAlert/> {rqErr}</div>}
                    <button className="btn btn-primary fw gate-submit" onClick={handleRequest} disabled={rqLoading}>
                      {rqLoading ? <><ILoader/> Submitting…</> : 'Submit Request'}
                    </button>
                    <div className="enter-hint">Owner approval required before access is granted</div>
                  </>
                )}
              </motion.div>
            )}

            {tab === 'admin' && (
              <motion.div key="ad"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}
              >
                <Field label="Admin Password" icon={<IKey/>} value={adPass} onChange={setAdPass}
                  placeholder="Master key" type="password" onEnter={handleAdmin}/>
                {adErr && <div className="warn-box gate-err"><IAlert/> {adErr}</div>}
                <button className="btn btn-primary fw gate-submit" onClick={handleAdmin} disabled={adLoading}>
                  {adLoading ? <><ILoader/> Verifying…</> : <>Admin Login <IArrow/></>}
                </button>
                <div className="enter-hint">Reserved for owner access only</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════
   ADMIN PANEL — Enhanced with Database, Sessions, Activity Log
════════════════════════════════════════ */
interface ActivityEntry { id: string; ts: string; type: string; detail: string; user?: string; }
interface SessionInfo { id: string; running: boolean; isReconnecting: boolean; reconnectAttempts: number; botTag: string; lastPacketAgo: number | null; config: { targetId: string; keyword: string; threads: number } | null; }
interface DbData { stats: LifetimeStats; users: { total: number; pending: number; approved: number; rejected: number }; sessions: { total: number; active: number }; activity: { total: number; recent: ActivityEntry[] }; uptime: number; memoryMb?: number; }

/* ════════════════════════════════════════
   MEMORY SNAPSHOT TYPES (admin only)
════════════════════════════════════════ */
interface MemorySnapshot {
  rssMb: number; heapUsedMb: number; heapTotalMb: number;
  limitMb: number; pct: number;
  status: 'ok' | 'warn' | 'critical' | 'danger';
  uptime: number; sessions: number; ts: number;
}
interface MemoryState {
  current: MemorySnapshot;
  history: { ts: number; rssMb: number; pct: number }[];
  limitMb: number;
  warnPct: number; criticalPct: number; forceGcPct: number;
  lastCleanupAt: number;
  totalCleanupsRun: number;
  totalGcRuns: number;
  gcAvailable: boolean;
  uptime: number;
}

/* ════════════════════════════════════════
   LIVE MEMORY MONITOR  (admin-only, always visible)
   - Top-of-panel widget that shows live Render memory usage
   - Color-coded progress bar (sage / amber / rose)
   - 30-sample sparkline of RSS memory over the last 5 minutes
   - Manual "Clear Cache" button that triggers server-side cleanup
   - Auto-receives updates via socket.io 'memoryUpdate' event
════════════════════════════════════════ */
function LiveMemoryMonitor({ ownerKey }: { ownerKey: string }) {
  const [mem, setMem] = useState<MemoryState | null>(null);
  const [clearing, setClearing] = useState(false);
  const [lastCleared, setLastCleared] = useState<{ freed: number; details: string[] } | null>(null);
  const sockRef = useRef<Socket | null>(null);

  // Fetch initial snapshot
  const fetchMem = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/memory', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) setMem(await res.json());
    } catch {}
  }, [ownerKey]);

  useEffect(() => {
    fetchMem();
    // Listen for live updates via socket.io
    const s = io();
    sockRef.current = s;
    s.on('memoryUpdate', (data: any) => {
      setMem(prev => ({
        ...(prev || { limitMb: 512, warnPct: 0.7, criticalPct: 0.85, forceGcPct: 0.92, gcAvailable: false, lastCleanupAt: 0, totalCleanupsRun: 0, totalGcRuns: 0, uptime: 0, history: [] }),
        current: {
          rssMb: data.rssMb,
          heapUsedMb: data.heapUsedMb,
          heapTotalMb: data.heapTotalMb,
          limitMb: data.limitMb,
          pct: data.pct,
          status: data.status,
          uptime: data.uptime,
          sessions: data.sessions,
          ts: data.ts,
        },
        history: data.history || [],
        lastCleanupAt: data.lastCleanupAt,
        totalCleanupsRun: data.totalCleanupsRun,
        totalGcRuns: data.totalGcRuns,
        limitMb: data.limitMb,
        uptime: data.uptime,
      }));
    });
    // Refresh every 15s as fallback (socket updates come every 10s)
    const id = setInterval(fetchMem, 15000);
    return () => { clearInterval(id); s.disconnect(); };
  }, [fetchMem]);

  const handleClear = async (aggressive: boolean) => {
    setClearing(true);
    try {
      const res = await fetch('/api/admin/memory/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-owner-key': ownerKey },
        body: JSON.stringify({ aggressive }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastCleared({ freed: data.freed, details: data.details });
        setTimeout(() => setLastCleared(null), 4000);
        fetchMem();
      }
    } catch {}
    setClearing(false);
  };

  if (!mem) {
    return (
      <div className="mem-monitor loading">
        <div className="mem-head">
          <IDB/>
          <span className="mem-title">Live Render Memory</span>
          <span className="mem-status loading">Loading…</span>
        </div>
      </div>
    );
  }

  const pct = Math.round(mem.current.pct * 100);
  const status = mem.current.status;
  const statusLabel = status === 'ok' ? 'Healthy' : status === 'warn' ? 'Elevated' : status === 'critical' ? 'High — Clear Soon' : 'Critical — Restart Risk';
  const statusColor = status === 'ok' ? '#7cc87c' : status === 'warn' ? '#c8aa6e' : '#d47575';

  // Build sparkline data from history
  const sparkData = mem.history.length >= 2
    ? mem.history.map(h => h.rssMb)
    : [];

  // Time since last cleanup
  const cleanupAgo = mem.lastCleanupAt > 0
    ? Math.round((Date.now() - mem.lastCleanupAt) / 1000)
    : null;

  return (
    <motion.div
      className={`mem-monitor ${status}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mem-head">
        <IDB/>
        <span className="mem-title">Live Render Memory</span>
        <span className="mem-status" style={{ color: statusColor }}>{statusLabel}</span>
      </div>

      <div className="mem-stats-row">
        <div className="mem-stat">
          <span className="mem-stat-val" style={{ color: statusColor }}>
            {mem.current.rssMb}<span className="mem-stat-unit">MB</span>
          </span>
          <span className="mem-stat-label">Used</span>
        </div>
        <div className="mem-stat">
          <span className="mem-stat-val">{mem.limitMb}<span className="mem-stat-unit">MB</span></span>
          <span className="mem-stat-label">Limit</span>
        </div>
        <div className="mem-stat">
          <span className="mem-stat-val">{pct}<span className="mem-stat-unit">%</span></span>
          <span className="mem-stat-label">Used</span>
        </div>
        <div className="mem-stat">
          <span className="mem-stat-val">{mem.current.heapUsedMb}<span className="mem-stat-unit">MB</span></span>
          <span className="mem-stat-label">Heap</span>
        </div>
      </div>

      <div className="mem-bar-track">
        <motion.div
          className="mem-bar-fill"
          style={{ background: statusColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Threshold markers */}
        <div className="mem-bar-marker warn"  style={{ left: `${mem.warnPct * 100}%` }}     title={`Warn at ${Math.round(mem.warnPct * 100)}%`} />
        <div className="mem-bar-marker crit"  style={{ left: `${mem.criticalPct * 100}%` }}   title={`Critical at ${Math.round(mem.criticalPct * 100)}%`} />
        <div className="mem-bar-marker danger" style={{ left: `${mem.forceGcPct * 100}%` }}   title={`Danger at ${Math.round(mem.forceGcPct * 100)}%`} />
      </div>

      <div className="mem-footer">
        <div className="mem-spark">
          {sparkData.length >= 2 && (
            <>
              <span className="mem-spark-label">RSS · 5 min</span>
              <SparkLine data={sparkData} color={status === 'ok' ? 'sage' : status === 'warn' ? 'gold' : 'rose'} />
            </>
          )}
        </div>
        <div className="mem-meta">
          {cleanupAgo !== null && (
            <span className="mem-meta-item">Last cleanup: {cleanupAgo}s ago</span>
          )}
          <span className="mem-meta-item">{mem.totalCleanupsRun} cleanups</span>
          {mem.gcAvailable && <span className="mem-meta-item">{mem.totalGcRuns} GC runs</span>}
        </div>
        <div className="mem-actions">
          {lastCleared && (
            <motion.span
              className="mem-cleared-badge"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              ✓ Freed {lastCleared.freed}MB
            </motion.span>
          )}
          <button
            className="mem-btn"
            onClick={() => handleClear(false)}
            disabled={clearing}
          >
            {clearing ? <><ILoader/> Clearing…</> : 'Clear Cache'}
          </button>
          {(status === 'critical' || status === 'danger') && (
            <button
              className="mem-btn aggressive"
              onClick={() => handleClear(true)}
              disabled={clearing}
            >
              Force GC
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AdminPanel({ ownerKey, onBack, onResetStats }: {
  ownerKey: string; onBack: () => void; onResetStats: () => void;
}) {
  const [users,       setUsers]       = useState<AccessEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [userTab,     setUserTab]     = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [section,     setSection]     = useState<'users' | 'database' | 'sessions' | 'activity' | 'broadcast' | 'serverconfig' | 'usage'>('users');
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [actFilter,   setActFilter]   = useState('all');
  const [sessionList, setSessionList] = useState<SessionInfo[]>([]);
  const [dbData,      setDbData]      = useState<DbData | null>(null);

  // NEW: Broadcast + Server Config + Users Usage state
  const [broadcastMsg,  setBroadcastMsg]  = useState('');
  const [broadcastSev,  setBroadcastSev]  = useState<'info' | 'warn' | 'critical'>('info');
  const [serverConfig,  setServerConfig]  = useState<any>(null);
  const [usageList,     setUsageList]     = useState<any[]>([]);

  const headers = { 'Content-Type': 'application/json', 'x-owner-key': ownerKey };

  // NEW: Loaders for new sections
  const loadServerConfig = async () => {
    try {
      const res = await fetch('/api/admin/server-config', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) setServerConfig(await res.json());
    } catch {}
  };
  const loadUsage = async () => {
    try {
      const res = await fetch('/api/admin/users-usage', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) {
        const data = await res.json();
        setUsageList(data.users || []);
      }
    } catch {}
  };
  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    try {
      await fetch('/api/admin/broadcast', {
        method: 'POST', headers,
        body: JSON.stringify({ message: broadcastMsg, severity: broadcastSev }),
      });
      setBroadcastMsg('');
      alert('Broadcast sent to all connected users.');
    } catch {}
  };
  const clearBroadcast = async () => {
    try {
      await fetch('/api/admin/broadcast/clear', { method: 'POST', headers });
      alert('Broadcast cleared.');
    } catch {}
  };
  const killIdleSessions = async (minutes: number) => {
    if (!confirm(`Kill all sessions idle for >${minutes}min with 0 detections?`)) return;
    try {
      const res = await fetch('/api/admin/kill-idle', {
        method: 'POST', headers,
        body: JSON.stringify({ minutes }),
      });
      const data = await res.json();
      alert(`Killed ${data.killed} idle session(s).`);
      loadUsage();
    } catch {}
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        try { localStorage.setItem('tfs_access_cache', JSON.stringify(data)); } catch {}
      }
    } catch {}
    setLoading(false);
  };

  const loadActivity = async () => {
    try {
      const res = await fetch('/api/admin/activity?limit=200', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) setActivityLog(await res.json());
    } catch {}
  };

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/admin/sessions', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) {
        const data = await res.json();
        setSessionList(data.sessions || []);
      }
    } catch {}
  };

  const loadDatabase = async () => {
    try {
      const res = await fetch('/api/admin/database', { headers: { 'x-owner-key': ownerKey } });
      if (res.ok) setDbData(await res.json());
    } catch {}
  };

  // Rehydrate access list on mount + periodic sync
  useEffect(() => {
    loadUsers();
    const syncAccess = () => {
      try {
        const cached = JSON.parse(localStorage.getItem('tfs_access_cache') || '[]');
        if (Array.isArray(cached) && cached.length > 0) {
          fetch('/api/access/sync', {
            method: 'POST', headers,
            body: JSON.stringify({ list: cached }),
          }).catch(() => {});
        }
      } catch {}
    };
    syncAccess();
    const id = setInterval(() => { loadUsers(); syncAccess(); }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (section === 'activity') loadActivity();
    if (section === 'sessions') loadSessions();
    if (section === 'database') loadDatabase();
    if (section === 'serverconfig') loadServerConfig();
    if (section === 'usage') loadUsage();
  }, [section]);

  const action = async (url: string, id: string, method = 'POST') => {
    try {
      const res = await fetch(url, { method, headers, body: JSON.stringify({ id }) });
      if (!res.ok) console.error('Admin action failed:', res.status);
      loadUsers();
    } catch (e) {
      console.error('Admin action error:', e);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return iso; }
  };

  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
  };

  const pending  = users.filter(u => u.status === 'pending');
  const approved = users.filter(u => u.status === 'approved');
  const rejected = users.filter(u => u.status === 'rejected');

  const displayed = userTab === 'pending' ? pending : userTab === 'approved' ? approved : rejected;
  const filteredActivity = actFilter === 'all' ? activityLog : activityLog.filter(a => a.type === actFilter);
  const activityTypes = ['all', ...Array.from(new Set(activityLog.map(a => a.type)))];

  const handleResetStats = async () => {
    if (!confirm('Reset ALL lifetime stats to zero? This cannot be undone.')) return;
    await fetch('/api/admin/resetStats', { method: 'POST', headers });
    onResetStats();
  };

  return (
    <div className="admin-root">
      <div className="admin-head">
        <button className="admin-back-btn" onClick={onBack}>← Back</button>
        <span className="admin-head-title"><IShield/> Owner Panel</span>
        <button className="admin-danger-btn" onClick={handleResetStats}>Reset Stats</button>
      </div>

      <div className="admin-sub-tabs">
        {([
          { key: 'users', label: 'Users', count: users.length },
          { key: 'database', label: 'Database', count: null },
          { key: 'sessions', label: 'Sessions', count: sessionList.filter(s => s.running).length || null },
          { key: 'usage', label: 'Usage', count: usageList.length || null },
          { key: 'activity', label: 'Activity Log', count: activityLog.length || null },
          { key: 'broadcast', label: 'Broadcast', count: null },
          { key: 'serverconfig', label: 'Server', count: null },
        ] as const).map(s => (
          <button key={s.key} className={`admin-sub-tab${section === s.key ? ' active' : ''}`}
            onClick={() => setSection(s.key as any)}>
            {s.label}
            {s.count !== null && <span className="tab-count">{s.count}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <button className="admin-refresh-btn" onClick={() => {
          if (section === 'users') loadUsers();
          if (section === 'activity') loadActivity();
          if (section === 'sessions') loadSessions();
          if (section === 'database') loadDatabase();
          if (section === 'serverconfig') loadServerConfig();
          if (section === 'usage') loadUsage();
        }}>↻ Refresh</button>
      </div>

      {/* ── LIVE MEMORY MONITOR — always visible at top of admin body ── */}
      <div className="admin-memory-strip">
        <LiveMemoryMonitor ownerKey={ownerKey} />
      </div>

      {/* ── USERS Section ── */}
      {section === 'users' && (<>
        <div className="admin-tab-bar">
          {(['pending','approved','rejected'] as const).map(t => (
            <button key={t} className={`admin-tab${userTab === t ? ' active' : ''}`}
              onClick={() => setUserTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className={`admin-tab-badge${t === 'pending' && pending.length > 0 ? ' hot' : ''}`}>
                {t === 'pending' ? pending.length : t === 'approved' ? approved.length : rejected.length}
              </span>
            </button>
          ))}
        </div>
        <div className="admin-body">
          {loading ? (
            <div className="admin-loading"><ILoader/> Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="admin-empty">No {userTab} requests</div>
          ) : (
            <div className="admin-list">
              {displayed.map(u => (
                <div key={u.id} className={`admin-row${u.status === 'rejected' ? ' dim' : ''}`}>
                  <div className="admin-row-avatar">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-row-info">
                    <div className="admin-row-name">{u.name}</div>
                    <div className="admin-row-meta">
                      {u.discord && <span className="admin-row-discord">@{u.discord}</span>}
                      <span className="admin-row-time">{fmtDate(u.requestedAt)}</span>
                    </div>
                  </div>
                  <div className="admin-row-actions">
                    {u.status === 'pending' && (
                      <>
                        <button className="admin-btn approve" onClick={() => action('/api/admin/approve', u.id)}>Approve</button>
                        <button className="admin-btn reject"  onClick={() => action('/api/admin/reject',  u.id)}>Reject</button>
                      </>
                    )}
                    {u.status === 'approved' && (
                      <button className="admin-btn reject" onClick={() => action('/api/admin/revoke', u.id)}>Revoke</button>
                    )}
                    {u.status === 'rejected' && (
                      <button className="admin-btn approve" onClick={() => action('/api/admin/approve', u.id)}>Re-approve</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}

      {/* ── DATABASE Section ── */}
      {section === 'database' && (
        <div className="admin-body">
          {!dbData ? (
            <div className="admin-loading"><ILoader/> Loading…</div>
          ) : (
            <>
              <div className="db-overview">
                <div className="db-card">
                  <div className="db-card-label">Total Users</div>
                  <div className="db-card-val">{dbData.users.total}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Pending</div>
                  <div className="db-card-val amber">{dbData.users.pending}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Approved</div>
                  <div className="db-card-val green">{dbData.users.approved}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Rejected</div>
                  <div className="db-card-val red">{dbData.users.rejected}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Active Sessions</div>
                  <div className="db-card-val amber">{dbData.sessions.active}</div>
                  <div className="db-card-sub">{dbData.sessions.total} total</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Server Uptime</div>
                  <div className="db-card-val">{fmtUptime(dbData.uptime)}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Memory Usage</div>
                  <div className="db-card-val">{dbData.memoryMb ?? '—'} MB</div>
                  <div className="db-card-sub">limit 512 MB</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Detected</div>
                  <div className="db-card-val">{dbData.stats.det}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Success / Failed</div>
                  <div className="db-card-val green">{dbData.stats.del} <span style={{color:'rgba(255,255,255,0.2)',fontSize:'16px'}}>/</span> <span className="db-card-val red">{dbData.stats.fail}</span></div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Best Click Time</div>
                  <div className="db-card-val">{dbData.stats.best !== null ? `${dbData.stats.best}ms` : '—'}</div>
                </div>
                <div className="db-card">
                  <div className="db-card-label">Activity Events</div>
                  <div className="db-card-val">{dbData.activity.total}</div>
                </div>
              </div>
              {dbData.activity.recent.length > 0 && (
                <>
                  <div className="db-card-label" style={{marginBottom: 8}}>Recent Activity</div>
                  <div className="activity-log">
                    {dbData.activity.recent.map(a => (
                      <div key={a.id} className={`activity-row type-${a.type}`}>
                        <span className={`activity-type-badge ${a.type}`}>{a.type.replace('_', ' ')}</span>
                        <span className="activity-detail">
                          {a.user && <span className="activity-user">{a.user} · </span>}
                          {a.detail}
                        </span>
                        <span className="activity-ts">{fmtDate(a.ts)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SESSIONS Section ── */}
      {section === 'sessions' && (
        <div className="admin-body">
          {sessionList.length === 0 ? (
            <div className="admin-empty">No active sessions</div>
          ) : (
            <div className="admin-list">
              {sessionList.map(s => (
                <div key={s.id} className="session-row">
                  <div className={`session-dot ${s.running ? (s.isReconnecting ? 'reconnecting' : 'running') : 'stopped'}`}/>
                  <div className="session-info">
                    <div className="session-tag">{s.botTag || 'Unknown Bot'}</div>
                    <div className="session-meta">
                      {s.config && <span>Target: {s.config.targetId.slice(0,8)}… · KW: "{s.config.keyword}" · {s.config.threads}T</span>}
                      {s.lastPacketAgo !== null && <span>Last packet: {s.lastPacketAgo}s ago</span>}
                      {s.reconnectAttempts > 0 && <span>Reconnects: {s.reconnectAttempts}</span>}
                    </div>
                  </div>
                  <div className="session-actions">
                    <span className={`session-badge ${s.running ? (s.isReconnecting ? 'reconnecting' : 'running') : 'stopped'}`}>
                      {s.running ? (s.isReconnecting ? 'Reconnecting' : 'Running') : 'Stopped'}
                    </span>
                    {s.running && (
                      <button className="admin-btn reject session-kill-btn" onClick={async () => {
                        if (!confirm(`Stop session for ${s.botTag || 'Unknown Bot'}?`)) return;
                        try {
                          await fetch('/api/admin/sessions/kill', {
                            method: 'POST', headers,
                            body: JSON.stringify({ sessionId: s.id }),
                          });
                          loadSessions();
                        } catch {}
                      }}>Stop</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVITY LOG Section ── */}
      {section === 'activity' && (
        <div className="admin-body">
          <div className="activity-filters">
            {activityTypes.map(t => (
              <button key={t} className={`activity-filter${actFilter === t ? ' active' : ''}`}
                onClick={() => setActFilter(t)}>
                {t === 'all' ? 'All' : String(t).replace('_', ' ')}
              </button>
            ))}
          </div>
          {filteredActivity.length === 0 ? (
            <div className="admin-empty">No activity logs{actFilter !== 'all' ? ` for "${actFilter}"` : ''}</div>
          ) : (
            <div className="activity-log">
              {filteredActivity.map(a => (
                <div key={a.id} className={`activity-row type-${a.type}`}>
                  <span className={`activity-type-badge ${a.type}`}>{a.type.replace('_', ' ')}</span>
                  <span className="activity-detail">
                    {a.user && <span className="activity-user">{a.user} · </span>}
                    {a.detail}
                  </span>
                  <span className="activity-ts">{fmtDate(a.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── NEW: USERS USAGE Section (per-user resource usage) ── */}
      {section === 'usage' && (
        <div className="admin-body">
          <div className="usage-toolbar">
            <span className="usage-info">{usageList.length} active session(s)</span>
            <button className="admin-btn approve" onClick={() => killIdleSessions(360)}>Kill Idle (6h)</button>
            <button className="admin-btn approve" onClick={() => killIdleSessions(180)}>Kill Idle (3h)</button>
            <button className="admin-btn approve" onClick={() => killIdleSessions(60)}>Kill Idle (1h)</button>
          </div>
          {usageList.length === 0 ? (
            <div className="admin-empty">No active sessions</div>
          ) : (
            <div className="admin-list">
              {usageList.map(u => (
                <div key={u.sessionId} className="usage-row">
                  <div className="usage-head">
                    <span className="usage-bot">{u.botTag || 'Unknown Bot'}</span>
                    <span className="usage-owner">@{u.ownerName}</span>
                    <span className={`usage-status ${u.running ? (u.isReconnecting ? 'reconnecting' : 'running') : 'stopped'}`}>
                      {u.running ? (u.isReconnecting ? 'Reconnecting' : 'Running') : 'Stopped'}
                    </span>
                  </div>
                  <div className="usage-meta">
                    <span>⏱ {Math.floor(u.uptime/60)}min uptime</span>
                    <span>◉ {u.detectionCount} detections</span>
                    {u.lastDetectionAgo !== null && <span>Last: {u.lastDetectionAgo}s ago</span>}
                    <span>🎯 {u.targetCount} target(s)</span>
                    {u.reconnectAttempts > 0 && <span>↻ {u.reconnectAttempts} reconnects</span>}
                  </div>
                  {u.keywordStats && u.keywordStats.length > 0 && (
                    <div className="usage-kw-list">
                      {u.keywordStats.map((k: any, i: number) => (
                        <span key={i} className="usage-kw-chip">
                          "{k.keyword}": {k.det}/{k.del}/{k.fail}
                          {k.best !== null && ` · ${k.best}ms`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── NEW: BROADCAST Section ── */}
      {section === 'broadcast' && (
        <div className="admin-body">
          <div className="broadcast-form">
            <div className="section-title" style={{fontSize: 18, marginBottom: 8}}>Broadcast Message</div>
            <div className="section-sub" style={{marginBottom: 18}}>
              Send a banner message to every connected user. They'll see it at the top of their screen
              and receive a browser notification (if enabled).
            </div>

            <div className="field-label">Message</div>
            <textarea
              className="broadcast-textarea"
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="e.g. Restarting server in 5 minutes — please save your work."
              rows={3}
              maxLength={300}
            />
            <div className="broadcast-meta">{broadcastMsg.length}/300 characters</div>

            <div className="field-label" style={{marginTop: 16}}>Severity</div>
            <div className="broadcast-sev-row">
              {(['info', 'warn', 'critical'] as const).map(s => (
                <button
                  key={s}
                  className={`broadcast-sev-btn ${broadcastSev === s ? 'active' : ''} ${s}`}
                  onClick={() => setBroadcastSev(s)}
                >
                  {s === 'info' ? '📢 Info' : s === 'warn' ? '⚠️ Warning' : '🚨 Critical'}
                </button>
              ))}
            </div>

            <div className="btn-row" style={{marginTop: 22}}>
              <button
                className="btn btn-primary"
                onClick={sendBroadcast}
                disabled={!broadcastMsg.trim()}
              >
                Send Broadcast
              </button>
              <button className="btn btn-ghost" onClick={clearBroadcast}>
                Clear Active Broadcast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW: SERVER CONFIG Section ── */}
      {section === 'serverconfig' && (
        <div className="admin-body">
          {!serverConfig ? (
            <div className="admin-loading"><ILoader/> Loading…</div>
          ) : (
            <div className="server-config-grid">
              <div className="db-card">
                <div className="db-card-label">Discord Webhook</div>
                <div className="db-card-val" style={{fontSize: 14}}>
                  {serverConfig.webhookConfigured ? '✓ Configured' : '✗ Not set'}
                </div>
                {serverConfig.webhookConfigured && (
                  <div className="db-card-sub">{serverConfig.webhookUrlPreview}</div>
                )}
                <div className="db-card-sub" style={{marginTop: 8}}>
                  Set <code>DISCORD_WEBHOOK_URL</code> env var on Render to enable memory alerts.
                </div>
              </div>

              <div className="db-card">
                <div className="db-card-label">Auto-Restart on Danger</div>
                <div className="db-card-val" style={{fontSize: 14}}>
                  {serverConfig.autoRestartEnabled ? '✓ Enabled' : '✗ Disabled'}
                </div>
                <div className="db-card-sub" style={{marginTop: 8}}>
                  When memory hits 92%+, server gracefully shuts down and Render auto-restarts it.
                </div>
              </div>

              <div className="db-card">
                <div className="db-card-label">Memory Limit</div>
                <div className="db-card-val">{serverConfig.memoryLimitMb} MB</div>
                <div className="db-card-sub">Render free tier</div>
              </div>

              <div className="db-card">
                <div className="db-card-label">Node Version</div>
                <div className="db-card-val" style={{fontSize: 18}}>{serverConfig.nodeVersion}</div>
              </div>

              <div className="db-card">
                <div className="db-card-label">Platform</div>
                <div className="db-card-val" style={{fontSize: 18}}>{serverConfig.platform}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN APP
════════════════════════════════════════ */
export default function App() {
  /* ── Auth (memory-only — clears on every page load) ── */
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [view, setView] = useState<'main' | 'admin'>('main');
  const [viewHistory, setViewHistory] = useState<string[]>([]);

  /* ── Lifetime stats from server (cached locally so they never show 0 on refresh) ── */
  const [lts, setLts] = useState<LifetimeStats>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('tfs_lts_cache') || '{}');
      if (typeof cached.det === 'number') return cached;
    } catch {}
    return { det: 0, del: 0, fail: 0, best: null };
  });

  /* ── App state ── */
  const [step,    setStep]    = useState(1);
  const [token,   setToken]   = useState('');
  const [tid,     setTid]     = useState('');
  const [kw,      setKw]      = useState('join');
  // Multi-target list — each entry is { targetId, keyword }
  const [targets, setTargets] = useState<Array<{targetId: string; keyword: string}>>([
    { targetId: '', keyword: 'join' },
  ]);
  const [threads, setThreads] = useState<ThreadConfigItem[]>([
    { delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 0 }, { delayMs: 1 }, { delayMs: 1 }
  ]);
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [up,      setUp]      = useState(0);
  const [conn,    setConn]    = useState<'connecting'|'connected'|'disconnected'>('connecting');
  const [filt,    setFilt]    = useState<LT|'all'>('all');
  const [warn,    setWarn]    = useState(false);
  const [loading, setLoading] = useState(false);

  /* ── UI state ── */
  const [flash,        setFlash]        = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [autoScroll,   setAutoScroll]   = useState(true);
  const [lastEventAt,  setLastEventAt]  = useState<number|null>(null);
  const [lastEventStr, setLastEventStr] = useState('');
  const [lastDetected, setLastDetected] = useState('');
  const [username,     setUsername]     = useState('');
  const [sparkData,    setSparkData]    = useState<number[]>([]);
  const [latencyData,  setLatencyData]  = useState<number[]>([]); // click latency over time
  const [kwStats,      setKwStats]      = useState<Array<{keyword: string; det: number; del: number; fail: number; best: number | null}>>([]);

  /* ── NEW: Token validation state ── */
  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenValidated,  setTokenValidated]  = useState<{username: string; id: string} | null>(null);
  const [tokenError,      setTokenError]      = useState('');

  /* ── NEW: Latency check state ── */
  const [gatewayLatency, setGatewayLatency] = useState<number | null>(null);

  /* ── NEW: Theme (dark default, with light option) ── */
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('tfs_theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('tfs_theme', theme); } catch {}
  }, [theme]);

  /* ── NEW: Sound alerts ── */
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('tfs_sound') !== 'off'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('tfs_sound', soundOn ? 'on' : 'off'); } catch {}
  }, [soundOn]);

  /* ── NEW: Browser notifications ── */
  const [notifOn, setNotifOn] = useState(() => {
    try { return localStorage.getItem('tfs_notif') === 'on'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tfs_notif', notifOn ? 'on' : 'off'); } catch {}
  }, [notifOn]);
  const requestNotifPermission = useCallback(async () => {
    if (!('Notification' in window)) { alert('Notifications not supported in this browser'); return; }
    if (Notification.permission === 'granted') { setNotifOn(true); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') setNotifOn(true);
    else alert('Notification permission denied');
  }, []);

  /* ── NEW: Broadcast banner (owner → all users) ── */
  const [broadcast, setBroadcast] = useState<{message: string; severity: string; ts: number} | null>(null);

  /* ── NEW: Auth progress tracking (live status during login) ── */
  const [authProgress, setAuthProgress] = useState<{stage: string; message: string} | null>(null);

  /* ── NEW: Connection quality (based on latency + stability) ── */
  const [connQuality, setConnQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');

  /* ── NEW: Quick Launch — save last successful config (minus token) for one-click relaunch ── */
  const [quickLaunch, setQuickLaunch] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem('tfs_quick_launch') || 'null');
      return c; // { targets, threads } or null
    } catch { return null; }
  });
  const hasQuickLaunch = !!(quickLaunch && quickLaunch.targets && quickLaunch.targets.length > 0);
  // Track whether quick launch has been applied (for visual feedback)
  const [quickLaunchApplied, setQuickLaunchApplied] = useState(false);

  /* ── NEW: Show broadcast panel in admin ── */
  // (handled inside AdminPanel)

  /* ── Heartbeat state ── */
  const [heartbeat, setHeartbeat] = useState<HeartbeatInfo | null>(null);
  const [hbPulse, setHbPulse] = useState(false);
  const [hbLogs, setHbLogs] = useState<{ts: string; alive: boolean; ago: number}[]>([]);
  const [showHbPanel, setShowHbPanel] = useState(false);
  const [hbCountdown, setHbCountdown] = useState<number>(20);
  const hbLastReceivedAtRef = useRef<number>(0);

  /* ── NEW: Sound chime via Web Audio API ── */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playChime = useCallback((type: 'detect' | 'success' | 'error') => {
    if (!soundOn) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // Different tones for different events
      const freq = type === 'success' ? 880 : type === 'detect' ? 660 : 330;
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [soundOn]);

  /* ── NEW: Fire browser notification ── */
  const fireNotification = useCallback((title: string, body: string) => {
    if (!notifOn || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: '/favicon.png' }); } catch {}
  }, [notifOn]);

  /* ── Refs ── */
  const sockRef    = useRef<Socket|null>(null);
  const logElRef   = useRef<HTMLDivElement>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const sparkRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const sparkCount = useRef(0);
  const t0Ref      = useRef(0);
  const hbTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastLogRef = useRef(0);

  /* ── Live 20-second heartbeat countdown ── */
  useEffect(() => {
    if (!heartbeat) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - hbLastReceivedAtRef.current) / 1000);
      const remaining = Math.max(0, 20 - elapsed);
      setHbCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [heartbeat]);

  /* ── Per-user session ID — ISOLATED per logged-in user, never shared across accounts ──
     FIX: previously the initial state used a shared 'tfs_sid_v2' key which caused
     admin and normal users on the same browser to collide. Now sid is ONLY generated
     and read from a per-user key, never a global shared key. */
  const [sid, setSid] = useState<string>('');

  useEffect(() => {
    if (!auth) { setSid(''); return; }
    // Per-user sid — completely isolated per account
    const userKey = `tfs_sid_${auth.name.toLowerCase().replace(/\s+/g, '_')}`;
    const existing = localStorage.getItem(userKey);
    if (existing) {
      setSid(existing);
    } else {
      const newSid = crypto.randomUUID();
      localStorage.setItem(userKey, newSid);
      setSid(newSid);
    }
  }, [auth]);

  /* ── Load keyword and threads config from localStorage ── */
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem('tfs_cfg_v6') || '{}');
      if (c.kw) setKw(c.kw);
      if (Array.isArray(c.threads) && c.threads.length > 0) setThreads(c.threads);
    } catch {}
  }, []);

  /* ── Save keyword and threads config ── */
  useEffect(() => {
    try { localStorage.setItem('tfs_cfg_v6', JSON.stringify({ kw, threads })); } catch {}
  }, [kw, threads]);

  /* ── Cache lifetime stats to localStorage whenever they change ── */
  useEffect(() => {
    try { localStorage.setItem('tfs_lts_cache', JSON.stringify(lts)); } catch {}
  }, [lts]);

  /* ── Fetch and sync stats via HTTP on mount + periodic rehydration ── */
  useEffect(() => {
    const syncStats = () => {
      try {
        const cached = JSON.parse(localStorage.getItem('tfs_lts_cache') || '{}');
        fetch('/api/stats/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cached)
        }).then(r => r.json()).then(data => {
          if (data.lts && typeof data.lts.det === 'number') setLts(data.lts);
        }).catch(() => {});
      } catch {}
    };
    syncStats();
    const id = setInterval(syncStats, 45000); // Re-sync every 45s
    return () => clearInterval(id);
  }, []);

  /* ── addLog ── */
  const addLog = useCallback((msg: string, type: LT = 'info') => {
    const d  = new Date();
    const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;

    // Track spark activity (session-level visual only)
    if (type === 'success' && msg.includes('[SUCCESS]')) {
      sparkCount.current++;
      // Track latency from success message: "...T1 — 444ms"
      const m = msg.match(/—\s*(\d+)ms/);
      if (m) {
        const ms = parseInt(m[1], 10);
        setLatencyData(prev => [...prev.slice(-29), ms]);
      }
      // NEW: Sound + notification on success
      playChime('success');
      fireNotification('✓ Click Success', msg);
    }

    // NEW: Sound + notification on detection
    if (msg.includes('[DETECTED]')) {
      playChime('detect');
      fireNotification('◉ Button Detected', msg);
    }

    // NEW: Sound on error (but not on auth-failed, which is too noisy)
    if (type === 'error' && msg.startsWith('[FAIL]')) {
      playChime('error');
    }

    // Auth state updates
    if (type === 'success' && msg.startsWith('✓ Authenticated')) {
      const m = msg.match(/— (.+)$/);
      if (m) setUsername(m[1]);
      setLoading(false);
    }
    if (type === 'error' && msg.startsWith('Auth failed')) setLoading(false);

    // NEW: Notification on disconnect
    if (type === 'error' && msg.includes('WS Disconnected')) {
      fireNotification('⚠ Bot Disconnected', msg);
    }

    // Limit to 100 for heavy performance optimization (prevents UI freeze during heavy spam)
    setLogs(p => [...p, { id: crypto.randomUUID(), ts, msg, type }].slice(-100));
  }, [playChime, fireNotification]);

  /* ── Socket lifecycle ── */
  useEffect(() => {
    if (!sid) return; // wait for per-user sid
    // ── Resilient socket config — auto-reconnect with backoff ──
    const s = io({
      reconnection: true,
      reconnectionAttempts: Infinity,    // never give up
      reconnectionDelay: 1000,           // start at 1s
      reconnectionDelayMax: 10000,       // cap at 10s
      timeout: 20000,                    // 20s to establish first connection
      transports: ['websocket', 'polling'],
    });
    sockRef.current = s;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    s.on('connect',       () => { setConn('connected'); s.emit('initSession', sid); });
    s.on('disconnect',    () => {
      // Don't immediately mark as disconnected — give a 3s grace period
      // to absorb brief network blips without scaring the user
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setConn('connecting');  // show "connecting" instead of "offline" during brief blips
      reconnectTimer = setTimeout(() => {
        if (s.disconnected) setConn('disconnected');
      }, 3000);
    });
    s.on('reconnect',     () => { setConn('connected'); s.emit('initSession', sid); });
    s.on('reconnect_attempt', (attemptNum: number) => {
      setConn('connecting');
      if (attemptNum <= 3) {
        // Silent for first few attempts
      }
    });
    s.on('connect_error', () => {
      // Don't show as offline immediately — socket.io will retry
      setConn('connecting');
    });

    s.on('lifetimeStats', (data: LifetimeStats) => setLts(data));
    s.on('sessionStatus', (d: any) => {
      if (d.isRunning) {
        setStep(4);
        if (d.config) {
          setTid(d.config.targetId || '');
          setKw(d.config.keyword || 'join');
          if (d.config.threadConfig) setThreads(d.config.threadConfig);
          // NEW: Restore multi-target config
          if (Array.isArray(d.config.targets) && d.config.targets.length > 0) {
            setTargets(d.config.targets);
          }
        }
        addLog('Session restored.', 'success');
      }
    });
    s.on('log', (d: { message: string; type: LT }) => addLog(d.message, d.type));

    // NEW: Broadcast banner (owner → all users)
    s.on('broadcast', (data: { message: string; severity: string; ts: number }) => {
      if (data.message && data.message.length > 0) {
        setBroadcast(data);
        fireNotification('📢 Owner Broadcast', data.message);
      } else {
        setBroadcast(null);
      }
    });

    // NEW: Per-keyword stats updates
    s.on('keywordStats', (data: { stats: Array<{keyword: string; det: number; del: number; fail: number; best: number | null}> }) => {
      if (data.stats) setKwStats(data.stats);
    });

    // NEW: Auth progress events (live status during login)
    s.on('authProgress', (data: { stage: string; message: string }) => {
      setAuthProgress(data);
      if (data.stage === 'ready' || data.stage === 'failed') {
        // Clear after 2s for 'ready', keep 'failed' visible
        if (data.stage === 'ready') {
          setTimeout(() => setAuthProgress(null), 2000);
        }
      }
    });

    // Heartbeat events from server (every 20 seconds)
    s.on('heartbeat', (data: HeartbeatInfo) => {
      setHeartbeat(data);
      hbLastReceivedAtRef.current = Date.now();
      // Update connection quality based on lastPacketAgo
      if (data.alive && data.lastPacketAgo < 5) setConnQuality('excellent');
      else if (data.alive && data.lastPacketAgo < 20) setConnQuality('good');
      else if (!data.alive) setConnQuality('poor');
      setHbCountdown(20);
      setHbPulse(true);
      if (hbTimeoutRef.current) clearTimeout(hbTimeoutRef.current);
      hbTimeoutRef.current = setTimeout(() => setHbPulse(false), 600);
      const d = new Date(data.timestamp);
      const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      setHbLogs(prev => [...prev.slice(-29), { ts, alive: data.alive, ago: data.lastPacketAgo }]);
    });

    // ── Tab visibility handler ──
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (s.disconnected) {
          s.connect();
        }
        s.emit('initSession', sid);
        try {
          const cached = JSON.parse(localStorage.getItem('tfs_lts_cache') || '{}');
          fetch('/api/stats/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cached)
          }).then(r => r.json()).then(data => {
            if (data.lts && typeof data.lts.det === 'number') setLts(data.lts);
          }).catch(() => {});
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      s.disconnect();
    };
  }, [sid, addLog, fireNotification]);

  /* ── Detection flash + tracking ── */
  useEffect(() => {
    if (logs.length > lastLogRef.current) {
      const newest = logs[logs.length - 1];
      if (newest && (newest.type === 'success' || newest.msg.includes('Detected'))) {
        setFlash(true);
        setLastEventAt(Date.now());
        setTimeout(() => setFlash(false), 800);
      }
      if (newest && newest.msg.includes('[DETECTED]')) {
        const m = newest.msg.match(/"([^"]+)"/);
        if (m) setLastDetected(m[1]);
      }
    }
    lastLogRef.current = logs.length;
  });

  /* ── Relative time label ── */
  useEffect(() => {
    if (!lastEventAt) return;
    const tick = () => {
      const s = Math.floor((Date.now() - lastEventAt) / 1000);
      setLastEventStr(s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : `${Math.floor(s/3600)}h ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastEventAt]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (!autoScroll) return;
    const el = logElRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, autoScroll]);

  /* ── NEW: Dynamic browser tab title — shows live status even when tab is in background ── */
  useEffect(() => {
    const baseTitle = 'The First Signer — Elite';
    let title = baseTitle;
    if (step === 4 && loading) title = '⟳ Authenticating… | ' + baseTitle;
    else if (step === 4 && !loading && conn === 'connected') title = `● Engine Running | ${lts.det} detected | ` + baseTitle;
    else if (step === 4 && conn === 'disconnected') title = '⚠ Offline | ' + baseTitle;
    else if (step === 4 && conn === 'connecting') title = '↻ Reconnecting | ' + baseTitle;
    else if (broadcast && broadcast.message) title = '📢 ' + broadcast.message.slice(0, 40) + ' | ' + baseTitle;
    document.title = title;
    return () => { document.title = baseTitle; };
  }, [step, loading, conn, lts.det, broadcast]);

  /* ── Keyboard navigation ── */
  const launchRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!auth) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.target instanceof HTMLButtonElement) return;
      if (e.target instanceof HTMLInputElement) return;
      if (step === 1) { if (!token.trim()) { setWarn(true); return; } setStep(2); }
      else if (step === 2) { if (tid.trim()) setStep(3); }
      else if (step === 3) { launchRef.current(); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [auth, step, token, tid]);

  /* ── Timer helpers ── */
  const startTimer = useCallback(() => {
    t0Ref.current = Date.now();
    timerRef.current = setInterval(() => setUp(Math.floor((Date.now() - t0Ref.current) / 1000)), 1000);
    sparkCount.current = 0;
    sparkRef.current = setInterval(() => {
      setSparkData(p => [...p.slice(-19), sparkCount.current]);
      sparkCount.current = 0;
    }, 6000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sparkRef.current) clearInterval(sparkRef.current);
    setUp(0); setSparkData([]); setLatencyData([]);
  }, []);

  const fmtUp = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
    if (m) return `${m}m ${String(sec).padStart(2,'0')}s`;
    return `${sec}s`;
  };

  /* ── Launch engine ── */
  const launch = useCallback(() => {
    if (!kw.trim() || !sid) return;
    // Build targets list — filter out empty targetIds
    const validTargets = targets.filter(t => t.targetId.trim() && t.keyword.trim());
    if (validTargets.length === 0) return;
    setStep(4); setLoading(true);
    setAuthProgress({ stage: 'login', message: 'Connecting to Discord gateway…' });
    setLogs([]); setLastDetected(''); setLastEventAt(null); setLastEventStr('');
    setUsername(''); setLatencyData([]); setSparkData([]); setKwStats([]);
    startTimer();
    addLog('Starting engine…', 'info');
    // Save quick-launch config (minus token) for one-click relaunch next time
    try {
      localStorage.setItem('tfs_quick_launch', JSON.stringify({ targets: validTargets, threads }));
      setQuickLaunch({ targets: validTargets, threads });
    } catch {}
    sockRef.current?.emit('launchBot', {
      sessionId: sid,
      token,
      // Send both legacy fields (first target) and new targets array
      targetId: validTargets[0].targetId,
      keyword: validTargets[0].keyword,
      targets: validTargets,
      threadConfig: threads,
      ownerName: auth?.name,
    });
  }, [kw, sid, token, tid, targets, threads, startTimer, addLog, auth]);

  /* ── NEW: Quick Launch — pre-fill form from last saved config (minus token) ──
     FIX: Previously this called setStep(1) when user was already on step 1,
     so nothing visible happened. Now we:
     1. Load the saved config (targets, threads)
     2. Show a "✓ Config loaded" visual feedback
     3. If token is already entered, jump straight to Step 3 (Engine Config) for one-click launch
     4. If token is NOT entered, stay on Step 1 but show "Config loaded — enter token to continue"
  */
  const applyQuickLaunch = useCallback(() => {
    if (!quickLaunch) return;
    if (quickLaunch.targets) setTargets(quickLaunch.targets);
    if (quickLaunch.threads) setThreads(quickLaunch.threads);
    if (quickLaunch.targets.length > 0) {
      setTid(quickLaunch.targets[0].targetId);
      setKw(quickLaunch.targets[0].keyword);
    }
    setQuickLaunchApplied(true);
    // If token already pasted, skip ahead to Step 3 so user can review + activate
    if (token.trim()) {
      setStep(3);
    }
    // Otherwise stay on Step 1 — the banner will show "Config loaded — enter token"
  }, [quickLaunch, token]);

  useEffect(() => { launchRef.current = launch; }, [launch]);

  /* ── Kill session ── */
  const kill = useCallback(() => {
    if (sid) sockRef.current?.emit('stopBot', sid);
    setStep(1); setLogs([]); stopTimer(); setLoading(false);
    setLastDetected(''); setLastEventAt(null); setLastEventStr('');
    setUsername(''); setHeartbeat(null); setHbLogs([]); setShowHbPanel(false);
    setToken(''); setTid(''); setKwStats([]); setLatencyData([]);
    setTokenValidated(null); setTokenError('');
    setAuthProgress(null); setConnQuality('unknown');
    setQuickLaunchApplied(false);  // reset quick launch banner for next session
  }, [sid, stopTimer]);

  /* ── Quick restart — relaunch the bot with the same config ── */
  const quickRestart = useCallback(() => {
    if (!sid || !token.trim()) return;
    const validTargets = targets.filter(t => t.targetId.trim() && t.keyword.trim());
    if (validTargets.length === 0) return;
    setStep(4); setLoading(true);
    setLogs([]); setLastDetected(''); setLastEventAt(null); setLastEventStr('');
    setUsername(''); setLatencyData([]); setSparkData([]); setKwStats([]);
    startTimer();
    addLog('Restarting engine…', 'info');
    // Kill first, then relaunch
    sockRef.current?.emit('stopBot', sid);
    setTimeout(() => {
      sockRef.current?.emit('launchBot', {
        sessionId: sid,
        token,
        targetId: validTargets[0].targetId,
        keyword: validTargets[0].keyword,
        targets: validTargets,
        threadConfig: threads,
        ownerName: auth?.name,
      });
    }, 300);
  }, [sid, token, tid, kw, targets, threads, startTimer, addLog, auth]);

  /* ── NEW: Test click — simulates a fake MESSAGE_CREATE packet ── */
  const testClick = useCallback(() => {
    if (!sid) return;
    const firstTarget = targets.find(t => t.targetId.trim() && t.keyword.trim());
    if (!firstTarget) {
      addLog('Add at least one target to test click.', 'error');
      return;
    }
    sockRef.current?.emit('testClick', {
      sessionId: sid,
      targetId: firstTarget.targetId,
      keyword: firstTarget.keyword,
    });
  }, [sid, targets, addLog]);

  /* ── NEW: Token validation ── */
  const validateToken = useCallback(async () => {
    if (!token.trim() || token.length < 10) {
      setTokenError('Token too short');
      setTokenValidated(null);
      return;
    }
    setTokenValidating(true); setTokenError(''); setTokenValidated(null);
    try {
      const res = await fetch('/api/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.valid) {
        setTokenValidated({ username: data.username, id: data.id });
      } else {
        setTokenError(data.error || 'Invalid token');
        setTokenValidated(null);
      }
    } catch (e: any) {
      setTokenError(e?.message || 'Network error');
    }
    setTokenValidating(false);
  }, [token]);

  /* ── NEW: Latency check to Discord gateway (runs on mount) ── */
  useEffect(() => {
    fetch('/api/latency-check')
      .then(r => r.json())
      .then(data => { if (data.ok && typeof data.latencyMs === 'number') setGatewayLatency(data.latencyMs); })
      .catch(() => {});
  }, []);

  /* ── NEW: Export logs as CSV ── */
  const exportLogsCSV = useCallback(() => {
    const header = 'timestamp,type,message\n';
    const rows = logs.map(l => `"${l.ts}","${l.type}","${l.msg.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tfs-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  /* ── NEW: Export logs as JSON ── */
  const exportLogsJSON = useCallback(() => {
    const data = { exportedAt: new Date().toISOString(), stats: lts, logs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tfs-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, lts]);

  /* ── Navigate between views (with history) ── */
  const navigateTo = useCallback((newView: 'main' | 'admin') => {
    setViewHistory(prev => [...prev, view]);
    setView(newView);
  }, [view]);
  const goBack = useCallback(() => {
    setViewHistory(prev => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop()!;
      queueMicrotask(() => setView(last as 'main' | 'admin'));
      return copy;
    });
  }, []);

  /* ── Log actions ── */
  const copyLogs = useCallback(async () => {
    const text = logs.map(l => `[${l.ts}] ${l.msg}`).join('\n');
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]); setSparkData([]); setLatencyData([]);
  }, []);

  /* ── Derived values ── */
  const threadSummary = useMemo(() => {
    if (threads.length === 0) return '0 parallel';
    const runs: { start: number; end: number; delayMs: number }[] = [];
    let currentRun = { start: 1, end: 1, delayMs: threads[0].delayMs };
    for (let i = 1; i < threads.length; i++) {
      if (threads[i].delayMs === currentRun.delayMs) {
        currentRun.end = i + 1;
      } else {
        runs.push(currentRun);
        currentRun = { start: i + 1, end: i + 1, delayMs: threads[i].delayMs };
      }
    }
    runs.push(currentRun);
    const parts = runs.map(run => {
      if (run.start === run.end) return `T${run.start}: ${run.delayMs}ms`;
      return `T${run.start}-T${run.end}: ${run.delayMs}ms`;
    });
    return `${threads.length} parallel · ${parts.join(' · ')}`;
  }, [threads]);

  const filtered    = useMemo(() => filt === 'all' ? logs : logs.filter(l => l.type === filt), [logs, filt]);
  const rate        = lts.del + lts.fail > 0 ? Math.round((lts.del / (lts.del + lts.fail)) * 100) : null;
  // Warm palette: sage / gold / rose (NO neon)
  const dotColor    = conn === 'connected' ? '#7cc87c' : conn === 'connecting' ? '#c8aa6e' : '#d47575';
  const dotGlow     = conn === 'connected' ? 'rgba(124,200,124,0.5)' : conn === 'connecting' ? 'rgba(200,170,110,0.5)' : 'rgba(212,117,117,0.5)';
  const statusLabel = conn === 'connected' ? 'Connected' : conn === 'connecting' ? 'Connecting' : 'Offline';
  const ns          = (n: number) => n < step ? 'done' : n === step ? 'active' : 'future';

  const logIconCls  = (l: LogEntry) => l.type === 'success' ? 'li-ok' : l.type === 'error' ? 'li-fail' : l.msg.includes('[DETECTED]') ? 'li-det' : 'li-info';
  const logIconChar = (l: LogEntry) => l.type === 'success' ? '✓' : l.type === 'error' ? '✗' : l.msg.includes('[DETECTED]') ? '◉' : '·';

  // Engine health: based on heartbeat + connection state
  const engineHealth = useMemo(() => {
    if (!heartbeat) return { label: 'Idle', color: '#888', pct: 0 };
    if (!heartbeat.alive) return { label: 'Recovering', color: '#d47575', pct: 30 };
    if (heartbeat.reconnectAttempts > 0) return { label: 'Reconnecting', color: '#c8aa6e', pct: 60 };
    if (conn === 'connected' && heartbeat.lastPacketAgo < 10) return { label: 'Excellent', color: '#7cc87c', pct: 100 };
    if (conn === 'connected') return { label: 'Good', color: '#7cc87c', pct: 85 };
    return { label: 'Degraded', color: '#c8aa6e', pct: 50 };
  }, [heartbeat, conn]);

  const avgLatency = useMemo(() => {
    if (latencyData.length === 0) return null;
    return Math.round(latencyData.reduce((a, b) => a + b, 0) / latencyData.length);
  }, [latencyData]);

  const STEPS = [
    { n: 1, label: 'Authentication', desc: 'Discord token' },
    { n: 2, label: 'Target Setup',   desc: 'Bot user ID' },
    { n: 3, label: 'Engine Config',  desc: 'Keyword & launch' },
  ];

  const anim = {
    initial: { opacity: 0, y: 18, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
    exit:    { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.2 } },
  };

  /* ════════════════════════════════════════
     GATE — show before everything
  ════════════════════════════════════════ */
  if (!auth) return <GateScreen onAuth={setAuth}/>;

  /* ════════════════════════════════════════
     FULL APP
  ════════════════════════════════════════ */
  return (
    <>
      <div className="scene-bg"/>
      <div className="dot-grid"/>
      <div className="bg-orb bg-orb-1"/>
      <div className="bg-orb bg-orb-2"/>
      <div className="bg-orb bg-orb-3"/>

      <div className="app-shell">

        {/* ── TOP BAR ── */}
        <header className="top-bar">
          <div className="tb-left">
            <div className="tb-icon"><IBot/></div>
            <span className="tb-brand">The First Signer</span>
            <span className="tb-ver">Elite</span>
          </div>

          {step < 4 && (
            <div className="tb-step-prog">
              <div className="tb-step-prog-fill" style={{ width: `${((step - 1) / 2) * 100}%` }}/>
            </div>
          )}

          <div className="tb-right">
            <div className="tb-user">
              <IUser/>
              <span>{auth.name}</span>
              {auth.role === 'owner' && <span className="tb-owner-badge">Owner</span>}
            </div>

            {auth.role === 'owner' && view === 'main' && (
              <button className="tb-admin-btn" onClick={() => navigateTo('admin')}>
                <IShield/> Admin
              </button>
            )}

            {view === 'admin' && (
              <button className="tb-back-btn" onClick={goBack}>
                <IBack/> Back
              </button>
            )}

            {/* NEW: Theme toggle */}
            <button
              className="tb-toggle-btn"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '🌙' : '☀'}
            </button>

            {/* NEW: Sound toggle */}
            <button
              className={`tb-toggle-btn${soundOn ? ' on' : ''}`}
              title={soundOn ? 'Sound alerts ON — click to mute' : 'Sound alerts OFF — click to enable'}
              onClick={() => setSoundOn(!soundOn)}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>

            {/* NEW: Browser notifications toggle */}
            <button
              className={`tb-toggle-btn${notifOn ? ' on' : ''}`}
              title={notifOn ? 'Notifications ON — click to disable' : 'Notifications OFF — click to enable (requires permission)'}
              onClick={() => {
                if (notifOn) setNotifOn(false);
                else requestNotifPermission();
              }}
            >
              {notifOn ? '🔔' : '🔕'}
            </button>

            <button className="tb-logout-btn" title="Sign out" onClick={() => {
              kill();
              setAuth(null);
              setView('main');
              setViewHistory([]);
            }}>
              <ILogout/>
            </button>

            {username && step === 4 && (
              <div className="tb-discord-user">
                <span>{username}</span>
              </div>
            )}

            {step === 4 && (
              <motion.div
                className={`tb-heartbeat${hbPulse ? ' pulse' : ''}${heartbeat && !heartbeat.alive ? ' dead' : ''}`}
                onClick={() => setShowHbPanel(p => !p)}
                title={heartbeat ? `Next heartbeat in ${hbCountdown}s · Last packet: ${heartbeat.lastPacketAgo}s ago · WS: ${heartbeat.wsStatus}` : 'Waiting for heartbeat…'}
                animate={hbPulse ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                <IHeart/>
                <span className="tb-hb-label">
                  {heartbeat
                    ? heartbeat.alive
                      ? <>{hbCountdown}s<span className="tb-hb-sep">|</span>{heartbeat.lastPacketAgo}s</>
                      : `DEAD ${heartbeat.lastPacketAgo}s`
                    : '…'}
                </span>
              </motion.div>
            )}

            <div className="tb-indicator">
              <div className="tb-dot" style={{ background: dotColor, boxShadow: `0 0 8px ${dotGlow}` }}/>
              <span className="tb-status-txt">{statusLabel}</span>
            </div>
            <div className="tb-sep"/>
            <span className="tb-clock"><Clock/></span>
          </div>
        </header>

        {/* NEW: Broadcast banner (from owner) */}
        <AnimatePresence>
          {broadcast && broadcast.message && (
            <motion.div
              className={`broadcast-banner ${broadcast.severity}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="broadcast-icon">
                {broadcast.severity === 'critical' ? '🚨' : broadcast.severity === 'warn' ? '⚠️' : '📢'}
              </span>
              <span className="broadcast-msg">{broadcast.message}</span>
              <button
                className="broadcast-close"
                onClick={() => setBroadcast(null)}
              >✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BODY ── */}
        <div className="app-body">

          {/* ── ADMIN PANEL (owner only, replaces full body) ── */}
          {view === 'admin' && auth.role === 'owner' && (
            <AdminPanel
              ownerKey={auth.ownerKey!}
              onBack={goBack}
              onResetStats={() => setLts({ det: 0, del: 0, fail: 0, best: null })}
            />
          )}

          {view === 'main' && (<>

          {/* ── SIDEBAR ── */}
          <aside className="sidebar">
            <div className="sidebar-top">

              {step < 4 && (
                <div className="vstep-track">
                  {STEPS.map(({ n, label, desc }, i) => (
                    <div key={n} className="vstep-item">
                      <div className="vstep-left">
                        <div className={`vstep-bubble ${ns(n)}`}>{n < step ? <ICheck/> : n}</div>
                        {i < STEPS.length - 1 && <div className={`vstep-line ${n < step ? 'filled' : ''}`}/>}
                      </div>
                      <div className="vstep-right">
                        <div className={`vstep-label ${ns(n)}`}>{label}</div>
                        <div className="vstep-desc">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {step === 4 && (
                <>
                  {/* Lifetime stat cards — never wipe on refresh */}
                  <div className="side-stats-grid">
                    {([
                      { raw: lts.det,  label: 'Detected', cls: 'n-white' },
                      { raw: lts.del,  label: 'Success',  cls: 'n-green' },
                      { raw: lts.fail, label: 'Failed',   cls: 'n-red'   },
                    ] as const).map(({ raw, label, cls }, i) => (
                      <motion.div
                        key={label}
                        className="side-stat-card"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      >
                        <div className={`s-stat-val ${cls}`}><AnimatedNum value={raw}/></div>
                        <div className="s-stat-label">{label}</div>
                      </motion.div>
                    ))}
                    <motion.div
                      className="side-stat-card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.15 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                    >
                      <div className="s-stat-val n-dim">
                        {lts.best !== null ? `${lts.best}ms` : '—'}
                      </div>
                      <div className="s-stat-label">Best Time</div>
                    </motion.div>
                  </div>

                  {/* Lifetime badge */}
                  <div className="lifetime-badge">
                    <span className="lifetime-dot"/>
                    All-time · Never resets · Shared
                  </div>

                  {/* Engine Health Card — NEW */}
                  <div className="engine-health-card">
                    <div className="eh-head">
                      <IGauge/>
                      <span className="eh-label">Engine Health</span>
                      <span className="eh-status" style={{ color: engineHealth.color }}>{engineHealth.label}</span>
                    </div>
                    <div className="eh-bar-track">
                      <div className="eh-bar-fill" style={{
                        width: `${engineHealth.pct}%`,
                        background: engineHealth.color,
                        transition: 'all 0.5s ease',
                      }}/>
                    </div>
                  </div>

                  {/* Latency Card — NEW */}
                  {latencyData.length >= 2 && (
                    <div className="latency-wrap">
                      <div className="latency-head">
                        <IPulse/>
                        <span className="latency-label">Click Latency</span>
                        <span className="latency-avg">{avgLatency}ms avg</span>
                      </div>
                      <SparkLine data={latencyData} color="gold"/>
                      {/* NEW: Latency histogram */}
                      {latencyData.length >= 4 && (
                        <div className="latency-histogram">
                          {(() => {
                            const bins = [0, 100, 200, 300, 500, 800, 1200];
                            const counts = bins.map(() => 0);
                            latencyData.forEach(ms => {
                              for (let i = 0; i < bins.length; i++) {
                                if (ms < bins[i]) { counts[i]++; break; }
                                if (i === bins.length - 1 && ms >= bins[i]) counts[i]++;
                              }
                            });
                            const max = Math.max(...counts, 1);
                            return bins.map((b, i) => {
                              const label = i === 0 ? `<${bins[i+1] || '∞'}` : i === bins.length - 1 ? `${b}+` : `${b}-${bins[i+1]}`;
                              const pct = (counts[i] / max) * 100;
                              const color = i < 2 ? '#7cc87c' : i < 4 ? '#c8aa6e' : '#d47575';
                              return (
                                <div key={i} className="hist-bar-wrap" title={`${label}ms: ${counts[i]} clicks`}>
                                  <div className="hist-bar" style={{ height: `${pct}%`, background: color }} />
                                  <span className="hist-label">{label}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* NEW: Per-keyword stats */}
                  {kwStats.length > 0 && (
                    <div className="kw-stats-wrap">
                      <div className="kw-stats-head">
                        <IHash/>
                        <span className="kw-stats-label">Per-Keyword Stats</span>
                      </div>
                      <div className="kw-stats-list">
                        {kwStats.map((s, i) => {
                          const rate = s.det > 0 ? Math.round((s.del / s.det) * 100) : 0;
                          return (
                            <div key={i} className="kw-stat-row">
                              <span className="kw-stat-name">"{s.keyword}"</span>
                              <span className="kw-stat-nums">
                                <span className="kw-det">{s.det}</span>
                                <span className="kw-sep">/</span>
                                <span className="kw-del">{s.del}</span>
                                <span className="kw-sep">/</span>
                                <span className="kw-fail">{s.fail}</span>
                              </span>
                              <span className="kw-stat-rate" style={{ color: rate > 66 ? '#7cc87c' : rate > 33 ? '#c8aa6e' : '#d47575' }}>
                                {rate}%
                              </span>
                              {s.best !== null && (
                                <span className="kw-stat-best">{s.best}ms</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sparkData.length >= 2 && (
                    <div className="spark-wrap">
                      <div className="spark-label">Success Activity</div>
                      <SparkLine data={sparkData} color="sage"/>
                    </div>
                  )}

                  {rate !== null && (
                    <div className="sr-bar">
                      <div className="sr-bar-head">
                        <span>Success Rate</span>
                        <span style={{ color: rate > 66 ? '#7cc87c' : rate > 33 ? '#c8aa6e' : '#d47575' }}>{rate}%</span>
                      </div>
                      <div className="sr-bar-track">
                        <div className="sr-bar-fill" style={{
                          width: `${rate}%`,
                          background: rate > 66 ? '#7cc87c' : rate > 33 ? '#c8aa6e' : '#d47575',
                        }}/>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="side-divider"/>

              <div className="side-meta">
                {step < 4 ? (
                  <>
                    <div className="side-meta-row"><span className="smr-k">Threads</span><span className="smr-v">{threads.length} parallel</span></div>
                    <div className="side-meta-row"><span className="smr-k">Click Mode</span><span className="smr-v">Direct HTTP</span></div>
                    <div className="side-meta-row"><span className="smr-k">Detection</span><span className="smr-v">RAW WebSocket</span></div>
                    <div className="side-meta-row"><span className="smr-k">Overhead</span><span className="smr-v">Zero — bypassed</span></div>
                  </>
                ) : (
                  <>
                    <div className="side-meta-row"><span className="smr-k">Target</span><span className="smr-v smr-v-trunc">{tid}</span></div>
                    <div className="side-meta-row"><span className="smr-k">Keyword</span><span className="smr-v">"{kw}"</span></div>
                    <div className="side-meta-row"><span className="smr-k">Threads</span><span className="smr-v smr-v-trunc" title={threadSummary}>{threads.length} parallel</span></div>
                    <div className="side-meta-row"><span className="smr-k">Uptime</span><span className="smr-v">{fmtUp(up)}</span></div>
                    <div className="side-meta-row"><span className="smr-k">Events</span><span className="smr-v">{logs.length}</span></div>
                    {lastEventStr && <div className="side-meta-row"><span className="smr-k">Last Event</span><span className="smr-v">{lastEventStr}</span></div>}
                    {lastDetected && <div className="side-meta-row"><span className="smr-k">Last Button</span><span className="smr-v smr-v-trunc">"{lastDetected}"</span></div>}
                  </>
                )}
              </div>
            </div>

            <div className="sidebar-bottom">
              <span className="sb-made">Idea &amp; Made by</span>
              <div className="name-wrap"><span className="footer-name">Prem Cullen</span></div>
              <span className="sb-ver">v3 — Elite · Reliable</span>
            </div>
          </aside>

          {/* ── MAIN AREA ── */}
          <main className="main-area">
            <AnimatePresence mode="wait">

              {step < 4 && (
                <motion.div key={`s${step}`} {...anim} className="form-wrap">
                  <div className="form-card">
                    <div className="fc-top-line"/>
                    <div className="fc-shine"/>

                    <div className="fc-header">
                      <div className="fc-step-tag">
                        <div className="fc-step-tag-dot"/>
                        STEP {step} OF 3
                      </div>
                      <div className="fc-dots">
                        {[1,2,3].map(n => <div key={n} className={`fc-dot ${n <= step ? 'on' : ''}`}/>)}
                      </div>
                    </div>

                    {/* ─── Step 1: Auth ─── */}
                    {step === 1 && (
                      <>
                        <div className="section-title">Authentication</div>
                        <div className="section-sub">
                          Paste your Discord token to establish a session. It's only used within
                          this local session — never transmitted to a third party.
                        </div>

                        {/* NEW: Quick Launch banner — one-click relaunch with saved config */}
                        {hasQuickLaunch && (
                          <div className={`quick-launch-banner${quickLaunchApplied ? ' applied' : ''}`}>
                            <span className="ql-icon">{quickLaunchApplied ? '✓' : '⚡'}</span>
                            <div className="ql-content">
                              <div className="ql-title">
                                {quickLaunchApplied ? 'Config Loaded' : 'Quick Launch Available'}
                              </div>
                              <div className="ql-sub">
                                {quickLaunchApplied
                                  ? (token.trim()
                                      ? 'Reviewing engine config…'
                                      : 'Enter your token below to continue')
                                  : `${quickLaunch.targets.length} target(s) saved · ${quickLaunch.threads.length} threads`}
                              </div>
                            </div>
                            {!quickLaunchApplied && (
                              <button className="ql-btn" onClick={applyQuickLaunch}>
                                Load Config
                              </button>
                            )}
                            {quickLaunchApplied && token.trim() && (
                              <button className="ql-btn" onClick={() => setStep(3)}>
                                Review &amp; Activate →
                              </button>
                            )}
                          </div>
                        )}

                        {/* Latency check banner */}
                        {gatewayLatency !== null && (
                          <div className={`latency-banner ${gatewayLatency > 500 ? 'warn' : 'ok'}`}>
                            <IPulse/>
                            <span>Discord gateway: <strong>{gatewayLatency}ms</strong></span>
                            {gatewayLatency > 500 && <span className="latency-warn">· high latency — clicks may be slow</span>}
                          </div>
                        )}

                        <Field
                          label="Discord Token" icon={<IKey/>} value={token}
                          onChange={v => { setToken(v); setWarn(false); setTokenValidated(null); setTokenError(''); }}
                          placeholder="Paste your token here…" type="password"
                          onEnter={() => { if (!token.trim()) { setWarn(true); return; } setStep(2); }}
                        />

                        {/* Token validation button + result */}
                        <div className="token-validate-row">
                          <button
                            className="btn-token-validate"
                            onClick={validateToken}
                            disabled={!token.trim() || tokenValidating}
                          >
                            {tokenValidating ? <><ILoader/> Checking…</> : <>Verify Token</>}
                          </button>
                          {tokenValidated && (
                            <span className="token-valid-badge">
                              <ICheck/> {tokenValidated.username}
                            </span>
                          )}
                          {tokenError && (
                            <span className="token-invalid-badge">
                              <IAlert/> {tokenError}
                            </span>
                          )}
                        </div>

                        {warn && <div className="warn-box"><IAlert/> A valid token is required to continue.</div>}
                        <button className="btn btn-primary fw"
                          onClick={() => { if (!token.trim()) { setWarn(true); return; } setStep(2); }}>
                          Continue <IArrow/>
                        </button>
                        <div className="enter-hint">or press <kbd>Enter</kbd></div>
                      </>
                    )}

                    {/* ─── Step 2: Target (Multi-target mode) ─── */}
                    {step === 2 && (
                      <>
                        <div className="section-title">Target Acquisition</div>
                        <div className="section-sub">
                          Add one or more Discord bots to monitor. Each target gets its own keyword.
                          The engine watches all targets simultaneously and clicks matching buttons in parallel.
                        </div>

                        {/* Target list */}
                        <div className="targets-list">
                          {targets.map((t, idx) => (
                            <div key={idx} className="target-row">
                              <div className="target-row-head">
                                <span className="target-row-num">#{idx + 1}</span>
                                {targets.length > 1 && (
                                  <button
                                    className="target-remove-btn"
                                    onClick={() => setTargets(targets.filter((_, i) => i !== idx))}
                                    title="Remove target"
                                  >✕</button>
                                )}
                              </div>
                              <Field
                                label="Bot User ID" icon={<ITgt/>}
                                value={t.targetId}
                                onChange={v => setTargets(targets.map((x, i) => i === idx ? { ...x, targetId: v } : x))}
                                placeholder="e.g. 1464707986499960883"
                                onEnter={() => { if (targets.filter(x => x.targetId.trim()).length > 0) setStep(3); }}
                              />
                              <Field
                                label="Keyword" icon={<IHash/>}
                                value={t.keyword}
                                onChange={v => setTargets(targets.map((x, i) => i === idx ? { ...x, keyword: v } : x))}
                                placeholder="e.g. join"
                                onEnter={() => { if (targets.filter(x => x.targetId.trim()).length > 0) setStep(3); }}
                              />
                              {/* Quick keyword chips for this target */}
                              <div className="kw-chips-mini">
                                {SUGGESTED_KW.slice(0, 5).map(w => (
                                  <span
                                    key={w}
                                    className={`kw-chip-mini ${t.keyword === w ? 'active' : ''}`}
                                    onClick={() => setTargets(targets.map((x, i) => i === idx ? { ...x, keyword: w } : x))}
                                  >{w}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add target button */}
                        {targets.length < 5 && (
                          <button
                            className="btn-add-target"
                            onClick={() => setTargets([...targets, { targetId: '', keyword: 'join' }])}
                          >
                            + Add Another Target
                          </button>
                        )}

                        <div className="btn-row">
                          <button className="btn btn-ghost" onClick={() => { setWarn(false); setStep(1); }}>← Back</button>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              const valid = targets.filter(t => t.targetId.trim());
                              if (valid.length > 0) {
                                setTid(valid[0].targetId);
                                setKw(valid[0].keyword);
                                setStep(3);
                              } else {
                                setWarn(true);
                              }
                            }}
                          >
                            Lock In <IArrow/>
                          </button>
                        </div>
                        {warn && <div className="warn-box"><IAlert/> Add at least one target with a Bot User ID.</div>}
                        <div className="enter-hint">or press <kbd>Enter</kbd></div>
                      </>
                    )}

                    {/* ─── Step 3: Config ─── */}
                    {step === 3 && (
                      <>
                        <div className="section-title">Engine Configuration</div>
                        <div className="section-sub">Set the trigger keyword and customize threads, then activate.</div>
                        <Field
                          label="Trigger Keyword" icon={<IHash/>} value={kw}
                          onChange={setKw} placeholder="e.g. join"
                          onEnter={launch}
                        />
                        <div className="kw-label">Quick Select</div>
                        <div className="kw-chips">
                          {SUGGESTED_KW.map(w => (
                            <span key={w} className={`kw-chip ${kw === w ? 'active' : ''}`}
                              onClick={() => setKw(w)}>{w}</span>
                          ))}
                        </div>

                        {/* Thread Count Stepper */}
                        <div className="threads-stepper-section">
                          <div className="field-label">
                            <IZap/> Thread Engine Count
                          </div>
                          <div className="stepper-wrap">
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={threads.length <= 1}
                              onClick={() => {
                                if (threads.length > 1) setThreads(threads.slice(0, -1));
                              }}
                            >-</button>
                            <span className="stepper-val">{threads.length} Threads</span>
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={threads.length >= 10}
                              onClick={() => {
                                if (threads.length < 10) setThreads([...threads, { delayMs: 1 }]);
                              }}
                            >+</button>
                          </div>
                        </div>

                        {/* Thread Individual Config Grid */}
                        <div className="thread-grid-section">
                          <div className="field-label">Custom Delays (ms)</div>
                          <div className="thread-grid">
                            {threads.map((t, idx) => {
                              const isBestPrimary = idx < 4;
                              return (
                                <div key={idx} className="thread-item-card">
                                  <div className="thread-item-header">
                                    <span className="thread-item-name">Thread {idx + 1}</span>
                                    {isBestPrimary ? (
                                      <span className="thread-best-tag primary">Primary</span>
                                    ) : (
                                      <span className="thread-best-tag backup">Backup</span>
                                    )}
                                  </div>

                                  <div className="thread-input-row">
                                    <input
                                      type="text"
                                      className="thread-input"
                                      value={t.delayMs}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        const newThreads = [...threads];
                                        newThreads[idx] = { delayMs: val === '' ? 0 : parseInt(val, 10) };
                                        setThreads(newThreads);
                                      }}
                                      placeholder="0"
                                    />
                                    <span className="thread-input-unit">ms</span>
                                  </div>

                                  <div className="thread-suggestions">
                                    {([0, 1, 2, 5] as const).map(ms => {
                                      const isBest = (isBestPrimary && ms === 0) || (!isBestPrimary && ms === 1);
                                      return (
                                        <button
                                          key={ms}
                                          type="button"
                                          className={`thread-suggestion-badge${t.delayMs === ms ? ' active' : ''}${isBest ? ' best' : ''}`}
                                          onClick={() => {
                                            const newThreads = [...threads];
                                            newThreads[idx] = { delayMs: ms };
                                            setThreads(newThreads);
                                          }}
                                          title={isBest ? "Recommended best delay" : undefined}
                                        >
                                          {ms}ms{isBest && "★"}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="spec-preview">
                          {/* Multi-target spec preview */}
                          {targets.filter(t => t.targetId.trim()).length <= 1 ? (
                            <>
                              <div className="spec-row"><span className="spec-key">Target</span><span className="spec-val">{tid}</span></div>
                              <div className="spec-row"><span className="spec-key">Keyword</span><span className="spec-val hi">"{kw}"</span></div>
                            </>
                          ) : (
                            <>
                              <div className="spec-row">
                                <span className="spec-key">Targets</span>
                                <span className="spec-val hi">{targets.filter(t => t.targetId.trim()).length} active</span>
                              </div>
                              {targets.filter(t => t.targetId.trim()).map((t, i) => (
                                <div key={i} className="spec-row spec-row-sub">
                                  <span className="spec-key">#{i+1}</span>
                                  <span className="spec-val">{t.targetId.slice(0,12)}… · "{t.keyword}"</span>
                                </div>
                              ))}
                            </>
                          )}
                          <div className="spec-row"><span className="spec-key">Threads</span><span className="spec-val hi">{threadSummary}</span></div>
                          <div className="spec-row"><span className="spec-key">Click Mode</span><span className="spec-val hi">Direct HTTP · discord.js bypassed</span></div>
                        </div>
                        <div className="btn-row">
                          <button className="btn btn-ghost" onClick={() => { setWarn(false); setStep(2); }}>← Back</button>
                          <button className="btn btn-activate" onClick={launch}><IZap/> Activate Engine</button>
                        </div>
                        <div className="enter-hint">or press <kbd>Enter</kbd> to activate</div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="live" {...anim} className="dashboard-wrap">
                  <div className={`live-bar${flash ? ' flash' : ''}`}>
                    <div className="live-ring">
                      <div className="live-dot"/>
                      <div className="live-pulse"/>
                    </div>
                    <span className="live-label">
                      {loading
                        ? (authProgress?.message || 'Authenticating…')
                        : 'Engine Running'}
                    </span>
                    {loading && <span className="live-auth-spin"><ILoader/></span>}
                    {/* NEW: Auth progress bar — shows live login status */}
                    {loading && authProgress && (
                      <span className="auth-progress-pill">
                        <span className={`auth-progress-dot ${authProgress.stage}`} />
                        {authProgress.stage === 'login' && 'Connecting…'}
                        {authProgress.stage === 'retry' && 'Retrying…'}
                        {authProgress.stage === 'ready' && 'Online'}
                        {authProgress.stage === 'failed' && 'Failed'}
                      </span>
                    )}
                    {!loading && lastDetected && <span className="live-last">↳ "{lastDetected}"</span>}
                    {/* NEW: Connection quality badge */}
                    {!loading && step === 4 && connQuality !== 'unknown' && (
                      <span className={`conn-quality ${connQuality}`} title={`Connection: ${connQuality}`}>
                        {connQuality === 'excellent' && '◆'}
                        {connQuality === 'good' && '◆'}
                        {connQuality === 'poor' && '◆'}
                      </span>
                    )}
                    <span className="live-uptime">{fmtUp(up)}</span>
                    {/* NEW: Test click button — simulates a fake MESSAGE_CREATE packet */}
                    <motion.button
                      className="btn-test-sm"
                      onClick={testClick}
                      title="Test the click engine with a fake button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      disabled={loading}
                    >
                      ▶ Test Click
                    </motion.button>
                    <motion.button
                      className="btn-restart-sm"
                      onClick={quickRestart}
                      title="Restart with same config"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      ↻ Restart
                    </motion.button>
                    <motion.button
                      className="btn-stop-sm"
                      onClick={kill}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <IPow/> Stop Session
                    </motion.button>
                  </div>

                  {/* Heartbeat Log Panel (toggled from top bar heartbeat indicator) */}
                  <AnimatePresence>
                    {showHbPanel && (
                      <motion.div
                        className="hb-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="hb-panel-head">
                          <IHeart/>
                          <span>Heartbeat Log</span>
                          <span className="hb-panel-info">Every 20s · {hbLogs.length} beats recorded</span>
                          <button className="hb-panel-close" onClick={() => setShowHbPanel(false)}>✕</button>
                        </div>
                        <div className="hb-panel-body">
                          {hbLogs.length === 0 ? (
                            <div className="hb-empty">Waiting for first heartbeat…</div>
                          ) : (
                            hbLogs.map((hb, i) => (
                              <div key={i} className={`hb-row ${hb.alive ? 'alive' : 'dead'}`}>
                                <span className="hb-row-icon">{hb.alive ? '♥' : '✗'}</span>
                                <span className="hb-row-ts">[{hb.ts}]</span>
                                <span className="hb-row-msg">
                                  {hb.alive ? `OK — last packet ${hb.ago}s ago` : `DEAD — no packet for ${hb.ago}s`}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="log-panel">
                    <div className="log-head">
                      <span className="log-title">Live Log</span>
                      <div className="log-filters">
                        {(['all','success','error','info'] as const).map(f => (
                          <span key={f} className={`log-filter ${filt === f ? 'on' : ''}`}
                            onClick={() => setFilt(f)}>{f}</span>
                        ))}
                      </div>
                      <div className="log-actions">
                        <button className={`autoscroll-btn ${autoScroll ? 'on' : ''}`}
                          onClick={() => setAutoScroll(v => !v)}>↓ Auto</button>
                        <div className="log-action-sep"/>
                        <button className={`log-action-btn ${copied ? 'ok' : ''}`} onClick={copyLogs} title="Copy logs to clipboard">
                          <ICopy/> {copied ? 'Copied!' : 'Copy'}
                        </button>
                        {/* NEW: CSV export */}
                        <button className="log-action-btn" onClick={exportLogsCSV} title="Export as CSV">
                          CSV
                        </button>
                        {/* NEW: JSON export */}
                        <button className="log-action-btn" onClick={exportLogsJSON} title="Export as JSON (with stats)">
                          JSON
                        </button>
                        <button className="log-action-btn" onClick={clearLogs}><ITrash/> Clear</button>
                      </div>
                    </div>

                    <div className="log-body" ref={logElRef}>
                      {filtered.length === 0
                        ? <div className="log-empty">Listening for events…<span className="cur"/></div>
                        : filtered.map(l => (
                          <div key={l.id} className="log-row">
                            <span className={`log-icon ${logIconCls(l)}`}>{logIconChar(l)}</span>
                            <span className="log-ts">[{l.ts}]</span>
                            <span className={`log-msg ${l.type}`}>{l.msg}</span>
                          </div>
                        ))
                      }
                    </div>

                    <div className="log-foot">
                      <span>{logs.length} events</span>
                      {lastEventStr && <span>Last: {lastEventStr}</span>}
                      {rate !== null && (
                        <span style={{ color: rate > 66 ? '#7cc87c' : rate > 33 ? '#c8aa6e' : '#d47575' }}>
                          Rate {rate}%
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </main>

          </>)}
        </div>
      </div>
    </>
  );
}
