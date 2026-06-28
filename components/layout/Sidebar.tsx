'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Organization, PortalChannel, Agent, PortalUser } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface Props {
  org: Organization;
  channels: (PortalChannel & { agents: Agent })[];
  currentUser: PortalUser;
  orgSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#2ea043' : status === 'unhealthy' ? '#d29922' : '#da3633';
  return <span className="status-dot" style={{ background: color }} />;
}

function TypeBadge({ type }: { type: string }) {
  if (type === 'chat') return null;
  return (
    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#484f58', background: '#21262d', padding: '1px 5px', borderRadius: '4px' }}>
      {type === 'approval' ? '⚡' : '📌'}
    </span>
  );
}

export default function Sidebar({ org, channels, currentUser, orgSlug, isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const grouped = channels.reduce<Record<string, { agent: Agent; channels: (PortalChannel & { agents: Agent })[] }>>(
    (acc, ch) => {
      const key = ch.agents?.display_name ?? 'Other';
      if (!acc[key]) acc[key] = { agent: ch.agents, channels: [] };
      acc[key].channels.push(ch);
      return acc;
    },
    {}
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <>
      {/* Overlay (mobile only) */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <nav className={`sidebar${isOpen ? ' open' : ''}`}>
        {/* Org header */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Image src="/logo.png" alt="Empower Building" width={28} height={28} style={{ objectFit: 'contain', borderRadius: '4px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', lineHeight: 1.2 }}>{org.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Agent Portal</div>
              </div>
            </div>
            {/* Close button — mobile only */}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '20px', padding: '4px', lineHeight: 1 }}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Channel list */}
        <div className="sidebar-nav">
          {Object.entries(grouped).map(([agentName, { agent, channels: agentChannels }]) => (
            <div key={agentName} className="agent-group">
              <div className="agent-group-label">
                <span>{agentName}</span>
                <StatusDot status={agent?.container_status ?? 'stopped'} />
              </div>
              {agentChannels.map(ch => {
                const href = `/${orgSlug}/${ch.id}`;
                const isActive = pathname === href;
                return (
                  <Link
                    key={ch.id}
                    href={href}
                    className={`channel-link${isActive ? ' active' : ''}`}
                    onClick={onClose}
                  >
                    <span>{ch.icon ?? '#'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ch.display_name}
                    </span>
                    <TypeBadge type={ch.channel_type} />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="sidebar-footer">
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, flexShrink: 0,
          }}>
            {currentUser.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{currentUser.role}</div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '4px', flexShrink: 0 }}
          >
            ↪
          </button>
        </div>
      </nav>
    </>
  );
}
