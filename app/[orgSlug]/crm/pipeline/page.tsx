import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import PipelineClient from './PipelineClient';

export default async function PipelinePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) return notFound();

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const { data: deals } = await crm
    .from('deals')
    .select('*, contacts(first_name, last_name, phone)')
    .not('stage', 'in', '("complete","lost")')
    .order('created_at', { ascending: false });

  const { data: users } = await crm.from('users').select('id, name');

  const normalized = (deals ?? []).map((d: any) => ({
    ...d,
    contact_name: Array.isArray(d.contacts)
      ? `${d.contacts[0]?.first_name ?? ''} ${d.contacts[0]?.last_name ?? ''}`.trim()
      : d.contacts ? `${d.contacts.first_name ?? ''} ${d.contacts.last_name ?? ''}`.trim() : null,
    contact_phone: Array.isArray(d.contacts) ? d.contacts[0]?.phone : d.contacts?.phone,
  }));

  return (
    <PipelineClient
      deals={normalized}
      users={users ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
