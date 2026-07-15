import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import CrossSellClient from './CrossSellClient';
import { createClient as createSupabaseClient2 } from '@supabase/supabase-js';

export default async function CrossSellPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key || org?.crm_mode !== 'b2c') {
    return notFound();
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  // Fetch all cross-sell records (contact_name is denormalized)
  const { data: crossSells } = await crm
    .from('cross_sell_opportunities')
    .select('*')
    .order('contact_name');

  // Fetch customers for rows that don't have a cross-sell record yet
  const { data: customers } = await crm
    .from('contacts')
    .select('id, first_name, last_name, owner_id')
    .eq('lifecycle_stage', 'customer')
    .eq('client_type', 'consumer')
    .order('last_name');

  // Fetch all referral builders (for both the cross-sell picker AND the builders directory)
  const { data: builders } = await crm
    .from('referral_builders')
    .select('*')
    .order('company_name');

  // Merge: all customers get a row
  const csMap = new Map((crossSells ?? []).map(cs => [cs.contact_id, cs]));
  const rows = (customers ?? []).map(c => {
    const cs = csMap.get(c.id);
    return {
      contact_id: c.id,
      contact_name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
      owner_id: c.owner_id ?? null,
      cross_sell_id: cs?.id ?? null,
      engineering_status: cs?.engineering_status ?? 'pending',
      engineering_notes: cs?.engineering_notes ?? '',
      builder_referral_status: cs?.builder_referral_status ?? 'pending',
      builder_id: cs?.builder_id ?? null,
      builder_ids: cs?.builder_ids ?? [],
      builder_referral_name: cs?.builder_referral_name ?? '',
      sub_referral_status: cs?.sub_referral_status ?? 'pending',
      sub_referral_notes: cs?.sub_referral_notes ?? '',
      assigned_to: cs?.assigned_to ?? null,
      notes: cs?.notes ?? '',
      next_action_date: cs?.next_action_date ?? null,
    };
  });

  return (
    <CrossSellClient
      rows={rows}
      builders={builders ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );

}
