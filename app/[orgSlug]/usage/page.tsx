'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';

// S32 — 📊 Usage: per-org chat-turn rollup. DIRECTIONAL — not billing-grade.

interface DayCount { date: string; count: number }
interface AgentCount { agent: string; count: number }
interface ChannelCount {
  channelId: string;
  channelName: string;
  agent: string;
  count: number;
  ctxTokens: number | null;
  ctxPct: number | null;
  ctxUpdatedAt: string | null;
}
interface UsageData {
  days: number;
  truncated: boolean;
  totalTurns: number;
  activeChannels: number;
  byDay: DayCount[];
  byAgent: AgentCount[];
  byChannel: ChannelCount[];
  hasTokenData: boolean;
}

const card: React.CSSProperties = {
  background: 'var(--panel, #1e1f22)',
  border: '1px solid var(--border, #2b2d31)',
  borderRadius: 10,
  padding: '14px 16px',
};

const th: React.CSSProperties = {
  textAlign: 'left', padding: '6px 10px', fontSize: 12, color: 'var(--muted)',
  fontWeight: 600, borderBottom: '1px solid var(--border, #2b2d31)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, borderBottom: '1px solid var(--border, #2b2d31)',
};

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? 6 : dow - 1; // back to Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export default function UsagePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/usage?org=${orgSlug}&days=${days}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); setData(null); }
        else setData(j);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, days]);

  const byWeek = useMemo(() => {
    if (!data) return [] as { week: string; count: number }[];
    const m = new Map<string, number>();
    for (const d of data.byDay) {
      const w = weekStart(d.date);
      m.set(w, (m.get(w) ?? 0) + d.count);
    }
    return [...m.entries()].map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }, [data]);

  const maxDay = useMemo(
    () => Math.max(1, ...(data?.byDay ?? []).map((d) => d.count)),
    [data]
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 980, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📊 Usage</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                border: '1px solid var(--border, #2b2d31)',
                background: days === d ? 'var(--accent)' : 'transparent',
                color: days === d ? '#fff' : 'var(--muted)',
              }}
            >{d}d</button>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
        background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#eab308',
      }}>
        ⚠️ <strong>Directional — not billing-grade.</strong> Counts are agent chat turns from portal
        message history; they have not been reconciled against provider invoices. Context tokens are
        point-in-time session snapshots, not cumulative usage.
      </div>

      {loading && <div style={{ marginTop: 24, color: 'var(--muted)', fontSize: 14 }}>Loading usage…</div>}
      {error && <div style={{ marginTop: 24, color: '#ef4444', fontSize: 14 }}>Error: {error}</div>}

      {data && !loading && (
        <>
          {data.truncated && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#eab308' }}>
              Note: result window capped — counts for this range are a lower bound.
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 18 }}>
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Agent turns ({data.days}d)</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{data.totalTurns.toLocaleString()}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Active channels</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{data.activeChannels}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Avg turns / day</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
                {(data.totalTurns / Math.max(1, data.days)).toFixed(1)}
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Busiest agent</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                {data.byAgent[0]?.agent ?? '—'}
              </div>
            </div>
          </div>

          {/* Daily bar chart */}
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Turns per day</div>
            {data.byDay.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No agent messages in this range.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                {data.byDay.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count} turns`}
                    style={{
                      flex: 1, minWidth: 2, borderRadius: '2px 2px 0 0',
                      background: 'var(--accent, #5865f2)', opacity: 0.85,
                      height: `${Math.max(3, (d.count / maxDay) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            )}
            {data.byDay.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                <span>{data.byDay[0].date}</span>
                <span>{data.byDay[data.byDay.length - 1].date}</span>
              </div>
            )}
          </div>

          {/* Weekly rollup + by agent */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>By week</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Week of</th><th style={{ ...th, textAlign: 'right' }}>Turns</th></tr></thead>
                <tbody>
                  {byWeek.map((w) => (
                    <tr key={w.week}>
                      <td style={td}>{w.week}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{w.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {byWeek.length === 0 && <tr><td style={td} colSpan={2}>—</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>By agent</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Agent</th><th style={{ ...th, textAlign: 'right' }}>Turns</th></tr></thead>
                <tbody>
                  {data.byAgent.map((a) => (
                    <tr key={a.agent}>
                      <td style={td}>{a.agent}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{a.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.byAgent.length === 0 && <tr><td style={td} colSpan={2}>—</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* By channel */}
          <div style={{ ...card, marginTop: 16, marginBottom: 32, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>By channel</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Channel</th>
                  <th style={th}>Agent</th>
                  <th style={{ ...th, textAlign: 'right' }}>Turns</th>
                  {data.hasTokenData && <th style={{ ...th, textAlign: 'right' }}>Context tokens (snapshot)</th>}
                </tr>
              </thead>
              <tbody>
                {data.byChannel.map((c) => (
                  <tr key={c.channelId}>
                    <td style={td}>{c.channelName}</td>
                    <td style={td}>{c.agent}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c.count.toLocaleString()}</td>
                    {data.hasTokenData && (
                      <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>
                        {c.ctxTokens != null
                          ? `${c.ctxTokens.toLocaleString()}${c.ctxPct != null ? ` (${Math.round(Number(c.ctxPct))}%)` : ''}`
                          : '—'}
                      </td>
                    )}
                  </tr>
                ))}
                {data.byChannel.length === 0 && <tr><td style={td} colSpan={4}>—</td></tr>}
              </tbody>
            </table>
            {data.hasTokenData && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                Context tokens are the current session context size per channel — a live snapshot,
                not cumulative token usage. No per-message token data exists yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
