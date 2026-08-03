import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Service-role client — bypasses RLS, safe for server-side only
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/accept-invite
 * Called after a user successfully signs up via an invite link.
 * Uses service role to assign channel memberships and delete the invite row,
 * bypassing RLS restrictions that block the client-side anon user from doing this.
 *
 * Body: { token: string, authId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { token, authId } = await req.json();
    if (!token || !authId) {
      return NextResponse.json({ error: 'Missing token or authId' }, { status: 400 });
    }

    // Fetch the invite (service role — no RLS restrictions)
    const { data: invite, error: inviteError } = await adminSupabase
      .from('portal_invites')
      .select('id, org_id, email, channel_ids')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      // Invite already deleted or invalid — not fatal, user is already set up
      return NextResponse.json({ success: true, note: 'invite not found, may already be cleaned up' });
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
