import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

// Only Mitchell and Michael can access this
const ALLOWED_NAMES = ['Mitchell', 'Michael'];

const RENDER_TOOL_URL = 'https://weqooskgyaeryoekbhzi.supabase.co';
// S17a: key comes from env only — no literal fallback (rotated 2026-09-01)
const RENDER_TOOL_SERVICE_KEY = process.env.RENDER_TOOL_SERVICE_KEY || '';

export async function GET(req: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('name, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', orgId)
    .single();

  if (!portalUser || !ALLOWED_NAMES.includes(portalUser.name)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const renderClient = createClient(RENDER_TOOL_URL, RENDER_TOOL_SERVICE_KEY);
  const { data: renders, error } = await renderClient
    .from('renders')
    .select('id, created_at, render_type, enhanced_image_url, original_image_url, prompt, profile_id, is_favorited')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve profile_id → friendly display name.
  // profile_id is a mix of render-tool nicknames (maca, ben, banks…) and portal_users UUIDs.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidIds = [...new Set((renders ?? []).map(r => r.profile_id).filter((p): p is string => !!p && UUID_RE.test(p)))];
  const nameById: Record<string, string> = {};
  if (uuidIds.length > 0) {
    const admin = createAdminClient();
    const { data: users } = await admin
      .from('portal_users')
      .select('id, name')
      .in('id', uuidIds);
    for (const u of users ?? []) nameById[u.id] = u.name;
  }
  const NICKNAMES: Record<string, string> = {
    maca: 'Michael', mitch: 'Mitchell',
  };
  const resolveName = (pid: string | null): string => {
    if (!pid) return 'Unknown';
    if (nameById[pid]) return nameById[pid];
    if (UUID_RE.test(pid)) return 'Unknown';
    const lower = pid.toLowerCase();
    if (NICKNAMES[lower]) return NICKNAMES[lower];
    return pid.charAt(0).toUpperCase() + pid.slice(1);
  };

  const enriched = (renders ?? []).map(r => ({ ...r, profile_name: resolveName(r.profile_id) }));
  return NextResponse.json({ renders: enriched });
}
