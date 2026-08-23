export const dynamic = 'force-dynamic';

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
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) {
    return notFound();
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  // Fetch contact with company
  const { data: contact, error: contactError } = await crm
    .from('contacts')
    .select('*, companies(name, type, phone)')
    .eq('id', id)
    .single();

  // Stale link (deleted/imported-over contact): send back to the list instead of 404
  if (contactError || !contact) redirect(`/${orgSlug}/crm/contacts`);

  const normalizedContact = {
    ...contact,
    companies: Array.isArray(contact.companies) ? (contact.companies[0] ?? null) : contact.companies,
  };

  // Parallel fetches
  const [
    activitiesRes,
    tasksRes,
    completedTasksRes,
    dealsRaw,
    usersRes,
    meetingsRes,
    allActivitiesRes,
    notesRes,
    allDealsRes,
  ] = await Promise.all([
    crm.from('activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(50),
    crm.from('tasks').select('*').eq('contact_id', id).eq('completed', false).order('due_date', { ascending: true }),
    crm.from('tasks').select('*').eq('contact_id', id).eq('completed', true).order('completed_at', { ascending: false }).limit(20),
    crm.from('deals').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    crm.from('users').select('id, name, role'),
    crm.from('scheduled_meetings').select('*').eq('contact_id', id).order('scheduled_at', { ascending: false }).limit(10),
    // For attribution — get all activities sorted ascending (first touch)
    crm.from('activities').select('activity_type, title, created_at').eq('contact_id', id).order('created_at', { ascending: true }).limit(100),
    // Notes from the separate notes table (original CRM)
    crm.from('notes').select('id, content, created_by, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(30),
    // All deals for this contact (for task linking in add-task form)
    crm.from('deals').select('id, title').eq('contact_id', id).order('created_at', { ascending: false }),
  ]);

  const allDeals = dealsRaw.data ?? [];
  // Primary active deal = first non-complete/non-lost (drives stage-move buttons)
  const deal = allDeals.find((d: any) => d.stage !== 'complete' && d.stage !== 'lost') ?? null;

  // Build owner map
  const ownerMap: Record<string, string> = {};
  for (const u of usersRes.data ?? []) ownerMap[u.id] = u.name;

  return (
    <ContactDetailClient
      contact={normalizedContact}
      activities={activitiesRes.data ?? []}
      crmNotes={(notesRes as any).data ?? []}
      allActivities={allActivitiesRes.data ?? []}
      tasks={tasksRes.data ?? []}
      completedTasks={completedTasksRes.data ?? []}
      deal={deal}
      deals={allDealsRes.data ?? []}
      allDeals={allDeals}
      meetings={(meetingsRes as any).data ?? []}
      users={usersRes.data ?? []}
      ownerMap={ownerMap}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
