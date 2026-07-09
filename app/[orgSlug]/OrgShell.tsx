'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import NotificationPrompt from '@/components/NotificationPrompt';
import { Organization, PortalChannel, Agent, PortalUser } from '@/lib/types';
import { MobileToolbarProvider, useMobileToolbar } from '@/context/MobileToolbar';
import PresenceButton from '@/components/presence/PresenceButton';
import { registerServiceWorker } from '@/lib/push';

interface Props {
  org: Organization;
  channels: (PortalChannel & { agents: Agent })[];
  currentUser: PortalUser;
  orgSlug: string;
  children: React.ReactNode;
}

function OrgShellInner({ org, channels, currentUser, orgSlug, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { toolbar } = useMobileToolbar();

  // Register service worker on every load so push infra is always ready
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Dynamic bottom padding — keeps content above Android gesture nav bar (28px),
  // but drops to 0 when keyboard is open so the input bar doesn't jump.
  useEffect(() => {
    function updateBottomPad() {
      const vv = window.visualViewport;
      if (!vv) return;
      const keyboardOpen = (window.innerHeight - vv.height) > 150;
      document.documentElement.style.setProperty('--mob-btm', keyboardOpen ? '0px' : '8px');
    }
    updateBottomPad();
    window.visualViewport?.addEventListener('resize', updateBottomPad);
    return () => window.visualViewport?.removeEventListener('resize', updateBottomPad);
  }, []);

  // Presence heartbeat — ping every 30s while the portal is open so other
  // team members can see who's currently online (see Settings > Team Members)
  useEffect(() => {
    const ping = () => { fetch('/api/heartbeat', { method: 'POST' }).catch(() => {}); };
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, []);

  // Clear app icon badge when user is in the portal
  useEffect(() => {
    if ('clearAppBadge' in navigator) (navigator as any).clearAppBadge();
  }, [pathname]);

  // Find active channel name for mobile header
  const activeChannelId = pathname.split('/')[2];
  const activeChannel = channels.find(ch => ch.id === activeChannelId);
  const [mobileMemberCount, setMobileMemberCount] = useState<number | null>(null);

  useEffect(() => {
    if (!activeChannelId) { setMobileMemberCount(null); return; }
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    fetch(`https://xqvnpcxyyxxxydescfzw.supabase.co/rest/v1/portal_channel_members?channel_id=eq.${activeChannelId}&select=user_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).then(r => r.json()).then((rows: unknown[]) => {
      if (Array.isArray(rows)) setMobileMemberCount(rows.length);
    }).catch(() => {});
  }, [activeChannelId]);

  return (
    <div className="app-shell">
      <NotificationPrompt userId={currentUser.id} />
      <Sidebar
        org={org}
        channels={channels}
        currentUser={currentUser}
        orgSlug={orgSlug}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        {/* Mobile top bar — normal flow flex item, not position:fixed, so content sits below it naturally */}
        <div className="mobile-header">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', fontSize: '20px', padding: '4px', lineHeight: 1,
              minWidth: 32, minHeight: 32,
            }}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 5 5 12 12 19" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0, paddingLeft: '4px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeChannel ? `# ${activeChannel.display_name}` : org.name}
            </div>
            {mobileMemberCount !== null && activeChannel && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1, marginTop: '1px' }}>
                {mobileMemberCount} member{mobileMemberCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          {/* Channel-specific action buttons injected by child components (includes presence button) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, paddingRight: '2px' }}>
            <PresenceButton orgId={org.id} openDirection="down" align="right" size={15} />
            {toolbar}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'clip', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function OrgShell(props: Props) {
  return (
    <MobileToolbarProvider>
      <OrgShellInner {...props} />
    </MobileToolbarProvider>
  );
}
