import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import ProductionClient from './ProductionClient';

export const dynamic = 'force-dynamic';

interface DosProject {
  id: string;
  client_name: string;
  current_phase: string | null;
  current_hand: string | null;
  upworker: string | null;
  updated_at: string | null;
}

interface ChecklistItem {
  id: string;
  design_os_project_id: string | null;
  project_name: string | null;
  item: string;
  category: string | null;
  status: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  source: string | null;
  details: Record<string, unknown> | null;
}

export default async function ProductionPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.design_os_url || !org?.design_os_key) redirect(`/${orgSlug}`);

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role, name, design_os_slug')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', org.id)
    .single();
  if (!portalUser) redirect(`/${orgSlug}`);

  const isContractor = portalUser.role === 'contractor';
  const isAdmin = ['owner', 'admin'].includes(portalUser.role);
  if (!isContractor && !isAdmin) redirect(`/${orgSlug}`);

  const dos = createSupabaseClient(org.design_os_url, org.design_os_key);

  // Contractors see only their own projects; admins see the full drafting board.
  // Archived projects are excluded for everyone.
  let projectsQuery = dos
    .from('projects')
    .select('id, client_name, current_phase, current_hand, upworker, updated_at')
    .neq('current_phase', 'archived')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (isContractor) {
    projectsQuery = projectsQuery.eq('upworker', portalUser.design_os_slug ?? '__none__');
  }
  const { data: projects } = await projectsQuery;
  const projectRows = (projects ?? []) as DosProject[];

  // Pull checklist items for those projects (Portal DB, service-role read).
  const projectIds = projectRows.map((p) => p.id);
  const admin = createAdminClient();
  let items: ChecklistItem[] = [];
  if (projectIds.length > 0) {
    const { data: itemRows } = await admin
      .from('design_intent_items')
      .select('id, design_os_project_id, project_name, item, category, status, done, done_by, done_at, source, details')
      .in('design_os_project_id', projectIds)
      .order('category', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5000);
    items = (itemRows ?? []) as ChecklistItem[];
  }

  return (
    <ProductionClient
      orgSlug={orgSlug}
      role={portalUser.role}
      userName={portalUser.name ?? ''}
      projects={projectRows}
      items={items}
    />
  );
}
