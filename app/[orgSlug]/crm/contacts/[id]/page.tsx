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

  const normalizedContact = {
    ...contact,
    companies: Array.isArray(contact.companies) ? (contact.companies[0] ?? null) : contact.companies,
  };

  // Parallel fetches
  const [
    activitiesRes,
    tasksRes,
    dealsRaw,
    usersRes,
    meetingsRes,
    allActivitiesRes,
  ] = await Promise.all([
    crm.from('activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(30),
    crm.from('tasks').select('*').eq('contact_id', id).eq('completed', false).order('due_date', { ascending: true }),
    crm.from('deals').select('*').eq('contact_id', id).not('stage', 'in', '("complete","lost")').order('created_at', { ascending: false }).limit(1),
    crm.from('users').select('id, name, role'),
    crm.from('scheduled_meetings').select('*').eq('contact_id', id).order('scheduled_at', { ascending: false }).limit(10),
    // For attribution — get all activities sorted ascending (first touch)
    crm.from('activities').select('activity_type, title, created_at').eq('contact_id', id).order('created_at', { ascending: true }).limit(100),
  ]);

  const deal = (dealsRaw.data ?? [])[0] ?? null;

  // Build owner map
  const ownerMap: Record<string, string> = {};
  for (const u of usersRes.data ?? []) ownerMap[u.id] = u.name;

  return (
    <ContactDetailClient
      contact={normalizedContact}
      activities={activitiesRes.data ?? []}
      allActivities={allActivitiesRes.data ?? []}
      tasks={tasksRes.data ?? []}
      deal={deal}
      meetings={(meetingsRes as any).data ?? []}
      users={usersRes.data ?? []}
      ownerMap={ownerMap}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
