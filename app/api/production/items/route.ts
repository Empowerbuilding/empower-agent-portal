import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Per-project checklist fetch. Replaces the old bulk load (which capped at 5000 rows
// across all projects and silently truncated once the table grew past that).
// Scope: contractors can only fetch their own assigned projects.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get('org');
  const projectId = searchParams.get('projectId');
  if (!orgSlug || !projectId) {
    return NextResponse.json({ error: 'org and projectId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', orgSlug).single();
  if (!org?.design_os_url || !org?.design_os_key) {
    return NextResponse.json({ error: 'org not configured' }, { status: 404 });
  }

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role, design_os_slug')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', org.id)
    .single();
  if (!portalUser) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const isContractor = portalUser.role === 'contractor';
  const isAdmin = ['owner', 'admin'].includes(portalUser.role);
  if (!isContractor && !isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Contractor scoping: the requested project must be theirs.
  const dos = createSupabaseClient(org.design_os_url, org.design_os_key);
  let projectQuery = dos
    .from('projects')
    .select('id, client_name, upworker')
    .eq('id', projectId)
    .limit(1);
  if (isContractor) {
    projectQuery = projectQuery.eq('upworker', portalUser.design_os_slug ?? '__none__');
  }
  const { data: proj } = await projectQuery;
  if (!proj || proj.length === 0) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from('design_intent_items')
    .select('id, design_os_project_id, project_name, item, category, status, done, done_by, done_at, source, details, created_at')
    .eq('design_os_project_id', projectId)
    .neq('status', 'dropped')
    .order('category', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(items ?? []);
}
