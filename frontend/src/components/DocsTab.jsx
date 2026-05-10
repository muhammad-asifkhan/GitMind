import React, { useState, useMemo } from 'react';

const METHOD_STYLE = {
  GET:    { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7',  border: 'rgba(16,185,129,0.25)'  },
  POST:   { bg: 'rgba(99,102,241,0.12)', color: '#a5b4fc',  border: 'rgba(99,102,241,0.25)'  },
  PUT:    { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d',  border: 'rgba(245,158,11,0.25)'  },
  DELETE: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5',  border: 'rgba(239,68,68,0.25)'   },
  PATCH:  { bg: 'rgba(249,115,22,0.12)', color: '#fdba74',  border: 'rgba(249,115,22,0.25)'  },
  'N/A':  { bg: 'rgba(71,85,105,0.2)',   color: '#64748b',  border: 'rgba(71,85,105,0.25)'   },
};

const FILTERS = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function MethodBadge({ method }) {
  const style = METHOD_STYLE[method?.toUpperCase()] || METHOD_STYLE['N/A'];
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 6,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
      fontFamily: 'JetBrains Mono, monospace',
      background: style.bg, color: style.color,
      border: `1px solid ${style.border}`,
      flexShrink: 0,
    }}>
      {(method || 'N/A').toUpperCase()}
    </span>
  );
}

function EndpointCard({ doc, idx }) {
  return (
    <div
      className={`gm-card fade-up stagger-${Math.min(idx + 1, 10)}`}
      style={{ padding: '14px 18px', transition: 'border-color 0.2s, background 0.2s', cursor: 'default' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gm-border-2)'; e.currentTarget.style.background = 'var(--gm-surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gm-border)';   e.currentTarget.style.background = 'var(--gm-surface)';   }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <MethodBadge method={doc.method} />
        <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#818cf8', letterSpacing: '-0.01em', fontWeight: 500, wordBreak: 'break-all' }}>
          {doc.path || doc.route || '—'}
        </code>
      </div>
      {doc.description && (
        <div style={{ fontSize: 13, color: 'var(--gm-text-2)', lineHeight: 1.55, marginBottom: doc.parameters && doc.parameters !== 'None' && doc.parameters !== 'N/A' ? 8 : 0 }}>
          {doc.description}
        </div>
      )}
      {doc.parameters && doc.parameters !== 'None' && doc.parameters !== 'N/A' && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Params</span>
          <code style={{ fontSize: 11, color: 'var(--gm-text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{doc.parameters}</code>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => (
        <div key={i} className="gm-card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 180, height: 22, borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ width: '70%', height: 14, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

export default function DocsTab({ docs, isAnalyzing, analyzed }) {
  const [filter, setFilter] = useState('ALL');

  const filtered = useMemo(() => {
    if (!docs?.length) return [];
    if (filter === 'ALL') return docs;
    return docs.filter(d => (d.method || '').toUpperCase() === filter);
  }, [docs, filter]);

  const countFor = (m) => m === 'ALL' ? docs.length : docs.filter(d => (d.method || '').toUpperCase() === m).length;

  if (!analyzed && !isAnalyzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gm-surface)', border: '2px dashed var(--gm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>📋</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-2)', marginBottom: 6 }}>No endpoints yet</div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>Analyze a repository to discover all API endpoints</div>
        </div>
      </div>
    );
  }

  if (isAnalyzing && !docs?.length) {
    return (
      <div>
        <div style={{ fontSize: 13, color: '#c084fc', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'gm-glow-pulse 1.5s ease-in-out infinite', display: 'inline-block' }}>📋</span>
          API Doc Agent is scanning for endpoints…
        </div>
        <Skeleton />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>
          <span style={{ color: 'var(--gm-text-1)', fontWeight: 600 }}>{docs.length}</span> endpoint{docs.length !== 1 ? 's' : ''} found
        </div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.filter(m => m === 'ALL' || countFor(m) > 0).map(m => {
            const active  = filter === m;
            const mStyle  = METHOD_STYLE[m] || {};
            return (
              <button key={m} onClick={() => setFilter(m)} style={{
                padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: active ? (mStyle.bg || 'var(--gm-primary-20)') : 'rgba(255,255,255,0.04)',
                color:      active ? (mStyle.color || 'var(--gm-primary)')  : 'var(--gm-text-3)',
                border: `1px solid ${active ? (mStyle.border || 'var(--gm-primary-30)') : 'var(--gm-border)'}`,
                transition: 'all 0.15s',
              }}>
                {m}{m !== 'ALL' && ` · ${countFor(m)}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gm-text-3)', fontSize: 13 }}>
          No {filter} endpoints found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((doc, i) => <EndpointCard key={`${doc.method}-${doc.path || doc.route}-${i}`} doc={doc} idx={i} />)}
        </div>
      )}
    </div>
  );
}
