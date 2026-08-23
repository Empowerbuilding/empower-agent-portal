import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import DealDetailClient from './DealDetailClient';

export default async function DealDetailPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) return notFound();

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const { data: deal, error } = await crm
    .from('deals')
    .select('*, contacts(id, first_name, last_name, phone, email), companies(name)')
    .eq('id', id)
    .single();

  // Stale link (deleted deal): send back to the list instead of 404
  if (error || !deal) redirect(`/${orgSlug}/crm/deals`);

  const [activitiesRes, usersRes, tasksRes, contactsRes] = await Promise.all([
    crm.from('activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }).limit(30),
    crm.from('users').select('id, name'),
    crm.from('tasks').select('*').eq('deal_id', id).order('completed', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }),
    crm.from('contacts').select('id, first_name, last_name').order('last_name', { ascending: true }).limit(500),
  ]);

  const normalizedDeal = {
    ...deal,
    contact: Array.isArray(deal.contacts) ? (deal.contacts[0] ?? null) : deal.contacts,
    company_name: Array.isArray(deal.companies) ? deal.companies[0]?.name : deal.companies?.name,
  };

  return (
    <DealDetailClient
      deal={normalizedDeal}
      activities={activitiesRes.data ?? []}
      tasks={tasksRes.data ?? []}
      users={usersRes.data ?? []}
      contacts={contactsRes.data ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
