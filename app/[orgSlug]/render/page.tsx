'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const RENDER_ORIGIN = 'https://render.barnhaussteelbuilders.com';

interface SubmitPayload {
  imageUrl: string;
  prompt: string;
  renderType: string;
}

export default function RenderStudioPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [studioChannel, setStudioChannel] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const [submitModal, setSubmitModal] = useState<SubmitPayload | null>(null);
  const [planName, setPlanName] = useState('');
  const [clientName, setClientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Load user + org + studio channel
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: org } = await supabase
        .from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) return;
      setOrgId(org.id);

      const { data: portalUser } = await supabase
        .from('portal_users').select('*')
        .eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
      if (!portalUser) return;
      setCurrentUser(portalUser);

      // Find their studio channel (contractors have exactly one)
      const { data: memberChannels } = await supabase
        .from('portal_channel_members')
        .select('channel_id')
        .eq('user_id', portalUser.id);

      const channelIds = (memberChannels ?? []).map((m: any) => m.channel_id as string);
      const sc = channelIds.find((id) =>
        id.startsWith('studio-zunaria') ||
        id.startsWith('studio-arooba') ||
        id.endsWith('-render') ||
        id.includes('-render-tool')
      );
      setStudioChannel(sc ?? null);
    };
    init();
  }, [orgSlug]);

  // Send identity to iframe
  const sendIdentity = () => {
    if (!currentUser || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'PORTAL_IDENTITY', profileId: currentUser.id, userName: currentUser.name, channelId: studioChannel },
      RENDER_ORIGIN
    );
  };

  // Re-send whenever user or channel resolves
  useEffect(() => {
    if (iframeReady) sendIdentity();
  }, [currentUser, studioChannel, iframeReady]);

  const handleIframeLoad = () => {
    setIframeReady(true);
    sendIdentity();
  };

  // Listen for messages from render tool
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== RENDER_ORIGIN) return;
      if (e.data?.type === 'RENDER_SUBMIT') {
        setSubmitModal({ imageUrl: e.data.imageUrl, prompt: e.data.prompt, renderType: e.data.renderType });
        setPlanName('');
        setClientName('');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSubmit = async () => {
    if (!submitModal || !currentUser) return;
    setSubmitting(true);
    try {
      const supabase = createClient();

      // Save to render_gallery
      const { error } = await supabase.from('render_gallery').insert({
        image_url: submitModal.imageUrl,
        created_by: currentUser.name,
        profile_id: currentUser.id,
        org_id: orgId,
        plan_name: planName || null,
        client_name: clientName || null,
        status: 'pending_review',
        channel_id: studioChannel,
      });
      if (error) throw error;

      // Post to studio channel so Juanito picks it up
      if (studioChannel && orgId) {
        await supabase.from('portal_messages').insert({
          channel_id: studioChannel,
          org_id: orgId,
          sender_type: 'user',
          sender_name: currentUser.name,
          content: `📐 **Render submitted for review**\n**Plan:** ${planName || 'Not specified'}\n**Client:** ${clientName || 'Not specified'}\n**Type:** ${submitModal.renderType}\n${submitModal.imageUrl}`,
          processed: false,
        });
      }

      // Notify iframe
      iframeRef.current?.contentWindow?.postMessage({ type: 'SUBMIT_SUCCESS' }, RENDER_ORIGIN);

      setSubmitModal(null);
      showToast('Submitted for review ✅');
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, false);
    } finally {
      setSubmitting(false);
    }
  };

  const iframeUrl = currentUser
    ? `${RENDER_ORIGIN}/${currentUser.id}`
    : RENDER_ORIGIN;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#111', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.ok ? '#27ae60' : '#c0392b',
          color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Render Studio iframe — full height */}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        onLoad={handleIframeLoad}
        style={{ flex: 1, border: 'none', width: '100%', display: 'block' }}
        allow="clipboard-read; clipboard-write"
        title="Render Studio"
      />

      {/* Submit for Review Modal */}
      {submitModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
        }}>
          <div style={{
            background: '#1e1e1e', border: '1px solid #333', borderRadius: 12,
            padding: 28, width: 400, maxWidth: '92vw',
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 16, fontWeight: 600 }}>
              Submit for Review
            </h3>
            <p style={{ margin: '0 0 18px', color: '#888', fontSize: 13 }}>
              Tag this render so Ben knows what he's reviewing.
            </p>

            <img
              src={submitModal.imageUrl}
              alt="Render preview"
              style={{ width: '100%', borderRadius: 8, marginBottom: 18, maxHeight: 180, objectFit: 'cover' }}
            />

            <label style={{ display: 'block', color: '#bbb', fontSize: 13, marginBottom: 5 }}>Plan Name</label>
            <input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="e.g. Spring Mountain"
              style={{
                width: '100%', background: '#2a2a2a', border: '1px solid #444',
                borderRadius: 6, color: '#fff', padding: '8px 10px', fontSize: 14,
                marginBottom: 14, boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', color: '#bbb', fontSize: 13, marginBottom: 5 }}>Client Name</label>
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="e.g. Johnson"
              style={{
                width: '100%', background: '#2a2a2a', border: '1px solid #444',
                borderRadius: 6, color: '#fff', padding: '8px 10px', fontSize: 14,
                marginBottom: 22, boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setSubmitModal(null)}
                style={{
                  flex: 1, background: '#2a2a2a', border: '1px solid #444',
                  color: '#bbb', padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 2, background: submitting ? '#2a5299' : '#4c8bf0',
                  border: 'none', color: '#fff', padding: '9px 0',
                  borderRadius: 7, cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit for Review ✅'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
