'use client';

import Link from 'next/link';
import PushSetupPanel from '@/components/push/PushSetupPanel';

interface Props {
  userId: string;
  orgSlug: string;
}

export default function NotificationsSetupClient({ userId, orgSlug }: Props) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg, #080c14)',
      color: 'var(--text, #e6edf3)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px 48px',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Agent Portal</div>
          {orgSlug && (
            <Link href={`/${orgSlug}`} style={{ fontSize: '13px', color: '#58a6ff', textDecoration: 'none' }}>
              ← Back to portal
            </Link>
          )}
        </div>
        <PushSetupPanel userId={userId} />
        <div style={{ marginTop: '28px', fontSize: '12px', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.6 }}>
          <strong>Good to know:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
            <li>You won&apos;t get a notification while you have the portal open — it only alerts you when you&apos;re away.</li>
            <li>Each channel has a bell icon controlling which messages notify you (agent replies by default).</li>
            <li>Clearing your browser data for this site turns notifications off — just come back here to re-enable.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
