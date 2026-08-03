'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ImageLightbox from '@/components/ui/ImageLightbox';

type RenderStatus = 'pending_review' | 'approved' | 'revision' | 'in_use';

interface RenderItem {
  id: string;
  image_url: string;
  created_by: string;
  plan_name: string | null;
  client_name: string | null;
  status: RenderStatus;
  marketing_approved: boolean;
  channel_id: string | null;
  created_at: string;
}

const STATUS_META: Record<RenderStatus, { label: string; bg: string; color: string }> = {
  pending_review: { label: 'Pending Review', bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
  approved:       { label: 'Approved',       bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  revision:       { label: 'Needs Revision', bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  in_use:         { label: 'In Use',          bg: 'rgba(76,139,240,0.15)', color: '#4c8bf0' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GalleryPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<RenderStatus | 'all'>('all');
  const [marketingOnly, setMarketingOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);

  // QA modal
  const [qaTarget, setQaTarget] = useState<RenderItem | null>(null);
  const [qaStatus, setQaStatus] = useState<RenderStatus>('approved');
  const [savingQa, setSavingQa] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // Init
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) return;
      setOrgId(org.id);
      const { data: pu } = await supabase.from('portal_users').select('*').eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
      if (pu) setCurrentUser(pu);
    };
    init();
  }, [orgSlug]);

  const loadRenders = useCallback(async () => {
    if (!orgId || !currentUser) return;
    setLoading(true);
    try {
      let query = supabase
        .from('render_gallery')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      // Contractors only see their own
      if (currentUser.role === 'contractor') {
        query = query.eq('created_by', currentUser.name);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRenders(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [orgId, currentUser]);

  useEffect(() => { loadRenders(); }, [loadRenders]);

  const isInternal = currentUser && currentUser.role !== 'contractor';
  const canQA = isInternal;
  const canToggleMarketing = currentUser?.role === 'owner' || currentUser?.role === 'admin' || currentUser?.name === 'Esry';

  const handleSubmitForApproval = async (render: RenderItem) => {
    try {
      const { error } = await supabase
        .from('render_gallery')
        .update({ status: 'pending_review' })
        .eq('id', render.id)
        .eq('org_id', orgId!);
      if (error) throw error;
      showToast('Submitted for review ✅');
      loadRenders();
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  const filtered = renders.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (marketingOnly && !r.marketing_approved) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.plan_name?.toLowerCase().includes(q) && !r.client_name?.toLowerCase().includes(q) && !r.created_by?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleQaSave = async () => {
    if (!qaTarget || !orgId) return;
    setSavingQa(true);
    try {
      const { error } = await supabase
        .from('render_gallery')
        .update({ status: qaStatus })
        .eq('id', qaTarget.id)
        .eq('org_id', orgId);
      if (error) throw error;
      showToast('Status updated');
      setQaTarget(null);
      loadRenders();
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setSavingQa(false);
    }
  };

  const toggleMarketing = async (render: RenderItem) => {
    try {
      const { error } = await supabase
        .from('render_gallery')
        .update({ marketing_approved: !render.marketing_approved })
        .eq('id', render.id)
        .eq('org_id', orgId!);
      if (error) throw error;
      showToast(render.marketing_approved ? 'Removed from marketing' : '✅ Marked as marketing-approved');
      loadRenders();
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: 0, overflow: 'hidden' }}>

      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: toast.ok ? '#27ae60' : '#c0392b', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>🖼️ Render Gallery</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {isInternal ? 'All submitted renders' : 'Your submitted renders'}
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plan, client, or drafter…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['all', 'pending_review', 'approved', 'revision', 'in_use'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', flexShrink: 0,
              border: statusFilter === s ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: statusFilter === s ? 'rgba(76,139,240,0.15)' : 'var(--surface)',
              color: statusFilter === s ? 'var(--accent)' : 'var(--muted)',
              fontWeight: statusFilter === s ? 600 : 400,
            }}>
              {s === 'all' ? 'All' : STATUS_META[s as RenderStatus].label}
            </button>
          ))}
          {isInternal && (
            <button onClick={() => setMarketingOnly(!marketingOnly)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', flexShrink: 0,
              border: marketingOnly ? '1px solid #22c55e' : '1px solid var(--border)',
              background: marketingOnly ? 'rgba(34,197,94,0.15)' : 'var(--surface)',
              color: marketingOnly ? '#22c55e' : 'var(--muted)',
              fontWeight: marketingOnly ? 600 : 400,
            }}>
              ✅ Marketing Ready
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
            {renders.length === 0 ? 'No renders submitted yet.' : 'No renders match your filters.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {filtered.map(r => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending_review;
              return (
                <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                  {/* Image */}
                  <div style={{ position: 'relative', aspectRatio: '16/10', overflow: 'hidden', cursor: 'zoom-in', background: '#111' }} onClick={() => setLightbox(r.image_url)}>
                    <img src={r.image_url} alt={r.plan_name ?? 'render'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {r.marketing_approved && (
                      <div style={{ position: 'absolute', top: 6, right: 6, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>📣 Ad Ready</div>
                    )}
                    <div style={{ position: 'absolute', top: 6, left: 6, background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, backdropFilter: 'blur(4px)' }}>
                      {meta.label}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.plan_name ?? 'Untitled'}{r.client_name ? ` — ${r.client_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.created_by} · {formatDate(r.created_at)}</div>
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '0 10px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/* Submit for Approval — shown to everyone when render is not already pending/approved */}
                    {(r.status === 'revision' || r.status === 'in_use') && (
                      <button
                        onClick={() => handleSubmitForApproval(r)}
                        style={{ flex: 1, background: 'rgba(234,179,8,0.15)', border: '1px solid #eab308', color: '#eab308', padding: '6px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                        title="Re-submit this render for approval review"
                      >
                        ✅ Submit for Approval
                      </button>
                    )}
                    {canQA && (
                      <button onClick={() => { setQaTarget(r); setQaStatus(r.status); }} style={{ flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '6px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        Review
                      </button>
                    )}
                    {canToggleMarketing && (
                      <button onClick={() => toggleMarketing(r)} title={r.marketing_approved ? 'Remove from marketing' : 'Mark as ad-ready'} style={{
                        background: r.marketing_approved ? 'rgba(34,197,94,0.15)' : 'var(--sidebar-bg)',
                        border: r.marketing_approved ? '1px solid #22c55e' : '1px solid var(--border)',
                        color: r.marketing_approved ? '#22c55e' : 'var(--muted)',
                        padding: '6px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      }}>
                        📣
                      </button>
                    )}
                    <button onClick={() => window.open(r.image_url, '_blank')} style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QA Modal */}
      {qaTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setQaTarget(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px 12px 0 0', padding: '20px 16px', width: '100%', maxWidth: 480, boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>Review Render</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
              {qaTarget.plan_name ?? 'Untitled'}{qaTarget.client_name ? ` — ${qaTarget.client_name}` : ''} · {qaTarget.created_by}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
              {(['pending_review', 'approved', 'revision', 'in_use'] as RenderStatus[]).map(s => {
                const m = STATUS_META[s];
                return (
                  <button key={s} onClick={() => setQaStatus(s)} style={{
                    padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: qaStatus === s ? `1.5px solid ${m.color}` : '1px solid var(--border)',
                    background: qaStatus === s ? m.bg : 'var(--sidebar-bg)',
                    color: qaStatus === s ? m.color : 'var(--muted)',
                  }}>{m.label}</button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setQaTarget(null)} style={{ flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '10px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={handleQaSave} disabled={savingQa} style={{ flex: 2, background: 'var(--accent)', border: 'none', color: '#fff', padding: '10px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {savingQa ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
