import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type OrgAuthResult =
  | { ok: true; userId: string; portalUserId: string; role: string }
  | { ok: false; response: NextResponse };

/**
 * Require a logged-in portal user who is a member of the given org.
 * Returns the caller's portal_users id + role (server-derived — never trust
 * role/userId from the request).
 *
 * Usage:
 *   const auth = await requireOrgMember(orgId);
 *   if (!auth.ok) return auth.response;
 */
export async function requireOrgMember(orgId: string | null | undefined): Promise<OrgAuthResult> {
  if (!orgId) {
    return { ok: false, response: NextResponse.json({ error: 'Missing orgId' }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', orgId)
    .single();
  if (!portalUser) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, portalUserId: portalUser.id, role: portalUser.role };
}
