'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { INTEGRATIONS, CATEGORIES, type Integration } from '@/lib/integrations';

interface SavedVar {
  key: string;
  value: string;
  integration_id: string;
}

function isConnected(integration: Integration, savedVars: SavedVar[]): 'connected' | 'partial' | 'disconnected' {
  // OAuth integrations: connected = has account email (written back after OAuth callback)
  if (integration.authType === 'oauth') {
    const saved = savedVars.filter(v => v.integration_id === integration.id);
    const hasAccount = saved.some(v => v.key === 'GOOGLE_ACCOUNT_EMAIL' || v.key === 'MS_ACCOUNT_EMAIL');
    return hasAccount ? 'connected' : 'disconnected';
  }
  const required = integration.fields.filter(f => f.required);
  const saved = savedVars.filter(v => v.integration_id === integration.id);
  const savedKeys = new Set(saved.map(v => v.key));
  const allRequired = required.every(f => savedKeys.has(f.key));
  const anyRequired = required.some(f => savedKeys.has(f.key));
  if (allRequired && required.length > 0) return 'connected';
  if (anyRequired) return 'partial';
  return 'disconnected';
}

function ConnectCard({
  integration,
  savedVars,
  agentId,
  onSaved,
  onDisconnect,
}: {
  integration: Integration;
  savedVars: SavedVar[];
  agentId: string;
  onSaved: () => void;
  onDisconnect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const status = isConnected(integration, savedVars);

  const statusColor = status === 'connected' ? '#22c55e' : status === 'partial' ? '#f59e0b' : 'var(--muted)';
  const statusLabel = status === 'connected' ? 'Connected' : status === 'partial' ? 'Incomplete' : 'Not connected';

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: integration.id, vars: fields }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Save failed'); return; }
      setSuccess(`${data.saved} key${data.saved !== 1 ? 's' : ''} saved`);
      setFields({});
      onSaved();
      setTimeout(() => { setSuccess(''); setExpanded(false); }, 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: 'var(--sidebar-bg)',
      border: `1px solid ${status === 'connected' ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
      >
        <span style={{ fontSize: '22px', flexShrink: 0 }}>{integration.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{integration.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>{integration.description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>
            {status === 'connected' ? '✓ ' : ''}{statusLabel}
          </span>
          {status === 'connected' && (
            <button
              onClick={e => { e.stopPropagation(); onDisconnect(integration.id); }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px', padding: '2px 8px' }}
            >
              Remove
            </button>
          )}
          <span style={{ color: 'var(--muted)', fontSize: '12px', transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {integration.note && (
            <div style={{ margin: '12px 0 8px', padding: '8px 10px', background: 'rgba(76,139,240,0.08)', borderRadius: '6px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
              ℹ️ {integration.note}
              {integration.docsUrl && (
                <a href={integration.docsUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '4px', color: 'var(--accent)', textDecoration: 'none', fontSize: '11px' }}>
                  → Documentation ↗
                </a>
              )}
            </div>
          )}

          {/* OAuth flow — show Connect button instead of key fields */}
          {integration.authType === 'oauth' && integration.id === 'google' && (
            <div style={{ marginTop: '14px' }}>
              {status === 'connected' ? (
                <div style={{ fontSize: '13px', color: '#22c55e', padding: '8px 0' }}>
                  ✓ Connected — token written to workspace
                </div>
              ) : (
                <a
                  href={`/api/oauth/google?agentId=${agentId}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', background: '#fff', border: '1px solid #dadce0',
                    borderRadius: '6px', color: '#3c4043', fontWeight: 600, fontSize: '14px',
                    textDecoration: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.2 30.2 0 24 0 14.6 0 6.6 5.3 2.7 13.1l7.9 6.1C12.5 13 17.8 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 3-2.2 5.5-4.7 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-16.9z" />
                    <path fill="#FBBC05" d="M10.6 28.5A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.5L2.4 13.4A23.8 23.8 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.1-6.1z"/>
                    <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.7c-2 1.4-4.6 2.2-7.8 2.2-6.2 0-11.5-4.2-13.4-9.8l-8 6.2C6.4 42.7 14.6 48 24 48z"/>
                  </svg>
                  Sign in with Google
                </a>
              )}
            </div>
          )}

          {/* Standard API key form */}
          {integration.authType !== 'oauth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
            {integration.fields.map(field => (
              <div key={field.key}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 500 }}>
                  {field.label}{field.required && <span style={{ color: '#da3633' }}> *</span>}
                </label>
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={fields[field.key] ?? ''}
                  onChange={e => setFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ?? ''}
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
                    color: 'var(--text)', fontSize: '13px', fontFamily: 'monospace',
                    boxSizing: 'border-box', outline: 'none',
                  }}
                />
                {field.hint && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{field.hint}</div>}
              </div>
            ))}
          </div>
          )}

          {integration.authType !== 'oauth' && (
          <>
          {error && <div style={{ marginTop: '10px', fontSize: '12px', color: '#da3633', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', padding: '7px 10px' }}>{error}</div>}
          {success && <div style={{ marginTop: '10px', fontSize: '12px', color: '#22c55e', background: 'rgba(34,197,94,0.08)', borderRadius: '6px', padding: '7px 10px' }}>✓ {success}</div>}

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setExpanded(false); setFields({}); setError(''); }} style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || Object.keys(fields).length === 0}
              style={{ padding: '7px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: saving || Object.keys(fields).length === 0 ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const searchParams = useSearchParams();
  const connectedParam = searchParams.get('connected');

  const [agentName, setAgentName] = useState('');
  const [savedVars, setSavedVars] = useState<SavedVar[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [oauthBanner, setOauthBanner] = useState<string | null>(
    connectedParam ? `✓ ${connectedParam.charAt(0).toUpperCase() + connectedParam.slice(1)} connected successfully` : null
  );

  useEffect(() => {
    supabase.from('agents').select('display_name').eq('id', agentId).single()
      .then(({ data }) => { if (data) setAgentName(data.display_name); });
    loadVars();
  }, [agentId]);

  async function loadVars() {
    setLoading(true);
    const res = await fetch(`/api/agents/${agentId}/env-vars`);
    if (res.ok) setSavedVars(await res.json());
    setLoading(false);
  }

  async function handleDisconnect(integrationId: string) {
    if (!confirm(`Remove all credentials for ${integrationId}?`)) return;
    await fetch(`/api/agents/${agentId}/env-vars`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    });
    loadVars();
  }

  const filtered = activeCategory === 'all'
    ? INTEGRATIONS
    : INTEGRATIONS.filter(i => {
        if (activeCategory === 'sms') return i.category === 'sms' || i.category === 'voice';
        return i.category === activeCategory;
      });

  const connectedCount = INTEGRATIONS.filter(i => isConnected(i, savedVars) === 'connected').length;

  return (
    <div className="page-scroll">
      <div style={{ padding: '28px 24px', maxWidth: '640px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button onClick={() => router.push(`/${orgSlug}/settings`)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: 0, marginBottom: '12px' }}>← Back to Settings</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>Integrations</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>{agentName} · {connectedCount} connected</div>
            </div>
          </div>
        </div>

        {/* OAuth success banner */}
        {oauthBanner && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', fontSize: '13px', color: '#22c55e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {oauthBanner}
            <button onClick={() => setOauthBanner(null)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        )}

        {/* Category filter */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                border: activeCategory === cat.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeCategory === cat.id ? 'rgba(76,139,240,0.15)' : 'none',
                color: activeCategory === cat.id ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Integration cards */}
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '20px 0' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(integration => (
              <ConnectCard
                key={integration.id}
                integration={integration}
                savedVars={savedVars}
                agentId={agentId}
                onSaved={loadVars}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
