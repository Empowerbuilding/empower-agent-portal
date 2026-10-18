import { NextResponse, NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Toggle drafter done-state on a design checklist item, or (admins) set
 * verification status. Contractors may only touch items on projects
 * assigned to them (upworker == their design_os_slug).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgSlug: string | undefined = body.orgSlug;
    const itemId: string | undefined = body.itemId;
    const done: boolean | undefined = body.done;
    const status: string | undefined = body.status;

    if (!orgSlug || !itemId || (done === undefined && !status)) {
      return NextResponse.json({ error: 'orgSlug, itemId and (done | status) required' }, { status: 400 });
    }
    if (status && !['open', 'verified', 'dropped'].includes(status)) {
      return NextResponse.json({ error: 'status must be open|verified|dropped' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id, role, name, design_os_slug')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', org.id)
      .single();
    if (!portalUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const isAdmin = ['owner', 'admin'].includes(portalUser.role);
    const isContractor = portalUser.role === 'contractor';
    if (!isAdmin && !isContractor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (status && !isAdmin) return NextResponse.json({ error: 'Only admins can set verification status' }, { status: 403 });

    // Load the item (Portal DB, service role).
    const admin = createAdminClient();
    const { data: item } = await admin
      .from('design_intent_items')
      .select('id, design_os_project_id, done')
      .eq('id', itemId)
      .single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    // Contractor scope check: the item's project must be assigned to them.
    if (isContractor) {
      if (!item.design_os_project_id) {
        return NextResponse.json({ error: 'Item is not linked to a project' }, { status: 403 });
      }
      const { data: orgRow } = await supabase.from('organizations').select('design_os_url, design_os_key').eq('id', org.id).single();
      if (!orgRow?.design_os_url || !orgRow?.design_os_key) {
        return NextResponse.json({ error: 'Design OS not configured' }, { status: 500 });
      }
      const dos = createSupabaseClient(orgRow.design_os_url, orgRow.design_os_key);
      const { data: proj } = await dos.from('projects').select('id, upworker').eq('id', item.design_os_project_id).single();
      if (!proj || proj.upworker !== portalUser.design_os_slug) {
        return NextResponse.json({ error: 'This project is not assigned to you' }, { status: 403 });
      }
    }

    // Build the update.
    const patch: Record<string, unknown> = {};
    if (done !== undefined) {
      patch.done = done;
      patch.done_by = done ? portalUser.name : null;
      patch.done_at = done ? new Date().toISOString() : null;
    }
    if (status !== undefined) {
      patch.status = status;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin
      .from('design_intent_items')
      .update(patch)
      .eq('id', itemId)
      .select('id, done, done_by, done_at, status')
      .single();
    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
