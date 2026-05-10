import React, { useState, useEffect, useRef } from 'react';
import { WS_BASE } from '../api';

const SEV_COLOR  = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#06b6d4' };
const ROLE_COLOR = { CEO: '#fcd34d', Legal: '#a5b4fc', Engineering: '#6ee7b7', Reporter: '#fca5a5' };
const WS_URL     = `${WS_BASE}/ws/crisis`;
const REPORTER_INTERVAL = 45;

export default function CrisisChat({ finding, sessionId, onClose }) {
  const [messages,  setMessages]  = useState([]);
  const [countdown, setCountdown] = useState(REPORTER_INTERVAL);
  const [resolved,  setResolved]  = useState(false);
  const [leaked,    setLeaked]    = useState(false);
  const [error,     setError]     = useState(null);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);
  const wsRef     = useRef(null);

  // ── WebSocket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!finding || !sessionId) return;

    // Per-WebSocket flag: each effect run owns its own `alive` variable so that
    // late events (ws.onerror that fires AFTER cleanup) from a previously-closed
    // socket can't trigger setState on the live one. A shared ref would not
    // work — React StrictMode double-mounts in dev, and mount #2 would re-set
    // the ref to true before mount #1's stale events finished firing.
    let alive          = true;
    let receivedAnyMsg = false;

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setError('WebSocket unavailable.');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!alive) return;
      setConnected(true);
      ws.send(JSON.stringify({ session_id: sessionId, finding_id: finding.id }));
    };

    ws.onmessage = (evt) => {
      if (!alive) return;
      receivedAnyMsg = true;
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.kind === 'leak') {
        setMessages(prev => [...prev, {
          role:  'Reporter',
          color: ROLE_COLOR.Reporter,
          text:  data.content,
          isLeak: true,
        }]);
        setLeaked(true);
        return;
      }

      if (data.kind === 'resolved') {
        setResolved(true);
        return;
      }

      if (data.kind === 'tick' || data.kind === 'end') {
        return;
      }

      if (data.kind === 'message' && data.agent) {
        setMessages(prev => [...prev, {
          role:  data.agent,
          color: ROLE_COLOR[data.agent] || '#94a3b8',
          text:  data.content,
        }]);
        // Reset reporter timer on each agent statement
        setCountdown(REPORTER_INTERVAL);
      }
    };

    // Suppress the error banner if we already received messages — that means
    // the connection really worked and onerror is just the normal "server
    // closed the socket" event at the end of the crisis.
    ws.onerror = () => {
      if (!alive || receivedAnyMsg) return;
      setError('Cannot reach backend on port 8001. Is uvicorn running?');
      setConnected(false);
    };

    ws.onclose = () => {
      if (alive) setConnected(false);
    };

    return () => {
      alive = false;
      try { ws.close(); } catch {}
    };
  }, [finding, sessionId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Reporter countdown timer (visual) ──────────────────────────────────────
  useEffect(() => {
    if (resolved || leaked || error) return;
    const id = setInterval(() => {
      setCountdown(c => (c <= 0 ? REPORTER_INTERVAL : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resolved, leaked, error]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const sevColor    = SEV_COLOR[finding.severity?.toLowerCase()] || '#ef4444';
  const timerDanger = countdown <= 10 && !resolved && !leaked;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        className="slide-in-right"
        style={{
          width: '100%', maxWidth: 560, height: '100%',
          display: 'flex', flexDirection: 'column',
          background: '#0a0505',
          borderLeft: `1px solid ${sevColor}30`,
          boxShadow: `-8px 0 40px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${sevColor}25`,
          background: `linear-gradient(180deg, ${sevColor}08 0%, transparent 100%)`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: sevColor }}>
                  🚨 Crisis Room
                </span>
                <span style={{ fontSize: 10, color: 'var(--gm-text-3)' }}>· {finding.severity?.toUpperCase()}</span>
                {connected && !resolved && !leaked && (
                  <span style={{
                    fontSize: 9, color: '#6ee7b7',
                    padding: '1px 6px', borderRadius: 999,
                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                  }}>● LIVE</span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, marginBottom: 4 }}>
                {finding.title}
              </div>
              <code style={{ fontSize: 11, color: 'var(--gm-text-3)', fontFamily: 'JetBrains Mono, monospace' }}>
                {finding.file}{finding.line_start ? `:${finding.line_start}` : ''}
              </code>
            </div>

            {!resolved && !leaked && !error && (
              <div style={{
                flexShrink: 0, textAlign: 'center',
                padding: '8px 14px', borderRadius: 10,
                background: timerDanger ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${timerDanger ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                animation: timerDanger ? 'gm-critical-pulse 0.8s ease-in-out infinite' : 'none',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: timerDanger ? '#fca5a5' : 'var(--gm-text-3)', marginBottom: 3 }}>
                  📰 Reporter
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: timerDanger ? '#ef4444' : '#f59e0b', lineHeight: 1 }}>
                  0:{String(countdown).padStart(2, '0')}
                </div>
              </div>
            )}

            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gm-text-3)', fontSize: 20, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--gm-text-3)'; }}>
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            {[['CEO', ROLE_COLOR.CEO], ['Legal', ROLE_COLOR.Legal], ['Engineering', ROLE_COLOR.Engineering]].map(([role, color]) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--gm-text-3)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {role}
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              fontSize: 12, color: '#fca5a5', whiteSpace: 'pre-wrap',
            }}>⚠ {error}</div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="fade-up">
              <div style={{ fontSize: 10, fontWeight: 700, color: msg.color, letterSpacing: '0.06em', marginBottom: 5 }}>
                {msg.role}{msg.isLeak && ' · BREAKING NEWS'}
              </div>
              <div style={{
                padding: '11px 14px', borderRadius: '4px 14px 14px 14px',
                background: msg.isLeak ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${msg.isLeak ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                fontSize: 13, color: '#e2e8f0', lineHeight: 1.65,
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {connected && !resolved && !leaked && messages.length === 0 && !error && (
            <div style={{ display: 'flex', gap: 4, paddingLeft: 4 }}>
              {[0, 150, 300].map(d => (
                <span key={d} className="dot-bounce" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gm-text-3)', display: 'block', animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}

          {resolved && (
            <div className="fade-up" style={{
              padding: '16px 18px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6ee7b7' }}>Incident Contained</div>
              <div style={{ fontSize: 12, color: 'var(--gm-text-3)', marginTop: 4 }}>Team issued Legal-approved statement before the reporter published.</div>
            </div>
          )}

          {leaked && (
            <div className="fade-up" style={{
              padding: '16px 18px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>📰</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5' }}>BREAKING: Reporter Published</div>
              <div style={{ fontSize: 12, color: 'var(--gm-text-3)', marginTop: 4 }}>The team failed to contain the incident in time. Story is live.</div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--gm-text-2)', fontSize: 13, fontWeight: 500,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          >
            Close Crisis Room
          </button>
        </div>
      </div>
    </div>
  );
}
