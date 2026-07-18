'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, isIOS, isInStandaloneMode } from '@/lib/push';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Channel {
  id: string;
  display_name: string;
  channel_type: string;
  icon: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export default function SettingsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const router = useRouter();
  const [agents, setAgents] = useState<{ id: string; name: string; display_name: string; container_status: string }[]>([]);
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
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'rep'>('rep');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userChannelMap, setUserChannelMap] = useState<Record<string, string[]>>({});
  const [channelToggling, setChannelToggling] = useState<string | null>(null);

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
        } else {
          const perm = Notification.permission as string;
          if (perm === 'denied') {
            setNotifStatus('blocked');
            setNotifError('Blocked in system settings. On Android: Settings → Apps → Chrome → Notifications → Allow. On iOS: Settings → Chrome/Safari → Notifications → Allow.');
          } else {
            // permission is 'default' — prompt was dismissed, try again guidance
            setNotifError('Tap Enable again and look for a system popup asking to allow notifications — tap Allow when it appears.');
          }
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
        // Load channels for this org
        const { data: chans } = await supabase.from('portal_channels').select('id, display_name, channel_type, icon').eq('org_id', org.id).order('position');
        setChannels(chans ?? []);
        // Derive current user id from auth session matched against portal_users
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.email && members) {
          const me = members.find((u: any) => u.email.toLowerCase() === authData.user!.email!.toLowerCase());
          if (me?.id) { setCurrentUserId(me.id); setCurrentUserRole(me.role); }
        }
        // Load pending invites
        const invRes = await fetch(`/api/invite?orgId=${org.id}`);
        if (invRes.ok) setInvites(await invRes.json());
        // Load agents — only those with portal channels in this org
        const { data: channelAgents } = await supabase
          .from('portal_channels')
          .select('agent_id')
          .eq('org_id', org.id)
          .eq('active', true);
        const agentIds = [...new Set((channelAgents ?? []).map((c: any) => c.agent_id))];
        if (agentIds.length > 0) {
          const { data: agentList } = await supabase.from('agents').select('id, name, display_name, container_status').in('id', agentIds).order('display_name');
          setAgents(agentList ?? []);
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

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, orgId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setInviteError(data.error || 'Failed to send invite');
      } else {
        setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
        setInviteEmail('');
        setInviteRole('rep');
        // Refresh invites list
        const invRes = await fetch(`/api/invite?orgId=${orgId}`);
        if (invRes.ok) setInvites(await invRes.json());
        setTimeout(() => { setShowInviteModal(false); setInviteSuccess(''); }, 1500);
      }
    } catch (e: any) {
      setInviteError(e.message || 'Unexpected error');
    } finally {
      setInviteSending(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm('Revoke this invite?')) return;
    await fetch('/api/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, orgId }),
    });
    setInvites(prev => prev.filter(i => i.id !== inviteId));
  }

  async function removeUser(userId: string) {
    if (!confirm('Remove this user from the portal?')) return;
    await supabase.from('portal_users').delete().eq('id', userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
  }

  async function toggleChannelExpand(userId: string) {
    if (expandedUserId === userId) { setExpandedUserId(null); return; }
    setExpandedUserId(userId);
    if (!userChannelMap[userId]) {
      const res = await fetch(`/api/members/channels?userId=${userId}&orgId=${orgId}`);
      if (res.ok) {
        const channelIds: string[] = await res.json();
        setUserChannelMap(prev => ({ ...prev, [userId]: channelIds }));
      }
    }
  }

  async function toggleChannelMembership(userId: string, channelId: string, currentlyIn: boolean) {
    const key = `${userId}:${channelId}`;
    setChannelToggling(key);
    await fetch('/api/members/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, channelId, orgId, add: !currentlyIn }),
    });
    setUserChannelMap(prev => {
      const current = prev[userId] ?? [];
      return {
        ...prev,
        [userId]: currentlyIn ? current.filter(id => id !== channelId) : [...current, channelId],
      };
    });
    setChannelToggling(null);
  }

  return (
    <div className="page-scroll">
    <div style={{ padding: '32px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '32px' }}>Settings</div>

      {/* Notifications */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Notifications</div>
        <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
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
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(76,139,240,0.15)', color: 'var(--accent)', fontWeight: 700 }}>● ON</span>
              )}
              {notifStatus === 'disabled' && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 700 }}>○ OFF</span>
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
                    background: notifStatus === 'enabled' ? 'var(--border)' : 'var(--accent)',
                    color: notifStatus === 'enabled' ? 'var(--muted)' : '#fff',
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
        <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Install to Home Screen</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Add the portal as an app on your device</div>
          </div>
          {installed ? (
            <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>✓ Installed</span>
          ) : canInstall ? (
            <button onClick={handleInstall} style={{
              padding: '7px 14px', background: 'var(--accent)', border: 'none', borderRadius: '6px',
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', flexShrink: 0,
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
              flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', padding: '9px 12px', fontSize: '14px',
            }}
          />
          <button
            onClick={saveOrgName}
            disabled={saving || orgNameEdit === orgName || !orgNameEdit.trim()}
            style={{
              padding: '9px 16px', background: saved ? 'var(--accent)' : 'var(--accent)', border: 'none',
              borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
              opacity: (saving || orgNameEdit === orgName) ? 0.5 : 1, minWidth: '72px',
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setShowInviteModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Invite Team Member</div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 500 }}>Email address</label>
              <input
                autoFocus
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                placeholder="colleague@company.com"
                style={{ width: '100%', padding: '9px 12px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 500 }}>Role</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['rep', 'admin'] as const).map(r => (
                  <button key={r} onClick={() => setInviteRole(r)} style={{
                    flex: 1, padding: '8px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                    border: inviteRole === r ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: inviteRole === r ? 'rgba(76,139,240,0.15)' : 'var(--sidebar-bg)',
                    color: inviteRole === r ? 'var(--accent)' : 'var(--muted)',
                  }}>
                    {r === 'rep' ? 'Rep' : 'Admin'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                {inviteRole === 'rep' ? 'Can chat with agents, cannot manage settings or invite others.' : 'Can manage channels and invite reps. Cannot manage billing or owners.'}
              </div>
            </div>

            {inviteError && <div style={{ fontSize: '13px', color: '#da3633', background: 'rgba(218,54,51,0.1)', borderRadius: '6px', padding: '8px 10px' }}>{inviteError}</div>}
            {inviteSuccess && <div style={{ fontSize: '13px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', padding: '8px 10px' }}>✓ {inviteSuccess}</div>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowInviteModal(false); setInviteError(''); setInviteEmail(''); }} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={sendInvite} disabled={!inviteEmail.trim() || inviteSending} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: !inviteEmail.trim() || inviteSending ? 0.5 : 1 }}>
                {inviteSending ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team Members</div>
          {['owner', 'admin'].includes(currentUserRole) && (
            <button onClick={() => { setShowInviteModal(true); setInviteError(''); setInviteSuccess(''); }} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>+ Invite</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {users.map(u => (
            <div key={u.id} style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              {/* User row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                  background: u.role === 'owner' ? 'rgba(76,139,240,0.15)' : 'var(--border)',
                  color: u.role === 'owner' ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: 600, flexShrink: 0,
                }}>
                  {u.role}
                </span>
                {['owner', 'admin'].includes(currentUserRole) && u.role !== 'owner' && (
                  <button
                    onClick={() => toggleChannelExpand(u.id)}
                    title="Manage channels"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: expandedUserId === u.id ? 'var(--accent)' : 'var(--muted)', fontSize: '12px', padding: '2px 6px', flexShrink: 0, fontWeight: 600 }}
                  >#</button>
                )}
                {u.role !== 'owner' && (
                  <button
                    onClick={() => removeUser(u.id)}
                    title="Remove user"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#da3633', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}
                  >×</button>
                )}
              </div>
              {/* Channel access panel */}
              {expandedUserId === u.id && (
                <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Channel Access</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {channels.map(ch => {
                      const inChannel = (userChannelMap[u.id] ?? []).includes(ch.id);
                      const toggling = channelToggling === `${u.id}:${ch.id}`;
                      return (
                        <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: toggling ? 'wait' : 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                          <input
                            type="checkbox"
                            checked={inChannel}
                            disabled={toggling}
                            onChange={() => toggleChannelMembership(u.id, ch.id, inChannel)}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <span style={{ opacity: toggling ? 0.5 : 1 }}>{ch.icon} {ch.display_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pending Invites */}
      {['owner', 'admin'].includes(currentUserRole) && invites.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date()).length > 0 && (
        <section style={{ marginTop: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Pending Invites</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invites.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date()).map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{inv.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>{inv.role}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, flexShrink: 0 }}>Pending</span>
                <button onClick={() => revokeInvite(inv.id)} title="Revoke invite" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#da3633', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Agents */}
      {['owner', 'admin'].includes(currentUserRole) && agents.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Agents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {agents.map(agent => {
              const statusColor = agent.container_status === 'running' ? '#22c55e' : agent.container_status === 'unhealthy' ? '#f59e0b' : '#ef4444';
              return (
                <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{agent.display_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{agent.container_status}</div>
                  </div>
                  <button
                    onClick={() => router.push(`/${orgSlug}/agents/${agent.id}`)}
                    style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}
                  >
                    Files
                  </button>
                  <button
                    onClick={() => router.push(`/${orgSlug}/agents/${agent.id}/integrations`)}
                    style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}
                  >
                    Integrations
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>

      {/* Sign out */}
      <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#c0c4cc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Account</h2>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
          style={{ padding: '8px 16px', background: 'none', border: '1px solid #da3633', borderRadius: '6px', color: '#da3633', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
        >
          Sign Out
        </button>
      </section>
    </div>
    </div>
  );
}
