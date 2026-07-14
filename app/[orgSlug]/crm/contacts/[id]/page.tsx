import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import ContactDetailClient from './ContactDetailClient';

export default async function ContactDetailPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key || org?.crm_mode !== 'b2c') {
    return notFound();
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  // Fetch contact with company
  const { data: contact, error: contactError } = await crm
    .from('contacts')
    .select('*, companies(name, type, phone)')
    .eq('id', id)
    .single();

  if (contactError || !contact) return notFound();

  // Normalize Supabase relational join: companies comes as array, we want single object
  const normalizedContact = {
    ...contact,
    companies: Array.isArray(contact.companies) ? (contact.companies[0] ?? null) : contact.companies,
  };

  // Fetch activities (last 15)
  const { data: activities } = await crm
    .from('activities')
    .select('*')
    .eq('contact_id', id)
    .order('created_at', { ascending: false })
    .limit(15);

  // Fetch open tasks
  const { data: tasks } = await crm
    .from('tasks')
    .select('*')
    .eq('contact_id', id)
    .eq('completed', false)
    .order('due_date', { ascending: true });

  // Fetch active deal
  const { data: dealsRaw } = await crm
    .from('deals')
    .select('*')
    .eq('contact_id', id)
    .not('stage', 'in', '("complete","lost")')
    .order('created_at', { ascending: false })
    .limit(1);

  const deal = dealsRaw?.[0] ?? null;

  return (
    <ContactDetailClient
      contact={normalizedContact}
      activities={activities ?? []}
      tasks={tasks ?? []}
      deal={deal}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
