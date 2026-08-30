'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface HealthItem {
  integration: string;
  icon: string;
  account: string | null;
  status: 'healthy' | 'needs_reconnect' | 'error' | 'not_configured';
  detail: string;
  reconnectUrl: string | null;
  lastSuccess: string | null;
}

interface AgentHealth {
  agentId: string;
  agentName: string;
  loading: boolean;
  error: string | null;
  items: HealthItem[];
}

const STATUS_META: Record<string, { dot: string; label: string; color: string }> = {
  healthy:         { dot: '🟢', label: 'Healthy',          color: '#22c55e' },
  needs_reconnect: { dot: '🔴', label: 'Needs reconnect',  color: '#ef4444' },
  error:           { dot: '🟡', label: 'Check failed',     color: '#eab308' },
  not_configured:  { dot: '⚪', label: 'Not configured',   color: 'var(--muted)' },
};

export default function HealthPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [role, setRole] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) { setLoaded(true); return; }
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: pu } = await supabase.from('portal_users').select('role')
          .eq('supabase_auth_id', authData.user.id).eq('org_id', org.id).single();
        setRole(pu?.role ?? '');
      }
      const { data: channels } = await supabase.from('portal_channels')
        .select('agent_id').eq('org_id', org.id).eq('active', true);
      const agentIds = [...new Set((channels ?? []).map((c: any) => c.agent_id).filter(Boolean))];
      if (!agentIds.length) { setLoaded(true); return; }
      const { data: agentList } = await supabase.from('agents')
        .select('id, name, display_name').in('id', agentIds);
      const initial: AgentHealth[] = (agentList ?? []).map((a: any) => ({
        agentId: a.id, agentName: a.display_name || a.name, loading: true, error: null, items: [],
      }));
      setAgents(initial);
      setLoaded(true);
      // Fan out health checks — each agent independently so slow SSH doesn't block the page
      initial.forEach(async (a) => {
        try {
          const res = await fetch('/api/integrations/health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: a.agentId }),
          });
          const j = await res.json();
          setAgents((prev) => prev.map((p) => p.agentId === a.agentId
            ? { ...p, loading: false, error: res.ok ? null : (j.error ?? `HTTP ${res.status}`), items: j.items ?? [] }
            : p));
        } catch (e: any) {
          setAgents((prev) => prev.map((p) => p.agentId === a.agentId
            ? { ...p, loading: false, error: String(e?.message ?? e) } : p));
        }
      });
    })();
  }, [orgSlug, supabase]);

  const problems = agents.flatMap((a) => a.items.filter((i) => i.status === 'needs_reconnect'));

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>🩺 Integrations Health</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Live checks — token refresh, API keys, database reachability. Admin only.
      </p>

      {problems.length > 0 && (
        <div style={{ border: '1px solid #ef4444', borderRadius: 10, padding: '10px 14px', margin: '12px 0', fontSize: 14 }}>
          🔴 <strong>{problems.length} integration{problems.length > 1 ? 's' : ''} need{problems.length === 1 ? 's' : ''} attention</strong>
          {' — '}{problems.map((p) => p.integration).join(', ')}
        </div>
      )}

      {!loaded ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : agents.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No agents in this org.</p>
      ) : (
        agents.map((a) => (
          <div key={a.agentId} style={{ margin: '18px 0' }}>
            <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{a.agentName}</h3>
            {a.loading ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Running live checks…</p>
            ) : a.error ? (
              <p style={{ color: '#eab308', fontSize: 13 }}>⚠️ {a.error}</p>
            ) : a.items.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No integrations configured.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {a.items.map((it, idx) => {
                  const meta = STATUS_META[it.status] ?? STATUS_META.error;
                  return (
                    <div key={idx} style={{
                      border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px',
                      display: 'flex', gap: 12, alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 17 }}>{it.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {it.integration}
                          {it.account && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {it.account}</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{it.detail}</div>
                      </div>
                      <span style={{ fontSize: 13, color: meta.color, fontWeight: 600, flexShrink: 0 }}>
                        {meta.dot} {meta.label}
                      </span>
                      {it.status === 'needs_reconnect' && it.reconnectUrl && ['owner', 'admin'].includes(role) && (
                        <a href={it.reconnectUrl} style={{
                          flexShrink: 0, fontSize: 13, padding: '5px 12px', borderRadius: 8,
                          background: 'var(--accent)', color: '#fff', textDecoration: 'none',
                        }}>Reconnect</a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
