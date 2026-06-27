'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Organization, PortalChannel, Agent, PortalUser } from '@/lib/types';

interface Props {
  org: Organization;
  channels: (PortalChannel & { agents: Agent })[];
  currentUser: PortalUser;
  orgSlug: string;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#22c55e' : status === 'unhealthy' ? '#f59e0b' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full ml-1" style={{ background: color }} />;
}

function ChannelTypeIcon({ type }: { type: string }) {
  if (type === 'feed') return <span className="text-xs opacity-40">#</span>;
  if (type === 'approval') return <span className="text-xs opacity-40">⚡</span>;
  return <span className="text-xs opacity-40">#</span>;
}

export default function Sidebar({ org, channels, currentUser, orgSlug }: Props) {
  const pathname = usePathname();

  // Group channels by agent
  const grouped = channels.reduce<Record<string, (PortalChannel & { agents: Agent })[]>>(
    (acc, ch) => {
      const key = ch.agents?.display_name ?? 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(ch);
      return acc;
    },
    {}
  );

  return (
    <div
      className="flex flex-col w-60 shrink-0 h-full overflow-y-auto"
      style={{ background: '#1a1a1a', borderRight: '1px solid #2a2a2a' }}
    >
      {/* Org header */}
      <div
        className="px-4 py-4 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid #2a2a2a' }}
      >
        <div>
          <div className="font-semibold text-sm text-white truncate">{org.name}</div>
          <div className="text-xs mt-0.5" style={{ color: '#888' }}>{currentUser.name}</div>
        </div>
      </div>

      {/* Channel groups */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {Object.entries(grouped).map(([agentName, agentChannels]) => {
          const agent = agentChannels[0]?.agents;
          return (
            <div key={agentName} className="mb-4">
              {/* Agent group header */}
              <div
                className="px-3 mb-1 flex items-center gap-1"
                style={{ color: '#666' }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider truncate">
                  {agentName}
                </span>
                {agent && <StatusDot status={agent.container_status} />}
              </div>

              {/* Channels */}
              {agentChannels.map(ch => {
                const href = `/${orgSlug}/${ch.id}`;
                const isActive = pathname === href;
                return (
                  <Link
                    key={ch.id}
                    href={href}
                    className="flex items-center gap-2 px-3 py-1.5 mx-1 rounded text-sm transition-colors"
                    style={{
                      background: isActive ? '#2a2a2a' : 'transparent',
                      color: isActive ? '#f0f0f0' : '#999',
                    }}
                  >
                    <span>{ch.icon ?? '#'}</span>
                    <span className="truncate">{ch.display_name}</span>
                    {ch.channel_type !== 'chat' && (
                      <span
                        className="ml-auto text-xs px-1 rounded"
                        style={{ background: '#252525', color: '#666' }}
                      >
                        {ch.channel_type === 'approval' ? 'approvals' : 'feed'}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom user bar */}
      <div
        className="px-3 py-3 flex items-center gap-2 shrink-0"
        style={{ borderTop: '1px solid #2a2a2a' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: '#B8860B', color: '#fff' }}
        >
          {currentUser.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{currentUser.name}</div>
          <div className="text-xs" style={{ color: '#666' }}>{currentUser.role}</div>
        </div>
      </div>
    </div>
  );
}
