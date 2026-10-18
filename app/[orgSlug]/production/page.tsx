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

interface SummaryRow {
  project_id: string;
  actionable: number | null;
  done_n: number | null;
  meetings: number | null;
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

  // Per-project checklist summary (lightweight view — no bulk item load).
  // Items are fetched per selected project via /api/production/items.
  const projectIds = projectRows.map((p) => p.id);
  const admin = createAdminClient();
  const summary: Record<string, { actionable: number; done_n: number; meetings: number }> = {};
  if (projectIds.length > 0) {
    const { data: sumRows } = await admin
      .from('v_production_summary')
      .select('project_id, actionable, done_n, meetings')
      .in('project_id', projectIds);
    for (const r of (sumRows ?? []) as SummaryRow[]) {
      summary[r.project_id] = {
        actionable: r.actionable ?? 0,
        done_n: r.done_n ?? 0,
        meetings: r.meetings ?? 0,
      };
    }
  }

  return (
    <ProductionClient
      orgSlug={orgSlug}
      role={portalUser.role}
      userName={portalUser.name ?? ''}
      projects={projectRows}
      summary={summary}
    />
  );
}
