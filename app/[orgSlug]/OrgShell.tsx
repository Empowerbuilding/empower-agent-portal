'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import NotificationPrompt from '@/components/NotificationPrompt';
import { Organization, PortalChannel, Agent, PortalUser } from '@/lib/types';
import { MobileToolbarProvider, useMobileToolbar } from '@/context/MobileToolbar';
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
        {/* Mobile top bar */}
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
            ☰
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeChannel ? `${activeChannel.icon ?? ''} ${activeChannel.display_name}` : org.name}
            </div>
            {activeChannel?.agents?.display_name && (
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {activeChannel.agents.display_name}
              </div>
            )}
          </div>
          {/* Channel-specific action buttons injected by child components (includes presence button) */}
          {toolbar && <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>{toolbar}</div>}
        </div>

        {children}
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
