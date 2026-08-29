import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type OrgAuthResult =
  | { ok: true; userId: string; portalUserId: string; role: string }
  | { ok: false; response: NextResponse };

export type UserAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** Require any logged-in Supabase auth user (no org scoping). */
export async function requireUser(): Promise<UserAuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, userId: user.id };
}

/**
 * Require a logged-in portal user who is a member of the org identified by slug.
 * Returns the resolved orgId + the caller's portal_users id/role.
 */
export async function requireOrgMemberBySlug(slug: string | null | undefined):
  Promise<OrgAuthResult & { orgId?: string }> {
  if (!slug) {
    return { ok: false, response: NextResponse.json({ error: 'Missing org' }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (!org) {
    return { ok: false, response: NextResponse.json({ error: 'Org not found' }, { status: 404 }) };
  }
  const { data: portalUser } = await supabase
    .from('portal_users').select('id, role').eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
  if (!portalUser) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, portalUserId: portalUser.id, role: portalUser.role, orgId: org.id };
}

/**
 * Require the caller to be a member of the org that owns the given channel.
 * Uses the service-role client to resolve the channel's org, then checks the
 * caller's portal_users membership. Returns the resolved org/agent ids.
 */
export async function requireChannelMember(channelId: string | null | undefined):
  Promise<{ ok: true; userId: string; orgId: string; agentId: string | null }
         | { ok: false; response: NextResponse }> {
  if (!channelId) {
    return { ok: false, response: NextResponse.json({ error: 'Missing channelId' }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from('portal_channels').select('org_id, agent_id').eq('id', channelId).single();
  if (!channel) {
    return { ok: false, response: NextResponse.json({ error: 'Channel not found' }, { status: 404 }) };
  }
  const { data: portalUser } = await supabase
    .from('portal_users').select('id').eq('supabase_auth_id', user.id).eq('org_id', channel.org_id).single();
  if (!portalUser) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, orgId: channel.org_id, agentId: channel.agent_id };
}

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
