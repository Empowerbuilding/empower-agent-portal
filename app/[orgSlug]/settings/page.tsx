'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, isIOS, isInStandaloneMode } from '@/lib/push';

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
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'loading' | 'unsupported' | 'blocked' | 'enabled' | 'disabled'>('loading');
  const [notifToggling, setNotifToggling] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    const ios = isIOS();
    setIsIOSDevice(ios);
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
    if (!ios) {
      const handler = (e: any) => {
        e.preventDefault();
        installPrompt.current = e;
        setCanInstall(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  // Load notification status
  useEffect(() => {
    async function checkNotifStatus() {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setNotifStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setNotifStatus('blocked');
        return;
      }
      const subscribed = await isPushSubscribed();
      setNotifStatus(subscribed && Notification.permission === 'granted' ? 'enabled' : 'disabled');
    }
    checkNotifStatus();
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

  async function handleNotifToggle() {
    if (notifToggling) return;
    setNotifError('');
    setNotifToggling(true);
    try {
      if (!('Notification' in window)) {
        setNotifError('Push notifications not supported in this browser.');
        return;
      }
      if (!currentUserId) {
        setNotifError('Could not identify your user account. Try refreshing.');
        return;
      }
      if (notifStatus === 'enabled') {
        await unsubscribeFromPush(currentUserId);
        setNotifStatus('disabled');
      } else {
        if (Notification.permission === 'denied') {
          setNotifStatus('blocked');
          setNotifError('Notifications are blocked. Allow them in browser settings first.');
          return;
        }
        const ok = await subscribeToPush(currentUserId);
        if (ok) {
          setNotifStatus('enabled');
        } else if (Notification.permission === 'denied') {
          setNotifStatus('blocked');
          setNotifError('Permission denied. Allow notifications in browser settings.');
        } else {
          setNotifError('Failed to enable — check browser supports push notifications.');
        }
      }
    } catch (e: any) {
      setNotifError(e?.message || 'Unexpected error.');
    } finally {
      setNotifToggling(false);
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
        // Derive current user id from auth session matched against portal_users
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.email && members) {
          const me = members.find((u: any) => u.email.toLowerCase() === authData.user!.email!.toLowerCase());
          if (me?.id) setCurrentUserId(me.id);
        }
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

      {/* Notifications */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Notifications</div>
        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Push Notifications</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {notifStatus === 'loading' && 'Checking status…'}
                {notifStatus === 'enabled' && 'You will receive alerts when agents reply'}
                {notifStatus === 'disabled' && 'Enable to get alerted when agents reply'}
                {notifStatus === 'blocked' && 'Notifications are blocked in your browser settings'}
                {notifStatus === 'unsupported' && 'Not supported in this browser'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              {/* Status badge */}
              {notifStatus === 'enabled' && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(46,160,67,0.15)', color: '#2ea043', fontWeight: 700 }}>● ON</span>
              )}
              {notifStatus === 'disabled' && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: '#21262d', color: 'var(--muted)', fontWeight: 700 }}>○ OFF</span>
              )}
              {notifStatus === 'blocked' && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(218,54,51,0.15)', color: '#da3633', fontWeight: 700 }}>⊘ BLOCKED</span>
              )}
              {/* Toggle button */}
              {(notifStatus === 'enabled' || notifStatus === 'disabled') && (
                <button
                  onClick={handleNotifToggle}
                  disabled={notifToggling}
                  style={{
                    padding: '7px 14px', border: 'none', borderRadius: '6px',
                    background: notifStatus === 'enabled' ? '#21262d' : 'var(--accent)',
                    color: notifStatus === 'enabled' ? 'var(--muted)' : '#000',
                    fontWeight: 700, cursor: notifToggling ? 'wait' : 'pointer', fontSize: '13px',
                    opacity: notifToggling ? 0.6 : 1,
                  }}
                >
                  {notifToggling ? '…' : notifStatus === 'enabled' ? 'Turn Off' : 'Enable'}
                </button>
              )}
              {notifStatus === 'blocked' && (
                <span style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'right', lineHeight: 1.5 }}>
                  Allow in browser<br />settings to enable
                </span>
              )}
            </div>
          </div>
          {notifStatus === 'blocked' && (
            <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', fontSize: '12px', color: 'var(--muted)' }}>
              Chrome: click the 🔒 lock icon in the address bar → Notifications → Allow
            </div>
          )}
          {notifError && (
            <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', fontSize: '12px', color: '#da3633' }}>
              ⚠️ {notifError}
            </div>
          )}
        </div>
      </section>

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
          ) : isIOSDevice ? (
            <span style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'right', lineHeight: 1.5 }}>
              Tap <strong style={{ color: 'var(--text)' }}>Share</strong> {'('}📤{')'}<br />
              then <strong style={{ color: 'var(--text)' }}>Add to Home Screen</strong>
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Open in Chrome to install</span>
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
