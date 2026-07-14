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

  const { data: companies } = await crm
    .from('companies')
    .select('id, name, type, website, city, state, phone, notes, created_at')
    .order('name');

  // Open deal counts per company
  const { data: openDeals } = await crm
    .from('deals')
    .select('company_id, stage')
    .not('company_id', 'is', null)
    .not('stage', 'in', '("complete","lost","closed_won","closed_lost")');

  const dealCounts: Record<string, number> = {};
  for (const d of openDeals ?? []) {
    if (d.company_id) dealCounts[d.company_id] = (dealCounts[d.company_id] ?? 0) + 1;
  }

  // Revenue: sum of won/complete deal values per company
  const { data: wonDeals } = await crm
    .from('deals')
    .select('company_id, value')
    .not('company_id', 'is', null)
    .in('stage', ['complete', 'closed_won']);

  const revenueTotals: Record<string, number> = {};
  for (const d of wonDeals ?? []) {
    if (d.company_id && d.value) {
      revenueTotals[d.company_id] = (revenueTotals[d.company_id] ?? 0) + Number(d.value);
    }
  }

  // Primary contact (first by created_at) per company
  const { data: allContacts } = await crm
    .from('contacts')
    .select('company_id, first_name, last_name')
    .not('company_id', 'is', null)
    .order('created_at', { ascending: true });

  const primaryContacts: Record<string, string> = {};
  for (const c of allContacts ?? []) {
    if (c.company_id && !primaryContacts[c.company_id]) {
      primaryContacts[c.company_id] = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    }
  }

  // Contact counts
  const contactCounts: Record<string, number> = {};
  for (const c of allContacts ?? []) {
    if (c.company_id) contactCounts[c.company_id] = (contactCounts[c.company_id] ?? 0) + 1;
  }

  const enriched = (companies ?? []).map(c => ({
    ...c,
    open_deals: dealCounts[c.id] ?? 0,
    contact_count: contactCounts[c.id] ?? 0,
    primary_contact: primaryContacts[c.id] ?? null,
    total_revenue: revenueTotals[c.id] ?? 0,
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
