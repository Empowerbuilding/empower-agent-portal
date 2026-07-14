import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import CompaniesClient from '../CompaniesClient';

export default async function CompaniesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) {
    return (
      <div style={{ padding: 32, color: 'var(--muted)', fontSize: 14 }}>
        CRM not configured for this organization.
      </div>
    );
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const { data: companies, error } = await crm
    .from('companies')
    .select('id, name, type, website, city, state, phone, notes, created_at')
    .order('name');

  // Open deal counts per company
  const { data: deals } = await crm
    .from('deals')
    .select('company_id, stage')
    .not('company_id', 'is', null)
    .not('stage', 'in', '("complete","lost","closed_won","closed_lost")');

  const dealCounts: Record<string, number> = {};
  for (const d of deals ?? []) {
    if (d.company_id) dealCounts[d.company_id] = (dealCounts[d.company_id] ?? 0) + 1;
  }

  // Contact counts per company
  const { data: contacts } = await crm
    .from('contacts')
    .select('id, company_id')
    .not('company_id', 'is', null);

  const contactCounts: Record<string, number> = {};
  for (const c of contacts ?? []) {
    if (c.company_id) contactCounts[c.company_id] = (contactCounts[c.company_id] ?? 0) + 1;
  }

  const enriched = (companies ?? []).map(c => ({
    ...c,
    open_deals: dealCounts[c.id] ?? 0,
    contact_count: contactCounts[c.id] ?? 0,
  }));

  return (
    <CompaniesClient
      companies={enriched}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
