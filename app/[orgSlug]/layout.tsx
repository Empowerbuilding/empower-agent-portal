import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalChannel, Agent, Organization } from '@/lib/types';
import OrgShell from './OrgShell';

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase
    .from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org) redirect('/login');

  const { data: portalUser } = await supabase
    .from('portal_users').select('*')
    .eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
  if (!portalUser) redirect('/login');

  const { data: memberChannels } = await supabase
    .from('portal_channel_members').select('channel_id').eq('user_id', portalUser.id);
  const channelIds = (memberChannels ?? []).map(m => m.channel_id);

  const { data: channels } = await supabase
    .from('portal_channels')
    .select('*, agents(id, name, display_name, container_status)')
    .in('id', channelIds).eq('active', true).order('position');

  return (
    <OrgShell
      org={org as Organization}
      channels={(channels ?? []) as (PortalChannel & { agents: Agent })[]}
      currentUser={portalUser}
      orgSlug={orgSlug}
    >
      {children}
    </OrgShell>
  );
}
