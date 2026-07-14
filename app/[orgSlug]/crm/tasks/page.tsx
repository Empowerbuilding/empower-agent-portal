import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import TasksClient from './TasksClient';

export default async function TasksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.crm_supabase_url || !org?.crm_supabase_key) redirect(`/${orgSlug}/crm`);

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const [{ data: tasks }, { data: contacts }, { data: users }] = await Promise.all([
    crm.from('tasks')
      .select('*, contacts(first_name, last_name, email, phone), deals(title), companies(name)')
      .order('due_date', { ascending: true, nullsFirst: false }),
    crm.from('contacts').select('id, first_name, last_name').order('first_name'),
    crm.from('users').select('id, name, email').order('name'),
  ]);

  // Find the CRM user ID that matches the logged-in portal user
  const currentCrmUser = (users ?? []).find((u: any) => u.email === user.email);

  return (
    <TasksClient
      tasks={tasks ?? []}
      contacts={contacts ?? []}
      users={users ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
      currentCrmUserId={currentCrmUser?.id ?? null}
    />
  );
}
