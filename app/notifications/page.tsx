import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import NotificationsSetupClient from './NotificationsSetupClient';

export const dynamic = 'force-dynamic';

/**
 * Standalone notification setup page — the one link to send any user:
 * portal.empowerbuilding.ai/notifications
 * Detects platform, walks them through setup, verifies end-to-end with a test push.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');

  const admin = createAdminClient();
  const { data: portalUsers } = await admin
    .from('portal_users')
    .select('id, org_id, name')
    .eq('supabase_auth_id', user.id)
    .limit(1);

  if (!portalUsers || portalUsers.length === 0) redirect('/login');

  // Resolve org slug for the "back to portal" link
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', portalUsers[0].org_id)
    .single();

  return (
    <NotificationsSetupClient
      userId={portalUsers[0].id}
      orgSlug={org?.slug ?? ''}
    />
  );
}
