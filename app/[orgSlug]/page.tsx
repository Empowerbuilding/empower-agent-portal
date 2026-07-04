import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function OrgHome({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (!org) redirect('/login');

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', org.id)
    .single();

  if (!portalUser) redirect('/login');

  // Find first active-agent channel for this user
  const { data: memberChannels } = await supabase
    .from('portal_channel_members')
    .select('channel_id, portal_channels(id, position, agents(active))')
    .eq('user_id', portalUser.id)
    .order('portal_channels(position)');

  const first = (memberChannels ?? []).find(
    (m: any) => m.portal_channels?.agents?.active !== false
  );

  if (first?.channel_id) {
    redirect(`/${orgSlug}/${first.channel_id}`);
  }

  return (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      No channels available.
    </div>
  );
}
