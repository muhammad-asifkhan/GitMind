import React, { useState, useMemo } from 'react';

const SEV = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  icon: '🔴' },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', icon: '🟠' },
  medium:   { label: 'Medium',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: '🟡' },
  low:      { label: 'Low',      color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.25)',  icon: '🔵' },
};
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];

function SeverityBadge({ severity }) {
  const s = SEV[severity?.toLowerCase()] || SEV.low;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6, fontSize: 10, fontWeight: 800,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function FindingCard({ finding, idx, onCrisis }) {
  const [expanded, setExpanded] = useState(false);
  const sev     = finding.severity?.toLowerCase() || 'low';
  const sevInfo = SEV[sev] || SEV.low;
  const canCrisis = sev === 'critical' || sev === 'high';

  return (
    <div
      className={`gm-card severity-${sev} fade-up stagger-${Math.min(idx + 1, 10)}`}
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        userSelect: 'none',
      }}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--gm-surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--gm-surface)';   }}
    >
      {/* ── Top row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <SeverityBadge severity={finding.severity} />
          {finding.file && (
            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#818cf8' }}>
              {finding.file}{finding.line_start ? `:${finding.line_start}` : ''}
            </code>
          )}
        </div>
        {/* Expand chevron */}
        <span style={{
          color: 'var(--gm-text-3)', fontSize: 12, flexShrink: 0, marginTop: 2,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s',
        }}>▼</span>
      </div>

      {/* ── Title ── */}
      <div style={{ fontSize: 13, fontWeight: 700, color: sevInfo.color, margin: '10px 0 0', lineHeight: 1.35 }}>
        {finding.title || 'Untitled finding'}
      </div>

      {/* ── Collapsed summary ── */}
      {!expanded && finding.exploit_story && (
        <div style={{ fontSize: 12, color: 'var(--gm-text-3)', marginTop: 6, lineHeight: 1.5,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {finding.exploit_story}
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          {/* Exploit story */}
          {finding.exploit_story && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 8,
              background: `${sevInfo.color}08`,
              borderLeft: `3px solid ${sevInfo.color}40`,
              fontSize: 13, color: 'var(--gm-text-2)', lineHeight: 1.65,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: sevInfo.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                Exploit Scenario
              </div>
              {finding.exploit_story}
            </div>
          )}

          {/* File + line details */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {finding.file && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>File</div>
                <code style={{ fontSize: 12, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace' }}>{finding.file}</code>
              </div>
            )}
            {finding.line_start && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Line</div>
                <code style={{ fontSize: 12, color: 'var(--gm-text-2)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {finding.line_start}{finding.line_end && finding.line_end !== finding.line_start ? `–${finding.line_end}` : ''}
                </code>
              </div>
            )}
            {finding.id && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>ID</div>
                <code style={{ fontSize: 12, color: 'var(--gm-text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{finding.id}</code>
              </div>
            )}
          </div>

          {/* Crisis button */}
          {canCrisis && (
            <button
              className="gm-btn-danger"
              style={{ marginTop: 14, width: '100%', justifyContent: 'center', padding: '10px' }}
              onClick={(e) => { e.stopPropagation(); onCrisis(finding); }}
            >
              ⚡ Simulate Crisis — What happens when this leaks at 2 a.m.?
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBar({ findings }) {
  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter(f => f.severity?.toLowerCase() === s).length;
    return acc;
  }, {});
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      {SEV_ORDER.map(s => {
        if (!counts[s]) return null;
        const info = SEV[s];
        return (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: info.bg, border: `1px solid ${info.border}`,
            fontSize: 12, fontWeight: 700, color: info.color,
          }}>
            {info.icon} {counts[s]} {info.label}
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="gm-card" style={{ padding: '16px 18px', borderLeft: '3px solid var(--gm-border)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div className="skeleton" style={{ width: 80, height: 22, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 140, height: 22, borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ width: '55%', height: 14, borderRadius: 4, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '85%', height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

export default function SecurityTab({ findings, isAnalyzing, analyzed, onCrisis }) {
  const [filter, setFilter] = useState('all');

  const sorted = useMemo(() => {
    const list = findings?.length
      ? (filter === 'all' ? findings : findings.filter(f => f.severity?.toLowerCase() === filter))
      : [];
    return [...list].sort((a, b) => {
      const ai = SEV_ORDER.indexOf(a.severity?.toLowerCase());
      const bi = SEV_ORDER.indexOf(b.severity?.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [findings, filter]);

  if (!analyzed && !isAnalyzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gm-surface)', border: '2px dashed var(--gm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🛡</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-2)', marginBottom: 6 }}>No scan results yet</div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>Analyze a repository to run the Security Auditor</div>
        </div>
      </div>
    );
  }

  if (isAnalyzing && !findings?.length) {
    return (
      <div>
        <div style={{ fontSize: 13, color: '#fcd34d', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'gm-glow-pulse 1.5s ease-in-out infinite', display: 'inline-block' }}>🛡</span>
          Security Auditor is running semgrep scan…
        </div>
        <Skeleton />
      </div>
    );
  }

  if (analyzed && !findings?.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#6ee7b7' }}>No vulnerabilities detected</div>
        <div style={{ fontSize: 13, color: 'var(--gm-text-3)', maxWidth: 460 }}>
          The Security Auditor ran semgrep against this repo and found nothing —
          either it really is clean, or no rules matched the languages in use.
        </div>
        <div style={{ fontSize: 12, color: 'var(--gm-text-3)', marginTop: 12, padding: '10px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', maxWidth: 460 }}>
          💡 Want to see Crisis Mode? Try a deliberately-vulnerable repo like{' '}
          <code style={{ fontFamily: 'JetBrains Mono, monospace', color: '#a5b4fc', fontSize: 11 }}>
            github.com/OWASP/NodeGoat
          </code>
        </div>
      </div>
    );
  }

  const countFor = s => s === 'all' ? findings.length : findings.filter(f => f.severity?.toLowerCase() === s).length;

  return (
    <div>
      <SummaryBar findings={findings} />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'All Findings'], ...SEV_ORDER.map(s => [s, SEV[s].label])].map(([key, label]) => {
          const count  = countFor(key);
          if (key !== 'all' && !count) return null;
          const active = filter === key;
          const info   = SEV[key];
          return (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: active ? (info?.bg || 'var(--gm-primary-20)') : 'rgba(255,255,255,0.04)',
              color:      active ? (info?.color || 'var(--gm-primary)') : 'var(--gm-text-3)',
              border: `1px solid ${active ? (info?.border || 'var(--gm-primary-30)') : 'var(--gm-border)'}`,
              transition: 'all 0.15s',
            }}>
              {label} · {count}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      <div style={{ fontSize: 11, color: 'var(--gm-text-3)', marginBottom: 12 }}>
        💡 Click any finding to expand details
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((f, i) => (
          <FindingCard key={f.id || i} finding={f} idx={i} onCrisis={onCrisis} />
        ))}
      </div>
    </div>
  );
}
