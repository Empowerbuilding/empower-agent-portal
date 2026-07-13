import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import CompanyDetailClient from './CompanyDetailClient';

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) redirect(`/${orgSlug}/crm`);

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const [{ data: company }, { data: contacts }, { data: deals }, { data: activities }, { data: notes }] = await Promise.all([
    crm.from('companies').select('*').eq('id', id).single(),
    crm.from('contacts').select('id, first_name, last_name, email, phone, title, lifecycle_stage').eq('company_id', id).order('first_name'),
    crm.from('deals').select('*').eq('company_id', id).order('created_at', { ascending: false }),
    crm.from('activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
    crm.from('notes').select('*').eq('company_id', id).order('created_at', { ascending: false }),
  ]);

  if (!company) redirect(`/${orgSlug}/crm`);

  return (
    <CompanyDetailClient
      company={company}
      contacts={contacts ?? []}
      deals={deals ?? []}
      activities={activities ?? []}
      notes={notes ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
