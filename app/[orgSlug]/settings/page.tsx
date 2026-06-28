'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [orgName, setOrgName] = useState('');
  const [orgNameEdit, setOrgNameEdit] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orgId, setOrgId] = useState('');
  const installPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    const handler = (e: any) => {
      e.preventDefault();
      installPrompt.current = e;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt.current) return;
    installPrompt.current.prompt();
    const { outcome } = await installPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setCanInstall(false);
    }
  }

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase.from('organizations').select('id, name').eq('slug', orgSlug).single();
      if (org) {
        setOrgName(org.name);
        setOrgNameEdit(org.name);
        setOrgId(org.id);
        const { data: members } = await supabase.from('portal_users').select('id, name, email, role').eq('org_id', org.id).order('role');
        setUsers(members ?? []);
      }
    }
    load();
  }, [orgSlug]);

  async function saveOrgName() {
    if (!orgNameEdit.trim() || orgNameEdit === orgName) return;
    setSaving(true);
    await supabase.from('organizations').update({ name: orgNameEdit.trim() }).eq('id', orgId);
    setOrgName(orgNameEdit.trim());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function removeUser(userId: string) {
    if (!confirm('Remove this user from the portal?')) return;
    await supabase.from('portal_users').delete().eq('id', userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
  }

  return (
    <div style={{ padding: '32px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '32px' }}>Settings</div>

      {/* Install App */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>App</div>
        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Install to Home Screen</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Add the portal as an app on your device</div>
          </div>
          {installed ? (
            <span style={{ fontSize: '12px', color: '#2ea043', fontWeight: 600 }}>✓ Installed</span>
          ) : canInstall ? (
            <button onClick={handleInstall} style={{
              padding: '7px 14px', background: 'var(--accent)', border: 'none', borderRadius: '6px',
              color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '13px', flexShrink: 0,
            }}>Install</button>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Use Share → Add to Home Screen</span>
          )}
        </div>
      </section>

      {/* Org name */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Organization</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={orgNameEdit}
            onChange={e => setOrgNameEdit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveOrgName()}
            style={{
              flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
              color: 'var(--text)', padding: '9px 12px', fontSize: '14px',
            }}
          />
          <button
            onClick={saveOrgName}
            disabled={saving || orgNameEdit === orgName || !orgNameEdit.trim()}
            style={{
              padding: '9px 16px', background: saved ? '#2ea043' : 'var(--accent)', border: 'none',
              borderRadius: '6px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
              opacity: (saving || orgNameEdit === orgName) ? 0.5 : 1, minWidth: '72px',
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Users */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Team Members</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {users.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '12px 14px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, flexShrink: 0,
              }}>
                {u.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{u.email}</div>
              </div>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                background: u.role === 'owner' ? 'rgba(196,154,15,0.15)' : '#21262d',
                color: u.role === 'owner' ? 'var(--accent)' : 'var(--muted)',
                fontWeight: 600, flexShrink: 0,
              }}>
                {u.role}
              </span>
              {u.role !== 'owner' && (
                <button
                  onClick={() => removeUser(u.id)}
                  title="Remove user"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#da3633', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
