'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useParams } from 'next/navigation';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const tabs = [
    { label: 'Companies', href: `/${orgSlug}/crm` },
    { label: 'Pipeline', href: `/${orgSlug}/crm/deals` },
    { label: 'Tasks', href: `/${orgSlug}/crm/tasks` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0, paddingLeft: 16,
      }}>
        {tabs.map(tab => {
          const isActive = tab.href === `/${orgSlug}/crm`
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
