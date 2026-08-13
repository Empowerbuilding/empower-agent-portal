import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Service-role client — bypasses RLS, safe for server-side only
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/accept-invite?token=...
 * Public invite lookup for the accept-invite page. Uses service role because
 * the anon client can read portal_invites but NOT the joined organizations row
 * (org_isolation RLS) — which crashed the page with a null org. Only exposes
 * org name/slug/logo, nothing sensitive.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const { data: invite, error } = await adminSupabase
      .from('portal_invites')
      .select('id, org_id, email, role, expires_at, accepted_at, token, channel_ids, organizations(name, slug, logo_url)')
      .eq('token', token)
      .single();

    if (error || !invite) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ invite });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/accept-invite
 * Called after a user successfully signs up via an invite link.
 * Uses service role to create the portal_users profile, assign channel
 * memberships, and delete the invite row. This MUST all happen server-side:
 * a freshly signed-up user has no org membership yet, so the user_isolation
 * RLS policy blocks any client-side insert into portal_users (chicken-and-egg).
 *
 * Body: { token: string, authId: string, name?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { token, authId, name } = await req.json();
    if (!token || !authId) {
      return NextResponse.json({ error: 'Missing token or authId' }, { status: 400 });
    }

    // Fetch the invite (service role — no RLS restrictions)
    const { data: invite, error: inviteError } = await adminSupabase
      .from('portal_invites')
      .select('id, org_id, email, role, channel_ids')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      // Invite already deleted or invalid — not fatal, user is already set up
      return NextResponse.json({ success: true, note: 'invite not found, may already be cleaned up' });
    }

    // Create the portal_users profile (idempotent — unique on supabase_auth_id + org_id)
    const { error: profileError } = await adminSupabase
      .from('portal_users')
      .upsert({
        org_id: invite.org_id,
        supabase_auth_id: authId,
        name: (name || '').trim() || invite.email.split('@')[0],
        email: invite.email,
        role: invite.role || 'member',
        active: true,
        accepted_at: new Date().toISOString(),
      }, { onConflict: 'supabase_auth_id,org_id', ignoreDuplicates: true });

    if (profileError) {
      console.error('Profile insert error:', profileError);
      return NextResponse.json({ error: 'Failed to create profile: ' + profileError.message }, { status: 500 });
    }

    // Look up the portal_users row for this user
    const { data: portalUser } = await adminSupabase
      .from('portal_users')
      .select('id')
      .eq('supabase_auth_id', authId)
      .eq('org_id', invite.org_id)
      .single();

    // Assign channel memberships if invite had channel_ids
    const channelIds: string[] = invite.channel_ids ?? [];
    if (portalUser && channelIds.length > 0) {
      const memberRows = channelIds.map((channelId: string) => ({
        channel_id: channelId,
        user_id: portalUser.id,
      }));

      const { error: memberError } = await adminSupabase
        .from('portal_channel_members')
        .upsert(memberRows, { onConflict: 'channel_id,user_id', ignoreDuplicates: true });

      if (memberError) {
        console.error('Channel member insert error:', memberError);
        // Don't fail — partial success is fine, user is still signed up
      }
    }

    // Delete the invite — clears it from Settings and prevents re-use
    await adminSupabase
      .from('portal_invites')
      .delete()
      .eq('id', invite.id);

    return NextResponse.json({ success: true, channelsAssigned: channelIds.length });
  } catch (err: any) {
    console.error('accept-invite cleanup error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
