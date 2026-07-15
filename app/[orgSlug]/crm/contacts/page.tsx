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

  const { data: contacts, error, count } = await crm
    .from('contacts')
    .select('id, first_name, last_name, email, phone, lead_score, lead_score_reason, whale_score, whale_tier, lifecycle_stage, lead_source, client_type, owner_id, created_at, companies(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 499);

  if (error) {
    console.error('ContactsPage error:', error);
  }

  // Fetch users for owner name lookup
  const { data: users } = await crm.from('users').select('id, name');
  const ownerMap: Record<string, string> = {};
  for (const u of users ?? []) {
    ownerMap[u.id] = u.name;
  }

  // Normalize Supabase relational join: companies comes as array, we want single object
  const normalized = (contacts ?? []).map(c => ({
    ...c,
    companies: Array.isArray(c.companies) ? (c.companies[0] ?? null) : c.companies,
  }));

  return (
    <ContactsClient
      contacts={normalized}
      totalCount={count ?? normalized.length}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
      ownerMap={ownerMap}
      users={users ?? []}
    />
  );
}
