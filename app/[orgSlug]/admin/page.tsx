'use client';

// S28 — Org admin panel. Owner/admin only.
// Members (roles + remove) · pending invites (view/revoke) · seat count ·
// allowed model tiers (organizations.allowed_model_tiers vs model_tiers catalog).
//
// Enforcement is layered — this page is convenience UI only:
//  · portal_users DELETE → RLS user_delete_admin (S14)
//  · organizations UPDATE → RLS org_update_admin (S14)
//  · invites list/revoke/create → /api/invite (server-side owner/admin check)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

interface ModelTier {
  tier: string;
  label: string;
  emoji: string;
  model_id: string;
}

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  owner: { bg: 'rgba(76,139,240,0.15)', color: 'var(--accent)' },
  admin: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
};

const sectionTitle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px',
};

const card: React.CSSProperties = {
  background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '12px 14px',
};

export default function OrgAdminPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [loaded, setLoaded] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('');
  const [myPortalUserId, setMyPortalUserId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tiers, setTiers] = useState<ModelTier[]>([]);
  const [allowedTiers, setAllowedTiers] = useState<string[]>([]);
  const [seatLimit, setSeatLimit] = useState<number | null>(null);
  const [tierSaving, setTierSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'rep' | 'contractor'>('rep');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const isAdmin = role === 'owner' || role === 'admin';

  const refreshInvites = useCallback(async (id: string) => {
    const res = await fetch(`/api/invite?orgId=${id}`);
    if (res.ok) setInvites(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, allowed_model_tiers')
        .eq('slug', orgSlug)
        .single();
      if (!org) { setLoaded(true); return; }
      setOrgId(org.id);
      setOrgName(org.name);
      setAllowedTiers((org as { allowed_model_tiers?: string[] | null }).allowed_model_tiers ?? []);

      // Optional seat limit — column may not exist yet; tolerate failure.
      const { data: seatRow, error: seatErr } = await supabase
        .from('organizations').select('seat_limit').eq('id', org.id).maybeSingle();
      if (!seatErr && seatRow && typeof (seatRow as { seat_limit?: number | null }).seat_limit === 'number') {
        setSeatLimit((seatRow as { seat_limit?: number | null }).seat_limit ?? null);
      }

      const { data: authData } = await supabase.auth.getUser();
      let myRole = '';
      if (authData?.user) {
        const { data: pu } = await supabase
          .from('portal_users').select('id, role')
          .eq('supabase_auth_id', authData.user.id).eq('org_id', org.id).single();
        myRole = pu?.role ?? '';
        setRole(myRole);
        setMyPortalUserId(pu?.id ?? '');
      }
      if (myRole !== 'owner' && myRole !== 'admin') { setLoaded(true); return; }

      const [{ data: memberRows }, { data: tierRows }] = await Promise.all([
        supabase.from('portal_users')
          .select('id, name, email, role, active')
          .eq('org_id', org.id)
          .order('role'),
        supabase.from('model_tiers').select('tier, label, emoji, model_id').order('sort'),
      ]);
      setMembers(memberRows ?? []);
      setTiers(tierRows ?? []);
      await refreshInvites(org.id);
      setLoaded(true);
    })();
  }, [orgSlug, supabase, refreshInvites]);

  async function removeMember(userId: string) {
    if (!confirm('Remove this member from the portal?')) return;
    setError('');
    const { error: delErr } = await supabase.from('portal_users').delete().eq('id', userId).eq('org_id', orgId);
    if (delErr) { setError(`Remove failed: ${delErr.message}`); return; }
    // RLS silently no-ops for non-admins — confirm the row is actually gone.
    const { data: still } = await supabase.from('portal_users').select('id').eq('id', userId).maybeSingle();
    if (still) { setError('Remove was blocked — admin role required.'); return; }
    setMembers(prev => prev.filter(m => m.id !== userId));
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm('Revoke this invite?')) return;
    setError('');
    const res = await fetch('/api/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, orgId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Failed to revoke invite');
      return;
    }
    setInvites(prev => prev.filter(i => i.id !== inviteId));
  }

  async function toggleTier(tier: string) {
    if (tierSaving) return;
    setError('');
    setTierSaving(tier);
    const next = allowedTiers.includes(tier)
      ? allowedTiers.filter(t => t !== tier)
      : [...allowedTiers, tier];
    const { error: upErr } = await supabase
      .from('organizations').update({ allowed_model_tiers: next }).eq('id', orgId);
    if (upErr) {
      setError(`Model tier update failed: ${upErr.message}`);
      setTierSaving(null);
      return;
    }
    // RLS silently no-ops for non-admins — read back to confirm.
    const { data: check } = await supabase
      .from('organizations').select('allowed_model_tiers').eq('id', orgId).single();
    const applied = (check as { allowed_model_tiers?: string[] | null } | null)?.allowed_model_tiers ?? [];
    setAllowedTiers(applied);
    if (JSON.stringify([...applied].sort()) !== JSON.stringify([...next].sort())) {
      setError('Model tier update was blocked — admin role required.');
    }
    setTierSaving(null);
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || inviteSending) return;
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
        await refreshInvites(orgId);
        setTimeout(() => { setShowInvite(false); setInviteSuccess(''); }, 1500);
      }
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setInviteSending(false);
    }
  }

  const pendingInvites = invites.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date());
  const seatsUsed = members.length;

  if (!loaded) {
    return (
      <div className="page-scroll">
        <div style={{ padding: '32px', maxWidth: '640px', margin: '0 auto', color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-scroll">
        <div style={{ padding: '32px', maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Admins only</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              The org admin panel is only available to owners and admins.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div style={{ padding: '32px', maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Org Admin</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>{orgName}</div>

        {error && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(218,54,51,0.08)', border: '1px solid rgba(218,54,51,0.35)', borderRadius: '8px', fontSize: '13px', color: '#da3633' }}>
            {error}
          </div>
        )}

        {/* Seats */}
        <section style={{ marginBottom: '32px' }}>
          <div style={sectionTitle}>Seats</div>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)' }}>
              {seatsUsed}{seatLimit != null && <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--muted)' }}> / {seatLimit}</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
              member{seatsUsed === 1 ? '' : 's'}{pendingInvites.length > 0 && <> · {pendingInvites.length} pending invite{pendingInvites.length === 1 ? '' : 's'}</>}
              {seatLimit != null && seatsUsed + pendingInvites.length >= seatLimit && (
                <div style={{ color: '#f59e0b', fontWeight: 600 }}>At seat limit (counting pending invites)</div>
              )}
            </div>
          </div>
        </section>

        {/* Members */}
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>Members</div>
            <button
              onClick={() => { setShowInvite(true); setInviteError(''); setInviteSuccess(''); }}
              style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
            >+ Invite</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {members.map(m => {
              const badge = ROLE_BADGE[m.role] ?? { bg: 'var(--border)', color: 'var(--muted)' };
              return (
                <div key={m.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700, flexShrink: 0,
                  }}>{(m.name || m.email).charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {m.name}{m.id === myPortalUserId && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (you)</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: badge.bg, color: badge.color, fontWeight: 600, flexShrink: 0 }}>{m.role}</span>
                  {m.role !== 'owner' && m.id !== myPortalUserId && (
                    <button
                      onClick={() => removeMember(m.id)}
                      title="Remove member"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#da3633', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending Invites */}
        <section style={{ marginBottom: '32px' }}>
          <div style={sectionTitle}>Pending Invites</div>
          {pendingInvites.length === 0 ? (
            <div style={{ ...card, fontSize: '13px', color: 'var(--muted)' }}>No pending invites.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingInvites.map(inv => (
                <div key={inv.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{inv.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>{inv.role}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, flexShrink: 0 }}>Pending</span>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    title="Revoke invite"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#da3633', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Model Tiers */}
        <section style={{ marginBottom: '32px' }}>
          <div style={sectionTitle}>Allowed Model Tiers</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.5 }}>
            Tiers your team can pick per-message in chat. Turning a tier off hides it from the composer for everyone in this org.
          </div>
          {tiers.length === 0 ? (
            <div style={{ ...card, fontSize: '13px', color: 'var(--muted)' }}>No model tiers configured on the platform.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tiers.map(t => {
                const enabled = allowedTiers.includes(t.tier);
                const saving = tierSaving === t.tier;
                return (
                  <div key={t.tier} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '17px', flexShrink: 0 }}>{t.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{t.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>{t.model_id}</div>
                    </div>
                    {enabled && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(76,139,240,0.15)', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>● ON</span>
                    )}
                    <button
                      onClick={() => toggleTier(t.tier)}
                      disabled={saving}
                      style={{
                        padding: '7px 14px', border: 'none', borderRadius: '6px',
                        background: enabled ? 'var(--border)' : 'var(--accent)',
                        color: enabled ? 'var(--muted)' : '#fff',
                        fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: '13px',
                        opacity: saving ? 0.6 : 1, flexShrink: 0,
                      }}
                    >{saving ? '…' : enabled ? 'Turn Off' : 'Enable'}</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Invite modal */}
        {showInvite && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
            onClick={() => setShowInvite(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', width: 'min(420px, calc(100vw - 32px))' }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '14px' }}>Invite a member</div>
              <input
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', marginBottom: '10px', boxSizing: 'border-box' }}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'admin' | 'rep' | 'contractor')}
                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', marginBottom: '14px', boxSizing: 'border-box' }}
              >
                <option value="rep">Rep</option>
                <option value="admin">Admin</option>
                <option value="contractor">Contractor</option>
              </select>
              {inviteError && <div style={{ fontSize: '12px', color: '#da3633', marginBottom: '10px' }}>{inviteError}</div>}
              {inviteSuccess && <div style={{ fontSize: '12px', color: '#22c55e', marginBottom: '10px' }}>{inviteSuccess}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowInvite(false); setInviteError(''); setInviteEmail(''); }}
                  style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}
                >Cancel</button>
                <button
                  onClick={sendInvite}
                  disabled={inviteSending || !inviteEmail.trim()}
                  style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: inviteSending ? 'wait' : 'pointer', fontSize: '13px', opacity: inviteSending || !inviteEmail.trim() ? 0.6 : 1 }}
                >{inviteSending ? 'Sending…' : 'Send Invite'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
