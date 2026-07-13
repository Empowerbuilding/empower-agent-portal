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

  const [{ data: tasks }, { data: contacts }] = await Promise.all([
    crm.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    crm.from('contacts').select('id, first_name, last_name').order('first_name'),
  ]);

  return (
    <TasksClient
      tasks={tasks ?? []}
      contacts={contacts ?? []}
      orgSlug={orgSlug}
      crmUrl={org.crm_supabase_url}
      crmKey={org.crm_supabase_key}
    />
  );
}
