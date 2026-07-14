import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import ContactsClient from './ContactsClient';

export default async function ContactsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key || org?.crm_mode !== 'b2c') {
    return notFound();
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const { data: contacts, error } = await crm
    .from('contacts')
    .select('id, first_name, last_name, email, phone, lead_score, lead_score_reason, whale_score, whale_tier, lifecycle_stage, client_type, owner_id, created_at, companies(name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('ContactsPage error:', error);
  }

  // Normalize Supabase relational join: companies comes as array, we want single object
  const normalized = (contacts ?? []).map(c => ({
    ...c,
    companies: Array.isArray(c.companies) ? (c.companies[0] ?? null) : c.companies,
  }));

  return (
    <ContactsClient
      contacts={normalized}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
