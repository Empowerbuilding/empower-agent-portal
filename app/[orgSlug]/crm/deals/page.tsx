import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import DealsClient from './DealsClient';

export default async function DealsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) redirect(`/${orgSlug}/crm`);

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const [{ data: deals }, { data: companies }] = await Promise.all([
    crm.from('deals').select('*').order('created_at', { ascending: false }),
    crm.from('companies').select('id, name').order('name'),
  ]);

  return (
    <DealsClient
      deals={deals ?? []}
      companies={companies ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
