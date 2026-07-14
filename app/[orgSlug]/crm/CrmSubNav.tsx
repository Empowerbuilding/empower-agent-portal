'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  label: string;
  href: string;
  exact?: boolean;
}

interface Props {
  tabs: Tab[];
  orgSlug: string;
}

export default function CrmSubNav({ tabs }: Props) {
  const pathname = usePathname();

  return (
    <div style={{
      display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', flexShrink: 0, paddingLeft: 16,
    }}>
      {tabs.map(tab => {
        let isActive: boolean;
        if (tab.exact) {
          isActive = pathname === tab.href;
        } else {
          isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
        }
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
  );
}
